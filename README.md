# Clubbox
### Desktop studio for Clubhouse

**Unofficial — not affiliated with Clubhouse or clubdeck.app.**

## Status

Personal, non-commercial, unofficial. Not affiliated with Clubhouse. Use at your own risk; it may violate the Clubhouse Community Guidelines (Scraping and Other Commercial Exploitation).

Clubbox is an unofficial desktop studio for Clubhouse. Built with **Electron, Vite, TypeScript, and the Web Audio API**, it gives creators, hosts, musicians, and podcasters broadcast tools on the desktop.

---

## 🚀 Key Features

* **🎛️ Audio Cockpit & Stage Grid:**
  * Real-time speaker grid with dynamic glowing speaking detection rings.
  * Moderator crowns, mute status indicators, and attendee hand-raise queue.
  * One-click stage promotions (`Invite to Stage`).
* **🔊 Low-Latency Soundboard Sampler:**
  * Instant Web Audio synthesizers: **Applause, Airhorn, Rimshot/Drums, Bell Ding, Laugh Track, Sci-Fi Zap**.
  * Custom sound file upload support (`.mp3`, `.wav`) directly to hotkey slots.
  * Soundpad master volume fader and global keyboard triggers (`1` - `6`).
* **🎵 Stereo Music Mode (48 kHz):**
  * Bypasses aggressive platform echo cancellation and noise suppression algorithms for crisp musical performance and DJ streaming.
* **🎙️ Live VU Meter & Push-to-Talk / Mute Toggle:**
  * Real-time audio analysis with smooth gain ramping (no audio pops).
  * Quick hotkey: `Spacebar` for instant mute/unmute.
* **🔴 Stage Audio Recorder (Podcaster Mode):**
  * One-click stage recording using the `MediaRecorder` API (`R` hotkey).
  * Saves and downloads studio-grade Opus/WebM audio files ready for podcast distribution.
* **🛡️ Live session + Sandbox:**
  * **Live:** the desktop app uses a Clubhouse web session after you sign in on the official page.
  * **Sandbox Mode:** Interactive simulated stages, speakers, and audience events for local testing.

---

## 📡 Clubhouse API Reference & Reverse Engineering

Clubhouse utilizes an undocumented REST API located at `https://www.clubhouseapi.com/api/` paired with **Agora RTC** for live audio streaming.

### Required Request Headers
```http
Content-Type: application/json; charset=utf-8
Accept: application/json
User-Agent: clubhouse/304 (iPhone; iOS 14.4; Scale/3.00)
CH-Languages: en-US
CH-Locale: en_US
CH-AppVersion: 1.0.8
CH-AppBuild: 304
CH-DeviceId: <UUID>
CH-UserID: <USER_ID>
Authorization: Token <AUTH_TOKEN>
```

### Core API Endpoints Implemented in `src/api/client.ts`

| Category | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **Auth** | `/start_phone_number_auth` | POST | Initiates SMS verification code request. |
| **Auth** | `/complete_phone_number_auth` | POST | Verifies SMS code; returns `auth_token` and `user_profile`. |
| **Auth** | `/resend_phone_number_auth` | POST | Resends SMS authentication code. |
| **Channels** | `/get_channels` | POST | Lists active public and club channels. |
| **Channels** | `/get_channel` | POST | Retrieves detailed room state, speaker list, and Agora token. |
| **Channels** | `/join_channel` | POST | Joins channel; returns Agora RTC credentials. |
| **Channels** | `/leave_channel` | POST | Leaves current room. |
| **Channels** | `/create_channel` | POST | Creates a new public, social, or private room. |
| **Channels** | `/active_ping` | POST | Periodic heartbeat to keep room connection alive. |
| **Stage** | `/audience_reply` | POST | Raises or lowers hand to speak. |
| **Stage** | `/accept_speaker_invite` | POST | Accepts invitation from moderator to speak on stage. |
| **Stage** | `/mute_speaker` | POST | Mutes a speaker on stage. |
| **Stage** | `/make_moderator` | POST | Promotes a speaker to room moderator. |
| **Social** | `/get_profile` | POST | Fetches user biography, followers, and badges. |
| **Social** | `/search_users` | POST | Searches Clubhouse user directory. |

---

## 🛠️ Quick Start

### 1. Run as Native Electron Desktop App
```bash
npm run desktop
```

### 2. Run in Web Browser
```bash
npm run dev
```

### 3. Build Production Bundle
```bash
npm run build
```

---

## ⌨️ Global Shortcuts

* `Space` — Toggle Microphone (Mute / Unmute)
* `H` — Raise / Lower Hand to Speak
* `1` - `6` — Trigger Soundboard Sampler (Applause, Airhorn, Rimshot, etc.)
* `R` — Start / Stop Stage Recording
* `Esc` — Close Drawer / Leave Room
