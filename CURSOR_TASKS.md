# Clubbox — Cursor Task List

Each task below is a self-contained prompt. Paste one task at a time into Cursor (Agent mode), in order. Tasks build on each other, so finish and verify one before starting the next.

_Last reviewed: 2026-10-11. “Uygulandı” means the code is in the tree. “Canlı doğrulandı” means it was exercised against the official Clubhouse web session. This pass is implemented; the live room, hand, invite, and chat capture is still outstanding._

### Next run (owner instruction, 2026-10-12 #7)

All checklist items below are done. No open Status-table task remains except ST-9 (deferred).
- [x] 18.1 room bar + Sounds panel + Reactions popover; remove the Soundboard place
- [x] 18.2 Room details: About · Audio · Moderation · Audience search; clean the stage page
- [x] 18.3 Settings › Sounds; remove voice effect / spatial audio from Settings; NAV-1 + NAV-9 (four places)
- [x] 18.4 room bar layout + emoji icons (owner screenshot: lone "F", clipped right side, two-line labels, faded disabled buttons, invisible ➕ on Start a room) — tests at 4 widths first
- [x] npm run test:e2e green + fresh light/dark screenshots (UI phases are only done with both); commit per item; summary; stop
- [x] Phase 19 — profiles: actions (Message any time, Talk live, follow labels, Share) and sections (houses, recently chatting, links, in a room now, mutual lists, private profile)
- [x] Phase 21 — live reliability FIRST after Phase 19: crawler for signed-in users + no writes into the app (21.1), no silent realtime/audio failures + Connection status (21.2), unread-summary 400 + housekeeping (21.3)
- [x] Phase 20 — external audio into the room (second input, system audio on Windows, auto-duck), no virtual cable needed
- [x] api:triage (no new failures); PRD Today column synced for Phases 18–20

### Last autonomous run (2026-10-12 #recheck)

- Done: nothing new — Next run fully ticked; `npm run api:triage` → NO NEW FAILURES; only `@pending` left is ST-9 `@deferred`.
- Blocked / deferred: ST-9 Restream RTMP until you schedule it (will not un-pend without that).
- Questions for the owner: schedule ST-9, or write the next phase into CURSOR_TASKS.md.


## Status

Legend: **Uygulandı** = code is in the tree. **Canlı doğrulandı** = exercised against a real clubhouse.com session and present in docs/api. Nothing is "Canlı doğrulandı" yet except sign-in, home feed and `me`.

| Order | Task | Status |
| --- | --- | --- |
| 1 | **0.7 Review fixes (2026-10-11 #2)** — navigation guard, packaged recorder, clip worklet path, auto-armed clip buffer, 429/visibility, CORS proxy token leak | Uygulandı |
| 1b | **0.8 Followers / following / friends lists** — bundle scan + labeled UI hunt; live UI uses only counts + mutual lists | Uygulandı for counts, mutual names, and chat people. The public web bundle does not contain get_followers, get_following, or get_online_friends. get_friend_zone_match and get_social_club_members are in-bundle and not called. The labeled click-through still needs a signed-in session. |
| 0 | **Autonomous plan** (see `.cursor/rules/clubbox.mdc`): 10.1 → 11.8 (warn mode) → 10.2 → 10.5 → 11.0 → 11.1 → 11.2 → 11.3 → 11.4 → 10.4 → 11.5 → 11.6 → 11.7 → 11.9 → 11.10 → 11.8 (strict). Acceptance files: account, hallway, room_listener, room_realtime, room_host, room_moderation, audio_studio, studio, social, messages, houses_events_replays, api_health. Requirements: `docs/product/PRD.md`; design + gap list G-01…G-18: `docs/product/DESIGN.md`; acceptance: `features/*.feature` | **Idle** — Phases 12–21 done. Only ST-9 Restream remains `@deferred`. |
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
