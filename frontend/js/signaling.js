/**
 * ShareDrop — Signaling Client
 * 
 * Phase 4: Manages the WebSocket connection to the backend signaling server.
 * Relays messages for room creation, joining, and WebRTC handshakes (SDP/ICE).
 */

class SignalingClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.currentRoomCode = null;

        // Event callbacks to be set by app.js / webrtc.js
        this.onRoomCreated = null;
        this.onRoomJoined = null;
        this.onPeerJoined = null;
        this.onPeerDisconnected = null;
        this.onOffer = null;
        this.onAnswer = null;
        this.onIceCandidate = null;
        this.onError = null;
    }

    /**
     * Connects to the WebSocket server.
     * @returns {Promise<void>} Resolves when connected, rejects on error
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            try {
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    console.log('✅ Connected to Signaling Server');
                    resolve();
                };

                this.ws.onerror = (err) => {
                    console.error('❌ WebSocket Error:', err);
                    reject(new Error('Failed to connect to server.'));
                };

                this.ws.onclose = () => {
                    console.log('🔌 Disconnected from Signaling Server');
                    this.ws = null;
                };

                this.ws.onmessage = this._handleMessage.bind(this);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Internal handler for incoming WebSocket messages
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
                    console.error('Signaling Error:', msg.payload);
                    if (this.onError) this.onError(msg.payload);
                    break;
                
                // WebRTC Handshake messages
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
                    console.warn('Unknown message type received:', msg.type);
            }
        } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
        }
    }

    /* ─── Outgoing Actions ────────────────────────────────────────────────── */

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

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.currentRoomCode = null;
    }

    /**
     * Internal helper to send JSON strings safely
     */
    _send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('Cannot send message: WebSocket is not open.');
            if (this.onError) this.onError("Lost connection to server.");
            return;
        }
        this.ws.send(JSON.stringify(data));
    }
}

// Environment Detection for WebSocket URL
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'localhost:8080' 
    : 'your-backend-live-url.onrender.com'; // REPLACE THIS with your actual Render/Koyeb URL

// Export a singleton instance globally
window.signaling = new SignalingClient(`${wsProtocol}//${wsHost}/signal`);
