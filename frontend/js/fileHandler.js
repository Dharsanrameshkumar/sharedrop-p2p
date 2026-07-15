/**
 * File Handler — Chunking & Reassembly
 * 
 * Problem: If you try to load a 500MB file into memory all at once,
 * the browser will crash. 
 *
 * Solution: Read the file in small 256KB pieces (chunks) and send 
 * each piece through the WebRTC data channel one at a time.
 * On the receiving side, collect all pieces and stitch them back
 * together using the Blob API.
 *
 * Speed optimizations for LAN:
 *   - 256KB chunks (4x larger than typical WebRTC examples)
 *   - Event-based flow control using bufferedAmountLowThreshold
 *   - 64MB buffer limit to keep the pipe saturated
 */

'use strict';

const CHUNK_SIZE = 256 * 1024; // 256KB per chunk (optimized for LAN speed)
const BUFFER_HIGH = 64 * 1024 * 1024; // 64MB — pause sending when buffer exceeds this
const BUFFER_LOW  = 16 * 1024 * 1024; // 16MB — resume sending when buffer drops below this

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
        this.fileReader = new FileReader();

        // Set up event-based flow control
        this.dataChannel.bufferedAmountLowThreshold = BUFFER_LOW;
        this._onBufferLow = () => {
            if (this.paused) {
                this.paused = false;
                this.readSlice();
            }
        };
        this.dataChannel.addEventListener('bufferedamountlow', this._onBufferLow);

        // When a chunk is done being read from disk, send it
        this.fileReader.onload = (e) => {
            try {
                this.dataChannel.send(e.target.result);
                this.offset += e.target.result.byteLength;
                
                if (this.onProgress) {
                    this.onProgress(this.offset, this.file.size);
                }

                if (this.offset < this.file.size) {
                    // Check if buffer is getting full
                    if (this.dataChannel.bufferedAmount > BUFFER_HIGH) {
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
                // If the buffer overflowed, wait and retry
                if (err.name === 'OperationError') {
                    this.paused = true;
                    this.offset -= e.target.result.byteLength;
                }
            }
        };

        this.fileReader.onerror = (err) => console.error("Error reading file:", err);
    }

    start() {
        this.offset = 0;
        this.paused = false;
        this.readSlice();
    }

    readSlice() {
        const slice = this.file.slice(this.offset, this.offset + CHUNK_SIZE);
        this.fileReader.readAsArrayBuffer(slice);
    }

    cleanup() {
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
