# Command Centre

**[⬇ Download the latest Windows installer](https://github.com/BummbleeBeee/command-centre/releases/latest)**: get `Command Centre_x.y.z_x64-setup.exe`, run it, and open Command Centre from the Start menu (Windows 10/11, 64-bit). The installer isn't code-signed, so SmartScreen may warn: click *More info* → *Run anyway*.

A customisable, Stream Deck-style launcher for **Windows 10 and 11**, built with Tauri 2, React, TypeScript and Rust.
It works in four display modes that share the same buttons, pages and settings:

| Mode | What it is |
|---|---|
| **Floating panel** | Draggable, resizable glass panel with page tabs, a button grid, search and widgets. Remembers its position and size. |
| **Slim sidebar** | A vertical rail docked to the left or right screen edge. Expands on hover to show labels and pages. |
| **Top notch** | A small pill at the top centre of the screen that expands into a command bar with media, clock and system stats widgets. |
| **Tiny button** | A 62 px floating orb you can drag anywhere. Click it to open a radial launcher. |

### New in this version

| Feature | Where | How it works |
|---|---|---|
| **Multiple monitors** | Settings → **Monitors** | A map of your real monitor layout. Click monitors to show or hide Command Centre on them (for example 2 of 3). Each monitor gets its own launcher window. |
| **Profiles per monitor** | Settings → Monitors → Profiles | A profile = display mode + which pages it shows (for example "Main" floating panel with every page, "Side launcher" sidebar with only Coding). Each monitor picks a profile. Buttons are shared. |
| **Real app icons** | Automatic; Settings → Appearance → *Use real app icons* | Icons come straight from Windows (Explorer, your browser, VS Code, Terminal, Store apps, folders…) at 96 px. Icons you chose yourself are kept. |
| **Claude + ChatGPT** | "Tools & AI" page; Tools → **Ask AI** | Buttons open the Claude / ChatGPT desktop apps if installed, otherwise claude.ai / chatgpt.com. **Ask AI** sends one typed question to Claude, ChatGPT or both at once, in your browser with your existing sign-ins. No API keys. |
| **Spotify player** | Tools → **Spotify**; album art in the dock and notch | Album art, title and artist, progress bar (click to seek), play/pause, previous/next, shuffle, repeat, Open Spotify. Prefers Spotify's session when several apps play. |
| **Sticky notes** | Tools → **Sticky notes** | Coloured notes that save automatically and are included in backups and exports. |
| **Alarms & timers** | Tools → **Alarms & timers** | Alarms by time with weekday selection (or every day) and "ring once". Timers from 1 min to 7 days. They ring with sound and a Windows notification, even while the app is hidden in the tray. Snooze 5/10 min or Stop. |
| **Keep awake** | Tools → **Keep awake**; "Keep awake 1 h" button | Stops the PC (and optionally the screen) from sleeping for 15 min to 8 h, a custom number of minutes, or until you turn it off. A ☕ chip in the title bar shows the time left. |

| **AI chat panel** | Tools → **AI chat** (✨ in any title bar) | Type a prompt and the answer streams back inside Command Centre, from Claude, ChatGPT, or **both side by side**. Uses your own API keys (Anthropic / OpenAI), stored in **Windows Credential Manager**, never in config.json, backups or exports. Claude uses `claude-opus-5-5` with server-side refusal fallback. The ChatGPT model can be picked from your account's model list. The 🌐 button sends the prompt to the websites instead (no key needed). |
| **Colour themes** | Settings → Appearance | 16 presets: Midnight, Aurora, Sunset, Rose, Forest, Ocean, Candy, Lime, Gold, Neon, Graphite, Mocha, Paper, Ice, Lavender, Peach. Plus a custom theme and any accent colour. |
| **Glass styles** | Settings → Appearance | Frosted, Clear, Tinted (accent-coloured glass), Solid, Neon (glowing edge). Plus a panel tint gradient. |
| **Animated backgrounds** | Settings → Appearance | Rain, Snow, Stars, Aurora, Bubbles, Fireflies, Matrix, Waves, with a strength slider. 30 fps cap, paused while hidden, and off when Animations = Off. |
| **Hub circle** | Tools → **Hub circle**; tray → *Show / hide hub circle* | A small detachable circle (drag it anywhere) showing the time. Click it and it opens into a big circle with the clock, the music playing (with album art and controls), **upcoming classes, alarms and timers**, your latest sticky note, and up to 12 **pinned apps** around the edge. Right-click for settings. |
| **My classes** | Tools → **My classes** | A weekly timetable (name, days, start/end, room, colour) with a week view. It feeds the hub's "upcoming" list ("now · until 10:30", "in 25 min", "tomorrow 09:00"). |
| **Real app images everywhere** | Automatic | Every button shows a real Windows app image. Non-app buttons use the matching Windows app: Volume → Sound, shortcuts → On-Screen Keyboard, notes → Sticky Notes, alarms/timers → Clock, page buttons → that page's main app. |

| **Spotify playlists** | Tools → Spotify; the Spotify button's ▾ arrow; hub → Music | Your playlists with cover art. Click one to play it (with Spotify Premium and Spotify open; otherwise it opens in the Spotify app). One-time setup: create a free app at developer.spotify.com, add redirect URI `http://127.0.0.1:43821/callback`, paste its Client ID and click Connect (PKCE sign-in, no secret; token stored in Credential Manager). |
| **App dropdowns** | ▾ arrow on a button; editor → *Dropdown* | A tall panel opening from the button: the Spotify player + playlists, or your own items (websites, folders, apps or projects with arguments). Browser comes with YouTube / Gmail / GitHub / Wikipedia. |
| **Editable widgets** | Settings → **Widgets** (or right-click the widget bar) | Choose and order: Music, System stats, Volume, Clock, Next up, Latest note, Keep awake. Used in the panel dock and the notch. |
| **Page management everywhere** | Right-click any page tab, notch chip or sidebar page; the ✎ button next to + | Rename, duplicate, move, add or delete any page, including the built-in ones. |
| **Hub ring** | The hub circle | The centre shows time, date, what's next and what's playing. The ring has six sections (Apps, Music, Notes, Up next, Tools, AI). Click a section and a curved panel slides out with pinned apps and links, the player and playlists, editable notes, upcoming items and a timer dial, tools, or a compact AI chat. The panel opens on the side with room (or always left/right). |

### Latest additions

| Feature | Where | How it works |
|---|---|---|
| **Notch line mode** | Settings → General → Notch → *Line* | The notch becomes a thin line at the top of the screen; hover or click it to open the full notch. The open notch scrolls when widgets don't fit, and has a ✕ to close it. |
| **App search when adding buttons** | Button editor → search box at the top | Type "chrome" and pick from installed apps; the real app icon is filled in automatically. |
| **Dot-matrix clock** | Notch, sidebar, small hub circle | Dot time display (black dots on the light circle). |
| **Sidebar** | Settings → General → Sidebar; Monitors tab | Dot clock and current song at the top, icon-only pages, left/right per monitor, auto-hide into a thin edge strip, and **Pin** (reserves screen space like the taskbar on every monitor). |
| **Settings beside the launcher** | Any ⚙ button | Settings and tools open in their own window, centred on that monitor, while the sidebar/notch stays open. |
| **Motion controls** | Settings → Appearance → Motion | Animation speed, easing and slide-in. |
| **Keep awake dropdown** | Click the Keep awake widget; hub → Tools | A smooth dropdown with 30 min / 1 h / 2 h / 4 h / Until off and a **round dial** for any time from 1 min to 12 h (drag, scroll or arrow keys). |
| **Timer dial** | Hub → Up next | Presets (5/10/25/60 min) or the same dial; running timers can be cancelled. |
| **Spotify playlists dropdown** | ▾ on the Spotify widget | All your playlists in a dropdown; click to play. |
| **Hub Tools** | Hub → Tools (replaces Pages) | Volume knob with mute, brightness knob (laptops), keep awake, and quick tools: notes, alarms, classes, Spotify, AI, screenshot, show desktop, Task Manager, lock. |
| **Links** | Hub → Apps, below the apps | Websites you open often: type an address (e.g. `youtube.com`), optional name; click to open. Edit mode removes them. |
| **Stay on desktop** | Hub → Tools, or hub settings | The hub circle stays on the desktop (even after Show Desktop) but **below** all open apps; while it's open it comes to the front. |
| **Two modes on one monitor** | Settings → General → “Also show on this monitor”, or Settings → Monitors | Run any two modes together on the same screen, e.g. the notch **and** the sidebar. Each keeps its own position. |
| **Icons-only sidebar** | Pinned sidebar → button above Settings | Stops the pinned sidebar expanding when you hover it; click again to turn hover-expand back on (double-click the clock still expands it). |

New step types for buttons: **Keep PC awake** (minutes / until off / turn off), **Start a timer**, and **Open a tool** (Spotify, notes, alarms, keep awake, Ask AI).

---

## Install

1. Run `Command Centre_1.0.0_x64-setup.exe` (in `release\`, or after building in `src-tauri\target\release\bundle\nsis\`).
2. It installs per user (no admin rights needed) and adds a Start-menu entry.
3. Microsoft Edge WebView2 is required. It's built into Windows 11 and current Windows 10. If it's missing, the installer downloads it.

There's also a portable executable: `release\command-centre.exe`. Copy it anywhere and run it; it still needs WebView2.

Because the app isn't code-signed, Windows SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.

## Everyday use

- **Run a button:** click it. Multi-step buttons show progress, and you can cancel them.
- **Edit:** right-click a button and choose Edit, Duplicate, Move to page or Delete. In the notch and tiny-button modes, right-click opens the editor directly.
- **Add:** the dashed **+** tile, or **+** in the sidebar, notch or radial menu.
- **Reorder:** drag buttons in the panel or sidebar. Drop a button on a page tab to move it to that page.
- **Pages:** click a tab. Double-click a tab to rename it, right-click for duplicate/move/delete, or use **+** for a new page. Shortcut: `Ctrl+1…9`.
- **Search:** `Ctrl+F` or `/` in the floating panel. `Enter` runs the first match.
- **Show/hide:** the global hotkey (default `Ctrl+Alt+Space`) or left-click the tray icon.
- **Switch mode:** the mode icon in the panel title bar, Settings → General, or the tray menu → Display mode.
- **Quit:** tray menu → Quit. Closing the window only hides it to the tray.

## Buttons and action sequences

Every button runs a list of **steps**, top to bottom:

| Step | Notes |
|---|---|
| Launch application | `.exe`, `.lnk`, `.url`, `.bat`, Store apps (`shell:AppsFolder\…`) or commands like `wt.exe`. Supports arguments, a start-in folder, *run as administrator* (Windows asks via UAC) and *skip if already running*. **Find app** lists Start-menu and Store apps. |
| Open folder | Any folder, including `%USERPROFILE%\Pictures` or `shell:Downloads`. |
| Open website | http/https only. Opens in your default browser. |
| Close application | Sends a **normal close request** (like clicking ✕) to every window of the app, so the app can ask you to save unsaved work. Nothing is ever force-killed. Core Windows processes are refused. |
| System control | Show desktop, Task view, File Explorer, Task Manager, Windows Settings, Quick settings, Screen snip, media play/pause/next/previous, volume up/down/mute, Lock, Sleep. |
| Volume / Brightness | Set, raise or lower by a percentage. Volume can also mute, unmute or toggle mute. |
| Keyboard shortcut | Sends a key combination to the app you were using before you clicked Command Centre. |
| Wait | Pause between steps (for example, let an app finish opening). |
| Ask for confirmation | Cancels the remaining steps if you answer Cancel. |
| Condition | "If *App.exe* is (not) running: continue, otherwise skip the next N steps or stop." |
| Go to page | Switch the launcher to another page. |
| Run saved sequence | Reuse a named sequence (nesting is limited to 5 levels to prevent loops). |

Per button you can also set: a confirmation prompt before running, stop at first error vs. keep going, per-step *continue on error*, a name, an icon, a colour, a tooltip and a **global hotkey**. **Test run** in the editor runs the steps and shows a log for each step.

**Reusable sequences** (Settings → Sequences) can be linked to any number of buttons. Four presets are included:

- **Coding Mode:** VS Code (found automatically if installed), Windows Terminal and GitHub.
- **Photography Mode:** Lightroom, Photoshop, darktable, Affinity Photo or Photos (whichever is found first), plus your Pictures folder.
- **Editing Mode:** DaVinci Resolve, Premiere Pro or Clipchamp, plus your Videos folder.
- **Clean Up:** asks first, then politely asks VS Code, DaVinci Resolve and Windows Terminal to close.

If a preset app isn't installed, its step is marked "app not found". Edit it and use **Find app** or **Browse**.

## Customisation

Settings → Appearance: dark, light or custom theme (background, surface and text colours), accent colour, opacity, corner radius, Windows acrylic blur, button size, grid spacing, labels on/off, widgets on/off, and full, reduced or no animations.
Settings → Pages: per-page icon, name, grid columns (1–10), and background (none, six gradients, or your own image up to 1 MB).
Icons: about 70 built-in line icons, your own **PNG / SVG / ICO / JPG / WebP / GIF** (up to 1 MB), the icon extracted from the app itself, or an emoji.

## System integration

- **Tray icon:** left-click to show/hide. The menu has Show/hide, Display mode, Settings, Pause/resume global hotkeys and Quit.
- **Global hotkeys:** one to show/hide, plus any number of per-button hotkeys. A hotkey needs Ctrl, Alt or Win (or an F-key) so it can't hijack normal typing. If another app already owns a combination, Settings → Shortcuts tells you.
- **Launch at startup:** Settings → General. You're asked for consent before it's enabled. It uses the standard per-user Run registry entry and can also be turned off in Windows Settings → Apps → Startup.
- **Volume** uses the Windows Core Audio API (default output device).
- **Brightness** uses the WMI brightness interface, which Windows only provides for built-in laptop/tablet screens. Settings → System shows whether your display supports it.
- **Media widget** shows what's playing in any app that reports to Windows media controls (Spotify, browsers, Media Player and others).
- **Single instance:** launching the app a second time brings the existing window forward.

## Configuration, backup and restore

All data lives in:

```
%APPDATA%\com.commandcentre.app\
├── config.json          ← pages, buttons, sequences, settings, profiles, per-monitor windows, alarms and notes
├── backups\             ← automatic backups (newest 30 kept)
└── config.invalid-*.json  (only if a damaged config was ever found; never deleted)
```

- Saving is **atomic** (written to a temp file, then renamed), so a crash can't leave a half-written config.
- A backup is made **automatically once a day**, and **before every import or restore**. You can also click **Back up now**.
- **Export** writes a single portable `.json` file. **Import** validates the file first and shows what it contains, then lets you **Replace everything** (after confirming; a backup is made first) or **Add its pages to mine**. Invalid files are rejected with an explanation, and nothing is changed.
- The config has a `schemaVersion` (currently **3**). Older formats (the early prototype's version 1/2 files) are migrated automatically. Files from a newer version are refused rather than damaged.
- If `config.json` is ever corrupt, it's moved aside to `config.invalid-<time>.json`, defaults are loaded, and you're told how to restore a backup.

Settings → Backup → **Open data folder** opens this folder in Explorer.

## Troubleshooting

| Problem | Fix |
|---|---|
| The window disappeared | It's in the tray. Click the tray icon or press `Ctrl+Alt+Space`. |
| "Could not register Ctrl+Alt+…" | Another app owns that hotkey. Choose a different one in Settings → Shortcuts. |
| A shortcut step does nothing in some app | Windows blocks simulated keys into apps running as administrator unless Command Centre also runs as administrator. |
| Brightness says "not supported" | Your display has no Windows brightness interface (typical for desktop monitors). Use the monitor's buttons. |
| A launch step says "File not found" | The app moved or was uninstalled. Edit the button and use **Find app** or **Browse**. |
| "Skip if already running" doesn't detect an app started from a shortcut | The check uses the target's file name. Point the step at the `.exe` instead of the `.lnk`. |
| SmartScreen warning when installing | The build isn't code-signed. Click More info → Run anyway. |
| Start completely fresh | Quit from the tray, then rename or delete `%APPDATA%\com.commandcentre.app\config.json`. |

## Building from source

Prerequisites: Node.js 20+, Rust (stable, MSVC toolchain), and Visual Studio 2022 Build Tools with **MSVC v143** and the **Windows 10/11 SDK**.

```powershell
npm install
npm run tauri dev        # run with hot reload
npm test                 # 43 frontend unit tests (schema v1-v5 migration, action engine, hotkeys, upcoming, themes, app images)
cd src-tauri; cargo test --lib; cd ..   # 24 Rust unit tests (geometry, monitors, URL/process safety, shortcuts, alarms, AI request/stream parsing, config I/O)
cd src-tauri; cargo test --lib -- --ignored; cd ..   # 5 end-to-end tests on real Windows APIs (launch + graceful close of Character Map, volume, brightness, real icons, media session)
npm run tauri build      # release exe + NSIS installer
```

Output: `src-tauri\target\release\command-centre.exe` and `src-tauri\target\release\bundle\nsis\Command Centre_1.0.0_x64-setup.exe`.

### Project layout

```
src/                    React + TypeScript UI
  App.tsx               shell: window modes, persistence, hotkeys, tray events, action running
  modes/                FloatingMode, SidebarMode, NotchMode, TinyButtonMode, OverlayView
  editor/               button/sequence editor, step cards, icon picker, installed-app picker
  settings/             settings tabs (general, appearance, pages, sequences, shortcuts, system, backup, about)
  engine/runner.ts      action-sequence engine (pure, unit-tested)
  lib/schema.ts         defaults, validation, migration (pure, unit-tested)
  lib/api.ts            typed wrappers around the Rust commands
src-tauri/src/          Rust backend
  launcher.rs           ShellExecuteEx launching, URL validation, app discovery, icon extraction
  processes.rs          process detection, graceful WM_CLOSE closing with protected-process list
  system.rs             volume (Core Audio), brightness (WMI), SendInput shortcuts, system actions, media session, stats
  window_mode.rs        DPI-aware geometry for the four modes against the monitor work area
  config.rs             atomic config writes, backups, import/export
```

### Security model

- The web layer has **no filesystem, shell or opener plugin access**. Capabilities grant only window controls, dialogs, global-shortcut and autostart. Every file and process operation is a validated Rust command.
- URLs are restricted to http/https. Backup names are checked against path traversal. Import/export only touch `.json` files, with a size limit.
- Processes are only ever asked to close (WM_CLOSE). Core Windows processes and Command Centre itself are refused.
- Strict Content-Security-Policy. Custom icons are stored as `data:` images and rendered in `<img>`, so SVG scripts can't run.

## Known limitations

- **Brightness** works only on displays that expose the Windows WMI brightness interface (built-in laptop/tablet panels). External monitors over DDC/CI aren't supported.
- **Acrylic blur** fills the window rectangle, so with large corner radii the corners show square blur. It's off by default.
- **Dropping files from Explorer** onto the panel to create buttons isn't supported (in-app drag-and-drop is). Use **Find app** or **Browse** instead.
- **Spotify Connect** remote control of other devices (phone, speakers) isn't included: it needs a Spotify developer client ID. The player controls Spotify on this PC through Windows media controls.
- **Alarms** only ring while Command Centre is running (it lives in the tray; turn on *Launch at startup*). They can't wake a sleeping PC.
- **AI chat** needs API keys, which are billed per use by Anthropic and OpenAI and are separate from Claude Pro / ChatGPT Plus subscriptions. Without keys, use the 🌐 "open in browser" option. Chats are kept only for the current session.
- **Classes** are entered by hand: there is no Outlook / Google Calendar sync (that would need sign-in to those accounts).
- **Animated backgrounds** use some GPU/CPU while visible (capped at 30 fps). Choose None for the lowest resource use.
- Simulated shortcuts can't reach elevated (administrator) apps unless Command Centre is elevated too. This is a Windows security rule.
- The installer isn't code-signed (needs a paid certificate), so SmartScreen will warn on first install.
