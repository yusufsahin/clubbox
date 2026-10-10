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
| 0. Rename to Clubbox + remove mock data from live mode | ✅ Appears done (clubbox name, sandboxData.ts, ui/avatar.ts, no Unsplash) — verify acceptance checks |
| **0.3 API recorder + docs, 0.4 web-session regressions** | 🆕 Start here — no API documentation exists yet; live room updates are broken in web-session mode |
| **7. Bugs found in the 2026-10-10 review** | 🆕 Partly in progress (webSecurity removed, permission handler, single-instance lock done; verify the rest) |
| **8. Clubhouse feature parity** (rewritten from current-app screenshots) | 🆕 |

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

### Task 0.3 — API recorder: discover and document the clubhouse.com web API (do before Phase 7.3 and Phase 8)

```
Why: Endpoints are currently guessed and undocumented. WEB_SESSION_PATHS claims "paths recorded from the web client", but there is no record of request bodies or responses, and get_channel / unfollow were dropped without explanation. We need a repeatable, privacy-safe way to capture the real web API while the USER uses clubhouse.com themselves.

Rules (important):
- Never ask the user for their phone number or SMS code in chat. The user signs in themselves inside the recorder window.
- Never write tokens, cookies, csrf values, phone numbers, emails or SMS codes to any file, log or commit.
- Raw captures are local-only and gitignored. Only the redacted, hand-reviewed documentation is committed.

Do:
1. Dev-only recorder window (electron/apiRecorder.cjs), opened by `npm run api:record` (sets CLUBBOX_API_RECORDER=1; main.cjs opens it only when that env var is set):
   - BrowserWindow loading https://www.clubhouse.com/home using the same session as the app (session.defaultSession), so an existing web sign-in is reused.
   - Attach webContents.debugger ('1.3'), Network.enable. For every request whose URL contains '/web_api/': record method, path, query, request JSON body, status, response JSON body (Network.getResponseBody), timing.
   - Also record PubNub / websocket traffic: Network.webSocketCreated / webSocketFrameReceived / webSocketFrameSent, and any request to *.pubnub.com or *.pndsn.com (URL + JSON payload shape).
   - Also record Agora: requests to *.agora.io / *.sd-rtn.com (URL only) and the app id / channel / uid that the page passes in (from the join_channel response).
2. Redaction (electron/redact.cjs, applied BEFORE anything is written):
   - Drop headers: authorization, cookie, set-cookie, x-csrftoken, ch-deviceid.
   - Replace values of keys matching /token|csrf|cookie|password|code|phone|email|rc_token|secret|signature/i with "<redacted>".
   - Replace any string matching a phone (/\+?\d[\d\s()-]{8,}\d/), email, JWT (/eyJ[\w-]+\.[\w-]+\.[\w-]+/) or 32+ hex/base64 run with "<redacted>".
   - Replace real names/usernames/photo URLs with stable placeholders (user_1, user_2 …) using a per-session map; keep numeric ids only as "<id>".
   - Unit-test the redactor with a fixture containing a fake phone, email, token and cookie.
3. Output:
   - Raw redacted captures: api-captures/<timestamp>.jsonl (add api-captures/ to .gitignore).
   - Generator script scripts/api-docs.mjs: reads captures and writes docs/api/web-api.md — one section per endpoint: method + path, when the web client calls it (the action the user did), request body schema (keys + types + example with placeholders), response schema (keys + types, nested), status codes seen, notes. Also docs/api/realtime.md for PubNub/websocket channels and message types.
4. Checklist for the user (print it in the recorder window as an overlay, tick items as matching requests are seen):
   - open home feed, switch topic chip, open search, search a user, open a house page
   - open a profile, follow, unfollow
   - preview/unmute a room from the hallway, join a room, leave a room
   - raise hand, lower hand, (moderator) invite a listener, mute a speaker, make moderator, move to audience, accept a speaker invite, leave stage
   - room chat: read messages, send a message, send a reaction
   - create a room (public, social, closed), end the room
   - open activity/notifications, events tab
   - open messages, open a DM, send a text, open a house chat
5. Then reconcile code with docs:
   - For every key in WEB_SESSION_PATHS (electron/main.cjs) and WEB_SESSION_ENDPOINTS (src/api/client.ts), link to its section in docs/api/web-api.md. Remove anything not confirmed by a capture; add everything confirmed.
   - Make both lists come from one source: create electron/webApiRoutes.json (endpoint -> {path, method}); main.cjs requires it, client.ts imports it (Vite can import JSON). Delete the duplicated lists.
   - Write down where the Agora app id comes from (join_channel response field or page config) and stop hardcoding it if the response provides it.

Acceptance:
- docs/api/web-api.md exists and covers every endpoint the app calls in web-session mode, each with a request and response example containing only placeholders.
- `git grep -nE "\+90|@gmail|@yusufsahin|eyJ[A-Za-z0-9_-]{10,}|csrftoken=" -- . ':!node_modules'` returns nothing.
- api-captures/ is gitignored and not committed.
```

### Task 0.4 — Fix regressions in web-session mode (found 2026-10-10 evening)

```
Problems found after the Phase 0 / 7.x edits:
1. 'get_channel' was removed from WEB_SESSION_PATHS and WEB_SESSION_ENDPOINTS. RoomSync.poll() returns early when supports('get_channel') is false, so in web-session mode (the default sign-in) the stage NEVER updates: speakers, raised hands, invites and mutes are frozen at join time, and the Agora promote/demote sync (Task 7.4) never fires.
2. 'unfollow' was removed. toggleFollow() silently returns when unfollow is unsupported — the "Following" button does nothing and shows no message.
3. electron/main.cjs has the WEB_SESSION_PATHS comment duplicated ("Keep these keys in sync…" twice).
4. get_channel_messages is sent as GET with query params and send_channel_message as POST — unverified (no capture/doc).
5. The default Agora app id changed (client.ts and agoraVoice.ts) with no note on where the new value came from.

Do (after Task 0.3 has produced docs/api/web-api.md):
1. Restore room-state updates in web-session mode using whatever the web client really uses: a get_channel-like REST call, or the PubNub/realtime channel documented in docs/api/realtime.md (implement it behind RoomUpdateSource). If neither exists, re-fetch the room via join_channel/feed data only if docs show it is safe; otherwise show a visible "Live updates unavailable in web sign-in" note in the stage header — never fail silently.
2. Unfollow: use the documented endpoint; if none exists, render the button as a disabled "Following" with a tooltip instead of a clickable no-op.
3. Remove the duplicated comment; move the route list to electron/webApiRoutes.json (see 0.3 step 5).
4. Correct methods/bodies for chat endpoints per the docs.
5. Add a code comment at the Agora app id constant pointing to the docs section that justifies it, or read it from the join response.

Acceptance: in web-session mode, raising a hand from another account shows up in Clubbox within the update interval (or the "updates unavailable" note is visible); no button in the UI is a silent no-op.
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

**Source of truth:** screenshots of the current Clubhouse iOS app taken on 2026-10-10 (summary below). Endpoint names are NOT known — for every task, first capture the real web_api path and body from a signed-in clubhouse.com session (DevTools → Network), add it to both request paths and a sandbox case. If the web client has no equivalent, hide the feature and note it in a code comment.

Do not copy Clubhouse's visual design, logo, wordmark or icon set. Match the features, keep Clubbox's own look.

```
Current Clubhouse app — observed surfaces (2026-10-10):
- Navigation: 4 tabs — home (hallway), discover (search), make friends, messages. Header on every tab: new message (envelope+), activity (bell), own avatar (profile).
- Home / hallway: topic filter chips (for you, business, politics, tech, sports, …). Room cards show house name + house icon, room title, up to ~6 speaker avatars + "+N", "speaking now" line, a "join" button, and an inline "unmute" button that previews the room audio WITHOUT joining. Floating "host a room" button.
- Discover: search "rooms, friends, and more"; onboarding progress card ("finish setting up"); "popular houses" list — cover image, name, rooms/week, description, member avatars, "join house".
- Make friends: one suggested person at a time as a card — photo, name, @username, followers, friends count, mutual followers ("X, Y and 35 others follow them"), bio lines; actions "not now" / "follow".
- Messages: row of friends with presence (green dot = online, headphones = currently in a room); segment all / DMs; list of house chats, group chats and DMs with last message preview and age (text, emoji, "shared a picture", "sent a message"); search; new chat button.
- Invite friends sheet: search friends and contacts; "invite via link" with share.
- Activity: tabs all / events; friend requests; "X added you back! say hi in a VM"; "X added you"; "X ended the room: …"; "X pinged you into <room>, but you missed it"; each row has a quick VM (voice message) button.
- Profile: display name + alias, @username, followers, friends, karma (number + "top N%"), earnings, bio with "more", sections: clips, houses (+ new house), polls, replays (each "view all / manage"); share + settings buttons.
- Settings: account, notifications, create a house, languages, dark mode, spatial audio toggle, blocked users, saved replays.
- Account: full name, alias, phone, email, username; toggles: hide recently chatting, private profile, enable nsfw, hide my name and image from clips, sync contacts; remove all contacts; delete account.
- Room: title; leave button ("✌ leave"), share, minimize (chevron). Speakers grid: each avatar has a "+" follow/add-friend button, badges (medal/rank, ticket badge), green marker before names, host marked with "+". Audience is grouped into sections: "House members", "Friends with the speakers", then others. Bottom bar: live chat ticker (latest message), "ask to speak", chat button with unread dot, reactions button (avatar + heart).
- Reactions sheet: pick the target speaker, 16 free emoji reactions, premium reactions paid with coins (heart 5, love it 10, gift 10, drool 10, that's tea 25, you're cooking 25); premium reacts are region-locked ("not supported in your country yet").
```

### Task 8.1 — App shell: four sections like the current app

```
Restructure the Clubbox sidebar to the four primary sections users know from Clubhouse, plus the studio tools:
1. Hallway (current "Explore Rooms"), Discover (search + houses), Friends (suggestions), Messages.
2. Studio section stays: Live Stage, Soundboard, Settings.
3. Top bar on every view: new message button, activity bell with unread count, own avatar opening my profile.
4. Keep the bottom cockpit bar only while in a room (it is the Clubbox studio advantage).
Only build empty shells + routing in this task; the next tasks fill them.
```

### Task 8.2 — Hallway: topic chips, rich room cards, preview listening

```
1. Topic chips above the room list (for you + categories returned by the feed). Selecting a chip reloads the feed for that topic.
2. Room card: house icon + name, title, up to 6 speaker avatars with "+N", "speaking now" line (who is talking), join button.
3. Preview listening: an "unmute/listen" button on each card plays the room audio without joining as a visible listener (if the web client does this with an audience-only Agora join, replicate it; one preview at a time; stop on navigation).
4. "Host a room" floating button opens the existing create-room modal; add "in a house" selection (pick one of my houses) next to privacy.
5. Keep the 60s auto-refresh and the Refresh button.
```

### Task 8.3 — Room view parity

```
1. Header: title, share, "leave quietly", minimize (keep the room running and show a mini player in the sidebar while browsing other sections).
2. Speaker tiles: follow/add-friend "+" button on each avatar (hidden for people I already follow), host indicator, badges if the API returns them.
3. Audience grouped into sections: "House members", "Friends with the speakers", "Others" — computed from room data (house membership, follow graph) when available; otherwise one "Listeners" section.
4. Bottom bar: latest chat message ticker, "ask to speak" (existing hand raise), chat button with unread dot, reactions button.
5. Real in-room chat (replaces the local-only panel): find how the web client sends/receives room chat (REST and/or PubNub with pubnub_token). Implement src/api/roomChat.ts (send, onMessage, start, stop). Respect is_chat_enabled. Escape everything; autoscroll only if already at the bottom; unread count when the panel is closed.
```

### Task 8.4 — Reactions

```
1. Reactions button opens a sheet: choose a target speaker (default: current speaker), then one of the free emoji reactions. Show incoming reactions as a short floating animation on the target speaker's tile.
2. Premium (coin) reactions: show them only if the API says they are available for my account/region; otherwise do not render them. Do not implement purchasing.
3. Add a reaction hotkey (e.g. F = heart) and allow binding reactions to soundboard pads (play sound + send reaction).
```

### Task 8.5 — Activity / notifications

```
1. Activity panel (bell) with tabs all / events and an unread badge; poll every 60s.
2. Row types: friend requests (accept/decline), "added you" / "added you back" (with a quick message button), "ended the room", "pinged you into <room>" (join button if the room is still live, "you missed it" otherwise).
3. Events tab: upcoming events with time, house, and "remind me" if available.
4. Optional desktop notification (Electron Notification) when pinged into a live room — off by default, toggle in settings.
```

### Task 8.6 — Ping into room and invite friends

```
1. In a room, "Invite" opens a sheet: search friends; per-person "ping" button (invite into the current room); "copy invite link" (room share link).
2. Outside a room, "Invite friends" sheet: search friends and "invite via link" (app invite link if the API provides one, otherwise hide).
```

### Task 8.7 — Discover and Houses

```
1. Search: one box for rooms, people and houses; grouped results; people open the profile drawer; rooms join; houses open the house page.
2. Popular houses list: cover, name, rooms/week, description, member avatars, "join house" / "leave house".
3. House page: cover, description, members, live and upcoming rooms, "host a room in this house".
4. My houses list (sidebar or profile) and "create a house" (name, description, cover image upload) only if the web API supports it.
```

### Task 8.8 — Make friends (suggestions)

```
1. One-card-at-a-time suggestions: photo, name, @username, followers, friends, mutual followers text, bio.
2. Actions: "not now" (skip; remember skipped ids locally) and "follow". Keyboard: ← not now, → follow.
3. Load the next batch when fewer than 3 remain.
```

### Task 8.9 — Messages (houses chats, groups, DMs)

```
Research first, then build read + send:
1. Capture endpoints for: chat list, chat messages (text, images, voice messages with transcripts), send text, send voice message, mark read, presence of friends.
2. Messages view: presence row (online / in a room — clicking a friend in a room offers "join"), all / DMs filter, search, list with last message and age, unread state.
3. Conversation view: text bubbles, images (open in a lightbox), voice messages played through AudioEngine with 1x/1.5x/2x speed and transcript if provided.
4. Composer: text + image attach + voice message recorded from the Clubbox broadcast bus (so mic processing and soundboard can be included). New chat button (pick friends).
5. Escape all message content; images only from https URLs.
Document endpoints in docs/messages-api.md.
```

### Task 8.10 — Profile parity

```
Profile drawer / page for any user, and a richer one for me:
1. Display name + alias, @username, followers, friends, karma (value + "top N%") if returned, bio with "more".
2. Sections with "view all": clips, houses, polls, replays. Replays and clips play inside Clubbox (speed 1x/1.5x/2x, skip 15s).
3. For me: share profile link, edit profile only if the web API allows it; "earnings" shown read-only if returned (no payouts UI).
4. Saved replays list (from settings) playing in the same player.
```

### Task 8.11 — Clips (create)

```
Clubhouse clips are the last 30 seconds of a public room. Clubbox already has all room audio in the Web Audio graph.
1. Keep a rolling 30s PCM ring buffer of the recorder mix (AudioWorklet).
2. "✂ Clip" button + hotkey C saves a local file named with room topic and time.
3. If the API supports uploading/sharing a clip, add "share to Clubhouse"; respect the room's clips flag and users' "hide my name and image from clips" setting (do not show their names/avatars in any clip preview card).
4. Disable in private/social rooms.
```

### Task 8.12 — Account and privacy settings

```
In Clubbox settings, add a "Clubhouse account" section that reads and (if the web API allows) updates:
- full name, alias, username (read-only if not editable), email (read-only), phone (read-only, masked except last 2 digits)
- toggles: hide recently chatting, private profile, enable nsfw, hide my name and image from clips, spatial audio
- languages (content languages for the hallway)
- blocked users list with unblock
Never log or persist phone/email outside the existing config. Do not implement delete account or contact sync.
```

### Task 8.13 — Moderator room settings

```
Moderator-only "Room settings" menu: edit title, toggle hand raise, toggle chat, pin a link, end room, remove/block a user from the room. Same rules: capture endpoint, add to both paths + sandbox, show only when allowed.
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
