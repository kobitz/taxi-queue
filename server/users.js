/* Manage dispatcher accounts.
     node users.js add <name>        create a dispatcher (asks for a password)
     node users.js passwd <name>     change a password
     node users.js remove <name>     delete a dispatcher (they are signed out right away)
     node users.js list                                                                  */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), readline = require('readline');
const DIR = path.join(__dirname, 'data'), FILE = path.join(DIR, 'users.json');
fs.mkdirSync(DIR, { recursive: true });
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } };
const save = u => { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(u, null, 2)); fs.renameSync(t, FILE); };

function ask(q, hidden) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = s => { if (s.includes(q)) process.stdout.write(s); }; }
    rl.question(q, a => { rl.close(); if (hidden) process.stdout.write('\n'); res(a); });
  });
}
async function newPassword() {
  const a = await ask('New password (at least 8 characters): ', true);
  if (a.length < 8) { console.log('Too short. Nothing was changed.'); process.exit(1); }
  const b = await ask('Type it again: ', true);
  if (a !== b) { console.log("They didn't match. Nothing was changed."); process.exit(1); }
  return a;
}
function setUser(users, name, pw) { const salt = crypto.randomBytes(16).toString('hex'); users[name] = { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; save(users); }

(async () => {
  const [cmd, rawName] = process.argv.slice(2), users = load();
  const name = String(rawName || '').trim().toLowerCase();
  if (cmd === 'list') { const n = Object.keys(users); console.log(n.length ? n.join('\n') : '(no dispatchers yet)'); return; }
  if (!['add', 'passwd', 'remove'].includes(cmd) || !/^[a-z0-9._-]{2,30}$/.test(name)) {
    console.log('Usage: node users.js add|passwd|remove <name>   or   node users.js list\nNames: 2-30 letters, numbers, dot, dash or underscore.'); process.exit(1);
  }
  if (cmd === 'add') { if (users[name]) { console.log(`"${name}" already exists. Use passwd to change the password.`); process.exit(1); } setUser(users, name, await newPassword()); console.log(`Dispatcher "${name}" created.`); }
  if (cmd === 'passwd') { if (!users[name]) { console.log(`No dispatcher called "${name}".`); process.exit(1); } setUser(users, name, await newPassword()); console.log(`Password changed for "${name}".`); }
  if (cmd === 'remove') { if (!users[name]) { console.log(`No dispatcher called "${name}".`); process.exit(1); } delete users[name]; save(users); console.log(`Dispatcher "${name}" removed.`); }
})();
