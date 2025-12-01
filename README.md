# SheiyuWatch 🎥

**The Ultimate High-Fidelity P2P Watch Party Experience.**

SheiyuWatch is a serverless, peer-to-peer (P2P) screen sharing application designed for power users who demand the highest quality. Unlike Discord or Zoom, SheiyuWatch uses direct WebRTC tunnels (optimized for **Tailscale**) to stream your screen in raw 1080p, 1440p, or even 4K at 60fps without server-side compression or monthly fees.

![SheiyuWatch Banner](https://via.placeholder.com/1200x400.png?text=SheiyuWatch+High+Fidelity+Streaming)

---

## ✨ Key Features

### 🚀 **High Performance Streaming**
*   **Source Selection:** Stream entire **Screens** or specific **Windows**.
*   **Ultra Quality:** Selectable target resolution: **1080p**, **1440p**, or **4K** @ **60fps**.
*   **Low Latency:** Direct P2P connection via WebRTC ensures minimal delay.
*   **Web Mode:** Host a local web server so friends on phones or tablets can watch via browser (http://[Host-IP]:8080).

### 🎧 **Advanced Audio Control**
*   **System Audio:** Capture full PC audio.
*   **Device Selection:** Route specific input devices (e.g., **VB-CABLE**) to isolate application audio from voice chat.
*   **Local Monitor:** Host can adjust their local monitoring volume without affecting the stream.

### 💬 **Interactive Party Mode**
*   **Live Chat:** Real-time messaging with **Tenor GIF** integration.
*   **Hype Mode:** Viewers can spam "Hype Emojis" (🔥, 🎉, 🚀) that fly across the video stream in 3D.
*   **Collaborative Movie Picker:** Undecided? Use the built-in tool to randomly generate top-rated suggestions for Movies & TV Shows based on Genre.

### 🛠️ **Power User Tools**
*   **Video Enhancements:** Real-time filters for **Brightness**, **Contrast**, and **Saturation** (Great for dark movies).
*   **Nerd Stats:** Overlay displaying **Bitrate**, **FPS**, **Latency**, and **Packet Loss**.
*   **Snapshot:** One-click 1080p screenshot of the current frame.
*   **Theater Mode:** Immersive viewing experience with a sticky chat overlay.

---

## 🔌 Prerequisites

For the best experience, **SheiyuWatch is designed to run over [Tailscale](https://tailscale.com/)**.

1.  **Install Tailscale** on the Host and all Viewer machines.
2.  **Join the same Tailnet.**
3.  This creates a secure, virtual LAN that bypasses firewalls and NAT issues, guaranteeing a successful high-speed connection.

*Note: While it can work over standard LAN or port-forwarded public IPs, Tailscale is the recommended method.*

---

## 🎭 Host Guide

The Host **must** use the Electron Desktop application to capture system audio and video efficiently.

1.  **Initialize Server:**
    *   Launch SheiyuWatch.
    *   Click **Host Party**.
    *   Click **Initialize Server**. The app will automatically detect your Tailscale IP.
    *   *(Optional)* Toggle **Web Browser Streaming** if you have mobile viewers.
2.  **Invite Friends:**
    *   Share the **IP Address** displayed at the top (e.g., `100.x.x.x`) with your friends.
3.  **Start Streaming:**
    *   Click **Start Screen Share**.
    *   **Source:** Choose a Screen or specific Window.
    *   **Audio:** Select "System Audio" or a specific device.
    *   **Quality:** Pick your target resolution.
    *   Click **Go Live**.

---

## 🍿 Viewer Guide

Viewers can join using the Desktop App or via a Web Browser if the host enabled it.

1.  **Join the Party:**
    *   Launch SheiyuWatch.
    *   Click **Join Party**.
    *   Paste the **Host's IP Address**.
    *   Click **Join**.
2.  **Controls:**
    *   **Theater Mode:** Click the <Tv /> icon for cinema view.
    *   **Chat:** Hover over the video to see controls or use the sidebar.
    *   **Hype:** Click the <Zap /> icon to react to the stream!

---

## 🎬 Collaborative Movie Picker

1.  Host clicks the **Clapperboard Icon** 🎬 in the control bar.
2.  Select **Movie** or **TV Show**.
3.  Select a **Genre** (Action, Sci-Fi, Horror, Anime, etc.).
4.  The app generates **3 Top-Rated Suggestions**.
5.  Click **Reroll** to generate new picks.

---

## 🔧 Troubleshooting

### 🔴 Connection Failed / "Connecting..." forever
*   **Tailscale:** Ensure both Host and Viewer are online on Tailscale and can ping each other.
*   **Firewall:**
    *   **Windows:** Allow SheiyuWatch through Windows Defender Firewall (Private & Public networks).
    *   **Ports:** Ensure port `65432` (TCP/WebSocket) and `8080` (Web Mode) are open.

### 🔇 No Audio
*   **Host:** Did you select "System Audio" in the source selector?
*   **VB-CABLE:** If using a virtual cable, ensure the browser/player is outputting to "CABLE Input" and SheiyuWatch is capturing "CABLE Output".
*   **Viewer:** Click the speaker icon 🔈 in the player controls (Autoplay policies often mute audio by default).

### 🍎 MacOS Issues
*   **Screen Recording Permission:** macOS requires explicit permission.
    *   Go to **System Settings > Privacy & Security > Screen Recording**.
    *   Toggle **SheiyuWatch** ON.
    *   If it's stuck, run this in Terminal: `tccutil reset ScreenCapture com.sheiyuwatch.app`

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `ESC` | Exit Theater Mode |
| `F` | Toggle Fullscreen (Native) |

---

## 💻 Tech Stack

*   **Frontend:** React, TypeScript, Vite, TailwindCSS
*   **Desktop Runtime:** Electron
*   **P2P Protocol:** WebRTC (via `simple-peer`)
*   **Signaling:** Custom WebSocket server
*   **Icons:** Lucide React

---

*Built with ❤️ for Movie Nights.*