/**
 * File Handler — Chunking & Reassembly
 * 
 * Problem: If you try to load a 500MB file into memory all at once,
 * the browser will crash. 
 *
 * Solution: Read the file in small pieces (chunks) and send 
 * each piece through the WebRTC data channel one at a time.
 * On the receiving side, collect all pieces and stitch them back
 * together using the Blob API.
 *
 * Speed optimizations for LAN:
 *   - 256KB chunks (4x larger than typical WebRTC examples)
 *   - Event-based flow control using bufferedAmountLowThreshold
 *   - Proper backpressure handling to prevent OperationError
 */

'use strict';

const CHUNK_SIZE = 256 * 1024; // 256KB per chunk (optimized for LAN speed)
const BUFFER_FULL_THRESHOLD = 16 * 1024 * 1024; // 16MB — pause when buffer exceeds this
const BUFFER_LOW_THRESHOLD  = 1 * 1024 * 1024;  // 1MB — resume when buffer drops to this

/**
 * FileSender — reads a file in 256KB chunks and sends each chunk
 * through the WebRTC data channel.
 * 
 * Uses event-based flow control: when the outgoing buffer gets full,
 * we pause and wait for the 'bufferedamountlow' event instead of
 * polling with setTimeout (much faster).
 */
class FileSender {
    constructor(file, dataChannel, onProgress, onComplete) {
        this.file = file;
        this.dataChannel = dataChannel;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.offset = 0;
        this.paused = false;
        this.started = false;

        // Set up event-based flow control
        this.dataChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
        this._onBufferLow = () => {
            if (this.paused) {
                this.paused = false;
                this.readSlice();
            }
        };
        this.dataChannel.addEventListener('bufferedamountlow', this._onBufferLow);

        // When a chunk is done being read from disk, send it
        this.fileReader = new FileReader();
        this.fileReader.onload = (e) => {
            const chunk = e.target.result;
            
            // Check buffer BEFORE sending to avoid OperationError
            if (this.dataChannel.bufferedAmount > BUFFER_FULL_THRESHOLD) {
                // Buffer is too full — wait for it to drain, then retry this chunk
                this.paused = true;
                // Store the chunk to send when buffer drains
                this._pendingChunk = chunk;
                const origHandler = this._onBufferLow;
                this.dataChannel.removeEventListener('bufferedamountlow', origHandler);
                this._onBufferLow = () => {
                    this.dataChannel.removeEventListener('bufferedamountlow', this._onBufferLow);
                    this._onBufferLow = origHandler;
                    this.dataChannel.addEventListener('bufferedamountlow', this._onBufferLow);
                    this.paused = false;
                    // Now send the pending chunk
                    this._sendChunk(this._pendingChunk);
                    this._pendingChunk = null;
                };
                this.dataChannel.addEventListener('bufferedamountlow', this._onBufferLow);
                return;
            }

            this._sendChunk(chunk);
        };

        this.fileReader.onerror = (err) => console.error("Error reading file:", err);
    }

    _sendChunk(chunk) {
        try {
            this.dataChannel.send(chunk);
            this.offset += chunk.byteLength;

            if (this.onProgress) {
                this.onProgress(this.offset, this.file.size);
            }

            if (this.offset < this.file.size) {
                // Check if buffer is getting full after sending
                if (this.dataChannel.bufferedAmount > BUFFER_FULL_THRESHOLD) {
                    this.paused = true; // Wait for 'bufferedamountlow' event
                } else {
                    this.readSlice(); // Continue immediately
                }
            } else {
                this.cleanup();
                if (this.onComplete) this.onComplete();
            }
        } catch (err) {
            console.error("Error sending chunk:", err);
            // If send failed, pause and retry when buffer drains
            this.paused = true;
        }
    }

    start() {
        this.offset = 0;
        this.paused = false;
        this.started = true;
        this.readSlice();
    }

    readSlice() {
        if (!this.started) return;
        const slice = this.file.slice(this.offset, this.offset + CHUNK_SIZE);
        this.fileReader.readAsArrayBuffer(slice);
    }

    cleanup() {
        this.started = false;
        this.dataChannel.removeEventListener('bufferedamountlow', this._onBufferLow);
    }
}

/**
 * FileReceiver — collects chunks from the sender and stitches them
 * back together into a downloadable file using the Blob API.
 */
class FileReceiver {
    constructor(metadata, onProgress, onComplete) {
        this.metadata = metadata;
        this.chunks = [];
        this.receivedBytes = 0;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
    }

    pushChunk(chunk) {
        this.chunks.push(chunk);
        this.receivedBytes += chunk.byteLength;
        
        if (this.onProgress) {
            this.onProgress(this.receivedBytes, this.metadata.fileSize);
        }

        // Once we've received all the bytes, assemble the file
        if (this.receivedBytes >= this.metadata.fileSize) {
            this.finish();
        }
    }

    finish() {
        // Combine all chunks into a single Blob (this is the complete file)
        const blob = new Blob(this.chunks, { type: this.metadata.fileType });
        this.chunks = []; // Free up memory
        if (this.onComplete) this.onComplete(blob);
    }
}

window.fileHandler = { FileSender, FileReceiver };
