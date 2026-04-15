package com.p2pshare.signaling.config;

import com.p2pshare.signaling.handler.SignalingHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

/**
 * Registers the WebSocket signaling endpoint at /signal.
 *
 * Uses raw WebSocket (not STOMP/SockJS) because:
 *   1. We only need simple message relay, not pub/sub
 *   2. Keeps the protocol lightweight for signaling
 *   3. The frontend uses the native WebSocket API directly
 *
 * CORS: setAllowedOrigins("*") for development.
 * In production, restrict to the actual frontend domain.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Value("${app.cors.allowed-origins:*}")
    private String[] allowedOrigins;

    private final SignalingHandler signalingHandler;

    public WebSocketConfig(SignalingHandler signalingHandler) {
        this.signalingHandler = signalingHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(signalingHandler, "/signal")
                .addInterceptors(new HttpSessionHandshakeInterceptor())
                .setAllowedOrigins(allowedOrigins);
    }
}
