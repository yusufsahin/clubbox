# Task 27.5 — Host tools via a one-time SMS mobile token

Owner decision 2026-10-12. This answers "Questions for the owner" (A/B): **A**.

## Why

Live canary (commit 53f7e1e, `docs/api/mobile-api.md`) used the web session (`sessionid` + `csrftoken`) on
`https://www.clubhouseapi.com/api`:

- `get_profile` returned **200**.
- Every host tool returned **401**: `mute_speaker`, `invite_speaker`, `uninvite_speaker`, `make_moderator`,
  `block_from_channel`, `end_channel`. They only accept `Authorization: Token …`.

The legitimate fix is Clubhouse's own mobile sign-in for the owner's own account: SMS
`start_phone_number_auth` → `complete_phone_number_auth` → token. Clubdeck 2.6.5 works the same way.

- The web session stays as it is, for reads, join, chat and listening.
- The token is added next to it and is used only for host tools and the mobile-only room endpoints
  (Phase 28.1 / 29).
- **The phone app may be signed out** (Clubhouse allows one mobile device). The owner accepts this. Show no
  warning and do not check for it.

## Reuse

- `electron/mobileApi.cjs`:
  - `httpsPostJson` (Node https; undici/session.fetch strip headers);
  - `isAllowedMobileEndpoint`;
  - `callMobileApi`;
  - `mobileAuthHeadersFromCookies`.
- `electron/main.cjs`:
  - IPC `clubbox:mobile-call`;
  - `stripTrunkZeroFromAuthBody`, the Turkish +90 trunk-0 fix. The web form sends +9005…, and the server answers
    success but no SMS ever arrives.
- `electron/mobileProbe.cjs` and `scripts/mobile-probe-28.mjs` (dev probe through second-instance).
- `src/api/capabilities.ts` already lists `start_phone_number_auth` and `complete_phone_number_auth`.

## 27.5.0 — Spike (dev only, inside the running app)

1. Call `start_phone_number_auth {phone_number}`. Normalize TR numbers to `+905xxxxxxxxx`: strip the trunk 0 and
   use 13 characters.
2. Call `complete_phone_number_auth {phone_number, verification_code}`.
   - The owner types the code into an **in-app prompt**. Never take it on the CLI, never log it.
   - Record only the response **keys**. Expect auth_token, user_profile.user_id, and maybe
     access_token / refresh_token.
3. Run one `mute_speaker {channel, user_id:int}` in the owner's throwaway room, against the second test account,
   with these headers:
   - `Authorization: Token <t>`
   - `CH-UserID`
   - `CH-DeviceId`: a random UUID per install, stored in userData
   - `CH-AppVersion` / `CH-AppBuild`
   - `CH-Languages` / `CH-Locale`
   - `User-Agent`
4. If that call returns 401 / 403 / 426, find which headers are required. Take the version and build values from
   a working mobile client and keep them in one config place.
5. If the server demands device attestation or a captcha, **STOP** and report: blocked.
6. Write keys and statuses only to `docs/api/mobile-api.md`.

## 27.5.1 — Token store (main process only)

- Encrypt with `safeStorage.encryptString` and store in `userData/mobile-auth.bin`:
  `{ token, userId, deviceId, refreshToken?, phone }`.
- Never send it to the renderer and never log it.
- The api-log redactor covers `Authorization`, `auth_token`, `access_token`, `refresh_token`, `"Token "` and
  the phone number.
- The token's `user_id` must equal the web `me` user_id. On a mismatch, refuse and delete the file.
- Unlink deletes the file.

## 27.5.2 — Transport

- `callMobileApi` uses the Token when one exists. Otherwise it uses the existing cookie path, which keeps
  get_profile-class reads working.
- On 401:
  - if a refresh_token exists, refresh silently and retry once;
  - otherwise mark the link expired and emit `host-tools-link-needed` to the renderer.
- Keep the allow-list.
- Drop `change_handraise_settings` (404 on mobile) in favour of `update_handraise_queue_setting` (Phase 28.6),
  once discovery proves it.

## 27.5.3 — UX (make it nearly invisible)

- **No settings trip:** the first host action without a token opens an inline sheet: "Enter the code sent to
  your phone". After a successful link, **automatically retry the pending action**; the user does not click again.
- **Prefill the phone number.** Remember it (encrypted with safeStorage, main only) from the web sign-in or the
  first link, and normalize TR numbers. The user only types the 6-digit code. Offer a "Resend code" link.
- **Ask only once.** The token persists across restarts. Ask again only when the refresh truly fails.
- **Room bar badge:** "Host tools: on" / "link needed".
- **Settings › Account:** status and "Unlink" only.
- **No phone sign-out warning** (owner accepts it, 2026-10-12).

## 27.5.4 — Tests

- No token or phone number in logs, api-log or IPC payloads (grep test).
- A user_id mismatch is refused and the file deleted.
- 401 → refresh → retry, and 401 without a refresh token → link-needed event.
- TR normalization: `+9005…`, `05…` and `5…` all become `+905…`.
- The pending action retries after the link.
- The allow-list is unchanged except the handraise swap.
- `npm run test:unit` and `npx tsc --noEmit` are green.

## Acceptance

After the owner links once (one SMS code), the Phase 27.4 live matrix passes in the owner's room with a phone
account: invite to stage, mute, move to audience, make moderator, remove from room, end room. Then Phase 28.1 and
29.0 resume with the Token transport.

## Bookkeeping

- `CURSOR_TASKS.md` › "Questions for the owner": mark the mobile-token item **Answered 2026-10-12: A**, link this
  file, phone sign-out accepted.
- `CURSOR_TASKS.md` › Status row `0e`: "27.5 SMS Token link in progress → see docs/tasks/phase-27.5-host-tools-token.md".
