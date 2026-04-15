/**
 * ShareDrop — WebRTC Manager
 * 
 * Phase 5: Controls the RTCPeerConnection, STUN negotiations, and opens the DataChannel.
 */

'use strict';

class WebRTCManager {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.rtc = null;
        this.dataChannel = null;
        this.isSender = false;

        // Callbacks hooks for app.js
        this.onConnectionStatus = null;
        this.onDataChannelOpen = null;
        this.onDataChannelClose = null;
        this.onMessage = null; // String payloads (JSON)
        this.onBinaryMessage = null; // ArrayBuffer payloads (File chunks)

        // Bind incoming signaling messages
        this.signaling.onOffer = this.handleOffer.bind(this);
        this.signaling.onAnswer = this.handleAnswer.bind(this);
        this.signaling.onIceCandidate = this.handleIceCandidate.bind(this);
    }

    initialize(isSender) {
        this.isSender = isSender;
        
        // Standard WebRTC config using free Google STUN
        const configuration = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };

        this.rtc = new RTCPeerConnection(configuration);

        // Send local ICE candidates to the remote peer
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
            // Senders create the data channel and initiate the SDP Offer
            this.dataChannel = this.rtc.createDataChannel('fileTransfer', { ordered: true });
            this.dataChannel.binaryType = 'arraybuffer';
            this.setupDataChannelEvents();
            
            this.rtc.createOffer()
                .then(offer => this.rtc.setLocalDescription(offer))
                .then(() => this.signaling.sendOffer(this.rtc.localDescription))
                .catch(err => console.error("Error creating WebRTC offer:", err));
        } else {
            // Receivers wait for the sender to establish the data channel
            this.rtc.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.dataChannel.binaryType = 'arraybuffer';
                this.setupDataChannelEvents();
            };
        }
    }

    setupDataChannelEvents() {
        this.dataChannel.onopen = () => {
            if (this.onDataChannelOpen) this.onDataChannelOpen();
        };

        this.dataChannel.onclose = () => {
             if (this.onDataChannelClose) this.onDataChannelClose();
        };

        this.dataChannel.onmessage = (event) => {
            if (typeof event.data === 'string') {
                if (this.onMessage) this.onMessage(event.data);
            } else {
                if (this.onBinaryMessage) this.onBinaryMessage(event.data);
            }
        };
    }

    handleOffer(offer) {
        // Receivers parse the incoming offer
        if (!this.rtc) this.initialize(false);
        this.rtc.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => this.rtc.createAnswer())
            .then(answer => this.rtc.setLocalDescription(answer))
            .then(() => this.signaling.sendAnswer(this.rtc.localDescription))
            .catch(err => console.error("Error handling WebRTC offer:", err));
    }

    handleAnswer(answer) {
        // Senders parse the incoming answer
        if (this.rtc) {
            this.rtc.setRemoteDescription(new RTCSessionDescription(answer))
                .catch(err => console.error("Error handling WebRTC answer:", err));
        }
    }

    handleIceCandidate(candidate) {
        // Both peers add incoming remote candidates
        if (this.rtc) {
            this.rtc.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(err => console.error("Error adding ICE candidate:", err));
        }
    }

    sendMetadata(metadataObj) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(metadataObj));
        }
    }

    close() {
        if (this.dataChannel) this.dataChannel.close();
        if (this.rtc) this.rtc.close();
        this.dataChannel = null;
        this.rtc = null;
    }
}

// Map the global instance
window.webrtc = new WebRTCManager(window.signaling);
