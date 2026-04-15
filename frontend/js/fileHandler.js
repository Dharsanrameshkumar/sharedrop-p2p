/**
 * ShareDrop — File Handler (Chunking & Reassembly)
 * 
 * Phase 5: Provides classes to safely read large files in Memory-efficient chunks
 * and reassemble them natively upon receipt.
 */

'use strict';

const CHUNK_SIZE = 64 * 1024; // 64KB - Optimal default for WebRTC DataChannels

class FileSender {
    constructor(file, dataChannel, onProgress, onComplete) {
        this.file = file;
        this.dataChannel = dataChannel;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.offset = 0;
        this.fileReader = new FileReader();

        // When a chunk is read, send it over the WebRTC channel
        this.fileReader.onload = (e) => {
            try {
                this.dataChannel.send(e.target.result);
                this.offset += e.target.result.byteLength;
                
                if (this.onProgress) {
                    this.onProgress(this.offset, this.file.size);
                }

                if (this.offset < this.file.size) {
                    this.readSlice(); // Recursive slice read
                } else {
                    if (this.onComplete) this.onComplete();
                }
            } catch (err) {
                console.error("DataChannel send error:", err);
                // Pause and retry if the buffer completely overflowed instantly
                if (err.name === 'OperationError') {
                    setTimeout(() => {
                        this.offset -= e.target.result.byteLength; // Rewind
                        this.readSlice();
                    }, 100);
                }
            }
        };

        this.fileReader.onerror = (err) => console.error("Error reading file:", err);
    }

    start() {
        this.offset = 0;
        this.readSlice();
    }

    readSlice() {
        // Advanced Flow Control: Prevent dropping packets by respecting buffer limits
        // 16 MB is a common safe bufferedAmount threshold for standard browsers.
        if (this.dataChannel.bufferedAmount > 16 * 1024 * 1024) {
            // Buffer is filling up, wait 50ms before resuming
            setTimeout(() => this.readSlice(), 50);
            return;
        }

        const slice = this.file.slice(this.offset, this.offset + CHUNK_SIZE);
        this.fileReader.readAsArrayBuffer(slice);
    }
}

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

        // Check if file assembly is complete
        if (this.receivedBytes >= this.metadata.fileSize) {
            this.finish();
        }
    }

    finish() {
        const blob = new Blob(this.chunks, { type: this.metadata.fileType });
        this.chunks = []; // Drop chunks from memory aggressively
        if (this.onComplete) this.onComplete(blob);
    }
}

window.fileHandler = { FileSender, FileReceiver };
