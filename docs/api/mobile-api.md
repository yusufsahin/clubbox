# Mobile API (host tools + Phase 28 discovery)

Clubhouse’s public web client has **no** `/web_api` routes for room moderation and most
room-management tools. Clubbox calls `https://www.clubhouseapi.com/api/<endpoint>` from the
Electron main process with the **web session** (cookies + CSRF). Never log Cookie / CSRF /
Authorization values.

## Auth (proven 2026-10-12, Phase 27)

| Header | Value |
| --- | --- |
| `Cookie` | clubhouse.com cookies (omit header if empty) |
| `X-CSRFToken` | `csrftoken` cookie (omit if empty) |
| `Origin` | `https://www.clubhouse.com` |
| `Accept` / `Content-Type` | `application/json` / `application/json; charset=utf-8` |
| `CH-Languages` / `CH-Locale` | `en-US` / `en_US` |
| `User-Agent` | same browser UA as the web session |

**Do not set `Referer`.** Chromium `session.fetch` treats `Referer` as a forbidden header and
fails with `net::ERR_BLOCKED_BY_CLIENT` (found during Phase 28.0 probe tooling).

Probe (`CLUBBOX_PROBE_MOBILE=1`): read-only `get_profile` + `get_channels` with cookie+csrf
returned **HTTP 200** (Phase 27). SMS / stored mobile Token not used.

## Production allow-list (`electron/mobileApi.cjs`)

| Endpoint | Body | Notes |
| --- | --- | --- |
| `end_channel` | `{ channel, channel_id }` | `channel_id` numeric when known |
| `invite_speaker` | `{ channel, user_id }` | |
| `uninvite_speaker` | `{ channel, user_id }` | Move to audience = mute then uninvite |
| `mute_speaker` | `{ channel, user_id }` | Host cannot unmute others |
| `block_from_channel` | `{ channel, user_id }` | Confirm in UI |
| `make_moderator` | `{ channel, user_id }` | |
| `change_handraise_settings` | `{ channel, is_enabled, handraise_permission }` | |

IPC: `clubbox:mobile-call`. Evidence: `mobile-spike` in `webApiRoutes.json`.

## Phase 28.0 — body discovery

### Tooling

- Dev allow-list (not production): `electron/mobileProbe.cjs` → `PROBE_MOBILE_ENDPOINTS`
- In-app (restart with env): `$env:CLUBBOX_PROBE_MOBILE=1` then join a room  
  - Auto read-only on `clubbox:room-presence`  
  - DevTools: `await electronAPI.mobileProbeReadOnly()`  
  - Mutations: `await electronAPI.mobileProbeMutate({ endpoint, confirm: 'I_CONFIRM_THROWAY_ROOM', link?, userId? })`
- CLI: `node scripts/mobile-probe-28.mjs --channel=<id>`  
  Mutations: `--mutate=disable_replay --confirm=I_CONFIRM_THROWAY_ROOM` or `--mutate=all`

### Unauthenticated liveness (2026-10-12, empty body / documented body, no session)

All of the following answered **401** `detail=Authentication credentials were not provided.`
(endpoint exists). None returned 404.

| Endpoint | Probe body | Status | Response keys |
| --- | --- | --- | --- |
| `get_channel` | `{ channel }` | 401 | `detail` |
| `get_handraise_queue` | `{ channel }` | 401 | `detail` |
| `get_suggested_speakers` | `{ channel }` | 401 | `detail` |
| `check_channel_link` | `{ channel, link }` | 401 | `detail` |
| `add_channel_link` | `{ channel, link }` | 401 | `detail` |
| `remove_channel_link` | `{ channel }` | 401 | `detail` |
| `disable_channel_messages` | `{ channel }` | 401 | `detail` |
| `enable_channel_messages` | `{ channel }` | 401 | `detail` |
| `update_nsfw_status` | `{ channel, is_nsfw }` | 401 | `detail` |
| `disable_replay` | `{ channel }` | 401 | `detail` |
| `uninvite_speaker` | `{ channel, user_id }` | 401 | `detail` |

### Authenticated discovery (owner session)

**Blocked in this 28.0 run:** Clubbox `userData` had `web-session-ok` but **zero** clubhouse.com
session cookies (only intermittent `__cf_bm`). Authenticated `get_channel` / mutations could not
be completed. Re-sign-in on clubhouse.com, then re-run the in-app or CLI probe.

| Endpoint | Working body | Status | Response keys | Notes |
| --- | --- | --- | --- | --- |
| `get_channel` | `{ channel }` | *pending auth* | | Need `users[0]` keys |
| `get_handraise_queue` | `{ channel }` | *pending auth* | | |
| `get_suggested_speakers` | `{ channel }` | *pending auth* | | |
| `check_channel_link` | `{ channel, link }` | *pending auth* | | `link` = https URL |
| `add_channel_link` | *pending* | | | confirm `I_CONFIRM_THROWAY_ROOM` |
| `remove_channel_link` | *pending* | | | |
| `disable_channel_messages` | *pending* | | | |
| `enable_channel_messages` | *pending* | | | |
| `update_nsfw_status` | *pending* | | | try `is_nsfw` then `nsfw` |
| `disable_replay` | *pending* | | | |
| `uninvite_speaker` (self) | *pending* | | | verify leave-stage for 28.2 |

### Probe findings (tooling)

1. Empty `Cookie` / `X-CSRFToken` headers → `ERR_BLOCKED_BY_CLIENT` (omit when empty).
2. Manual `Referer` header → `ERR_BLOCKED_BY_CLIENT` (omit always for `session.fetch`).
3. Production allow-list unchanged; probe uses a separate allow-list + typed mutation confirm.

## App behaviour (Phase 27)

- **Move to audience** = `mute_speaker` then `uninvite_speaker`
- **End room** = `end_channel`; on success leave locally (`skipServer`)
- **Remove from room** = `block_from_channel` with confirm
