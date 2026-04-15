<div align="center">
  <h1>ShareDrop ⚡</h1>
  <p><strong>Ephemeral P2P File Sharing. Decoupled Architecture. Zero Data Retention.</strong></p>
  <p>
    <a href="https://your-frontend-demo-url.vercel.app"><strong>View Live Demo</strong></a> · 
    <a href="#-architecture"><strong>Explore Architecture</strong></a>
  </p>
</div>

ShareDrop is an open-source, login-free, deeply secure peer-to-peer file sharing application. It empowers users to stream colossal files (1GB+) directly between browsers at high speeds over WebRTC DataChannels. Your files never touch a centralized server, ensuring absolute privacy and negating 100% of cloud storage fees.

The application leverages a framework-agnostic Vanilla JavaScript frontend interfacing seamlessly with a lightweight Java Spring Boot WebSocket server that acts strictly as a "blind" signaling mediator. 

---

## 🚀 Key Features

*   **Zero-Data-Retention:** The backend acts solely as an ephemeral relay. It negotiates connection handshakes and immediately sidelines itself. It never processes, touches, or temporarily retains binary payload data.
*   **End-to-End Encryption:** All peer-to-peer streams are natively encrypted via Datagram Transport Layer Security (DTLS) and Secure Real-time Transport Protocol (SRTP).
*   **Advanced Flow Control:** Massive file reads crush browser limits. Our custom Memory-Safe processing engine slices files recursively in `64KB` segments natively. It actively polls the DataChannel's `bufferedAmount` to throttle reads during network congestion, ensuring high-reliability streams.
*   **Defense-in-Depth Security:** The signaling server is rigorously protected against DoS. Custom `Bucket4j` Token-Bucket algorithms limit connection bursts, and payload structures are hard-capped to nullify memory exhaustion attacks.
*   **Framework-Agnostic UI:** Built utilizing ES6+ Vanilla JavaScript and modular CSS. Complete with native glassmorphism, progressive UI loading, and raw byte-throughput calculations without React, Vue, or Webpack dependency bloat.

---

## 🛠️ Architecture Deep Dive

The system operates across two decoupled micro-services:

### 1. Spring Boot Signaling Cluster (`/backend`)
*   **Tech Stack:** Java 17, Spring Boot 3.x, Concurrent Data Structures, Bucket4j.
*   **Function:** Accepts encrypted WebSocket connections and groups isolated peers via alpha-numeric keys. It strictly relays the Session Description Protocol (SDP) configurations and Trickle ICE arrays to pierce NAT configurations.
*   **Automation:** Sweeps idle websockets and drops abandoned rooms using automated scheduling threads to preserve heap constraints.

### 2. Client Application (`/frontend`)
*   **Tech Stack:** Vanilla JavaScript (ES6+), CSS3.
*   **Function:** Leverages Google's edge STUN servers to secure external IP mappings. Captures `ArrayBuffer` payloads, tracking checksums across boundaries, reassembling binary structures natively via the `Blob` API, and automating file instantiation.

---

## 💻 Local Setup

You can fully test the architecture by spinning up both micro-services natively.

**1. Launch the Backend (Signaling)**
Requires Java 17 and Maven.
```bash
cd backend
mvn clean spring-boot:run
```
*The signaling socket mounts cleanly at `ws://localhost:8080/signal`.*

**2. Launch the Frontend (Client)**
Because there are zero transpilers, any static server can mount the node.
```bash
cd frontend
npx http-server
```
Navigate to `http://localhost:8080` instances to execute split-screen peer transfers.

---
> *Developed as a masterclass demonstration on full-stack Java/WebRTC integration.*
