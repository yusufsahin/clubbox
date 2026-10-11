# Clubbox — Navigation (v2, simplified)

_Version 2.0 · 2026-10-11 · Replaces v1 (too heavy: hash router, history stack, mouse buttons, Backspace navigation, per-section state cache, global Ctrl+K search, Recordings page, six settings sections, section shortcuts). Acceptance: `features/navigation.feature`._

## 1. What is wrong today (kept from the audit)

1. Twelve places in two sidebar groups; related things split (Discover / Friends / Houses, Activity / Events), an action ("Start a Room") mixed with places.
2. Duplicate entry points: Messages ×2, Profile ×2, Start a Room ×3 (sidebar, top bar, floating button), room shown ×3 (Live Stage item, LIVE badge, mini player).
3. While in a room, the top bar on every page shows the room title and "Leave" instead of the page name.
4. "Minimize" always jumps to Hallway.
5. Every sub-page has its own close button (11 different close actions); no consistent way back.
6. Own profile replaces the page while the old section stays highlighted.
7. Counts on Hallway (rooms loaded) and Soundboard (pads) are noise.
8. One "API & Config" page mixes user settings with developer tools.
9. Pages repeat the header title as a heading.
10. 26 toasts show "??" instead of an icon.

## 2. The simple model

```
SIDEBAR                                TOP BAR
──────────────────────────             ─────────────────────────────────────────────
Clubbox [LIVE]                         [←]  Page title                [+ Start a room]
                                       (← only on sub-pages)
🏠 Hallway
🔍 Discover                            BOTTOM BAR (only while in a room, on every page)
💬 Messages        3                   ─────────────────────────────────────────────
🔔 Activity        •                   ● Room title (click = open room)  🎙 ✋ ⏺  Leave
🎛 Soundboard

[YS] Yusuf Sahin            ⚙
     @yusuf_sahin
 (click = my profile)   (gear = Settings)
```

Five places, one action, one room bar, one way back.

| Today | Becomes |
| --- | --- |
| Hallway | Hallway (no count) |
| Discover, Friends, Houses | **Discover**: search box on top, then "People you may know", then "Houses". A house opens as a sub-page. |
| Messages + ✉ in top bar | **Messages** in the sidebar with the unread count; ✉ removed |
| 🔔 in top bar, Events | **Activity** in the sidebar with a dot; events appear in the Activity list when the API returns them (no separate tab) |
| Live Stage item, LIVE badge, mini player | the **bottom bar** while in a room; the room itself is a page you open from the hallway or the bottom bar |
| Soundboard (count 6) | Soundboard (no count) |
| Start a Room ×3 | one **Start a room** button in the top bar |
| Profile card + top-bar avatar | the **profile card** at the bottom of the sidebar opens my profile; other people open in the side sheet (unchanged) |
| API & Config | **⚙ Settings** next to the profile card: one page — General (language, theme, zoom), Audio, Account; **Advanced** collapsed at the bottom for developer tools |
| 11 close buttons | **← back** in the top bar on every sub-page, and **Esc** |

## 3. Rules

1. **Sub-pages** (house, conversation, replay, people list, my profile, settings) show ← in the top bar. ← and Esc return to the page they were opened from. Implementation: a small `previous` stack of views in the app state — no URL router.
2. **The room** never changes the header of other pages. Opening the room shows the room page with its own header (topic, share, Minimize, Leave). **Minimize = ←** (back to where you were). Leaving the room also returns there.
3. **One highlighted item**: the current section; for my profile and Settings, the profile card / ⚙ is highlighted instead.
4. **Badges** only for Messages (unread count) and Activity (dot).
5. **No duplicate headings**: the page title lives in the top bar only.
6. **Toasts** always use a real icon.
7. Keep existing hotkeys (Space, H, R, C, 1–9). Add only **Esc** (back/close) and **Ctrl+N** (start a room).

Not doing (kept out on purpose): URL routes, forward history, mouse back/forward buttons, Backspace navigation, global Ctrl+K search (Discover already has search; pasting a link there keeps working), section shortcuts, a Recordings page, six settings sections.
