// ================= Accounts & cloud progress =================
// Learners can stay on this device only, or create an account (username + password) to save
// their progress online and use any computer. No email or real name is collected.
// Sync: pull, merge (progress only moves forward), push only when something changed:
// about 15 seconds after progress, when the page is hidden, and after signing in.

const Cloud = { accounts: false, user: null, syncing: false, last: 0, error: null, timer: null };

async function api(path, body) {
  const r = await fetch(path, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }
    : { credentials: 'same-origin' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'http_' + r.status);
  return d;
}

function errorText(e) {
  switch (e) {
    case 'not_configured': return 'Online saving isn\'t switched on for this website yet.';
    case 'storage_busy': return 'Online saving is busy right now. Your progress is safe on this device and will save later.';
    case 'rate_limited': return 'Too many tries in a short time. Wait a few minutes and try again.';
    case 'bad_username': return 'Usernames are 3 to 24 characters: lowercase letters, numbers and _ only.';
    case 'weak_password': return 'Your password needs at least 8 characters.';
    case 'username_taken': return 'Someone already has that username. Try another one.';
    case 'bad_login': return 'That username and password don\'t match.';
    case 'bad_recovery': return 'That Save Code doesn\'t match this username.';
    case 'need_grownup': return 'Please check with a parent, guardian or teacher first, then tick the box.';
    case 'signed_out': return 'You were signed out. Please sign in again.';
    case 'too_large': return 'Your progress is too big to save online.';
    default: return 'Couldn\'t reach the server. Check your internet connection.';
  }
}

// XP always comes from progress, so merging two devices can never double-count it.
function computeXP(p) {
  let x = 0;
  for (const L of LESSONS) {
    const g = p.progress && p.progress[L.id];
    if (!g) continue;
    if (g.quiz) x += g.quizFirst ? 25 : 10;
    if (g.main) x += L.boss ? 200 : 100;
    if (g.bonus) x += 75;
  }
  return x;
}

function toPayload(p) {
  return {
    version: 1, name: p.name, avatar: p.avatar, track: p.track, unlockAll: !!p.unlockAll, prefsAt: p.prefsAt || 0,
    streak: p.streak || 0, best: p.best || 0, lastDay: p.lastDay || null, badges: p.badges || [], progress: p.progress || {}
  };
}

function mergeLesson(a, b) {
  if (!a) return JSON.parse(JSON.stringify(b));
  if (!b) return a;
  const code = {}, codeAt = {};
  for (const k of ['main', 'bonus']) {
    const lt = (a.codeAt && a.codeAt[k]) || 0, rt = (b.codeAt && b.codeAt[k]) || 0;
    const ac = a.code && a.code[k], bc = b.code && b.code[k];
    const useB = bc !== undefined && (ac === undefined || rt > lt);
    if (useB) code[k] = bc; else if (ac !== undefined) code[k] = ac;
    codeAt[k] = Math.max(lt, rt);
  }
  const fa = a.fails || {}, fb = b.fails || {};
  return {
    quiz: !!(a.quiz || b.quiz), quizFirst: !!(a.quizFirst || b.quizFirst),
    main: !!(a.main || b.main), bonus: !!(a.bonus || b.bonus),
    code, codeAt, fails: { main: Math.max(fa.main || 0, fb.main || 0), bonus: Math.max(fa.bonus || 0, fb.bonus || 0) }
  };
}

function mergeProfile(L, R) {
  if (!R || typeof R !== 'object') return L;
  const out = { ...L };
  if ((R.prefsAt || 0) > (L.prefsAt || 0)) Object.assign(out, { name: R.name || L.name, avatar: R.avatar || L.avatar, track: R.track || L.track, unlockAll: !!R.unlockAll, prefsAt: R.prefsAt });
  const newer = (R.lastDay || '') > (L.lastDay || '') || ((R.lastDay || '') === (L.lastDay || '') && (R.streak || 0) > (L.streak || 0)) ? R : L;
  out.streak = newer.streak || 0; out.lastDay = newer.lastDay || null;
  out.best = Math.max(L.best || 0, R.best || 0);
  out.badges = [...new Set([...(L.badges || []), ...(R.badges || [])])];
  out.progress = {};
  for (const k of new Set([...Object.keys(L.progress || {}), ...Object.keys(R.progress || {})])) out.progress[k] = mergeLesson((L.progress || {})[k], (R.progress || {})[k]);
  out.xp = computeXP(out);
  return out;
}

const canon = (x) => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));

function canSync() { return !!(Cloud.user && hasProfile() && me().account === Cloud.user.username); }

function scheduleSync() {
  if (!canSync()) return;
  clearTimeout(Cloud.timer);
  Cloud.timer = setTimeout(() => syncNow(), 15000);
}

async function syncNow(loud = false) {
  if (!canSync() || Cloud.syncing) return false;
  Cloud.syncing = true; renderCloudState();
  const p = me();
  try {
    const remote = await api('/api/progress', { op: 'get' });
    const before = canon(toPayload(p));
    Object.assign(p, mergeProfile(p, remote.data));
    saveLocal();
    const out = toPayload(p);
    if (!remote.data || canon(out) !== canon(remote.data)) await api('/api/progress', { op: 'put', data: out });
    Cloud.last = Date.now(); Cloud.error = null;
    if (canon(out) !== before) { renderTop(); if (!location.hash.startsWith('#m-')) route(); }
    if (loud) toast('☁ Saved online');
    return true;
  } catch (e) {
    Cloud.error = e.message;
    if (e.message === 'signed_out') Cloud.user = null;
    if (loud) toast(errorText(e.message));
    return false;
  } finally {
    Cloud.syncing = false; renderCloudState();
  }
}

// Push this exact state, replacing what is online (used after "Reset my progress").
async function forcePush() {
  if (!canSync()) return;
  try { await api('/api/progress', { op: 'put', data: toPayload(me()) }); Cloud.last = Date.now(); } catch (e) { Cloud.error = e.message; }
}

async function refreshAuth() {
  try {
    const [who, cfg] = await Promise.all([api('/api/auth/me'), api('/api/auth/config')]);
    Cloud.accounts = !!cfg.accounts;
    Cloud.user = who.user || null;
  } catch (e) {
    Cloud.accounts = false; Cloud.user = null; // static hosting or offline: this-device-only mode
  }
  if (Cloud.user) {
    const linked = Object.values(DB.profiles).find(q => q.account === Cloud.user.username);
    if (!linked) await adoptAccount(Cloud.user, false);
    else syncNow();
  }
  renderTop();
}

// After signing in or signing up: link the right local profile to the account, then sync.
async function adoptAccount(user, preferCurrent) {
  const existing = Object.values(DB.profiles).find(q => q.account === user.username);
  let target = existing;
  if (!target && preferCurrent && hasProfile() && !me().account) target = me();
  if (!target) {
    let remote = null;
    try { remote = (await api('/api/progress', { op: 'get' })).data; } catch (e) {}
    target = blankProfile(remote && remote.name ? remote.name : user.username, (remote && remote.avatar) || AVATARS[0], (remote && remote.track) || 'explorer');
    target.prefsAt = 0;
    DB.profiles[target.id] = target;
  }
  target.account = user.username;
  DB.current = target.id;
  saveLocal();
  await syncNow();
  renderTop(); route();
}

function renderCloudState() {
  const el = document.getElementById('cloud-state');
  if (!el) return;
  el.innerHTML = cloudLine();
}
function cloudLine() {
  if (!canSync()) return '';
  if (Cloud.syncing) return 'Saving online…';
  if (Cloud.error) return esc(errorText(Cloud.error));
  if (!Cloud.last) return 'Saved online';
  const mins = Math.round((Date.now() - Cloud.last) / 60000);
  return 'Saved online ' + (mins < 1 ? 'just now' : mins === 1 ? '1 minute ago' : mins + ' minutes ago');
}

// ---------- Account panel inside the profile window ----------
function accountPanel(close) {
  const p = me();
  if (!Cloud.accounts) return { html: '', mount() {} };
  let html;
  if (canSync()) {
    html = `<div class="acct"><b>☁ Saved online</b> as <code>${esc(Cloud.user.username)}</code><div class="small" id="cloud-state">${cloudLine()}</div>
      <div class="row"><button type="button" class="btn light" data-act="sync">Save now</button><button type="button" class="btn light" data-act="password">Change password</button><button type="button" class="btn light" data-act="code">New Save Code</button></div>
      <div class="row"><button type="button" class="btn light" data-act="signout">Sign out</button><button type="button" class="btn light danger" data-act="delete">Delete online account</button></div></div>`;
  } else if (p.account) {
    html = `<div class="acct"><b>This explorer saves online as <code>${esc(p.account)}</code>.</b><div class="small">Sign in to keep saving.</div>
      <div class="row"><button type="button" class="btn primary" data-act="login">Sign in</button></div></div>`;
  } else {
    html = `<div class="acct"><b>Save your progress online</b><div class="small">Then you can carry on from any computer. We only ask for a username and a password. No email, no real name.</div>
      <div class="row"><button type="button" class="btn primary" data-act="signup">Create an account</button><button type="button" class="btn light" data-act="login">I have an account</button></div></div>`;
  }
  return {
    html,
    mount(bg) {
      bg.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'sync') { b.disabled = true; await syncNow(true); b.disabled = false; return; }
        if (act === 'signout') {
          b.disabled = true;
          await syncNow();
          try { await api('/api/auth/logout', {}); } catch (e) {}
          const name = me().name;
          delete DB.profiles[me().id];
          Cloud.user = null;
          DB.current = Object.keys(DB.profiles)[0] || null;
          saveLocal(); close(); renderTop(); route();
          toast(`Signed out. ${name}'s progress is saved online.`);
          if (!hasProfile()) welcomeModal();
          return;
        }
        close();
        authModal(act);
      }));
    }
  };
}

// ---------- Sign-up / sign-in / reset / password / delete window ----------
function authModal(mode) {
  const titles = { signup: 'Create your account', login: 'Sign in', reset: 'Use your Save Code', password: 'Change your password', code: 'Get a new Save Code', delete: 'Delete your online account' };
  const body = {
    signup: `<p style="margin:0">Your progress will be saved online so you can keep going on any computer.</p>
      <div><label for="au">Username</label><input type="text" id="au" maxlength="24" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="for example: codefox_7">
        <div class="small">3 to 24 characters: lowercase letters, numbers and _. <b>Don't use your real name.</b></div></div>
      <div><label for="ap">Password</label><input type="password" id="ap" autocomplete="new-password">
        <div class="small">At least 8 characters. Tip: three random words, like <code>purple-taco-river</code>.</div></div>
      <label class="row check"><input type="checkbox" id="ag"> A parent, guardian or teacher said I can make an account.</label>
      <p class="small" style="margin:0">We store your username, a scrambled copy of your password, and your Python Quest progress. Nothing else. <a href="#privacy" data-close>Read the privacy page</a>.</p>`,
    login: `<div><label for="au">Username</label><input type="text" id="au" maxlength="24" autocomplete="username" autocapitalize="off" spellcheck="false"></div>
      <div><label for="ap">Password</label><input type="password" id="ap" autocomplete="current-password"></div>
      <button type="button" class="linkish" data-mode="reset">Forgot your password? Use your Save Code</button>`,
    reset: `<p style="margin:0">Your Save Code is the code you wrote down when you made your account. It looks like <code>ABCD-EFGH-JKLM-NPQR</code>.</p>
      <div><label for="au">Username</label><input type="text" id="au" maxlength="24" autocomplete="username" autocapitalize="off" spellcheck="false"></div>
      <div><label for="ac">Save Code</label><input type="text" id="ac" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <div><label for="ap">New password</label><input type="password" id="ap" autocomplete="new-password"></div>`,
    password: `<div><label for="ao">Current password</label><input type="password" id="ao" autocomplete="current-password"></div>
      <div><label for="ap">New password</label><input type="password" id="ap" autocomplete="new-password"></div>
      <p class="small" style="margin:0">Other computers will be signed out.</p>`,
    code: `<p style="margin:0">You'll get a new Save Code. Your old one will stop working.</p>`,
    delete: `<p style="margin:0">This deletes your account and everything saved online. It can't be undone. Your progress on this computer stays.</p>
      <div><label for="ad">Type your username to confirm</label><input type="text" id="ad" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`
  }[mode];
  const btn = { signup: 'Create my account', login: 'Sign in', reset: 'Set new password', password: 'Change password', code: 'Get a new Save Code', delete: 'Delete forever' }[mode];
  modal(`<h2>${titles[mode]}</h2>${body}
    <div class="verdict bad" id="aerr" hidden></div>
    <div class="row"><button type="button" class="btn ${mode === 'delete' ? 'danger-solid' : 'primary'}" id="ago">${btn}</button><button type="button" class="btn light" id="acancel">Cancel</button>
    ${mode === 'login' ? '<span class="grow"></span><button type="button" class="linkish" data-mode="signup">New here? Create an account</button>' : ''}</div>`, (bg, close) => {
    const val = (id) => { const el = bg.querySelector('#' + id); return el ? el.value : ''; };
    const err = bg.querySelector('#aerr');
    bg.querySelector('#acancel').addEventListener('click', () => { close(); if (!hasProfile()) welcomeModal(); });
    bg.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { close(); authModal(b.dataset.mode); }));
    bg.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', () => close()));
    bg.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') bg.querySelector('#ago').click(); }));
    bg.querySelector('#ago').addEventListener('click', async (e) => {
      const go = e.currentTarget; go.disabled = true; err.hidden = true;
      try {
        if (mode === 'signup') {
          const d = await api('/api/auth/signup', { username: val('au').trim().toLowerCase(), password: val('ap'), grownupOk: bg.querySelector('#ag').checked });
          Cloud.user = d.user;
          close();
          if (!hasProfile()) { const prof = blankProfile(d.user.username, AVATARS[0], 'explorer'); DB.profiles[prof.id] = prof; DB.current = prof.id; }
          await adoptAccount(d.user, true);
          saveCodeModal(d.recoveryCode, true);
        } else if (mode === 'login') {
          const d = await api('/api/auth/login', { username: val('au').trim().toLowerCase(), password: val('ap') });
          Cloud.user = d.user; close();
          await adoptAccount(d.user, true);
          toast(`Welcome back, ${me().name}!`);
        } else if (mode === 'reset') {
          const d = await api('/api/auth/reset', { username: val('au').trim().toLowerCase(), recoveryCode: val('ac'), password: val('ap') });
          Cloud.user = d.user; close();
          await adoptAccount(d.user, true);
          saveCodeModal(d.recoveryCode, false);
        } else if (mode === 'password') {
          const d = await api('/api/auth/account', { op: 'password', current: val('ao'), password: val('ap') });
          Cloud.user = d.user; close(); toast('Password changed.');
        } else if (mode === 'code') {
          const d = await api('/api/auth/account', { op: 'recovery' });
          close(); saveCodeModal(d.recoveryCode, false);
        } else if (mode === 'delete') {
          await api('/api/auth/account', { op: 'delete', confirm: val('ad').trim().toLowerCase() });
          const p = me(); p.account = null; Cloud.user = null; saveLocal(); close(); renderTop(); route();
          toast('Your online account is deleted.');
        }
      } catch (ex) {
        err.hidden = false; err.textContent = ex.message === 'bad_request' && mode === 'delete' ? 'That isn\'t your username.' : errorText(ex.message);
        go.disabled = false;
      }
    });
  });
}

function saveCodeModal(code, fresh) {
  modal(`<h2>${fresh ? 'Your account is ready!' : 'Your new Save Code'}</h2>
    <p style="margin:0">This is your <b>Save Code</b>. If you ever forget your password, it's the only way back in, because we don't collect email addresses.</p>
    <div class="savecode" aria-label="Save Code">${esc(code)}</div>
    <p style="margin:0"><b>Write it down</b> and give it to a parent, guardian or teacher to keep somewhere safe. You won't see it again.</p>
    <label class="row check"><input type="checkbox" id="wrote"> I wrote my Save Code down.</label>
    <div class="row"><button type="button" class="btn light" id="copy">Copy code</button><span class="grow"></span><button type="button" class="btn primary" id="done" disabled>Done</button></div>`, (bg, close) => {
    bg.querySelector('#wrote').addEventListener('change', (e) => { bg.querySelector('#done').disabled = !e.target.checked; });
    bg.querySelector('#copy').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(code); e.target.textContent = 'Copied'; } catch (x) { e.target.textContent = 'Copy didn\'t work. Write it down instead.'; }
    });
    bg.querySelector('#done').addEventListener('click', () => { close(); if (fresh) toast('☁ Your progress now saves online.'); });
  }, true);
}

function renderPrivacy() {
  $('#main').innerHTML = `<article class="lesson"><nav class="crumbs"><a href="#map">← Map</a></nav>
    <h1>Privacy</h1>
    <section class="card"><h2>The short version</h2>
      <p>Python Quest is made for students, many of them under 13. We collect as little as possible.</p>
      <ul>
        <li><b>Without an account,</b> your progress stays in this browser. Nothing is sent to us.</li>
        <li><b>With an account,</b> we store your username, a scrambled (hashed) copy of your password and Save Code, and your Python Quest progress: nickname, buddy, track, stars, badges, streak and the code you wrote in missions.</li>
        <li>We never ask for an email address, real name, birthday, school, photo or location.</li>
        <li>No ads, no tracking, and we don't sell or share anything with anyone.</li>
        <li>A child should ask a parent, guardian or teacher before making an account.</li>
      </ul></section>
    <section class="card"><h2>Deleting your data</h2>
      <p>Sign in, open your explorer card (top right), and choose <b>Delete online account</b>. Your account and everything saved online are erased right away.</p>
      <p>To clear progress saved in this browser, choose <b>Reset my progress</b>, or clear this site's data in your browser settings.</p></section>
    <section class="card"><h2>Where it's stored</h2>
      <p>Accounts are stored with Cloudflare, which hosts this website. Python code runs inside your own browser; it isn't sent to a server.</p></section>
  </article>`;
  window.scrollTo(0, 0);
}
