# Clubdeck — Cursor Task List

Each task below is a self-contained prompt. Paste one task at a time into Cursor (Agent mode), in order. Tasks build on each other, so finish and verify one before starting the next.

_Last reviewed: 2026-10-10._

## Status

| Phase | Status |
| --- | --- |
| 1. Audio architecture (mix bus → Agora, no self-monitor, remote audio in recording, host/audience roles) | ✅ Done |
| 2. Live API correctness (no sandbox fallback, active_ping, RoomSync polling, hand-raise state) | ✅ Done |
| 3. Identity & auth (`getMe`, phone + web-auth login, token capture with user id) | ✅ Done |
| 4. Wire UI to API (moderation, raised hands, speaker invite, follow, profile, create room, small fixes) | ✅ Done |
| 5. Security & code health | ⚠️ Partial — only the `ch:request` IPC is done. Remaining work is in **Phase 7** |
| 6. Feature additions | ❌ Not started — moved to **Phase 9** |
| **0. Rename to Clubbox + remove mock data from live mode** | 🆕 Start here |
| **7. Bugs found in the 2026-10-10 review** | 🆕 |
| **8. Clubhouse feature parity** | 🆕 |

## Project context (include with every task)

```
Project: Clubbox (formerly "Clubdeck Next-Gen") — unofficial Clubhouse desktop studio. Not affiliated with Clubhouse or with the separate clubdeck.app product.
Stack: Electron 44, Vite 8, TypeScript 6 (noUnusedLocals), vanilla DOM (no framework), agora-rtc-sdk-ng 4.x, Web Audio API.
Key files:
  - src/main.ts              — ClubdeckApp class (renamed ClubboxApp in Task 0.1) (~1770 lines): all UI rendering (innerHTML templates), event wiring, hotkeys, login flow
  - src/api/client.ts        — ClubhouseApiClient: live requests (via window.electronAPI.request when in Electron), sandbox mock handler, ClubhouseApiError, onAuthExpired
  - src/api/roomSync.ts      — RoomSync: polls get_channel every 5s; RoomUpdateSource interface (PubNub can replace it)
  - src/api/types.ts         — CHUser, CHChannel, CHChannelDetail, CHAuthResponse, SoundEffectItem
  - src/audio/audioEngine.ts — Web Audio graph: micGain -> analyser/broadcastDest/recorderDest, soundpadGain, monitorGain, per-uid remote nodes, MediaRecorder
  - src/audio/agoraVoice.ts  — Agora 'live' client: join({isSpeaker,isMusicMode}), promoteToSpeaker, demoteToAudience, republish; publishes a clone of the broadcast track via createCustomAudioTrack
  - electron/main.cjs        — window setup, token-capture window, IPC 'ch:request'. Three request paths:
                               (a) WEB_AUTH_ENDPOINTS -> run in a hidden clubhouse.com page with grecaptcha
                               (b) webSession=true -> WEB_SESSION_PATHS on https://www.clubhouse.com/web_api/* with csrftoken cookie
                               (c) otherwise -> https://www.clubhouseapi.com/api/<endpoint> with app headers
  - electron/preload.cjs     — exposes electronAPI { isElectron, request, openTokenCapture, onTokenCaptured }
Rules:
  - Keep vanilla TS + DOM; do not introduce React/Vue or a state library.
  - Match existing code style (classes, singleton exports, callback subscriptions returning unsubscribe fns).
  - Sandbox mode must keep working end-to-end after every change. Every new endpoint needs a sandbox case in handleSandboxRequest.
  - Every new live endpoint must work in BOTH paths: add it to WEB_SESSION_PATHS in electron/main.cjs as well as the clubhouseapi.com path.
  - Escape every API-controlled string before it goes into innerHTML.
  - `npx tsc --noEmit` and `npm run build` must pass.
```

---

## Phase 0 — Rename and real data (do these first)

### Task 0.1 — Rename the app to Clubbox

```
Why: "Clubdeck" is already an existing, well-known unofficial Clubhouse desktop client (clubdeck.app). Using the same name causes confusion and naming/trademark risk. The new name is "Clubbox". Do not use "Clubhouse" or "…house" in the product name, and do not imitate Clubhouse's logo or colors.

Do (rename every user-facing and internal occurrence):
1. package.json: "name": "clubbox", add "productName": "Clubbox", "description": "Unofficial desktop studio for Clubhouse". Re-run npm install so package-lock.json updates its name field.
2. index.html: <title>Clubbox — Desktop Studio for Clubhouse</title>; rewrite the meta description without "Clubdeck" and with "Unofficial, not affiliated with Clubhouse".
3. electron/main.cjs:
   - BrowserWindow title -> 'Clubbox'.
   - app.setName('Clubbox') before app.whenReady(); on Windows also app.setAppUserModelId('app.clubbox.desktop').
   - Rename the internal header 'X-Clubdeck-Web-Session' -> 'X-Clubbox-Web-Session' (main.cjs and src/api/client.ts must match).
   - Log prefixes '[Electron]' are fine; any '[Clubdeck]' prefix -> '[Clubbox]'.
4. src/main.ts:
   - class ClubdeckApp -> ClubboxApp (and `new ClubboxApp()`).
   - Sidebar brand: "Clubdeck" -> "Clubbox"; remove the "PRO v2" badge (keep the SANDBOX/LIVE mode badge).
   - "Clubdeck Soundboard Sampler" -> "Soundboard".
   - Recording filename: `clubbox-recording-<room-slug>-<YYYYMMDD-HHmm>.webm` (slug from topic, ASCII, max 40 chars).
   - console prefixes '[Clubdeck]' -> '[Clubbox]'.
   - Add a small "Unofficial — not affiliated with Clubhouse" line in the settings view footer.
5. src/api/client.ts:
   - deviceId prefix 'clubdeck-v2-' -> 'clubbox-'. IMPORTANT: keep an already-saved deviceId (do not regenerate it for existing users — Clubhouse may treat a new device id as a new login).
   - localStorage key 'clubdeck_config' -> 'clubbox_config' with a one-time migration: on startup, if 'clubbox_config' is missing and 'clubdeck_config' exists, copy it over, then remove the old key. Wrap all localStorage access in try/catch.
6. start-clubdeck.bat -> start-clubbox.bat (update the echo text).
7. README.md: rewrite the title and intro for Clubbox, add a clear "Unofficial — not affiliated with Clubhouse or clubdeck.app" notice near the top, and update commands/shortcuts if they mention the old name.
8. CURSOR_TASKS.md project context already says Clubbox; leave the rest of this file alone.
9. Do NOT rename the project folder (c:\Projects\clubdeck) — the user will do that manually if wanted.

Acceptance:
- `grep -rni "clubdeck" --exclude-dir=node_modules --exclude-dir=dist --exclude=CURSOR_TASKS.md --exclude=package-lock.json .` returns only the migration code that reads the old 'clubdeck_config' key.
- An existing user's settings and deviceId survive the rename (test: set a value under 'clubdeck_config', reload, it appears under 'clubbox_config').
- tsc and build pass; the window title and sidebar show "Clubbox".
```

### Task 0.2 — Keep mock data in sandbox only; no stock photos in live mode

```
Problem: Mock data and Unsplash stock photos leak into the real app.
  - src/main.ts:
    - FALLBACK_AVATAR is an Unsplash stock photo (line ~41), so every real user without a photo shows a stranger's face.
    - Two more hardcoded Unsplash fallbacks in the chat (~1131) and explore cards (~1181) bypass FALLBACK_AVATAR.
    - chatMessages is seeded with fake "Elena Rostova" / "Marcus Vance" messages with Unsplash photos (~66-85); they show in live rooms too.
  - src/api/client.ts: MOCK_ME and INITIAL_MOCK_CHANNELS (55 mock references, Unsplash photos, fake names like "Alex Rivera") live in the same file as the live client.
  - src/main.ts renderProfileDrawer / others may still show placeholder text when data is missing.
  - The app loads remote images from images.unsplash.com even in live mode (privacy leak + breaks offline).

Do:
1. Create src/api/sandboxData.ts and move MOCK_ME, INITIAL_MOCK_CHANNELS and the seed chat messages there. client.ts imports them only for handleSandboxRequest(). main.ts must not import sandbox data at all — sandbox chat seeds come from a sandbox endpoint/case (e.g. 'get_channel_messages') so the UI path is the same as live.
2. Replace stock-photo avatars with a local generated avatar:
   - Create src/ui/avatar.ts exporting avatarHtml(user: { name, username, photo_url }, size): returns <img> if photo_url is a valid https URL, otherwise an inline initials circle (first letters of name, background color derived from a hash of user_id/username). No network requests for fallbacks.
   - Add an onerror fallback on <img> that swaps to the initials circle (do it with a delegated 'error' listener in capture phase, not inline onerror attributes, so it works with CSP).
   - Use avatarHtml() everywhere an avatar is rendered: sidebar, speaker cards, audience cards, raised hands, chat, explore room cards, profile drawer.
   - Delete FALLBACK_AVATAR and every 'images.unsplash.com' string from src/main.ts.
3. Sandbox data: replace Unsplash photo URLs in sandboxData.ts with photo_url: null so sandbox also uses the initials avatars (works offline, no third-party requests). Keep names clearly fictional and mark the sandbox user as "Sandbox User" (@sandbox) instead of "Alex Rivera".
4. Empty states instead of fake data in live mode:
   - Chat with no messages: "No messages yet".
   - Explore with no rooms: "No live rooms right now" + Refresh button.
   - Profile fields missing: hide the row instead of showing "—" for bio; keep "—" for counts.
5. Live-mode guard: add a dev-only assertion (import.meta.env.DEV) in ClubhouseApiClient.request(): if !useSandbox and a response object contains a user_id that exists in sandboxData, console.error("sandbox data leaked into live mode").
6. Also remove "PRO v2"/"Next-Gen" marketing labels from the UI if still present after Task 0.1.

Acceptance:
- `grep -rn "unsplash" src` returns nothing.
- `grep -rn "Elena\|Marcus\|Alex Rivera\|100982" src --include=*.ts` only matches src/api/sandboxData.ts.
- In live mode (Network tab), no request goes to images.unsplash.com.
- A user with photo_url null or a broken image URL shows an initials avatar.
- Sandbox mode still shows rooms, speakers, hand raises and chat.
```

---

## Phase 7 — Bugs from the 2026-10-10 review

### Task 7.1 — Finish XSS escaping and turn web security back on

```
Problem: escapeHtml() exists in src/main.ts but many templates still interpolate API-controlled strings raw. The renderer runs with webSecurity:false (electron/main.cjs line ~32), so a malicious room topic or username can run script in the app.

Unescaped spots today (src/main.ts):
  - top bar: currentChannel.club_name, currentChannel.topic (~914-915)
  - speaker cards: speaker.name in alt, speaker.name, speaker.username (~1052-1057)
  - chat: msg.name in alt, msg.name, msg.message (~1131-1134)
  - explore cards: ch.club_name, ch.topic, u.name in alt and in the names list (~1168-1185)
  - soundboard tiles: fx.name (custom upload file names) (~1218)
  - cockpit quick buttons: fx.name (~1356)
  - showToast(): message is inserted with innerHTML (~540) and receives API error messages and topics
  - settings inputs: config values in value="..." attributes

Do:
1. Create src/ui/html.ts exporting escapeHtml (move it from main.ts; also escape single quotes), safeUrl(url) (returns the url only if it is https:, else null so the caller falls back to the initials avatar from Task 0.2), and a tagged template `html` that escapes every interpolation by default plus raw() for trusted nested HTML.
2. Convert every template in main.ts to html`` / escapeHtml. Every <img src> goes through safeUrl().
3. showToast(): build the element with textContent, not innerHTML.
4. electron/main.cjs: remove webSecurity:false. All live traffic already goes through the 'ch:request' IPC, so CORS is no longer needed in the renderer. Verify Agora still connects (Agora uses its own WebSocket/WebRTC, so it does not need webSecurity off).
5. Add a CSP meta tag to index.html: default-src 'self'; img-src https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://*.agora.io wss://*.agora.io https://*.agoraio.cn wss://*.edge.agora.io https://*.sd-rtn.com wss://*.sd-rtn.com; media-src 'self' blob:.

Acceptance: a sandbox room created with topic `<img src=x onerror=alert(1)>` and a custom sound named `<b>x</b>` both render as plain text; no alert fires; `grep -n "webSecurity" electron/main.cjs` returns nothing.
```

### Task 7.2 — Profile drawer closes every 5 seconds

```
Problem: render() rebuilds #app including an empty `<div class="profile-drawer" id="profile-drawer"></div>`. RoomSync calls applyRoomUpdate() -> render() every 5s, so an open profile drawer is wiped while isProfileDrawerOpen stays true. The same happens after any other full render (follow, nav, etc.).

Do:
1. Move the drawer out of the #app template: create it once on document.body (like the toast container) and never touch it from render().
2. Alternatively/additionally, at the end of render(): if isProfileDrawerOpen, call renderProfileDrawer() again.
3. When the profile being shown is in the current room, refresh selectedProfile's room flags (is_speaker, is_moderator, is_muted) from the RoomSync update, without refetching get_profile.

Acceptance: in sandbox, open a profile in a room and wait 30s — the drawer stays open and the moderator buttons stay correct.
```

### Task 7.3 — Moderation and hand raise in web-session mode

```
Problem: In electron/main.cjs, WEB_SESSION_PATHS has no entry for audience_reply, invite_speaker, mute_speaker, make_moderator, uninvite_speaker. postWithWebSession() returns "This action is not available on the web session yet." for them. Web-session sign-in is now the default path, so most users can't raise a hand or moderate.

Do:
1. Open https://www.clubhouse.com in a signed-in browser, join a room, and capture the real web_api paths and request bodies (DevTools Network tab) for: raise/lower hand, invite to speak, accept invite, mute speaker, make moderator, move to audience, leave stage. Do NOT guess — record the observed path and body for each.
2. Add each one to WEB_SESSION_PATHS. If a web body differs from the app API body, translate it in postWithWebSession() via a small per-endpoint mapper.
3. If a capability is not available on the web at all, hide that button in the UI when config.webSession is true (add `clubhouseClient.supports(endpoint): boolean`) instead of showing a button that always fails.
4. Add `become_audience` / leave-stage support: when I am a speaker, show a "Leave stage" button in the cockpit.

Acceptance: with a web session, raising a hand and (as a moderator) inviting a listener both succeed; no button calls an endpoint that is unmapped.
```

### Task 7.4 — Keep Agora role in sync with room state

```
Problem: agoraVoice.demoteToAudience() is never called. If a moderator moves me to the audience, Agora keeps publishing my mic. If a moderator makes me a speaker without an invite (or I create a room), promoteToSpeaker() is never called and I am silent. Also agoraVoice.join() returning false is ignored and the user still sees "Joined".

Do:
1. In ClubdeckApp.applyRoomUpdate(): compute `amSpeaker` from the new users list. If amSpeaker && agoraVoice.getIsJoined() && !agoraVoice.getIsSpeaker() -> promoteToSpeaker(). If !amSpeaker && agoraVoice.getIsSpeaker() -> demoteToAudience(), set the mic muted, and toast "You were moved to the audience".
2. Guard with an in-flight flag so overlapping polls don't promote/demote twice.
3. joinRoom(): if agoraVoice.join() returns false in live mode, show a persistent warning in the stage header ("Audio not connected — Retry") with a retry button, instead of the success toast.
4. Sync hand-raise from room state: on each update, set clubhouseClient's handRaised from my user's is_hand_raised (add a setter) and update the hand button.

Acceptance (sandbox + a fake uninvite): moving me to the audience stops publishing (agoraVoice.getIsSpeaker() === false); a failed Agora join shows the retry banner.
```

### Task 7.5 — Music Mode race and mic restarts

```
Problem: ClubdeckApp.toggleMusicMode() calls audioEngine.toggleMusicMode(), which calls startMicrophone() without awaiting it, then agoraVoice.republish() calls publishBroadcast(), which calls startMicrophone() again. Two getUserMedia calls overlap; both run releaseMicrophoneGraph() before their await, so two mic graphs can end up connected (double volume / echo). publishBroadcast() also restarts the mic on every join/promote.

Do:
1. Make AudioEngine.startMicrophone() single-flight: keep a `micStartPromise`; concurrent callers await the same promise. Add a `restartMicrophone()` that waits for any in-flight start, then restarts.
2. toggleMusicMode() in AudioEngine becomes async and awaits restartMicrophone().
3. publishBroadcast() should call an `ensureMicrophone()` that only starts the mic if there is no live mic stream, instead of always restarting it.
4. ClubdeckApp.toggleMusicMode(): await audioEngine.toggleMusicMode() before agoraVoice.republish().

Acceptance: toggle Music Mode 10 times quickly while on stage; afterwards exactly one mic track is live (log micStream track count) and the level is unchanged.
```

### Task 7.6 — Small correctness fixes

```
1. joinRoom(): if already in a different room, call leaveRoom() logic first (agoraVoice.leave + clubhouseClient.leaveChannel for the old channel) so the server doesn't keep me in two rooms.
2. Speaker menu: remove the "Unmute" label — Clubhouse moderators can mute others but not unmute them. Show "Mute" only when the speaker is not muted.
3. Mute state signaling: after toggling my mic, tell the server (find the real endpoint/flag, e.g. via the web client traffic) so other listeners see my mute badge. If no endpoint exists, keep the local behavior and note it in a code comment.
4. (Covered by Task 0.2 — seed chat messages moved to sandboxData.ts. Skip if 0.2 is done.)
5. Recording consent: while recording, show a visible "● Recording" badge in the stage header and, when starting in a live room, a one-time confirm dialog reminding the user that others in the room have not consented and that Clubhouse's terms apply.
6. Electron: app.requestSingleInstanceLock(); restrict setPermissionRequestHandler to grant 'media' only to the main window's webContents (not the sign-in windows).
7. Move the hardcoded reCAPTCHA site key and 'CH-Web-AppVersion: 22.2.0' in electron/main.cjs to constants at the top of the file. Read the site key from the loaded sign-in page when possible (e.g. the grecaptcha script URL's render= param) and fall back to the constant.
```

### Task 7.7 — Code health

```
1. Split src/main.ts into src/ui/views/{stage,explore,soundboard,settings,login}.ts and src/ui/components/{cockpitBar,profileDrawer,createModal,speakerInvite,toast}.ts. ClubdeckApp stays the controller/state holder.
2. Use event delegation: one click listener on #app dispatching on data-action attributes, instead of re-attaching listeners on every render.
3. Partial renders: renderStage(), renderCockpit(), renderChat(). RoomSync updates and chat sends must not re-render the sidebar, top bar, or settings.
4. Store the auth token with Electron safeStorage (IPC get/set) instead of plaintext localStorage; mask the token field in settings (type="password" + show button).
5. Unify UI language: the token-capture banner, its buttons and toasts in main.ts are Turkish. Move all user-facing strings to src/i18n/en.ts and add src/i18n/tr.ts with a language setting.
6. Delete Vite leftovers (src/counter.ts, src/assets/hero.png, src/assets/vite.svg, src/assets/typescript.svg, public/icons.svg — verify unused first), the root electron_*.log files, and the empty scripts/ folder.
7. ESLint (typescript-eslint flat config) + Prettier + `npm run lint`. Replace `any` in client.ts with typed responses.
8. git init with a first commit (do this before anything else if it is still missing).
```

---

## Phase 8 — Clubhouse feature parity

Endpoint names below come from community reverse-engineering and may be outdated. For each task, first confirm the real path and body from the clubhouse.com web client (DevTools → Network) and add it to both request paths.

### Task 8.1 — Real in-room chat

```
Clubhouse rooms have a text chat (since 2022). The Clubdeck "Room Backchannel" panel is local-only.

Do:
1. Find how the web client sends and receives room chat messages (REST endpoint and/or PubNub channel). Record it in a comment at the top of a new src/api/roomChat.ts.
2. RoomChat class: send(channelId, text), onMessage(cb), start(channelId), stop(). If messages arrive via PubNub, implement a minimal PubNub subscriber using pubnub_token from the join response (add the `pubnub` npm package); otherwise poll.
3. Respect CHChannelDetail.is_chat_enabled: hide the input when chat is off.
4. Sandbox: emit a fake message every ~15s.
5. Render via renderChat() only (Task 7.7), escape everything, autoscroll only if already at the bottom.
```

### Task 8.2 — Room settings for moderators

```
Add a "Room settings" menu (moderators only) in the stage header with:
1. Edit room title/topic.
2. Toggle hand raise on/off (is_handraise_enabled) and who can raise hands.
3. Toggle room chat on/off (is_chat_enabled).
4. Pin a link at the top of the room (show the pinned link to everyone; moderators can change or remove it).
5. End room (for the creator).
6. Remove a user from the room / block from room (listener and speaker context menus).
Each action: client method + sandbox case + WEB_SESSION_PATHS entry + UI only when allowed.
```

### Task 8.3 — Invite people into a room ("ping") and Wave

```
1. "Invite people" button in the stage header opens a searchable list of people I follow (get_following or web equivalent) with an Invite button per person (invite_to_existing_channel or web equivalent).
2. Wave: in Explore, a "Wave" action on a followed user that starts a private room with that user (or the web equivalent of wave). Skip if the web API has no equivalent; note it in the code.
```

### Task 8.4 — Clips (last 30 seconds)

```
Clubhouse lets listeners clip the last 30 seconds of a public room. Clubdeck already has every room participant in the Web Audio graph.

Do:
1. In AudioEngine, keep a rolling 30s buffer of the recorder mix (AudioWorklet or ScriptProcessor writing into a ring buffer of Float32 PCM; 48kHz stereo ≈ 11 MB).
2. "✂ Clip" button in the cockpit + hotkey C: encode the buffer to WAV (or WebM via MediaRecorder on a buffer source) and save it with a filename containing the room topic and time.
3. Disable Clip in private/social rooms and when the host has disabled clips, if the room data exposes that flag.
```

### Task 8.5 — Discovery: search, clubs, events, notifications

```
1. Search view (new nav item): debounced input -> search users (and clubs if available); results open the profile drawer.
2. Club page: clicking a club badge opens club info (name, description, members count, upcoming events, live rooms).
3. Events: upcoming events in Explore (get_events or web equivalent) with "Remind me" if available.
4. Notifications panel with an unread badge in the sidebar, using CHNotification; poll every 60s.
5. Explore currently maps get_feed_v3 'items' to channels only; keep non-channel items (events, suggested people) and render them as sections.
```

### Task 8.6 — Replays (playback)

```
Clubhouse rooms can be recorded as Replays by the host. Add playback of replays only (not publishing):
1. On profiles and clubs, list available replays if the API exposes them.
2. Player with play/pause, 1x/1.5x/2x speed, skip 15s, and a speaker timeline if the data includes it.
Skip if the web API does not expose replays; document the finding.
```

### Task 8.7 — Chats, Backchannel and Houses (decide scope first)

```
Since 2023 Clubhouse's main surface is "Chats" (async voice group chats with transcripts), plus Backchannel/voice DMs and Houses (private communities). These are a different product surface from Clubdeck's live studio focus.

Do (research spike only, no UI yet):
1. Capture the web client's endpoints for: listing chats, fetching a chat's voice messages + transcripts, sending a voice message, listing Houses, DMs.
2. Write docs/chats-api.md with the findings, auth requirements and payload shapes.
3. Propose (in that doc) a minimal read-only "Chats inbox" view that plays messages through the existing AudioEngine, and a send flow that records from the broadcast bus (so soundboard effects can be included).
```

---

## Phase 9 — Studio features (from the original Phase 6)

### Task 9.1 — Audio device & level controls

```
1. Settings: input device and output device selects (navigator.mediaDevices.enumerateDevices). Input -> getUserMedia deviceId constraint; output -> AudioContext.setSinkId if available.
2. Cockpit: mic gain slider wired to AudioEngine.micVolume via a new setMicVolume().
3. "Hear myself" toggle wired to the existing AudioEngine.setMonitorEnabled().
4. Per-speaker volume slider in the profile drawer using the existing AudioEngine.setRemoteVolume(uid).
5. Persist device/volume choices in localStorage (wrap reads/writes in try/catch).
```

### Task 9.2 — Soundboard improvements

```
1. Persist custom sounds in IndexedDB (original ArrayBuffer + name + icon + hotkey); load on startup.
2. Per-pad: rename, change icon, delete, volume, assign hotkey (1-9, 0, F1-F12). Fix: setupHotkeys() only listens to keys 1-6, so uploads beyond 6 have no working hotkey; loadCustomAudioFile() assigns hotkey = list length + 1, which can collide after deletes.
3. "Stop all sounds" button + hotkey (track active AudioBufferSourceNodes / oscillators).
4. Optional: loop toggle for background music beds.
```

### Task 9.3 — Global hotkeys (push-to-talk) in Electron

```
1. In electron/main.cjs register globalShortcut for configurable accelerators: toggle mute, soundboard pads 1-9, clip. globalShortcut has no keyup, so hold-to-talk needs uiohook-napi; otherwise ship toggle-to-talk.
2. Send IPC events to the renderer (expose onGlobalShortcut in preload.cjs); the renderer reuses toggleMute / playSoundEffect.
3. Settings section to rebind shortcuts; persist; unregister on quit.
```

### Task 9.4 — Packaging

```
1. Add electron-builder with Windows NSIS + portable targets and a macOS dmg; generate png/ico icons from public/favicon.svg (check it is the Clubdeck icon, not the Vite template one).
2. Script: "dist": "npm run build && electron-builder".
3. Keep start-clubdeck.bat for dev only, or remove it.
4. Optional: electron-updater with GitHub releases.
```
