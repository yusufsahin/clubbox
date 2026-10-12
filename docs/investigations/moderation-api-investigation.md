# Clubbox — Clubhouse Moderation API Investigation

Date: 2026-10-12. Scope: why Clubbox cannot perform moderation actions, and what can be supported legitimately.
Method: read-only analysis of public reference repositories, the Clubbox codebase and logs, the public
clubhouse.com web bundle and the Clubhouse Knowledge Center. Live calls are cited only where they were already
made against the owner's own account (Cursor's canaries) or were unauthenticated existence checks. No tokens, SMS
codes or cookies are reproduced here.

**Legend:** **[V]** = verified fact (source given). **[H]** = hypothesis or inference (reasoning given).

---

## 1. Historical API compatibility matrix (Phase 1)

### Reference repositories

| Repo | State | Moderation coverage |
|---|---|---|
| stypr/clubhouse-py | archived, last push 2023-01-17 | invite_speaker, uninvite_speaker, mute_speaker, make_moderator, block_from_channel, end_channel, change_handraise_settings |
| seovchinnikov/clubhouse-web | archived, last push 2021-06-15 | invite_speaker, uninvite_speaker, make_moderator, block_from_channel; not mute_speaker / end_channel |
| zhuowei/ClubhouseAPI | not archived, last push 2021-02-13 | none of the seven paths (OpenAPI covers auth, channels, profile, social) |
| seia-soto/clubhouse-api | archived, last push 2021-03-14 | none (only room fields such as handraise_permission and agora_native_mute in create/join) |

All four target the **mobile API** `https://www.clubhouseapi.com/api/`. None targets `clubhouse.com/web_api`. **[V]**

### Endpoint behaviour

| Endpoint | Method | Historical body | Historical response | Sources |
|---|---|---|---|---|
| invite_speaker | POST | `{channel, user_id:int}` | `{success, error_message}` | py, web (InviteSpeakerRequest/Response) |
| uninvite_speaker | POST | `{channel, user_id:int}` | `{success, error_message}` | py, web |
| mute_speaker | POST | `{channel, user_id:int}` | JSON (`req.json()`) | py |
| make_moderator | POST | `{channel, user_id:int}` | empty / `{success}` | py, web (EmptyResponse) |
| block_from_channel | POST | `{channel, user_id:int}` | empty / `{success}` | py, web |
| end_channel | POST | `{channel, channel_id?}` | JSON | py |
| change_handraise_settings | POST | `{channel, is_enabled:bool, handraise_permission:int}` | JSON | py |

### Historical authorization (2021–2023) [V]

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Token <auth_token>`, or `Bearer <access_token>` (JWT) | always (zhuowei) |
| `CH-UserID` | the user id | always |
| `CH-DeviceId` | a UUID | always |
| `CH-AppVersion` / `CH-AppBuild` | the app build (e.g. Android 1.0.1 / 3389 in py) | always |
| `User-Agent` | an app string such as `clubhouse/android/<build>` | always |
| `CH-Languages` / `CH-Locale` | language values | always |

- The token comes from `start_phone_number_auth` → `complete_phone_number_auth`.
- clubhouse-web's backend copies the same Token, `CH-UserID` and `CH-DeviceId` headers.
- zhuowei's notes say Clubhouse "aggressively bans new user signups based partially on headers".

### Historical vs current

| Item | Historical | Current |
|---|---|---|
| The six moderation paths except change_handraise_settings | used | **exist** on the mobile host today: unauthenticated POST returns 401 "Authentication credentials were not provided", while a made-up name returns 404 (2026-10-12) **[V]** |
| `change_handraise_settings` | used | **404 on the mobile host today** (Cursor canary, docs/api/mobile-api.md) **[V]**. Today's join responses carry `handraise_queue_setting` / `handraise_queue_options`, and the mobile host answers 401 (exists) for `update_handraise_queue_setting` **[V]**. That it is the successor is **[H]**. |
| Bodies | as above | not re-verified with valid auth (no authorized call was possible) |

---

## 2. Current Clubbox implementation gap analysis (Phase 2)

1. **Authentication and session.** **[V]**
   - Web session: cookies `sessionid` + `csrftoken` live in Electron's main process (`electron/main.cjs`); all
     `/web_api` calls run there.
   - Sign-in uses the visible official clubhouse.com page (DESIGN.md C2/C3).
   - The Phase 27.5 mobile Token store / SMS link UI was removed (Phase 30 step 4); leftover
     `mobile-auth.bin` is purged on launch.
2. **Web vs mobile assumptions.**
   - Earlier assumption "web session is enough for host tools" (Phase 27) — **false**. The web session is accepted
     only by `get_profile`-class mobile views (Cursor canary: `get_profile` 200; moderation 401). **[V]**
   - The early design rule "mobile API off-policy" (PRD.md ~221) was overridden by the owner for host tools only,
     and then became moot (see 3).
3. **Room and moderator state.** **[V]**
   - The join_channel response carries `user_capabilities` (27 `can_*` keys, for example `can_mute_speakers`,
     `can_remove_speakers` and `can_end_room`).
   - Gating lives in `src/api/roomControls.ts` and `src/api/roomCardActions.ts` (`roomActionsFor`).
   - Room state comes from the join snapshot plus PubNub (`src/api/realtimeEvents.ts`). Missing handlers:
     `uninvite_speaker` and `set_channel_title`, both present in the official web client's EVENTS list.
     `update_speaker_call_status` is ignored.
4. **Moderation methods.** `src/api/client.ts` has `inviteSpeaker`, `uninviteSpeaker`, `muteSpeaker`,
   `makeModerator`, `blockFromChannel`, `endChannel` and `changeHandraiseSettings`. In
   `electron/webApiRoutes.json` they are `transport: mobile`, evidence `mobile-spike`, path `/api/<name>`. **[V]**
5. **Exact failures.** **[V]**

   | Call | Status | Body / message | Source |
   |---|---|---|---|
   | `/web_api/end_channel` | 404 | "Not found" | owner api-log |
   | `/web_api/make_moderator` | 404 | "Not found" | owner api-log |
   | `/web_api/uninvite_speaker` | 404 | "Not found" | owner api-log |
   | mobile moderation set, web session cookies | 401 | `detail` "Authentication credentials were not provided." | Cursor canary |
   | `get_channel`, `get_handraise_queue`, `get_moderator_action_history` and others, web session | 401 | — | Cursor 28.0 |
   | mobile `start_phone_number_auth` from Clubbox (Electron) | 400 | `{success, is_blocked, error_message: "login did not pass token validation!"}` | Cursor 27.5.0, commit 1d2509d |
6. **Assumptions about device verification.**
   - **Verified:** Clubhouse's Knowledge Center, "Phone Number Verification", item 3 says: *Token Validation: "Login
     Did Not Pass Token Validation." Problem: Your device is unsupported or is running an unsupported operating
     system.* That matches the exact error Clubbox received. **[V]**
     (support.clubhouse.com/hc/en-us/articles/16863726518291)
   - **Not verified:** which integrity mechanism is used (e.g. a platform attestation token). Not needed for the
     conclusion. **[H]**

---

## 3. Evidence-based root cause (Phase 3)

| Candidate | Verdict | Evidence |
|---|---|---|
| Missing or changed endpoint | **Yes, on web.** The web client has no moderation requests. | `/web_api/*` 404 (api-log). The full clubhouse.com bundle (156 chunks, build yxtvL3q3kYoTq_mA4knuv) has 60 request endpoints and no moderation request. The moderation names appear only as PubNub event names (EVENTS: end_channel, invite_speaker, uninvite_speaker, make_moderator, add_speaker, remove_speaker) **[V]**. Mobile: the six paths exist (401) **[V]**; change_handraise_settings is gone (404) **[V]**. |
| Invalid request schema | **Not the cause.** | 401 arrives regardless of body; no authorized request was possible, so schemas were not reached **[V]**. Schema correctness itself is unverified **[H]**. |
| Authentication failure | **Yes, on mobile (the direct cause).** | The moderation views reject web-session auth with 401, while `get_profile` accepts it **[V]**. That moderation views require Token/JWT authentication is **[H]**, a strong inference from DRF-style per-view auth plus the historical references. |
| Insufficient room permissions | **Not the cause, and not reached.** | A permission check returns 403 after authentication; we only ever got 401 (mobile) or 404 (web) **[V]** (status semantics). Per-room `can_*` values are redacted in the logs, so the owner's moderator capability was not re-checked **[H]**. |
| Client-specific restriction | **Yes.** | Web: no moderation surface at all; the UI even says "Download the app now to stay synced with this room" **[V]**. Mobile auth is restricted to supported devices **[V]** (KB). |
| App/device integrity requirement | **Yes, for obtaining mobile auth.** | Error text plus the official KB mapping to "unsupported device/OS" **[V]**. The mechanism is unknown **[H]**. |
| Incorrect local room state | **Separate bug, not the moderation cause.** | Missing PubNub handlers (uninvite_speaker, set_channel_title) cause stale stages **[V]**. |

**Conclusion:**
- **[V]** Moderation is offered only through the mobile API.
- **[V]** The mobile API requires mobile-client authentication.
- **[V]** Clubhouse issues mobile authentication only to supported (native) devices.
- **[V]** Clubbox, as a desktop Electron app, is rejected at sign-in.

No supported, authorized path exists today for Clubbox to perform moderation. Workarounds such as impersonating
the official app, defeating the device check, or transferring a token from another app are out of scope by design
and are not proposed.

---

## 4. Recommended architecture and implementation plan (Phases 4–5)

### ModerationProvider

```ts
type ModerationAction =
  | 'invite_speaker' | 'uninvite_speaker' | 'mute_speaker' | 'make_moderator'
  | 'block_from_channel' | 'end_channel' | 'mute_all' | 'set_handraise';

type ModerationErrorKind =
  | 'app_only'          // no client surface (today: everything above)
  | 'not_authenticated' // 401
  | 'not_permitted'     // 403 or missing can_* capability
  | 'not_found'         // 404 endpoint gone
  | 'bad_request'       // 400 schema
  | 'rate_limited'      // 429
  | 'network';

interface ModerationCapability {
  action: ModerationAction;
  available: boolean;
  reason?: ModerationErrorKind;
  evidence?: 'observed' | 'bundle';
}

interface ModerationProvider {
  readonly id: 'web' | 'app-only';
  capabilities(room: RoomContext): ModerationCapability[]; // pure: evidence × user_capabilities × role
  perform(action: ModerationAction, room: RoomContext, target?: number): Promise<Result<void, ModerationError>>;
}
```

- **`AppOnlyModerationProvider`** (default today). `capabilities()` returns `available:false, reason:'app_only'`
  for every action. `perform()` never sends a request and returns `app_only`.
- **`WebModerationProvider`.** An action becomes available only when **all** hold:
  - the bundle crawler finds `/web_api/<name>` in the current build (evidence `bundle`);
  - one live 2xx is recorded (evidence `observed`, per the project's "Verified by use" rule);
  - the user's `user_capabilities.can_*` allows it.

  It maps HTTP status to `ModerationErrorKind`.
- **No mobile provider.** The 27.5 Token code was removed (Phase 30 step 4) so it cannot be re-enabled by accident.
- **Feature flags.** `moderation.web.autoEnable` (default on: auto-detect, but still requires the observed 2xx).
  No flag exists for the mobile path.
- **UI.**
  - Every host action renders from `capabilities()`.
  - Unavailable actions are disabled with the reason text ("Moderation is only available in the Clubhouse app").
  - The UI never fails silently and never shows a raw 401/404.
- **Preserved.** Audio (Agora), soundboard, external input and VB-Cable, recording, chat, reactions, room
  creation and titles are untouched. The provider sits only between the room UI and `client.ts` moderation
  methods.

### Implementation steps (maps to docs/tasks/phase-30-web-first.md)

1. Add the `ModerationProvider` types plus `AppOnlyModerationProvider`, and route `roomCtl` moderation handlers
   through it (30.1).
2. Add the crawler diff and watch-list, and `WebModerationProvider` activation on `bundle` + `observed` (30.2).
3. Add the missing PubNub handlers (`uninvite_speaker`, `set_channel_title`), handle
   `update_speaker_call_status`, and move to a pure room reducer (30.4). This fixes the stale stage that looked
   like a moderation problem.
4. Remove the dormant mobile Token code and update PRD/DESIGN/mobile-api.md to the conclusion of §3.
5. Phone workflow helper: room link and QR, plus co-host guidance (30.3). **Done.**

---

## 5. Safe test plan (an account and room we control)

**Setup:** the owner's account in Clubbox (host), a second owner-controlled account in the official Clubhouse
phone app, and a throwaway room created by the owner.

| # | Test | Expected | Kind |
|---|---|---|---|
| 1 | Unit: `AppOnlyModerationProvider.capabilities()` for each role and capability set | all `available:false, reason:app_only` | automated |
| 2 | Unit: `perform()` on app-only | no request leaves (transport spy), returns `app_only` | automated |
| 3 | Unit: WebProvider activation | unavailable with only `bundle`; available with `bundle`+`observed` and `can_*` true; `not_permitted` when `can_*` false | automated |
| 4 | Unit: status mapping 400/401/403/404/429/network → kinds | exact mapping | automated |
| 5 | Unit: crawler diff/watch-list on fixture builds | a hit produces a toast and `bundle` evidence | automated |
| 6 | Unit: reducer with real PubNub payload shapes, including uninvite_speaker / set_channel_title / update_speaker_call_status | final stage equals expected | automated |
| 7 | Live: phone moderator invites, mutes, moves down, makes moderator, removes the Clubbox user | Clubbox mirrors each within ~2 s | owner, live |
| 8 | Live: Clubbox host buttons | disabled with the app-only text; api-log shows **no** moderation request | owner, live |
| 9 | Live: audio regression (mic, soundboard, VB-Cable external input heard on the phone) | unchanged | owner, live |
| 10 | Log hygiene: grep the api-log and console for cookie/token/phone patterns | none | automated + owner |

**Not part of the plan:** any authorized-looking call made by impersonating the mobile app, any attempt to pass
the device check, and any token transfer from another client.

---

## Sources

- github.com/stypr/clubhouse-py (clubhouse/clubhouse.py)
- github.com/seovchinnikov/clubhouse-web (backend-service ChannelsController, ClubHouseChannelApiService,
  ClubHouseAuthApiService, DTOs)
- github.com/zhuowei/ClubhouseAPI (doc/openapi.yaml header notes)
- github.com/seia-soto/clubhouse-api (src/api/*.js)
- Clubhouse Knowledge Center: "Phone Number Verification" (Token Validation item), "Creating Live Rooms"
  (moderation tools); public help-center API, 116 articles
- clubhouse.com web bundle, build yxtvL3q3kYoTq_mA4knuv (156 chunks)
- Clubbox: `electron/webApiRoutes.json`, `electron/main.cjs`, `src/api/*`, `docs/api/mobile-api.md`, the
  owner's api-log (shapes only), commit 1d2509d (27.5.0 result)
