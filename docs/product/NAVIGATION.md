# Clubbox — Navigation & Information Architecture

_Version 1.0 · 2026-10-11 · Companion to PRD.md and DESIGN.md. Acceptance: `features/navigation.feature`._

## 1. Audit of the current navigation (code + owner screenshot)

| # | Problem | Where | Why it hurts |
| --- | --- | --- | --- |
| N-1 | **12 top-level places, two sidebar groups, no hierarchy.** Hallway, Discover, Friends, Houses, Events, Messages / Live Stage, Soundboard, Start a Room, API & Config — plus Activity, Replay, Login and the self profile that are not in the sidebar at all. | `renderSidebar()`, `currentTab` union (12 values) | Users cannot build a mental model; related things (Discover/Friends/Houses, Activity/Events) are split, unrelated things (Soundboard, Settings, "Start a room" action) sit together. |
| N-2 | **Duplicate entry points with different behaviour.** Messages: sidebar item + top-bar envelope. Profile: sidebar user card + top-bar avatar. Start a room: sidebar item + top-bar button + floating button (3×). Room: "Live Stage" item + LIVE badge + mini player. | sidebar, top bar, `.host-room-fab` | Noise; the user does not know which one is "the" way; three Start buttons compete with Join on every card. |
| N-3 | **Activity and Events are orphaned.** Activity is reachable only from the bell; Events is a separate sidebar item although Clubhouse puts Events as a tab inside Activity. | `nav` targets | Inconsistent with Clubhouse users' expectations (Help Center: "Activity hallway & Events"). |
| N-4 | **The room hijacks the page header.** While in a room, the top bar shows the room topic, ON AIR, badges and Leave on every page, so on Messages the header says the room title, not "Messages". | `renderTopBar()` (`this.currentChannel ? room meta : sectionTitle()`) | The user loses "where am I"; destructive "Leave quietly" sits on unrelated pages. |
| N-5 | **"Minimize" jumps to Hallway**, not back to where the user came from. | `case 'minimize-room'` | Breaks flow (e.g. user went Messages → Room → Minimize and lands in Hallway). |
| N-6 | **No back/forward and no breadcrumbs.** Sub-pages (house detail → members/chat/thread, conversation, replay, people list, self profile) each have their own ad-hoc "close" action (11 different `close-*` actions); there is no history, no Alt+←, no mouse back button. | `handleAction` | Users get stuck or lose context; each sub-page behaves differently. |
| N-7 | **Profile is a page-over-a-page.** The self profile (`selfProfileOpen`) renders instead of the current tab while that tab stays highlighted in the sidebar; other users open in a side sheet; people lists open inside the self profile. | `renderCurrentView()`, `inspectProfile()` | Active state lies; three different patterns for "a person". |
| N-8 | **Replay and Login are tabs without a home.** Opening a replay highlights nothing in the sidebar. | `currentTab = 'replay'` | User does not know how to get back. |
| N-9 | **Count badges mean different things.** Hallway shows the number of loaded rooms (12), Soundboard the number of pads (6), Messages unread count. | sidebar | Badges should signal "needs attention"; here they are noise and hide the meaningful ones. |
| N-10 | **"API & Config" is the only Settings entry** and mixes user settings (theme, language, audio devices, shortcuts) with developer tools (runtime mode, headers, API Health, experimental actions) on one long page. | `settings.ts` (9 sections) | Normal users are exposed to developer jargon; developer tools are not where developers look. |
| N-11 | **Double titles.** The top bar shows "Messages" and the page shows an H2 "Messages"; same for Discover, Events, Activity, Houses. | views + top bar | Wasted space; inconsistent hierarchy. |
| N-12 | **No global search / paste-link box.** Search lives only on Discover; the Clubdeck-style "paste a clubhouse.com link to open it" is hidden there. | Discover | The fastest desktop navigation (Ctrl+K) is missing. |
| N-13 | **No keyboard navigation between sections.** | — | Desktop users expect Ctrl+1…5, Ctrl+K, Ctrl+N, Ctrl+, . |
| N-14 | **Broken toast icons.** 26 toasts pass `'??'` as the icon (emoji lost in an encoding pass). | `showToast(…, '??')` | Looks broken. |
| N-15 | **Emoji as navigation icons** render differently per OS and theme (pale in light mode). | sidebar, top bar | Inconsistent visual language (see Phase 15). |

## 2. Principles

1. **Mirror Clubhouse where users already have muscle memory** (Hallway, Discover, Messages, Activity with an Events tab, Profile behind the avatar), and add the studio on top — do not invent a third model.
2. **One place per thing, one way to get there** (plus a keyboard shortcut). Secondary entry points are allowed only as contextual links (e.g. "Open house" on a room card).
3. **The room is a context, not a section.** Being in a room never changes the page you are on; it adds a persistent room bar (the cockpit) and a "Return to room" affordance.
4. **The header always says where you are**; sub-pages show a breadcrumb and a Back button.
5. **Badges only for attention** (unread, live).
6. **Settings for users, Advanced for developers.**

## 3. Target information architecture

```
Sidebar (sections)                     Top bar (global)
──────────────────────────────         ───────────────────────────────────────────
Clubbox  [LIVE]                        ‹ Back   Breadcrumb / page title
                                                         [ Search or paste a clubhouse.com link  Ctrl+K ]
CLUBHOUSE                                                [ + Start a room  Ctrl+N ]  (avatar ▾)
  🏠 Hallway            Ctrl+1                             avatar menu: Profile · Settings · Theme · Sign out
  🔍 Discover           Ctrl+2   tabs: Top · People (+Suggestions) · Rooms · Houses
  💬 Messages      (3)  Ctrl+3   tabs: All · DMs · Houses
  🔔 Activity      (•)  Ctrl+4   tabs: All · Events
STUDIO
  🎛 Soundboard         Ctrl+5
  🎙 Recordings                  (local recordings, clips, chapter files)  — new, P2

[ ● Now in: <room title>  ⟶ ]   ← only while in a room (replaces "Live Stage" item + LIVE badge)
[ YS  Yusuf Sahin  @yusuf_sahin ]  ← opens Profile (same as avatar menu → Profile)
```

Places and where they live:

| Place | Parent | Opens as | Back goes to |
| --- | --- | --- | --- |
| Hallway | section | page | — |
| Room (stage) | context | full page `#/room/:id` | previous page |
| Discover (Top/People/Rooms/Houses) | section | page with tabs | — |
| Friends suggestions | Discover › People | tab content | — |
| House detail › Members / Chat / Thread | Discover › Houses (or a room card / profile link) | page with breadcrumb | parent |
| Messages › Conversation | Messages | split view (list + thread) | list |
| Activity (All / Events) | section | page with tabs | — |
| Event detail | Activity › Events | side sheet | — |
| Replay / Highlight player | wherever opened | page with breadcrumb | previous page |
| Profile (me) | avatar menu / user card | page `#/me` (no sidebar item highlighted, avatar highlighted) | previous page |
| Profile (someone else) | anywhere | side sheet (same component everywhere) | closes sheet |
| People list (followers…) | Profile | page with breadcrumb | Profile |
| Soundboard | section | page | — |
| Recordings | section | page | — |
| Settings › General / Audio / Shortcuts / Account / Privacy & recording / Advanced | avatar menu, Ctrl+, | page with left sub-nav | previous page |
| Sign in | gate (not a tab) | full-screen gate | — |

Removed: sidebar items Friends, Houses, Events, Live Stage, Start a Room, API & Config; the floating Start button; top-bar envelope and bell (they become sidebar badges); room meta in the top bar outside the room page.

## 4. Behaviour rules

1. **Router + history.** A single router with routes (`#/hallway`, `#/discover/:tab`, `#/house/:id/:sub?`, `#/messages/:conversation?`, `#/activity/:tab`, `#/room/:id`, `#/replay/:id`, `#/me`, `#/me/:list`, `#/settings/:section`, `#/soundboard`, `#/recordings`). Back/Forward: toolbar ‹ button, Alt+←/→, mouse buttons 3/4, Backspace when no input is focused. Esc closes the topmost sheet/modal first.
2. **State per section is kept** (scroll position, selected tab, open conversation, search query) when you leave and come back.
3. **Exactly one active indicator**: the section of the current route; for `#/me` and `#/settings` the avatar is active; for `#/room` the "Now in" card is active.
4. **Room context**: the cockpit (bottom bar) is visible on every page while in a room and contains: room title (click → `#/room/:id`), mic, hand, record, Leave. "Minimize" = go Back (not to Hallway). Leaving a room returns to the page you were on before entering it.
5. **Header**: always the current place; sub-pages show `Section › Item › Sub` breadcrumbs; views do not repeat the title as an H2.
6. **Global search (Ctrl+K)**: one box for people, rooms, houses; pasting a clubhouse.com link (room, @user, house, event, replay) navigates directly.
7. **Shortcuts**: Ctrl+1…5 sections, Ctrl+K search, Ctrl+N start a room, Ctrl+, settings, Ctrl+Shift+R return to room; listed in Settings › Shortcuts and in a "?" overlay.
8. **Badges**: Messages = unread conversations; Activity = dot for unread; "Now in" card = live pulse; nothing else.
9. **Empty states** say what to do next and link to it (e.g. Activity empty → "Find people in Discover").
10. **Deep links from content**: house name on a room card → house page; person avatar → profile sheet; event → event sheet.

## 5. Mapping from today

| Today | Becomes |
| --- | --- |
| Hallway (count 12) | Hallway (no count) |
| Discover | Discover › Top/People/Rooms/Houses |
| Friends | Discover › People (suggestions + people you talk to) |
| Houses | Discover › Houses; house pages under it |
| Events | Activity › Events |
| Messages + ✉ | Messages (badge) |
| 🔔 | Activity (dot) |
| Live Stage + LIVE badge + mini player | "Now in" card + cockpit; room page via route |
| Soundboard (count 6) | Soundboard (no count) |
| Start a Room ×3 | top-bar button + Ctrl+N |
| API & Config | avatar menu › Settings (General, Audio, Shortcuts, Account, Privacy & recording, Advanced) |
| Sidebar user card + avatar | both open Profile (`#/me`); avatar has a menu |
| 11 `close-*` actions | Back / breadcrumb / Esc |
