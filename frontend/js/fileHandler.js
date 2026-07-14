/**
 * File Handler — Chunking & Reassembly
 * 
 * Problem: If you try to load a 500MB file into memory all at once,
 * the browser will crash. 
 *
 * Solution: Read the file in small 64KB pieces (chunks) and send 
 * each piece through the WebRTC data channel one at a time.
 * On the receiving side, collect all pieces and stitch them back
 * together using the Blob API.
 */

'use strict';

const CHUNK_SIZE = 64 * 1024; // 64KB per chunk

/**
 * FileSender — reads a file in 64KB chunks and sends each chunk
 * through the WebRTC data channel.
 */
class FileSender {
    constructor(file, dataChannel, onProgress, onComplete) {
        this.file = file;
        this.dataChannel = dataChannel;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.offset = 0;
        this.fileReader = new FileReader();

        // When a chunk is done being read from disk, send it
        this.fileReader.onload = (e) => {
            try {
                this.dataChannel.send(e.target.result);
                this.offset += e.target.result.byteLength;
                
                if (this.onProgress) {
                    this.onProgress(this.offset, this.file.size);
                }

                if (this.offset < this.file.size) {
                    this.readSlice(); // Read the next chunk
                } else {
                    if (this.onComplete) this.onComplete();
                }
            } catch (err) {
                console.error("Error sending chunk:", err);
                // If the buffer overflowed, wait a bit and retry
                if (err.name === 'OperationError') {
                    setTimeout(() => {
                        this.offset -= e.target.result.byteLength;
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
        // Flow Control: if the network buffer is getting full, wait before
        // reading more data. This prevents the browser from running out of memory.
        if (this.dataChannel.bufferedAmount > 16 * 1024 * 1024) {
            setTimeout(() => this.readSlice(), 50);
            return;
        }

        const slice = this.file.slice(this.offset, this.offset + CHUNK_SIZE);
        this.fileReader.readAsArrayBuffer(slice);
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
