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
| `end_channel` | `{ channel, channel_id }` | `channel_id` numeric when known — **401 with web session** |
| `invite_speaker` | `{ channel, user_id }` | **401 with web session** |
| `uninvite_speaker` | `{ channel, user_id }` | **401 with web session** |
| `mute_speaker` | `{ channel, user_id }` | **401 with web session** |
| `block_from_channel` | `{ channel, user_id }` | **401 with web session** |
| `make_moderator` | `{ channel, user_id }` | **401 with web session** |
| `change_handraise_settings` | `{ channel, is_enabled, handraise_permission }` | **404** on mobile host (2026-10-12) |

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

**Do not start 28.1** until either:

1. Owner confirms a working Token/link path (SMS skipped earlier — reopen only if policy allows), or
2. A new capture shows these endpoints accepting the web session under different headers/bodies.

Production host-tool allow-list stays unchanged; transport now uses Node https so Cookie is actually sent.

### Probe findings (tooling)

1. Empty `Cookie` / `X-CSRFToken` → omit (empty headers → `ERR_BLOCKED_BY_CLIENT` on session.fetch).
2. Manual `Referer` → `ERR_BLOCKED_BY_CLIENT`.
3. `session.fetch` / undici strip `Cookie` → false 401; use `httpsPostJson`.
4. Second Electron against the same `userData` while Clubbox runs → cookie DB locked (0 cookies). Prefer second-instance poke.
5. Production allow-list unchanged; probe uses a separate allow-list + typed mutation confirm.

## App behaviour (Phase 27)

- **Move to audience** = `mute_speaker` then `uninvite_speaker`
- **End room** = `end_channel`; on success leave locally (`skipServer`)
- **Remove from room** = `block_from_channel` with confirm
