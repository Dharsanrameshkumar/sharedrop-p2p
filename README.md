# ShareDrop ⚡ — P2P File Sharing

A peer-to-peer file sharing web app that lets you send files directly between two browsers. No login, no cloud storage, no file size limits worries — the file goes straight from one browser to the other using **WebRTC**.

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
| **Backend** | Java 17, Spring Boot 3 | Lightweight WebSocket server for signaling |
| **P2P Connection** | WebRTC DataChannel | Direct browser-to-browser transfer, encrypted by default |
| **NAT Traversal** | Google STUN Server | Helps browsers discover each other's IP addresses |

## Project Structure

```
p2p/
├── frontend/
│   ├── index.html          # Main UI page
│   ├── css/style.css       # All styles (dark theme, glassmorphism)
│   └── js/
│       ├── signaling.js    # WebSocket client (talks to backend)
│       ├── webrtc.js       # WebRTC peer connection setup
│       ├── fileHandler.js  # File chunking (64KB) and reassembly
│       └── app.js          # UI logic, drag-drop, progress bars
│
├── backend/
│   ├── pom.xml             # Maven dependencies
│   └── src/main/java/com/p2pshare/signaling/
│       ├── SignalingApplication.java       # Spring Boot entry point
│       ├── config/WebSocketConfig.java     # Registers /signal endpoint
│       ├── handler/SignalingHandler.java   # Room management & message relay
│       └── model/SignalMessage.java        # JSON message structure
│
└── README.md
```

## Key Features

- **Direct P2P Transfer** — Files go straight between browsers, not through a server
- **File Chunking** — Large files are split into 64KB chunks to prevent browser crashes
- **Flow Control** — Monitors WebRTC buffer to pause sending when the network is slow
- **Room Codes** — 5-character codes to pair sender and receiver
- **Auto Cleanup** — Old rooms are automatically removed after 30 minutes
- **Drag & Drop** — Drag files into the browser to share them
- **Progress Tracking** — Real-time speed, ETA, and percentage display

## How to Run Locally

### 1. Start the Backend
Requires **Java 17** and **Maven**.
```bash
cd backend
mvn clean spring-boot:run
```
The WebSocket server starts at `ws://localhost:8080/signal`

### 2. Start the Frontend
Any static file server works.
```bash
cd frontend
npx http-server
```
Open two browser tabs and test sending a file between them.
