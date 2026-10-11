# Clubbox — Cursor Task List

Each task below is a self-contained prompt. Paste one task at a time into Cursor (Agent mode), in order. Tasks build on each other, so finish and verify one before starting the next.

_Last reviewed: 2026-10-11. “Uygulandı” means the code is in the tree. “Canlı doğrulandı” means it was exercised against the official Clubhouse web session. This pass is implemented; the live room, hand, invite, and chat capture is still outstanding._

### Next run (owner instruction, 2026-10-11)

Do these before continuing the Autonomous plan, then tick them:
- [x] Regression guards before the 11.1/11.2 refactor: un-pend and make green ST-1, ST-2, ST-3 (`features/audio_studio.feature`), HAL-1, HAL-2, HAL-5 (`features/hallway.feature`), SO-1 (`features/social.feature`), ACC-1, ACC-2, ACC-6 (`features/account.feature`). These features already exist in the app; the tests must describe today's behaviour, not new behaviour.
- [x] Update the PRD catalog "Today" column for everything done so far (ACC-3 is done but still shows ❌).
- [x] Then continue the Autonomous plan at 11.0 and do not stop until the plan is done or a Hard rule would be broken.

### Last autonomous run (2026-10-11)

- Autonomous plan already **Done** through **11.8 (strict)**; triage **NO NEW FAILURES**.
- Done: Settings voice-effect dropdown shows **applied** broadcast effect (not draft selected); topic-chip button font inherit (`c9b27f9`).
- Tests: unit 127 pass · BDD 123 scenarios / 717 steps · trace strict 0 errors · lint + build green.
- **Stopped:** no further shippable product work without inventing endpoint bodies or owner capture.
- Blocked: owner live room capture (0.9 S1–S3); topic-chip **server** `get_feed_v3` body; conversation delete/title + unread-summary body; replay chunk; `gif_reaction` body; unfollow undocumented.
- Still @pending: ST-9 deferred; room_host DX-1/DX-3.
- Questions for the owner: Capture a topic-chip click (`get_feed_v3` body) for server-side Hallway filter; capture `get_conversation_unread_summary` body (or confirm per-thread only); conversation delete/title and a replay chunk if those UIs should ship next.

## Status

Legend: **Uygulandı** = code is in the tree. **Canlı doğrulandı** = exercised against a real clubhouse.com session and present in docs/api. Nothing is "Canlı doğrulandı" yet except sign-in, home feed and `me`.

| Order | Task | Status |
| --- | --- | --- |
| 1 | **0.7 Review fixes (2026-10-11 #2)** — navigation guard, packaged recorder, clip worklet path, auto-armed clip buffer, 429/visibility, CORS proxy token leak | Uygulandı |
| 1b | **0.8 Followers / following / friends lists** — bundle scan + labeled UI hunt; live UI uses only counts + mutual lists | Uygulandı for counts, mutual names, and chat people. The public web bundle does not contain get_followers, get_following, or get_online_friends. get_friend_zone_match and get_social_club_members are in-bundle and not called. The labeled click-through still needs a signed-in session. |
| 0 | **Autonomous plan** (see `.cursor/rules/clubbox.mdc`): 10.1 → 11.8 (warn mode) → 10.2 → 10.5 → 11.0 → 11.1 → 11.2 → 11.3 → 11.4 → 10.4 → 11.5 → 11.6 → 11.7 → 11.9 → 11.10 → 11.8 (strict). Acceptance files: account, hallway, room_listener, room_realtime, room_host, room_moderation, audio_studio, studio, social, messages, houses_events_replays, api_health. Requirements: `docs/product/PRD.md`; design + gap list G-01…G-18: `docs/product/DESIGN.md`; acceptance: `features/*.feature` | **Done** through **11.8 (strict)**. Pending @feature: ST-9 deferred, room_host DX-1/3, owner live room capture. Packaged e2e green (`dist:dir` + asar smoke). |
| — | **10.1** / **10.2** / **10.4** / **10.5** / **11.0** / **11.8 (warn)** | Uygulandı |
| 1c | **0.9 Real room capture** — recorder misses clubhouse.pubnubapi.com, bundle scan saw 1 chunk, corrected smoke test (replays ON) | Steps 1–2 are in. S1–S3 still need a signed-in capture. |
| 2 | **0.6 Community Guidelines risk** — hidden reCAPTCHA sign-in, polling, recording, distribution | Uygulandı (code). Sign-in is a visible clubhouse.com window, polling pauses when the window is hidden, recording is opt-in, and there is no publish config. A public release is still your decision. |
| 3 | **0.5 Capture gaps** — labeled sessions, two-party protocol, evidence sync, room smoke test | `create_channel` observed (FoF, chat/replays off). Join/leave/active_ping/chat promoted to **observed** via triage. Room smoke / labeled S1–S3 still need a signed-in capture. |
| — | 0.1–0.4 Rename, mock data, recorder, web-session regressions | Uygulandı |
| — | 1–4 Audio, live API, identity, UI wiring | Uygulandı; live room parts not verified |
| — | 5 / 7 Security and review bugs | Uygulandı; see 0.7 for what is still open |
| — | 8 Clubhouse parity | Uygulandı for captured fields only. Help Center copy applied for audiences, Messages (VM/House + archive), replays-default note, and local-vs-Clubhouse Clips. Moderator chat delete / pinned link still wait on documented bodies. |
| — | 9 Studio features (devices, soundboard, global shortcuts, packaging) | Uygulandı (packaging + updater: see 0.6 step 5) |

## Project context (include with every task)

```
Project: Clubbox (formerly "Clubdeck Next-Gen") — unofficial Clubhouse desktop studio. Not affiliated with Clubhouse or with the separate clubdeck.app product. Personal, non-commercial use until the owner decides otherwise (see Task 0.6).
Stack: Electron 44, Vite 8, TypeScript 6, vanilla DOM (no framework), agora-rtc-sdk-ng 4.x, Web Audio API, electron-builder. Tests: npm test (= test:unit + test:bdd). Lint: npm run lint.
Key files:
  - src/main.ts                 — ClubboxApp controller (~2300 lines): state, timers, event delegation (data-action), hotkeys, login flow
  - src/ui/views/*.ts, src/ui/components/*.ts — render functions; src/ui/html.ts (html`` escaping, safeUrl), src/ui/avatar.ts
  - src/i18n/{en,tr}.ts         — all user-facing strings
  - src/api/client.ts           — ClubhouseApiClient: transports sandbox | web-session | mobile-token, parseLiveResponse, sandbox handler
  - src/api/capabilities.ts     — canCall(endpoint, transport): evidence gating from electron/webApiRoutes.json
  - src/api/guards.ts           — pure helpers (room session generations, failure classification) + tests/
  - src/api/roomSync.ts         — polls get_channel (only where supported); RoomUpdateSource boundary for PubNub
  - src/api/sandboxData.ts      — all mock data (sandbox only)
  - src/audio/audioEngine.ts    — Web Audio graph, recorder, clip worklet (public/clip-processor.js), soundboard
  - src/audio/agoraVoice.ts     — Agora live client, host/audience roles, custom broadcast track
  - electron/main.cjs           — windows, IPC (isTrustedSender + ipcGuard.cjs allowlist), safeStorage token, global shortcuts, auto-update, request paths:
                                  (a) web auth -> hidden clubhouse.com page with grecaptcha (to be removed in 0.6)
                                  (b) web session -> https://www.clubhouse.com/web_api/* with csrftoken cookie
                                  (c) mobile token -> https://www.clubhouseapi.com/api/* (canCall() currently blocks every endpoint here)
  - electron/webApiRoutes.json  — single route table: path, method, evidence, mutation
  - electron/apiRecorder.cjs, electron/redact.cjs, scripts/api-docs.mjs — capture + redaction + docs (docs/api/*.md)
Rules:
  - Keep vanilla TS + DOM; no React/Vue/state library. Match existing style.
  - Sandbox mode must keep working end-to-end. Every new endpoint needs a sandbox case.
  - A route is "observed" only if a redacted capture proves it. Never mark evidence by hand; never invent endpoints.
  - Escape every API-controlled string (html``); URLs through safeUrl().
  - Never ask the user for phone numbers, SMS codes or tokens; never write them to files, logs or commits.
  - Respect rate limits; no background polling while the window is hidden (see 0.6/0.7).
  - npx tsc --noEmit, npm run lint, npm test and npm run build must pass. Commit after each task.
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
   - create a room (friends only, friends of friends, House room; replays on/off; chat on/off), end the room
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

### Task 0.5 — Close the capture gaps: labeled sessions, two-party protocol, evidence sync

```
State on 2026-10-11 (from the local capture api-captures/2026-10-10T21-14-22-579Z.jsonl, 69 lines):
- Observed (200): me, get_feed_v3, get_edge_stories, get_conversations, get_conversation, get_group_suggested_invites, get_create_channel_targets, get_profile, record_action_trails.
- Observed with error: send_conversation_emoji_reaction (400 — request body is probably wrong).
- NOT observed: join_channel, leave_channel, active_ping, any room action, room chat, PubNub, websockets, Agora. The capture never entered a room.
- docs/api/web-api.md in the tree is STALE: running `npm run api:docs` on the same capture adds get_profile (observed), get_conversation, get_create_channel_targets, record_action_trails, send_conversation_emoji_reaction. webApiRoutes.json still marks get_profile as "configured-unverified".
- capabilities.ts: canCall() returns false for EVERY endpoint on the 'mobile-token' transport, so a pasted/captured app token produces an app where nothing works. Either make that explicit in the UI ("token sign-in is not supported, use web sign-in") or remove the token path.
- With allowUnverified=false (default), join_channel is blocked, so a normal user cannot join any live room yet. That is correct until a capture proves join, but the UI must say so on the room card instead of failing silently.

Do:
1. Evidence sync (no manual edits of "evidence"):
   - scripts/api-docs.mjs also writes the "evidence" field in electron/webApiRoutes.json: "observed" only if a 2xx capture exists for that method+path, otherwise "configured-unverified". Add `npm run api:check` that fails if the routes file or docs are out of date with the captures (run it in `npm run lint`).
   - Exclude telemetry from the route table and docs app section: record_action_trails (list it under "Telemetry, not used").
   - Run `npm run api:docs` and commit the regenerated docs.
2. Labeled actions in the recorder (replace path-regex guessing as the source of truth):
   - Overlay gets a "Next action" list (the checklist) plus a big "Start" / "Done" button. Clicking Start on an item opens a labeled window; every request until Done is tagged with that action id and the role (see 3). The regex tests stay only as hints ("looks like it matched").
   - Free-text note field per action (e.g. "room was public, I was moderator"). Notes go through the redactor.
   - Hotkey Ctrl+Shift+M drops a timestamp marker.
   - api-docs.mjs prints "Seen when: <labels>" from these tags and lists, per checklist item, which requests were captured.
3. Roles and the two-party protocol:
   - Recorder accepts `--role=host|listener` (npm run api:record -- --role=host) and stores it in every record. Capture file name includes the role.
   - Optional second recorder profile: `--profile=b` uses session partition 'persist:clubbox-recorder-b' so a SECOND clubhouse.com account can be signed in on the same PC at the same time (two windows). Never share cookies between partitions. Only use an account that belongs to a consenting second person.
   - Add docs/api/capture-protocol.md with the script below, so the user can follow it with a friend.
4. Room entry first: before any two-party work, add a "Room smoke test" checklist group: open a public room from the web hallway → listen 30s → leave. If the web client cannot join rooms (e.g. it redirects to the app or shows "open in app"), record that as a finding in docs/api/web-api.md ("Web client cannot join live rooms") and mark all room endpoints "unsupported" for web-session, instead of "configured-unverified".
5. Fix send_conversation_emoji_reaction: compare the 400 request body with what the web UI sends when the user reacts in a DM; document the correct body.
6. UI honesty: room cards and room actions show "Not verified yet" (tooltip with the docs link) when canCall() is false because of missing evidence; token-mode shows a single banner that it is unsupported.

capture-protocol.md content (write it in Turkish and English):
  Session A — solo (1 person, web):
    a. home, topic chip, search, profile, follow, unfollow, house page, activity, events, messages, DM, send text, DM reaction
    b. room smoke test: join public room, listen 30s, read chat, send a chat message, send a reaction, leave
    c. create a closed room alone, end it
  Session B — you host, friend listens (friend may use the phone app; only your web side is recorded):
    you: create a public room → friend joins and raises hand → you invite → friend accepts → you mute friend → you make friend moderator → you move friend to audience → you end the room
  Session C — friend hosts, you listen (friend on phone app, you on web, recorder --role=listener):
    friend creates room → you join → raise hand → lower → raise again → friend invites you → you accept → you leave stage → friend makes you moderator → you leave the room
  Session D — PubNub/realtime: during B and C keep the recorder open the whole time; it must capture websocket/PubNub frames for hand raises, invites, speaker changes and chat. If none appear, record which polling request the web client uses instead.
  After each session: npm run api:docs, review docs/api/*.md for leaks, commit docs only.

Acceptance:
- `npm run api:check` passes; webApiRoutes.json evidence equals what the captures prove.
- After sessions A–D, docs/api/web-api.md has a "Seen when" label for every app endpoint, or the endpoint is marked unsupported with the reason.
- No raw capture, HAR file, token, cookie, phone number or email is committed.
```

### Task 0.7 — Fixes from the 2026-10-11 code review (#2)

```
All checks pass today (tsc, lint, 9 tests, build), but these are real defects. Fix them in this order and add a test where noted.

1. Main window navigation guard (security).
   electron/main.cjs has no will-navigate / setWindowOpenHandler on mainWindow. isTrustedSender() trusts whatever page is loaded in mainWindow's main frame, so if anything ever navigates the main window to another site (an XSS, a future <a href>, a pinned link), that site gets window.electronAPI (request, setAuthToken, setGlobalShortcuts).
   Do: mainWindow.webContents.on('will-navigate', e => e.preventDefault()) unless the URL is the app's own index; setWindowOpenHandler(() => ({ action: 'deny' })) and open https links with shell.openExternal only after an allowlist check (clubhouse.com). In isTrustedSender also check event.senderFrame.url starts with the app origin (file://…/dist/index.html, or http://localhost:5173 only when !app.isPackaged).
   Dev-server fallback (loadURL(devUrl) when dist is missing or loadFile fails) must only run when !app.isPackaged — otherwise any local process on port 5173 would get full IPC access in the installed app.

2. API recorder in the packaged app.
   --api-recorder (argv and second-instance) and CLUBBOX_API_RECORDER work in the installed app. The recorder writes to path.join(__dirname, '..', 'api-captures'), which is inside app.asar (read-only) when packaged.
   Do: enable the recorder only when !app.isPackaged. Exclude electron/apiRecorder.cjs and scripts/ from the packaged files list. Keep electron/redact.cjs (apiLog + bundleCrawler need it at runtime).

3. Clip worklet path is broken in the packaged / file:// build.
   src/audio/audioEngine.ts startClipBuffer() calls ctx.audioWorklet.addModule('/clip-processor.js'). With loadFile(dist/index.html) the absolute path resolves to the drive root (file:///C:/clip-processor.js), addModule fails, the .catch returns false, and every "Save clip" shows "clip empty".
   Do: addModule(new URL('clip-processor.js', document.baseURI).href) (vite base is './'). Add a smoke check in the build: after npm run build, assert dist/clip-processor.js exists. Manually verify a clip saves in the packaged app.

4. Clip buffer is armed automatically in every non-closed room (src/main.ts ~1209 audioEngine.armClip(!closedRoom)) with no indicator — it continuously buffers other people's voices.
   Do: arm only when the user turns on "Allow local recording" (Task 0.6 step 4) AND the room data says replays are on AND clips are enabled by the host (Phase 8 intro). Show the REC/clip indicator whenever armed. The private/social check in saveClip() uses the outdated model — switch to the current audience model.

5. Rate limits and hidden-window polling.
   classifyHttpFailure() (src/api/guards.ts) maps 429 to 'network'; nothing backs off. meTimer polls every 60 s for as long as the user is signed in, even minimized; activity/explore/chat/room timers keep running while the window is hidden.
   Do: add kind 'rate-limit' for 429 (and error_message matching /high usage|too many|rate limit/i on 200 success:false); per-endpoint exponential backoff (1, 2, 4 … max 30 min) in ClubhouseApiClient; pause all timers on document.visibilitychange hidden for > 2 min except active_ping while in a room; resume with one refresh. Unit-test the backoff and the 429 classification in tests/guards.test.ts.

6. CORS proxy / base URL can leak credentials.
   Settings lets the user set "CORS proxy" (placeholder suggests cors-anywhere.herokuapp.com) and "Base API URL". In the browser (npm run dev) path, client.ts sends the Authorization token to that host.
   Do: remove both fields from the UI and config (Electron main already hardcodes the hosts). If browser dev mode needs a proxy, allow only http://localhost:* and never attach Authorization to it.

7. Mobile-token transport is dead code.
   canCall() returns false for every endpoint on 'mobile-token', yet the token-capture window, token field, safeStorage token and the clubhouseapi.com path (with a spoofed "clubhouse/android/<build>" User-Agent) are still wired.
   Do: either remove the mobile-token transport entirely (token capture window, token settings field, clubbox:token-* IPC, path (c) in main.cjs, the User-Agent spoof) — recommended — or show one clear "token sign-in is not supported" banner. Do not keep half of it.

8. Recorder checklist uses outdated concepts (Help Center 2026-10-11).
   electron/apiRecorder.cjs CHECKLIST still has create-public/create-social/create-closed and async "Chats" items. Replace with: create a friends-only room, create a friends-of-friends room, create a House room; replays on/off at creation; chat off; mute all speakers; delete a chat message; VM 1:1, VM group, House chat; @mention in room chat; hide a room from the hallway; House event RSVP.

9. Bundle size: the main chunk is > 500 kB because agora-rtc-sdk-ng is imported eagerly. Lazy-load it with dynamic import() in agoraVoice.ts on the first live join.

10. Commit discipline: the work since f834f25 (18 modified + 6 new files) is still uncommitted. Commit before starting, then once per numbered item.

Acceptance:
- Navigating the main window to https://example.com (e.g. from DevTools: location.href = …) is blocked; window.open is denied.
- The installed app ignores --api-recorder; app.asar contains no apiRecorder.cjs (redact.cjs stays — required by apiLog).
- A clip saves from the packaged app in a room where clips are allowed; nothing is buffered when local recording is off.
- A mocked 429 stops further calls to that endpoint until the backoff expires; no timers fire after 2 minutes minimized (except active_ping in a room).
- No CORS proxy / base URL fields remain; grep -n "cors-anywhere" src returns nothing.
```

### Task 0.8 — Followers / following / friends lists: find out what the web client really offers

```
Situation (2026-10-11): On the clubhouse.com web profile there is no followers/following list and no request is sent when "1 friend" is shown — it is plain text. So get_followers, get_following and get_cofollows are never observed and stay off in live mode (correct). Sandbox lists work only because the data is fake.

Facts from the existing captures (do not re-derive):
- get_profile (observed) returns: num_followers, num_following, num_cofollows (= friends count), follows_me, mutual_follows_count, mutual_follows[], mutual_cofollows_count, mutual_cofollows[], social_clubs[], recent_photo_urls[].
- me (observed) returns following_ids, requested_following_ids, blocked_ids — but following_ids was EMPTY in every web capture even for an account with many friends. Arrays are not truncated by the redactor (checked), so the web API really sends it empty.
- get_create_channel_targets (observed) returns targets[] (empty in captures), clubs[], events[], channel_capabilities for public / social / friend_of_friend / friend / closed / club, and web_listening_default_on.
- get_group_suggested_invites (observed) returns suggestions[] + next_cursor (empty in captures).
- Community docs (github.com/hatamiarash7/Clubhouse-API, 2021, MOBILE api clubhouseapi.com) list: GET get_following?user_id&page_size&page, GET get_followers?user_id&page_size&page, POST get_online_friends. "get_cofollows" appears nowhere — it was invented. None of these are web_api evidence.

Rules: do not call an endpoint that no capture has shown. Do not use the mobile API. Do not "probe" guessed paths automatically.

Do:
1. Static bundle scan (no requests to Clubhouse beyond normal page loads):
   - In the recorder, on Network.responseReceived for script resources from clubhouse.com (and their CDN), fetch the body with Network.getResponseBody and extract every string matching /\/web_api\/[a-z0-9_]+/ and bare endpoint-like literals next to a web_api helper. Store only the endpoint names + the script URL path (no code) in api-captures/bundle-endpoints.json.
   - scripts/api-docs.mjs writes docs/api/web-bundle-endpoints.md: every name found, whether it is observed, configured, or neither. Names in the bundle are evidence level "in-bundle" (new value in webApiRoutes.json); canCall() still treats in-bundle as NOT callable.
   - Answer in the doc: does the web bundle contain get_followers / get_following / get_online_friends / anything with follow|friend|cofollow|mutual in it?
2. Labeled UI hunt (recorder, solo, each as its own labeled action in the checklist):
   - open another user's profile and click every count/text (followers, following, friends, mutual)
   - open my own profile and do the same
   - Messages → new message / new chat → the friend picker (scroll it)
   - in a room: share → "invite people" (ping) picker
   - host a room → choose "friends only" / "friends of friends" → any people picker
   - Search → people tab and the "add friends" section
   - Activity → friend requests
   - House → members list
   - Messages → the online-friends row
   Each one that sends a list request becomes "observed"; map it to the list it really returns.
3. Rename relationship lists to what is proven:
   - remove "get_cofollows" from capabilities.ts, client.ts, relationship.ts and sandbox; use the observed endpoint name, or none.
   - Keep sandbox lists, but name the sandbox cases after the observed endpoints.
4. Live UI with only proven data (until step 1/2 finds a list):
   - Profile: show counts (followers, following, friends = num_cofollows) as plain text, not buttons.
   - Show "Mutual: A, B and N others" from mutual_follows / mutual_cofollows (+ *_count) on other users' profiles, each name opens that profile.
   - Friends view: build "People you talk to" from get_conversations participants (observed), clearly labelled as that — not as the friends list.
   - One line under the counts: "Full lists are not available on Clubhouse web." (i18n en + tr). No disabled-but-clickable buttons.
5. If the bundle contains a list endpoint but no UI triggers it: list it in docs as "in-bundle, not observed" and STOP. The owner decides; do not add a probe button.

Acceptance:
- docs/api/web-bundle-endpoints.md exists and answers the question in step 1.
- grep -rn "get_cofollows" src electron returns nothing unless a capture observed it.
- In live mode the profile shows counts + mutual lists only; nothing calls an unobserved list endpoint (verify with the recorder open).
```

### Task 0.9 — Get a real room capture: fix recorder blind spots, mine the bundle, run a corrected smoke test

```
What the last capture (api-captures/2026-10-11T09-56-29-495Z-solo.jsonl) already proves — read it, do not re-derive:
- The "smoke-open" step did not join someone else's room; it CREATED a room on the web: POST /web_api/create_channel 200, body
  {is_chat_enabled:false, is_public_room:false, is_replay_enabled:false, is_private:false, is_social_mode:false, user_ids:[], topic_ids:[], source:14, topic, privacy_level:"friend_of_friend"}.
- The create_channel response already contains everything needed to be in the room: token (Agora RTC), rtm_token (Agora RTM signalling), pubnub_token, pubnub_origin "clubhouse.pubnubapi.com", pubnub_heartbeat_value 20, pubnub_heartbeat_interval 9, pubnub_time_token, pubnub_enable, agora_native_mute, is_web_listening_enabled:true, users[] (with is_web_listener), and user_capabilities {can_end_room, can_mute_speakers, can_remove_speakers, can_edit_handraise_queue, can_edit_room_title, can_disable_room_chat, can_change_enable_web_listening, can_speak, can_post_to_chat, …}. No Agora app id is in the response.
- After create, NO join_channel, active_ping, PubNub or Agora traffic was recorded.
- Bundle scan covered ONE script (/_next/static/chunks/2g12grilkkngb.js, 57 names). It contains join_channel, leave_channel, active_ping, audience_reply, become_speaker, get_channel_messages, send_channel_message, emoji_reaction, gif_reaction, set_channel_title, web_listener_join / web_listener_leave / web_listener_active_ping, guest_join_channel / guest_leave_channel / guest_active_ping, get_replay_channel(_chunk). It does NOT contain get_channel, invite_speaker, mute_speaker, make_moderator, uninvite_speaker, end_channel — but room pages are Next.js lazy chunks that were never loaded, so "absent" is not proof yet.
- Background (Engadget/9to5mac, Jan 2022): official web listening = listen-only, for live rooms WITH REPLAYS ENABLED (and replays), launched in the US first, no login needed. Help Center 2026: replays are ON by default.

Do:
1. Recorder blind spots (electron/apiRecorder.cjs):
   a. classify(): treat any host containing "pubnub" (e.g. clubhouse.pubnubapi.com) as pubnub. Today only pubnub.com / pndsn.com match, so the room's realtime traffic would be dropped.
   b. Agora: also match *.agoraio.cn, *.agora.io subdomains used by RTM (wss), and *.sd-rtn.com; record URL + websocket frame TYPES/sizes only (no payloads) for Agora.
   c. PubNub frames/requests: record channel names (redacted to placeholders), message "type"/"action" keys and key shapes only.
   d. Keep the bundle scanner running for EVERY script loaded during the session (room pages load lazy chunks). Merge results into bundle-endpoints.json with the page path that loaded them.
   e. Overlay: add an "Open clubhouse.com link" field (only https://www.clubhouse.com/… accepted) so a room/replay share link can be opened inside the instrumented window.
2. Bundle mining (no extra requests):
   a. For each endpoint name, store a ≤400-char minified snippet around its call site in api-captures/bundle-callsites.json (code only; run the redactor over it anyway). From it, document the request body keys in docs/api/bundle-callsites.md for: join_channel, web_listener_join, guest_join_channel, active_ping, web_listener_active_ping, leave_channel, audience_reply, become_speaker, send_channel_message, get_channel_messages, emoji_reaction, set_channel_title.
   b. Find how the web client configures Agora: the createClient({mode, codec}) options and the app id source (a 32-hex literal or a config fetch). Write the finding to docs/api/realtime.md ("Agora app id: found in <chunk path>" — do not paste the value into docs; put it in config only if it differs from the current default and say why in a code comment).
   c. Find the PubNub subscribe channel naming and the message types the room UI handles (e.g. join/leave, hand raise, speaker changes, chat). Document names and shapes only.
   d. Evidence: bundle findings stay "in-bundle" (not callable). They only tell us what to capture.
3. Corrected smoke test in docs/api/capture-protocol.md (Turkish + English) and as overlay checklist items:
   S1 "Host on web" (solo): Host a room on the web with replays ON and chat ON (friends of friends is fine) → stay 90 s (to catch active_ping/heartbeat and PubNub) → send one room chat message → change the room title → end the room (or leave if there is no end button). Label each step.
   S2 "Listen on web" (solo): in the hallway pick a PUBLIC room that shows replays on (or open a room share link via the new field) → wait 60 s → send a reaction if offered → leave. Expect web_listener_join or join_channel — record which one.
   S3 "Replay" (solo): open one replay from a profile/house → play 30 s.
   Two-party sessions B/C stay as written in Task 0.5.
   Note in the protocol: if the web page shows "open in the app" for a room, write that down as the result — it is a valid finding.
4. After S1–S3: npm run api:docs; update webApiRoutes.json evidence automatically; for endpoints that remain absent from ALL scanned chunks after S1–S3 (e.g. invite_speaker, mute_speaker, make_moderator, uninvite_speaker, end_channel), set evidence "unsupported" for web-session and hide those controls in web-session mode (show "Available in the Clubhouse app" instead of "Not verified yet").
5. Wiring rule: wire only calls the capture shows. For audio, Clubbox may reuse the token from the observed create_channel / join response together with the app id found in step 2b; do not request tokens from any unobserved endpoint.

Acceptance:
- A capture of S1 contains create_channel plus the following room traffic (ping/heartbeat and/or PubNub/Agora URLs) — or the docs state precisely that none was sent and what the page showed.
- docs/api/bundle-callsites.md lists body keys for the endpoints in 2a; docs/api/realtime.md states the Agora mode/app-id source and PubNub channel/message shapes.
- Moderator controls in web-session mode show either "Not verified yet" (in a scanned chunk, not captured) or "Available in the Clubhouse app" (in no scanned chunk) — never a silent no-op.
```

### Task 0.6 — Reduce Community Guidelines risk (read before shipping anything)

```
Source: Clubhouse Community Guidelines (community.clubhouse.com), section "Scraping And Other Commercial Exploitation", read 2026-10-11. It says users may not:
  - "access, search, collect, copy, download, extract, reproduce, monitor, or index any Content by automated means, including through bots, crawlers, spiders, scrapers, scripts, browser automation tools, data-mining tools, or similar technologies";
  - "use any Content for commercial purposes, including to create, develop, market, license, sell, or provide any product, service …";
  - "circumvent or attempt to circumvent any technical measure designed to prevent or limit automated access … including access controls, rate limits …".
Also "Spam, Bots, and Platform Misuse": no artificial amplification (bot audiences).
Terms of Service (updated 2026-09-25): violating the ToS or Guidelines terminates your authorization automatically.
This is not legal advice; the owner decides the risk. The account at risk is the user's own Clubhouse account.

Where Clubbox currently overlaps with those rules:
  a. electron/main.cjs runs clubhouse.com sign-in in a HIDDEN window and calls grecaptcha.execute() programmatically (postClubhouseWebAuth). reCAPTCHA is an anti-automation measure.
  b. Background polling by scripts: RoomSync every 5 s, room chat every 8 s, explore refresh every 60 s, active_ping every 30 s, plus activityTimer and meTimer in src/main.ts.
  c. Local recording of room audio (other people's voices) and the planned clip buffer.
  d. Packaging + electron-updater + GitHub releases = distributing a product built on Clubhouse content.
  e. The API recorder (user-driven DevTools-style capture of the user's own session) — lowest risk, but keep it local and redacted.

Do:
1. Sign-in: remove the hidden-window grecaptcha flow. Sign-in happens only in a VISIBLE official clubhouse.com window where the user types the number and code themselves (the existing token-capture window). Clubbox never calls grecaptcha.execute itself.
2. Polling: no background requests unless the user is actively in a room or looking at the view. Minimums: room state 15 s, chat 15 s while the chat panel is open, hallway only on open/refresh (no 60 s timer), active_ping at the interval the official web client uses (from captures). Stop everything when the window is hidden/minimized for more than 2 minutes (except active_ping while in a room). On HTTP 429 or a "high usage"/rate-limit error: stop that endpoint, back off exponentially (1, 2, 4 … max 30 min), show a notice. Never retry around a rate limit.
3. No bulk collection: no caching of other users' profiles/feeds to disk; no export of user lists; no search/scan loops.
4. Recording and clips: off by default behind a setting "Allow local recording" with a warning that it records other people. Only allowed in rooms where replays are ON (the official consent signal). Show a persistent red "REC" banner. Never upload.
5. Distribution: until the owner decides otherwise, disable auto-update/publishing: remove the "publish" block from package.json build config and the electron-updater call, and keep releases local. Add a README section "Status: personal, non-commercial, unofficial. Not affiliated with Clubhouse. Use at your own risk; it may violate the Clubhouse Community Guidelines (Scraping and Other Commercial Exploitation)."
6. Add a first-run dialog that states the same and requires an explicit "I understand" before live mode can be enabled (sandbox mode works without it).
7. Owner action (not code): consider asking Clubhouse for written permission via the support contact form before any public release.

Acceptance: `grep -n "grecaptcha.execute" electron` returns nothing; no timer fires while the window is hidden (except active_ping in a room); package.json has no publish config; first-run dialog blocks live mode until accepted.
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

```
Clubhouse Help Center facts (support.clubhouse.com, 116 articles, read 2026-10-11) — these override older assumptions in this file:
- Platforms: help center documents only the iPhone and Android apps. Nothing documents live rooms on the web. Treat web room support as unknown until Task 0.5 step 4 proves it.
- Room audiences: "friends only", "friends of friends", House rooms (visible to everyone if the House is open), plus interest-based/public rooms. The old public/social/closed model is outdated.
- Create room options: audience/House, title, replays on/off (ON by default; can be turned off but never back on mid-room; no partial recordings kept), chat on/off.
- Hand raise queue on every room, options "Everyone" or "Friends of speakers".
- Moderator tools: hand raise queue settings, mute all speakers, turn chat off, delete individual chat messages.
- Room chat: @mention notifies the person and links them into the room. Private chat with someone in the room: text mode or voice mode (voice mode mutes the room without leaving).
- Invite: share button -> "invite people" pings friends; or @mention in room chat.
- Hallway: rooms from friends, friends-of-friends and my Houses plus recommendations; rooms can be hidden (long press -> hide). Live rooms list also under search (globe icon).
- Search: tabs top / people / rooms / houses; houses: join if public, request to join if not.
- Friends = mutual add (not one-way follow). Limit 5,000. Adding is rate limited ("high usage error"). Removing a friend does not notify them.
- Messages: async friend / friend-of-friend Chats are DISCONTINUED (read-only archive in settings). Messages now = VMs (private voice messages, 1:1 or group; members can be added, new members don't see history) + House chats (only admins/leaders post by default).
- Activity: friend add-backs, room invites, House suggestions, event invites, friend requests; cannot be cleared.
- Events: House events, RSVP, max 5 scheduled per House, edit/cancel by House admins.
- Houses: create, pin (private to me), rename (members notified), privacy, blocking rules, unlimited rooms per House.
- Replays: only the room creator can download full audio; saved replays list in settings; Replays live in House settings.
- Clips: 5-55 seconds, selected from a live TRANSCRIPT of the last few minutes; need public room + replays on + host enabled clips; not in anon mode; currently iPhone-only, English, US rooms.
- Closed captions: iOS live rooms; Android only for VMs.
- Clubhouse Plus: anonymous listening, profile photo history, see who viewed my profile, up to 8 profile links, share activity on profile. Not available in Turkey (not in the country list).
- Karma: profile karma (stable) + engagement karma (decays); min 100 karma for rewards. Rewards ("earnings"): Stripe payout, 18+, supported countries; premium reacts bought with coins are one input.
- Social accounts (X/Instagram) can no longer be connected to profiles.
- Name and username can change only every 14 days.
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
4. "Host a room" floating button opens the existing create-room modal; replace the old public/social/closed privacy select with the current audience choices: friends only, friends of friends, a House (pick one of my houses), and public/interest-based if the API offers it. Add the replays toggle (default ON, with a note that it cannot be re-enabled once turned off) and the chat toggle.
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
NOTE (Help Center 2026-10-11): async friend / friend-of-friend Chats are discontinued. Build only VMs (1:1 and group voice messages, with text mode) and House chats. Show the old Chats archive read-only if the API returns it.
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
Official Clubhouse Clips are 5-55 s, picked from a live transcript, and only allowed when the room is public, replays are ON and the host enabled clips (iPhone/US/English only today). A local Clubbox clip must not be presented as a Clubhouse Clip.
1. Only enable the local clip button when the room data says replays are on AND clips are enabled by the host. Otherwise hide it.
2. Rolling buffer of the recorder mix up to 55 s (AudioWorklet); the user picks 5-55 s before saving. Save locally only, named with room title and time. Never auto-upload or auto-share.
3. Show a visible "recording" notice while the buffer is armed, and respect users' "hide my name and image from clips" (no names/avatars in any clip preview).
4. If the web API exposes official clip creation, prefer it over the local buffer.
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
Moderator-only "Room settings" menu: edit title, hand raise queue (off / everyone / friends of speakers), mute all speakers, toggle chat, delete a single chat message, pin a link, end room, remove/block a user from the room. Same rules: capture endpoint, add to both paths + sandbox, show only when allowed.
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


---

## Phase 10 — Hybrid evidence (B + C), BDD/TDD, Release R1

**Source of truth:** `docs/product/PRD.md` (feature catalog, evidence policy, releases) and the Gherkin files in `features/`. The feature files ARE the acceptance criteria. Do not change a scenario to make it pass; if a scenario is wrong, say why and ask the owner.

Working agreement for every task in this phase:
- TDD: write the failing test first (unit/contract in `tests/`, or a scenario step), then make it pass, in the same commit.
- Every live failure the owner reports from API Health becomes a failing test before the fix.
- Keep sandbox green. Never call clubhouseapi.com. Never automate reCAPTCHA.

### Task 10.1 — BDD and contract-test harness

```
1. Add @cucumber/cucumber and tsx (dev). Config cucumber.mjs: features/**/*.feature, steps in features/steps/**/*.ts loaded through tsx, progress format + html report to reports/cucumber.html (gitignore reports/).
2. World (features/support/world.ts): builds a ClubhouseApiClient with a FakeTransport that
   - records every request (endpoint, method, path, body),
   - answers from fixtures in features/fixtures/*.json (shapes copied from the redacted captures / bundle docs, placeholders only),
   - can be told "<endpoint> will answer <status> [n times]".
   Inject the transport through a small seam in client.ts (constructor option), not by monkey-patching fetch.
   Add a fake clock (timers), a fake document.visibilityState for timing scenarios, and a fake Agora facade that records join role, token and publish.
3. Generic steps: request assertions ("a \"METHOD /path\" request is sent with body keys \"a, b\"", "the body field \"x\" is y", "no \"endpoint\" request is sent", "N … requests are sent"), evidence/experimental setup, time passing, window hidden.
   UI-level steps (I click "Join") call ClubboxApp controller methods directly (no browser automation). Extract controller logic out of DOM handlers where needed so it is testable; use jsdom only for render assertions such as "shown as plain text".
4. Contract tests (tests/contract.test.ts): for every route in electron/webApiRoutes.json with level observed/bundle/community and a documented body (PRD §2 table and docs/api/bundle-callsites.md), build the request through ClubhouseApiClient and assert method, path and the exact set of body keys.
5. Scripts: "test:unit" (the existing node --test list), "test:bdd" (cucumber, excluding @pending), "test" (= test:unit && test:bdd). Add npm test to the Definition of Done in this file's Project context.
6. Tag scenarios that need code from later tasks with @pending so the suite is green at the end of 10.1; 10.2–10.4 remove the tags.

Acceptance: npm test passes; contract tests cover every documented route; the harness can express every step used in features/*.feature (pending or not).
```

### Task 10.2 — Evidence ladder, circuit breaker, API Health

```
Implement PRD §2 exactly. Remove @pending from features/api_health.feature.
1. Evidence levels in webApiRoutes.json: observed | bundle | community | unsupported (plus the existing non-callable "in-bundle" for bundle names with no call-site body). Migrate: in-bundle WITH a call-site body → "bundle". Add the community routes from the PRD §2 table (path "/web_api/<name>", method and body as listed).
2. Fix mutation flags: today every in-bundle route is mutation:false, including send_social_club_message, delete_conversation, create_conversation, emoji_reaction, talk and mark_conversation_segment_listened. Apply the rule from the last scenario in api_health.feature and add a unit test that enforces it for every route.
3. capabilities.ts canCall(): observed/bundle callable; community only when config.experimentalActions; unsupported/in-bundle never. Persist local "unsupported" overrides (after 404/405) in config, keyed by app version so an update can retry.
4. Circuit breaker + backoff in ClubhouseApiClient as in the scenarios (404/405 → unsupported; 2 consecutive 4xx except 401/429 → disabled for the session; 429 → 1, 2, 4 … 30 min).
5. First use of any community route shows a confirmation ("Experimental: this action is guessed from older Clubhouse clients and may fail"). Remember the answer per route.
6. Settings → "Experimental actions" toggle (off by default) and an "API Health" panel: recent failures (endpoint, method, status, time, message), "Copy report" (redacted: endpoint, method, status, body KEYS, error message — no values), "Reset unsupported routes".
7. Optional opt-in "Log requests for evidence": writes redacted records in the recorder's JSONL format to userData/api-log/; scripts/api-docs.mjs also reads that folder, so a 2xx promotes the route to observed.
8. i18n en + tr for every new string.
Acceptance: api_health.feature green; contract + unit tests green; with experimental off, no community route can be called from the UI.
```

### Task 10.3 — Release R1 "Listen & Host"

```
Make features/room_listener.feature and features/room_host.feature green (remove @pending as you go), then verify live with the owner.
1. Join (bundle): join_channel {channel}; on success Agora joins as audience with the response token. Leave (bundle): leave_channel {channel}. Presence (bundle): active_ping {channel} every 30 s, kept alive while hidden.
2. Hosting (observed): after create_channel, use its token / rtm_token / pubnub_* fields; no join_channel.
3. Agora app id: the web bundle reads NEXT_PUBLIC_AGORA_KEY (docs/api/realtime.md). In the visible sign-in window (same session), read that value once from the loaded bundle, store it in config (never in docs or logs). If missing, show "Audio key not found" in API Health instead of joining silently.
4. Live updates: PubNub subscriber behind RoomUpdateSource using origin clubhouse.pubnubapi.com and the pubnub_* fields from the join/create response. Handle channel_message and channel_reaction (bundle). For the channel name and stage/hand/invite events use community naming at level "community", and log unknown message types (type + keys only) to API Health. Keep a manual "Refresh stage" button (Ctrl+P, like Clubdeck's PTR) as fallback.
5. Hand raise (audience_reply), accept invite (become_speaker → Agora host + publish, mic muted), decline (reject_speaker_invite, community), chat read/send (bundle; poll only while the chat panel is open, or use PubNub channel_message when available), reactions (emoji_reaction, bundle).
6. Host controls in room_host.feature: set_channel_title (bundle); invite_speaker, mute_speaker + "Mute everyone", change_handraise_settings, end_channel (community, experimental).
7. Log out (ACC-3): clear clubhouse.com cookies for the session, local identity, timers and Agora; return to sign-in.
8. Live check by the owner: host one short friends-only room with replays and chat on; listen to one public room. Every failure must be visible in API Health; fix each with TDD. Run api:docs afterwards.
Acceptance: both feature files green; PRD §5 R1 exit criteria met, or remaining failures listed under "R1 open issues" at the end of this file.
```

### Task 10.4 — Studio quick wins (no new endpoints)

```
Make features/studio.feature green.
1. Chapters (ST-5): Ctrl+T while recording opens a small title prompt; on stop, save "<recording-name>.chapters.txt" with a YouTube block ("00:05:57 Title") and a Spotify block ("(00:05:57) Title"); the first chapter is "00:00:00 Intro" unless the user named one at 0.
2. Recording only in rooms with replays on (ST-4), with the message from the scenario.
3. Paste link (HAL-7): the search box accepts https://www.clubhouse.com/room/<id>, /@<username>, /event/<id>, /replay/<id>; anything else → "Only clubhouse.com links". Rooms open through the R1 join flow.
4. Audience search (RL-10): Ctrl+S filters the current room's users by name/bio locally; updates as users join/leave; no requests.
5. Hallway keyword filters + highlight + "rooms with friends first" + NSFW toggle (HAL-4), client-side only, persisted in localStorage (try/catch).
6. Update the PRD catalog "Today" column for every item you finish.
Acceptance: studio.feature green; the FakeTransport records no new network calls for these features.
```


### Task 10.5 — Self-healing loop: live failures become tests without the owner

```
Goal: the owner only uses the app. No copying reports, no running the recorder, no pasting into chat.

1. Request log ON by default (Settings toggle stays, default on): every live web_api request writes one redacted JSONL record (endpoint, method, path, status, body KEYS and shapes, response shape, error message, evidence level, app version, timestamp) to <userData>/api-log/YYYY-MM-DD.jsonl. Reuse electron/redact.cjs; run outputHasLeak() before every write and drop the record if it fails. Never store values of tokens, ids, names, phone, email, message text.
   Rotate: keep 14 days, max 20 MB.
2. Also log realtime: PubNub message type + key shapes for unknown types; Agora join result (ok/error code only).
3. `npm run api:triage` (scripts/api-triage.mjs):
   - reads the api-log folder (path from Electron's userData for app name "Clubbox"; allow CLUBBOX_API_LOG override),
   - groups failures by endpoint+status+error,
   - for each NEW group writes tests/live-failures/<endpoint>-<status>.test.ts (a failing contract/behaviour test reproducing the request shape and the failure handling the PRD expects) and a fixture with the redacted response,
   - for 2xx on bundle/community routes: promotes evidence to observed in electron/webApiRoutes.json and regenerates docs (api:docs),
   - for unknown PubNub types: appends them to docs/api/realtime.md under "Seen live, not handled",
   - writes reports/triage.md (gitignored) with a summary; prints "NO NEW FAILURES" when nothing changed.
   Idempotent: running it twice creates nothing new.
4. Wire it into the workflow: `npm run api:triage` runs at the start of every autonomous run (see .cursor/rules/clubbox.mdc step 5). Generated tests that are red are fixed like any other TDD item.
5. Unit tests for the triage script with a fixture log (including a record that contains a fake phone/token to prove it is dropped).
6. Docs: README section "How live failures are fixed" (one paragraph).
Acceptance: with the fixture log, api:triage creates the expected test files and promotions, then a second run reports NO NEW FAILURES; no secret ever appears in api-log or generated files.
```


---

## Phase 11 — Design-driven implementation (closes gaps G-01 … G-18)

**Source of truth:** `docs/product/DESIGN.md` (architecture §2, API binding map §3, room state machine §4, realtime §5, crawler §6, error model §7, gap list §8) + `docs/product/PRD.md` + `features/*.feature`. Each task names the gaps it closes; when a gap is closed, change its row in DESIGN.md §8 to "Closed in <commit>". TDD and the rules in `.cursor/rules/clubbox.mdc` apply. Task 10.3 is superseded by 11.2–11.4 (keep its acceptance criteria).

### Task 11.0 — Bundle crawler (G-17)

```
Implement DESIGN §6 in the main process (electron/bundleCrawler.cjs), reusing electron/bundleScan.cjs.
1. Read the Next.js build id from the already-loaded clubhouse.com page (or fetch / once), fetch /_next/static/<buildId>/_buildManifest.js, then every chunk it lists. Max 1 request/second, User-Agent of the sign-in window, abort after 200 chunks, cache by build id in userData/bundle-cache/.
2. Extract per chunk: web_api call sites (name, method, body keys, query keys), PubNub channel name templates and message type strings, Agora createClient options, env key names (NEXT_PUBLIC_*), and the values of NEXT_PUBLIC_AGORA_KEY and the PubNub subscribe/publish keys (values go ONLY to userData/realtime-config.json, never to docs, logs or git).
3. Merge into api-captures/bundle-callsites.json; api:docs regenerates docs/api/bundle-callsites.md and realtime.md; routes with body keys get evidence "bundle" (never downgrade "observed").
4. Triggers: after sign-in when the build id differs from the cached one; `npm run api:discover` (runs Electron headless-free with the existing session, or prints "sign in once first").
5. Unit tests on fixture chunks: call-site extraction, PubNub template extraction, secret values never written outside realtime-config.json (assert with outputHasLeak on all generated files).
Acceptance: after one run, bundle-callsites.md documents bodies for get_conversation, add_conversation_segment, create_conversation, get_social_club*, get_replay_channel, plus PubNub channel templates — or states precisely which were not found.
```

### Task 11.1 — Endpoint registry and SandboxTransport (G-14, part of G-15)

```
DESIGN D1 + D2.
1. src/api/registry.ts: one typed entry per endpoint {name, path, method, evidence, mutation, buildRequest(params) (validates required keys), map(json) → domain type}. Generate path/method/evidence/mutation from electron/webApiRoutes.json; request/response code lives in the registry.
2. ApiClient.call(name, params): canCall → breaker/backoff → Transport → map. Keep the existing public methods as thin wrappers for now; delete them in 11.2.
3. Transports: WebSessionTransport (IPC ch:request), SandboxTransport (answers by endpoint name from sandboxData.ts — move every sandbox* method and if(useSandbox) branch into it), FakeTransport (tests, already from 10.1).
4. Contract tests now iterate the registry.
Acceptance: grep -n "useSandbox" src/api/client.ts returns at most the transport selection; all sandbox* public methods are gone; npm test green.
```

### Task 11.2 — RoomSession state machine + controllers (G-15, G-03 partial)

```
DESIGN §4 and D5.
1. src/domain/roomSession.ts: pure next(state, event) → {state, effects}. States: Idle, Joining, Listening, HandRaised, Invited, Speaking, Hosting, Leaving. Events: CREATE_OK, JOIN_OK, JOIN_FAIL, RAISE, LOWER, INVITED, ACCEPT, DECLINE, ROLE_CHANGED, LEAVE, ENDED, AUTH_EXPIRED, TICK. Effects: agoraJoin/role/leave, pubnubSubscribe/unsubscribe, ping start/stop, recording stop/save, api calls.
   Exhaustive unit tests (table-driven) for every transition, including stale generation handling (existing guards.ts logic moves here).
2. Effect runner in src/app/roomCtl.ts executes effects via ApiClient, AgoraFacade, RealtimeHub, AudioEngine.
3. Split main.ts into src/app/{hallwayCtl,roomCtl,messagesCtl,profileCtl,activityCtl,studioCtl,settingsCtl}.ts; ClubboxApp becomes a thin shell (state store + router + render loop). Views stay pure.
4. room_listener.feature and room_host.feature run against RoomSession + FakeTransport.
Acceptance: main.ts < 600 lines; all room scenarios that do not need realtime are green.
```

### Task 11.3 — Room API bindings (G-01, G-02, G-04, G-08, G-10 room part, G-11)

```
Using the registry:
1. Composer driven by get_create_channel_targets: privacy options = channel_capabilities keys (public, social, friend_of_friend, friend, closed; club only when the crawler found the club id key), defaults from channel_chat_default_on / is_replay_available / handraise_queue_default; per-type toggles shown only when available. Remove capturedCreateBody's single-combo restriction: build {topic, privacy_level, is_public_room, is_private, is_social_mode, is_replay_enabled, is_chat_enabled, user_ids, topic_ids, source:14} for any allowed choice. Contract test per privacy type.
2. join_channel / leave_channel / active_ping / audience_reply / become_speaker / send_channel_message / get_channel_messages / emoji_reaction / set_channel_title as bundle routes.
3. Community (experimental): reject_speaker_invite, invite_speaker, uninvite_speaker, mute_speaker (+ "Mute everyone" = loop excluding me, 1 request/300 ms), make_moderator, block_from_channel, change_handraise_settings, end_channel {channel, channel_id}, make_channel_public/social, invite_to_existing_channel.
4. Controls render from user_capabilities in the create/join response (can_end_room, can_mute_speakers, can_remove_speakers, can_edit_handraise_queue, can_edit_room_title, can_disable_room_chat, can_post_to_chat, can_invite, can_speak) AND canCall(); hidden when either is false.
5. Remove @pending from the matching scenarios.
Acceptance: room_host.feature and room_listener.feature (non-realtime scenarios) green; every control maps to exactly one registry entry.
```

### Task 11.4 — Realtime hub: PubNub + Agora (G-03, G-06, G-09)

```
DESIGN §5.
1. Main-process PubNubClient (REST long-poll subscribe with auth = pubnub_token, origin from the response, heartbeat from pubnub_heartbeat_value/interval, timetoken from pubnub_time_token); IPC events to the renderer; reconnect with backoff; stop on room leave and when the window is hidden > 2 min outside a room.
2. Channel names and message types from docs/api/realtime.md (crawler, 11.0). Map known types to RoomSession events (chat, reaction, join/leave, hand raise, invite, role change, room ended). Unknown types → API Health (type + key shape only).
3. ChatStream: PubNub channel_message first; get_channel_messages polling (≥ 15 s, panel open only) when PubNub is unavailable.
4. Agora: app id from userData/realtime-config.json (crawler) with the code constant only as last fallback + API Health warning; honour agora_native_mute (track mute signalling) in addition to the local gain; lazy-load the SDK.
5. "Refresh" button (Ctrl+P) re-subscribes and re-reads chat.
6. FakePubNub in the BDD world; realtime scenarios lose @pending.
Acceptance: all room scenarios green; with a fixture realtime stream the stage updates without polling get_channel; get_channel is removed from RoomSync.
```

### Task 11.5 — Hallway, presence, ping, moderation extras (G-07, G-10 rest, G-18 part)

```
1. hide_channel (community) on room cards; get_online_friends (community) → presence row and "join their room"; ping multi-select picker using get_group_suggested_invites (O) + search, sending invite_to_existing_channel (community).
2. Hallway keyword filters/highlight, friends-first, NSFW toggle (if not done in 10.4).
3. Audience search Ctrl+S (if not done in 10.4).
4. Acceptance scenarios already exist: features/hallway.feature (HAL-3, HAL-4, SO-3) and features/room_moderation.feature (RH-9). Do not rewrite them; remove @pending as you implement.
Acceptance: those scenarios green.
```

### Task 11.6 — Messages live (G-05)

```
1. Thread view live: get_conversation (O) → segments with transcription and reactions; mark_conversation_segment_listened (O) when a voice segment finishes.
2. After 11.0 provides bodies: add_conversation_segment (text and voice), create_conversation (new VM with selected friends), send_conversation_emoji_reaction (fix the 400 with the crawler's body), update_conversation_title, delete_conversation(_segment), get_conversation_unread_summary for the badge.
3. Voice segments recorded from the broadcast bus (mic processing + optional soundboard), max length per crawler/limits.
4. Acceptance scenarios already exist in features/messages.feature; do not rewrite them.
Acceptance: messages.feature green; no sandbox* calls remain in messagesCtl.
```

### Task 11.7 — Houses, events, notifications, replays (G-12)

```
1. Houses (bundle, bodies from 11.0): my houses (get_user_social_clubs), house page (get_social_club), members (get_social_club_members), house chat (get_social_club_messages / thread / send / react / mark read), host a room in a house (create_channel privacy club with the discovered club id key).
2. Events (community get_events): list, notify, .ics export, copy link; start my event from the composer.
3. Notifications (community get_notifications) merged with get_edge_stories in Activity; unread badge from me.has_unread_notifications.
4. Replays (bundle get_replay_channel / _chunk): play saved replays with 1x/1.5x/2x and skip 15 s.
5. Acceptance scenarios already exist in features/houses_events_replays.feature and features/social.feature (SO-5); do not rewrite them.
Acceptance: those scenarios green; PRD catalog rows updated.
```


### Task 11.8 — Traceability gate: no catalog item without a scenario and an owner task

```
Goal: "nothing missing" becomes a failing check instead of a review.
1. scripts/trace.mjs:
   - reads every ID in docs/product/PRD.md catalog tables (ACC-, HAL-, RL-, RH-, ST-, SO-, DX-) with its priority and "Today" value,
   - reads every @ID tag in features/*.feature and whether the scenario is @pending / @deferred,
   - reads gap IDs G-xx in docs/product/DESIGN.md §8 and their status,
   - writes reports/traceability.md (gitignored) with one row per ID: priority, scenarios (done/pending), today, gap rows.
2. Fail (exit 1) when:
   - a P0/P1/P2 item has no scenario (Won't and P3 items may have none),
   - a scenario tags an ID that is not in the PRD,
   - a P0 item still has only @pending scenarios after its release task is marked done in the Status table,
   - a DESIGN gap row is still open while the task named in its "Fix" column is marked done.
3. `npm test` runs trace after BDD (as "test:trace"). Until R1 is done, run it in warn mode (TRACE_MODE=warn) for items of later releases; strict for R1 (PRD §5).
4. Unit test the script with a tiny fixture PRD/feature set.
Acceptance: trace passes in warn mode today and lists every pending item; flipping one R1 scenario to pending makes strict mode fail.
```

### Task 11.9 — Remaining catalog items

```
Implement and un-pend the scenarios for items not covered by 10.x/11.0–11.7:
- account.feature: ACC-1 regression, ACC-2 regression, ACC-4 theme (CSS tokens light/dark/system, persisted), ACC-5 zoom (webContents zoom, Ctrl+= / Ctrl+- / Ctrl+0, persisted), ACC-6 i18n completeness check (a test that every t() key exists in en and tr and no literal UI strings remain in views), ACC-7 one-device warning, ACC-8 desktop notifications (opt-in).
- hallway.feature: HAL-1, HAL-2 regression (room card fields incl. replays/clips/age/counts/copy link), HAL-5 search tabs, HAL-6 saved search columns (≥ 60 s, paused when hidden, persisted).
- room_moderation.feature: RH-6 (capabilities-driven controls, block confirm), RH-8 (chat off / delete message only if the crawler documented the bodies, else hidden), RH-10 visibility, RH-12 pinned link, DX-11 web-listening toggle.
- audio_studio.feature: ST-1, ST-2, ST-3 regression guards; ST-6 clip 5–55 s; ST-7 voice effects (Web Audio: none, radio, deep, robot, echo — preview on monitor only, apply to broadcast); ST-8 global shortcuts for raise hand / accept / decline (extend SHORTCUT_ACTIONS); RL-11 spatial audio (PannerNode per remote uid on the local output only).
- social.feature: SO-1, SO-2, SO-5, RL-9.
- DX items marked P2/P3 in PRD §4.8: implement only when the crawler documented the body; otherwise leave them hidden and keep the scenario @pending with a comment "blocked: no documented body".
Acceptance: every scenario in these files is green or @pending with a written blocker reason; trace (11.8) strict mode passes for P0–P2 items whose blockers are not "no documented body".
```

### Task 11.10 — Electron smoke tests on the real UI (sandbox only)

```
BDD runs on controllers; this catches wiring/render bugs in the real window without touching live Clubhouse.
1. Add Playwright for Electron (dev). tests/e2e/*.spec.ts launch the built app with CLUBBOX_FORCE_SANDBOX=1 and a temp userData dir.
2. Smoke paths: first-run notice → sandbox hallway → join a sandbox room → raise hand → accept invite → play a pad → send chat → leave; open Messages thread; open a profile; change theme and language; open Settings → API Health.
3. Assert: no console errors, no uncaught exceptions, no network request to any host except localhost/file (sandbox), CSP intact, navigation guard blocks an external location change.
4. Also run against the packaged build (npm run dist → launch release/win-unpacked/Clubbox.exe) for: app starts, clip worklet loads (clip-processor path), recorder flag ignored.
5. Script "test:e2e"; include it in the autonomous Definition of Done (not in plain npm test, because it needs a build).
Acceptance: test:e2e green on sandbox and packaged builds.
```
