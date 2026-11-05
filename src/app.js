// ================= Python engine (Pyodide in a Web Worker) =================
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const WORKER_SRC = `
let run = null, py = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      importScripts(m.base + 'pyodide.js');
      py = await loadPyodide({ indexURL: m.base });
      py.runPython(m.engine);
      run = py.globals.get('pq_run');
      postMessage({ type: 'ready' });
    } catch (err) { postMessage({ type: 'fatal', error: String(err) }); }
    return;
  }
  if (m.type === 'run') {
    let res;
    try {
      const inputs = py.toPy(m.inputs);
      res = JSON.parse(run(m.code, inputs, m.seed));
      inputs.destroy();
    } catch (err) {
      res = { out: '', err: { type: 'InternalError', msg: String(err), line: null }, need: null, turtle: { used: false, ops: [], turtles: [] } };
    }
    postMessage({ type: 'result', id: m.id, res });
  }
};`;

const Engine = {
  status: 'loading', worker: null, ready: null, pending: new Map(), nextId: 1, queue: Promise.resolve(), listeners: [],
  setStatus(s) { this.status = s; this.listeners.forEach(f => f(s)); },
  boot() {
    this.setStatus('loading');
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const w = new Worker(url);
    this.worker = w;
    this.ready = new Promise((resolve, reject) => {
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') { this.setStatus('ready'); resolve(); }
        else if (m.type === 'fatal') { this.setStatus('error'); reject(new Error(m.error)); }
        else if (m.type === 'result') { const f = this.pending.get(m.id); if (f) { this.pending.delete(m.id); f(m.res); } }
      };
      w.onerror = (e) => { this.setStatus('error'); reject(new Error(e.message || 'worker failed')); };
    });
    this.ready.catch(() => {});
    w.postMessage({ type: 'init', base: PYODIDE_BASE, engine: ENGINE_PY });
  },
  run(code, inputs = [], seed = 1) {
    const job = this.queue.then(() => this._run(code, inputs, seed));
    this.queue = job.catch(() => {});
    return job;
  },
  async _run(code, inputs, seed) {
    try { await this.ready; } catch (e) {
      return { engineDown: true, out: '', err: null, need: null, turtle: { used: false, ops: [] } };
    }
    return new Promise((resolve) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.worker.terminate();
        this.boot();
        resolve({ timeout: true, out: '', err: null, need: null, turtle: { used: false, ops: [] } });
      }, 6000);
      this.pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
      this.worker.postMessage({ type: 'run', id, code, inputs: inputs.map(String), seed });
    });
  }
};

// ================= Storage & progress =================
const KEY = 'pyquest.v1';
const AVATARS = ['🐍', '🦊', '🐢', '🐼', '🦉', '🐙', '🦖', '🐱'];
const LEVELS = [[0, 'Hatchling'], [200, 'Wiggler'], [500, 'Explorer'], [900, 'Coder'], [1400, 'Builder'], [2000, 'Hacker'], [2700, 'Wizard'], [3500, 'Legend']];
let DB = loadDB();
const GUEST = blankProfile('Guest', '🐍', 'explorer');

function loadDB() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.profiles) return j; } catch (e) {}
  return { profiles: {}, current: null };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
function blankProfile(name, avatar, track) {
  return { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, avatar, track, xp: 0, streak: 0, best: 0, lastDay: null, progress: {}, badges: [], unlockAll: false };
}
function me() { return DB.profiles[DB.current] || GUEST; }
function hasProfile() { return !!DB.profiles[DB.current]; }
function prog(id) {
  const p = me();
  if (!p.progress[id]) p.progress[id] = { quiz: false, quizFirst: false, main: false, bonus: false, code: {}, fails: { main: 0, bonus: 0 } };
  return p.progress[id];
}
function mastered(L) {
  const p = prog(L.id);
  const base = p.quiz && p.main;
  return me().track === 'challenger' ? base && p.bonus : base;
}
function unlocked(i) { return me().unlockAll || i === 0 || mastered(LESSONS[i - 1]); }
function levelOf(xp) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const [lo, name] = LEVELS[i]; const hi = LEVELS[i + 1] ? LEVELS[i + 1][0] : lo + 1000;
  return { n: i + 1, name, pct: Math.min(100, ((xp - lo) / (hi - lo)) * 100), toNext: hi - xp };
}
function dayStr(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function liveStreak() {
  const p = me(); const y = new Date(); y.setDate(y.getDate() - 1);
  return p.lastDay === dayStr() || p.lastDay === dayStr(y) ? p.streak : 0;
}
function touchStreak() {
  const p = me(); const today = dayStr(); const y = new Date(); y.setDate(y.getDate() - 1);
  if (p.lastDay === today) return;
  p.streak = p.lastDay === dayStr(y) ? p.streak + 1 : 1;
  p.best = Math.max(p.best || 0, p.streak);
  p.lastDay = today;
}

const BADGES = [
  { id: 'first', ico: '👋', name: 'First Words', desc: 'Finish Say Hello', test: () => prog('hello').main },
  { id: 'bug', ico: '🐞', name: 'Bug Squasher', desc: 'Finish Bug Hunt', test: () => prog('bugs').main },
  { id: 'art', ico: '🎨', name: 'Turtle Artist', desc: 'Draw your first square', test: () => prog('turtle').main },
  { id: 'w1', ico: '🚀', name: 'Launch Pad Hero', desc: 'Finish every World 1 mission', test: () => worldDone(1) },
  { id: 'w2', ico: '🔐', name: 'Vault Keeper', desc: 'Finish every World 2 mission', test: () => worldDone(2) },
  { id: 'w3', ico: '🐉', name: 'Dungeon Master', desc: 'Beat the Rock Paper Scissors boss', test: () => prog('rps').main },
  { id: 'quiz', ico: '🧠', name: 'Sharp Mind', desc: '5 quizzes right on the first try', test: () => LESSONS.filter(L => prog(L.id).quizFirst).length >= 5 },
  { id: 'bonus', ico: '⭐', name: 'Bonus Hunter', desc: 'Finish 5 bonus challenges', test: () => LESSONS.filter(L => prog(L.id).bonus).length >= 5 },
  { id: 'streak', ico: '🔥', name: 'On Fire', desc: 'Learn 3 days in a row', test: () => (me().best || 0) >= 3 }
];
function worldDone(w) { return LESSONS.filter(L => L.world === w).every(L => prog(L.id).main); }

function award(xp, why) {
  if (!hasProfile()) return;
  const p = me();
  const before = levelOf(p.xp).n;
  p.xp += xp;
  touchStreak();
  const fresh = BADGES.filter(b => !p.badges.includes(b.id) && b.test());
  fresh.forEach(b => p.badges.push(b.id));
  save();
  renderTop();
  toast(`+${xp} XP · ${why}`);
  const after = levelOf(p.xp);
  if (after.n > before) setTimeout(() => toast(`Level up! You are now a ${after.name}`), 1600);
  fresh.forEach((b, i) => setTimeout(() => toast(`${b.ico} New badge: ${b.name}`), 1600 * (i + 1 + (after.n > before ? 1 : 0))));
}

// ================= Small UI helpers =================
const $ = (sel, root = document) => root.querySelector(sel);
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
let toastTimer, toastQueue = [];
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = h('<div class="toast" role="status" aria-live="polite"></div>'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function confetti() {
  if (reduceMotion()) return;
  const c = h('<canvas id="confetti"></canvas>'); document.body.appendChild(c);
  const dpr = window.devicePixelRatio || 1; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const cols = ['#ffc93c', '#23935a', '#2f6fdc', '#ef5b4c', '#ffffff'];
  const P = Array.from({ length: 120 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .55, vx: (Math.random() - .5) * 14, vy: -Math.random() * 15 - 6, r: Math.random() * 6 + 4, c: cols[Math.random() * 5 | 0], a: Math.random() * 6 }));
  let f = 0;
  (function step() {
    g.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.a += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); g.restore(); });
    if (++f < 90) requestAnimationFrame(step); else c.remove();
  })();
}

const PIP = (cls = '') => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M14 84 C 14 64, 48 70, 48 54 S 30 36, 52 30 S 70 30, 72 30" fill="none" stroke="#16683f" stroke-width="19" stroke-linecap="round"/>
  <path d="M14 84 C 14 64, 48 70, 48 54 S 30 36, 52 30 S 70 30, 72 30" fill="none" stroke="#2fb06b" stroke-width="13" stroke-linecap="round"/>
  <circle cx="28" cy="71" r="3" fill="#ffc93c"/><circle cx="44" cy="58" r="3" fill="#ffc93c"/><circle cx="44" cy="40" r="3" fill="#ffc93c"/>
  <ellipse cx="76" cy="27" rx="17" ry="14" fill="#2fb06b" stroke="#16683f" stroke-width="3"/>
  <circle cx="72" cy="22" r="5" fill="#fff"/><circle cx="84" cy="22" r="5" fill="#fff"/>
  <circle cx="73" cy="23" r="2.4" fill="#15323a"/><circle cx="85" cy="23" r="2.4" fill="#15323a"/>
  <path d="M74 32 Q 79 36 85 32" fill="none" stroke="#15323a" stroke-width="2" stroke-linecap="round"/>
  <path d="M92 30 l7 -2 m-7 2 l7 3" stroke="#ef5b4c" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

// ================= Code editor =================
const KW = new Set('False None True and as break class continue def elif else for from if import in is lambda not or pass return while with try except finally raise global yield del assert'.split(' '));
const BI = new Set('print input int float str len range list dict abs min max round sum type bool random randint choice forward backward fd bk left right lt rt penup pendown up down color circle goto begin_fill end_fill pensize fillcolor pencolor speed dot write bgcolor setheading home hideturtle showturtle upper lower replace strip'.split(' '));
function highlight(src) {
  const re = /(#.*$)|([fFrRbB]{0,2}"(?:[^"\\\n]|\\.)*"?|[fFrRbB]{0,2}'(?:[^'\\\n]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/gm;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(src.slice(last, m.index));
    const t = m[0];
    if (m[1]) out += `<span class="tk-c">${esc(t)}</span>`;
    else if (m[2]) out += `<span class="tk-s">${esc(t)}</span>`;
    else if (m[3]) out += `<span class="tk-n">${t}</span>`;
    else if (t === 'True' || t === 'False' || t === 'None') out += `<span class="tk-t">${t}</span>`;
    else if (KW.has(t)) out += `<span class="tk-k">${t}</span>`;
    else if (BI.has(t)) out += `<span class="tk-b">${t}</span>`;
    else out += esc(t);
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

let edCount = 0;
function Editor(el, initial, onChange) {
  const id = 'ed' + (++edCount);
  el.innerHTML = `<div class="gutter"></div><pre aria-hidden="true"></pre><textarea id="${id}" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Python code editor. Press Escape, then Tab, to leave the editor." rows="2"></textarea>`;
  const ta = $('textarea', el), pre = $('pre', el), gut = $('.gutter', el);
  ta.value = initial;
  let escaped = false;
  function paint() {
    pre.innerHTML = highlight(ta.value) + '\n';
    const n = ta.value.split('\n').length;
    gut.innerHTML = Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('');
    ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px';
  }
  function insert(text) {
    ta.focus();
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  }
  ta.addEventListener('input', () => { paint(); onChange && onChange(ta.value); });
  ta.addEventListener('scroll', () => { pre.scrollLeft = ta.scrollLeft; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { escaped = true; return; }
    if (e.key === 'Tab' && !escaped && !e.shiftKey) { e.preventDefault(); insert('    '); return; }
    escaped = false;
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const before = ta.value.slice(0, ta.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      let ind = line.match(/^ */)[0];
      if (/:\s*(#.*)?$/.test(line)) ind += '    ';
      e.preventDefault(); insert('\n' + ind);
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); el.dispatchEvent(new CustomEvent('run-shortcut', { bubbles: true })); }
  });
  paint();
  requestAnimationFrame(paint);
  return { get: () => ta.value, set(v) { ta.value = v; paint(); onChange && onChange(v); }, ta };
}

// ================= Friendly errors =================
function friendly(err, code) {
  const t = err.type, m = err.msg || '';
  let say;
  if (t === 'SyntaxError') {
    if (/unterminated string|EOL|EOF while scanning/.test(m)) say = 'A string is missing its closing quote. Every <code>"</code> needs a partner.';
    else if (/was never closed/.test(m)) say = 'A bracket was opened but never closed. Count your <code>(</code> and <code>)</code>.';
    else if (/unmatched/.test(m)) say = 'There is a closing bracket with no opening bracket to match it.';
    else if (/expected ':'/.test(m)) say = 'Lines that start with <code>if</code>, <code>elif</code> or <code>else</code> need a colon <code>:</code> at the end.';
    else if (/Did you mean '=='/.test(m) || /cannot assign/.test(m)) say = 'To compare two things use <code>==</code>. A single <code>=</code> puts a value into a variable.';
    else if (/Missing parentheses/.test(m)) say = '<code>print</code> needs round brackets: <code>print("like this")</code>.';
    else if (/forgot a comma/.test(m)) say = 'Looks like a comma is missing between two things.';
    else say = 'Python can\'t understand the grammar of this line. Look for a missing comma, colon, quote or bracket.';
  } else if (t === 'IndentationError' || t === 'TabError') {
    if (/expected an indented block/.test(m)) say = 'After a line ending in <code>:</code>, the next line must be pushed in by 4 spaces.';
    else if (/unexpected indent/.test(m)) say = 'This line starts with spaces it shouldn\'t have. Move it back to the left edge.';
    else say = 'The spaces at the start of your lines don\'t line up. Lines in the same block need the same indent.';
  } else if (t === 'NameError') {
    const n = (m.match(/name '(\w+)'/) || [])[1] || '?';
    const near = { prnt: 'print', pritn: 'print', Print: 'print', imput: 'input', Input: 'input', true: 'True', false: 'False', lenght: 'len', forwad: 'forward' }[n];
    say = `Python doesn't know the word <code>${esc(n)}</code>.` + (near ? ` Did you mean <code>${near}</code>?` : ' Check the spelling. If it is meant to be text, put it in quotes. If it is a variable, make sure you created it first.');
  } else if (t === 'TypeError') {
    if (/concatenate str|can only concatenate|unsupported operand.*'str'|must be str, not/.test(m)) say = 'You are mixing text and a number with <code>+</code>. Use an f-string, a comma in print, or turn the number into text with <code>str()</code>.';
    else if (/not supported between instances of 'str' and 'int'/.test(m)) say = 'You are comparing text with a number. Did you forget <code>int()</code> around <code>input()</code>?';
    else if (/takes|missing|positional argument/.test(m)) say = 'A command got the wrong number of values inside its brackets.';
    else if (/not callable/.test(m)) say = 'You put brackets after something that isn\'t a command. Maybe a variable has the same name as a command?';
    else say = 'Two things that don\'t fit together were used together.';
  } else if (t === 'ValueError') {
    if (/invalid literal for int|could not convert string to float/.test(m)) say = '<code>int()</code> and <code>float()</code> can only turn number-text like <code>"12"</code> into a number. Try typing digits.';
    else say = 'A value was the right kind but not something Python could use.';
  } else if (t === 'ZeroDivisionError') say = 'You divided by zero. Not even Python can do that!';
  else if (t === 'AttributeError') say = 'That method doesn\'t exist for this kind of value. Check the spelling, like <code>.upper()</code>.';
  else if (t === 'IndexError') say = 'You asked for a position that doesn\'t exist. Remember, positions start at 0.';
  else if (t === 'ModuleNotFoundError' || t === 'ImportError') say = 'Python can\'t find that module. In Python Quest you can use <code>turtle</code>, <code>random</code> and <code>math</code>.';
  else if (t === 'RecursionError') say = 'Your program kept calling itself forever.';
  else say = 'Something went wrong while your program was running.';
  const lineTxt = err.line && code ? code.split('\n')[err.line - 1] : null;
  return `<div class="bug"><b>Pip found a bug${err.line ? ' on line ' + err.line : ''}.</b> ${say}` +
    (lineTxt != null && lineTxt.trim() ? `<span class="raw">${err.line} │ ${esc(lineTxt)}</span>` : '') +
    `<span class="raw">${esc(t)}: ${esc(m)}</span></div>`;
}

// ================= Turtle canvas =================
function cssColor(c) { return String(c || 'black').replace(/\s+/g, '').toLowerCase(); }
function drawTurtle(canvas, T) {
  const S = canvas.width, g = canvas.getContext('2d');
  const ops = T.ops || [];
  let m = 200;
  ops.forEach(o => {
    const pts = o[0] === 'line' ? [o[1], o[2], o[3], o[4]] : o[0] === 'fill' ? o[1].flat() : [o[1], o[2]];
    pts.forEach(v => { m = Math.max(m, Math.abs(v) + 20); });
  });
  (T.turtles || []).forEach(t => { m = Math.max(m, Math.abs(t.x) + 20, Math.abs(t.y) + 20); });
  const k = S / (2 * m), px = S / 420;
  const X = x => S / 2 + x * k, Y = y => S / 2 - y * k;
  function base() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = T.bg ? cssColor(T.bg) : '#fffdf6'; g.fillRect(0, 0, S, S);
    g.lineWidth = 1;
    for (let v = -Math.floor(m / 50) * 50; v <= m; v += 50) {
      g.strokeStyle = v === 0 ? 'rgba(21,50,58,.22)' : 'rgba(21,50,58,.07)';
      g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), S); g.moveTo(0, Y(v)); g.lineTo(S, Y(v)); g.stroke();
    }
  }
  function op(o) {
    if (o[0] === 'line') {
      g.strokeStyle = cssColor(o[5]); g.lineWidth = Math.max(1, o[6] * px); g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(o[1]), Y(o[2])); g.lineTo(X(o[3]), Y(o[4])); g.stroke();
    } else if (o[0] === 'fill') {
      g.fillStyle = cssColor(o[2]); g.beginPath();
      o[1].forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)));
      g.closePath(); g.fill();
    } else if (o[0] === 'dot') {
      g.fillStyle = cssColor(o[4]); g.beginPath(); g.arc(X(o[1]), Y(o[2]), Math.max(1, o[3] * px / 2), 0, Math.PI * 2); g.fill();
    } else if (o[0] === 'text') {
      g.fillStyle = cssColor(o[4]); g.font = `700 ${o[6] * px * 1.3}px Nunito, sans-serif`;
      g.textAlign = o[5] === 'center' ? 'center' : o[5] === 'right' ? 'right' : 'left';
      g.fillText(o[3], X(o[1]), Y(o[2]));
    }
  }
  function turtleAt(x, y, hdg) {
    g.save(); g.translate(X(x), Y(y)); g.rotate(-hdg * Math.PI / 180);
    const s = 9 * px;
    g.fillStyle = '#23935a'; g.strokeStyle = '#16683f'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s * 1.4, 0); g.lineTo(-s, s * 0.9); g.lineTo(-s * 0.5, 0); g.lineTo(-s, -s * 0.9); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  let i = 0;
  const per = Math.max(1, Math.ceil(ops.length / 80));
  const total = reduceMotion() ? ops.length : 0;
  i = total;
  (function frame() {
    base();
    for (let j = 0; j < Math.min(i, ops.length); j++) op(ops[j]);
    if (i < ops.length) {
      const lastLine = ops.slice(0, i).reverse().find(o => o[0] === 'line');
      if (lastLine) turtleAt(lastLine[3], lastLine[4], Math.atan2(lastLine[4] - lastLine[2], lastLine[3] - lastLine[1]) * 180 / Math.PI);
      i += per; requestAnimationFrame(frame);
    } else {
      (T.turtles || []).forEach(t => t.visible && turtleAt(t.x, t.y, t.h));
    }
  })();
}

// ================= Runner (editor + output) =================
function Runner(host, { code, onChange, check }) {
  host.innerHTML = `<div class="runner">
    <div class="editor"></div>
    <div class="bar">
      <button class="btn run" type="button">▶ Run</button>
      ${check ? '<button class="btn check" type="button">✓ Check my mission</button>' : ''}
      <span class="grow"></span>
      <button class="btn ghost reset" type="button">Start over</button>
    </div>
    <div class="console" aria-live="polite"></div>
    <div class="canvas-wrap" hidden><canvas width="840" height="840" aria-label="Turtle drawing"></canvas></div>
  </div>`;
  const original = code.original != null ? code.original : code.text;
  const ed = Editor($('.editor', host), code.text, onChange);
  const cons = $('.console', host), runBtn = $('.run', host), wrap = $('.canvas-wrap', host);
  let inputs = [], seed = 1, resetArmed = false;
  async function exec() {
    runBtn.disabled = true;
    cons.innerHTML = `<span class="muted">${Engine.status === 'ready' ? 'Running…' : 'Warming up the Python engine. The first run takes a few seconds…'}</span>`;
    const src = ed.get();
    const r = await Engine.run(src, inputs, seed);
    runBtn.disabled = false;
    show(r, src);
  }
  function show(r, src) {
    cons.innerHTML = '';
    if (r.engineDown) { cons.innerHTML = '<div class="bug"><b>The Python engine couldn\'t start.</b> Check your internet connection, then refresh the page.</div>'; return; }
    if (r.out) cons.appendChild(document.createTextNode(r.out));
    if (r.timeout) cons.insertAdjacentHTML('beforeend', '<div class="bug"><b>Your program ran for more than 6 seconds,</b> so Pip stopped it. Is something repeating forever?</div>');
    if (r.err) cons.insertAdjacentHTML('beforeend', friendly(r.err, src));
    if (r.need !== null && r.need !== undefined) {
      const box = h(`<form class="ask"><label class="sr" for="ask${edCount}">Your answer</label><input id="ask${edCount}" autocomplete="off" placeholder="Type your answer and press Enter"><button class="btn run" type="submit">Send</button></form>`);
      box.addEventListener('submit', (e) => { e.preventDefault(); inputs.push($('input', box).value); exec(); });
      cons.appendChild(box);
      setTimeout(() => $('input', box).focus({ preventScroll: true }), 30);
    }
    if (!r.out && !r.err && !r.timeout && r.need == null && !(r.turtle && r.turtle.used)) cons.innerHTML = '<span class="muted">Your program finished without printing anything.</span>';
    if (r.turtle && r.turtle.used) { wrap.hidden = false; drawTurtle($('canvas', wrap), r.turtle); } else wrap.hidden = true;
  }
  runBtn.addEventListener('click', () => { inputs = []; seed = Math.floor(Math.random() * 1e9); exec(); });
  host.addEventListener('run-shortcut', () => runBtn.click());
  const resetBtn = $('.reset', host);
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) { resetArmed = true; resetBtn.textContent = 'Tap again to reset'; setTimeout(() => { resetArmed = false; resetBtn.textContent = 'Start over'; }, 2500); return; }
    resetArmed = false; resetBtn.textContent = 'Start over'; ed.set(original); cons.innerHTML = ''; wrap.hidden = true;
  });
  if (check) $('.check', host).addEventListener('click', check);
  return { get: ed.get, set: ed.set, checkBtn: $('.check', host) };
}

class CheckFail extends Error {}
function tester(code) {
  return {
    code,
    async run(inputs = [], seed = 1) {
      const r = await Engine.run(code, inputs.map(String), seed);
      if (r.engineDown) throw new CheckFail('The Python engine couldn\'t start. Check your internet connection and refresh.');
      if (r.timeout) throw new CheckFail('Your program ran too long while Pip was testing it.');
      if (r.err) throw new CheckFail(`Pip hit a bug while testing: <b>${esc(r.err.type)}</b>${r.err.line ? ' on line ' + r.err.line : ''}. Press Run to see the details.`);
      if (r.need !== null && r.need !== undefined) throw new CheckFail('Your program asked for more answers than this mission gives it. Check how many times you use <code>input()</code>.');
      return r;
    }
  };
}

// ================= Views =================
function renderTop() {
  const p = me(), lv = levelOf(p.xp);
  $('#top').innerHTML = `
    <a class="brand" href="#map">${PIP()}<b>Python Quest</b></a>
    <div class="stats">
      <span class="engine ${Engine.status}" id="engine">${Engine.status === 'ready' ? 'Python ready' : Engine.status === 'error' ? 'Python offline' : 'Python loading…'}</span>
      <span class="stat" title="${lv.toNext > 0 ? lv.toNext + ' XP to the next level' : ''}"><span><span class="level">Lv ${lv.n} ${lv.name}</span><span class="xpbar"><i style="width:${lv.pct}%"></i></span></span>${p.xp.toLocaleString()} XP</span>
      <span class="stat" title="Days in a row"><span class="flame">🔥</span>${liveStreak()}</span>
      <button class="who" type="button" id="who"><span class="av">${p.avatar}</span>${esc(p.name)}</button>
    </div>`;
  $('#who').addEventListener('click', () => hasProfile() ? profileModal() : welcomeModal());
}
Engine.listeners.push(s => { const el = $('#engine'); if (el) { el.className = 'engine ' + s; el.textContent = s === 'ready' ? 'Python ready' : s === 'error' ? 'Python offline' : 'Python loading…'; } });

function nextLesson() {
  const i = LESSONS.findIndex((L, i) => unlocked(i) && !mastered(L));
  return i === -1 ? null : i;
}

function renderMap() {
  const main = $('#main');
  const ni = nextLesson();
  const doneCount = LESSONS.filter(L => prog(L.id).main).length;
  main.innerHTML = `
    <section class="hero">
      <div>
        <h1>${hasProfile() && doneCount ? `Welcome back, ${esc(me().name)}!` : 'Learn Python, one mission at a time'}</h1>
        <p>${doneCount ? `You have finished ${doneCount} of ${LESSONS.length} missions. Pip is proud of you.` : 'Join Pip on a quest through three worlds. Read a little, try the code, answer a quick question, then crack the mission. Every mission unlocks the next.'}</p>
        ${ni !== null ? `<a class="btn primary continue" href="#m-${LESSONS[ni].id}" style="display:inline-block;text-decoration:none">${doneCount ? 'Continue' : 'Start'}: Mission ${ni + 1} · ${LESSONS[ni].title}</a>` : '<p class="done-flag">You have mastered every mission so far. More worlds are coming soon!</p>'}
      </div>
      ${PIP('pip-big')}
    </section>
    ${WORLDS.map(W => {
      const ls = LESSONS.map((L, i) => [L, i]).filter(([L]) => L.world === W.id);
      const done = ls.filter(([L]) => prog(L.id).main).length;
      return `<section class="world" aria-labelledby="w${W.id}">
        <header><span class="tag">${W.tag}</span><h2 id="w${W.id}">${W.name}</h2><span class="count">${done} / ${ls.length}</span></header>
        <p>${W.blurb}</p>
        <div class="trail">${ls.map(([L, i]) => {
          const p = prog(L.id), open = unlocked(i), m = mastered(L);
          const cls = ['tile', m ? 'done' : '', i === ni ? 'next' : '', L.boss ? 'boss' : ''].join(' ');
          return `<button type="button" class="${cls}" data-go="${L.id}" ${open ? '' : 'disabled'} aria-label="Mission ${i + 1}: ${esc(L.title)}${open ? '' : ' (locked)'}">
            <span class="num">${open ? i + 1 : '🔒'}</span>
            <span class="t">${esc(L.title)}</span>
            <span class="s">${esc(L.skill)}</span>
            <span class="stars" aria-label="${[p.quiz, p.main, p.bonus].filter(Boolean).length} of 3 stars">${[p.quiz, p.main, p.bonus].map(on => `<span class="${on ? 'on' : ''}">★</span>`).join('')}</span>
          </button>`;
        }).join('')}</div>
      </section>`;
    }).join('')}
    <h2 class="section-title">Badges</h2>
    <div class="badges">${BADGES.map(b => {
      const got = me().badges.includes(b.id);
      return `<div class="badge ${got ? 'got' : ''}"><div class="ico" aria-hidden="true">${b.ico}</div><b>${b.name}</b><small>${b.desc}</small></div>`;
    }).join('')}</div>
    <p class="small" style="margin-top:24px">Stars: ★ quiz, ★ mission, ★ bonus. ${me().track === 'challenger' ? 'On the Challenger track, the bonus is needed to unlock the next mission.' : 'On the Explorer track, the bonus is optional.'} Progress is saved in this browser.</p>`;
  main.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { location.hash = 'm-' + b.dataset.go; }));
  window.scrollTo(0, 0);
}

function renderLesson(L) {
  const idx = LESSONS.indexOf(L);
  const main = $('#main');
  if (!unlocked(idx)) {
    main.innerHTML = `<div class="lesson"><div class="card"><h2>Mission ${idx + 1} is still locked</h2><p>Finish the mission before it first. Pip will be waiting here.</p><p><a class="btn primary" style="display:inline-block;text-decoration:none" href="#map">Back to the map</a></p></div></div>`;
    return;
  }
  const p = prog(L.id), W = WORLDS.find(w => w.id === L.world);
  const challenger = me().track === 'challenger';
  main.innerHTML = `<article class="lesson">
    <nav class="crumbs"><a href="#map">← Map</a><span>·</span><span>${W.tag}: ${W.name}</span><span>·</span><span>Mission ${idx + 1} of ${LESSONS.length}</span></nav>
    <h1>${esc(L.title)}</h1>
    <div class="steps" id="chips"></div>
    <div class="story">${PIP()}<p>${L.story}</p></div>
    ${L.learn.map((s, i) => `<section class="card"><div class="learn-n">Learn ${i + 1} of ${L.learn.length}</div><h3>${s.title}</h3>${s.html}${s.code ? `<div class="run-slot" data-learn="${i}"></div>` : ''}</section>`).join('')}
    <section class="card" id="quiz"><div class="learn-n">Quick check</div><h3>Quiz</h3><p>${L.quiz.q}</p>${L.quiz.code ? `<div class="quiz-code">${highlight(L.quiz.code)}</div>` : ''}
      <div class="opts">${L.quiz.options.map((o, i) => `<button type="button" class="opt" data-i="${i}">${esc(o)}</button>`).join('')}</div>
      <div class="feedback" aria-live="polite"></div></section>
    ${['main', 'bonus'].map(kind => {
      const part = L[kind];
      const label = kind === 'main' ? (L.boss ? 'Boss mission' : 'Your mission') : `Bonus challenge · ${challenger ? 'needed on the Challenger track' : 'optional, +75 XP'}`;
      return `<section class="card mission ${kind === 'bonus' ? 'bonus' : ''}" id="mission-${kind}">
        <div class="kicker">${label}</div>
        <h2>${kind === 'main' ? 'Mission' : 'Bonus'}</h2>
        <div>${part.prompt}</div>
        <div class="run-slot" data-part="${kind}"></div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn light hint-btn">Show a hint</button><button type="button" class="btn light sol-btn" hidden>Show Pip's answer</button></div>
        <div class="hint" hidden>💡 ${esc(part.hint)}</div>
        <div class="solution" hidden></div>
        <div class="verdict" hidden aria-live="polite"></div>
      </section>`;
    }).join('')}
    <div class="next-row" id="next-row"></div>
  </article>`;

  // learn runners
  main.querySelectorAll('[data-learn]').forEach(slot => {
    const s = L.learn[+slot.dataset.learn];
    Runner(slot, { code: { text: s.code } });
  });

  // quiz
  const quiz = $('#quiz', main), fb = $('.feedback', quiz);
  let wrongOnce = false;
  function showQuizDone() {
    quiz.querySelectorAll('.opt').forEach(b => { if (+b.dataset.i === L.quiz.answer) b.classList.add('right'); });
    fb.className = 'feedback good'; fb.innerHTML = '✓ ' + L.quiz.why;
  }
  if (p.quiz) showQuizDone();
  quiz.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    if (i === L.quiz.answer) {
      showQuizDone();
      if (!p.quiz) {
        p.quiz = true; p.quizFirst = !wrongOnce; save();
        award(wrongOnce ? 10 : 25, wrongOnce ? 'Quiz solved' : 'Quiz, first try!');
        refresh();
      }
    } else {
      wrongOnce = true; b.classList.add('wrong'); b.disabled = true;
      fb.className = 'feedback bad'; fb.textContent = 'Not quite. Have another look and try again.';
    }
  }));

  // missions
  ['main', 'bonus'].forEach(kind => {
    const part = L[kind], sec = $('#mission-' + kind, main);
    const verdict = $('.verdict', sec), solBtn = $('.sol-btn', sec), solBox = $('.solution', sec);
    let timer;
    const runner = Runner($('[data-part]', sec), {
      code: { text: p.code[kind] != null ? p.code[kind] : part.starter, original: part.starter },
      onChange(v) { clearTimeout(timer); timer = setTimeout(() => { p.code[kind] = v; if (hasProfile()) save(); }, 400); },
      check: async () => {
        const btn = runner.checkBtn; btn.disabled = true;
        verdict.hidden = false; verdict.className = 'verdict'; verdict.textContent = 'Pip is testing your code…';
        let res;
        try { res = await part.check(tester(runner.get())); }
        catch (e) { res = { ok: false, msg: e instanceof CheckFail ? e.message : 'Something went wrong while checking: ' + esc(e.message || e) }; }
        btn.disabled = false;
        if (res.ok) {
          const cheers = ['Brilliant!', 'Nailed it!', 'Pip is doing a happy wiggle!', 'Perfect!', 'You did it!'];
          verdict.className = 'verdict good';
          verdict.innerHTML = `✓ ${cheers[Math.random() * cheers.length | 0]} ${kind === 'main' ? 'Mission complete.' : 'Bonus complete.'}`;
          if (!p[kind]) {
            p[kind] = true; save();
            confetti();
            award(kind === 'main' ? (L.boss ? 200 : 100) : 75, kind === 'main' ? 'Mission complete' : 'Bonus complete');
            refresh();
          }
        } else {
          p.fails[kind] = (p.fails[kind] || 0) + 1; save();
          verdict.className = 'verdict bad'; verdict.innerHTML = '✗ ' + res.msg;
          if (p.fails[kind] >= (challenger ? 3 : 2)) solBtn.hidden = false;
        }
      }
    });
    if (p[kind]) { verdict.hidden = false; verdict.className = 'verdict good'; verdict.textContent = '✓ Already completed. You can keep experimenting.'; }
    if (p.fails[kind] >= (challenger ? 3 : 2) || p[kind]) solBtn.hidden = false;
    $('.hint-btn', sec).addEventListener('click', (e) => { const hb = $('.hint', sec); hb.hidden = !hb.hidden; e.target.textContent = hb.hidden ? 'Show a hint' : 'Hide hint'; });
    solBtn.addEventListener('click', () => {
      solBox.hidden = false;
      solBox.innerHTML = `<p class="small">Read it line by line and make sure you understand it. Then try typing it yourself instead of copying.</p><div class="quiz-code">${highlight(part.solution)}</div><div class="row" style="margin-top:8px"><button type="button" class="btn light use-sol">Put it in my editor</button></div>`;
      $('.use-sol', solBox).addEventListener('click', () => runner.set(part.solution));
      solBtn.hidden = true;
    });
  });

  function refresh() {
    const chips = [['Quiz', p.quiz], ['Mission', p.main], ['Bonus', p.bonus]];
    $('#chips', main).innerHTML = chips.map(([n, on]) => `<span class="step ${on ? 'on' : ''}">${on ? '★' : '☆'} ${n}</span>`).join('') +
      (mastered(L) ? '<span class="step on">Mastered</span>' : '');
    const nr = $('#next-row', main);
    const nxt = LESSONS[idx + 1];
    let right;
    if (!nxt) right = mastered(L) ? '<span class="done-flag">You beat every world so far. More are on the way!</span>' : '';
    else if (unlocked(idx + 1)) right = `<a class="btn primary" style="text-decoration:none" href="#m-${nxt.id}">Next: ${esc(nxt.title)} →</a>`;
    else right = `<span class="locked-note">${challenger ? 'Finish the quiz, mission and bonus' : 'Finish the quiz and the mission'} to unlock “${esc(nxt.title)}”.</span>`;
    nr.innerHTML = `<a class="btn light" style="text-decoration:none" href="#map">← Back to the map</a>${right}`;
  }
  refresh();
  window.scrollTo(0, 0);
}

// ================= Modals =================
function modal(html, onMount) {
  const bg = h(`<div class="modal-bg" role="dialog" aria-modal="true"><div class="modal">${html}</div></div>`);
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && hasProfile()) close(); };
  document.addEventListener('keydown', onKey);
  onMount(bg, close);
  const f = bg.querySelector('input, button'); f && f.focus();
  return close;
}

function welcomeModal(adding = false) {
  let avatar = AVATARS[0], track = 'explorer';
  modal(`
    <div class="row">${PIP('')}</div>
    <h2>${adding ? 'Add another explorer' : 'Welcome to Python Quest!'}</h2>
    <p style="margin:0">I'm Pip. I'll guide you from your very first line of code to building real games. Let's set up your explorer card.</p>
    <div><label for="nick">Pick a nickname</label><input type="text" id="nick" maxlength="20" placeholder="For example: CodeFox"><div class="small">Use a nickname, not your full real name.</div></div>
    <div><label id="avl">Choose a buddy</label><div class="avatars" role="group" aria-labelledby="avl">${AVATARS.map((a, i) => `<button type="button" data-a="${a}" aria-pressed="${i === 0}" aria-label="Avatar ${a}">${a}</button>`).join('')}</div></div>
    <div><label id="trl">Choose your track</label><div class="tracks" role="group" aria-labelledby="trl">
      <button type="button" class="track" data-t="explorer" aria-pressed="true"><b>Explorer</b><span>New to coding. Hints come sooner and bonus challenges are optional. Great for around grade 7.</span></button>
      <button type="button" class="track" data-t="challenger" aria-pressed="false"><b>Challenger</b><span>Ready for more. You must beat each bonus challenge to unlock the next mission. Great for around grade 10.</span></button>
    </div></div>
    <div class="row"><button type="button" class="btn primary" id="go">Start my quest</button>${adding ? '<button type="button" class="btn light" id="cancel">Cancel</button>' : ''}</div>
    <p class="small" style="margin:0">Your progress is saved in this browser on this device.</p>`, (bg, close) => {
    bg.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { avatar = b.dataset.a; bg.querySelectorAll('[data-a]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    bg.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { track = b.dataset.t; bg.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    const c = $('#cancel', bg); if (c) c.addEventListener('click', close);
    $('#go', bg).addEventListener('click', () => {
      const name = $('#nick', bg).value.trim();
      if (!name) { $('#nick', bg).focus(); $('#nick', bg).placeholder = 'Type a nickname first'; return; }
      const prof = blankProfile(name, avatar, track);
      DB.profiles[prof.id] = prof; DB.current = prof.id; save();
      close(); renderTop(); route();
      toast(`Welcome, ${name}! Your quest begins.`);
    });
  });
}

function profileModal() {
  const p = me();
  let resetArmed = false;
  modal(`
    <h2>${p.avatar} ${esc(p.name)}</h2>
    <p style="margin:0">Level ${levelOf(p.xp).n} ${levelOf(p.xp).name} · ${p.xp} XP · best streak ${p.best || 0} day(s)</p>
    <div><label id="trl2">Track</label><div class="tracks" role="group" aria-labelledby="trl2">
      <button type="button" class="track" data-t="explorer" aria-pressed="${p.track === 'explorer'}"><b>Explorer</b><span>Bonus challenges optional. Around grade 7.</span></button>
      <button type="button" class="track" data-t="challenger" aria-pressed="${p.track === 'challenger'}"><b>Challenger</b><span>Bonus needed to unlock the next mission. Around grade 10.</span></button>
    </div></div>
    <label class="row" style="font-weight:700"><input type="checkbox" id="ua" ${p.unlockAll ? 'checked' : ''}> Unlock all missions (for teachers and parents)</label>
    <div><label>Switch explorer</label><div class="profiles">${Object.values(DB.profiles).map(q => `<button type="button" data-p="${q.id}" class="${q.id === p.id ? 'cur' : ''}"><span style="font-size:22px">${q.avatar}</span><span><b>${esc(q.name)}</b><br><span class="small">${q.xp} XP · ${q.track}</span></span></button>`).join('')}</div></div>
    <div class="row"><button type="button" class="btn light" id="add">Add another explorer</button><button type="button" class="btn light" id="reset">Reset my progress</button><span class="grow"></span><button type="button" class="btn primary" id="close">Done</button></div>`, (bg, close) => {
    bg.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { p.track = b.dataset.t; save(); bg.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    $('#ua', bg).addEventListener('change', (e) => { p.unlockAll = e.target.checked; save(); });
    bg.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { DB.current = b.dataset.p; save(); close(); renderTop(); route(); }));
    $('#add', bg).addEventListener('click', () => { close(); welcomeModal(true); });
    $('#reset', bg).addEventListener('click', (e) => {
      if (!resetArmed) { resetArmed = true; e.target.textContent = 'Tap again: erase everything?'; return; }
      Object.assign(p, { xp: 0, streak: 0, best: 0, lastDay: null, progress: {}, badges: [] }); save(); close(); renderTop(); route();
    });
    $('#close', bg).addEventListener('click', () => { close(); renderTop(); route(); });
  });
}

// ================= Router & boot =================
function route() {
  const hsh = location.hash.slice(1);
  if (hsh.startsWith('m-')) {
    const L = LESSONS.find(x => 'm-' + x.id === hsh);
    if (L) return renderLesson(L);
  }
  renderMap();
}
window.addEventListener('hashchange', route);
Engine.boot();
renderTop();
route();
if (!hasProfile()) welcomeModal();
