package com.p2pshare.signaling.config;

import com.p2pshare.signaling.handler.SignalingHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Registers the WebSocket endpoint at /signal.
 *
 * When the frontend connects to ws://localhost:8080/signal,
 * Spring Boot routes that connection to our SignalingHandler.
 *
 * setAllowedOrigins("*") means any frontend URL can connect.
 * In production, you'd restrict this to your actual domain.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final SignalingHandler signalingHandler;

    public WebSocketConfig(SignalingHandler signalingHandler) {
        this.signalingHandler = signalingHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(signalingHandler, "/signal")
                .setAllowedOrigins("*");
    }
}
