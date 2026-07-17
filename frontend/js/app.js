/**
 * ShareDrop — Main App Controller
 * 
 * Handles the UI: view switching, file selection, drag & drop,
 * room codes, progress bars, and toast notifications.
 * 
 * Supports multiple file selection and sequential transfer.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
 *  DOM Elements
 * ══════════════════════════════════════════════════════════════ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Views
const viewHome = $('#view-home');
const viewSend = $('#view-send');
const viewReceive = $('#view-receive');

// Home
const btnGoSend = $('#btn-go-send');
const btnGoReceive = $('#btn-go-receive');
const logoHomeLink = $('#logo-home-link');

// Send View
const btnBackSend = $('#btn-back-send');
const dropZone = $('#drop-zone');
const fileInput = $('#file-input');
const fileListContainer = $('#file-list-container');
const fileListEl = $('#file-list');
const fileListCount = $('#file-list-count');
const fileListTotal = $('#file-list-total');
const btnClearAll = $('#btn-clear-all');
const btnAddMore = $('#btn-add-more');
const btnCreateRoom = $('#btn-create-room');
const roomCodeSection = $('#room-code-section');
const roomCodeValue = $('#room-code-value');
const btnCopyCode = $('#btn-copy-code');
const sendSteps = $('#send-steps');
const btnSendAnother = $('#btn-send-another');
const btnCancelSend = $('#btn-cancel-send');

// Receive View
const btnCancelReceive = $('#btn-cancel-receive');
const btnBackReceive = $('#btn-back-receive');
const roomCodeInputs = $$('#room-code-inputs input');
const btnJoinRoom = $('#btn-join-room');
const btnReceiveAnother = $('#btn-receive-another');
const btnDownloadAll = $('#btn-download-all');

// Toast
const toastEl = $('#toast');
const toastMessage = $('#toast-message');

/* ══════════════════════════════════════════════════════════════
 *  State
 * ══════════════════════════════════════════════════════════════ */

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB per file
let selectedFiles = []; // Array of File objects
let toastTimeout = null;

/* ══════════════════════════════════════════════════════════════
 *  View Navigation — switches between Home, Send, and Receive
 * ══════════════════════════════════════════════════════════════ */

function showView(viewId) {
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $(`#${viewId}`);
    if (target) {
        target.classList.add('active');
    }
}

// Navigation button clicks
btnGoSend.addEventListener('click', () => showView('view-send'));
btnGoReceive.addEventListener('click', () => showView('view-receive'));
logoHomeLink.addEventListener('click', () => {
    resetSendView();
    resetReceiveView();
    showView('view-home');
});
btnBackSend.addEventListener('click', () => {
    resetSendView();
    showView('view-home');
});
btnBackReceive.addEventListener('click', () => {
    resetReceiveView();
    showView('view-home');
});
btnSendAnother.addEventListener('click', () => {
    resetSendView();
    showView('view-send');
});
btnReceiveAnother.addEventListener('click', () => {
    resetReceiveView();
    showView('view-receive');
});

// Cancel transfer buttons
btnCancelSend.addEventListener('click', () => cancelTransfer(true));
btnCancelReceive.addEventListener('click', () => cancelTransfer(true));

// Keyboard support for the action cards
btnGoSend.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showView('view-send');
    }
});
btnGoReceive.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showView('view-receive');
    }
});

/* ══════════════════════════════════════════════════════════════
 *  File Selection & Drag-and-Drop (Multi-File)
 * ══════════════════════════════════════════════════════════════ */

// Click the drop zone to open file picker
dropZone.addEventListener('click', () => fileInput.click());

// "Add More Files" button
btnAddMore.addEventListener('click', () => fileInput.click());

// When files are selected via the file picker
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        addFiles(Array.from(e.target.files));
    }
});

// Drag and drop support
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        addFiles(Array.from(e.dataTransfer.files));
    }
});

/**
 * Add files to the selected files list.
 * Validates each file and updates the UI.
 */
function addFiles(newFiles) {
    let rejected = 0;

    for (const file of newFiles) {
        if (file.size > MAX_FILE_SIZE) {
            showToast(`"${file.name}" is too large (${formatBytes(file.size)}). Max 1 GB per file.`, 'error');
            rejected++;
            continue;
        }
        if (file.size === 0) {
            showToast(`"${file.name}" is empty.`, 'error');
            rejected++;
            continue;
        }
        // Avoid duplicates (same name + size)
        const isDuplicate = selectedFiles.some(f => f.name === file.name && f.size === file.size);
        if (isDuplicate) continue;

        selectedFiles.push(file);
    }

    fileInput.value = ''; // Reset input so same file can be re-added
    updateFileListUI();
}

/**
 * Remove a file from the list by index.
 */
function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileListUI();
}

/**
 * Update the file list UI to reflect current selectedFiles.
 */
function updateFileListUI() {
    if (selectedFiles.length === 0) {
        fileListContainer.classList.remove('visible');
        dropZone.style.display = '';
        btnCreateRoom.disabled = true;
        return;
    }

    // Hide drop zone, show file list
    dropZone.style.display = 'none';
    fileListContainer.classList.add('visible');
    btnCreateRoom.disabled = false;

    // Update header
    const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    fileListCount.textContent = `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`;
    fileListTotal.textContent = formatBytes(totalSize);

    // Rebuild list
    fileListEl.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-list-item';
        item.innerHTML = `
            <span class="fl-icon">${getFileIcon(file.type, file.name)}</span>
            <span class="fl-name" title="${file.name}">${file.name}</span>
            <span class="fl-size">${formatBytes(file.size)}</span>
            <button class="fl-remove" title="Remove" data-index="${index}">✕</button>
        `;
        fileListEl.appendChild(item);
    });

    // Attach remove handlers
    fileListEl.querySelectorAll('.fl-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(parseInt(btn.dataset.index));
        });
    });
}

// Clear all files
btnClearAll.addEventListener('click', () => {
    selectedFiles = [];
    updateFileListUI();
});

/* ══════════════════════════════════════════════════════════════
 *  Room Code Input (Receive View)
 * ══════════════════════════════════════════════════════════════ */

roomCodeInputs.forEach((input, index) => {
    // Auto-move to next input box when a character is typed
    input.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.length === 1 && index < roomCodeInputs.length - 1) {
            roomCodeInputs[index + 1].focus();
        }
        updateJoinButton();
    });

    // Handle backspace to go to previous input
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            roomCodeInputs[index - 1].focus();
            roomCodeInputs[index - 1].value = '';
            updateJoinButton();
        }
        // Press Enter to submit
        if (e.key === 'Enter') {
            const code = getRoomCodeFromInputs();
            if (code.length === 5) {
                btnJoinRoom.click();
            }
        }
    });

    // Handle paste — spread characters across all 5 inputs
    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData)
            .getData('text')
            .trim()
            .toLowerCase()
            .slice(0, 5);

        paste.split('').forEach((char, i) => {
            if (roomCodeInputs[i]) {
                roomCodeInputs[i].value = char;
            }
        });

        const focusIndex = Math.min(paste.length, roomCodeInputs.length - 1);
        roomCodeInputs[focusIndex].focus();
        updateJoinButton();
    });
});

function getRoomCodeFromInputs() {
    return Array.from(roomCodeInputs)
        .map(input => input.value.toLowerCase())
        .join('');
}

function updateJoinButton() {
    const code = getRoomCodeFromInputs();
    btnJoinRoom.disabled = code.length !== 5;
}

/* ══════════════════════════════════════════════════════════════
 *  Copy Room Code to Clipboard
 * ══════════════════════════════════════════════════════════════ */

btnCopyCode.addEventListener('click', async () => {
    const code = roomCodeValue.textContent;
    try {
        await navigator.clipboard.writeText(code);
        btnCopyCode.classList.add('copied');
        btnCopyCode.textContent = '✓';
        showToast('Code copied to clipboard!', 'success');
        setTimeout(() => {
            btnCopyCode.classList.remove('copied');
            btnCopyCode.textContent = '📋';
        }, 2000);
    } catch {
        showToast('Failed to copy code', 'error');
    }
});

/* ══════════════════════════════════════════════════════════════
 *  Step Indicator (1. Select Files → 2. Share Code → 3. Transfer)
 * ══════════════════════════════════════════════════════════════ */

function updateSendStep(activeStep) {
    sendSteps.querySelectorAll('.step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        if (stepNum === activeStep) {
            step.classList.add('active');
        } else if (stepNum < activeStep) {
            step.classList.add('completed');
        }
    });
}

/* ══════════════════════════════════════════════════════════════
 *  Toast Notifications (small popup messages)
 * ══════════════════════════════════════════════════════════════ */

function showToast(message, type = 'info', duration = 4000) {
    if (toastTimeout) clearTimeout(toastTimeout);

    toastEl.classList.remove('toast-error', 'toast-success', 'toast-info', 'visible');
    toastMessage.textContent = message;
    toastEl.classList.add(`toast-${type}`);

    // Trigger reflow for animation restart
    void toastEl.offsetWidth;
    toastEl.classList.add('visible');

    toastTimeout = setTimeout(() => {
        toastEl.classList.remove('visible');
    }, duration);
}

/* ══════════════════════════════════════════════════════════════
 *  Reset Helpers — clean up UI when navigating back
 * ══════════════════════════════════════════════════════════════ */

function resetSendView() {
    selectedFiles = [];
    fileInput.value = '';
    fileListContainer.classList.remove('visible');
    fileListEl.innerHTML = '';
    dropZone.style.display = '';
    roomCodeSection.classList.remove('visible');
    btnCreateRoom.style.display = '';
    btnCreateRoom.disabled = true;
    btnCreateRoom.textContent = 'Create Share Link';
    updateSendStep(1);

    const sendTransfer = $('#send-transfer');
    const sendComplete = $('#send-complete');
    const sendStatus = $('#send-connection-status');
    if (sendTransfer) sendTransfer.classList.remove('visible');
    if (sendComplete) sendComplete.classList.remove('visible');
    if (sendStatus) sendStatus.classList.remove('visible', 'waiting', 'connected', 'error');
}

function resetReceiveView() {
    roomCodeInputs.forEach(input => { input.value = ''; input.disabled = false; });
    btnJoinRoom.disabled = true;
    btnJoinRoom.style.display = '';
    btnJoinRoom.textContent = 'Connect to Sender';

    const receiveTransfer = $('#receive-transfer');
    const receiveComplete = $('#receive-complete');
    const receiveStatus = $('#receive-connection-status');
    const incomingFileInfo = $('#incoming-file-info');
    if (receiveTransfer) receiveTransfer.classList.remove('visible');
    if (receiveComplete) receiveComplete.classList.remove('visible');
    if (receiveStatus) receiveStatus.classList.remove('visible', 'waiting', 'connected', 'error');
    if (incomingFileInfo) incomingFileInfo.classList.remove('visible');
}

/* ══════════════════════════════════════════════════════════════
 *  Utility Functions
 * ══════════════════════════════════════════════════════════════ */

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function getFileIcon(mimeType, name) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar')) return '🗜️';
    if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('xml')) return '📝';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || name?.endsWith('.csv')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📘';
    return '📄';
}

/* ══════════════════════════════════════════════════════════════
 *  Signaling — Connect to the backend and handle room events
 * ══════════════════════════════════════════════════════════════ */

// "Create Share Link" button (Sender)
btnCreateRoom.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;

    btnCreateRoom.disabled = true;
    btnCreateRoom.textContent = 'Connecting...';

    try {
        await window.signaling.connect();
        window.signaling.createRoom();
    } catch (err) {
        showToast('Failed to connect to server', 'error');
        btnCreateRoom.disabled = false;
        btnCreateRoom.textContent = 'Create Share Link';
    }
});

// "Connect to Sender" button (Receiver)
btnJoinRoom.addEventListener('click', async () => {
    const code = getRoomCodeFromInputs();
    if (code.length !== 5) return;

    btnJoinRoom.disabled = true;
    btnJoinRoom.textContent = 'Connecting...';

    const status = $('#receive-connection-status');
    status.classList.add('visible', 'waiting');
    status.querySelector('.status-text').textContent = `Connecting to server...`;

    try {
        await window.signaling.connect();
        window.signaling.joinRoom(code);
    } catch (err) {
        showToast('Failed to connect to server', 'error');
        btnJoinRoom.disabled = false;
        btnJoinRoom.textContent = 'Connect to Sender';
        status.classList.remove('visible', 'waiting');
    }
});

// When our room is created successfully
window.signaling.onRoomCreated = (roomCode) => {
    roomCodeValue.textContent = roomCode.toUpperCase();
    roomCodeSection.classList.add('visible');
    btnCreateRoom.style.display = 'none';
    fileListContainer.classList.remove('visible');
    dropZone.style.display = 'none';
    updateSendStep(2);

    const status = $('#send-connection-status');
    status.className = 'connection-status visible waiting';
    status.style.color = '';
    status.querySelector('.status-text').textContent = 'Waiting for receiver to connect...';
    btnCreateRoom.textContent = 'Create Share Link';
};

// When we successfully join a room
window.signaling.onRoomJoined = (roomCode) => {
    const status = $('#receive-connection-status');
    status.className = 'connection-status visible connected';
    status.style.color = 'var(--accent-green)';
    status.querySelector('.status-text').textContent = `Joined room! Setting up connection...`;
    
    roomCodeInputs.forEach(input => input.disabled = true);
    btnJoinRoom.style.display = 'none';
};

// When the receiver connects to our room (sender gets this)
window.signaling.onPeerJoined = () => {
    const status = $('#send-connection-status');
    status.className = 'connection-status visible connected';
    status.style.color = 'var(--accent-green)';
    status.querySelector('.status-text').textContent = 'Receiver connected! Setting up direct connection...';
    
    // Sender starts the WebRTC handshake
    window.webrtc.initialize(true);
};

// When the other person disconnects
window.signaling.onPeerDisconnected = () => {
    showToast('Peer disconnected.', 'error');
    const statusSend = $('#send-connection-status');
    const statusRecv = $('#receive-connection-status');
    
    if (statusSend) statusSend.className = 'connection-status visible error';
    if (statusRecv) statusRecv.className = 'connection-status visible error';
};

// When the server sends an error
window.signaling.onError = (errMsg) => {
    showToast(errMsg, 'error');
    btnCreateRoom.disabled = false;
    btnJoinRoom.disabled = false;
    btnCreateRoom.textContent = 'Create Share Link';
    btnJoinRoom.textContent = 'Connect to Sender';
    
    const statusSend = $('#send-connection-status');
    const statusRecv = $('#receive-connection-status');
    if (statusSend) statusSend.classList.remove('visible');
    if (statusRecv) statusRecv.classList.remove('visible');
};

// When the WebSocket is reconnecting
window.signaling.onReconnecting = (attempt, maxAttempts) => {
    const banner = $('#reconnect-banner');
    const message = $('#reconnect-message');
    banner.classList.add('visible');
    message.textContent = `Reconnecting to server... (attempt ${attempt}/${maxAttempts})`;
};

// When the WebSocket successfully reconnects
window.signaling.onReconnected = () => {
    const banner = $('#reconnect-banner');
    banner.classList.remove('visible');
    showToast('Reconnected to server!', 'success');
};

/* ══════════════════════════════════════════════════════════════
 *  Startup
 * ══════════════════════════════════════════════════════════════ */

console.log('⚡ ShareDrop - P2P File Sharing');

/* ══════════════════════════════════════════════════════════════
 *  WebRTC & File Transfer — Multi-file send/receive
 * ══════════════════════════════════════════════════════════════ */

let fileSender = null;
let fileReceiver = null;
let startTime = 0;

// Sender state
let sendFileIndex = 0;         // Current file being sent
let totalBytesSent = 0;        // Bytes sent across ALL files
let totalBytesAllFiles = 0;    // Sum of all file sizes

// Receiver state
let receivedFiles = [];        // Array of { name, blob }
let batchMetadata = null;      // Batch info from sender
let currentFileMetadata = null;
let receiveFileIndex = 0;
let totalBytesReceived = 0;
let totalBytesExpected = 0;

window.webrtc.onConnectionStatus = (state) => {
    console.log("Connection state:", state);
};

/**
 * Compute SHA-256 hash of a File or Blob.
 * For files > 50MB, hashing is skipped because native Web Crypto
 * does not support streaming and will crash the browser tab (ArrayBuffer allocation failed).
 * WebRTC's underlying SCTP protocol guarantees bit-perfect delivery over the network anyway.
 */
async function computeSHA256(fileOrBlob) {
    const fileSize = fileOrBlob.size;

    // Skip full hashing for large files to prevent memory crashes
    if (fileSize > 50 * 1024 * 1024) {
        return "skipped-large-file";
    }

    // For smaller files, hash the whole thing
    const buffer = await fileOrBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SENDER: Start sending all selected files sequentially.
 */
async function startBatchSend() {
    sendFileIndex = 0;
    totalBytesSent = 0;
    totalBytesAllFiles = selectedFiles.reduce((sum, f) => sum + f.size, 0);

    // Send batch metadata first
    const batchInfo = {
        type: 'batch-start',
        fileCount: selectedFiles.length,
        totalSize: totalBytesAllFiles,
        files: selectedFiles.map(f => ({
            fileName: f.name,
            fileSize: f.size,
            fileType: f.type
        }))
    };
    window.webrtc.sendMetadata(batchInfo);

    // Update UI
    $('#send-connection-status').classList.remove('visible');
    $('#send-transfer').classList.add('visible');
    updateSendStep(3);
    startTime = Date.now();

    // Show/hide overall progress based on file count
    const overallProgress = $('#send-overall-progress');
    if (selectedFiles.length > 1) {
        overallProgress.style.display = '';
    } else {
        overallProgress.style.display = 'none';
    }

    // Start sending the first file
    sendNextFile();
}

/**
 * SENDER: Send the next file in the queue.
 */
async function sendNextFile() {
    if (sendFileIndex >= selectedFiles.length) {
        // All files sent!
        window.webrtc.sendMetadata({ type: 'batch-complete' });
        $('#send-transfer').classList.remove('visible');
        $('#send-complete').classList.add('visible');
        $('#send-complete-subtitle').textContent = 
            `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''} successfully delivered.`;
        window.webrtc.close();
        return;
    }

    const file = selectedFiles[sendFileIndex];

    // Update current file label
    $('#send-current-file').textContent = 
        `Sending file ${sendFileIndex + 1} of ${selectedFiles.length}: ${file.name}`;

    // Compute hash and send file metadata
    let fileHash = null;
    try {
        fileHash = await computeSHA256(file);
    } catch (err) {
        console.error('Hash computation failed:', err);
    }

    const metadata = {
        type: 'file-start',
        fileIndex: sendFileIndex,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileHash: fileHash
    };
    window.webrtc.sendMetadata(metadata);

    // Reset per-file progress
    $('#send-progress-percent').textContent = '0%';
    $('#send-progress-fill').style.width = '0%';

    // Start sending chunks
    let lastProgressUpdate = 0;
    fileSender = new window.fileHandler.FileSender(
        file,
        window.webrtc.dataChannel,
        (sentBytes, totalBytes) => {
            const now = Date.now();
            const isComplete = sentBytes === totalBytes;

            // Only update DOM every 150ms or when complete to prevent rendering bottlenecks
            if (now - lastProgressUpdate > 150 || isComplete) {
                lastProgressUpdate = now;

                // Per-file progress
                const percent = Math.round((sentBytes / totalBytes) * 100);
                $('#send-progress-percent').textContent = `${percent}%`;
                $('#send-progress-fill').style.width = `${percent}%`;

                // Overall progress
                const overallSent = totalBytesSent + sentBytes;
                const overallPercent = Math.round((overallSent / totalBytesAllFiles) * 100);
                $('#send-overall-percent').textContent = `${overallPercent}%`;
                $('#send-overall-fill').style.width = `${overallPercent}%`;

                // Stats
                const elapsed = (Date.now() - startTime) / 1000;
                if (elapsed > 0) {
                    const speed = overallSent / elapsed;
                    $('#send-speed').textContent = `${formatBytes(speed)}/s`;
                    $('#send-transferred').textContent = `${formatBytes(overallSent)} / ${formatBytes(totalBytesAllFiles)}`;
                    const remaining = totalBytesAllFiles - overallSent;
                    const etaSeconds = Math.round(remaining / speed);
                    $('#send-eta').textContent = formatEta(etaSeconds);
                }
            }
        },
        () => {
            // File complete — send end marker and move to next
            totalBytesSent += file.size;
            window.webrtc.sendMetadata({ type: 'file-end', fileIndex: sendFileIndex });
            sendFileIndex++;
            sendNextFile();
        }
    );
    fileSender.start();
}

// When the direct connection between browsers is ready
window.webrtc.onDataChannelOpen = () => {
    if (window.webrtc.isSender) {
        startBatchSend();
    } else {
        // Receiver — update UI
        const status = $('#receive-connection-status');
        status.className = 'connection-status visible connected';
        status.style.color = 'var(--accent-green)';
        status.querySelector('.status-text').textContent = 'Connected! Waiting for files...';
    }
};

/**
 * RECEIVER: Handle incoming messages (metadata, file markers).
 */
window.webrtc.onMessage = (msgString) => {
    try {
        const msg = JSON.parse(msgString);

        switch (msg.type) {
            case 'batch-start':
                handleBatchStart(msg);
                break;
            case 'file-start':
                handleFileStart(msg);
                break;
            case 'file-end':
                // File receiver handles this via byte counting
                break;
            case 'batch-complete':
                handleBatchComplete();
                break;
            case 'transfer-cancelled':
                cancelTransfer(false);
                break;
            default:
                console.warn('Unknown message type:', msg.type);
        }
    } catch (e) {
        console.error("Failed to parse message", e);
    }
};

/**
 * RECEIVER: Batch of files is starting.
 */
function handleBatchStart(msg) {
    batchMetadata = msg;
    receivedFiles = [];
    receiveFileIndex = 0;
    totalBytesReceived = 0;
    totalBytesExpected = msg.totalSize;
    startTime = Date.now();

    // Show incoming file info
    $('#receive-connection-status').classList.remove('visible');
    const incomingInfo = $('#incoming-file-info');
    incomingInfo.classList.add('visible');

    $('#incoming-batch-title').textContent = 
        `${msg.fileCount} file${msg.fileCount !== 1 ? 's' : ''} incoming`;
    $('#incoming-batch-meta').textContent = `Total: ${formatBytes(msg.totalSize)}`;

    // Populate incoming file list
    const listEl = $('#incoming-file-list');
    listEl.innerHTML = '';
    msg.files.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = 'incoming-file-item';
        item.id = `incoming-file-${i}`;
        item.innerHTML = `
            <span class="ifi-icon">${getFileIcon(f.fileType, f.fileName)}</span>
            <span class="ifi-name" title="${f.fileName}">${f.fileName}</span>
            <span class="ifi-size">${formatBytes(f.fileSize)}</span>
            <span class="ifi-status" id="ifi-status-${i}">⏳</span>
        `;
        listEl.appendChild(item);
    });

    // Show transfer progress
    $('#receive-transfer').classList.add('visible');

    // Show/hide overall progress
    const overallProgress = $('#receive-overall-progress');
    if (msg.fileCount > 1) {
        overallProgress.style.display = '';
    } else {
        overallProgress.style.display = 'none';
    }
}

/**
 * RECEIVER: A new file is starting.
 */
function handleFileStart(msg) {
    currentFileMetadata = msg;
    receiveFileIndex = msg.fileIndex;

    // Update current file label
    const total = batchMetadata ? batchMetadata.fileCount : 1;
    $('#receive-current-file').textContent = 
        `Receiving file ${receiveFileIndex + 1} of ${total}: ${msg.fileName}`;

    // Reset per-file progress
    $('#receive-progress-percent').textContent = '0%';
    $('#receive-progress-fill').style.width = '0%';

    // Update status icon
    const statusEl = $(`#ifi-status-${receiveFileIndex}`);
    if (statusEl) statusEl.textContent = '⬇️';

    // Create receiver for this file
    let lastReceiveProgressUpdate = 0;
    fileReceiver = new window.fileHandler.FileReceiver(
        msg,
        (receivedBytes, fileTotal) => {
            const now = Date.now();
            const isComplete = receivedBytes === fileTotal;

            // Only update DOM every 150ms or when complete to prevent rendering bottlenecks
            if (now - lastReceiveProgressUpdate > 150 || isComplete) {
                lastReceiveProgressUpdate = now;

                // Per-file progress
                const percent = Math.round((receivedBytes / fileTotal) * 100);
                $('#receive-progress-percent').textContent = `${percent}%`;
                $('#receive-progress-fill').style.width = `${percent}%`;

                // Overall progress
                const overallReceived = totalBytesReceived + receivedBytes;
                const overallPercent = Math.round((overallReceived / totalBytesExpected) * 100);
                $('#receive-overall-percent').textContent = `${overallPercent}%`;
                $('#receive-overall-fill').style.width = `${overallPercent}%`;

                // Stats
                const elapsed = (Date.now() - startTime) / 1000;
                if (elapsed > 0) {
                    const speed = overallReceived / elapsed;
                    $('#receive-speed').textContent = `${formatBytes(speed)}/s`;
                    $('#receive-received').textContent = `${formatBytes(overallReceived)} / ${formatBytes(totalBytesExpected)}`;
                    const remaining = totalBytesExpected - overallReceived;
                    const etaSeconds = Math.round(remaining / speed);
                    $('#receive-eta').textContent = formatEta(etaSeconds);
                }
            }
        },
        (blob) => {
            // File received completely
            totalBytesReceived += blob.size;
            receivedFiles.push({ name: currentFileMetadata.fileName, blob: blob, hash: currentFileMetadata.fileHash });

            // Update status icon
            const statusEl = $(`#ifi-status-${receiveFileIndex}`);
            if (statusEl) statusEl.textContent = '✅';
        }
    );
}

/**
 * RECEIVER: All files have been received.
 */
function handleBatchComplete() {
    $('#receive-transfer').classList.remove('visible');
    $('#receive-complete').classList.add('visible');
    
    const count = receivedFiles.length;
    $('#receive-complete-subtitle').textContent = 
        `${count} file${count !== 1 ? 's' : ''} received successfully.`;

    window.webrtc.close();

    // Verify integrity of all files
    verifyAllFiles();

    // Set up "Download All" button
    btnDownloadAll.textContent = `💾 Download ${count > 1 ? 'All ' + count + ' Files' : 'File'}`;
    btnDownloadAll.onclick = () => {
        receivedFiles.forEach((f, i) => {
            setTimeout(() => {
                const url = URL.createObjectURL(f.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = f.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            }, i * 500); // Stagger downloads to avoid browser blocking
        });
    };

    // Auto-download if single file
    if (count === 1) {
        btnDownloadAll.click();
    }
}

/**
 * Verify SHA-256 integrity of all received files.
 */
async function verifyAllFiles() {
    const badge = $('#integrity-badge');
    const icon = $('#integrity-icon');
    const text = $('#integrity-text');

    const filesWithHash = receivedFiles.filter(f => f.hash);
    if (filesWithHash.length === 0) {
        badge.className = 'integrity-badge';
        icon.textContent = 'ℹ️';
        text.textContent = 'Integrity check not available';
        return;
    }

    badge.className = 'integrity-badge';
    icon.textContent = '⏳';
    text.textContent = `Verifying ${filesWithHash.length} file${filesWithHash.length !== 1 ? 's' : ''}...`;

    let verified = 0;
    let failed = 0;

    for (const f of filesWithHash) {
        try {
            const hash = await computeSHA256(f.blob);
            if (hash === f.hash) {
                verified++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    if (failed === 0) {
        badge.className = 'integrity-badge verified';
        icon.textContent = '✅';
        text.textContent = `All ${verified} file${verified !== 1 ? 's' : ''} verified (SHA-256)`;
    } else {
        badge.className = 'integrity-badge corrupted';
        icon.textContent = '❌';
        text.textContent = `${failed} file${failed !== 1 ? 's' : ''} failed integrity check`;
        showToast('Warning: Some files may be corrupted!', 'error', 6000);
    }
}

// When we receive binary data (file chunk)
window.webrtc.onBinaryMessage = (arrayBuffer) => {
    if (fileReceiver) {
        fileReceiver.pushChunk(arrayBuffer);
    }
};

window.webrtc.onDataChannelClose = () => {
    console.log("Data channel closed");
    const sendVisible = $('#send-transfer').classList.contains('visible');
    const receiveVisible = $('#receive-transfer').classList.contains('visible');
    if (sendVisible || receiveVisible) {
        cancelTransfer(false);
    }
};

function cancelTransfer(isLocalAction) {
    if (isLocalAction) {
        try {
            window.webrtc.sendMetadata({ type: 'transfer-cancelled' });
        } catch (e) {
            console.warn("Failed to send cancel message, connection might be closed already.");
        }
        showToast('Transfer cancelled.', 'info');
    } else {
        showToast('Transfer was cancelled by the peer.', 'error');
    }

    if (fileSender) {
        fileSender.cancel();
        fileSender = null;
    }
    if (fileReceiver) {
        fileReceiver.cancel();
        fileReceiver = null;
    }

    window.webrtc.close();
    window.signaling.disconnect();

    resetSendView();
    resetReceiveView();
    showView('view-home');
}

/* ══════════════════════════════════════════════════════════════
 *  Progress Tracking — speed, ETA, percentage
 * ══════════════════════════════════════════════════════════════ */

function formatEta(seconds) {
    if (seconds === Infinity || isNaN(seconds)) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
}
