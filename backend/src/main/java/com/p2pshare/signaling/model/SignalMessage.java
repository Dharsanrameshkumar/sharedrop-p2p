package com.p2pshare.signaling.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Simple POJO for messages sent over the WebSocket.
 *
 * Messages FROM the client:
 *   "create-room"    — Sender wants to create a new room
 *   "join-room"      — Receiver wants to join with a room code
 *   "offer"          — WebRTC SDP offer
 *   "answer"         — WebRTC SDP answer
 *   "ice-candidate"  — WebRTC ICE candidate
 *
 * Messages FROM the server:
 *   "room-created"       — Room was created, here's the code
 *   "room-joined"        — Successfully joined a room
 *   "peer-joined"        — The other person connected
 *   "peer-disconnected"  — The other person left
 *   "error"              — Something went wrong
 *
 * Jackson converts this to/from JSON automatically.
 * Null fields are left out of the JSON to keep messages small.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SignalMessage {

    private String type;      // What kind of message this is
    private String roomCode;  // The 5-character room code
    private Object payload;   // SDP data, ICE candidate data, or error text

    /* ── Constructors ─────────────────────────────────────── */

    public SignalMessage() {
    }

    public SignalMessage(String type) {
        this.type = type;
    }

    /* ── Factory methods for common server responses ──────── */

    public static SignalMessage roomCreated(String roomCode) {
        SignalMessage msg = new SignalMessage("room-created");
        msg.setRoomCode(roomCode);
        return msg;
    }

    public static SignalMessage roomJoined(String roomCode) {
        SignalMessage msg = new SignalMessage("room-joined");
        msg.setRoomCode(roomCode);
        return msg;
    }

    public static SignalMessage error(String message) {
        SignalMessage msg = new SignalMessage("error");
        msg.setPayload(message);
        return msg;
    }

    /* ── Getters & Setters ────────────────────────────────── */

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public void setRoomCode(String roomCode) {
        this.roomCode = roomCode;
    }

    public Object getPayload() {
        return payload;
    }

    public void setPayload(Object payload) {
        this.payload = payload;
    }
}
