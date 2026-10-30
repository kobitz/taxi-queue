/* Firebase web config, shared by the pages that sign dispatchers in (stand.html, history.html).
   These values are NOT secrets — they identify the project and are visible in every Firebase web app.
   They are safe to keep in a public repo; the Database Rules (database.rules.json) are what protect the data.

   TO TURN ON DISPATCHER LOGIN: replace PASTE_YOUR_WEB_API_KEY with the "apiKey" from
   Firebase console → Project settings (gear) → General → Your apps → SDK setup and configuration → Config.
   While it still says PASTE_..., the pages behave as before (no login). */
/* Which backend the pages use. GitHub Pages uses 'firebase'. When you run the home-PC server (see SERVER-README.md),
   the server hands out its own version of this file with BACKEND = 'local', so nothing here needs editing. */
export const BACKEND = 'firebase';
const V = 'https://www.gstatic.com/firebasejs/10.12.0/';
export const SDK = { app: V + 'firebase-app.js', db: V + 'firebase-database.js', auth: V + 'firebase-auth.js' };
export const FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_WEB_API_KEY",
  authDomain: "taxi-queue-3e591.firebaseapp.com",
  databaseURL: "https://taxi-queue-3e591-default-rtdb.firebaseio.com",
  projectId: "taxi-queue-3e591"
};
