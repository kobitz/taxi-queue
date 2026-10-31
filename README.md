# Taxi Stand Queue

A real-time taxi queue management web app built for use on mobile and desktop. Tracks which taxis are at the stand, in holding, or waiting in queue — with live sync across multiple devices.

It runs in either of two ways, with the same pages: on **Firebase + GitHub Pages** (the default, described below), or on **your own Windows PC** with a small server (see [SERVER-README.md](SERVER-README.md)). The two don't share data.

---

## Pages

| File | URL | Description |
|------|-----|-------------|
| `index.html` | `/` | **Live view** — read-only, updates in real time; highlights your taxi number; 10-11 request button |
| `stand.html` | `/stand.html` | **Editable queue** — add, remove, reorder taxis; syncs to all devices |
| `personal.html` | `/personal.html` | **Personal queue** — same interface, saved locally to your browser only |
| `history.html` | `/history.html` | **Change log** — live feed of every add, drop, load, and move |
| `taxi-config.js` | — | Which backend to use (Firebase or home-PC server) and the Firebase project settings |
| `taxi-auth.js` | — | Dispatcher sign-in box (on-screen keyboard) |
| `taxi-sound.js` | — | Key click and 10-11 alert sounds |
| `taxi-local.js` | — | Used instead of Firebase when running the home-PC server |
| `server/` | — | The home-PC server (Node.js), its control page and Windows start scripts; see [SERVER-README.md](SERVER-README.md) |
| `database.rules.json` | — | Database security rules (copy into Firebase console) |

`stand.html` and `personal.html` are thin pages that share one editor: `taxi-editor.js` (logic) and `taxi-editor.css` (styles). The page sets its mode (`stand` = shared queue; `personal` = this browser only) and the shared files do the rest, so a fix or feature is made once. `index.html` (live view) and `history.html` are separate.

Icons and manifests (`icon-*.png`, `apple-touch-icon.png`, `manifest-*.json`) live in the repo root for the installable-app feature.

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

Two ways, both need a second tap to confirm:

- **Gear menu → Clear all**, then tap again (it turns red and says "Tap again to clear all")
- **Hold the "Loading" tile** (~350ms) until it turns red and reads "Clear all?", then **tap it again**. Lifting your finger after the hold does not count as that tap. Tap anywhere else to cancel

**Undo** brings a cleared queue back.

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
- Keys make a soft click, and a cursor bar shows where typing goes. The login keyboard and the taxi-number box do the same. (The phone's own keyboard click can't be triggered from a web page, so this is a similar sound made by the app. An iPhone's silent switch mutes it.)
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

The stand also **beeps and vibrates** (where the phone allows it; iPhones don't allow vibration from web pages) when a request arrives, and repeats every 5 seconds until someone taps OK or Undo. Browsers only allow sound after the page has been touched once.

To help the dispatcher notice requests, `stand.html` also asks the phone to **keep the screen on** while the page is open (not every phone supports this). Neither feature works when the app is closed or the phone is locked; that would need push notifications, which this app doesn't use.

---

## My Taxi Highlight

On first load of `index.html` or `personal.html`, a **Your taxi number** box appears with its own on-page dial pad (type a number from 1 up to the highest taxi number, 140 by default; tap **Save**, or **Skip**). Your tile is highlighted in solid light blue (the same color as the bottom-right tile of the app icon) wherever it appears in the queue. On `personal.html` it also highlights in the Not in Queue list. Holding the 10-11 tile on `index.html` before you've set a number opens the same box. The number is saved per device per browser.

---

## Install as an App (fullscreen)

Add any page to the home screen so it opens fullscreen, without the browser bar:

- **iPhone (Safari):** open the page → Share → **Add to Home Screen**
- **Android (Chrome):** menu (⋮) → **Install app** / **Add to Home screen**

Each page installs as its own app (Live, Stand, Personal, History). Icons and manifests live in `icon-*.png`, `apple-touch-icon.png` and `manifest-*.json` — keep them in the repo root.

Note: on iPhone an installed app has its own storage, separate from Safari. It asks for your taxi number again, needs a fresh dispatcher sign-in on the stand, and remembers its own tile-size and light/dark settings. The same applies when you switch to a new web address (for example from GitHub Pages to a home-PC address): add the app to the Home Screen again.

---

## Gear Menu

The gear in the top right opens a small menu. Tap anywhere else to close it.

| Item | `stand.html` | `personal.html` | `index.html` |
|------|:-:|:-:|:-:|
| **Bigger / Smaller Tiles** — toggles 10 columns or 5 columns per row; re-measured when you rotate the phone | ✓ | ✓ | ✓ |
| **Light Mode / Dark Mode** | ✓ | ✓ | ✓ |
| **Clear all** (two taps; Undo restores) | ✓ | ✓ | |
| **Log out** (when signed in) | ✓ | | |

Tile size and light/dark are remembered per device per browser. In light mode the iPhone status bar switches to the light style too; in the installed app that may only update after you close and reopen it. Pop-ups (sign-in, 10-11 request, taxi-number box) stay dark. `history.html` has no gear and stays dark.

---

## Live Sync (`stand.html` and `index.html`)

Any change made in `stand.html` appears on all open instances within milliseconds. On the default version this is [Firebase Realtime Database](https://firebase.google.com/products/realtime-database); on the home-PC version it is the server.

A **LIVE / SAVING… / OFFLINE** indicator appears in the top right corner (on the stand it reads **SIGN IN** while signed out). `index.html` closes its connection after 20 seconds in the background and reconnects when reopened, so idle phones don't count against Firebase's free limit of 100 simultaneous connections.

### Dispatcher sign-in (`stand.html`)

Anyone can open `stand.html`, but changes only save for a signed-in dispatcher. A sign-in box (email or name + password, typed on its own on-screen keyboard) covers the page until you sign in; it also offers **View queue** and **Personal queue** buttons for people who just want to look. The account name is what History shows next to each change. Sign out from the gear menu. Sessions last until you sign out (30 days on the home-PC version).

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

Entries show the taxi number, who made the change (the dispatcher's account name and device type), and a relative timestamp. Filter by action type or search by taxi number or name. Anyone with the link can view it. Clear All needs a dispatcher sign-in and a second tap to confirm.

---

## Personal Mode (`personal.html`)

Identical to `stand.html` but stores data in the browser's localStorage instead of Firebase. No sync, no history, no sign-in. Shows **SAVED** instead of LIVE. Asks for your taxi number (same on-page dial pad as `index.html`) to highlight your tile. Useful for personal tracking that doesn't affect the shared queue.

---

## Firebase Version: Security and Setup

The default version uses Firebase Realtime Database at `https://taxi-queue-3e591-default-rtdb.firebaseio.com`.

- Everyone can **read** the queue and history (drivers use `index.html` with no login).
- Only signed-in **dispatchers** can change the queue, highest number, or history. Anyone can still send a 10-11 request.
- The rules live in `database.rules.json` (a documentation copy; the live copy is pasted into the Firebase console → Realtime Database → Rules).
- The web `apiKey` in `taxi-config.js` is not a secret; the rules and dispatcher list are what protect the data. Until a real key is in `taxi-config.js`, login is off.

### Setup (once)
1. Firebase console → **Authentication** → Get started → enable **Email/Password**. Turn off any "allow users to sign up" option if shown.
2. Authentication → Users → **Add user** for each dispatcher. Copy each user's **UID**.
3. Realtime Database → Data: add `dispatchers` → `<UID>` = `true` for each dispatcher.
4. Project settings → General → Your apps → web app → copy `apiKey` into `taxi-config.js`, upload it, wait ~30 s, and confirm you can sign in on `stand.html`.
5. **Last:** paste `database.rules.json` into Rules and Publish. (Doing this before step 4 locks the stand out.)
6. Optional: Google Cloud console → Credentials → restrict the browser key to your site address.

To remove a dispatcher: delete their `dispatchers/<UID>` entry (and the user).

### Using this for your own team
A copy of this repo still points at the original Firebase project. Either use the home-PC version (nothing to change), or create your own Firebase project and, in `taxi-config.js`, replace `apiKey`, `authDomain`, `databaseURL` and `projectId` with yours, then do the setup above. Change the hosted address in the Deployment section too.

---

## Running on your own PC instead of Firebase

The same pages can run against a small server on a Windows PC (no Firebase, no domain). See **[SERVER-README.md](SERVER-README.md)**. The pages pick their backend from `taxi-config.js`; the home-PC server hands out its own copy of that file, so the GitHub Pages version keeps using Firebase and nothing needs editing. `taxi-local.js` is the stand-in for the Firebase library in that mode. The server includes a local-only **control page** (add/remove dispatchers, live console, backups).

## Deployment

Hosted via GitHub Pages from the `main` branch root of `kobitz/taxi-queue`, at `https://kobitz.github.io/taxi-queue`.

To update any page, edit the file directly on GitHub and commit. Changes go live within ~30 seconds. Uploading a whole folder (such as `server/`) works by dragging it onto GitHub's upload page.

**Cache versions.** Phones cache scripts and styles, so shared files are loaded as `file?v=N`. When you change one of these files, bump its `v=` number wherever it is referenced so phones fetch the new copy:

| File | Referenced in |
|------|---------------|
| `taxi-editor.js`, `taxi-editor.css` | `stand.html`, `personal.html` |
| `taxi-auth.js` | `taxi-editor.js`, `history.html` |
| `taxi-sound.js` | `taxi-editor.js`, `taxi-auth.js`, `index.html` |
| `taxi-local.js` | `taxi-config.js` and the copy of it that `server/server.js` hands out |

## License

MIT. See [LICENSE](LICENSE). You are free to use, copy and change this for your own taxi stand or company.
