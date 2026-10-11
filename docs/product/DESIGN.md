# Clubbox — Technical Design & Gap Analysis

_Version 1.0 · 2026-10-11 · Companion to `docs/product/PRD.md` (requirements) and `features/*.feature` (acceptance)._

This document describes how Clubbox binds to the Clubhouse web API, what the target architecture is, and which gaps exist in the code today. Every gap has an ID (G-xx) and maps to a task in `CURSOR_TASKS.md` Phase 11.

---

## 1. Constraints

| # | Constraint | Consequence |
| --- | --- | --- |
| C1 | No official API. Sources: captures (O), web bundle call sites (B), community clients (C) | Evidence ladder (PRD §2); endpoint registry carries evidence |
| C2 | Web session only (cookies + csrftoken in Electron's default session) | All calls go through the main-process `ch:request` IPC; no tokens in the renderer |
| C3 | Community Guidelines forbid bots/scripts/browser automation against the service | No scripted live actions, no reCAPTCHA automation, official polling rates |
| C4 | Owner should not be needed in the loop | Discovery from static bundles (§6), self-healing log + triage (Task 10.5), BDD on fakes |
| C5 | One active Clubhouse device at a time (Clubdeck manual) | Tell the user at sign-in that the phone may be signed out |

---

## 2. Target architecture

```
┌──────────── Renderer (Vite, vanilla TS) ─────────────────────────────────────┐
│ Views (src/ui/views/*)  ← render(state) only, no API calls                    │
│        ▲ state                    │ intents (data-action)                     │
│ Controllers (src/app/*)  HallwayCtl · RoomCtl · MessagesCtl · ProfileCtl ·    │
│                          ActivityCtl · StudioCtl · SettingsCtl                │
│        │ use cases                                                            │
│ Domain services (src/domain/*)                                                │
│   RoomSession (state machine §4) · Presence · ChatStream · Reactions ·        │
│   ConversationService · DiscoveryService                                       │
│        │                                                                      │
│ API layer (src/api/*)                                                         │
│   EndpointRegistry ← electron/webApiRoutes.json (path, method, evidence,      │
│                      mutation, request schema, response mapper)               │
│   ApiClient.call(name, params) → guard (canCall, breaker, backoff) →          │
│   Transport (IPC) → mapper → typed result | ApiError                          │
│   RealtimeHub: PubNubClient (via main) + AgoraFacade                          │
│   Sandbox = a Transport implementation (fixtures), not if-branches            │
└───────────────────────────────────────────────────────────────────────────────┘
┌──────────── Main process (Electron) ─────────────────────────────────────────┐
│ ch:request (allowlist from webApiRoutes.json) · pubnub:subscribe/publish IPC  │
│ request log (redacted, Task 10.5) · bundle crawler (§6) · safeStorage         │
└───────────────────────────────────────────────────────────────────────────────┘
```

Key decisions:
- **D1 Endpoint registry as single source.** Every endpoint is declared once: `{name, path, method, evidence, mutation, request: zod-like schema, map: (json) => Domain}`. `ApiClient` has no per-endpoint methods with hand-built bodies; controllers call `api.call('join_channel', {channel})`. Contract tests iterate the registry.
- **D2 Sandbox is a transport.** Remove `if (useSandbox)` branches and `sandbox*` methods from `ClubhouseApiClient`; the sandbox becomes `SandboxTransport` answering the same endpoint names from `sandboxData.ts`. Live and sandbox then run the same code path, which is what the BDD suite exercises.
- **D3 Room lifecycle is a state machine** (§4), not flags spread over `main.ts`.
- **D4 Realtime first, polling as fallback.** PubNub drives stage/chat/reactions; polling only when PubNub is unavailable, at ≥ 15 s.
- **D5 Split `main.ts` (~2,300 lines)** into controllers; views stay pure render functions.

---

## 3. API binding map

Legend — Evidence: O observed · B bundle call site · C community · ? to discover (§6). Status today: ✅ wired live · 🟡 wired but blocked/partial · 🧪 sandbox only · ❌ none.

### 3.1 Session & profile

| Endpoint | Method | Request | Response → domain | Evid. | Today | Used by |
| --- | --- | --- | --- | --- | --- | --- |
| me | POST | {} | user_profile, pubnub_token, pubnub_origin, feature_flags, user_settings, has_unread_notifications, default_room_title_options | O | ✅ | Session, Realtime |
| get_profile | POST | user_id | profile counts, mutual_follows[], mutual_cofollows[], social_clubs[], follows_me, chatting_with | O | ✅ | ProfileCtl |
| follow | POST | user_id (+ source, user_ids, source_topic_id per C) | ack | B/C | 🟡 | ProfileCtl |
| unfollow | POST | user_id | ack | C | 🟡 | ProfileCtl |
| search | POST | query, limit_to_object_types | hits (users/rooms/clubs) | O | ✅ | Discovery |

### 3.2 Hallway & discovery

| Endpoint | Method | Request | Response → domain | Evid. | Today | Used by |
| --- | --- | --- | --- | --- | --- | --- |
| get_feed_v3 | POST | {} then `{ next_cursor }` pages (topic id still uncaptured) | items[].channel, available_topics, next_cursor | O | ✅ paginated (≤8 pages) | HallwayCtl |
| get_create_channel_targets | POST | {} | channel_capabilities per privacy type, clubs[], events[], web_listening_default_on, channel_chat_default_on | O | ✅ drives composer (G-11 closed) | Composer |
| get_edge_stories | GET | – | activities | O | ✅ | ActivityCtl |
| get_group_suggested_invites | POST | {} | suggestions, next_cursor | O | ✅ | Ping picker |
| hide_channel | POST | channel, hide | ack | C | ✅ hallway hide | HallwayCtl |
| get_events | GET | is_filtered, page_size, page | events | C | ✅ experimental Events tab | Events |
| get_notifications | GET | page_size, page | notifications | C | ✅ experimental merge into Activity | ActivityCtl |
| get_online_friends | POST | {} | users + current channel | C | ✅ experimental presence (G-07 closed) | Presence |

### 3.3 Room

| Endpoint | Method | Request | Response → domain | Evid. | Today | Used by |
| --- | --- | --- | --- | --- | --- | --- |
| create_channel | POST | topic, privacy_level, is_public_room, is_private, is_social_mode, is_replay_enabled, is_chat_enabled, user_ids, topic_ids, source (+ club id for house: ?) | full channel incl. token, rtm_token, pubnub_*, users, user_capabilities | O | ✅ any privacy from composer (G-01 closed) | RoomCtl |
| join_channel | POST | channel | channel detail incl. token, pubnub_* (assumed same shape as create) | O | ✅ | RoomCtl |
| leave_channel | POST | channel | ack | O | ✅ | RoomCtl |
| active_ping | POST | channel | ack | O | ✅ | RoomSession |
| audience_reply | POST | channel, raise_hands, unraise_hands | ack | B | 🟡 | RoomCtl |
| become_speaker | POST | channel | ack | B | ✅ registry key `become_speaker` (G-08 closed) | RoomCtl |
| reject_speaker_invite | POST | channel, user_id | ack | C | ✅ decline invite (experimental) | RoomCtl |
| send_channel_message | POST | channel, message | ack | O | ✅ | ChatStream |
| get_channel_messages | GET | channel | messages[] | O | ✅ | ChatStream (fallback) |
| emoji_reaction | POST | channel, emoji | ack | B | ✅ stage reaction pad | Reactions |
| gif_reaction | POST | ? | ack | B (no body) | ❌ | — (P3) |
| set_channel_title | POST | channel, title | ack | B | ✅ rename on stage | RoomCtl |
| invite_speaker / uninvite_speaker / mute_speaker / make_moderator / block_from_channel | POST | channel, user_id | ack | C | 🟡 | RoomCtl (mod) |
| invite_to_existing_channel | POST | channel, user_id | ack | C | ✅ Invite people panel (RH-9) | Ping |
| change_handraise_settings | POST | channel, is_enabled, handraise_permission (1=everyone, 2=friends of speakers) | ack | C | ✅ experimental stage select (RH-7) | RoomCtl (mod) |
| end_channel | POST | channel, channel_id | ack | C | ✅ experimental + capabilities (G-04 closed) | RoomCtl |
| make_channel_public / make_channel_social | POST | channel, channel_id | ack | C | ✅ stage visibility select (RH-10) | RoomCtl (mod) |
| get_channel | POST | channel | channel detail | C (not in web bundle) | ❌ unused on web — PubNub is the room source (G-03 closed) | — |
| get_replay_channel | POST | channel | replay meta (+ audio url when present) | B | ✅ replay player (rate/skip) | Replays |
| get_replay_channel_chunk | POST | ? | audio chunks | in-bundle | ❌ | — |
| web_listener_* , guest_* | POST | session_id, staff_token, recaptcha_token… | — | B | won't do (reCAPTCHA) | — |

### 3.4 Messages (VMs, house chats)

| Endpoint | Method | Request | Response → domain | Evid. | Today | Used by |
| --- | --- | --- | --- | --- | --- | --- |
| get_conversations | POST | is_private_only | conversations[] (permissions, preview, segments_authors) | O | ✅ list | MessagesCtl |
| get_conversation | POST | conversation_id | segments[] (+ transcription, reactions), emoji_reaction_options | O | ✅ live thread via readConversationThread (G-05) | MessagesCtl |
| mark_conversation_segment_listened | POST | conversation_id, segment_id | ack | O | ✅ on voice play | MessagesCtl |
| add_conversation_segment | POST | documented keys in documentedBodies | segment | B | ✅ live send when supported (G-05 closed) | Composer |
| create_conversation | POST | documented keys in documentedBodies | conversation | B | ✅ new VM when supported (G-05 closed) | New VM |
| send_conversation_emoji_reaction | POST | conversation_id, segment_id, emoji | ack | B (400 observed historically) | ✅ thread react pad; failures → API Health | Thread |
| update_conversation_title / delete_conversation / delete_conversation_segment | POST | ? | ack | B (no body) | ❌ | Thread menu |
| get_conversation_unread_summary | POST | ? (live 400: conversation_id required) | counts | B | 🟡 not called for badge until body captured; me.unread_conversations_count | Badge |

### 3.5 Houses

| Endpoint | Method | Request | Evid. | Today |
| --- | --- | --- | --- | --- |
| get_user_social_clubs | POST | ? | B | ✅ Houses tab |
| get_social_club / get_social_club_members | POST | ? | B | ✅ detail + members toast |
| get_social_club_messages / send_social_club_message | POST | social_club_id, social_club_slug (, message) | B | ✅ Houses chat panel |
| get_social_club_message_thread / send threaded/emoji / update_last_read_social_club_message | POST | ? | B/in-bundle | ❌ |

"?" bodies are filled automatically by the bundle crawler (§6) before implementation.

---

## 4. Room lifecycle (state machine)

```
            create_channel ok                       join_channel ok
 Idle ───────────────────────────► Hosting ◄──── Joining ◄──────────── Idle
   ▲                                  │   ▲          │ 4xx/404            
   │ leave/end ok, kicked,            │   │become_   └──► Idle (+API Health)
   │ 401, room ended (PubNub)         ▼   │speaker ok
   └──────────────────────────── Listening ──audience_reply──► HandRaised
                                      ▲                              │
                                      └────── invite declined ◄──────┤
                                                 invited (PubNub) ───┘► Invited ──accept──► Speaking
```

Rules:
- One `RoomSession` object owns: channel id, generation counter, role (audience/speaker/moderator), Agora state, PubNub subscription, ping timer, chat subscription, recording/clip permission.
- Entering a room (create or join) → Agora join with the response token and the app id (§5.2) → PubNub subscribe → ping every 30 s.
- Leaving always: stop ping → PubNub unsubscribe → Agora leave → stop recording (save) → leave_channel (best effort) → Idle. Same path on 401, "room ended" events, or window close.
- Role changes from realtime events or API responses drive Agora `setClientRole` + publish/unpublish; muted by default after promotion.
- Every transition is a pure function `next(state, event) → {state, effects[]}` with unit tests (TDD).

---

## 5. Realtime

### 5.1 PubNub
- Origin `clubhouse.pubnubapi.com` (B). Credentials per user/room from `me` and create/join responses: `pubnub_token`, `pubnub_origin`, `pubnub_heartbeat_value`, `pubnub_heartbeat_interval`, `pubnub_time_token`, `pubnub_enable`.
- Subscribe key: in the web bundle (B, value not in docs). Read it with the Agora key (§5.2).
- Implementation: main-process `PubNubClient` using the PubNub REST subscribe long-poll (`/v2/subscribe/{sub_key}/{channels}/0?auth=…&uuid=…&heartbeat=…&tt=…`) — no SDK in the renderer, no secrets in the renderer. Emits typed events over IPC.
- Channel names: discovered by the bundle crawler from the room chunks (§6); until then, mark the subscriber "community" and log unknown channels/messages to API Health.
- Message types known (B): `channel_message`, `channel_reaction`. Others (join/leave, hand raise, invite, role change, room ended) are mapped when discovered; unknown types are logged as shape only.

### 5.2 Agora
- App id: bundle env `NEXT_PUBLIC_AGORA_KEY` (B). Loaded into `userData/realtime-config.json` via the bundle crawler + IPC `clubbox:agora-app-id` (G-06 closed).
- Token: from create/join response (`token`); `rtm_token` reserved for Agora RTM if the room chunks show RTM usage.
- `agora_native_mute` from the response decides whether mute is signalled through Agora (`setMuted` on the track) instead of only the local gain — G-09.
- SDK lazy-loaded on first room entry.

---

## 6. Discovery without the owner: bundle crawler

Today the recorder only scans scripts the owner's browsing happened to load (1 chunk, homepage). Room pages, houses and replays live in lazy chunks.

Design:
1. Main process fetches `https://www.clubhouse.com/` (already loaded at sign-in), reads the Next.js build id and `/_next/static/<buildId>/_buildManifest.js`, and downloads every listed chunk from `/_next/static/chunks/…` — static code, not user content; once per build id; ≤ 1 request/second; cached in userData.
2. For every chunk: extract `/web_api/<name>` call sites with method and body keys (reuse `electron/bundleScan.cjs`), PubNub channel templates and message `type` strings, Agora `createClient` options and key env names.
3. Output: `api-captures/bundle-callsites.json` (local) → `npm run api:docs` → `docs/api/bundle-callsites.md`, `docs/api/realtime.md`; `webApiRoutes.json` evidence `bundle` for routes with bodies.
4. Runs automatically when the build id changes (Clubhouse deploy) and in `npm run api:discover` for Cursor.
This removes the manual "record a room" step for discovery; captures/logs are still the proof (`observed`).

---

## 7. Error model

| Condition | Classification | Behaviour |
| --- | --- | --- |
| HTTP 200 `success:false` | business | Show `error_message`; no breaker |
| 401 | auth | End session → sign-in |
| 403 | permission | Show message; route stays enabled |
| 404 / 405 | unsupported | Route → unsupported (persisted per app version); control shows "Available in the Clubhouse app" |
| other 4xx ×2 | client | Disable route for session |
| 429 / "high usage" | rate-limit | Backoff 1→30 min |
| 5xx / network / timeout | transient | One retry for reads, none for mutations; message |
All failures → API Health + redacted request log (Task 10.5).

---

## 8. Gap analysis

Severity: **S1** blocks a P0 flow · **S2** wrong/unsafe behaviour · **S3** missing P1/P2 capability · **S4** tech debt.

| ID | Gap | Where | Sev. | Fix (task) |
| --- | --- | --- | --- | --- |
| G-01 | Live `create_channel` only accepts friends-of-friends + replays off + chat off; any other choice throws "Not captured". All body keys are observed — only values vary. | `src/api/roomActions.ts capturedCreateBody` | S1 | Closed in a8c8ad2 — `createComposer` + registry body for all privacy levels; house uses `social_club_id` when clubs[] present |
| G-02 | `join_channel`, `leave_channel`, `active_ping`, `audience_reply`, `become_speaker`, chat send/read are blocked as "configured-unverified" though the bundle gives exact bodies | capabilities / routes | S1 | Closed in 0fcb781 (10.2 evidence `bundle`) |
| G-03 | RoomSync polls `get_channel`, which the web bundle does not contain → stage never updates on web | `src/api/roomSync.ts` | S1 | Closed in 6ba85d9 — PubNub hub + `RealtimeRoomCoordinator`; `get_channel` removed from RoomSync |
| G-04 | `endChannel` throws in live mode; hosts cannot end rooms | `client.ts endChannel` | S1 | Closed in a8c8ad2 — registry `end_channel` + experimental + `user_capabilities.can_end_room` |
| G-05 | Messages: thread, send text/voice, add member, start VM are sandbox-only (`sandboxThread`, `sandboxAppendSegment`, `sandboxStartVm`…); live users see an empty thread | `client.ts`, `messagesCtl.ts` | S1 (R4) / S3 | Closed in Task 11.6 — live `get_conversation`, mark listened, bundle send/react/VM via registry |
| G-06 | Agora app id is a code constant; it must follow the bundle value `NEXT_PUBLIC_AGORA_KEY` per Clubhouse build | `agoraVoice.ts`, `client.ts` | S1 | Closed in 6ba85d9 — `userData/realtime-config.json` via bundle crawl + IPC `clubbox:agora-app-id` |
| G-07 | Presence (online friends, "in a room → join") is sandbox-only | `client.sandboxPresence` | S3 | Closed in Task 11.5 — experimental `get_online_friends` + BDD panel; messages presence row uses live API when on |
| G-08 | `acceptSpeakerInvite` maps to `/web_api/become_speaker` with `{channel}` but the name/route mixes app and web semantics; decline missing | `client.ts`, routes | S2 | Closed in a8c8ad2 — route key `become_speaker` (B) + `reject_speaker_invite` (C) |
| G-09 | Mute is only a local gain ramp; others never see my mute state; `agora_native_mute` ignored | `agoraVoice.setMuted` | S2 | Closed in 6ba85d9 — `agora_native_mute` enables Agora track mute alongside local gain |
| G-10 | No `emoji_reaction`, `set_channel_title`, `change_handraise_settings`, `invite_to_existing_channel`, `hide_channel` | client | S3 | Closed in Task 11.5 — hide on hallway cards; ping multi-select (RH-9) via suggested invites + search |
| G-11 | Composer ignores `get_create_channel_targets` (capabilities, defaults, house targets, events to start) | createModal | S3 | Closed in a8c8ad2 — composer driven by targets; events-to-start still 11.7 |
| G-12 | Houses, events, notifications, replays absent | — | S3 | Closed in Task 11.7 — bundle house/replay/highlight routes + BDD; events/notifications via experimental GET |
| G-13 | Mutation flags wrong for all in-bundle routes | webApiRoutes.json | S2 | Closed in 0fcb781 (10.2) |
| G-14 | Sandbox implemented as if-branches + public `sandbox*` methods in the live client | client.ts (~1,140 lines) | S4 | Closed in 500df0a (11.1) |
| G-15 | `main.ts` ~2,300 lines mixes state, timers, API calls, rendering | main.ts | S4 | Closed in 11.2 — `src/app/*Ctl.ts` + domain `roomSession`; `main.ts` bootstrap only |
| G-16 | No log out | — | S3 | Closed in 66c8c22 (10.3 / ACC-3) |
| G-17 | Discovery depends on the owner browsing; only 1 chunk scanned | recorder | S2 (process) | Closed in aab24e4 (11.0 bundle crawler) |
| G-18 | Clubdeck-level studio features missing: chapters, paste link, audience search, keyword filters, mute everyone, ping multi-select | — | S3 | Closed in Task 11.5 — ping multi-select (RH-9); mute everyone was 11.3 |

---

## 9. Implementation order

1. Phase 10.1 harness → 10.2 evidence/breaker → 10.5 self-healing log.
2. Phase 11 in order 11.0 → 11.7 (see `CURSOR_TASKS.md`).
3. Phase 10.4 studio quick wins can run in parallel after 11.2.
