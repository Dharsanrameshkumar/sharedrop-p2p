package com.p2pshare.signaling.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thread-safe rate limiter implementing the Token Bucket algorithm.
 * Restricts client operations based on their IP address.
 */
@Service
public class RateLimiterService {

    // Cache of token buckets keyed by "IP:Action"
    private final Map<String, TokenBucket> limiters = new ConcurrentHashMap<>();

    /**
     * Checks whether an action from a given IP is allowed.
     *
     * @param ipAddress The IP of the requesting client.
     * @param action The identifier of the action (e.g., "create-room", "api-request").
     * @param maxTokens The maximum burst size of the bucket.
     * @param refillRatePerSecond How many tokens are added back to the bucket each second.
     * @return true if the token was consumed (allowed), false if rate-limited.
     */
    public boolean isAllowed(String ipAddress, String action, double maxTokens, double refillRatePerSecond) {
        String key = ipAddress + ":" + action;
        TokenBucket bucket = limiters.computeIfAbsent(key, k -> new TokenBucket(maxTokens, refillRatePerSecond));
        return bucket.tryConsume();
    }

    /**
     * Scheduled cleanup job running every 10 minutes to remove token buckets
     * that haven't been accessed in the last 30 minutes, preventing memory leaks.
     */
    @Scheduled(fixedRate = 600_000)
    public void cleanupIdleBuckets() {
        Instant threshold = Instant.now().minusSeconds(1800); // 30 minutes
        limiters.entrySet().removeIf(entry -> entry.getValue().getLastAccessed().isBefore(threshold));
    }

    /**
     * Internal representation of a Token Bucket.
     */
    private static class TokenBucket {
        private final double capacity;
        private final double refillRatePerSecond;
        private double tokens;
        private Instant lastRefillTime;
        private Instant lastAccessed;

        public TokenBucket(double capacity, double refillRatePerSecond) {
            this.capacity = capacity;
            this.refillRatePerSecond = refillRatePerSecond;
            this.tokens = capacity;
            this.lastRefillTime = Instant.now();
            this.lastAccessed = Instant.now();
        }

        public synchronized boolean tryConsume() {
            this.lastAccessed = Instant.now();
            refill();
            if (tokens >= 1.0) {
                tokens -= 1.0;
                return true;
            }
            return false;
        }

        private void refill() {
            Instant now = Instant.now();
            double elapsedSeconds = (now.toEpochMilli() - lastRefillTime.toEpochMilli()) / 1000.0;
            if (elapsedSeconds > 0) {
                double tokensToAdd = elapsedSeconds * refillRatePerSecond;
                this.tokens = Math.min(capacity, this.tokens + tokensToAdd);
                this.lastRefillTime = now;
            }
        }

        public synchronized Instant getLastAccessed() {
            return lastAccessed;
        }
    }
}
