# Taxi Stand Queue

A real-time taxi queue management web app built for use on mobile and desktop. Tracks which taxis are at the stand, in holding, or waiting in queue — with live sync across multiple devices.

---

## Pages

| File | URL | Description |
|------|-----|-------------|
| `index.html` | `/` | **Live view** — read-only, updates in real time; highlights your taxi number; 10-11 request button |
| `stand.html` | `/stand.html` | **Editable queue** — add, remove, reorder taxis; syncs to all devices |
| `personal.html` | `/personal.html` | **Personal queue** — same interface, saved locally to your browser only |
| `history.html` | `/history.html` | **Change log** — live feed of every add, drop, load, and move |
| `taxi-auth.js` / `taxi-config.js` | — | Dispatcher sign-in and Firebase settings |
| `taxi-sound.js` | — | Key click and 10-11 alert sounds |
| `database.rules.json` | — | Database security rules (copy into Firebase console) |

`stand.html` and `personal.html` are thin pages that share one editor: `taxi-editor.js` (logic) and `taxi-editor.css` (styles). The page sets its mode (`stand` = Firebase, shared queue; `personal` = this browser only) and the shared files do the rest, so a fix or feature is made once. `index.html` (live view) and `history.html` are separate.

**Updating shared files:** the pages load them as `taxi-editor.js?v=1` and `taxi-editor.css?v=1`. After changing either file, bump the `v=` number in both `stand.html` and `personal.html` so phones fetch the new version instead of a cached one.

Hosted at: `https://kobitz.github.io/taxi-queue`

---

## How It Works

### Queue Grid

The queue is displayed as a grid of numbered tiles. Each row holds up to 10 positions (or 5 in Bigger Tiles mode).

- **Grey "Loading" tile** — the first slot. Tap once to prime it — the tile text changes to "Loaded", a yellow border appears, and the first queue tile highlights in yellow. Tap again to remove that taxi as loaded. You can also drag any queue tile directly onto it.
- **Grey "10-11" tile** — only on `index.html`. Hold (~350ms) to arm it — yellow border, "Request 10-11?". Tap once → red "Are you sure?". Tap again → sends a request to `stand.html`. Only works if your registered taxi number is currently in the queue. Tap anywhere else to cancel.
- **Blue tiles (positions 1–4)** — Stand
- **Purple tiles (positions 5–8)** — Holding
- **Light blue tiles (positions 9+, and all overflow rows)** — general queue
- **Grey "Filler" tile** — use when a position is unknown. Tap to add to the end of the queue, or drag to a specific position.
- **Grey "Filler In-Front" tile** — same as Filler but tap adds to the front of the queue instead of the end.
- **"adjust highest taxi number" tile** — always at the end of Not in Queue. Tap it to open the Dial Pad and type a number to change the highest taxi number shown (minimum 140 on the shared queue, no minimum on personal). The new value syncs to all devices via Firebase.

Row labels (10, 20, 30…) appear on the left when the queue exceeds one row.
Column labels (1–9) and group labels (Stand / Holding) appear above the grid.

### Not in Queue

Taxis not currently in the queue live here, always sorted numerically (1 to the highest taxi number, default 140). Filler In-Front and Filler tiles are always first.

This section has two tabs: **Dial Pad** (see below) and **Not in Queue** (the tile list). `stand.html` and `personal.html` open on the Dial Pad tab.

---

## Interactions

### Adding to the Queue

- **Tap** any tile in the Not in Queue list to add it to the end of the queue
- **Tap the "+" tile** (the next open slot in the queue grid) to open the **Dial Pad** tab and type a taxi number (see below)
- **Drag** a tile up into a specific position in the queue

### Removing from the Queue

- **Tap twice** any queue tile to remove it — first tap highlights it and shows a "Drop?" label, second tap removes it and returns it to Not in Queue
- **Tap "Loading"** once to prime it (first queue tile highlights yellow), then tap again to remove that taxi and log it as Loaded
- **Drag** a queue tile onto the "Loading" tile to remove it directly (no two-tap required)
- **Drag** a queue tile back down to the Not in Queue area to remove it

### Clearing the Queue

- **Gear menu → Clear all**, then tap again to confirm (undo restores it), or:

- **Hold the "Loading" tile** (~350ms) — it turns red and reads "Clear all?"
- **Tap it again** → the entire queue is cleared (lifting your finger after the hold does not count as that tap)
- **Tap anywhere else** to cancel

### Replacing a Filler with a Number

- **Tap a Filler tile** in the queue — the Dial Pad tab opens, the filler gets a yellow ring, and the display reads "REPLACE FILLER"
- Type a taxi number and press **Replace** — the filler is swapped for that number in the same position (the number must be valid and not already in the queue)
- While replacing, the Filler, Filler In-Front and Add In-Front keys are disabled (they would shift the filler's position)
- **Cancel** by tapping the Not in Queue tab. Tapping a filler a second time right away still removes it, as before

### Undo

- Tap **↶ Undo** (next to the "Queue" heading) to reverse the last change — add, remove, move, load, filler, replace or Clear All
- Keeps the last 30 changes per device; the button is greyed out when there is nothing to undo
- Undo restores the queue as it was on that device, so if someone else edited in the meantime their change is overwritten
- On `stand.html`, each undo is logged in History as **Undo**

### Reordering

- **Hold and drag** any queue tile to move it to a new position
- A gap appears showing exactly where it will land when dropped
- Dropping anywhere in the gap (before or after the shifted tile) works

### Scrolling vs Dragging

- A quick swipe scrolls the page normally
- Holding a tile for ~350ms activates drag mode

---

## Dial Pad

The **Dial Pad** tab (next to "Not in Queue") is an on-page number pad, so the phone's built-in keyboard never pops up. On a phone held upright it spans the full width of the screen; the keys are a fixed size.

| Key | Action |
|-----|--------|
| **0–9** | Type a taxi number (up to 3 digits) |
| **⌫** | Backspace |
| **Add** | Add the typed number to the end of the queue |
| **Add In-Front** | Add the typed number to the front of the queue |
| **Filler** / **Filler In-Front** | Add a filler to the end / front of the queue (no number needed) |

- Tapping the **+** tile in the queue opens this tab. The pad stays open after adding so you can enter several numbers in a row
- Keys make a soft click, and a blinking cursor shows where typing goes. (The phone's own keyboard click can't be triggered from a web page, so this is a similar sound made by the app.)
- `stand.html` asks the phone to keep the screen on while the page is open (not every phone supports this)
- Errors (invalid number, already in the queue) show in the pad's display instead of a popup
- **Auto-scroll:** when a key press or a tap in Not in Queue adds a new queue row, the page scrolls by the same amount so the button stays under your finger and you can keep tapping
- **Physical keyboard** (desktop): while the tab is open, digits type the number, Backspace deletes, **Enter** adds it to the end of the queue (or replaces a filler / saves the highest number), and **Shift+Enter** adds it to the front
- The same pad is used by the "adjust highest taxi number" tile (display shows "HIGHEST #") and for replacing fillers

---

## 10-11 Requests (`index.html` → `stand.html`)

When a driver holds the "10-11" tile in the live view, a modal appears on `stand.html` showing **"#X has requested a 10-11"** with two options:

- **OK** — removes the taxi from the queue and logs the action as a 10-11 entry in history
- **Undo** — dismisses the request, leaving the taxi in queue

If multiple stand.html instances are open, all of them receive the notification simultaneously.

The stand also **beeps and vibrates** (where the phone allows it) when a request arrives, and repeats every 5 seconds until someone taps OK or Undo. Browsers only allow sound after the page has been touched once, and an iPhone's silent switch mutes it.

---

## My Taxi Highlight

On first load of `index.html` or `personal.html`, a **Your taxi number** box appears with its own on-page dial pad (type 1–140, tap **Save**, or **Skip**). Your tile is highlighted in solid light blue (the same color as the bottom-right tile of the app icon) wherever it appears in the queue. On `personal.html` it also highlights in the Not in Queue list. Holding the 10-11 tile on `index.html` before you've set a number opens the same box. The number is saved per device per browser.

---

## Install as an App (fullscreen)

Add any page to the home screen so it opens fullscreen, without the browser bar:

- **iPhone (Safari):** open the page → Share → **Add to Home Screen**
- **Android (Chrome):** menu (⋮) → **Install app** / **Add to Home screen**

Each page installs as its own app (Live, Stand, Personal, History). Icons and manifests live in `icon-*.png`, `apple-touch-icon.png` and `manifest-*.json` — keep them in the repo root.

Note: on iPhone an installed app has its own storage, separate from Safari, so it will ask again for your name / taxi number and remember its own tile-size setting.

---

## Gear Menu

The gear in the top right holds **Bigger/Smaller Tiles**, **Light Mode / Dark Mode** (remembered on that device), **Clear all** (two taps to confirm) and, on the stand when signed in, **Log out**. `index.html` has the gear too, with just tile size and light/dark mode. Tap anywhere else to close it. In light mode the iPhone status bar switches to the light style too; in the installed app that may only update after you close and reopen it.

## Tile Size

Open the **gear menu** (top right) and tap **Bigger Tiles / Smaller Tiles** to toggle between 10 columns and 5 columns . The preference is saved per device per browser. Tile size is re-measured when you rotate the phone.

---

## Live Sync (`stand.html` and `index.html`)

Powered by [Firebase Realtime Database](https://firebase.google.com/products/realtime-database). Any change made in `stand.html` appears on all open instances within milliseconds.

A **LIVE / SAVING… / OFFLINE** indicator appears in the top right corner. `index.html` closes its connection after 20 seconds in the background and reconnects when reopened, to stay under Firebase's free limit of 100 simultaneous connections.

The first time you make a change on `stand.html` on a new device, a **Your name** box appears with its own on-screen keyboard (letters, numbers, space, `-`, `'`, `.`; up to 20 characters). This name appears in the change history. Changes made before you enter a name are held and logged under it once you tap **Save**; **Skip** logs them as "Unknown" and asks again next time.

---

## History (`history.html`)

Every action on `stand.html` is logged:

| Action | Meaning |
|--------|---------|
| **Added** | Taxi moved into the queue |
| **Dropped** | Taxi returned to Not in Queue |
| **Loaded** | Taxi removed via the Loading tile (tap or drag) |
| **Moved** | Taxi reordered within the queue |
| **10-11** | Taxi removed via a 10-11 request from the live view |
| **Undo** | A change was reversed with the Undo button |

Entries show the taxi number, device name, and a relative timestamp. Filter by action type or search by taxi number or device name. Anyone with the link can view it. Clear All needs a dispatcher sign-in and a second tap to confirm.

---

## Personal Mode (`personal.html`)

Identical to `stand.html` but stores data in the browser's localStorage instead of Firebase. No sync, no history, no device name box. Shows **SAVED** instead of LIVE. Asks for your taxi number (same on-page dial pad as `index.html`) to highlight your tile. Useful for personal tracking that doesn't affect the shared queue.

---

## Firebase Setup

The app uses Firebase Realtime Database at:
```
https://taxi-queue-3e591-default-rtdb.firebaseio.com
```

See **Security** below for the database rules.

---

## Security

- Everyone can **read** the queue and history (drivers use `index.html` with no login).
- Only signed-in **dispatchers** can change the queue, highest number, or history. Drivers can still send 10-11 requests.
- Rules live in `database.rules.json` (documentation copy; the live copy is pasted into the Firebase console → Realtime Database → Rules).
- Login code: `taxi-auth.js`; project settings: `taxi-config.js`. Until a real API key is in `taxi-config.js`, login is off and the pages behave as before.

### Setup (once)
1. Firebase console → **Authentication** → Get started → enable **Email/Password**. Also turn off any "allow users to sign up" option if shown.
2. Authentication → Users → **Add user** for each dispatcher. Copy each user's **UID**.
3. Realtime Database → Data: add `dispatchers` → `<UID>` = `true` for each dispatcher.
4. Project settings → General → Your apps → web app → copy `apiKey` into `taxi-config.js`, upload it, wait ~30 s, and confirm you can sign in on `stand.html`.
5. **Last:** paste `database.rules.json` into Rules and Publish. (Doing this before step 4 locks the stand out.)
6. Optional: Google Cloud console → Credentials → restrict the browser key to `https://kobitz.github.io/*`.

To remove a dispatcher: delete their `dispatchers/<UID>` entry (and the user).

---

## Deployment

Hosted via GitHub Pages from the `main` branch root of `kobitz/taxi-queue`.

To update any page, edit the file directly on GitHub and commit. Changes go live within ~30 seconds.
