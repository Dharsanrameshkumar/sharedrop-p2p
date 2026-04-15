package com.p2pshare.signaling.config;

import io.github.bucket4j.Bandwidth;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Extracts and configures rate limiting rules for WebSocket sessions.
 * These metrics are defined in application.properties.
 */
@Configuration
public class RateLimitConfig {

    @Value("${app.rate-limit.messages-per-second:20}")
    private int messagesPerSecond;

    /**
     * Defines the standard token bucket capacity for a single WebSocket session.
     * Clients exceeding this rate will have messages dropped.
     */
    @Bean
    public Bandwidth websocketRateLimit() {
        return Bandwidth.builder()
                .capacity(messagesPerSecond)
                .refillGreedy(messagesPerSecond, Duration.ofSeconds(1))
                .build();
    }
}
