# Running the taxi queue on your own PC (no Firebase)

The same pages, but a small program on your Windows PC replaces Firebase. Phones open your PC's web address and everything works: live queue, dispatcher login, history, 10-11 requests.

**What you need:** a Windows PC that stays on, Node.js (free), and Tailscale (free) to make it reachable from the internet. No domain, no router changes.

> The home-PC version and the GitHub Pages/Firebase version are separate. They don't share data. Pick one address to give drivers and dispatchers.

---

## 1. Get the files onto the PC
1. On GitHub, open the repo → green **Code** button → **Download ZIP**. Unzip it somewhere permanent, for example `C:\taxi-queue`.
2. Install **Node.js** (the **LTS** download) from <https://nodejs.org>. Accept the defaults.

## 2. Create dispatcher accounts
1. Open the `server` folder and double-click **manage-dispatchers.bat**.
2. Choose **1**, type a name (for example `ko`), then a password (at least 8 characters; it won't show as you type).
3. Make one account per dispatcher, plus a spare. The account name is what shows in History.

## 3. Start the server
Double-click **start.bat** in the `server` folder. You should see `Taxi queue server running at http://localhost:8787`.

Open <http://localhost:8787/stand.html> on the PC and sign in to check it works. Leave the black window open. If the server crashes it restarts itself.

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

If the new name doesn't load right away, wait and try again from a phone on mobile data before changing anything. The Tailscale command line has changed between versions. If the command above isn't accepted, run `tailscale funnel --help` and follow the current instructions. Tailscale's Funnel docs: <https://tailscale.com/kb/1223/tailscale-funnel>. I couldn't check their current limits, so read them once.

Give out:
- Drivers: `https://yourpc.your-tailnet.ts.net/`
- Dispatchers: `https://yourpc.your-tailnet.ts.net/stand.html`

Phones need to **Add to Home Screen again** from the new address. Settings saved in the old app (taxi number, tile size, light mode) don't carry over.

## 5. Keep it running
- **Never sleep:** Windows Settings → System → Power → set "Screen and sleep" to **Never** when plugged in.
- **Start on boot:** press `Win+R`, type `shell:startup`, and put a shortcut to `start.bat` in the folder that opens. Also in Tailscale's settings turn on **Run unattended**, so it reconnects before anyone signs in.
- **Windows updates restart the PC.** Set active hours, or check on the PC now and then.
- **Backups:** the queue and history are in `server\data`. A copy is saved each day in `server\data\backups` (the last 14 are kept). Copy that folder to a USB stick or cloud drive now and then.

## Good to know
- The server only listens on this PC (`127.0.0.1`); the internet reaches it only through Tailscale. To also allow other devices on your home Wi-Fi, start it with the environment variable `HOST=0.0.0.0`.
- Passwords are stored scrambled (not readable). After 6 wrong tries for the same account from one place, logins pause for 15 minutes.
- Drivers can read the queue and send 10-11 requests; only signed-in dispatchers can change anything. Same rules as the Firebase version.
- The pages need the PC. If it's off or offline, the live view shows OFFLINE.
- There is no limit of 100 connections like Firebase's free plan.
- To remove a dispatcher: **manage-dispatchers.bat** → 3. They're signed out immediately.
- To reset the queue and history, stop the server and delete `server\data\data.json`.
