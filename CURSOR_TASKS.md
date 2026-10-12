# Clubbox — Cursor Task List

Each task below is a self-contained prompt. Paste one task at a time into Cursor (Agent mode), in order. Tasks build on each other, so finish and verify one before starting the next.

_Last reviewed: 2026-10-11. “Uygulandı” means the code is in the tree. “Canlı doğrulandı” means it was exercised against the official Clubhouse web session. This pass is implemented; the live room, hand, invite, and chat capture is still outstanding._

### Next run (owner instruction, 2026-10-12 #8)

Owner added Phase 23 (live room audio / Agora). Run it in order and respect the decision gate:
- [x] 23.1 Remove the DNS workarounds (wrong diagnosis)
- [ ] 23.2 Make the real Agora join result visible
- [ ] 23.3 A/B reference: clubhouse.com room in the same Electron — **STOP after this task and report** (decision gate)
- [ ] then 23.4–23.5 (web path) **or** 23.6–23.8 (native SDK path), as the owner decides from the 23.3 result
- [ ] then Phase 24 (Agora feature completeness) 24.1 → 24.7, on whichever voice path was chosen; 24.1 (broadcast mix) first

### Previous run (owner instruction, 2026-10-12 #7)

Owner added Phase 22 (HAL-9 room type chips). Continue from there:
- [x] Phases 18–21 (see history above)
- [x] Phase 22 — hallway room types (HAL-9): chips, sparse load-more, badges, empty state
- [x] npm test + e2e + light/dark hallway screenshots; PRD HAL-9 Today; commit; stop

### Last autonomous run (2026-10-12 #recheck)

- Done: nothing new — Phase 22 already shipped (`6bb38ce`); triage clean; no Phase 23 in CURSOR_TASKS.
- Blocked / deferred: ST-9 Restream (`@pending @deferred`) until you schedule it.
- Questions for the owner: schedule ST-9, or add the next phase to CURSOR_TASKS.md.

### Questions for the owner

- **ACC-1 wording:** Sign-in is now a visible Clubhouse `/signin` surface embedded in the main window (BrowserView), not a separate BrowserWindow. Should `features/account.feature` ACC-1 say “visible Clubhouse sign-in surface” instead of “visible window”? (Feature file not edited by the agent.)


## Status

Legend: **Uygulandı** = code is in the tree. **Canlı doğrulandı** = exercised against a real clubhouse.com session and present in docs/api. Nothing is "Canlı doğrulandı" yet except sign-in, home feed and `me`.

| Order | Task | Status |
| --- | --- | --- |
| 0a | **Phase 23 Live room audio (Agora)** — DNS -105 is a red herring; real join error not yet visible; web vs native SDK decision gate at 23.3 | In progress — 23.1 done on `phase-23-24-agora`; next 23.2 |
| 0b | **Phase 24 Agora feature completeness** — broadcast mix (soundboard/music/effects not sent today), reconnect + quality, token lifecycle, device hot-swap, speaking rings, lifecycle, AI noise suppression | Open — after Phase 23 |
| 1 | **0.7 Review fixes (2026-10-11 #2)** — navigation guard, packaged recorder, clip worklet path, auto-armed clip buffer, 429/visibility, CORS proxy token leak | Uygulandı |
| 1b | **0.8 Followers / following / friends lists** — bundle scan + labeled UI hunt; live UI uses only counts + mutual lists | Uygulandı for counts, mutual names, and chat people. The public web bundle does not contain get_followers, get_following, or get_online_friends. get_friend_zone_match and get_social_club_members are in-bundle and not called. The labeled click-through still needs a signed-in session. |
| 0 | **Autonomous plan** (see `.cursor/rules/clubbox.mdc`): 10.1 → 11.8 (warn mode) → 10.2 → 10.5 → 11.0 → 11.1 → 11.2 → 11.3 → 11.4 → 10.4 → 11.5 → 11.6 → 11.7 → 11.9 → 11.10 → 11.8 (strict). Acceptance files: account, hallway, room_listener, room_realtime, room_host, room_moderation, audio_studio, studio, social, messages, houses_events_replays, api_health. Requirements: `docs/product/PRD.md`; design + gap list G-01…G-18: `docs/product/DESIGN.md`; acceptance: `features/*.feature` | **Idle** — Phases 12–**22** done. Only ST-9 Restream remains `@deferred`. |
| — | **10.1** / **10.2** / **10.4** / **10.5** / **11.0** / **11.8 (warn)** | Uygulandı |
| 1c | **0.9 / 12.2 Verified by use** — request log + in-app triage (no recorder) | Uygulandı. Verified by use: endpoints the owner exercises become `observed` via userData `api-log` + startup triage / `npm run api:triage` (list grows with normal use). |
| 2 | **0.6 Community Guidelines risk** — hidden reCAPTCHA sign-in, polling, recording, distribution | Uygulandı (code). Sign-in is a visible clubhouse.com window, polling pauses when the window is hidden, recording is opt-in, and there is no publish config. A public release is still your decision. |
| 3 | **0.5 Capture gaps** — labeled sessions, two-party protocol, evidence sync, room smoke test | `create_channel` observed (FoF, chat/replays off). Join/leave/active_ping/chat promoted to **observed** via triage. Further promotions: Verified by use (12.2), not capture-first. |
| — | 0.1–0.4 Rename, mock data, recorder, web-session regressions | Uygulandı |
| — | 1–4 Audio, live API, identity, UI wiring | Uygulandı; live room parts not verified |
| — | 5 / 7 Security and review bugs | Uygulandı; see 0.7 for what is still open |
| — | 8 Clubhouse parity | Uygulandı for captured fields only. Help Center copy applied for audiences, Messages (VM/House + archive), replays-default note, and local-vs-Clubhouse Clips. Pinned link + hand-raise at create are wired (`create_channel` body). Moderator chat segment delete has no body in the web client (`delete_conversation_segment` stays unsupported). |
| — | 9 Studio features (devices, soundboard, global shortcuts, packaging) | Uygulandı (packaging + updater: see 0.6 step 5) |

## Project context (include with every task)

```
Project: Clubbox (formerly "Clubdeck Next-Gen") — unofficial Clubhouse desktop studio. Not affiliated with Clubhouse or with the separate clubdeck.app product. Personal, non-commercial use until the owner decides otherwise (see Task 0.6).
Stack: Electron 44, Vite 8, TypeScript 6, vanilla DOM (no framework), agora-rtc-sdk-ng 4.x, Web Audio API, electron-builder. Tests: npm test (= test:unit + test:bdd). Lint: npm run lint.
Key files:
  - src/app/clubboxApp.ts + src/app/*Ctl.ts — app controller (shell + controllers); chrome in shellChrome.ts
  - src/ui/views/*.ts, src/ui/components/*.ts — render functions; src/ui/html.ts (html`` escaping, safeUrl), src/ui/avatar.ts
  - src/i18n/{en,tr}.ts         — all user-facing strings
  - src/api/client.ts           — ClubhouseApiClient: transports sandbox | web-session | mobile-token, parseLiveResponse, sandbox handler
  - src/api/capabilities.ts     — canCall(endpoint, transport): evidence gating from electron/webApiRoutes.json
  - src/api/guards.ts           — pure helpers (room session generations, failure classification) + tests/
  - src/api/roomSync.ts         — polls get_channel (only where supported); RoomUpdateSource boundary for PubNub
  - src/api/sandboxData.ts      — all mock data (sandbox only)
  - src/audio/audioEngine.ts    — Web Audio graph, recorder, clip worklet (public/clip-processor.js), soundboard
  - src/audio/agoraVoice.ts     — Agora live client, host/audience roles, custom broadcast track
  - electron/main.cjs — windows, IPC, bundle crawl → userData/realtime-config.json only (api:discover writes project artifacts), PubNub, api-log
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


Completed phases 0–17 live in [docs/history/cursor-tasks-0-17.md](docs/history/cursor-tasks-0-17.md).

## Phase 18 — Room-centred controls (NAVIGATION.md §4, v2.1)

Owner review 2026-10-12: Soundboard is a sidebar place although pads only matter in a room; voice effect and spatial audio sit in Settings; Music mode, Mute everyone and the chat toggle each exist twice; the stage page carries a moderator toolbar, a reactions row and a GIF field. Acceptance: `features/room_controls.feature` (all @pending) + NAV-1 and NAV-9 (re-pended: four places, no Soundboard badge). Prefer moving and deleting code over adding.

### Task 18.1 — Room bar and Sounds panel (RH-15, ST-3)

```
1. Room bar order: ● room title (→ room page) · Mic · Hand · Reactions · Sounds · Record/Clip · Chat · Details · Leave. Remove Music Mode and Hear myself from the bar.
2. Reactions = popover with the free emoji reactions and the GIF input (moved from the stage page).
3. Sounds = panel with all pads (+ hotkeys), soundpad volume, Stop all, Duck — the play part of today's Soundboard page. Hotkeys 1–9 only fire while in a room as a speaker.
4. Remove the Soundboard sidebar place and its page.
```

### Task 18.2 — Room details holds audio and moderation (RH-13, RH-15)

```
1. Room details sections: About (replay status, share) · Audio (quality Normal/High/Music — the only music-mode control —, Hear myself, voice effect, spatial audio) · Moderation (moderators only: rename, visibility, hand raise, invite people, mute everyone, end room) · Audience search.
2. Delete the stage-page moderator toolbar, reactions row and GIF field; Refresh stage stays as Ctrl+P.
3. Each control exactly once (scenario outline in room_controls.feature).
```

### Task 18.3 — Settings › Sounds and settings cleanup (ST-10)

```
1. Settings › Sounds: upload, rename, icon, hotkey, volume, loop, delete, preview (local output only — never into a room).
2. Remove voice effect and spatial audio from Settings (now in Room details › Audio); keep audio devices and the recording permission.
3. NAV-1 / NAV-9: sidebar Hallway, Discover, Messages, Activity; badges only on Messages and Activity.
Acceptance (Phase 18): room_controls.feature and navigation.feature green; npm run test:e2e green with the new room bar; fresh light/dark screenshots of the room page, Sounds panel, Reactions popover, Room details (all sections) and Settings › Sounds.
```

### Task 18.4 — Room bar layout and button bugs (owner screenshot 2026-10-12)

```
Seen in the current (pre-18) room bar at ~1490 px wide, light mode:
- A lone "F" at the left: .room-bar-title shrinks to one character (flex child with no min-width).
- The right side is cut off (the chat button is half visible): .cockpit-bar has a fixed 76 px height, space-between and no overflow strategy; 5 pads + Hear myself + Music Mode do not fit.
- Labels break onto two lines ("Hear myself", "Music Mode", "Bell Ding", "Laugh Track", "Raise Hand"): buttons shrink and have no white-space: nowrap.
- "Raise Hand", "Clip", "REC" are 45 % opacity with no reason shown; Raise Hand is meaningless while I am a speaker.
- Mic cluster stacks "MUTED", the VU meter and a gain slider in a tiny box.
- Top-bar "Start a room": the ➕ emoji ignores the theme and is invisible on the purple button (the SVG icon pass in 15.2 missed it). Same check for every remaining emoji used as a button icon.

Rules for the new room bar (18.1) — enforce them, do not just restyle:
1. Room bar items are compact icon buttons (SVG, currentColor) with the label in a tooltip and aria-label; text labels only from ≥ 1600 px. One line, white-space: nowrap everywhere.
2. Room title: min-width 120 px, max-width 260 px, ellipsis, full title in the tooltip.
3. Never overflow: at widths < 1200 px the less-used items (Record/Clip, Chat ticker) fold into a "⋯" menu. No horizontal scroll, no clipping.
4. Hide what does not apply instead of disabling it: no Hand while I am a speaker; no Clip/Record when the room does not allow them. If a control must stay disabled, show why in its tooltip.
5. Mic: one round button with the VU level as a ring around it and the mute state in the icon; the gain slider moves to Room details › Audio.
6. Replace every emoji used as a button/icon in the top bar, room bar, room details and Start-a-room with the SVG icon set; emoji stay only for user content and soundpad icons.

Tests (write first):
- e2e at 1024, 1280, 1490 and 1920 px, light and dark: for the room bar and the top bar assert scrollWidth <= clientWidth, every button's text is one line (height of label ≤ line-height), the room title shows ≥ 10 characters when the title is longer, and axe colour-contrast passes (disabled controls included).
- A unit/lint check that no `data-action` button template contains an emoji as its only icon (allow-list soundpad icons).
Acceptance: screenshots of the room bar at the four widths in both themes in reports/theme/.

---

## Phase 19 — Profiles: actions, sections and honest lists

Owner review 2026-10-12 + research. Acceptance: `features/profile.feature` (all @pending). Data: the web client's own `parseUserProfile` reads bio, can_dm, can_wave, displayname, follow_status (following / not_following / requested), follows_me, has_protected_profile, instagram, twitter, mutual_follows(+count), mutual_cofollows(+count), num_followers, num_following, num_cofollows, social_clubs, url and chatting_with. Help Center: the friends list is shown on profiles; private profiles hide friends list and houses from non-friends; "recently chatting with" shows the last 5 VM partners. There is no followers/following/friends list endpoint on web and no polls/clips/replays/karma in web profile data.

Today: messaging from a profile only works while in a room (`canMessage: !isSelf && !!this.currentChannel`); "Talk live" exists only in the presence row and is blocked in live mode although create_channel with user_ids is documented; houses, recently chatting, social links and private-profile state are not shown; "+N others" in mutual lines is plain text; count boxes are inert.

### Task 19.1 — Profile actions (SO-8)

```
1. Action row on someone's profile: Message (if can_dm), Talk live (if can_wave), follow control, Share (url). Same component in the side sheet everywhere.
2. Message: open the existing DM (match conversation participants) or create one with create_conversation {privacy_level, social_club_id: null, is_private: true, user_ids: [id], source} using the source value the web client passes (find it at the createConversation call sites in bundle-src and document it in web-client-methods.md Notes). Then navigate to Messages with that conversation open. Keep the in-room private chat as is.
3. Talk live: create_channel with privacy_level "friend" and user_ids [id] (documented keys) — remove the sandbox-only guard in talkLive(); join the created room.
4. Follow control labels from follow_status + follows_me: Follow / Follow back / Following / Friends / Requested (has_protected_profile → follow sends a request). Unfollow stays non-clickable (not in web client).
```

### Task 19.2 — Profile sections and lists (SO-9, SO-2)

```
1. Sections: Houses (social_clubs → cards → house page), Recently chatting with (chatting_with, max 5 → profile), X / Instagram links (open in the system browser through the allow-listed shell.openExternal), "In a room now · Join" when the person is in a hallway room's users.
2. Mutual friends / mutual follows: the label is a button that opens a people list (sub-page with ← back) showing the returned people; add "and N more not shown by Clubhouse web" when count > returned.
3. Followers / following / friends counts: clicking shows one clear message "Clubhouse web does not provide this list" (no empty page, no disabled-looking box).
4. Private profile (has_protected_profile and not friends): show "Private profile", hide houses and recently chatting, follow control = Request.
5. My profile: counts, bio, my houses via get_user_social_clubs, recently chatting, share, account settings. Do not show polls, clips, replays, karma, earnings (not in web data).
Acceptance (Phase 19): profile.feature green; e2e opens a profile sheet and my profile in light and dark mode; screenshots in reports/theme/.
```

---

## Phase 20 — External audio into the room (ST-11)

Clubdeck tells users to install Loopback / BlackHole / VB-Audio Cable / Voicemeeter to mix voice + external audio. Clubbox owns the broadcast mix (mic + pads → broadcastDest; remote audio → recording), so it can add a second source natively. Today it opens one input only (`audioEngine.inputDeviceId`). Acceptance: `features/external_audio.feature` (all @pending). TDD: unit-test the audio graph routing first.

### Task 20.1 — External input channel

```
1. AudioEngine: an "external" channel — getUserMedia({ deviceId: chosen, echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:2 }) → externalGain → broadcastDest and recordMix; → monitorGain only when "Monitor external" is on. Independent of mic mute.
2. Own volume, mute and level meter (AnalyserNode). Release the stream on leaving the room / becoming a listener; re-offer when speaking again. Persist the chosen device id in audioPrefs.
3. UI: Room details › Audio gets "External audio" (device select — every audioinput except the current mic —, volume, mute, Monitor external, Duck under voice). Show it only while I am a speaker.
4. Starting external audio while quality is Normal offers Music quality (existing headphones warning).
5. One-time copyright reminder (i18n en + tr).
```

### Task 20.2 — Auto-duck and system audio

```
1. Duck under voice: when the mic level (existing analyser) is above the voice threshold, ramp externalGain down by the duck amount (default -12 dB, setting 0…-24 dB) with ~80 ms attack and ~500 ms release. Pure function for the envelope + unit tests.
2. System audio (Windows, beta): session.setDisplayMediaRequestHandler in main.cjs granting { audio: 'loopback' } for a renderer request from the trusted main window only; the renderer uses getDisplayMedia({ audio: true, video: false-equivalent }) and feeds the same external channel. Echo guard: loopback also captures Clubbox's own playback (the room), so enable "System audio" only when Clubbox's output device (setSinkId) differs from the system default output; otherwise show the reason. macOS: show the virtual-device guide (BlackHole / Loopback) instead, unless Electron's loopback is supported on the running macOS version.
3. Short in-app guide (Settings › Audio › "Using a virtual cable"): choose Voicemeeter / VB-Cable / BlackHole output as External audio — no need to replace the mic.
Acceptance (Phase 20): external_audio.feature green; unit tests prove the routing (broadcast + recording, no monitor by default, mic mute independent) and the duck envelope; e2e (sandbox) shows the External audio section for a speaker in light and dark mode.
```

---

## Phase 21 — Live reliability (owner review 2026-10-12, from the real request log)

Good news from `<userData>/api-log`: live use works — join_channel ×4, leave_channel ×3, active_ping ×52, get_channel_messages ×50, send_channel_message ×1, all 200, and the routes were promoted to observed. But the log also shows that **realtime never ran** in the owner's sessions. Fix these before Phase 20.

### Task 21.1 — Crawler must run for already signed-in users, and must not write into the app

```
Evidence: <userData>/realtime-config.json and <userData>/bundle-cache are missing on the owner's machine. scheduleBundleCrawl() is only called when the official sign-in window navigates away from /signin (electron/main.cjs ~456). A user whose web session is adopted at startup never triggers it → no PubNub subscribe key → no live stage updates.
Also: createBundleCrawler writes api-captures/bundle-callsites.json, api-captures/bundle-discovery.md and electron/webApiRoutes.json under projectRoot — inside app.asar (read-only) in the packaged app, and changing the shipped route table at runtime is wrong.
Do:
1. Run the crawl (cache-aware, extractor-versioned) after every successful adoptWebSession / me at startup and after sign-in; at most once per build id; retry with backoff on failure.
2. Split outputs: runtime (packaged and dev) writes ONLY userData/realtime-config.json (+ bundle-cache). Writing api-captures/* and promoting electron/webApiRoutes.json happens only in dev scripts (npm run api:discover), never from the running app. Guard with app.isPackaged.
3. Test: unit test that startup with an adopted session calls the crawler; unit test that the packaged mode never writes outside userData.
```

### Task 21.2 — Realtime and audio must never fail silently

```
1. clubbox:pubnub-subscribe returns { ok:false } without a reason when the subscribe key is missing (main.cjs ~659); the renderer ignores it. Return a reason; show it in API Health and as the room's "Live updates unavailable — retrying" note; trigger the crawl (21.1) and resubscribe when the key arrives.
2. Task 10.5 item 2 was not done: the request log has zero realtime/audio records. Log (redacted, shape only): PubNub connect/disconnect/error with status, unknown message actions (action + keys), Agora join result (ok / error code), Agora app id source (config / fallback).
3. Settings › Advanced › "Connection status": Web session ✓/✗, Realtime keys ✓/✗ (no values), PubNub connected ✓/✗, Agora joined ✓/✗ for the current room. One glance tells the owner what works.
```

### Task 21.3 — Unread summary bug and housekeeping

```
1. get_conversation_unread_summary returned 400 "Conversation id is required." with an EMPTY body (api-log): a call is made without conversation_id. Add a guard + a failing test that reproduces it; keep the 404 soft-skip.
2. Housekeeping so the autonomous loop stays reliable:
   - CURSOR_TASKS.md is 1,300+ lines. Move phases 0–17 (done) to docs/history/cursor-tasks-0-17.md; keep Status, Project context, Next run, open phases and Questions here.
   - src/app/clubboxApp.ts is back to ~1,930 lines (target was < 600 in Task 11.2): move view-specific handlers into the matching controllers; no behaviour change, tests stay green.
   - Update the Project context block (file list and line counts are stale).
Acceptance (Phase 21): with an already signed-in session, starting the app creates realtime-config.json, the room shows live updates (sandbox + fake PubNub in tests), the request log contains PubNub/Agora records, and Connection status shows all green in a live room.
```

## Phase 22 — Hallway room types (HAL-9, owner report 2026-10-12: "public, friends ve friends of friends odalarını göremiyorum")

```
Context (verified, do not re-investigate):
- Nothing in Clubbox drops rooms by privacy. The cause is the web feed: across 52 captured first pages of get_feed_v3,
  house = 535 rooms (86 %), public = 79 (13 %), friend_of_friend = 10 (1.6 %), friend = 0. Every house room in the
  captures has the tooltip "this room is open to everyone" and is_private: true.
- So a first page has about 10 house rooms, 1–2 public rooms and almost never a friends-of-friends room, and they are
  unlabelled and mixed in, so the owner cannot find them.
- Web bundle enum ChannelPrivacyLevel: dm="dm", friend="friend", friend_of_friend="friend_of_friend", house="house";
  the feed also sends "public". Legacy app types (social, closed) do not exist on web.
- Already done (commit with this phase's spec): src/hallway/hallwayDisplay.ts exports HALLWAY_PRIVACIES, HallwayPrivacy,
  hallwayRoomPrivacy(room), hallwayPrivacyCounts(rooms) and prepareHallwayChannels(channels, prefs, topicKey, privacy).
  Tests: tests/hallwayDisplay.test.ts. Use these; do not add a second classifier.

22.1 State + chips
- Add selectedPrivacy: HallwayPrivacy | null to the app (default null = All). displayedHallwayChannels passes it.
- Above the room list, next to the topic chips, show chips "All N", "Public N", "Friends of friends N", "Friends N",
  "Houses N" from hallwayPrivacyCounts(channelsList). Hide a chip whose count is 0, except the selected one.
  Persist the choice in hallway prefs (localStorage, try/catch as hallwayPrefs already does).
- i18n en + tr: roomTypeAll, roomTypePublic ("Herkese açık"), roomTypeFriendOfFriend ("Arkadaşların arkadaşları"),
  roomTypeFriend ("Arkadaşlar"), roomTypeHouse ("Evler").

22.2 Load more for sparse types
- When a type is selected and fewer than 5 rooms of it are listed and feedNextCursor exists, call loadMoreChannels
  repeatedly until 5 are listed, the cursor ends, or 8 pages total (FEED_MAX_PAGES) are loaded. Respect feedLoadingMore,
  the polling limits rule and the 429 handling (stop on rate-limit). Show "Checked N pages" under the chips.
- Never auto-load when no type is selected.

22.3 Card badge + empty state
- Each room card shows a small badge with the type label (same i18n keys), coloured via existing theme tokens only
  (run test:theme-audit). House rooms keep the house name/photo line; the badge says "House".
- Empty state for a selected type after loading stops:
  friend → "Clubhouse web does not list rooms only for friends. Rooms your friends start for you appear in Activity or as an invite."
  others → "No <type> rooms in the first N pages of the feed right now."

Acceptance: features/hallway.feature @HAL-9 scenarios pass via real functions (remove @pending as each passes) (no shortcut steps), unit tests green,
npm run test:e2e green with a hallway fixture containing all three types, fresh light + dark screenshots of the chips
and a badge, PRD HAL-9 Today column set. Then stop.
```

## Phase 23 — Live room audio (Agora) (owner report 2026-10-12: "join 200 but no audio")

```text
Context (verified 2026-10-12, do not re-investigate — full evidence: docs/history/agora-voice-dns-fix.md):
- The Clubhouse side works: join_channel 200, token + user_profile_id arrive, the user lands on stage.
- Agora never connects: CONNECTING → our own 12 s timeout → LEAVE → cloud proxy mode 5 → NETWORK_ERROR / JOIN_TIMEOUT.
  Agora's actual join verdict (INVALID_TOKEN, INVALID_VENDOR_KEY, UID_BANNED, CAN_NOT_GET_GATEWAY_SERVER, …) has
  never been logged, because our timeout aborts first.
- "Failed to resolve address for 148-153-93-xx.edge.agora.io., errorcode: -105" is NOT the cause. Proven in a plain
  Electron 44 with no app switches: Chromium's P2P layer (services/network/p2p/socket_manager.cc) resolves STUN/TURN
  hosts once per local socket, in that socket's address family. The edge hosts have an A record (148.153.93.25) and
  NO AAAA record, so each IPv6 socket logs -105 (5 IPv6 addresses → exactly 5 errors) while IPv4 succeeds (srflx
  candidate gathered). System DNS, 1.1.1.1 and 8.8.8.8 all resolve the host. Chrome logs the same noise.
- The workarounds built on that wrong diagnosis make things worse: CONNECT_GATEWAY_WITHOUT_DOMAIN makes the SDK open
  wss://<IP>:<port>, which the CSP in index.html (connect-src wss://*.agora.io …) blocks — see <userData>/chromium-net.log.
- History: Clubhouse once closed its channels to WebRTC (web SDK) clients, which is why known desktop clients used the
  native Agora SDK (github.com/seovchinnikov/clubhouse-web). clubhouse.com now ships an Agora web key
  (NEXT_PUBLIC_AGORA_KEY) and join_channel returns is_web_listening_enabled, so the web path may work, at least for
  some rooms. Task 23.3 decides which path we take.
Rules for this phase (in addition to Project context):
- Never log tokens, rtm/pubnub tokens, full app ids, phone numbers or cookies. Log lengths, prefixes (max 4 chars)
  and key names only.
- No DNS switches, host-resolver-rules, DoH changes, network-service sandbox changes, or stdout/stderr monkeypatching.
- No CSP widening (no bare wss: or https: sources).
```

### Task 23.1 — Remove the DNS workarounds

```text
Delete (wrong diagnosis; harmful or no effect):
1. electron/main.cjs
   - app.commandLine 'disable-features' AsyncDns,DnsOverHttps,NetworkServiceSandbox
   - app.commandLine 'enable-features' NetworkServiceInProcess2
   - the app.configureHostResolver({ enableBuiltInResolver:false, secureDnsMode:'off' }) block in whenReady
   - enableChromiumNetLog(), applyAgoraEdgeMaps(), watchChromiumLogFile(), watchStderrForEdgeDnsFailures() and their
     require. Keep an opt-in: when process.env.CLUBBOX_NETLOG === '1', append enable-logging + log-file
     (<userData>/chromium-net.log). Nothing in the app reads that file.
   - KEEP the 'disk-cache-dir' switch (separate, real Windows cache-lock fix).
2. Delete electron/agoraEdgeDns.cjs, electron/agoraEdgeHost.cjs and tests/agoraEdgeHost.test.ts; remove them from any
   test script or package.json list.
3. src/audio/agoraVoice.ts loadSdk(): remove the setParameter block (CONNECT_GATEWAY_WITHOUT_DOMAIN, USE_TURN_IP) and
   the comment that blames DNS. Also remove other comments that call -105 the cause (e.g. at joinWithTimeout).
4. One-time startup migration: delete <userData>/agora-edge-maps.json and <userData>/chromium-net.log if present
   (try/catch, silent when missing). Keep chromium-net.log when CLUBBOX_NETLOG=1.
5. README troubleshooting gets a short "Known log noise" note: -105 for *.edge.agora.io = IPv6 AAAA lookups, harmless.
Acceptance: grep finds no host-resolver-rules / AsyncDns / CONNECT_GATEWAY_WITHOUT_DOMAIN / agoraEdge; tsc, lint,
npm test and npm run build green; the app starts, and sign-in and hallway still work (sandbox e2e green). Commit.
```

### Task 23.2 — Make the real Agora join result visible

```text
src/audio/agoraVoice.ts (audioEngine only if needed):
1. Client listeners, logged through the existing logger + api-log (Task 21.2 shape, kind 'agora'):
   - connection-state-change (cur, prev, reason)
   - exception (code, msg, uid)
   - user-joined / user-left counts (no names)
2. join(): on failure log AgoraRTCError.code, .message and the key names of .data; on success log
   "Joined <channel> uid=<number|string> role=<audience|host> mode=<direct|proxy>".
   Before join, log the shape of the inputs: appId prefix (4 chars) + length + source (config | signin-extract |
   fallback), token length, typeof uid, channel length. Never the values.
3. Timeout: raise JOIN_MS from 12 s to 20 s. When it fires, log the last connection-state reason and the last exception
   BEFORE calling leave(), so the abort is no longer the only thing in the log.
4. Cloud proxy (startProxyServer(5)) only after an Agora error that indicates a network block
   (CAN_NOT_GET_GATEWAY_SERVER, WS_ERR / ws close 1006, NETWORK_ERROR from the gateway). Never after our own timeout,
   and at most once per join attempt. Remove the extra retry loop that re-joins after LEAVE.
5. AgoraRTC.setLogLevel: 1 (INFO) in dev builds or when localStorage 'clubbox.agoraDebug' === '1', else 3.
   Settings › Advanced gets a "Verbose voice log" toggle bound to that key (en + tr strings).
6. Settings › Advanced › Connection status (Task 21.2): the Agora row shows the last join result code, not only ✓/✗.
7. Tests: unit-test the error classification (network-block vs auth vs timeout) as a pure function in a new
   src/audio/agoraErrors.ts; BDD room_listener scenario "voice failure shows its reason" (the sandbox transport
   simulates an Agora error code; the room shows the reason, not a spinner).
Acceptance: in a live room the log holds exactly one "Joined …" line or one AgoraRTCError code per attempt. Commit.
```

### Task 23.3 — A/B reference: does clubhouse.com play this room inside our Electron? (DECISION GATE)

```text
Goal: tell "Electron/network cannot do Agora web" apart from "our join parameters are wrong".
1. Dev-only action (Settings › Advanced; hidden unless dev build or 'clubbox.agoraDebug' = 1):
   "Open current room on clubhouse.com". It opens https://www.clubhouse.com/room/<channel> in a separate BrowserWindow
   on session.defaultSession (same web session), with PAGE_UA, no preload, navigation limited to clubhouse.com
   (reuse isClubhouseHttps and the will-navigate guard), and the media permission allowed only for this window.
2. Passive observation via webContents.debugger (CDP), same pattern as attachSignInAuthDebugger in main.cjs:
   - Network.enable; log Network.webSocketCreated for *.agora.io / *.sd-rtn.com (host + port only).
   - Network.webSocketFrameSent / Received on those sockets: parse JSON. For join frames (or frames that carry
     cname / uid / token keys) log ONLY: key names, appid prefix (4) + length, cname length, typeof uid + digit count,
     token length, sdk version, role. For the received join result log success or the error code.
   - Do not inject scripts into the page. Detach the debugger on close.
3. The owner runs it once, in a room that Clubbox cannot play, and reports (a) whether audio is audible in that window
   and (b) the logged join shape. The agent then writes a table "clubhouse.com vs Clubbox" (appid prefix/len, token
   len, uid type, cname len, role, mode, result) into docs/history/agora-voice-dns-fix.md under a new "A/B" section,
   including is_web_listening_enabled for that room from our join_channel response.
4. STOP. Do not start 23.4+ until the owner picks the path:
   - clubhouse.com plays → web path (23.4, 23.5).
   - clubhouse.com fails too, or Agora answers a vendor/permission error for web → native path (23.6–23.8).
Acceptance: the A/B table exists with real values (shapes only). Commit.
```

### Task 23.4 — Web path: align join parameters with clubhouse.com

```text
Only if 23.3 shows that clubhouse.com plays. Change Clubbox's join to match the reference, row by row:
- App ID: prefer the id extracted from the signed-in clubhouse.com page (extractAgoraAppIdFromSignIn → config) over
  the hard-coded default; drop stale ids; log the source (23.2).
- Token: the RTC join uses join_channel.token (never rtm_token or pubnub_token).
- UID: user_profile_id as a number when the reference uses a number (a string UID does not match a numeric token).
- Channel: join_channel.channel verbatim.
- Client: the same mode/codec/role order as the reference (start as audience; setClientRole('host') after promotion).
Tests: unit-test the join-parameter builder (pure function) against a fixture shaped like the A/B row.
Acceptance: the owner hears audio in the same room in Clubbox; the log shows "Joined …". Commit.
```

### Task 23.5 — Web path: rooms that are not web-listenable

```text
Only if 23.3 shows that rooms with is_web_listening_enabled=false fail on clubhouse.com too.
- Do not call Agora join for such rooms. The room shows "This room can't be listened to on the web" (tr: "Bu oda web
  üzerinden dinlenemiyor"); chat, stage and PubNub keep working.
- Hallway card: a small muted "Web listening off" badge when the feed payload carries the flag; otherwise show the
  notice only inside the room.
- BDD: room_listener scenario for a non-listenable room (sandbox fixture with the flag set to false).
Acceptance: no Agora attempts for flagged rooms in the log; tests green. Commit.
```

### Task 23.6 — Native path: spike on a branch (agora-electron-sdk)

```text
Only if the owner picks the native path. Branch: spike/agora-native. Goal: hear one live room and speak with the mic.
No Web Audio integration yet.
1. Dependency: agora-electron-sdk (v4.x). Check for a prebuilt addon for our Electron (44.x, win x64); if there is
   none, set prebuilt=false and build locally (document the toolchain in README: VS 2022 C++ build tools, Python).
   If the addon cannot load in Electron 44 at all, STOP and report the exact error. Do not downgrade Electron on your own.
2. Process model (security): the addon needs Node in a renderer. Do NOT enable nodeIntegration in the main window.
   Create a hidden "voice host" BrowserWindow (show:false) that loads ONLY a local file (dist/voice-host.html), with
   nodeIntegration:true, contextIsolation:false, webSecurity:true, a strict CSP (default-src 'self'), all navigation
   and window.open denied, and never any remote content. The main window talks to it over a MessageChannelMain pair
   brokered by main.cjs (one port per side); accept only validated message types.
3. Voice host protocol (shared TypeScript types in src/audio/voiceProtocol.ts):
   commands: join {appId, channel, token, uid, role}, leave, setRole, muteLocal, setRemoteVolume {uid, vol},
   setDevices {input, output};
   events: joined {uid}, error {code, msg}, connectionState {state, reason}, userJoined / userOffline {uid},
   remoteAudioState {uid, muted}, volumes [{uid, level}].
4. Engine calls (these are the v4 names; verify them against the installed typings):
   createAgoraRtcEngine(); initialize({ appId, channelProfile: LiveBroadcasting });
   registerEventHandler({ onJoinChannelSuccess, onError, onConnectionStateChanged, onUserJoined, onUserOffline,
   onRemoteAudioStateChanged, onAudioVolumeIndication }); enableAudio(); enableAudioVolumeIndication(200, 3, true);
   setClientRole(Audience | Broadcaster); joinChannel(token, channel, uid, { clientRoleType, publishMicrophoneTrack });
   leaveChannel(); release() on app quit.
5. Use the same token/appId/uid/channel as the web path (from the join_channel response). Log shapes only (23.2 rules).
Acceptance (spike): the owner hears a live room and is heard after promotion; join result codes are visible; a short
SPIKE.md on the branch lists what worked, the addon size, the startup cost and the open problems. STOP for owner review.
```

### Task 23.7 — Native path: VoiceTransport abstraction + full parity

```text
After the owner approves the spike.
1. Add src/audio/voiceTransport.ts: interface VoiceTransport { join, leave, promote, demote, setMuted,
   onVolumeLevels, onRemoteMute, onConnectionProblem, isJoined, isSpeaker, currentChannel }. agoraVoice becomes a thin
   facade that delegates to WebVoiceTransport (today's agora-rtc-sdk-ng code, moved) or NativeVoiceTransport (the voice
   host). Controllers (roomCtl, studioCtl, settingsCtl) keep calling agoraVoice; no call-site changes beyond imports.
   Selection: Settings › Advanced "Voice engine: Web | Native" (default Native once 23.8 passes); sandbox keeps a fake
   transport.
2. Remote audio into the Web Audio graph (recording, per-user volume, spatial audio, meters): use the native audio
   frame observer (onPlaybackAudioFrameBeforeMixing, per uid, 48 kHz, 10 ms frames); stream PCM to the main window over
   the MessagePort as transferable ArrayBuffers; feed an AudioWorklet (public/remote-pcm-processor.js, ~100 ms ring
   buffer, drop on overflow) through a new audioEngine.addRemotePcmSource(uid) that returns a node. Silence native
   playout (e.g. adjustPlaybackSignalVolume(0)) so audio is not heard twice.
3. Local broadcast (effects, soundpad, music mode, external input): capture audioEngine's broadcast mix with an
   AudioWorklet (public/broadcast-pcm-processor.js) → 10 ms PCM frames → voice host → external/custom audio source
   (pushAudioFrame in the v4 media engine; publish the custom audio track instead of the microphone track). Mic capture
   stays in Web Audio (device selection, effects); the native engine must not open the mic itself.
4. Remote mute badges from onRemoteAudioStateChanged / onUserMuteAudio; volumes from onAudioVolumeIndication.
5. Latency budget: at most 150 ms added on the remote path; log underruns/overruns per minute (shape only).
6. Tests: unit-test the PCM ring buffer and frame chunking (pure TS); BDD audio_studio and room_listener scenarios run
   against the fake transport; existing tests stay green.
Acceptance: every room/studio feature works on Native exactly as on Web (record a room, per-user volume, effects heard
by others, soundpad, external input); no double audio; under 10 % CPU on the owner's machine while listening.
Commit per sub-step.
```

### Task 23.8 — Native path: packaging and release

```text
1. electron-builder: asarUnpack the agora addon and its DLLs (node_modules/agora-electron-sdk/**/*.node, **/*.dll);
   add voice-host.html and its bundle to files. Keep the web SDK chunk while the Web engine exists.
2. npm run dist:dir, then test:e2e:packaged covers: the app starts, the voice host window loads the addon, a sandbox
   room works.
3. Record the installer size before/after in README. Windows x64 first; macOS only after a separate owner decision.
4. Crash safety: if the addon fails to load, fall back to the Web engine automatically and show a one-line notice.
Acceptance: the packaged app plays a live room with the Native engine on a clean Windows user account. Commit.
```

## Phase 24 — Agora feature completeness (owner review 2026-10-12: "agora implementasyonu eksik")

```text
Context: Phase 23 only makes the voice connection work. This phase covers what Agora gives us once connected.
Gap analysis of src/audio/agoraVoice.ts (2026-10-12, 429 lines):
- Present: join/leave, audience↔host, createMicrophoneAudioTrack publish (AEC/ANS/AGC, music profile), local mute,
  remote mute (user-published/unpublished, user-info-updated), volume-indicator, connection-state + exception logging.
- Missing or broken:
  1. Only the raw mic is published. Soundboard, music mode, external input (Phase 20) and voice effects never reach the
     room — features/room_host.feature "the broadcast mix sent to Agora contains the soundboard signal" is not met.
  2. No token lifecycle (token-privilege-will-expire / did-expire): long rooms drop silently.
  3. No reconnect strategy and no quality signal (network-quality, RECONNECTING, getRTCStats / remote audio stats).
  4. No device hot-swap (AgoraRTC.onMicrophoneChanged / onPlaybackDeviceChanged, track.setDevice).
  5. Speaking rings use volume-indicator, which fires only every ~2 s — too slow for "who is talking".
  6. No lifecycle hygiene: leave on quit / sleep, rejoin on resume.
  7. No noise suppression beyond the browser's ANS.
Order: run after 23.4 (web path). If the owner picked the native path, do each task against NativeVoiceTransport
(23.7); each task names the native equivalent. Same logging rules as Phase 23 (shapes only, no tokens or app ids).
```

### Task 24.1 — Publish the whole broadcast mix, not only the mic

```text
1. Keep createMicrophoneAudioTrack for the voice (it gives Agora's AEC/ANS/AGC and the "native" mute signalling).
   Publish a SECOND audio track built from audioEngine's broadcast bus WITHOUT the mic: soundboard, music bed,
   voice-note playback, external input (Phase 20). Agora Web publishes several audio tracks and mixes them
   (client.publish([micTrack, mixTrack])). Expose audioEngine.getBroadcastExtrasTrack(): MediaStreamTrack from a
   MediaStreamAudioDestinationNode fed by those sources only.
2. Voice effects: when a broadcast voice effect is active, the processed voice must be what others hear. Do it with
   the SDK's audio processing pipe if available in the installed version (localAudioTrack.pipe(processor)
   .pipe(track.processorDestination)) — otherwise publish the processed voice as the custom track and set the mic track
   to setEnabled(false) while the effect is on. Pick one, document it in a comment.
3. The old comment says custom tracks were "joining + flipping mute badges but remotes heard nothing". Before
   shipping, prove the mix track carries audio: log getLocalAudioStats()[trackId].sendBitrate > 0 and
   sendVolumeLevel > 0 while a soundboard pad plays; AudioContext must be 'running' (resume on first user gesture)
   and use 48 kHz. Add that check to Connection status ("Broadcast extras: sending ✓/✗").
4. Mute semantics: local mute mutes the mic track only; soundboard/music keep playing unless "Mute everything" is used
   (match the existing studio UI; ask the owner if the UI does not define it).
5. Native equivalent: mic via the engine; extras via pushAudioFrame on a custom audio track (23.7 step 3).
Acceptance: a second account (or the owner's phone) in the same room hears voice + a soundboard pad + music mode;
room_host.feature soundboard scenario passes (sandbox: the fake transport asserts two published tracks). Commit.
```

### Task 24.2 — Reconnect and connection quality

```text
1. connection-state-change: RECONNECTING → room banner "Reconnecting…" (en + tr: "Yeniden bağlanılıyor…"),
   CONNECTED clears it. DISCONNECTED with a reason other than LEAVE / UID_BANNED / CHANNEL_BANNED → auto-rejoin with
   backoff (2 s, 5 s, 15 s; max 3), fetching a fresh token through the existing join_channel call (observed route).
   UID_BANNED / CHANNEL_BANNED → leave the room UI with a clear message, no retry.
2. network-quality event (uplink/downlink 0–6): small quality dot in the room bar (theme tokens only) with a tooltip.
3. Connection status (Settings › Advanced): getRTCStats() (RTT, send/recv bitrate, duration) and, per remote speaker,
   getRemoteAudioStats() packet loss + end-to-end delay; refresh every 2 s only while the panel is open and the window
   is visible (polling rule).
4. Cloud proxy: only on CAN_NOT_GET_GATEWAY_SERVER or repeated gateway ws failures (see 23.2); log is-using-cloud-proxy.
5. Native equivalent: onConnectionStateChanged, onNetworkQuality, onRtcStats, onRemoteAudioStats; setCloudProxy.
6. Tests: pure reconnect policy (reason → action, backoff schedule) in src/audio/agoraErrors.ts; BDD room_listener
   "network drop reconnects" with the fake transport.
Acceptance: unplugging the network for 10 s shows the banner and recovers without user action. Commit.
```

### Task 24.3 — Token lifecycle

```text
1. Handle token-privilege-will-expire and token-privilege-did-expire. Log when they fire relative to join (minutes),
   shape only — this is the first evidence of the token lifetime; note it in docs/api/realtime.md.
2. will-expire → get a fresh token from join_channel (the only observed source; do not invent a refresh endpoint) and
   call client.renewToken(token). If join_channel side effects make that unacceptable (check api-log: does a second
   join_channel change speaker status or post a system message?), fall back to a clean leave + join at did-expire,
   preserving role and mute state.
3. Native equivalent: onTokenPrivilegeWillExpire / onRequestToken → renewToken.
Acceptance: a room kept open past the token lifetime keeps audio (or recovers within 5 s); evidence recorded. Commit.
```

### Task 24.4 — Device hot-swap

```text
1. AgoraRTC.onMicrophoneChanged: if the active mic is unplugged, switch to the default via localAudioTrack.setDevice()
   (no unpublish/republish); toast "Microphone changed to <label>". A newly plugged device does not auto-switch.
2. Settings › Audio input change while in a room → setDevice() on the live track, not a republish.
3. AgoraRTC.onPlaybackDeviceChanged: remote audio plays through the Web Audio graph, so route it with
   audioEngine.setOutputDevice (setSinkId); fall back to default when the chosen output disappears.
4. Native equivalent: getAudioDeviceManager().setRecordingDevice / setPlaybackDevice, onAudioDeviceStateChanged.
Acceptance: unplugging a USB mic mid-room keeps the owner audible on the built-in mic within 2 s. Commit.
```

### Task 24.5 — Responsive speaking indicators

```text
1. volume-indicator stays as a fallback, but speaking rings come from per-remote levels sampled every ~150 ms:
   remoteTrack.getVolumeLevel() (or the AnalyserNode audioEngine already has per remote track — prefer one source,
   do not run both). Local speaker: localAudioTrack.getVolumeLevel().
2. Threshold + 300 ms hold so rings do not flicker; update only changed avatars (no full re-render); pause when the
   window is hidden.
3. Native equivalent: enableAudioVolumeIndication(150, 3, true) + onAudioVolumeIndication.
Acceptance: rings follow speech with no visible lag; CPU unchanged within noise. Commit.
```

### Task 24.6 — Lifecycle hygiene

```text
1. Leave the Agora channel on: app before-quit (main → renderer IPC, await leave with a 2 s cap), main window close,
   and powerMonitor 'suspend'. On 'resume', if the room is still open, rejoin with a fresh token (24.2 path).
2. Exactly one client instance; join while joined awaits the previous leave (already partly done — add a test).
3. No ghost users: verify the user disappears from the stage for others after quit (manual check, note in PR).
Acceptance: quitting mid-room removes the owner from the room for others within a few seconds. Commit.
```

### Task 24.7 — Noise suppression option

```text
1. Evaluate agora-extension-ai-denoiser (Agora's web AI noise suppression). Check: package size, WASM loading under our
   CSP (needs 'wasm-unsafe-eval' in script-src only — no other CSP change), license terms for this app.
   If any check fails, STOP and report instead of adding it.
2. If OK: Settings › Audio "AI noise suppression" (off by default), applied via the track processor pipe; disabled
   automatically in music mode.
3. Native equivalent: setAINSMode(true, mode).
Acceptance: toggle works live without republish; music mode bypasses it. Commit.
```

### Out of scope for Phase 24 (document, do not build)

```text
- Agora cloud recording, RTMP push / live streaming (ST-9 Restream), channel media relay: need Clubhouse's App
  Certificate or server-side permissions we do not have. Local recording through Web Audio already exists.
- Agora RTM: join_channel returns rtm_token, but realtime currently comes from PubNub. Only investigate RTM through a
  capture (does clubhouse.com open an RTM connection in the 23.3 A/B window?) — never invent RTM usage.
- Channel encryption: if the 23.3 capture shows clubhouse.com calling setEncryptionConfig, that becomes a Phase 23.4
  item (join would succeed but audio would be silent without it).
```
