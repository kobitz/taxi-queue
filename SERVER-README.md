# Running the taxi queue on your own PC (no Firebase)

The same pages, but a small program on your Windows PC replaces Firebase. Phones open your PC's web address and everything works: live queue, dispatcher login, history, 10-11 requests.

**What you need:** a Windows PC that stays on, Node.js (free), and Tailscale (free) to make it reachable from the internet. No domain, no router changes. (The server is plain Node.js, so it also runs on Mac or Linux with `node server/server.js`; only the `.bat` scripts and the Tailscale steps below are Windows-flavoured.)

> The home-PC version and the GitHub Pages/Firebase version are separate. They don't share data. Pick one address to give drivers and dispatchers.

---

## 1. Get the files onto the PC
1. On GitHub, open the repo → green **Code** button → **Download ZIP**. Unzip it somewhere permanent, for example `C:\taxi-queue`.
2. Install **Node.js** (the **LTS** download) from <https://nodejs.org>. Accept the defaults.

## 2. Start the server
Double-click **start.bat** in the `server` folder. A black window opens (leave it open; closing it stops the server) and the **control page** opens in your browser. If the server ever crashes it restarts itself.

## 3. Add dispatchers on the control page
The control page is at <http://localhost:8788> (bookmark it). It only works on this PC and is never shared through the internet.

- **Dispatchers:** type a name and a password (at least 8 characters) and click **Add dispatcher**. Use the **−** button next to a name to remove them (tap twice to confirm); they're signed out immediately. **Change password** signs that person out everywhere. The name is what shows in History.
- **Right now:** how many pages are open, how many taxis are in the queue, and when it last changed.
- **Addresses:** the links for this PC and, if Tailscale Funnel is on, your public links, with Copy buttons.
- **Maintenance:** back up now, open the data folder, clear the queue, clear the history (each needs two taps).
- **Console:** a live log of sign-ins, failed logins, 10-11 requests and account changes. Passwords are never logged.

Make one account per dispatcher, plus a spare. Prefer a terminal? `manage-dispatchers.bat` does the same for accounts.

Check it works: open <http://localhost:8787/stand.html> on the PC and sign in.

## 4. Make it reachable from the internet (Tailscale Funnel)
1. Install Tailscale for Windows from <https://tailscale.com/download> and sign in (free personal account).
2. In the Tailscale admin console (<https://login.tailscale.com/admin/dns>), make sure **MagicDNS** and **HTTPS certificates** are turned on.
3. **Choose your machine name now, before starting the tunnel.** The name becomes part of your public address (`https://NAME.your-tailnet.ts.net`). To change it, open <https://login.tailscale.com/admin/machines>, find your PC, use the **...** menu → **Edit machine name** (or similar), and pick something short like `taxi-queue` (lowercase letters, numbers and dashes). Changing it later changes the address, and a **new name can take several minutes to an hour to start working** (phones show "cannot establish a secure connection" until its HTTPS certificate is ready). So pick it once.
4. Open a **Command Prompt** and run:
   ```
   tailscale funnel --bg 8787
   ```
   The first time, it may print a link asking you to allow Funnel for your account. Open it, approve, then run the command again.
5. It prints your public address, something like `https://yourpc.your-tailnet.ts.net`. That's your link. Check it on a phone **with Wi-Fi turned off**.

If the new name doesn't load right away, wait and try again from a phone on mobile data before changing anything. The Tailscale command line has changed between versions. If the command above isn't accepted, run `tailscale funnel --help` and follow the current instructions. Tailscale's Funnel docs: <https://tailscale.com/kb/1223/tailscale-funnel>. Funnel's terms and limits are set by Tailscale and can change, so read them once.

Give out:
- Drivers: `https://yourpc.your-tailnet.ts.net/`
- Dispatchers: `https://yourpc.your-tailnet.ts.net/stand.html`

Phones need to **Add to Home Screen again** from the new address. Settings saved in the old app (taxi number, tile size, light mode) don't carry over, and each dispatcher signs in again.

## 5. Keep it running
- **Never sleep:** Windows Settings → System → Power → set "Screen and sleep" to **Never** when plugged in.
- **Start on boot:** press `Win+R`, type `shell:startup`, and put a shortcut to `start.bat` in the folder that opens. Also in Tailscale's settings turn on **Run unattended**, so it reconnects before anyone signs in.
- **Windows updates restart the PC.** Set active hours, or check on the PC now and then.
- **Backups:** the queue and history are in `server\data`. A copy is saved each day in `server\data\backups` (the last 14 are kept, counting any made with the control page's **Back up now**). Copy that folder to a USB stick or cloud drive now and then. Keep it private (it holds the dispatcher password hashes and login tokens) and never upload it to GitHub.

## Good to know
- The server (port 8787) and the control page (port 8788) only listen on this PC (`127.0.0.1`). Only share port 8787 with Tailscale, **never 8788**. To also allow other devices on your home Wi-Fi to reach the queue, add the line `set HOST=0.0.0.0` above `node server.js` in `start.bat` (the control page always stays on this PC). To use other ports, add `set PORT=...` the same way, and point Tailscale at that port.
- Passwords are stored scrambled (not readable). After 6 wrong tries for the same account from one place, logins pause for 15 minutes.
- Drivers can read the queue and send 10-11 requests; only signed-in dispatchers can change anything. Same rules as the Firebase version.
- The pages need the PC. If it's off or offline, the live view shows OFFLINE.
- There is no limit of 100 connections like Firebase's free plan.

## Updating to a newer version
1. Close the server's black window.
2. Download the repo as a ZIP again and copy its files over your folder, **keeping your `server\data` folder** (it has your dispatchers, queue and history; the ZIP doesn't contain it, so copying over never removes it).
3. Double-click `start.bat`. Phones pick up the new pages on their next load.

## If something goes wrong
- **"Port 8787 is already in use":** the server is already running in another window, or another program uses that port. Close the other one (or change the port, see above). `start.bat` stops instead of retrying in this case.
- **Phones say OFFLINE or can't connect:** check the black window is still open, then open <http://localhost:8787> on the PC itself. If that works, the problem is the tunnel: run `tailscale funnel status` and check your address is listed.
- **"Cannot establish a secure connection" on a brand-new or renamed address:** wait up to an hour (the certificate is still being created), testing from a phone on mobile data.
- **A dispatcher can't sign in:** check the name and password on the control page; after several wrong tries logins pause for 15 minutes. **Change password** there to set a new one.
- **The control page won't open:** use <http://localhost:8788> in a browser on the PC. If another program uses that port, the console says so; the queue server still works.
