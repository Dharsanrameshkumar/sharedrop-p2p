# ShareDrop ⚡ — P2P File Sharing

A peer-to-peer file sharing app that lets you send files directly between two browsers on the same Wi-Fi network. No login, no cloud storage, no file size worries — the file goes straight from one browser to the other using **WebRTC**.

**No internet required. Everything stays on your local network.**

## How It Works

1. **Sender** picks a file and gets a 5-character room code
2. **Receiver** enters the code to connect
3. The backend (Spring Boot) helps them find each other via WebSocket
4. Once connected, files transfer directly between browsers via WebRTC
5. The server **never** sees or stores the file data

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Vanilla JavaScript (ES6+), CSS3 | Direct access to WebRTC and File APIs without framework overhead |
| **Backend** | Java 17, Spring Boot 3 | Serves the frontend + WebSocket signaling in one process |
| **P2P Connection** | WebRTC DataChannel | Direct browser-to-browser transfer, encrypted by default |
| **Networking** | LAN-only (no internet needed) | Works on same Wi-Fi — no STUN/TURN servers required |

## Project Structure

```
p2p/
├── frontend/                          # Frontend files (served by Spring Boot)
│   ├── index.html
│   ├── config.js                      # Signaling server URL config
│   ├── css/style.css
│   └── js/
│       ├── signaling.js               # WebSocket client (auto-detects server)
│       ├── webrtc.js                  # WebRTC peer connection (LAN-only)
│       ├── fileHandler.js             # File chunking (64KB) and reassembly
│       └── app.js                     # UI logic, drag-drop, progress bars
│
├── backend/
│   ├── pom.xml
│   ├── mvnw / mvnw.cmd               # Maven wrapper (no Maven install needed)
│   └── src/main/
│       ├── java/com/p2pshare/signaling/
│       │   ├── SignalingApplication.java
│       │   ├── config/WebSocketConfig.java
│       │   ├── handler/SignalingHandler.java
│       │   └── model/SignalMessage.java
│       └── resources/
│           └── application.properties  # Config: port, static file serving
│
└── README.md
```

## Key Features

- **No Internet Required** — Works entirely on your local Wi-Fi network
- **Direct P2P Transfer** — Files go straight between browsers, not through a server
- **Single Command** — One `mvn spring-boot:run` serves everything (frontend + signaling)
- **File Chunking** — Large files are split into 64KB chunks to prevent browser crashes
- **Flow Control** — Monitors WebRTC buffer to pause sending when the network is slow
- **Room Codes** — 5-character codes to pair sender and receiver
- **SHA-256 Integrity** — File integrity verified after transfer using streaming hash
- **Auto Cleanup** — Old rooms are automatically removed after 30 minutes
- **Drag & Drop** — Drag files into the browser to share them
- **Progress Tracking** — Real-time speed, ETA, and percentage display

## How to Run

Requires **Java 17+**. Maven is included via the wrapper (`mvnw`). **No internet connection needed.**

### 1. Start the server
```bash
cd backend
mvn spring-boot:run
```

Or using the Maven wrapper (no Maven install required):
```bash
cd backend
./mvnw spring-boot:run        # Mac/Linux
mvnw.cmd spring-boot:run      # Windows
```

### 2. Open in browser
- **Same machine:** Open `http://localhost:8080`
- **Other devices on LAN:** Open `http://<your-ip>:8080` (e.g. `http://192.168.1.5:8080`)

To find your IP address:
- **Windows:** `ipconfig` → look for "IPv4 Address" under your Wi-Fi adapter
- **Mac/Linux:** `ifconfig` or `ip addr`

### 3. Transfer a file
Open two browser tabs (or two devices on the same Wi-Fi), one sends and one receives.
