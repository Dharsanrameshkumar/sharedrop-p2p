/**
 * Signaling Client
 * 
 * Manages the WebSocket connection to the backend signaling server.
 * Handles room creation, joining, and relaying WebRTC handshake messages.
 * 
 * Includes automatic reconnection with exponential backoff if the
 * connection drops unexpectedly.
 */

class SignalingClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.currentRoomCode = null;

        // Reconnection state
        this._intentionalClose = false;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 10;
        this._reconnectTimer = null;
        this._baseDelay = 1000;   // 1 second
        this._maxDelay = 30000;   // 30 seconds

        // Callbacks — set by app.js and webrtc.js
        this.onRoomCreated = null;
        this.onRoomJoined = null;
        this.onPeerJoined = null;
        this.onPeerDisconnected = null;
        this.onOffer = null;
        this.onAnswer = null;
        this.onIceCandidate = null;
        this.onError = null;
        this.onReconnecting = null;  // (attempt, maxAttempts) => {}
        this.onReconnected = null;   // () => {}
    }

    /**
     * Connect to the WebSocket server.
     * Returns a Promise that resolves when connected.
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            this._intentionalClose = false;

            try {
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    console.log('Connected to signaling server');
                    
                    const wasReconnect = this._reconnectAttempts > 0;
                    this._reconnectAttempts = 0;

                    if (wasReconnect) {
                        // Re-join the room if we were in one
                        if (this.currentRoomCode && this.onReconnected) {
                            this.onReconnected();
                        }
                    }

                    resolve();
                };

                this.ws.onerror = (err) => {
                    console.error('WebSocket Error:', err);
                    // Only reject the initial connect promise, not reconnects
                    if (this._reconnectAttempts === 0) {
                        reject(new Error('Failed to connect to server.'));
                    }
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from signaling server');
                    this.ws = null;

                    // Attempt reconnection if this wasn't intentional
                    if (!this._intentionalClose) {
                        this._scheduleReconnect();
                    }
                };

                this.ws.onmessage = this._handleMessage.bind(this);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Schedule a reconnection attempt with exponential backoff.
     * Delay: 1s → 2s → 4s → 8s → ... → max 30s
     */
    _scheduleReconnect() {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            console.error('Max reconnection attempts reached. Giving up.');
            if (this.onError) this.onError('Lost connection to server. Please refresh the page.');
            return;
        }

        this._reconnectAttempts++;
        const delay = Math.min(
            this._baseDelay * Math.pow(2, this._reconnectAttempts - 1),
            this._maxDelay
        );

        console.log(`Reconnecting in ${delay / 1000}s (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`);
        
        if (this.onReconnecting) {
            this.onReconnecting(this._reconnectAttempts, this._maxReconnectAttempts);
        }

        this._reconnectTimer = setTimeout(() => {
            this.connect().catch(() => {
                // connect() rejection is handled; backoff continues via onclose
            });
        }, delay);
    }

    /**
     * Handle incoming messages from the server
     */
    _handleMessage(event) {
        try {
            const msg = JSON.parse(event.data);
            
            switch (msg.type) {
                case 'room-created':
                    this.currentRoomCode = msg.roomCode;
                    if (this.onRoomCreated) this.onRoomCreated(msg.roomCode);
                    break;
                case 'room-joined':
                    this.currentRoomCode = msg.roomCode;
                    if (this.onRoomJoined) this.onRoomJoined(msg.roomCode);
                    break;
                case 'peer-joined':
                    if (this.onPeerJoined) this.onPeerJoined();
                    break;
                case 'peer-disconnected':
                    if (this.onPeerDisconnected) this.onPeerDisconnected();
                    break;
                case 'error':
                    console.error('Server Error:', msg.payload);
                    if (this.onError) this.onError(msg.payload);
                    break;
                
                // WebRTC handshake messages
                case 'offer':
                    if (this.onOffer) this.onOffer(msg.payload);
                    break;
                case 'answer':
                    if (this.onAnswer) this.onAnswer(msg.payload);
                    break;
                case 'ice-candidate':
                    if (this.onIceCandidate) this.onIceCandidate(msg.payload);
                    break;
                
                default:
                    console.warn('Unknown message type:', msg.type);
            }
        } catch (err) {
            console.error('Failed to parse message:', err);
        }
    }

    /* ─── Outgoing Messages ─────────────────────────────────── */

    createRoom() {
        this._send({ type: 'create-room' });
    }

    joinRoom(roomCode) {
        this._send({ type: 'join-room', roomCode });
    }

    sendOffer(sdp) {
        this._send({ type: 'offer', roomCode: this.currentRoomCode, payload: sdp });
    }

    sendAnswer(sdp) {
        this._send({ type: 'answer', roomCode: this.currentRoomCode, payload: sdp });
    }

    sendIceCandidate(candidate) {
        this._send({ type: 'ice-candidate', roomCode: this.currentRoomCode, payload: candidate });
    }

    /**
     * Intentionally disconnect. Suppresses auto-reconnect.
     */
    disconnect() {
        this._intentionalClose = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._reconnectAttempts = 0;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.currentRoomCode = null;
    }

    /**
     * Helper to safely send JSON messages
     */
    _send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('Cannot send: WebSocket is not connected.');
            if (this.onError) this.onError("Lost connection to server.");
            return;
        }
        this.ws.send(JSON.stringify(data));
    }
}

// Create a single instance.
// If SHAREDROP_CONFIG.signalingServerUrl is set, use that (for split deployments).
// Otherwise, auto-detect from the page URL (same-origin / LAN mode).
const _configUrl = window.SHAREDROP_CONFIG && window.SHAREDROP_CONFIG.signalingServerUrl;
let _signalingUrl;

if (_configUrl) {
    _signalingUrl = _configUrl;
    console.log('Using configured signaling server:', _signalingUrl);
} else {
    const _wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const _wsHost = location.hostname || 'localhost';
    const _wsPort = location.port || '8080';
    _signalingUrl = `${_wsProtocol}//${_wsHost}:${_wsPort}/signal`;
}

window.signaling = new SignalingClient(_signalingUrl);
