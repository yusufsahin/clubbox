# Mobile API (host tools + Phase 28 discovery)

Clubhouse’s public web client has **no** `/web_api` routes for room moderation and most
room-management tools. Clubbox calls `https://www.clubhouseapi.com/api/<endpoint>` from the
Electron main process with the **web session** (cookies + CSRF). Never log Cookie / CSRF /
Authorization values.

## Auth (proven 2026-10-12)

| Header | Value |
| --- | --- |
| `Cookie` | clubhouse.com cookies (omit header if empty) |
| `X-CSRFToken` | `csrftoken` cookie (omit if empty) |
| `Origin` | `https://www.clubhouse.com` |
| `Accept` / `Content-Type` | `application/json` / `application/json; charset=utf-8` |
| `CH-Languages` / `CH-Locale` | `en-US` / `en_US` |
| `User-Agent` | same browser UA as the web session |

**Transport:** use Node `https.request` (see `electron/mobileApi.cjs` `httpsPostJson`). Chromium
`session.fetch` and undici `fetch` **strip the Cookie header** (Fetch forbidden header list), so
calls look unauthenticated (`401 Authentication credentials were not provided`) even when
`sessionid` + `csrftoken` are present. Do **not** set `Referer` (also forbidden →
`ERR_BLOCKED_BY_CLIENT`).

### Session cookie canary (2026-10-12, live web session)

Incomplete bodies where noted — used only to classify auth (400 = session accepted, 401 = Token-class).

| Endpoint | Body | Status | Response keys | Meaning |
| --- | --- | --- | --- | --- |
| `get_profile` | `{ user_id }` (from web `/me`) | **200** | `user_profile,chatting_with,finish_profile_setup_upsell,success` | Web session **is** accepted on the mobile host |
| `get_profile` | `{}` | 400 | `success,error_message` | Auth ok; body incomplete |
| `get_channels` | `{}` | 404 | non-json | Not this path on mobile (use web `/web_api`) |
| `mute_speaker` | `{ channel }` (no user_id) | **401** | `detail` | Host tool — **Token-class** (session rejected) |
| `invite_speaker` | `{ channel }` | **401** | `detail` | Same |
| `uninvite_speaker` | `{ channel }` | **401** | `detail` | Same |
| `make_moderator` | `{ channel }` | **401** | `detail` | Same |
| `block_from_channel` | `{ channel }` | **401** | `detail` | Same |
| `end_channel` | `{ channel }` | **401** | `detail` | Same |
| `change_handraise_settings` | `{ channel }` | **404** | non-json | Name/path not on mobile (or gone) |

**Implication:** Phase 27 “web session is enough for host tools” is **false** for the moderation
allow-list. Only `get_profile`-class endpoints accept Django session cookies. Mute / invite / end /
etc. need `Authorization: Token …` (SMS path was skipped). Clubbox host tools will keep failing
until a Token link is allowed or another observed auth path appears.

## Production allow-list (`electron/mobileApi.cjs`)

| Endpoint | Body | Notes |
| --- | --- | --- |
| `get_channel` | `{ channel }` | RoomStateSync (28.1); **401 with web session** — failures silent |
| `end_channel` | `{ channel, channel_id }` | `channel_id` numeric when known — **401 with web session** |
| `invite_speaker` | `{ channel, user_id }` | **401 with web session** |
| `uninvite_speaker` | `{ channel, user_id }` | **401 with web session** |
| `mute_speaker` | `{ channel, user_id }` | **401 with web session** |
| `block_from_channel` | `{ channel, user_id }` | **401 with web session** |
| `make_moderator` | `{ channel, user_id }` | **401 with web session** |
| `change_handraise_settings` | `{ channel, is_enabled, handraise_permission }` | **404** on mobile host (2026-10-12) |
| `reject_speaker_invite` | `{ channel, user_id }` | 28.2; Token-class expected |
| `invite_to_existing_channel` | `{ channel, user_id }` | 28.2 ping panel |
| `hide_channel` | `{ channel, hide }` | 28.2 hallway + room details |
| `save_replay` | `{ channel }` | 28.2; only when `is_replay_enabled` |
| `check_channel_link` | `{ channel, link }` | 28.3; validate before add |
| `add_channel_link` / `remove_channel_link` | `{ channel, link? }` | 28.3 pinned link |
| `enable_channel_messages` / `disable_channel_messages` | `{ channel }` | 28.3 chat on/off |
| `delete_channel_message` | `{ channel, message_id }` | 28.3 moderator delete |
| `disable_replay` | `{ channel }` | 28.3 one-way; `enable_replay` 404 |
| `get_handraise_queue` / `get_suggested_speakers` | `{ channel }` | 28.3 details queue |
| `update_nsfw_status` | `{ channel, is_nsfw }` | 28.3 NSFW flag |

IPC: `clubbox:mobile-call`. Evidence: `mobile-spike` in `webApiRoutes.json` (transport ready; **auth blocked**).

## Phase 28.0 — body discovery (STOP before 28.1)

### Tooling

- Dev allow-list (not production): `electron/mobileProbe.cjs` → `PROBE_MOBILE_ENDPOINTS`
  (includes 28.6: `get_moderator_action_history`, `update_handraise_queue_setting`)
- While Clubbox is running: `node scripts/mobile-probe-28.mjs --channel=<id>` pokes the live
  app via `second-instance` (`--clubbox-mobile-probe=…`) so cookies stay in-memory (`csrftoken`)
- Headless: close Clubbox, then the same script runs `scripts/_mobile-probe-28-electron.cjs`
- Mutations: `--mutate=… --confirm=I_CONFIRM_THROWAY_ROOM` (throwaway room only)
- Report: `reports/mobile-probe-28.json` (status + keys only; cookie **names** / value **lengths**)

### Unauthenticated liveness (empty / documented body, no session)

All Phase 28.0 targets answered **401** `detail=Authentication credentials were not provided.`
(endpoint exists). None returned 404.

### Authenticated discovery (2026-10-12, live sessionid+csrf via Node https)

Channel probed: `xewy04pp`. Same Cookie/CSRF that yields `get_profile` **200**.

| Endpoint | Probe body | Status | Response keys | Notes |
| --- | --- | --- | --- | --- |
| `get_channel` | `{ channel }` | **401** | `detail` | Session auth **rejected** (unlike `get_profile`) |
| `get_handraise_queue` | `{ channel }` (+ page_size retries) | **401** | `detail` | Same |
| `get_suggested_speakers` | `{ channel }` | **401** | `detail` | Same |
| `check_channel_link` | `{ channel, link }` | **401** | `detail` | Same |
| `get_moderator_action_history` | `{ channel }` (+ cursor/page_size) | **401** | `detail` | 28.6 read-only — same |
| `add_channel_link` / `remove_channel_link` / `disable_channel_messages` / `enable_channel_messages` / `update_nsfw_status` / `disable_replay` / `update_handraise_queue_setting` | — | **not run** | | Mutations skipped: read-only already 401 with session |
| `uninvite_speaker` (self) | — | **not run** | | Needs Token path first (28.2) |

### Conclusion for Phase 28.1+

Web session cookies authenticate **some** mobile endpoints (`get_profile`) but **not** the
Phase 28 room/moderation-discovery set (`get_channel`, queues, history, link checks). Those
endpoints behave like Token-only (classic `Authorization: Token …` + `CH-UserID` clients).

**28.1 code path:** RoomStateSync calls `get_channel` on join / after host actions / every 30 s;
failures are silent and PubNub continues. Live roster authority still needs Token (owner Q) or:

1. Owner confirms a working Token/link path (SMS skipped earlier — reopen only if policy allows), or
2. A new capture shows these endpoints accepting the web session under different headers/bodies.

Production host-tool allow-list stays unchanged; transport now uses Node https so Cookie is actually sent.

### Probe findings (tooling)

1. Empty `Cookie` / `X-CSRFToken` → omit (empty headers → `ERR_BLOCKED_BY_CLIENT` on session.fetch).
2. Manual `Referer` → `ERR_BLOCKED_BY_CLIENT`.
3. `session.fetch` / undici strip `Cookie` → false 401; use `httpsPostJson`.
4. Second Electron against the same `userData` while Clubbox runs → cookie DB locked (0 cookies). Prefer second-instance poke.
5. Production allow-list unchanged; probe uses a separate allow-list + typed mutation confirm.

## Phase 29.0 — live-details body discovery (STOP before 29.1)

### Tooling

Extends `electron/mobileProbe.cjs` (dev allow-list only — **not** production IPC):

| Kind | Endpoints |
| --- | --- |
| Read-only | `get_channel_audience`, `get_channel_banner`, `get_channel_user_poll`, `get_highlight` (+ Phase 28 reads) |
| Mutations (confirm `I_CONFIRM_THROWAY_ROOM`) | `set_channel_banner`, `create_channel_user_poll`, `submit_channel_user_poll_vote`, `remove_channel_user_poll`, `create_highlight`, `delete_highlight`, `update_channel_flags` |

CLI (same as 28.0): `node scripts/mobile-probe-28.mjs --channel=<id>` → writes
`reports/mobile-probe-28.json` and `reports/mobile-probe-29.json`. Restart Clubbox after
pulling probe changes so second-instance uses the new endpoint list. Cookie DB is locked
while Clubbox runs — do not use headless Electron against the same userData.

### Unauthenticated liveness (2026-10-12)

`POST { channel: "probe" }` via Node `httpsPostJson`, no cookies. All **401**
`detail=Authentication credentials were not provided.` (endpoint exists). None 404.

| Endpoint | Status |
| --- | --- |
| `get_channel_audience` | 401 |
| `get_channel_banner` | 401 |
| `get_channel_user_poll` | 401 |
| `get_highlight` | 401 |
| `set_channel_banner` | 401 |
| `create_channel_user_poll` | 401 |
| `submit_channel_user_poll_vote` | 401 |
| `remove_channel_user_poll` | 401 |
| `create_highlight` | 401 |
| `delete_highlight` | 401 |
| `update_channel_flags` | 401 |

### Authenticated (web session, same day)

Canary (channel `xewy04pp`, live app cookies via second-instance + Node https):

| Endpoint | Status | Notes |
| --- | --- | --- |
| `get_profile` | **200** | Session accepted |
| `get_channel` / queues / history / link check | **401** | Token-class (same as Phase 28.0) |
| 29.0 read-only set | **not 2xx with session** | Same auth class expected; body shapes still unknown until Token |
| 29.0 mutations | **not run** | Would 401; need Token + throwaway `--confirm=I_CONFIRM_THROWAY_ROOM` |

### Planned bodies (max 3 attempts; from Clubdeck / join fields / error_message)

| Endpoint | Attempts |
| --- | --- |
| `get_channel_audience` | `{channel}` → +`page_size` → +`cursor` (note pagination keys on 2xx) |
| `get_channel_banner` | `{channel}` |
| `get_channel_user_poll` | `{channel}` |
| `get_highlight` | `{channel}` → `{channel,id}` → `{id}` |
| `set_channel_banner` | `{channel,text}` / `banner` / `message` (refine from `error_message`) |
| `create_channel_user_poll` | `{channel, question, options[]}` (string[] then `{text}` objects) |
| `submit_channel_user_poll_vote` | `{channel, option_index}` / `option` / `vote` |
| `remove_channel_user_poll` | `{channel}` / +`channel_user_poll_id` |
| `create_highlight` | `{channel, title}` / `name` / +`start_time` |
| `delete_highlight` | `{channel, id}` / `{id}` / `{channel, highlight_id}` |
| `update_channel_flags` | `{channel, is_web_listening_enabled}` / `is_chat_enabled` / `is_handraise_enabled` |

PubNub side-effects of mutations: watch `pubnub-unknown` in api-log after a Token-auth 2xx (not observed yet).

### Conclusion for Phase 29.1+

Same blocker as Phase 28: web session is enough for `get_profile` only. Audience / banner /
poll / highlight / `update_channel_flags` need Token (or a new observed auth path). Probe
tooling and planned bodies are ready; do not add these to production `ALLOWED_MOBILE_ENDPOINTS`
until a 2xx in the owner's throwaway room.

## App behaviour (Phase 27)

- **Move to audience** = `mute_speaker` then `uninvite_speaker`
- **End room** = `end_channel`; on success leave locally (`skipServer`)
- **Remove from room** = `block_from_channel` with confirm
