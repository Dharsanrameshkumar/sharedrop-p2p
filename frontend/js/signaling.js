/**
 * Signaling Client
 * 
 * Manages the WebSocket connection to the backend signaling server.
 * Handles room creation, joining, and relaying WebRTC handshake messages.
 */

class SignalingClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.currentRoomCode = null;

        // Callbacks — set by app.js and webrtc.js
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
     * Connect to the WebSocket server.
     * Returns a Promise that resolves when connected.
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
                    console.log('Connected to signaling server');
                    resolve();
                };

                this.ws.onerror = (err) => {
                    console.error('WebSocket Error:', err);
                    reject(new Error('Failed to connect to server.'));
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from signaling server');
                    this.ws = null;
                };

                this.ws.onmessage = this._handleMessage.bind(this);
            } catch (err) {
                reject(err);
            }
        });
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

    disconnect() {
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

// Create a single instance that connects to our local backend
window.signaling = new SignalingClient('ws://localhost:8080/signal');
