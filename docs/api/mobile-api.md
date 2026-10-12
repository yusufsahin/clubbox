# Mobile API (host tools)

Phase 27. Clubhouse’s public web client has **no** `/web_api` routes for room moderation
(`end_channel`, `mute_speaker`, `invite_speaker`, `uninvite_speaker`, `block_from_channel`,
`make_moderator`, `change_handraise_settings` — all absent from the bundle; live POSTs → 404).

Clubdeck and community clients call the **mobile** host instead. Clubbox uses that host only
for the allow-list below, from the Electron main process, when the owner uses the UI.

## Base URL

`https://www.clubhouseapi.com/api/<endpoint>`

## Auth that works today (2026-10-12 spike)

Unauthenticated POSTs return `401` with `{"detail":"Authentication credentials were not provided."}`
(so the endpoints exist). A made-up path returns `404`.

**Web session on the mobile host (chosen path):** after Clubhouse web sign-in, POST with:

| Header | Value |
| --- | --- |
| `Cookie` | clubhouse.com cookies from the Electron session |
| `X-CSRFToken` | `csrftoken` cookie value |
| `Origin` / `Referer` | `https://www.clubhouse.com` / `https://www.clubhouse.com/home` |
| `Accept` / `Content-Type` | `application/json` / `application/json; charset=utf-8` |
| `CH-Languages` / `CH-Locale` | `en-US` / `en_US` |
| `User-Agent` | same browser UA as the web session |

Probe (`CLUBBOX_PROBE_MOBILE=1`): read-only `get_profile` + `get_channels` with **cookie+csrf**
returned **HTTP 200** and profile keys. Cookie-only was also tried for comparison.

**Not used:** SMS / `start_phone_number_auth` / stored mobile `Token` (unnecessary once the web
session authenticated). No phone numbers or tokens are stored.

Never log `Cookie`, `X-CSRFToken`, or `Authorization` values.

## Allow-list (IPC `clubbox:mobile-call`)

| Endpoint | Body (community / stypr shapes) |
| --- | --- |
| `end_channel` | `{ channel, channel_id }` (`channel_id` numeric when known) |
| `invite_speaker` | `{ channel, user_id }` |
| `uninvite_speaker` | `{ channel, user_id }` |
| `mute_speaker` | `{ channel, user_id }` |
| `block_from_channel` | `{ channel, user_id }` |
| `make_moderator` | `{ channel, user_id }` |
| `change_handraise_settings` | `{ channel, is_enabled, handraise_permission }` |

Anything else is refused in `electron/mobileApi.cjs`.

## App behaviour

- Evidence: `mobile-spike` in `electron/webApiRoutes.json` (`transport: "mobile"`).
- Callable when the web session is present (`mobileAuthStatus.linked` / `webSession`).
- **Move to audience** = `mute_speaker` then `uninvite_speaker`.
- **End room** = `end_channel`; on success leave locally (`skipServer`).
- **Remove from room** = `block_from_channel` with confirm.

## Live verification

Owner matrix: Task 27.4 in `CURSOR_TASKS.md` (not automated).
