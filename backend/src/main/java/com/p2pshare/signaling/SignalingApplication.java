package com.p2pshare.signaling;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point for the WebRTC Signaling Server.
 *
 * This server acts ONLY as a message relay for WebRTC handshake signaling.
 * It never touches, stores, or inspects actual file data.
 *
 * @EnableScheduling is used for periodic cleanup of expired rooms.
 */
@SpringBootApplication
@EnableScheduling
public class SignalingApplication {

    public static void main(String[] args) {
        SpringApplication.run(SignalingApplication.class, args);
    }
}
