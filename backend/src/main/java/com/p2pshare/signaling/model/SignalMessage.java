package com.p2pshare.signaling.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * POJO representing a signaling message exchanged over WebSocket.
 *
 * Message types (client → server):
 *   "create-room"    — Sender requests a new room
 *   "join-room"      — Receiver joins with a room code
 *   "offer"          — SDP offer (relayed to peer)
 *   "answer"         — SDP answer (relayed to peer)
 *   "ice-candidate"  — ICE candidate (relayed to peer)
 *
 * Message types (server → client):
 *   "room-created"       — Room created, includes roomCode
 *   "room-joined"        — Receiver successfully joined
 *   "peer-joined"        — Notifies sender that receiver connected
 *   "peer-disconnected"  — Notifies remaining peer
 *   "error"              — Error with message in payload
 *
 * Jackson serializes/deserializes this to/from JSON automatically.
 * Null fields are omitted from the JSON output to keep messages lean.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SignalMessage {

    private String type;
    private String roomCode;
    private Object payload;

    /* ── Constructors ─────────────────────────────────────────── */

    public SignalMessage() {
    }

    public SignalMessage(String type) {
        this.type = type;
    }

    /* ── Static Factory Methods ───────────────────────────────── */

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

    public static SignalMessage peerJoined() {
        return new SignalMessage("peer-joined");
    }

    public static SignalMessage peerDisconnected() {
        return new SignalMessage("peer-disconnected");
    }

    public static SignalMessage error(String message) {
        SignalMessage msg = new SignalMessage("error");
        msg.setPayload(message);
        return msg;
    }

    /* ── Getters & Setters ────────────────────────────────────── */

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
