package com.p2pshare.signaling.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Health check controller to prevent the 404 Whitelabel Error Page 
 * when users or load balancers ping the root of the signaling server.
 */
@RestController
public class RootController {

    @GetMapping("/")
    public String healthCheck() {
        return "ShareDrop Signaling Server is successfully running. Connect your WebSocket client to /signal.";
    }
}
