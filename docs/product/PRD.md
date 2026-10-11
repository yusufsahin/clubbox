# Clubbox — Product Requirements (PRD)

_Owner: Yusuf Sahin · Version 1.0 · 2026-10-11 · Status: draft for implementation_

Clubbox is an unofficial desktop studio for Clubhouse (Windows/macOS, Electron). It is for people who host, moderate, record and perform in Clubhouse rooms from a computer. It is not affiliated with Clubhouse and is for personal, non-commercial use until the owner decides otherwise.

## 1. Sources

| Code | Source | What it is good for | Trust |
| --- | --- | --- | --- |
| HC | Clubhouse Help Center (support.clubhouse.com, 116 articles, read 2026-10-11) | Current product rules: room types, replays, clips, houses, VMs, karma | High (behavior), no API info |
| CD | Clubdeck Reference Manual v2.0 (TenPercent, 2022) | What a pro desktop client offers; UX patterns, shortcuts | High (UX), dated API |
| O | Redacted captures (`api-captures/`, `docs/api/web-api.md`) | Exact web_api requests and responses | Highest |
| B | Web bundle call sites (`docs/api/bundle-callsites.md`) | Real web_api paths, methods and body keys from clubhouse.com's own code | High |
| C | Community clients (stypr/clubhouse-py, hatamiarash7/Clubhouse-API, 2021, mobile API) | Endpoint names and bodies for features the web bundle has not shown | Low–medium (mobile, old) |

## 2. Evidence policy (hybrid B + C)

Each endpoint in `electron/webApiRoutes.json` has an evidence level. The level decides whether Clubbox calls it and how the UI presents it.

| Level | Meaning | Callable | UI |
| --- | --- | --- | --- |
| `observed` | A redacted capture shows a 2xx response | Yes | Normal |
| `bundle` | Path + method + body keys found at a call site in the web bundle | Yes | Normal; failures go to API Health |
| `community` | Name + body from C, mapped to `/web_api/<name>` | Only when Settings → "Experimental actions" is on | "Experimental" badge; first use asks for confirmation |
| `unsupported` | Tried and failed with 404/405, or proven absent | No | "Available in the Clubhouse app" |

Rules:
1. Every route has a correct `mutation` flag. Anything that creates, sends, deletes, updates, joins, leaves, pings, reacts, follows, mutes, invites or marks is a mutation.
2. Circuit breaker per endpoint: the first 404/405 marks the route `unsupported` locally; 2 consecutive 4xx (other than 401/429) disable it for the session; 429 → exponential backoff (1, 2, 4 … 30 min). Every failure is shown in **Settings → API Health** with status, time and a "copy redacted report" button.
3. Promotion: a `bundle` or `community` route becomes `observed` automatically when the recorder (or the app's own redacted request log, opt-in) records a 2xx.
4. Never invent a name that is in none of O, B, C. Never use the mobile host (clubhouseapi.com).
5. Contract tests pin the body keys for every `bundle` and `community` route (see §8).

Known body shapes (B unless marked C):

| Endpoint | Method | Body | Level |
| --- | --- | --- | --- |
| create_channel | POST | is_chat_enabled, is_public_room, is_replay_enabled, is_private, is_social_mode, user_ids, topic_ids, source, topic, privacy_level | observed |
| join_channel | POST | channel | bundle |
| leave_channel | POST | channel | bundle |
| active_ping | POST | channel | bundle |
| audience_reply | POST | channel, raise_hands, unraise_hands | bundle |
| become_speaker | POST | channel | bundle |
| send_channel_message | POST | channel, message | bundle |
| get_channel_messages | GET | channel (query) | bundle |
| emoji_reaction | POST | channel, emoji | bundle |
| set_channel_title | POST | channel, title | bundle |
| web_listener_join / _active_ping / _leave | POST | session_id, staff_token, name, invite_code, recaptcha_token | bundle (needs reCAPTCHA → do not use; see §7) |
| invite_speaker, uninvite_speaker, mute_speaker, make_moderator, block_from_channel, accept_speaker_invite, reject_speaker_invite, invite_to_existing_channel | POST | channel, user_id | community |
| end_channel, make_channel_public, make_channel_social | POST | channel, channel_id | community |
| change_handraise_settings | POST | channel, is_enabled, handraise_permission | community |
| hide_channel | POST | channel, hide | community |
| get_online_friends | POST | {} | community |
| get_notifications | GET | page_size, page | community |
| get_events | GET | is_filtered, page_size, page | community |

Realtime: PubNub origin `clubhouse.pubnubapi.com` (B); room message types `channel_message`, `channel_reaction` (B). Subscribe channel name unknown; C suggests per-room channels — treat as `community` and verify with the recorder.

## 3. Personas

| Persona | Goal | Must have |
| --- | --- | --- |
| **Host / moderator** (primary) | Run a good room from a laptop | Start room, stage control, hand queue, mute everyone, chat moderation, end room |
| **Podcaster** | Turn rooms into episodes | Recording with consent, chapters/timestamps, clean audio |
| **Musician / DJ** | Perform | Music mode, device choice, soundboard, monitoring |
| **Power listener** | Follow many rooms | Hallway filters, keyword highlight, search columns, paste links |

## 4. Feature catalog

Legend — Today: ✅ works live · ✅* wired (live verification pending) · 🧪 sandbox/UI only · ❌ missing. Evidence: O / B / C / — (none needed, local) / N (no source).

### 4.1 Account & app

| ID | Feature | HC | CD | Today | Evidence | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| ACC-1 | Sign in in a visible clubhouse.com window | ✓ | ✓ | ✅ | O | P0 |
| ACC-2 | First-run notice (unofficial, guidelines risk) | | | ✅ | — | P0 |
| ACC-3 | Log out (clear cookies + local state) | ✓ | ✓ | ✅ | — | P0 |
| ACC-4 | Light / dark / system theme | ✓ | ✓ | ✅ | — | P2 |
| ACC-5 | Zoom in/out/reset (Ctrl +/−/0) | | ✓ | ✅ | — | P2 |
| ACC-6 | Language (en/tr) | ✓ | | ✅ | — | P1 |
| ACC-7 | Warn at sign-in that Clubhouse allows one active device (the phone may be signed out) | | ✓ | ✅ | — | P1 |
| ACC-8 | Desktop notification when pinged into a live room (opt-in) | ✓ | ✓ | ✅ | C (get_notifications) | P2 |

### 4.2 Hallway & discovery

| ID | Feature | HC | CD | Today | Evidence | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| HAL-1 | Hallway feed with topic chips | ✓ | ✓ | ✅ | O (get_feed_v3) | P0 |
| HAL-2 | Room card: title, house, replays/clips on, age, listeners, speakers, copy link, hide, join | ✓ | ✓ | ✅ | O | P0 |
| HAL-3 | Hide room from hallway | ✓ | ✓ | ✅ | C (hide_channel) | P2 |
| HAL-4 | Keyword filters + highlight; highlight rooms with friends; NSFW toggle | | ✓ | ✅ | — (client side) | P1 |
| HAL-5 | Search people/rooms/houses (tabs) | ✓ | ✓ | ✅ | O (search) | P1 |
| HAL-6 | Saved search columns that refresh (≥ 60 s, paused when hidden) | | ✓ | ✅ | O | P2 |
| HAL-7 | Paste a clubhouse.com link (room, profile, event, replay) to open it | | ✓ | ✅ | — + O/B | P1 |
| HAL-8 | Events: upcoming list, RSVP/notify, .ics export, copy link | ✓ | ✓ | ✅ | C (get_events) | P2 |

### 4.3 Room — listener

| ID | Feature | HC | CD | Today | Evidence | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| RL-1 | Join a room and hear audio | ✓ | ✓ | 🧪 | B (join_channel) + Agora | P0 |
| RL-2 | Leave quietly | ✓ | ✓ | 🧪 | B | P0 |
| RL-3 | Stay connected (active_ping 30 s) | | | 🧪 | B | P0 |
| RL-4 | Live stage/audience updates | ✓ | ✓ | ✅* | B/C (PubNub) | P0 |
| RL-5 | Room chat read + send, unread count | ✓ | ✓ | ✅ | B | P0 |
| RL-6 | Raise / lower hand | ✓ | ✓ | 🧪 | B (audience_reply) | P0 |
| RL-7 | Accept / decline stage invite | ✓ | ✓ | 🧪 | B (become_speaker) / C | P0 |
| RL-8 | Emoji + GIF reactions to a speaker | ✓ | | ✅ | B (emoji_reaction, gif_reaction paste id) | P1 |
| RL-9 | Private chat with a person in the room (text) | ✓ | ✓ | ✅ | O (conversations) | P2 |
| RL-10 | Audience search by name/bio (Ctrl+S) | | ✓ | ✅ | — (client side on room users) | P1 |
| RL-11 | Spatial audio (local) | ✓ | ✓ | ✅ | — | P2 |
| RL-12 | Replays: play saved replays | ✓ | ✓ | ✅ | B (get_replay_channel) | P2 |

### 4.4 Room — host & moderator

| ID | Feature | HC | CD | Today | Evidence | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| RH-1 | Start room: audience (friends / friends of friends / house / public), title, replays, chat | ✓ | ✓ | ✅ | O | P0 |
| RH-2 | Speak: Agora publish with mic + soundboard mix | ✓ | ✓ | ✅* | O (token in create) | P0 |
| RH-3 | Edit room title | ✓ | ✓ | 🧪 | B (set_channel_title) | P1 |
| RH-4 | Hand queue list + invite to stage | ✓ | ✓ | 🧪 | C (invite_speaker) | P1 |
| RH-5 | Mute speaker / mute everyone | ✓ | ✓ | 🧪 | C (mute_speaker ×N) | P1 |
| RH-6 | Make moderator / move to audience / block from room | ✓ | ✓ | 🧪 | C | P1 |
| RH-7 | Hand-raise permission (off / everyone / friends of speakers) | ✓ | ✓ | ✅ | B create `handraise_permission`; mid-room C experimental | P1 |
| RH-8 | Chat on/off, delete a message | ✓ | ✓ | 🧪 | N for delete | P2 |
| RH-9 | Ping people into the room (multi-select, search by bio) | ✓ | ✓ | ✅ | C (invite_to_existing_channel) | P1 |
| RH-10 | Room visibility change | | ✓ | ✅ | C (make_channel_public/social) | P2 |
| RH-11 | End room (confirm) | ✓ | ✓ | 🧪 | C (end_channel) | P0 |
| RH-12 | Pinned link | ✓ | ✓ | ✅ | B (create_channel.link) | P2 |
| RH-13 | Room details panel (mobile "live details"): replay status + note, audio quality, audience search, mute all other speakers (mod), share | ✓ | ✓ | 🧪 | B/C | P1 |
| RH-14 | Simple composer like the mobile app: title → room type list (public, friends of friends, my friends, each of my houses with photo and access label) → go live; replays ON by default with "disable replay" under More options | ✓ | ✓ | 🧪 | O | P1 |
| RH-15 | Room-centred controls: room bar (Mic, Hand, Reactions, Sounds, Record, Chat, Details, Leave); moderator tools and audio settings in Room details; each control exactly once | ✓ | ✓ | ❌ scattered | — | P1 |

### 4.5 Studio (Clubbox's reason to exist)

| ID | Feature | HC | CD | Today | Evidence | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| ST-1 | Input/output device, mic gain, monitor | | ✓ | ✅ | — | P0 |
| ST-2 | Music mode (no AEC/NS/AGC, stereo, headphone warning) | ✓ | ✓ | ✅ | — | P0 |
| ST-3 | Soundboard: local files, volume, duck button, stop all, hotkeys | | ✓ | ✅ | — | P0 |
| ST-4 | Recording (opt-in, replays-on rooms, compressed/lossless) | | ✓ | ✅ | — | P1 |
| ST-5 | Chapters: Ctrl+T adds a timestamp; export YouTube + Spotify chapter file | | ✓ | ✅ | — | P1 |
| ST-6 | Clip (5–55 s) from local buffer, only when allowed | ✓ | ✓ | ✅ | — | P2 |
| ST-7 | Voice effects (preview, apply, none) | | ✓ | ✅ | — | P2 |
| ST-8 | Global shortcuts (mute, hand, accept/decline invite, pads) | | ✓ | ✅ | — | P1 |
| ST-9 | Restream RTMP output | | ✓ | ❌ | — | P3 |
| ST-10 | Sound pad library in Settings › Sounds (upload, rename, hotkey, volume, local preview, delete); playing happens in the room | | ✓ | ❌ separate Soundboard page | — | P1 |
| ST-11 | External audio into the room: second input device (line-in, virtual cable) or Windows system audio, own fader/mute/meter, no AEC/NS/AGC, auto-duck under voice, into broadcast + recording; no virtual cable needed | | ✓ | ✅ | — | P1 |

### 4.6 Social

| ID | Feature | HC | CD | Today | Evidence | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| SO-1 | Profile: counts, mutuals, bio, follow (unfollow not in web client → non-clickable “Following”) | ✓ | ✓ | ✅ | O | P1 |
| SO-2 | Followers / following lists | ✓ | ✓ | ✅ | N on web | P3 |
| SO-3 | Online friends + "in a room → join" | ✓ | ✓ | ✅ | C (get_online_friends) | P2 |
| SO-4 | Messages: VMs + house chats, text, voice | ✓ | ✓ | ✅ | O/B | P2 |
| SO-5 | Activity / notifications | ✓ | ✓ | ✅ | C (get_notifications) | P2 |
| SO-6 | Houses: list, page, members, join | ✓ | | ✅ | B (get_social_club*) | P2 |
| SO-7 | "Follow back" button when someone follows me and I do not follow them (search results, profile) | ✓ | | 🧪 | O (follows_me) | P2 |
| SO-8 | Profile actions: Message (any time, can_dm), Talk live (can_wave → create_channel friend + user_ids), follow control by follow_status (Follow / Follow back / Following / Friends / Requested), Share | ✓ | ✓ | ✅* | O/B | P1 |
| SO-9 | Profile sections: houses (social_clubs), recently chatting (chatting_with, max 5), X/Instagram links, "in a room now · Join", clickable mutual friends/follows lists, private-profile state; own profile adds my houses (get_user_social_clubs) | ✓ | ✓ | ✅* | O/B | P1 |

### 4.8 Capabilities discovered in API responses (decided)

These appear in `create_channel` / `me` responses (`user_capabilities`, `channel_capabilities`, feature flags). Each has a decision so nothing stays undefined.

| ID | Capability (response field) | Decision | Priority |
| --- | --- | --- | --- |
| DX-1 | Room topics (`is_topics_available`, `topic_ids`) | Composer picker gated on a topic-list endpoint (none in web client today → hidden); `topic_ids` still sent when chosen | P2 |
| DX-2 | Pinned links (`can_edit_pinned_links`, `is_pinned_links_available`) | Same as RH-12 | P2 |
| DX-3 | Automatic speaker approval (`is_automatic_speaker_approval_available`) | Composer toggle gated on a documented create body key (none yet → hidden) | P2 |
| DX-4 | Background music (`can_edit_background_music`) | Not built: the Clubbox soundboard covers it client-side | Won't |
| DX-5 | Games (`are_games_available`, `display_games`) | Not built | Won't |
| DX-6 | Polls (`selected_poll_option_id`, profile polls) | Read-only on profiles if the crawler finds the endpoint | P3 |
| DX-7 | Host banner (`can_edit_host_banner`) | Not built | Won't |
| DX-8 | Suggested links (`can_update_suggested_links`) | Not built | Won't |
| DX-9 | Moderator action history (`can_view_moderator_actions_history`) | Show if the crawler finds the endpoint | P3 |
| DX-10 | Paid reacts / thanks (`can_send_paid_reacts`, `can_send_paid_react_thanks`) | Show received premium reacts only; no purchasing (region-locked, not in Turkey) | P3 |
| DX-11 | Web listening toggle (`can_change_enable_web_listening`, `is_web_listening_enabled`) | Room-settings toggle when the crawler finds the body | P2 |
| DX-12 | AI questions (`ask_question_about_conversation`, `ask_question_about_me`) | Not built (AI over other people's content) | Won't |
| DX-13 | Friend zone match (`get_friend_zone_match`) | Not built until its purpose is known | Won't |
| DX-14 | Highlights (`get_highlight`, `are_highlights_enabled`) | Play like replays (GET path `{id}`) | P3 |
| DX-15 | Clubhouse Talk (`talk/*` paid advisor calls) | Out of scope (payments) | Won't |

### 4.9 Navigation (see NAVIGATION.md v2)

| ID | Feature | HC | CD | Today | Evidence | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| NAV-1 | Sidebar: Hallway, Discover, Messages, Activity + profile card and ⚙ (Soundboard moved into the room, v2.1) | | | 🧪 | — | P1 |
| NAV-2 | Friends + Houses merged into Discover; Events into Activity; API & Config into Settings | | | 🧪 | — | P1 |
| NAV-3 | One "Start a room" button (top bar) + Ctrl+N | | | 🧪 | — | P1 |
| NAV-4 | Room = bottom bar on every page; header keeps the current page | | | 🧪 | — | P1 |
| NAV-5 | Minimize and Leave return to the previous page | | | 🧪 | — | P1 |
| NAV-6 | Back arrow + Esc on every sub-page (simple previous-view stack) | | | 🧪 | — | P1 |
| NAV-7 | Exactly one highlighted item | | | 🧪 | — | P1 |
| NAV-8 | Per-section state cache | | | ❌ | — | Won't |
| NAV-9 | Badges only for Messages (count) and Activity (dot) | | | 🧪 | — | P1 |
| NAV-10 | Settings: General, Audio, Account + collapsed Advanced | | | 🧪 | — | P1 |
| NAV-11 | Global Ctrl+K search (Discover search covers it) | | | ❌ | — | Won't |
| NAV-12 | Section shortcuts Ctrl+1…5 | | | ❌ | — | Won't |
| NAV-13 | No duplicated page titles | | | 🧪 | — | P2 |
| NAV-14 | No placeholder "??" toast icons | | | 🧪 | — | P1 |

### 4.7 Won't do (and why)

| Item | Reason |
| --- | --- |
| Audience insights by gender/bio mining, "show followers count for everyone" | Bulk profile collection; Community Guidelines (scraping) and privacy |
| YouTube downloader for sounds | Copyright |
| Voice assistant that speaks generated answers on stage | Platform-manipulation risk; low value |
| web_listener_* flow | Requires reCAPTCHA token; Clubbox must not run reCAPTCHA itself |
| Mobile API (clubhouseapi.com), token sign-in | Off-policy, superseded by web session |
| Followers/following list scraping via guessed paths | No source; guidelines risk |
| Clubhouse Talk / paid advisor (`talk/*`) | Payments and advisor flows are out of product scope (DX-15) |
| Unfollow API | Not in the web client; live UI keeps a non-clickable “Following” control (SO-1 decided) |
| Mobile-only room settings: "show replay on profile", "allow web listening", "report a recent speaker", "report room title" | Not in the clubhouse.com web client (no request in the bundle). Show nothing rather than a control that cannot work; users do these in the app. |
| Live captions | Rendered by the web client from a source not yet identified; revisit if the crawler finds it. |
| Profile polls, clips, replays, karma, earnings | Not in the web profile data (bundle parseUserProfile); app-only. |
| Full followers / following / friends lists of any user | No list endpoint in the web client; only counts, mutual lists and recently chatting are available. Mobile API is off-policy. |

## 5. Releases

| Release | Theme | Scope | Exit criteria |
| --- | --- | --- | --- |
| **R1 "Listen & Host"** | Be in a room from the desktop | RL-1..7, RH-1, RH-2, RH-11, ST-1..3, ACC-3, API Health | BDD suites green; one real host session and one real listener session succeed, or failures are visible in API Health |
| R2 "Moderate" | Run a room | RH-3..10, RL-8, RL-10, ST-8 | Experimental actions verified or marked unsupported |
| R3 "Studio+" | Podcast & performance | ST-4..7, HAL-4, HAL-7 | Chapter file validated against YouTube/Spotify format |
| R4 "Social" | Beyond rooms | SO-3..6, HAL-5..8, RL-12 | — |

## 6. Non-functional requirements

- **Security:** IPC only from the app origin; no navigation out of the main window; secrets never written to logs/docs/commits.
- **Rate limits:** no timer while hidden > 2 min except active_ping in a room; 429 backoff; no polling faster than the official client.
- **Privacy:** recording/clips opt-in, only in replays-on rooms, visible REC banner; respect "hide my name and image from clips".
- **Reliability:** every live action ends in success, a visible error, or a disabled control — never a silent no-op.
- **Performance:** first paint < 2 s on a mid laptop; Agora SDK lazy-loaded; main chunk < 500 kB.
- **Accessibility:** keyboard reachable controls, focus visible, aria-labels on icon buttons.
- **i18n:** every string in en + tr.

## 7. Risks & open questions

| # | Risk / question | Mitigation |
| --- | --- | --- |
| 1 | Guessed (`community`) endpoints may not exist on web | Experimental toggle, confirmation on first use, circuit breaker, API Health |
| 2 | Account action by Clubhouse (automation, client spoofing) | No reCAPTCHA automation, official-client polling rates, personal use only |
| 3 | Clubhouse allows one active device; Clubbox may log the phone app out (CD) | Tell the user at sign-in |
| 4 | PubNub channel names unknown | Recorder on a real room; fall back to "Refresh" button (CD "PTR", Ctrl+P) |
| 5 | Agora app id source (bundle env `NEXT_PUBLIC_AGORA_KEY`) may change | Read it from the bundle at sign-in; show API Health error if join fails |

## 8. Quality approach (BDD + TDD)

- **BDD:** Gherkin feature files in `features/` are the acceptance criteria for every catalog item. They run against the sandbox and a fake transport, and tag the evidence level (`@observed`, `@bundle`, `@community`).
- **TDD:** every bug fix starts with a failing unit test in `tests/`; every new endpoint starts with a contract test that pins method, path and body keys from §2.
- **Contract tests:** generated from `webApiRoutes.json` + `docs/api/bundle-callsites.md`; a request built by `ClubhouseApiClient` must match the documented keys exactly.
- **Live verification loop:** user runs the app → failure appears in API Health → "copy redacted report" → paste to Cursor → Cursor writes a failing test reproducing it → fix → test green → commit.
- **Definition of done:** feature file green, unit/contract tests green, tsc + lint + build green, i18n en/tr, catalog row updated.
