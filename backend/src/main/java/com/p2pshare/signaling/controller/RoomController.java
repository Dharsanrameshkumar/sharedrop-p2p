package com.p2pshare.signaling.controller;

import com.p2pshare.signaling.handler.SignalingHandler;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

/**
 * Controller exposing endpoints for room metadata and status checking.
 */
@RestController
@RequestMapping("/api/v1/rooms")
@CrossOrigin(origins = "*")
public class RoomController {

    private final SignalingHandler signalingHandler;

    public RoomController(SignalingHandler signalingHandler) {
        this.signalingHandler = signalingHandler;
    }

    /**
     * GET /api/v1/rooms/stats
     * Fetch current active room count.
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("currentlyActiveRooms", signalingHandler.getActiveRoomsCount());
        return ResponseEntity.ok(stats);
    }

    /**
     * GET /api/v1/rooms/{code}/status
     * Check if a room exists and its current capacity status.
     * Returns: {"status": "WAITING_FOR_PEER" | "FULL" | "NOT_FOUND"}
     */
    @GetMapping("/{code}/status")
    public ResponseEntity<Map<String, String>> getRoomStatus(@PathVariable("code") String code) {
        Map<String, String> response = new HashMap<>();
        String status = signalingHandler.getRoomStatus(code);
        response.put("status", status);
        return ResponseEntity.ok(response);
    }
}
