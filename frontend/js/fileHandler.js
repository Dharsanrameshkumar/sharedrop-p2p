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
 * FileReceiver — collects chunks from the sender.
 * If a directoryHandle is provided, streams directly to disk (Zero RAM!).
 * Otherwise, falls back to stitching them in memory using Blob API.
 */
class FileReceiver {
    constructor(metadata, onProgress, onComplete, directoryHandle = null) {
        this.metadata = metadata;
        this.receivedBytes = 0;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.directoryHandle = directoryHandle;
        
        this.chunks = []; // Used either for Blob OR as a temporary queue for Streams
        this.writable = null;
        this.writePromise = Promise.resolve(); // Chains writes to keep order
        this.isStreaming = !!directoryHandle;
        this.streamReady = false;

        if (this.isStreaming) {
            this.initStream();
        }
    }

    async initStream() {
        try {
            const fileHandle = await this.directoryHandle.getFileHandle(this.metadata.fileName, { create: true });
            this.writable = await fileHandle.createWritable();
            this.streamReady = true;
            
            // Flush any chunks that arrived while we were waiting for the user/disk
            if (this.chunks.length > 0) {
                const pending = [...this.chunks];
                this.chunks = [];
                for (const chunk of pending) {
                    this.pushChunk(chunk); // Recursively push now that streamReady is true
                }
            }
        } catch (err) {
            console.error("Failed to create writable stream, falling back to Blob:", err);
            this.isStreaming = false; // Fallback to RAM
        }
    }

    pushChunk(chunk) {
        if (this.isStreaming) {
            if (!this.streamReady) {
                this.chunks.push(chunk);
            } else {
                // Chain writes to ensure order and avoid overlapping writes
                this.writePromise = this.writePromise.then(() => this.writable.write(chunk));
            }
        } else {
            // Blob mode (RAM)
            this.chunks.push(chunk);
        }

        this.receivedBytes += chunk.byteLength;
        
        if (this.onProgress) {
            this.onProgress(this.receivedBytes, this.metadata.fileSize);
        }

        // Once we've received all the bytes, finish up
        if (this.receivedBytes >= this.metadata.fileSize) {
            this.finish();
        }
    }

    async finish() {
        if (this.isStreaming) {
            // Wait for all writes to finish, then close the file stream
            await this.writePromise;
            await this.writable.close();
            if (this.onComplete) this.onComplete(null); // No blob returned, already on disk!
        } else {
            // Blob mode (RAM)
            const blob = new Blob(this.chunks, { type: this.metadata.fileType });
            this.chunks = []; // Free up memory
            if (this.onComplete) this.onComplete(blob);
        }
    }
}

window.fileHandler = { FileSender, FileReceiver };
