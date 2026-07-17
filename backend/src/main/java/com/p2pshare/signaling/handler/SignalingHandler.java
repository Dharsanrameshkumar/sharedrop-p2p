package com.p2pshare.signaling.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.p2pshare.signaling.model.SignalMessage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.p2pshare.signaling.service.RateLimiterService;

import java.io.IOException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket handler for WebRTC signaling.
 *
 * This server only helps two browsers find each other (signaling).
 * Once they connect via WebRTC, the server steps out of the way.
 * It NEVER sees or stores the actual file data.
 *
 * Flow:
 *   1. Sender creates a room -> gets a 5-character room code
 *   2. Receiver joins the room using the code
 *   3. Server relays SDP offer/answer and ICE candidates between them
 *   4. Once WebRTC connects, the server is no longer needed
 */
@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);

    // Characters used for room codes (removed confusing ones like 0/O, 1/l/I)
    private static final String ROOM_CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
    private static final int ROOM_CODE_LENGTH = 5;
    private static final int MAX_ROOMS = 100;
    private static final Duration ROOM_EXPIRY = Duration.ofMinutes(30);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SecureRandom random = new SecureRandom();

    // Room code -> Room data
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    // Session ID -> Room code (so we can clean up when someone disconnects)
    private final Map<String, String> sessionToRoom = new ConcurrentHashMap<>();

    private final RateLimiterService rateLimiterService;

    public SignalingHandler(RateLimiterService rateLimiterService) {
        this.rateLimiterService = rateLimiterService;
    }

    /**
     * Get the count of currently active rooms.
     */
    public int getActiveRoomsCount() {
        return rooms.size();
    }

    /**
     * Get the status of a specific room code.
     * Returns: "WAITING_FOR_PEER", "FULL", or "NOT_FOUND".
     */
    public String getRoomStatus(String roomCode) {
        if (roomCode == null) return "NOT_FOUND";
        Room room = rooms.get(roomCode.trim().toLowerCase());
        if (room == null) return "NOT_FOUND";
        if (room.receiver == null) return "WAITING_FOR_PEER";
        return "FULL";
    }

    /* ═══════════════════════════════════════════════════════════
     *  WebSocket Lifecycle Methods
     * ═══════════════════════════════════════════════════════════ */

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("New WebSocket connection: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {

        // Parse the incoming JSON message
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

        // Route to the correct handler based on message type
        switch (signal.getType()) {
            case "create-room"   -> handleCreateRoom(session);
            case "join-room"     -> handleJoinRoom(session, signal);
            case "offer", "answer", "ice-candidate" -> relayToOtherPeer(session, signal);
            default -> sendMessage(session, SignalMessage.error("Unknown message type: " + signal.getType()));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        log.info("WebSocket disconnected: {} ({})", session.getId(), status);

        // Find which room this session was in
        String roomCode = sessionToRoom.remove(session.getId());
        if (roomCode == null) return;

        Room room = rooms.get(roomCode);
        if (room == null) return;

        // Notify the other peer that this one disconnected
        WebSocketSession otherPeer = getOtherPeer(room, session.getId());
        if (otherPeer != null && otherPeer.isOpen()) {
            sendMessage(otherPeer, new SignalMessage("peer-disconnected"));
            sessionToRoom.remove(otherPeer.getId());
        }

        // Remove the room entirely
        rooms.remove(roomCode);
        log.info("Room {} removed (peer disconnected)", roomCode);
    }

    /* ═══════════════════════════════════════════════════════════
     *  Message Handlers
     * ═══════════════════════════════════════════════════════════ */

    /**
     * Sender clicks "Create Share Link" -> we generate a room code.
     */
    private void handleCreateRoom(WebSocketSession session) {
        if (sessionToRoom.containsKey(session.getId())) {
            sendMessage(session, SignalMessage.error("You are already in a room."));
            return;
        }

        // Apply rate limit check: Max 5 rooms per IP per hour
        String ip = "unknown";
        if (session.getRemoteAddress() != null) {
            ip = session.getRemoteAddress().getAddress().getHostAddress();
        }
        if (!rateLimiterService.isAllowed(ip, "create-room", 5.0, 5.0 / 3600.0)) {
            sendMessage(session, SignalMessage.error("Rate limit exceeded. You can only create 5 rooms per hour."));
            return;
        }

        if (rooms.size() >= MAX_ROOMS) {
            sendMessage(session, SignalMessage.error("Server is full. Please try again later."));
            return;
        }

        // Generate a unique 5-character room code
        String roomCode = generateRoomCode();
        int attempts = 0;
        while (rooms.containsKey(roomCode) && attempts < 10) {
            roomCode = generateRoomCode();
            attempts++;
        }

        // Create the room with sender as the first peer
        Room room = new Room();
        room.code = roomCode;
        room.createdAt = Instant.now();
        room.sender = session;

        rooms.put(roomCode, room);
        sessionToRoom.put(session.getId(), roomCode);

        sendMessage(session, SignalMessage.roomCreated(roomCode));
        log.info("Room {} created by {}", roomCode, session.getId());
    }

    /**
     * Receiver enters the room code and clicks "Connect" -> they join the room.
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
            sendMessage(session, SignalMessage.error("Room is full. Only 2 people can share at a time."));
            return;
        }

        // Add the receiver to the room
        room.receiver = session;
        sessionToRoom.put(session.getId(), roomCode);

        // Tell the sender that the receiver has connected
        if (room.sender != null && room.sender.isOpen()) {
            sendMessage(room.sender, new SignalMessage("peer-joined"));
        }

        // Confirm to the receiver that they joined
        sendMessage(session, SignalMessage.roomJoined(roomCode));

        log.info("Receiver joined room {}", roomCode);
    }

    /**
     * Relay WebRTC messages (offer, answer, ICE candidate) to the other peer.
     * The server does NOT read or modify these — it just forwards them.
     */
    private void relayToOtherPeer(WebSocketSession session, SignalMessage signal) {
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

        // Find the other peer in the room and send the message to them
        WebSocketSession target = getOtherPeer(room, session.getId());
        if (target == null || !target.isOpen()) {
            sendMessage(session, SignalMessage.error("Other peer is not connected."));
            return;
        }

        sendMessage(target, signal);
    }

    /* ═══════════════════════════════════════════════════════════
     *  Helper Methods
     * ═══════════════════════════════════════════════════════════ */

    /**
     * Given a room and one session ID, return the OTHER session in the room.
     */
    private WebSocketSession getOtherPeer(Room room, String mySessionId) {
        if (room.sender != null && room.sender.getId().equals(mySessionId)) {
            return room.receiver;
        }
        if (room.receiver != null && room.receiver.getId().equals(mySessionId)) {
            return room.sender;
        }
        return null;
    }

    /**
     * Send a JSON message to a WebSocket session safely.
     */
    private void sendMessage(WebSocketSession session, SignalMessage message) {
        if (session == null || !session.isOpen()) return;

        try {
            String json = objectMapper.writeValueAsString(message);
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        } catch (IOException e) {
            log.error("Failed to send message to {}: {}", session.getId(), e.getMessage());
        }
    }

    /**
     * Generate a random 5-character room code like "k7m3p".
     */
    private String generateRoomCode() {
        StringBuilder sb = new StringBuilder(ROOM_CODE_LENGTH);
        for (int i = 0; i < ROOM_CODE_LENGTH; i++) {
            sb.append(ROOM_CODE_CHARS.charAt(random.nextInt(ROOM_CODE_CHARS.length())));
        }
        return sb.toString();
    }

    /**
     * Background task: automatically remove rooms older than 30 minutes.
     * This prevents memory leaks if people forget to close their browsers.
     * Runs every 5 minutes.
     */
    @Scheduled(fixedRate = 300_000)
    public void cleanupExpiredRooms() {
        Instant cutoff = Instant.now().minus(ROOM_EXPIRY);

        rooms.entrySet().removeIf(entry -> {
            Room room = entry.getValue();
            if (room.createdAt.isBefore(cutoff)) {
                // Remove session mappings
                if (room.sender != null) sessionToRoom.remove(room.sender.getId());
                if (room.receiver != null) sessionToRoom.remove(room.receiver.getId());

                log.info("Expired room {} cleaned up", entry.getKey());
                return true;
            }
            return false;
        });
    }

    /* ═══════════════════════════════════════════════════════════
     *  Room Class — holds sender and receiver for each room
     * ═══════════════════════════════════════════════════════════ */

    private static class Room {
        String code;
        Instant createdAt;
        WebSocketSession sender;   // The person sending the file
        WebSocketSession receiver; // The person receiving the file
    }
}
