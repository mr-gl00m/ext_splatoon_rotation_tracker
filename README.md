# Splatoon 3 Rotation Tracker

A Chrome extension that puts Splatoon 3's current and upcoming map rotations right in your browser toolbar. Check stages, modes, weapons, and countdowns at a glance without leaving whatever you're doing.

## Features

**Five game modes** — Regular Battle, Anarchy Battle (Series + Open), X Battle, Challenge Events, and Salmon Run, each with their own themed tab and color scheme.

**Live countdowns** — Every rotation shows a real-time countdown. When less than 15 minutes remain, the timer pulses yellow to let you know a change is coming.

**Salmon Run details** — Stage, weapon loadout with images, and King Salmonid (boss) display. Big Run events get a special badge.

**Splatfest banner** — When a Splatfest is active or scheduled, a banner appears at the top showing the theme, teams, and timing.

**Notifications** — Optional per-mode desktop notifications when rotations change. Configure exactly which modes you care about.

**Smart refresh** — The extension schedules its next data fetch 1 minute after the current rotation ends, so you always see fresh data without unnecessary polling. A 30-minute fallback ensures data stays current even if scheduling misses.

**Offline support** — If the network is unavailable, cached rotation data is served with a visible offline indicator. The extension retries automatically.

**Splatoon-styled UI** — Custom Splatfont2 typography, ink-splat transitions between tabs, mode-colored backgrounds with subtle texture, animated stickers, and decorative elements matching Splatoon 3's aesthetic.

**4-tier image fallback** — Stage images resolve through: mode-specific directory, shared directory, remote API URL, then a data URI placeholder. You'll always see something, even if local images are incomplete.

## Installation

### Manual (Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the extension folder
5. The extension icon appears in your toolbar — click it to open

### Font Setup

The extension uses the Splatfont2 typeface for an authentic look. Place `Splatfont2.ttf` in the `fonts/` directory:

```
fonts/Splatfont2.ttf
```

The UI will fall back to Rubik > Arial > sans-serif if the font file is missing.

## Usage

1. **Click the extension icon** to open the popup
2. **Switch tabs** to browse different game modes — your last tab is remembered
3. **View rotations** — current and next, with stages, rules, time ranges, and live countdowns
4. **Click the title** to open [splatoon3.ink](https://splatoon3.ink) in a new tab
5. **Hit Refresh** to manually fetch new data (30-second cooldown to avoid API spam)
6. **Open Settings** (gear icon) to configure which modes send desktop notifications

## Project Structure

```
├── manifest.json          # Chrome Extension manifest (MV3)
├── background.js          # Service worker — data fetching, alarms, notifications
├── popup.html             # Extension popup markup
├── popup.js               # Popup UI logic — tabs, display, countdown timers
├── utils.js               # Shared utilities — time formatting, stage ID mapping
├── salmonRun.js           # Salmon Run data processor (regular + Big Run)
├── styles.css             # All styling — themes, animations, layout
├── fonts/
│   └── Splatfont2.ttf     # Custom Splatoon typeface (not included)
└── images/
    ├── icon16/48/128.png  # Extension icons
    ├── battle-bg-pattern-blue.jpg
    ├── paper-tear-overlay.png
    ├── little-buddy.*.png
    ├── salmon-character.png
    ├── squid.svg
    ├── sticker-*.png      # Decorative sticker images
    └── stages/
        ├── regular/       # Regular Battle stage images
        ├── anarchy/       # Anarchy Battle stage images
        ├── xbattle/       # X Battle stage images
        ├── salmon/        # Salmon Run stage images
        ├── shared/        # Fallback stage images (any mode)
        └── placeholder.jpg
```

## Stage Images

Stage images are resolved by converting stage names to filesystem-safe IDs:

```
"Hagglefish Market"  →  hagglefish_market.jpg
"Museum d'Alfonsino" →  museum_dalfonsino.jpg
"Barnacle & Dime"    →  barnacle_and_dime.jpg
```

Place `.jpg` images in the appropriate `images/stages/<mode>/` directories. The `shared/` directory acts as a cross-mode fallback. If no local image exists, the extension tries the remote URL from the API, then falls back to a placeholder.

## How It Works

### Data Flow

1. **`background.js`** fetches `splatoon3.ink/data/schedules.json` — a single API call for all data
2. Battle rotations are processed by `processRotationData()`, Salmon Run by `SalmonRun.processSalmonRunData()`
3. Results are merged into one object and written to `chrome.storage.local` in a single operation
4. The service worker schedules the next fetch via `chrome.alarms` based on the earliest rotation end time
5. **`popup.js`** reads from storage on open and renders the current tab's data
6. A 1-second interval updates countdown timers; when a rotation ends, an auto-refresh fires

### Notifications

When new data arrives, `sendRotationNotifications()` compares the new current rotation's `startTime` against the previous one. If it changed and that mode's notifications are enabled, a Chrome notification is dispatched. Big Run events get a special "BIG RUN IS HERE!" title.

### Storage

| Store | Purpose |
|-------|---------|
| `chrome.storage.local` | Rotation data cache, last-updated timestamp, offline flag, last-selected tab |
| `chrome.storage.sync` | Notification preferences (synced across devices) |

## Permissions

| Permission | Reason |
|------------|--------|
| `alarms` | Schedule smart refresh after rotation ends |
| `storage` | Cache rotation data and sync notification settings |
| `notifications` | Desktop alerts when rotations change |
| `host_permissions: splatoon3.ink` | Fetch schedule data from the API |

## Data Source

All rotation data comes from [splatoon3.ink](https://splatoon3.ink/), an unofficial community API. This extension is not affiliated with Nintendo or splatoon3.ink.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

### Adding New Stages

Most new stages work automatically via the `normalizeStageId()` function in `utils.js`. If a stage name doesn't normalize correctly, add an entry to `stageIdOverrides` and place the corresponding image in `images/stages/shared/`.

## License

This project is licensed under the MIT License.

## Acknowledgements

- [splatoon3.ink](https://splatoon3.ink/) for the rotation data API
- Nintendo for creating Splatoon 3

