/**
 * ShareDrop Configuration
 * 
 * When the frontend and backend are deployed separately (e.g., frontend
 * on Vercel, backend on Render/Railway), set the signaling server URL below.
 * 
 * When running locally with Spring Boot serving everything, leave it null
 * to auto-detect from the current page URL.
 */
window.SHAREDROP_CONFIG = {
    // Set this to your signaling server URL for production deployment.
    // Example: 'wss://your-backend.onrender.com/signal'
    // Leave null to auto-detect (same-origin mode).
    signalingServerUrl: null
};
