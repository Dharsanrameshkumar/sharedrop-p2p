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

const CHUNK_SIZE = 64 * 1024; // 64KB per chunk (optimal for WebRTC SCTP)
const BUFFER_THRESHOLD = 1024 * 1024; // 1MB buffer threshold to keep pipeline saturated
const READ_BLOCK_SIZE = 2 * 1024 * 1024; // Read 2MB blocks from file to minimize async I/O
const WRITE_BUFFER_SIZE = 1024 * 1024; // Buffer 1MB before writing to disk

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
        this.cancelled = false;

        // Set low threshold to 1MB to keep pipeline full
        this.dataChannel.bufferedAmountLowThreshold = BUFFER_THRESHOLD; 
        
        this._onBufferLow = () => {
            if (this.paused && !this.cancelled) {
                this.paused = false;
                this._sendLoop(); // Resume sending
            }
        };
        this.dataChannel.addEventListener('bufferedamountlow', this._onBufferLow);
    }

    start() {
        this.offset = 0;
        this.paused = false;
        this.cancelled = false;
        this._sendLoop();
    }

    async _sendLoop() {
        try {
            while (this.offset < this.file.size && !this.cancelled) {
                // Read a larger block from the file to reduce async I/O overhead
                const slice = this.file.slice(this.offset, this.offset + READ_BLOCK_SIZE);
                const blockBuffer = await slice.arrayBuffer();
                
                if (this.cancelled) return;

                let blockOffset = 0;
                // Send the block in 64KB chunks synchronously to maximize WebRTC throughput
                while (blockOffset < blockBuffer.byteLength && !this.cancelled) {
                    if (this.dataChannel.bufferedAmount > this.dataChannel.bufferedAmountLowThreshold) {
                        this.paused = true;
                        return; // Pause and wait for bufferedamountlow
                    }

                    const chunkLength = Math.min(CHUNK_SIZE, blockBuffer.byteLength - blockOffset);
                    const chunk = new Uint8Array(blockBuffer, blockOffset, chunkLength);
                    this.dataChannel.send(chunk);
                    
                    blockOffset += chunkLength;
                    this.offset += chunkLength;

                    if (this.onProgress) {
                        this.onProgress(this.offset, this.file.size);
                    }
                }
            }

            // Finished loop and all data sent
            if (this.offset >= this.file.size && !this.cancelled) {
                this.cleanup();
                if (this.onComplete) this.onComplete();
            }

        } catch (err) {
            console.error("Send loop error:", err);
        }
    }

    cancel() {
        this.cancelled = true;
        this.paused = true;
        this.cleanup();
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
        this.chunks.push(chunk);
        this.receivedBytes += chunk.byteLength;
        
        if (this.onProgress) {
            this.onProgress(this.receivedBytes, this.metadata.fileSize);
        }

        // If streaming to disk, buffer writes in 1MB chunks to prevent I/O bottlenecks
        if (this.isStreaming && this.streamReady) {
            const bufferedSize = this.chunks.reduce((sum, c) => sum + c.byteLength, 0);
            if (bufferedSize >= WRITE_BUFFER_SIZE) {
                const blobToWrite = new Blob(this.chunks);
                this.chunks = [];
                this.writePromise = this.writePromise.then(() => this.writable.write(blobToWrite));
            }
        }

        // Once we've received all the bytes, finish up
        if (this.receivedBytes >= this.metadata.fileSize) {
            this.finish();
        }
    }

    async finish() {
        if (this.isStreaming) {
            // Write any remaining buffered chunks
            if (this.chunks.length > 0) {
                const blobToWrite = new Blob(this.chunks);
                this.chunks = [];
                this.writePromise = this.writePromise.then(() => this.writable.write(blobToWrite));
            }
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

    async cancel() {
        this.chunks = []; // Free up memory
        if (this.isStreaming && this.writable) {
            try {
                await this.writePromise;
                await this.writable.abort();
            } catch (err) {
                console.error("Error aborting writable stream:", err);
            }
        }
    }
}

window.fileHandler = { FileSender, FileReceiver };
