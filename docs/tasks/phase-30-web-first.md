# Phase 30 — Web-first Clubbox: honest host tools, accurate room state, Live details, audio quality, VB-Cable

Owner request 2026-10-12. Cursor implements; the owner runs the live checks. Do the tasks in order, one at a time:
tests, then `npm run test:unit` and `npx tsc --noEmit` green, then commit, then stop and summarize.

## 0. Decisions and facts (read first)

- **Moderation is app-only.** The full clubhouse.com web bundle (156 JS chunks, 5.4 MB, build
  yxtvL3q3kYoTq_mA4knuv) has 60 request endpoints and none of them is a moderation request.
  - `end_channel`, `invite_speaker`, `uninvite_speaker`, `make_moderator`, `add_speaker` and `remove_speaker`
    appear only as PubNub **event names** that the web client *receives*.
  - The web UI even says "Download the app now to stay synced with this room".
- **The mobile route is closed.** The mobile API host tools need a device-bound Token, and Clubhouse rejects
  mobile SMS sign-in from Clubbox with a device check (27.5.0, commit 1d2509d).
  - **Do not** try to bypass that check.
  - **Do not** import tokens from other apps (phone, Clubdeck).
  - Phases 27.5 / 28 / 29 items that need the mobile Token are closed as "app-only".
- **Already done by Cursor** (keep it, build on it):
  - 25.x: leave on close, mute state, denoiser;
  - 26.1–26.6: audio routing;
  - 29.1: Live details sheet (`src/api/liveDetails.ts`, `src/ui/components/liveDetailsPanel.ts`);
  - 29.2: mute-all hardening and the grouped room settings;
  - PubNub types: `change_handraise_settings`, `update_user_capabilities`, `cumulative_count_update`
    (`src/api/realtimeEvents.ts`).
- Logging rules as before: shapes and keys only; never cookie, csrf, token, phone number or SMS code.

---

## 30.1 — Honest host tools (no silent failures)

1. Retire the mobile Token path for host tools:
   - no SMS sheet, no "Link host tools" prompt, no Token store usage;
   - **done (step 4):** 27.5 Token code removed; purge leftover `userData/mobile-auth.bin` on launch.
2. Host actions in the room (mute, invite to speak, move to audience, make moderator, remove from room, end room):
   - render them **disabled** with one shared tooltip: "Moderation is only available in the Clubhouse app";
   - clicking one shows the same text once per session, never a 401/404 toast.
3. Keep everything that works on the web session: create room, set title, raise hand, become speaker, chat,
   reactions, leave.
4. Docs: update PRD.md, DESIGN.md (C2), docs/api/mobile-api.md and CURSOR_TASKS.md (Phase 27/27.5/28/29 status +
   "Questions for the owner") to say: "Moderation is app-only; Clubhouse blocks third-party mobile sign-in (device
   check, 2026-10-12). Mobile Token path retired."
5. Tests:
   - each host action is disabled and makes no request;
   - the tooltip text is shown;
   - no mobile host call leaves the main process.

## 30.2 — Auto-detect web moderation if Clubhouse ever adds it

The bundle crawler (`electron/bundleCrawler.cjs`) already runs per build id.

1. After each crawl, compare the `/web_api/<name>` set with the previous build's set, and store the diff in
   `userData/bundle-cache/<buildId>/endpoints-diff.json` (names only).
2. Watch-list:
   - `end_channel`, `mute_speaker`, `invite_speaker`, `uninvite_speaker`, `make_moderator`, `block_from_channel`,
     `remove_from_channel`;
   - `disable_channel_messages`, `enable_channel_messages`, `delete_channel_message`, `disable_replay`,
     `add_channel_link`, `remove_channel_link`, `get_handraise_queue`, `get_moderator_action_history`.
3. If a watch-list name appears as `/web_api/<name>` in a new build:
   - mark it `bundle` evidence (webApiRoutes is runtime data in userData, not the shipped file);
   - capture the call-site body keys the existing extractor finds;
   - show a one-time toast: "Clubhouse web added <name> — host tool can be enabled".
   - **Do not** enable the button automatically until one live 2xx (Verified by use, the 12.2 rules); then 30.1
     re-enables that single action.
4. Tests:
   - the diff function;
   - a watch-list hit produces a toast plus `bundle` evidence;
   - with no live 2xx the action stays disabled.

## 30.3 — Moderate from the phone: make the two-device workflow easy — **done (step 5)**

1. Room header "Open on phone":
   - shows the room link `https://www.clubhouse.com/room/<channel>` with Copy;
   - shows a QR code of the link (`qrcode@1.5.4`, lazy-loaded via `src/ui/qrCode.ts`).
2. Help card in Settings › Help and Details › Learn more (disabled host tools):
   - Moderate from the Clubhouse app on your phone while Clubbox handles audio and studio.
   - Same account on both may conflict: use a co-host account on the phone and make it moderator from the app.
3. Tests: `tests/roomPhoneLink.test.ts` (link, sheet/card render, QR data URL).

## 30.4 — Accurate room state on the web session (no get_channel on web)

**Problem.** The owner sees wrong user status and info in rooms. The web has no room-snapshot endpoint, so the
source of truth must be: the join_channel snapshot, then PubNub deltas, then the Agora overlays.

1. **Handle every event the official web client handles.** The web bundle's EVENTS list is: join_channel,
   leave_channel, end_channel, add_speaker, remove_speaker, set_channel_title, make_moderator, emoji_reaction,
   gif_reaction, new_channel_message, new_channel_reaction, invite_speaker, uninvite_speaker.
   - Missing in `CLUBHOUSE_ACTIONS` (src/api/realtimeEvents.ts):
     - **`uninvite_speaker`**: the user goes back to the audience; clear is_speaker and is_moderator unless the
       payload says otherwise;
     - **`set_channel_title`**: update the title in the room header, the hallway card and Live details.
   - Check `emoji_reaction` / `gif_reaction` (the web names) as well as `new_channel_reaction`.
2. **`update_speaker_call_status`** (payload keys: action, audio_profile, channel, is_on_call, user_id), currently
   ignored:
   - store per user `{ is_on_call, audio_profile }`;
   - a speaker with `is_on_call=false` gets a subtle "not connected" style;
   - `audio_profile` shows a small music-note badge when it says music. Log unknown values once (shape only).
3. **Agora presence overlay for speakers.** A stage user who has no Agora remote user for more than 10 s while we
   are joined gets the "not connected" style. It clears as soon as Agora sees them. Mute badges keep the 25.2 overlay.
4. **Reconciliation on PubNub reconnect.**
   - Record the last applied PubNub timetoken.
   - On reconnect, fetch PubNub history for the channel since that timetoken, if the subscribe key allows it and the
     existing pubnubClient supports it.
   - Otherwise show the "Live updates paused — reconnecting" note until the next event, and never invent state.
5. **One pure reducer.** `applyRoomEvent(state, event) → state` covers all of the above. `applyRoomUpdate` in
   roomCtl.ts renders only from the reducer output (no ad-hoc mutations such as `target.is_muted = true` at
   roomCtl.ts ~382 / ~694 without a server event).
6. **Profile info.** The profile drawer uses web `get_profile`. Cache per room session only; refresh when a
   make_moderator / add_speaker / uninvite_speaker event names that user.
7. **Tests.** Fixture-driven tests: one per event type with real payload shapes from `features/fixtures` or the
   api-log keys, plus a sequence test: join → raise hand → add_speaker → mute (Agora) → uninvite_speaker → leave.
   The final state must equal the expected stage.
8. **Owner live check.** A phone account does each action in the owner's room (from the Clubhouse app as
   moderator). Clubbox mirrors it within about 2 s: stage/audience lists, crowns, mute badges, title, not-connected
   style.

## 30.5 — Live details: audit and fill gaps

The sheet exists (29.1). Audit it against the join_channel and PubNub data and fill the gaps; a row whose data is
missing is hidden.

- **Room:** title (updates live, 30.4), privacy / social mode, club / house, language, created time
  (`time_created`), topics, NSFW.
- **Numbers:** speakers, listeners now (`num_all`), cumulative (`num_ever` from `cumulative_count_update`), shares
  (`num_shares`), clips (`num_clips`).
- **State:**
  - Replay (`is_replay_enabled`);
  - chat on/off and who can post (`is_chat_enabled`, `chat_permission`);
  - hand raise (`handraise_queue_setting` label from `handraise_queue_options`, `handraise_permission`);
  - web listening (`is_web_listening_enabled`);
  - highlights (`are_highlights_enabled`);
  - clips (`clips_permission`).
- **Me:** role, my `can_*` capabilities (moderators), and the line "Moderation: Clubhouse app only" (30.1).
- **My audio (new, from 30.6):**
  - send quality level;
  - live send bitrate;
  - stereo yes/no;
  - network quality.
- **Server-driven bits** (former 29.7, web-only):
  - the reaction picker uses `emoji_reaction_options`;
  - `show_last_speaker_warning` warns before I leave the stage or the room;
  - `hide_moderator_indicator` hides crowns from non-moderators;
  - `stage_removed` / `can_rejoin_stage_directly` gate "Rejoin stage" (become_speaker);
  - `welcome_for_user_profile` is shown once on join.
- **Tests:** `buildLiveDetails` view-model tests for each row and for hidden-when-missing.

## 30.6 — Audio quality you can see and trust

1. **Measure the open question from 26.2 step 5.** The SDK mixes all published tracks into one. Which encoder
   does the mix use?
   - Log `client.getLocalAudioStats()` once per 5 s while publishing (debug only, values only).
   - Compare normal vs music with an external stereo test file, using the phone as the listener.
   - Record the result in docs/product/audio-routing.md.
   - If the mix follows the mic track's encoder, publish ONE track: the mic and the extras mixed in Web Audio,
     through a single custom track with the level's encoder. This also fixes the mute signal from 25.2, because there
     is one track to mute.
2. **Send-quality indicator** in the cockpit:
   - level (normal / high / music);
   - live bitrate;
   - mono or stereo;
   - Agora network quality (uplink).
   - A warning dot when the bitrate is below 60 % of the level's target for 10 s.
3. **One-click "Audio check"** (local only, nothing goes to the room):
   - 5 s of the mic and external meters;
   - clipping / too-low detection;
   - the actual capture settings (26.6);
   - suggestions such as "turn on Music for external music" or "input too low".
4. **Music mode correctness:** AEC, ANS, AGC and the AI denoiser are off; the headphones strip shows (already done).
   Verify with a unit test of the profile table, and with the actual track `getSettings()` in the Audio check.
5. **Tests:** the indicator thresholds and the Audio check verdicts with fake meter data.

## 30.7 — VB-Cable: guided check instead of a manual matrix

The owner's PC has VB-Cable installed twice:
- the working copy is "2-": "Speakers (2- VB-Audio Virtual Cable)" and "CABLE Output (2- VB-Audio Virtual Cable)";
- a broken first instance is still listed.

1. **"VB-Cable check"** inside the existing audio setup wizard (26.5). Each step shows pass or fail with a fix:
   1. Cable found (26.1 classification), and the duplicate or broken instance flagged with a hint to remove it in
      Device Manager.
   2. External input = "CABLE Output (N- …)". Signal arrives: play a test tone into the cable from Clubbox itself
      via `setSinkId` on a hidden audio element. This is local only, never sent to the room.
   3. Format is 2 ch / 48 kHz (`getSettings`); otherwise show the Windows Sound › Advanced hint (26.6).
   4. Loop guard OK: the output is not the same cable (26.4).
   5. The room send path carries the external signal (extras stats while publishing, or the Audio check from 30.6).
2. Save the last check result (pass/fail per step, no device ids) and show it in Live details › My audio.
3. **Tests:** each step's verdict with fake devices and settings, and the "same cable" loop detection.
4. **Owner live check** (replaces 26.7 rows a–g): run the VB-Cable check, then confirm on the phone that the music
   is heard, ducking works and stereo is preserved in Music.

## 30.8 — Ask Clubhouse for web moderation (owner action; no code)

Send this through the Clubhouse Knowledge Center → "Share feedback or submit technical issues":

> Hi Clubhouse team — I host rooms from the web (clubhouse.com) on my computer. The web client lets me create rooms
> and set titles, but not moderate: invite to speak, move to audience, mute speakers, remove from room, make
> moderator, end room. Could you add these moderator tools to the web client, or allow hosting rooms fully from the
> web? It would make hosting from a desktop setup (better microphones, audio interfaces) much easier. Thank you!

## 30.9 — Done means

- 30.1–30.7 merged with tests; `npm test` green.
- The owner's live checks pass: 30.4 step 8, the 30.6 measurement recorded, the 30.7 VB-Cable check.
- CURSOR_TASKS.md Status has a Phase 30 row; the Phase 27.5 / 28 / 29 mobile items are marked "app-only (closed)".
