/**
 * ShareDrop — App Controller (UI Navigation & Interactions)
 * 
 * Phase 3: Handles view switching, file selection UI, room code input,
 * drag & drop, and toast notifications.
 * 
 * Phase 4-5 will add: signaling.js, webrtc.js, fileHandler.js
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
const fileInfo = $('#file-info');
const fileName = $('#file-name');
const fileSize = $('#file-size');
const fileType = $('#file-type');
const fileTypeIcon = $('#file-type-icon');
const btnRemoveFile = $('#btn-remove-file');
const btnCreateRoom = $('#btn-create-room');
const roomCodeSection = $('#room-code-section');
const roomCodeValue = $('#room-code-value');
const btnCopyCode = $('#btn-copy-code');
const sendSteps = $('#send-steps');
const btnSendAnother = $('#btn-send-another');

// Receive View
const btnBackReceive = $('#btn-back-receive');
const roomCodeInputs = $$('#room-code-inputs input');
const btnJoinRoom = $('#btn-join-room');
const btnReceiveAnother = $('#btn-receive-another');
const btnDownloadFile = $('#btn-download-file');

// Toast
const toastEl = $('#toast');
const toastMessage = $('#toast-message');

/* ══════════════════════════════════════════════════════════════
 *  State
 * ══════════════════════════════════════════════════════════════ */

const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB
let selectedFile = null;
let toastTimeout = null;

/* ══════════════════════════════════════════════════════════════
 *  View Navigation
 * ══════════════════════════════════════════════════════════════ */

function showView(viewId) {
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $(`#${viewId}`);
    if (target) {
        target.classList.add('active');
    }
}

// Navigation bindings
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

// Keyboard support for action cards
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
 *  File Selection & Drag-and-Drop
 * ══════════════════════════════════════════════════════════════ */

// Click to browse
dropZone.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Drag and drop
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
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

function handleFileSelect(file) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        showToast(`File too large! Max size is 1 GB. Your file: ${formatBytes(file.size)}`, 'error');
        return;
    }

    if (file.size === 0) {
        showToast('Cannot share an empty file.', 'error');
        return;
    }

    selectedFile = file;

    // Update UI
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    fileType.textContent = file.type || 'Unknown type';
    fileTypeIcon.textContent = getFileIcon(file.type, file.name);

    // Show file info, hide drop zone
    fileInfo.classList.add('visible');
    dropZone.style.display = 'none';
    btnCreateRoom.disabled = false;
}

// Remove file
btnRemoveFile.addEventListener('click', () => {
    clearFileSelection();
});

function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.remove('visible');
    dropZone.style.display = '';
    btnCreateRoom.disabled = true;
}

/* ══════════════════════════════════════════════════════════════
 *  Room Code Input (Receive View)
 * ══════════════════════════════════════════════════════════════ */

roomCodeInputs.forEach((input, index) => {
    // Auto-advance on input
    input.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.length === 1 && index < roomCodeInputs.length - 1) {
            roomCodeInputs[index + 1].focus();
        }
        updateJoinButton();
    });

    // Handle backspace to go back
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            roomCodeInputs[index - 1].focus();
            roomCodeInputs[index - 1].value = '';
            updateJoinButton();
        }
        // Handle Enter to submit
        if (e.key === 'Enter') {
            const code = getRoomCodeFromInputs();
            if (code.length === 5) {
                btnJoinRoom.click();
            }
        }
    });

    // Handle paste (spread across inputs)
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

        // Focus the input after the last pasted char
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
 *  Copy Room Code
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
 *  Step Indicator
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
 *  Toast Notifications
 * ══════════════════════════════════════════════════════════════ */

function showToast(message, type = 'info', duration = 4000) {
    // Clear existing timeout
    if (toastTimeout) clearTimeout(toastTimeout);

    // Remove old type classes
    toastEl.classList.remove('toast-error', 'toast-success', 'toast-info', 'visible');

    // Set content and type
    toastMessage.textContent = message;
    toastEl.classList.add(`toast-${type}`);

    // Trigger reflow for animation restart
    void toastEl.offsetWidth;
    toastEl.classList.add('visible');

    // Auto-hide
    toastTimeout = setTimeout(() => {
        toastEl.classList.remove('visible');
    }, duration);
}

/* ══════════════════════════════════════════════════════════════
 *  Reset Helpers
 * ══════════════════════════════════════════════════════════════ */

function resetSendView() {
    clearFileSelection();
    roomCodeSection.classList.remove('visible');
    btnCreateRoom.style.display = '';
    btnCreateRoom.disabled = true;
    dropZone.style.display = '';
    updateSendStep(1);

    // Hide transfer & complete sections
    const sendTransfer = $('#send-transfer');
    const sendComplete = $('#send-complete');
    const sendStatus = $('#send-connection-status');
    if (sendTransfer) sendTransfer.classList.remove('visible');
    if (sendComplete) sendComplete.classList.remove('visible');
    if (sendStatus) sendStatus.classList.remove('visible', 'waiting', 'connected', 'error');
}

function resetReceiveView() {
    roomCodeInputs.forEach(input => input.value = '');
    btnJoinRoom.disabled = true;

    // Hide transfer & complete sections
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
 *  Signaling & Network Actions (Phase 4)
 * ══════════════════════════════════════════════════════════════ */

// "Create Share Link" button (Sender)
btnCreateRoom.addEventListener('click', async () => {
    if (!selectedFile) return;

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

// Setup Signaling Callbacks
window.signaling.onRoomCreated = (roomCode) => {
    roomCodeValue.textContent = roomCode.toUpperCase();
    roomCodeSection.classList.add('visible');
    btnCreateRoom.style.display = 'none';
    dropZone.style.display = 'none';
    updateSendStep(2);

    const status = $('#send-connection-status');
    status.className = 'connection-status visible waiting';
    status.style.color = ''; // reset default
    status.querySelector('.status-text').textContent = 'Waiting for receiver to connect...';
    btnCreateRoom.textContent = 'Create Share Link';
};

window.signaling.onRoomJoined = (roomCode) => {
    const status = $('#receive-connection-status');
    status.className = 'connection-status visible connected';
    status.style.color = 'var(--accent-green)';
    status.querySelector('.status-text').textContent = `Joined room! Waiting for WebRTC connection...`;
    
    roomCodeInputs.forEach(input => input.disabled = true);
    btnJoinRoom.style.display = 'none';
};

window.signaling.onPeerJoined = () => {
    const status = $('#send-connection-status');
    status.className = 'connection-status visible connected';
    status.style.color = 'var(--accent-green)';
    status.querySelector('.status-text').textContent = 'Receiver connected! Establishing direct connection...';
    
    window.webrtc.initialize(true); // Sender creates the WebRTC Offer
};

window.signaling.onPeerDisconnected = () => {
    showToast('Peer disconnected.', 'error');
    const statusSend = $('#send-connection-status');
    const statusRecv = $('#receive-connection-status');
    
    if (statusSend) statusSend.className = 'connection-status visible error';
    if (statusRecv) statusRecv.className = 'connection-status visible error';
};

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

/* ══════════════════════════════════════════════════════════════
 *  Initialize
 * ══════════════════════════════════════════════════════════════ */

console.log('%c⚡ ShareDrop v1.0', 'color: #00d4ff; font-size: 16px; font-weight: bold;');
console.log('%cPeer-to-peer file sharing. No servers. No storage.', 'color: #8888a0;');

/* ══════════════════════════════════════════════════════════════
 *  WebRTC & File Transfer Actions (Phase 5)
 * ══════════════════════════════════════════════════════════════ */
let fileSender = null;
let fileReceiver = null;
let incomingMetadata = null;
let startTime = 0;

window.webrtc.onConnectionStatus = (state) => {
    console.log("WebRTC PeerConnection state:", state);
};

window.webrtc.onDataChannelOpen = () => {
    if (window.webrtc.isSender) {
        // Send metadata
        const metadata = {
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            fileType: selectedFile.type
        };
        window.webrtc.sendMetadata({ type: 'metadata', ...metadata });
        
        // Setup UI
        $('#send-connection-status').classList.remove('visible');
        $('#send-transfer').classList.add('visible');
        updateSendStep(3);
        startTime = Date.now();

        // Start sending file
        fileSender = new window.fileHandler.FileSender(
            selectedFile, 
            window.webrtc.dataChannel,
            updateSenderProgress,
            () => {
                window.webrtc.sendMetadata({ type: 'EOF' });
                $('#send-transfer').classList.remove('visible');
                $('#send-complete').classList.add('visible');
                
                // Keep history clean explicitly
                window.webrtc.close();
            }
        );
        fileSender.start();
    } else {
        // Receiver UI update
        const status = $('#receive-connection-status');
        status.className = 'connection-status visible connected';
        status.style.color = 'var(--accent-green)';
        status.querySelector('.status-text').textContent = 'Peers connected! Waiting for file...';
    }
};

window.webrtc.onMessage = (msgString) => {
    try {
        const msg = JSON.parse(msgString);
        if (msg.type === 'metadata') {
            incomingMetadata = msg;
            
            // UI
            $('#receive-connection-status').classList.remove('visible');
            $('#incoming-file-info').classList.add('visible');
            $('#incoming-file-name').textContent = msg.fileName;
            $('#incoming-file-size').textContent = formatBytes(msg.fileSize);
            $('#incoming-file-type').textContent = msg.fileType || 'Unknown';
            $('#receive-transfer').classList.add('visible');
            
            startTime = Date.now();
            
            // Prepare receiver
            fileReceiver = new window.fileHandler.FileReceiver(
                msg,
                updateReceiverProgress,
                (blob) => {
                    const url = URL.createObjectURL(blob);
                    btnDownloadFile.onclick = () => {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = incomingMetadata.fileName;
                        a.click();
                        
                        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                    };
                    
                    $('#receive-transfer').classList.remove('visible');
                    $('#receive-complete').classList.add('visible');
                    
                    window.webrtc.close();
                }
            );
        } else if (msg.type === 'EOF') {
            // End of file signal
        }
    } catch (e) {
        console.error("Failed to parse datachannel message", e);
    }
};

window.webrtc.onBinaryMessage = (arrayBuffer) => {
    if (fileReceiver) {
        fileReceiver.pushChunk(arrayBuffer);
    }
};

window.webrtc.onDataChannelClose = () => {
    console.log("Data connection closed");
};

function updateSenderProgress(sentBytes, totalBytes) {
    const percent = Math.round((sentBytes / totalBytes) * 100);
    $('#send-progress-percent').textContent = `${percent}%`;
    $('#send-progress-fill').style.width = `${percent}%`;
    $('#send-transferred').textContent = `${formatBytes(sentBytes)} / ${formatBytes(totalBytes)}`;
    
    // Speed tracking
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > 0) {
        const speed = sentBytes / elapsed;
        $('#send-speed').textContent = `${formatBytes(speed)}/s`;
        
        const remaining = totalBytes - sentBytes;
        const etaSeconds = Math.round(remaining / speed);
        $('#send-eta').textContent = formatEta(etaSeconds);
    }
}

function updateReceiverProgress(receivedBytes, totalBytes) {
    const percent = Math.round((receivedBytes / totalBytes) * 100);
    $('#receive-progress-percent').textContent = `${percent}%`;
    $('#receive-progress-fill').style.width = `${percent}%`;
    $('#receive-received').textContent = `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}`;
    
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > 0) {
        const speed = receivedBytes / elapsed;
        $('#receive-speed').textContent = `${formatBytes(speed)}/s`;
        
        const remaining = totalBytes - receivedBytes;
        const etaSeconds = Math.round(remaining / speed);
        $('#receive-eta').textContent = formatEta(etaSeconds);
    }
}

function formatEta(seconds) {
    if (seconds === Infinity || isNaN(seconds)) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
}
