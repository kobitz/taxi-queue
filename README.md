# Taxi Stand Queue

A real-time taxi queue management web app built for use on mobile and desktop. Tracks which taxis are at the stand, in holding, or waiting in queue — with live sync across multiple devices.

---

## Pages

| File | URL | Description |
|------|-----|-------------|
| `index.html` | `/` | **Live view** — read-only, updates in real time; highlights your taxi number |
| `stand.html` | `/stand.html` | **Editable queue** — add, remove, reorder taxis; syncs to all devices |
| `personal.html` | `/personal.html` | **Personal queue** — same interface, saved locally to your browser only |
| `history.html` | `/history.html` | **Change log** — live feed of every add, remove, load, and move |

Hosted at: `https://kobitz.github.io/taxi-queue`

---

## How It Works

### Queue Grid

The queue is displayed as a grid of numbered tiles. Each row holds up to 10 positions (or 5 in Bigger Tiles mode).

- **Grey "Loading" tile** — the first slot. Tap once to prime it — the tile text changes to "Loaded", a yellow border appears, and the first queue tile highlights in yellow. Tap again to remove that taxi as loaded. You can also drag any queue tile directly onto it.
- **Blue tiles (positions 1–4)** — Stand
- **Purple tiles (positions 5–8)** — Holding
- **Light blue tiles (positions 9+, and all overflow rows)** — general queue
- **Grey "Filler" tile** — use when a position is unknown. Unlimited, always available at the start of the Not in Queue list.
- **"adjust highest taxi number" tile** — always at the end of Not in Queue. Tap it and type a number to change the highest taxi number shown (minimum 140 on the shared queue, no minimum on personal). The new value syncs to all devices via Firebase.

Row labels (10, 20, 30…) appear on the left when the queue exceeds one row.
Column labels (1–9) and group labels (Stand / Holding) appear above the grid.

### Not in Queue

Taxis not currently in the queue live here, always sorted numerically (1–140). The Filler tile is always first.

---

## Interactions

### Adding to the Queue

- **Tap** any tile in the Not in Queue list to add it to the end of the queue
- **Tap the "+" tile** (the next open slot in the queue grid) to type a taxi number directly via the dialpad — on desktop, press Enter or click away to confirm.
- **Drag** a tile up into a specific position in the queue

### Removing from the Queue

- **Tap twice** any queue tile to remove it — first tap highlights it and shows a "Drop?" label, second tap removes it and returns it to Not in Queue
- **Tap "Loading"** once to prime it (first queue tile highlights yellow), then tap again to remove that taxi and log it as Loaded
- **Drag** a queue tile onto the "Loading" tile to remove it directly (no two-tap required)
- **Drag** a queue tile back down to the Not in Queue area to remove it

### Clearing the Queue

- **Hold the "Loading" tile** (~350ms) to arm it — red border, yellow "Clear All" text
- **Tap once** → changes to red "Are you sure?"
- **Tap again** → queue is cleared
- **Tap anywhere else** at any stage to cancel

### Reordering

- **Hold and drag** any queue tile to move it to a new position
- A gap appears showing exactly where it will land when dropped
- Dropping anywhere in the gap (before or after the shifted tile) works

### Scrolling vs Dragging

- A quick swipe scrolls the page normally
- Holding a tile for ~350ms activates drag mode

---

## My Taxi Highlight

On first load of `index.html` or `personal.html`, you are prompted to enter your taxi number. Your tile is then highlighted with a green glow wherever it appears — in the queue or in the Not in Queue list. In the Stand and Holding zones, your tile also gets extra brightness on top of the zone color. This number is saved per device per browser.

---

## Tile Size

Tap the **Bigger Tiles / Smaller Tiles** button (top right) to toggle between 10 columns and 5 columns. The preference is saved per device per browser.

---

## Live Sync (`stand.html` and `index.html`)

Powered by [Firebase Realtime Database](https://firebase.google.com/products/realtime-database). Any change made in `stand.html` appears on all open instances within milliseconds.

A **LIVE / SAVING… / OFFLINE** indicator appears in the top right corner.

The first time you use `stand.html` on a new device, you'll be prompted to enter a device name. This name appears in the change history.

---

## History (`history.html`)

Every action on `stand.html` is logged:

| Action | Meaning |
|--------|---------|
| **Added** | Taxi moved into the queue |
| **Removed** | Taxi returned to Not in Queue |
| **Loaded** | Taxi removed via the Loading tile (tap or drag) |
| **Moved** | Taxi reordered within the queue |

Entries show the taxi number, device name, and a relative timestamp. Filter by action type or search by taxi number or device name. History can be cleared with the Clear All button.

---

## Personal Mode (`personal.html`)

Identical to `stand.html` but stores data in the browser's localStorage instead of Firebase. No sync, no history, no device name prompt. Shows **SAVED** instead of LIVE. Prompts for your taxi number (same as `index.html`) to highlight your tile. Useful for personal tracking that doesn't affect the shared queue.

---

## Firebase Setup

The app uses Firebase Realtime Database at:
```
https://taxi-queue-3e591-default-rtdb.firebaseio.com
```

Database rules (set in the Firebase console under Realtime Database → Rules):
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

---

## Deployment

Hosted via GitHub Pages from the `main` branch root of `kobitz/taxi-queue`.

To update any page, edit the file directly on GitHub and commit. Changes go live within ~30 seconds.
