package com.p2pshare.signaling;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Main entry point for the signaling server.
 *
 * This server helps two browsers find each other using WebSockets.
 * It does NOT store or see any file data — files go directly
 * between browsers via WebRTC.
 *
 * @EnableScheduling is used for cleaning up old rooms automatically.
 */
@SpringBootApplication
@EnableScheduling
public class SignalingApplication {

    public static void main(String[] args) {
        SpringApplication.run(SignalingApplication.class, args);
    }
}
