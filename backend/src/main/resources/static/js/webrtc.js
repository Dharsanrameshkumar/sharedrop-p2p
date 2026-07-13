/**
 * WebRTC Manager
 * 
 * Handles the peer-to-peer connection between two browsers.
 * Uses Google's free STUN server to help browsers find each other's IP addresses.
 * Creates a DataChannel for sending file data directly between browsers.
 */

'use strict';

class WebRTCManager {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.rtc = null;
        this.dataChannel = null;
        this.isSender = false;

        // Callback hooks — set by app.js
        this.onConnectionStatus = null;
        this.onDataChannelOpen = null;
        this.onDataChannelClose = null;
        this.onMessage = null;       // For text messages (JSON metadata)
        this.onBinaryMessage = null; // For binary data (file chunks)

        // Listen for WebRTC signaling messages from the server
        this.signaling.onOffer = this.handleOffer.bind(this);
        this.signaling.onAnswer = this.handleAnswer.bind(this);
        this.signaling.onIceCandidate = this.handleIceCandidate.bind(this);
    }

    /**
     * Set up the WebRTC connection.
     * The sender creates the connection and sends an "offer" to the receiver.
     */
    initialize(isSender) {
        this.isSender = isSender;
        
        // ── LAN-ONLY MODE ──────────────────────────────────────
        // Empty iceServers = devices must be on the same Wi-Fi / LAN.
        // No internet connection is needed for this to work.
        //
        // To also support transfers ACROSS networks (over the internet),
        // uncomment the STUN servers below:
        // iceServers: [
        //     { urls: 'stun:stun.l.google.com:19302' },
        //     { urls: 'stun:stun1.l.google.com:19302' }
        // ]
        const configuration = {
            iceServers: []
        };

        this.rtc = new RTCPeerConnection(configuration);

        // When we discover our network info (ICE candidate), send it to the other peer
        this.rtc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.sendIceCandidate(event.candidate);
            }
        };

        this.rtc.onconnectionstatechange = () => {
            if (this.onConnectionStatus) {
                this.onConnectionStatus(this.rtc.connectionState);
            }
        };

        if (this.isSender) {
            // Sender creates the data channel and sends an offer
            this.dataChannel = this.rtc.createDataChannel('fileTransfer', { ordered: true });
            this.dataChannel.binaryType = 'arraybuffer';
            this.setupDataChannelEvents();
            
            this.rtc.createOffer()
                .then(offer => this.rtc.setLocalDescription(offer))
                .then(() => this.signaling.sendOffer(this.rtc.localDescription))
                .catch(err => console.error("Error creating offer:", err));
        } else {
            // Receiver waits for the sender to create the data channel
            this.rtc.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.dataChannel.binaryType = 'arraybuffer';
                this.setupDataChannelEvents();
            };
        }
    }

    /**
     * Set up event listeners on the data channel.
     */
    setupDataChannelEvents() {
        this.dataChannel.onopen = () => {
            if (this.onDataChannelOpen) this.onDataChannelOpen();
        };

        this.dataChannel.onclose = () => {
             if (this.onDataChannelClose) this.onDataChannelClose();
        };

        this.dataChannel.onmessage = (event) => {
            if (typeof event.data === 'string') {
                // Text message = JSON metadata about the file
                if (this.onMessage) this.onMessage(event.data);
            } else {
                // Binary message = actual file chunk data
                if (this.onBinaryMessage) this.onBinaryMessage(event.data);
            }
        };
    }

    /**
     * Receiver gets the sender's offer and sends back an answer.
     */
    handleOffer(offer) {
        if (!this.rtc) this.initialize(false);
        this.rtc.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => this.rtc.createAnswer())
            .then(answer => this.rtc.setLocalDescription(answer))
            .then(() => this.signaling.sendAnswer(this.rtc.localDescription))
            .catch(err => console.error("Error handling offer:", err));
    }

    /**
     * Sender gets the receiver's answer.
     */
    handleAnswer(answer) {
        if (this.rtc) {
            this.rtc.setRemoteDescription(new RTCSessionDescription(answer))
                .catch(err => console.error("Error handling answer:", err));
        }
    }

    /**
     * Both peers exchange ICE candidates to establish the best connection path.
     */
    handleIceCandidate(candidate) {
        if (this.rtc) {
            this.rtc.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(err => console.error("Error adding ICE candidate:", err));
        }
    }

    /**
     * Send a JSON metadata message (like file name and size) through the data channel.
     */
    sendMetadata(metadataObj) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(metadataObj));
        }
    }

    /**
     * Clean up and close the connection.
     */
    close() {
        if (this.dataChannel) this.dataChannel.close();
        if (this.rtc) this.rtc.close();
        this.dataChannel = null;
        this.rtc = null;
    }
}

// Create a global instance
window.webrtc = new WebRTCManager(window.signaling);
