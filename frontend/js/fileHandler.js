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

/**
 * FileSender — reads a file in chunks and sends each chunk
 * through the WebRTC data channel.
 * 
 * Uses event-based flow control (backpressure) to prevent OperationError.
 */
class FileSender {
    constructor(file, dataChannel, onProgress, onComplete) {
        this.file = file;
        this.dataChannel = dataChannel;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.offset = 0;
        this.paused = false;

        // Set up event-based flow control
        // Default to a safe low threshold (e.g. 64KB) as suggested
        this.dataChannel.bufferedAmountLowThreshold = 65536; 
        
        this._onBufferLow = () => {
            if (this.paused) {
                this.paused = false;
                this._sendNextChunk(); // Resume sending
            }
        };
        this.dataChannel.addEventListener('bufferedamountlow', this._onBufferLow);
    }

    start() {
        this.offset = 0;
        this.paused = false;
        this._sendNextChunk();
    }

    async _sendNextChunk() {
        if (this.offset >= this.file.size) {
            this.cleanup();
            if (this.onComplete) this.onComplete();
            return;
        }

        try {
            // Check if buffer is getting full before sending
            // Wait for bufferedamountlow event to resume
            if (this.dataChannel.bufferedAmount > this.dataChannel.bufferedAmountLowThreshold) {
                this.paused = true;
                return;
            }

            const slice = this.file.slice(this.offset, this.offset + CHUNK_SIZE);
            const buffer = await slice.arrayBuffer(); // Clean async read instead of FileReader
            
            this.dataChannel.send(buffer);
            this.offset += buffer.byteLength;

            if (this.onProgress) {
                this.onProgress(this.offset, this.file.size);
            }

            // Continue sending next chunk if not paused
            if (!this.paused) {
                // Stack won't overflow because of await arrayBuffer(), but we can still use setTimeout for good measure
                setTimeout(() => this._sendNextChunk(), 0);
            }

        } catch (err) {
            if (err.name === 'OperationError') {
                this.paused = true;
                console.warn("Buffer full, waiting for bufferedamountlow event...");
            } else {
                console.error("Send error:", err);
            }
        }
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
