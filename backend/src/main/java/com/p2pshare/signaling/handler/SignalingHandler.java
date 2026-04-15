package com.p2pshare.signaling.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.p2pshare.signaling.model.SignalMessage;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Core WebSocket handler for WebRTC signaling.
 *
 * Responsibilities:
 *   - Room creation with short alphanumeric codes
 *   - Peer pairing (max 2 per room: 1 sender + 1 receiver)
 *   - Relaying SDP Offers, SDP Answers, and ICE candidates
 *   - Per-session rate limiting via Bucket4j
 *   - Automatic cleanup of expired rooms
 *
 * This handler NEVER inspects, stores, or modifies SDP/ICE payloads.
 * It is a transparent message relay — a "dumb pipe" for signaling.
 */
@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);

    // Characters for room codes — excluding ambiguous chars (0, O, 1, l, I)
    private static final String ROOM_CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
    private static final int ROOM_CODE_LENGTH = 5;
    private static final int MAX_ROOMS = 1000;
    private static final Duration ROOM_EXPIRY = Duration.ofMinutes(30);

    // Payload size boundaries (Security Hardening)
    private static final int MAX_SDP_LENGTH = 16384; // 16KB Max for Offer/Answer
    private static final int MAX_ICE_LENGTH = 4096;  // 4KB Max for ICE Candidate

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SecureRandom random = new SecureRandom();
    private final Bandwidth rateLimitBandwidth;

    /** Room code → Room */
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    /** WebSocket session ID → Room code (for cleanup on disconnect) */
    private final Map<String, String> sessionToRoom = new ConcurrentHashMap<>();

    /** WebSocket session ID → Rate limit bucket */
    private final Map<String, Bucket> sessionBuckets = new ConcurrentHashMap<>();

    public SignalingHandler(Bandwidth rateLimitBandwidth) {
        this.rateLimitBandwidth = rateLimitBandwidth;
    }

    /* ══════════════════════════════════════════════════════════════
     *  WebSocket Lifecycle
     * ══════════════════════════════════════════════════════════════ */

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("WebSocket connected: {}", session.getId());

        // Create a rate-limit bucket for this session using the configurable baseline
        sessionBuckets.put(session.getId(), Bucket.builder().addLimit(rateLimitBandwidth).build());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // ── Rate Limiting ──────────────────────────────────────────
        Bucket bucket = sessionBuckets.get(session.getId());
        if (bucket != null && !bucket.tryConsume(1)) {
            sendMessage(session, SignalMessage.error("Rate limit exceeded. Please slow down."));
            return;
        }

        // ── Parse JSON ─────────────────────────────────────────────
        SignalMessage signal;
        try {
            signal = objectMapper.readValue(message.getPayload(), SignalMessage.class);
        } catch (Exception e) {
            sendMessage(session, SignalMessage.error("Invalid message format."));
            return;
        }

        if (signal.getType() == null) {
            sendMessage(session, SignalMessage.error("Message type is required."));
            return;
        }

        // ── Input Validation Hardening ─────────────────────────────
        if (signal.getPayload() != null) {
            int payloadLength = signal.getPayload().toString().length();
            String type = signal.getType();

            if (("offer".equals(type) || "answer".equals(type)) && payloadLength > MAX_SDP_LENGTH) {
                sendMessage(session, SignalMessage.error("SDP payload exceeds maximum allowed size (16KB)."));
                log.warn("Blocked oversized SDP payload from session: {}", session.getId());
                return;
            }

            if ("ice-candidate".equals(type) && payloadLength > MAX_ICE_LENGTH) {
                sendMessage(session, SignalMessage.error("ICE payload exceeds maximum allowed size (4KB)."));
                log.warn("Blocked oversized ICE payload from session: {}", session.getId());
                return;
            }
        }

        // ── Route by message type ──────────────────────────────────
        switch (signal.getType()) {
            case "create-room"    -> handleCreateRoom(session);
            case "join-room"      -> handleJoinRoom(session, signal);
            case "offer",
                 "answer",
                 "ice-candidate"  -> relayMessage(session, signal);
            default               -> sendMessage(session,
                    SignalMessage.error("Unknown message type: " + signal.getType()));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        log.info("WebSocket disconnected: {} ({})", session.getId(), status);

        // Clean up rate-limit bucket
        sessionBuckets.remove(session.getId());

        // Find and clean up room membership
        String roomCode = sessionToRoom.remove(session.getId());
        if (roomCode == null) return;

        Room room = rooms.get(roomCode);
        if (room == null) return;

        // Determine which peer left and notify the other
        WebSocketSession remainingPeer = null;

        if (room.sender != null && room.sender.getId().equals(session.getId())) {
            remainingPeer = room.receiver;
            room.sender = null;
        } else if (room.receiver != null && room.receiver.getId().equals(session.getId())) {
            remainingPeer = room.sender;
            room.receiver = null;
        }

        // Remove room if both peers are gone
        if (room.sender == null && room.receiver == null) {
            rooms.remove(roomCode);
            log.info("Room {} removed (empty)", roomCode);
        }

        // Notify the remaining peer
        if (remainingPeer != null && remainingPeer.isOpen()) {
            sendMessage(remainingPeer, SignalMessage.peerDisconnected());
        }
    }

    /* ══════════════════════════════════════════════════════════════
     *  Message Handlers
     * ══════════════════════════════════════════════════════════════ */

    /**
     * Handles "create-room": generates a unique short code and registers the sender.
     */
    private void handleCreateRoom(WebSocketSession session) {
        if (sessionToRoom.containsKey(session.getId())) {
            sendMessage(session, SignalMessage.error("You are already in a room."));
            return;
        }

        if (rooms.size() >= MAX_ROOMS) {
            sendMessage(session, SignalMessage.error("Server is at capacity. Please try again later."));
            return;
        }

        // Generate a unique room code (retry up to 10 times on collision)
        String roomCode = generateRoomCode();
        int attempts = 0;
        while (rooms.containsKey(roomCode) && attempts < 10) {
            roomCode = generateRoomCode();
            attempts++;
        }

        if (rooms.containsKey(roomCode)) {
            sendMessage(session, SignalMessage.error("Could not generate unique room code. Try again."));
            return;
        }

        // Create the room with this session as the sender
        Room room = new Room();
        room.code = roomCode;
        room.sender = session;
        room.createdAt = Instant.now();

        rooms.put(roomCode, room);
        sessionToRoom.put(session.getId(), roomCode);

        sendMessage(session, SignalMessage.roomCreated(roomCode));
        log.info("Room {} created by session {}", roomCode, session.getId());
    }

    /**
     * Handles "join-room": validates the room code and pairs the receiver.
     * Notifies the sender to begin the WebRTC offer.
     */
    private void handleJoinRoom(WebSocketSession session, SignalMessage signal) {
        if (sessionToRoom.containsKey(session.getId())) {
            sendMessage(session, SignalMessage.error("You are already in a room."));
            return;
        }

        String roomCode = signal.getRoomCode();
        if (roomCode == null || roomCode.isBlank()) {
            sendMessage(session, SignalMessage.error("Room code is required."));
            return;
        }

        roomCode = roomCode.trim().toLowerCase();
        Room room = rooms.get(roomCode);

        if (room == null) {
            sendMessage(session, SignalMessage.error("Room not found. Check the code and try again."));
            return;
        }

        if (room.receiver != null) {
            sendMessage(session, SignalMessage.error("Room is full. Only two peers are allowed."));
            return;
        }

        // Pair the receiver
        room.receiver = session;
        sessionToRoom.put(session.getId(), roomCode);

        // Notify sender → triggers the WebRTC offer creation on the sender's side
        sendMessage(room.sender, SignalMessage.peerJoined());

        // Confirm to receiver that they've joined
        sendMessage(session, SignalMessage.roomJoined(roomCode));

        log.info("Session {} joined room {}", session.getId(), roomCode);
    }

    /**
     * Relays offer/answer/ice-candidate messages to the other peer in the room.
     * The server does NOT read or modify the payload — it's a transparent relay.
     */
    private void relayMessage(WebSocketSession session, SignalMessage signal) {
        String roomCode = sessionToRoom.get(session.getId());
        if (roomCode == null) {
            sendMessage(session, SignalMessage.error("You are not in a room."));
            return;
        }

        Room room = rooms.get(roomCode);
        if (room == null) {
            sendMessage(session, SignalMessage.error("Room no longer exists."));
            return;
        }

        // Determine the other peer
        WebSocketSession target;
        if (room.sender != null && room.sender.getId().equals(session.getId())) {
            target = room.receiver;
        } else if (room.receiver != null && room.receiver.getId().equals(session.getId())) {
            target = room.sender;
        } else {
            sendMessage(session, SignalMessage.error("Session not found in room."));
            return;
        }

        if (target == null || !target.isOpen()) {
            sendMessage(session, SignalMessage.error("Peer is not connected."));
            return;
        }

        // Relay the message as-is — we never inspect SDP or ICE payloads
        sendMessage(target, signal);
    }

    /* ══════════════════════════════════════════════════════════════
     *  Utilities
     * ══════════════════════════════════════════════════════════════ */

    /**
     * Sends a SignalMessage as JSON to the given WebSocket session.
     * Synchronized on the session to prevent concurrent writes.
     */
    private void sendMessage(WebSocketSession session, SignalMessage message) {
        if (session == null || !session.isOpen()) return;

        try {
            String json = objectMapper.writeValueAsString(message);
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        } catch (IOException e) {
            log.error("Failed to send message to session {}: {}", session.getId(), e.getMessage());
        }
    }

    /**
     * Generates a random room code using URL-safe, unambiguous characters.
     * Example output: "k7m3p"
     */
    private String generateRoomCode() {
        StringBuilder sb = new StringBuilder(ROOM_CODE_LENGTH);
        for (int i = 0; i < ROOM_CODE_LENGTH; i++) {
            sb.append(ROOM_CODE_CHARS.charAt(random.nextInt(ROOM_CODE_CHARS.length())));
        }
        return sb.toString();
    }

    /**
     * Scheduled task: cleans up rooms older than ROOM_EXPIRY.
     * Runs every 5 minutes to prevent memory leaks from abandoned rooms.
     */
    @Scheduled(fixedRate = 300_000)
    public void cleanupExpiredRooms() {
        Instant cutoff = Instant.now().minus(ROOM_EXPIRY);

        rooms.entrySet().removeIf(entry -> {
            Room room = entry.getValue();
            if (room.createdAt.isBefore(cutoff)) {
                // Clean up session mappings and close stale connections
                if (room.sender != null) {
                    sessionToRoom.remove(room.sender.getId());
                    closeQuietly(room.sender);
                }
                if (room.receiver != null) {
                    sessionToRoom.remove(room.receiver.getId());
                    closeQuietly(room.receiver);
                }
                log.info("Expired room {} cleaned up", entry.getKey());
                return true;
            }
            return false;
        });
    }

    /**
     * Closes a WebSocket session without throwing exceptions.
     */
    private void closeQuietly(WebSocketSession session) {
        try {
            if (session.isOpen()) {
                session.close(CloseStatus.GOING_AWAY);
            }
        } catch (IOException ignored) {
            // Intentionally swallowed — session may already be dead
        }
    }

    /* ══════════════════════════════════════════════════════════════
     *  Inner Classes
     * ══════════════════════════════════════════════════════════════ */

    /**
     * Represents an ephemeral signaling room.
     * Holds references to two WebSocket sessions (sender + receiver)
     * and is automatically cleaned up after ROOM_EXPIRY.
     */
    private static class Room {
        String code;
        WebSocketSession sender;
        WebSocketSession receiver;
        Instant createdAt;
    }
}
