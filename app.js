'use strict';

/* =========================================================================
   SF6 Ranked Lab — a better version of the ranked-grind spreadsheet.
   Vanilla JS, no dependencies, data lives in localStorage.
   ========================================================================= */

const LS_KEY = 'sf6lab:v1';

// Full SF6 roster as of July 2026: base 18 + Years 1-3 DLC (through Ingrid),
// plus the announced Year 4 fighters (Yasmine 8/2026, Arjun, Tifa, Bosch) so
// they're ready to pick the day they drop. The log form also has a free-text
// field for anyone Capcom adds after this list.
const ROSTER = ['A.K.I.', 'Akuma', 'Alex', 'Arjun', 'Blanka', 'Bosch', 'C. Viper',
  'Cammy', 'Chun-Li', 'Dee Jay', 'Dhalsim', 'E. Honda', 'Ed', 'Elena', 'Guile',
  'Ingrid', 'JP', 'Jamie', 'Juri', 'Ken', 'Kimberly', 'Lily', 'Luke', 'M. Bison',
  'Mai', 'Manon', 'Marisa', 'Rashid', 'Ryu', 'Sagat', 'Terry', 'Tifa', 'Yasmine',
  'Zangief'];

const ROUND_OPTS = ['V', 'P', 'OD', 'SA', 'CA', 'C', 'T'];
const ROUND_HELP = 'Per round: who took it, and the finish shown on the vs screen. V = KO · P = Perfect · OD = Overdrive · SA = Super Art · CA = Critical Art · C = chip (burnout) · T = time out';
// Rounds are stored as "+V" (round you won) / "-SA" (round the opponent won);
// a bare finish with no sign is legacy data where the winner wasn't recorded.
const roundSign = r => r.startsWith('+') ? 'W' : r.startsWith('-') ? 'L' : null;
const roundFinish = r => r.replace(/^[+-]/, '');
const FINISH_NAME = { V: 'KO', P: 'Perfect', OD: 'Overdrive', SA: 'Super Art', CA: 'Critical Art', C: 'Chip (burnout)', T: 'Time out' };

const DEF_ATTEMPTS = ['Block', 'Parry', 'Neutral Jump', 'Jump Out of Corner', 'Backdash',
  'Throw', 'Drive Impact', 'Drive Reversal', 'Super Art 3', 'A button', 'N/A'];
const DEF_OFFENSE = ['Button', 'Throw', 'Jump', 'Ranged Attack', 'Nothing'];
const DEF_RESULTS = ['Blocked', 'Parried', 'Jumped', 'Backdashed', 'Opponent Hit',
  'Reset to Neutral', 'Hit', 'Thrown', 'Crushed'];
const DEF_WAKEUPS = ['Neutral Standup', 'Back Roll'];
// Outcome classes for defense analytics
const OUT_ESCAPED = ['Parried', 'Jumped', 'Backdashed', 'Opponent Hit'];
const OUT_HELD = ['Blocked', 'Reset to Neutral'];
const OUT_LOST = ['Hit', 'Thrown', 'Crushed'];

const HIT_TYPES = ['Counter Hit', 'Clean Hit', 'Critical Counter', 'Throw', 'Anti-Air', 'Chip'];

/* ---------- rank math (SF6 LP thresholds) ---------- */
const TIERS = [
  ['Rookie', 0, 200], ['Iron', 1000, 400], ['Bronze', 3000, 400],
  ['Silver', 5000, 800], ['Gold', 9000, 800], ['Platinum', 13000, 1200],
  ['Diamond', 19000, 1200],
];

function rankOf(lp) {
  if (lp == null || isNaN(lp)) return null;
  if (lp >= 25000) return { name: 'Master', floor: 25000, next: null };
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const [tier, base, step] = TIERS[i];
    if (lp >= base) {
      const div = Math.min(5, Math.floor((lp - base) / step) + 1);
      return { name: `${tier} ${div}`, floor: base + (div - 1) * step, next: base + div * step };
    }
  }
  return { name: 'Rookie 1', floor: 0, next: 200 };
}

function rankFloors() {
  const out = [];
  for (const [tier, base, step] of TIERS)
    for (let d = 1; d <= 5; d++) out.push({ lp: base + (d - 1) * step, name: `${tier} ${d}` });
  out.push({ lp: 25000, name: 'Master' });
  return out;
}

/* ---------- tiny DOM helpers ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');
const pct = x => `${Math.round(x)}%`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shortDate = iso => { const [y, m, d] = iso.split('-'); return `${+m}/${+d}`; };
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- state ---------- */
// Each character you play has its own SF6 rank, so data is split into
// per-character profiles: db.profiles[name] = {matches, defense, hits}.
let db = loadDB();
let P = db.profiles[db.active];

function emptyProfile() { return { matches: [], defense: [], hits: [] }; }
function migrateDB(d) {
  let out;
  if (d && d.profiles && d.profiles[d.active]) out = d;
  else if (d && Array.isArray(d.matches)) // pre-profiles shape: hoist into one character
    out = {
      profiles: { Main: { matches: d.matches, defense: d.defense || [], hits: d.hits || [] } },
      active: 'Main', seedDismissed: !!d.seedDismissed, theme: d.theme ?? null,
    };
  else out = { profiles: { Main: emptyProfile() }, active: 'Main', seedDismissed: false, theme: null };
  // spreadsheet-era data was seeded before profiles existed and is all Zangief's
  const main = out.profiles.Main;
  if (main && !out.profiles.Zangief && main.matches.some(m => String(m.id).startsWith('seed-'))) {
    out.profiles.Zangief = main;
    delete out.profiles.Main;
    if (out.active === 'Main') out.active = 'Zangief';
  }
  // the sign-less seed rounds predate round-winner tracking; refresh them in place
  if (out.profiles.Zangief) {
    const fixed = new Map(parseSeed().matches.map(m => [m.id, m]));
    out.profiles.Zangief.matches = out.profiles.Zangief.matches.map(m => {
      const s = fixed.get(m.id);
      return s && !m.rounds.some(r => /^[+-]/.test(r)) ? { ...m, result: s.result, rounds: s.rounds } : m;
    });
  }
  return out;
}
function loadDB() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return migrateDB(JSON.parse(raw));
  } catch (e) { /* corrupted storage falls through to a fresh db */ }
  return migrateDB(null);
}
// Switch to another character's ladder; per-character drafts and filters reset.
function setActive(name) {
  db.active = name;
  P = db.profiles[name];
  logDraft = null; defDraft = null; hitDraft = null; editId = null; lastSaved = null;
  dashFilter = 'all'; matchFilter = { char: 'all', result: 'all' };
  saveDB();
}
// keys starting with "_" are derived at render time (e.g. the circular _set link) — never persist them
const dbJSON = () => JSON.stringify(db, (k, v) => k.startsWith('_') ? undefined : v);
function saveDB() {
  const json = dbJSON();
  localStorage.setItem(LS_KEY, json);
  rollBackup(json);
}

/* ---------- automatic rolling backups (localStorage safety net) ----------
   A ring of recent snapshots so a mistaken wipe/import is always recoverable
   even without a manual export. New snapshot only when enough changed, to keep
   the ring small: first save of a day, or 10+ matches since the last one. */
const BK_KEY = 'sf6lab:backups';
const BK_MAX = 6;
function loadBackups() { try { return JSON.parse(localStorage.getItem(BK_KEY)) || []; } catch (e) { return []; } }
function matchTotal(d) { try { return Object.values(d.profiles).reduce((a, p) => a + p.matches.length, 0); } catch (e) { return 0; } }
function rollBackup(json) {
  try {
    const total = matchTotal(db);
    if (total === 0) return; // nothing to protect yet
    const ring = loadBackups();
    const last = ring[ring.length - 1];
    const dayKey = new Date().toISOString().slice(0, 10);
    // Never snapshot a state that shrank — a wipe/clear/import must not push the
    // last good state out of the ring or become the "newest" restore point.
    // (Immediate undo of destructive actions is handled separately by undoState.)
    if (last && total < last.total) return;
    const fresh = !last || last.day !== dayKey || total - last.total >= 10;
    if (!fresh) return;
    ring.push({ ts: Date.now(), day: dayKey, total, json });
    while (ring.length > BK_MAX) ring.shift();
    try { localStorage.setItem(BK_KEY, JSON.stringify(ring)); }
    catch (e) { // storage full — drop oldest snapshots and retry once
      while (ring.length > 2) { ring.shift(); try { localStorage.setItem(BK_KEY, JSON.stringify(ring)); return; } catch (e2) { /* keep trimming */ } }
    }
  } catch (e) { /* backups are best-effort; never block a save */ }
}

function parseSeed() {
  const rows = str => str.trim().split('\n').map(l => l.split('|'));
  const matches = rows(SEED.matches).map((f, i) => ({
    id: 'seed-m' + (i + 1), num: i + 1, date: f[0], result: f[1],
    lpBefore: +f[2], delta: +f[3], rounds: f[4] ? f[4].split(',') : [],
    oppLP: f[5] ? +f[5] : null, newChallenger: !f[5], oppChar: f[6], note: f[7] || '',
  }));
  const defense = rows(SEED.defense).map((f, i) => ({
    id: 'seed-d' + (i + 1), match: +f[0], oppChar: f[1], health: f[2] ? +f[2] : null,
    round: f[3] ? +f[3] : null, attempt: f[4], offense: f[5] || '', result: f[6],
    wakeup: f[7] || '', corner: f[8] || '', note: f[9] || '',
  }));
  const hits = rows(SEED.hits).map((f, i) => ({
    id: 'seed-h' + (i + 1), match: +f[0], oppChar: f[1], health: f[2] ? +f[2] : null,
    round: f[3] ? +f[3] : null, type: f[4] || '', reason: f[5] || '', wakeup: f[6] || '',
    panic: f[7] || '', pdm: f[8] ? +f[8] : 0, note: f[9] || '',
  }));
  return { matches, defense, hits };
}

/* ---------- derived data ---------- */
// A match is either a placement (first 10, no LP shown), an LP match, or —
// after hitting Master at 25,000 LP — a Master Rate (MR) match.
const lpAfter = m => (m.placement || m.lpBefore == null) ? null : m.lpBefore + m.delta;
const trackOf = m => m.track || 'lp';
// Latest known ladder position: {track:'lp'|'mr', value} from the last non-placement match
function currentStatus() {
  for (let i = P.matches.length - 1; i >= 0; i--) {
    const m = P.matches[i];
    if (!m.placement) return { track: trackOf(m), value: lpAfter(m) };
  }
  return null;
}

// Group consecutive matches vs the same opponent into first-to-2 sets.
// A same-character opponent with an LP jump > 200 counts as a new opponent.
function computeSets(ms) {
  const sets = [];
  let cur = null;
  for (const m of ms) {
    let cont = cur && !cur.closed && cur.char === m.oppChar && cur.games.length < 3;
    if (cont && m.oppLP != null && cur.lastOppVal != null) {
      // same opponent's rating barely moves between games; MR steps are smaller than LP
      const tol = trackOf(m) === 'mr' ? 80 : 200;
      if (Math.abs(m.oppLP - cur.lastOppVal) > tol) cont = false;
    }
    // CFN timestamps: games within a set are back-to-back, so a long gap means a
    // fresh encounter (common when you face the same character again later)
    if (cont && cur.lastPlayedAt != null && m.playedAt != null && m.playedAt - cur.lastPlayedAt > 600) cont = false;
    if (!cont) { cur = { char: m.oppChar, games: [], wins: 0, losses: 0, closed: false, lastOppVal: null, lastPlayedAt: null }; sets.push(cur); }
    cur.games.push(m);
    if (m.result === 'W') cur.wins++; else cur.losses++;
    if (m.oppLP != null) cur.lastOppVal = m.oppLP;
    if (m.playedAt != null) cur.lastPlayedAt = m.playedAt;
    if (cur.wins === 2 || cur.losses === 2) cur.closed = true;
    m._set = cur;
    m._setGame = cur.games.length;
  }
  return sets;
}

/* ---------- set adaptation & tilt analytics (CFN data makes these free) ---------- */
function setAdaptation(sets) {
  let g1w = 0, g1n = 0, laterW = 0, laterN = 0;
  let wonG1 = 0, closedOut = 0, lostG1 = 0, cameBack = 0;
  for (const set of sets) {
    if (!set.games.length) continue;
    const g1 = set.games[0];
    g1n++; if (g1.result === 'W') g1w++;
    for (let i = 1; i < set.games.length; i++) { laterN++; if (set.games[i].result === 'W') laterW++; }
    if (set.closed) { // only decided sets tell us who took the set
      const setWon = set.wins > set.losses;
      if (g1.result === 'W') { wonG1++; if (setWon) closedOut++; }
      else { lostG1++; if (setWon) cameBack++; }
    }
  }
  const rate = (w, n) => ({ w, n, wr: n ? 100 * w / n : 0 });
  return {
    g1: rate(g1w, g1n), later: rate(laterW, laterN),
    close: rate(closedOut, wonG1), comeback: rate(cameBack, lostG1),
  };
}

// Round flow inside a single match (best-of-3 rounds). Every decided match is
// exactly one of six paths — enumerated in full — plus per-round winrates.
function roundFlow(ms) {
  const paths = { WW: 0, WLW: 0, LWW: 0, WLL: 0, LWL: 0, LL: 0 };
  let total = 0, r1w = 0, r2w = 0, r3w = 0, went3 = 0, partial = 0;
  let wonR1 = 0, wonR1Win = 0, lostR1 = 0, lostR1Win = 0;
  for (const m of ms) {
    if (m.placement) continue;
    if (!m.rounds || !m.rounds.length) continue;
    const seq = m.rounds.map(roundSign).filter(Boolean); // 'W'/'L' per round
    const myR = seq.filter(x => x === 'W').length, opR = seq.filter(x => x === 'L').length;
    if (seq.length < 2 || seq.length > 3 || (myR !== 2 && opR !== 2)) { partial++; continue; } // incomplete round data
    total++;
    const key = seq.join('');
    if (paths[key] !== undefined) paths[key]++;
    const won = myR > opR;
    if (seq[0] === 'W') { r1w++; wonR1++; if (won) wonR1Win++; } else { lostR1++; if (won) lostR1Win++; }
    if (seq[1] === 'W') r2w++;
    if (seq.length === 3) { went3++; if (seq[2] === 'W') r3w++; }
  }
  const rate = (w, n) => ({ w, n, wr: n ? 100 * w / n : 0 });
  return {
    total, partial, paths,
    sweep: rate(paths.WW, total),
    closeOut: rate(wonR1Win, wonR1), comeback: rate(lostR1Win, lostR1),
    r1: rate(r1w, total), r2: rate(r2w, total), r3: rate(r3w, went3), decider: rate(r3w, went3),
  };
}

// Split ranked matches into per-session ordered lists (a session = one date).
function sessionSequences(ms) {
  const map = new Map();
  for (const m of ms) if (!m.placement) { if (!map.has(m.date)) map.set(m.date, []); map.get(m.date).push(m); }
  return [...map.values()];
}

function tiltByPosition(sessions) {
  const defs = [['Games 1–5', 1, 5], ['Games 6–10', 6, 10], ['Games 11–20', 11, 20], ['Games 21+', 21, Infinity]];
  const buckets = defs.map(([label, lo, hi]) => ({ label, lo, hi, w: 0, n: 0 }));
  for (const sess of sessions) sess.forEach((m, i) => {
    const b = buckets.find(x => i + 1 >= x.lo && i + 1 <= x.hi);
    b.n++; if (m.result === 'W') b.w++;
  });
  return buckets.filter(b => b.n).map(b => ({ label: b.label, value: 100 * b.w / b.n, n: b.n, detail: `${b.w}–${b.n - b.w}` }));
}

function tiltAfterLosses(sessions) {
  const labels = ['Fresh / after a win', 'After 1 loss', 'After 2 losses', 'After 3+ losses'];
  const b = labels.map(label => ({ label, w: 0, n: 0 }));
  for (const sess of sessions) {
    let streak = 0;
    for (const m of sess) {
      const k = Math.min(streak, 3);
      b[k].n++; if (m.result === 'W') b[k].w++;
      streak = m.result === 'L' ? streak + 1 : 0;
    }
  }
  return b.filter(x => x.n).map(x => ({ label: x.label, value: 100 * x.w / x.n, n: x.n, detail: `${x.w}–${x.n - x.w}` }));
}

// How often you peak mid-session then give rating back before logging off.
function giveBackStats(sessions) {
  let counted = 0, gaveBack = 0, gaveBackN = 0, worst = null;
  for (const sess of sessions) {
    if (sess.length < 3) continue;
    const track = trackOf(sess[sess.length - 1]);
    const vals = sess.filter(m => trackOf(m) === track).map(lpAfter).filter(v => v != null);
    if (vals.length < 3) continue;
    counted++;
    const peak = Math.max(...vals), end = vals[vals.length - 1], gb = peak - end;
    if (gb > 0) {
      gaveBack += gb; gaveBackN++;
      if (!worst || gb > worst.gb) worst = { gb, date: sess[0].date, peak, end, track };
    }
  }
  return { counted, gaveBackN, avg: gaveBackN ? Math.round(gaveBack / gaveBackN) : 0, worst };
}

function record(ms) {
  const w = ms.filter(m => m.result === 'W').length;
  return { w, l: ms.length - w, n: ms.length, wr: ms.length ? 100 * w / ms.length : 0 };
}
function streakOf(ms) {
  if (!ms.length) return { kind: null, len: 0 };
  const last = ms[ms.length - 1].result;
  let len = 0;
  for (let i = ms.length - 1; i >= 0 && ms[i].result === last; i--) len++;
  return { kind: last, len };
}
function byChar(ms) {
  const map = new Map();
  for (const m of ms) {
    if (!map.has(m.oppChar)) map.set(m.oppChar, []);
    map.get(m.oppChar).push(m);
  }
  return [...map.entries()].map(([char, list]) => ({ char, ...record(list) }))
    .sort((a, b) => b.n - a.n || a.char.localeCompare(b.char));
}
function sessionsOf(ms) {
  const map = new Map();
  for (const m of ms) {
    if (!map.has(m.date)) map.set(m.date, []);
    map.get(m.date).push(m);
  }
  return [...map.entries()].map(([date, list]) => {
    const ranked = list.filter(m => !m.placement);
    const lastRanked = ranked[ranked.length - 1];
    return {
      date, ...record(list),
      netLP: ranked.filter(m => trackOf(m) === 'lp').reduce((a, m) => a + m.delta, 0),
      netMR: ranked.filter(m => trackOf(m) === 'mr').reduce((a, m) => a + m.delta, 0),
      end: lastRanked ? { track: trackOf(lastRanked), value: lpAfter(lastRanked) } : null,
    };
  });
}
const deltaMismatch = m => !m.placement && !m.pendingDelta && ((m.result === 'W' && m.delta < 0) || (m.result === 'L' && m.delta > 0));

/* ---------- tooltip ---------- */
const ttEl = document.getElementById('tooltip');
function showTT(evt, rowsHtmlNodes) {
  ttEl.innerHTML = '';
  ttEl.append(...rowsHtmlNodes);
  ttEl.hidden = false;
  const pad = 14, r = ttEl.getBoundingClientRect();
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
  ttEl.style.left = x + 'px'; ttEl.style.top = y + 'px';
}
function hideTT() { ttEl.hidden = true; }
const ttTitle = t => h('div', { class: 'tt-title' }, t);
const ttRow = (k, v) => h('div', { class: 'tt-row' }, h('span', {}, k), h('b', {}, v));

/* ---------- chart plumbing ---------- */
let liveCharts = [];
function registerChart(host, draw) {
  liveCharts.push({ host, draw });
  // defer the first draw until the host is attached, so clientWidth is real
  requestAnimationFrame(() => host.isConnected && draw());
}
let resizeTimer = null;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => liveCharts.forEach(c => c.host.isConnected && c.draw()), 150);
});

function chartCard({ title, sub, legend, draw, table }) {
  const host = h('div', { class: 'chart-host' });
  const tblWrap = h('div', { class: 'tbl-wrap' }, table ? table() : '');
  tblWrap.hidden = true;
  const toggle = table ? h('button', { class: 'toggle-tbl', onclick: () => {
    const showTbl = tblWrap.hidden;
    tblWrap.hidden = !showTbl; host.hidden = showTbl;
    toggle.classList.toggle('sel', showTbl);
  } }, '⊞ table') : null;
  const card = h('div', { class: 'card' },
    h('h3', {}, title, toggle),
    sub ? h('p', { class: 'sub' }, sub) : null,
    legend ? buildLegend(legend) : null,
    host, tblWrap);
  registerChart(host, () => draw(host));
  return card;
}
function buildLegend(items) {
  return h('div', { class: 'legend' },
    items.map(it => h('span', { class: 'key' },
      h('span', { class: 'swatch', style: `background:${it.color}` }), it.label)));
}
function buildTable(cols, rows) {
  return h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.num ? 'num' : null }, c.label)))),
    h('tbody', {}, rows.map(r => h('tr', {}, cols.map(c =>
      h('td', { class: c.num ? 'num' : null }, r[c.key] ?? ''))))));
}
function emptyNote(host, msg) { host.innerHTML = ''; host.append(h('div', { class: 'chart-empty' }, msg)); }

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

// Horizontal bar with 4px rounded data-end, square at the baseline
function barPath(x0, x1, y, hgt, r = 4) {
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const w = Math.max(right - left, 0.5), rr = Math.min(r, w, hgt / 2);
  if (x1 >= x0) // rounded on the right
    return `M${left},${y} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${hgt - 2 * rr} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-(w - rr)} z`;
  return `M${right},${y} h${-(w - rr)} a${rr},${rr} 0 0 0 ${-rr},${rr} v${hgt - 2 * rr} a${rr},${rr} 0 0 0 ${rr},${rr} h${w - rr} z`;
}

/* ---------- LP line chart ---------- */
function drawLPChart(host, ms, { mr = false } = {}) {
  host.innerHTML = '';
  if (ms.length < 2) return emptyNote(host, `Log a couple of ${mr ? 'Master' : ''} matches to see your ${mr ? 'MR' : 'LP'} curve.`);
  const W = Math.max(320, host.clientWidth), H = 300;
  const M = { t: 16, r: 70, b: 34, l: 52 };
  const pts = ms.map((m, i) => ({ i, v: lpAfter(m), m }));
  const vmin = Math.min(...pts.map(p => p.v)), vmax = Math.max(...pts.map(p => p.v));
  const lo = vmin - 60, hi = vmax + 80;
  const X = i => M.l + (W - M.l - M.r) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const Y = v => M.t + (H - M.t - M.b) * (1 - (v - lo) / (hi - lo));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });

  // y grid at nice steps
  const step = niceStep((hi - lo) / 4);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), stroke: cssVar('--grid'), 'stroke-width': 1 }));
    svg.append(s('text', { x: M.l - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: cssVar('--muted') }, fmt(v)));
  }
  // rank division floors inside the window (LP), or the MR starting line (Master).
  // On a wide window, per-division labels would collide — keep tier starts only.
  let guides = mr ? [{ lp: 1500, name: 'MR start' }] : rankFloors();
  if (!mr && guides.filter(f => f.lp > lo && f.lp < hi).length > 8)
    guides = guides.filter(f => / 1$|Master/.test(f.name));
  for (const f of guides) if (f.lp > lo && f.lp < hi) {
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(f.lp), y2: Y(f.lp), stroke: cssVar('--axis'), 'stroke-width': 1 }));
    svg.append(s('text', { x: W - M.r + 6, y: Y(f.lp) + 4, 'font-size': 11, fill: cssVar('--muted') }, f.name));
  }
  // session boundaries on the x axis
  let lastDate = null, lastLabelX = -Infinity;
  pts.forEach(p => {
    if (p.m.date !== lastDate) {
      lastDate = p.m.date;
      if (p.i > 0) svg.append(s('line', { x1: X(p.i), x2: X(p.i), y1: M.t, y2: H - M.b, stroke: cssVar('--grid'), 'stroke-width': 1 }));
      if (X(p.i) - lastLabelX >= 42) { // skip labels that would collide
        svg.append(s('text', { x: X(p.i), y: H - 10, 'font-size': 11, fill: cssVar('--muted') }, shortDate(p.m.date)));
        lastLabelX = X(p.i);
      }
    }
  });

  const blue = cssVar('--blue');
  const lineD = pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  svg.append(s('path', { d: `${lineD}L${X(pts.length - 1)},${Y(lo)}L${X(0)},${Y(lo)}Z`, fill: blue, opacity: 0.1 }));
  svg.append(s('path', { d: lineD, fill: 'none', stroke: blue, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  const last = pts[pts.length - 1];
  svg.append(s('circle', { cx: X(last.i), cy: Y(last.v), r: 5, fill: blue, stroke: cssVar('--surface'), 'stroke-width': 2 }));
  svg.append(s('text', { x: X(last.i), y: Y(last.v) - 10, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 650, fill: cssVar('--ink') }, fmt(last.v)));

  // hover crosshair + tooltip
  const hoverDot = s('circle', { r: 5, fill: blue, stroke: cssVar('--surface'), 'stroke-width': 2, visibility: 'hidden' });
  const hoverLine = s('line', { y1: M.t, y2: H - M.b, stroke: cssVar('--axis'), 'stroke-width': 1, visibility: 'hidden' });
  svg.append(hoverLine, hoverDot);
  const overlay = s('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  overlay.addEventListener('pointermove', evt => {
    const box = svg.getBoundingClientRect();
    const px = (evt.clientX - box.left) * (W / box.width);
    const idx = Math.max(0, Math.min(pts.length - 1, Math.round((px - M.l) / ((W - M.l - M.r) / (pts.length - 1)))));
    const p = pts[idx];
    hoverLine.setAttribute('x1', X(p.i)); hoverLine.setAttribute('x2', X(p.i));
    hoverLine.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('cx', X(p.i)); hoverDot.setAttribute('cy', Y(p.v));
    hoverDot.setAttribute('visibility', 'visible');
    showTT(evt, [
      ttTitle(`Match ${p.m.num} · ${shortDate(p.m.date)}`),
      ttRow('Result', p.m.result === 'W' ? 'Win' : 'Loss'),
      ttRow(mr ? 'MR' : 'LP', `${fmt(p.v)} (${p.m.delta >= 0 ? '+' : ''}${p.m.delta})`),
      ttRow('Opponent', `${p.m.oppChar}${p.m.oppLP ? ' · ' + fmt(p.m.oppLP) : ''}`),
    ]);
  });
  overlay.addEventListener('pointerleave', () => {
    hideTT(); hoverLine.setAttribute('visibility', 'hidden'); hoverDot.setAttribute('visibility', 'hidden');
  });
  svg.append(overlay);
  host.append(svg);
}

/* ---------- diverging matchup bars (winrate vs 50%) ---------- */
function drawMatchups(host, rows) {
  host.innerHTML = '';
  if (!rows.length) return emptyNote(host, 'No matches in this range yet.');
  const W = Math.max(320, host.clientWidth), rowH = 30, labelW = 86, padR = 88;
  const H = rows.length * rowH + 26;
  const plotL = labelW, plotR = W - padR;
  const X = v => plotL + (plotR - plotL) * (v / 100);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const blue = cssVar('--blue'), red = cssVar('--red');

  svg.append(s('line', { x1: X(50), x2: X(50), y1: 0, y2: H - 22, stroke: cssVar('--axis'), 'stroke-width': 1 }));
  svg.append(s('text', { x: X(50), y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: cssVar('--muted') }, '50%'));
  for (const v of [0, 100]) svg.append(s('text', { x: X(v), y: H - 8, 'text-anchor': v ? 'end' : 'start', 'font-size': 11, fill: cssVar('--muted') }, v + '%'));

  rows.forEach((r, i) => {
    const y = i * rowH + (rowH - 14) / 2;
    const winSide = r.wr >= 50;
    svg.append(s('text', { x: labelW - 8, y: y + 11, 'text-anchor': 'end', 'font-size': 12.5, fill: cssVar('--ink-2') }, r.char));
    if (Math.abs(r.wr - 50) > 0.5)
      svg.append(s('path', { d: barPath(X(50), X(r.wr), y, 14), fill: winSide ? blue : red }));
    else
      svg.append(s('rect', { x: X(50) - 1.5, y, width: 3, height: 14, fill: cssVar('--neutral-seg') }));
    const lbl = `${r.w}–${r.l} · ${pct(r.wr)}`;
    // losing bars grow left; if the label would run into the name column, park it right of the axis
    const clash = !winSide && X(r.wr) - 78 < labelW + 4;
    const lx = winSide ? X(r.wr) + 6 : clash ? X(50) + 6 : X(r.wr) - 6;
    svg.append(s('text', { x: lx, y: y + 11, 'text-anchor': (winSide || clash) ? 'start' : 'end', 'font-size': 12, fill: cssVar('--ink') }, lbl));
    const hit = s('rect', { x: 0, y: i * rowH, width: W, height: rowH, fill: 'transparent' });
    hit.addEventListener('pointermove', evt => showTT(evt, [
      ttTitle(`vs ${r.char}`), ttRow('Games', r.n), ttRow('Record', `${r.w}–${r.l}`), ttRow('Winrate', pct(r.wr)),
    ]));
    hit.addEventListener('pointerleave', hideTT);
    svg.append(hit);
  });
  host.append(svg);
}

/* ---------- simple horizontal bars (counts or percents) ---------- */
function drawBars(host, rows, { isPct = false, labelW = 150 } = {}) {
  host.innerHTML = '';
  if (!rows.length) return emptyNote(host, 'Nothing logged yet.');
  const W = Math.max(320, host.clientWidth), rowH = 28, padR = 84;
  const H = rows.length * rowH + 4;
  const maxV = isPct ? 100 : Math.max(...rows.map(r => r.value), 1);
  const X = v => labelW + (W - labelW - padR) * (v / maxV);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const blue = cssVar('--blue');
  rows.forEach((r, i) => {
    const y = i * rowH + (rowH - 14) / 2;
    const name = r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label;
    svg.append(s('text', { x: labelW - 8, y: y + 11, 'text-anchor': 'end', 'font-size': 12.5, fill: cssVar('--ink-2') }, name));
    svg.append(s('path', { d: barPath(X(0), X(r.value), y, 14), fill: r.color ? cssVar(r.color) : blue }));
    const lbl = isPct ? `${pct(r.value)} (n=${r.n})` : fmt(r.value);
    svg.append(s('text', { x: X(r.value) + 6, y: y + 11, 'font-size': 12, fill: cssVar('--ink') }, lbl));
    const hit = s('rect', { x: 0, y: i * rowH, width: W, height: rowH, fill: 'transparent' });
    hit.addEventListener('pointermove', evt => showTT(evt, [
      ttTitle(r.label), ttRow(isPct ? 'Rate' : 'Count', lbl),
      ...(r.detail ? [ttRow('', r.detail)] : []),
    ]));
    hit.addEventListener('pointerleave', hideTT);
    svg.append(hit);
  });
  host.append(svg);
}

/* ---------- 100% stacked outcome bars (escaped / held / lost) ---------- */
function drawOutcomeStacks(host, rows) {
  host.innerHTML = '';
  if (!rows.length) return emptyNote(host, 'Nothing logged yet.');
  const W = Math.max(320, host.clientWidth), rowH = 30, labelW = 132, padR = 56;
  const H = rows.length * rowH + 4;
  const plotW = W - labelW - padR;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const colors = [cssVar('--blue'), cssVar('--neutral-seg'), cssVar('--red')];
  rows.forEach((r, i) => {
    const y = i * rowH + (rowH - 16) / 2;
    const name = r.label.length > 18 ? r.label.slice(0, 17) + '…' : r.label;
    svg.append(s('text', { x: labelW - 8, y: y + 12, 'text-anchor': 'end', 'font-size': 12.5, fill: cssVar('--ink-2') }, name));
    let x = labelW;
    r.segs.forEach((v, k) => {
      if (!v) return;
      const w = plotW * (v / r.n);
      const gap = k < 2 ? 2 : 0;
      svg.append(s('rect', { x, y, width: Math.max(w - gap, 1), height: 16, rx: 3, fill: colors[k] }));
      if (w - gap > 36) {
        const inkOnSeg = k === 1 ? cssVar('--ink') : '#ffffff';
        svg.append(s('text', { x: x + (w - gap) / 2, y: y + 12, 'text-anchor': 'middle', 'font-size': 11, fill: inkOnSeg }, pct(100 * v / r.n)));
      }
      x += w;
    });
    svg.append(s('text', { x: W - padR + 8, y: y + 12, 'font-size': 11.5, fill: cssVar('--muted') }, `n=${r.n}`));
    const hit = s('rect', { x: 0, y: i * rowH, width: W, height: rowH, fill: 'transparent' });
    hit.addEventListener('pointermove', evt => showTT(evt, [
      ttTitle(r.label),
      ttRow('Escaped / won it', `${r.segs[0]} (${pct(100 * r.segs[0] / r.n)})`),
      ttRow('Held ground', `${r.segs[1]} (${pct(100 * r.segs[1] / r.n)})`),
      ttRow('Got opened up', `${r.segs[2]} (${pct(100 * r.segs[2] / r.n)})`),
      ttRow('Attempts', r.n),
    ]));
    hit.addEventListener('pointerleave', hideTT);
    svg.append(hit);
  });
  host.append(svg);
}

/* =========================================================================
   TABS
   ========================================================================= */
const panes = {
  log: document.getElementById('tab-log'),
  dash: document.getElementById('tab-dash'),
  matches: document.getElementById('tab-matches'),
  defense: document.getElementById('tab-defense'),
  hits: document.getElementById('tab-hits'),
  data: document.getElementById('tab-data'),
};
let activeTab = 'log';

/* ---------- click-again-to-confirm buttons ----------
   window.confirm() is silently blocked in sandboxed embeds, so destructive
   actions arm on the first click and fire on the second. */
function armedBtn(label, onFire, { confirmText = 'Click again to confirm', danger = true } = {}) {
  let armed = false, timer = null;
  const b = h('button', { class: 'btn' + (danger ? ' danger' : ''), onclick: () => {
    if (!armed) {
      armed = true; b.textContent = confirmText; b.classList.add('armed');
      timer = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('armed'); }, 4000);
      return;
    }
    clearTimeout(timer); onFire();
  } }, label);
  return b;
}
function armedRowBtn(title, onFire) {
  let armed = false, timer = null;
  const b = h('button', { class: 'rowbtn', title, onclick: () => {
    if (!armed) {
      armed = true; b.textContent = 'sure?'; b.classList.add('armed');
      timer = setTimeout(() => { armed = false; b.textContent = '✕'; b.classList.remove('armed'); }, 3000);
      return;
    }
    clearTimeout(timer); onFire();
  } }, '✕');
  return b;
}

/* ---------- chip group helper ---------- */
function chipGroup(options, initial, onPick, { small = false, allowNone = true } = {}) {
  let value = initial ?? null;
  const wrap = h('div', { class: 'chip-row' });
  const btns = options.map(o => h('button', {
    type: 'button', class: 'chip' + (small ? ' small' : '') + (String(o) === String(value) ? ' sel' : ''),
    onclick: () => {
      value = (String(value) === String(o) && allowNone) ? null : o;
      btns.forEach((b, i) => b.classList.toggle('sel', String(options[i]) === String(value)));
      onPick(value);
    },
  }, String(o)));
  wrap.append(...btns);
  wrap.setValue = v => { value = v; btns.forEach((b, i) => b.classList.toggle('sel', String(options[i]) === String(v))); };
  return wrap;
}

/* ---------- LOG TAB ---------- */
let logDraft = null, editId = null;
function freshDraft() {
  const st = currentStatus();
  const placements = P.matches.filter(m => m.placement).length;
  // hit 25,000 LP → the ladder switches to Master Rate, which starts at 1500
  const track = st && (st.track === 'mr' || st.value >= 25000) ? 'mr' : 'lp';
  const before = st ? (track === 'mr' && st.track === 'lp' ? 1500 : st.value) : '';
  return {
    date: todayISO(), result: null,
    placement: !st && placements < 10, track,
    before, change: '', total: '', lastEdited: 'change',
    oppChar: null, oppLP: '', newChallenger: false,
    rounds: [{ w: null, f: null }, { w: null, f: null }, { w: null, f: null }],
    modern: false, note: '',
  };
}

function charOptions() {
  const seen = byChar(P.matches).map(r => r.char);
  const rest = ROSTER.filter(c => !seen.includes(c));
  return [...seen, ...rest];
}

function renderLog() {
  const pane = panes.log;
  pane.innerHTML = '';
  if (!logDraft) logDraft = freshDraft();
  const d = logDraft;
  const placements = P.matches.filter(m => m.placement).length;
  const unit = () => d.track === 'mr' ? 'MR' : 'LP';

  const hint = h('div', { class: 'hint' });
  const updateHint = () => {
    if (d.placement) {
      hint.textContent = `Placement match ${Math.min(placements + 1, 10)} of 10 — SF6 hides LP until placements finish. When the game places you, turn the placement chip off and enter your placed LP as "LP before".`;
      hint.className = 'hint';
      return;
    }
    const before = parseInt(d.before), t = parseInt(d.total);
    if (isNaN(before) || isNaN(t)) { hint.textContent = 'Wins add, losses subtract — just enter the change the game shows.'; hint.className = 'hint'; return; }
    const delta = t - before;
    let msg = `${fmt(before)} → ${fmt(t)} ${unit()} (${delta >= 0 ? '+' : ''}${delta})`;
    let cls = 'hint';
    if (d.track === 'lp') {
      const rb = rankOf(before), ra = rankOf(t);
      msg += ` · ${ra.name}`;
      if (before < 25000 && t >= 25000) { msg += ' — YOU HIT MASTER! Next match switches to Master Rate (MR starts at 1500)'; cls = 'hint ok'; }
      else if (ra.floor > rb.floor) { msg += ` · PROMOTION to ${ra.name}!`; cls = 'hint ok'; }
      else if (ra.floor < rb.floor) { msg += ` · demoted to ${ra.name}`; cls = 'hint warn'; }
    }
    if ((d.result === 'W' && delta < 0) || (d.result === 'L' && delta > 0)) { msg += ' · result and change disagree — double-check'; cls = 'hint warn'; }
    hint.textContent = msg; hint.className = cls;
  };

  const beforeInput = h('input', { type: 'number', value: d.before, placeholder: d.track === 'mr' ? 'e.g. 1500' : 'e.g. 21183',
    oninput: e => { d.before = e.target.value; sync(d.lastEdited); } });
  const changeInput = h('input', { type: 'number', min: 0, value: d.change, placeholder: 'e.g. 55',
    oninput: e => { d.change = e.target.value; d.lastEdited = 'change'; sync('change'); } });
  const totalInput = h('input', { type: 'number', value: d.total, placeholder: 'auto',
    oninput: e => { d.total = e.target.value; d.lastEdited = 'total'; sync('total'); } });
  function sync(from) {
    const before = parseInt(d.before);
    if (from === 'change') {
      const mag = Math.abs(parseInt(d.change));
      if (!isNaN(before) && !isNaN(mag) && d.result) {
        d.total = String(before + (d.result === 'W' ? mag : -mag));
        totalInput.value = d.total;
      }
    } else {
      const t = parseInt(d.total);
      if (!isNaN(before) && !isNaN(t)) { d.change = String(Math.abs(t - before)); changeInput.value = d.change; }
    }
    updateHint();
  }
  const oppLPInput = h('input', { type: 'number', value: d.oppLP, placeholder: d.track === 'mr' ? 'opponent MR' : 'opponent LP',
    oninput: e => { d.oppLP = e.target.value; } });
  const noteInput = h('input', { type: 'text', value: d.note, placeholder: 'anything worth remembering…',
    oninput: e => { d.note = e.target.value; } });
  const dateInput = h('input', { type: 'date', value: d.date, oninput: e => { d.date = e.target.value; } });

  const winBtn = h('button', { type: 'button', class: 'wl-btn win' + (d.result === 'W' ? ' sel' : ''), onclick: () => pickResult('W') }, 'WIN');
  const lossBtn = h('button', { type: 'button', class: 'wl-btn loss' + (d.result === 'L' ? ' sel' : ''), onclick: () => pickResult('L') }, 'LOSS');
  function pickResult(r) {
    d.result = r;
    winBtn.classList.toggle('sel', r === 'W'); lossBtn.classList.toggle('sel', r === 'L');
    sync(d.lastEdited);
  }

  const placementChip = chipGroup([`Placement match (${Math.min(placements + 1, 10)}/10)`],
    d.placement ? `Placement match (${Math.min(placements + 1, 10)}/10)` : null,
    v => { d.placement = !!v; renderLog(); }, { small: true });
  const showTrack = d.track === 'mr' || P.matches.some(m => trackOf(m) === 'mr') ||
    (currentStatus() && currentStatus().track === 'lp' && currentStatus().value >= 25000);
  const trackChips = showTrack && !d.placement ? chipGroup(['LP', 'MR (Master)'],
    d.track === 'mr' ? 'MR (Master)' : 'LP',
    v => {
      d.track = v === 'MR (Master)' ? 'mr' : 'lp';
      if (d.track === 'mr' && d.before === '') d.before = 1500;
      renderLog();
    }, { small: true, allowNone: false }) : null;

  const opts = charOptions();
  const customInput = h('input', {
    type: 'text', style: 'max-width:220px',
    value: d.oppChar && !opts.includes(d.oppChar) ? d.oppChar : '',
    placeholder: 'not listed? type the character…',
    oninput: e => {
      const v = e.target.value.trim();
      d.oppChar = v || null;
      if (v) charChips.setValue(null);
    },
  });
  const charChips = chipGroup(opts, d.oppChar, v => { d.oppChar = v; customInput.value = ''; }, { small: true });
  const ncChip = chipGroup(['New Challenger (LP hidden)'], d.newChallenger ? 'New Challenger (LP hidden)' : null,
    v => { d.newChallenger = !!v; oppLPInput.disabled = !!v; if (v) { d.oppLP = ''; oppLPInput.value = ''; } }, { small: true });
  oppLPInput.disabled = d.newChallenger;
  const modernChip = chipGroup(['Modern controls opponent'], d.modern ? 'Modern controls opponent' : null, v => { d.modern = !!v; }, { small: true });

  const roundRows = [0, 1, 2].map(i => {
    const rd = d.rounds[i];
    return h('div', { class: 'field' }, h('span', {}, `Round ${i + 1}`),
      h('div', { style: 'display:flex;flex-direction:column;gap:5px' },
        chipGroup(['I won', 'Opp won'], rd.w === 'W' ? 'I won' : rd.w === 'L' ? 'Opp won' : null,
          v => { rd.w = v == null ? null : v === 'I won' ? 'W' : 'L'; }, { small: true }),
        chipGroup(ROUND_OPTS, rd.f, v => { rd.f = v; }, { small: true })));
  });

  const saveMsg = h('div', { class: 'hint' });
  const saveBtn = h('button', { class: 'btn primary', onclick: () => {
    if (!d.result) return saveMsg.textContent = 'Pick Win or Loss first.';
    if (!d.oppChar) return saveMsg.textContent = 'Pick the opponent character.';
    const base = {
      id: editId || uid(),
      num: editId ? P.matches.find(m => m.id === editId).num : (P.matches.reduce((a, m) => Math.max(a, m.num), 0) + 1),
      date: d.date, result: d.result,
      rounds: d.rounds.filter(r => r.f || r.w).map(r => (r.w ? (r.w === 'W' ? '+' : '-') : '') + (r.f || '')),
      oppLP: d.newChallenger || d.oppLP === '' ? null : parseInt(d.oppLP),
      newChallenger: d.newChallenger, oppChar: d.oppChar,
      note: [d.note.trim(), d.modern ? 'Modern Controls' : ''].filter(Boolean).join(' · '),
    };
    let rec;
    if (d.placement) {
      rec = { ...base, placement: true, track: 'lp', lpBefore: null, delta: null };
    } else {
      const before = parseInt(d.before);
      if (isNaN(before)) return saveMsg.textContent = `Enter your ${unit()} before the match (your placed LP if placements just finished).`;
      let delta;
      const t = parseInt(d.total);
      if (d.lastEdited === 'total' && !isNaN(t)) delta = t - before;
      else {
        const mag = Math.abs(parseInt(d.change));
        if (isNaN(mag)) return saveMsg.textContent = `Enter the ${unit()} change the game showed.`;
        delta = d.result === 'W' ? mag : -mag;
      }
      rec = { ...base, placement: false, track: d.track, lpBefore: before, delta };
    }
    if (editId) {
      const i = P.matches.findIndex(m => m.id === editId);
      P.matches[i] = rec; editId = null;
    } else {
      P.matches.push(rec);
    }
    saveDB();
    const savedOpp = { oppChar: rec.oppChar, oppLP: rec.oppLP, newChallenger: rec.newChallenger };
    logDraft = freshDraft();
    lastSaved = { num: rec.num, ...savedOpp };
    renderAll();
  } }, editId ? 'Save changes' : 'Save match');

  const cancelEdit = editId ? h('button', { class: 'btn', onclick: () => { editId = null; logDraft = freshDraft(); renderLog(); } }, 'Cancel edit') : null;

  const rematchBtn = lastSaved && !editId ? h('button', { class: 'btn', onclick: () => {
    logDraft.oppChar = lastSaved.oppChar;
    logDraft.newChallenger = lastSaved.newChallenger;
    logDraft.oppLP = lastSaved.oppLP ?? '';
    renderLog();
  } }, `Rematch vs ${lastSaved.oppChar}`) : null;

  pane.append(
    h('div', { class: 'card' },
      h('h3', {}, editId ? `Editing match #${P.matches.find(m => m.id === editId)?.num}` : 'Log a match'),
      h('p', { class: 'sub' }, 'Wins add, losses subtract — you only type the change the game shows. Rank, promotions, Master Rate, and set scores are derived.'),
      h('div', { style: 'display:flex;flex-direction:column;gap:14px' },
        h('div', { class: 'wl-row' }, winBtn, lossBtn),
        h('div', { class: 'chip-row' }, placementChip, trackChips),
        h('div', { class: 'form-grid' },
          h('div', { class: 'field' }, h('span', {}, 'Date'), dateInput),
          !d.placement && h('div', { class: 'field' }, h('span', {}, `Your ${unit()} before`), beforeInput),
          !d.placement && h('div', { class: 'field' }, h('span', {}, `${unit()} change this match`), changeInput),
          !d.placement && h('div', { class: 'field' }, h('span', {}, 'New total (auto — fix if drifted)'), totalInput),
          h('div', { class: 'field' }, h('span', {}, d.track === 'mr' ? 'Opponent MR' : 'Opponent LP'), oppLPInput)),
        hint,
        h('div', { class: 'field' }, h('span', {}, 'Opponent character (your most-faced first)'), charChips, customInput),
        h('div', { class: 'chip-row' }, ncChip, modernChip),
        h('div', { class: 'field' },
          h('span', { title: ROUND_HELP }, 'Rounds (optional) — who won each, and the finish (V · P · OD · SA · CA · C · T)'),
          h('div', { class: 'form-grid' }, roundRows)),
        h('div', { class: 'field' }, h('span', {}, 'Notes'), noteInput),
        h('div', { class: 'btn-row' }, saveBtn, cancelEdit, rematchBtn, saveMsg))),
    recentCard());
  updateHint();
}
let lastSaved = null;

function recentCard() {
  const recent = P.matches.slice(-8).reverse();
  if (!recent.length) return h('div', { class: 'card' }, h('h3', {}, 'Recent matches'), h('p', { class: 'sub' }, 'Nothing yet — your history shows up here.'));
  computeSets(P.matches);
  return h('div', { class: 'card' },
    h('h3', {}, 'Recent matches'),
    h('div', { class: 'recent-list' }, recent.map(m => {
      const set = m._set;
      const setTxt = set && set.closed && set.games[set.games.length - 1] === m ? ` · set ${set.wins}–${set.losses}` : '';
      return h('div', { class: 'recent-item' },
        h('span', { class: `badge ${m.result}` }, m.result),
        h('span', { class: 'who' }, `#${m.num} vs ${m.oppChar}${setTxt}`),
        m.note ? h('span', { class: 'note-cell' }, m.note) : null,
        h('span', { class: 'lp' }, m.placement ? 'placement' :
          `${fmt(lpAfter(m))}${trackOf(m) === 'mr' ? ' MR' : ''} (${m.pendingDelta ? '…' : (m.delta >= 0 ? '+' : '') + m.delta})`),
        armedRowBtn('Delete', () => {
          P.matches = P.matches.filter(x => x.id !== m.id); saveDB(); renderAll();
        }));
    })));
}

/* ---------- DASHBOARD TAB ---------- */
let dashFilter = 'all';
function renderDash() {
  const pane = panes.dash;
  pane.innerHTML = '';
  const all = P.matches;
  if (!all.length) {
    pane.append(h('div', { class: 'card' }, h('h3', {}, 'Dashboard'),
      h('p', { class: 'sub' }, 'Log matches (or load your spreadsheet history from the Data tab) and the analytics light up.')));
    return;
  }
  computeSets(all);
  const dates = [...new Set(all.map(m => m.date))];
  if (dashFilter !== 'all' && !dates.includes(dashFilter)) dashFilter = 'all';
  const ms = dashFilter === 'all' ? all : all.filter(m => m.date === dashFilter);

  // filter row
  const sel = h('select', { onchange: e => { dashFilter = e.target.value; renderDash(); } },
    h('option', { value: 'all' }, 'All time'),
    dates.slice().reverse().map(dt => h('option', { value: dt, selected: dashFilter === dt }, `Session ${shortDate(dt)} (${dt})`)));
  pane.append(h('div', { class: 'card filter-row' }, h('label', {}, 'Range'), sel));

  // KPIs
  const rec = record(ms);
  const stk = streakOf(ms);
  const st = currentStatus();
  const ranked = ms.filter(m => !m.placement);
  const lpMs = ranked.filter(m => trackOf(m) === 'lp');
  const mrMs = ranked.filter(m => trackOf(m) === 'mr');
  const net = st ? ranked.filter(m => trackOf(m) === st.track).reduce((a, m) => a + m.delta, 0) : 0;
  const sets = [...new Set(ms.map(m => m._set))].filter(sx => sx.closed);
  const setW = sets.filter(sx => sx.wins === 2).length;
  const placements = P.matches.filter(m => m.placement).length;
  const rank = st && st.track === 'lp' ? rankOf(st.value) : null;
  const progress = rank ? (rank.next ? Math.max(0, Math.min(1, (st.value - rank.floor) / (rank.next - rank.floor))) : 1) : 1;

  pane.append(h('div', { class: 'kpis' },
    st ? h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, st.track === 'mr' ? 'Current MR' : 'Current LP'),
      h('div', { class: 'k-value' }, fmt(st.value)),
      h('div', { class: `k-delta ${net > 0 ? 'up' : net < 0 ? 'down' : ''}` }, `${net >= 0 ? '+' : ''}${fmt(net)} ${dashFilter === 'all' ? 'lifetime' : 'this session'}`))
    : h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Placements'),
      h('div', { class: 'k-value' }, `${Math.min(placements, 10)}/10`),
      h('div', { class: 'k-delta' }, 'LP starts once the game places you')),
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Rank'),
      h('div', { class: 'k-value' }, st ? (st.track === 'mr' ? 'Master' : rank.name) : 'Unranked'),
      h('div', { class: 'k-delta' }, st ? (st.track === 'mr' ? 'Master Rate replaces LP' : `${fmt(rank.next - st.value)} LP to ${rank.next === 25000 ? 'MASTER' : 'next'}`) : 'finish placements'),
      st && st.track === 'lp' ? h('div', { class: 'meter' }, h('div', { style: `width:${(progress * 100).toFixed(0)}%` })) : null),
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Winrate'),
      h('div', { class: 'k-value' }, pct(rec.wr)),
      h('div', { class: 'k-delta' }, `${rec.w}–${rec.l} in ${rec.n} games`)),
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Sets (first to 2)'),
      h('div', { class: 'k-value' }, sets.length ? pct(100 * setW / sets.length) : '—'),
      h('div', { class: 'k-delta' }, `${setW}–${sets.length - setW} sets won`)),
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Streak'),
      h('div', { class: 'k-value' }, stk.len ? `${stk.len}${stk.kind}` : '—'),
      h('div', { class: `k-delta ${stk.kind === 'W' ? 'up' : 'down'}` }, stk.kind === 'W' ? 'winning streak' : 'losing streak — breathe'))));

  // LP / MR charts
  const curveTable = list => () => buildTable(
    [{ key: 'num', label: '#', num: true }, { key: 'date', label: 'Date' }, { key: 'result', label: 'W/L' },
     { key: 'lp', label: 'Total', num: true }, { key: 'delta', label: 'Δ', num: true }, { key: 'opp', label: 'Opponent' }],
    list.map(m => ({ num: m.num, date: m.date, result: m.result, lp: fmt(lpAfter(m)), delta: m.delta, opp: m.oppChar })));
  if (lpMs.length) pane.append(chartCard({
    title: 'LP over time',
    sub: 'Each point is one match; hairlines mark rank divisions and session starts.',
    draw: host => drawLPChart(host, lpMs),
    table: curveTable(lpMs),
  }));
  if (mrMs.length) pane.append(chartCard({
    title: 'Master Rate over time',
    sub: 'MR starts at 1500 when you reach Master.',
    draw: host => drawLPChart(host, mrMs, { mr: true }),
    table: curveTable(mrMs),
  }));

  // matchups + opponent strength (strength compares like-for-like on the current track)
  const chars = byChar(ms);
  const main = chars.filter(c => c.n >= 2), rare = chars.filter(c => c.n < 2);
  const sTrack = st ? st.track : 'lp';
  const T = sTrack === 'mr' ? { even: 50, high: 150, unit: 'MR' } : { even: 300, high: 1200, unit: 'LP' };
  const diffs = ranked.filter(m => trackOf(m) === sTrack && m.oppLP != null).map(m => ({ d: m.oppLP - m.lpBefore, m }));
  const buckets = [
    { label: `Lower-rated (≤ −${T.even})`, test: x => x <= -T.even },
    { label: `Even (±${T.even})`, test: x => x > -T.even && x < T.even },
    { label: `Higher (+${T.even}…${T.high})`, test: x => x >= T.even && x <= T.high },
    { label: `Much higher (> ${T.high})`, test: x => x > T.high },
  ].map(b => {
    const list = diffs.filter(x => b.test(x.d)).map(x => x.m);
    const r = record(list);
    return { label: b.label, value: r.wr, n: r.n, detail: `${r.w}–${r.l}` };
  }).filter(b => b.n > 0);

  pane.append(h('div', { class: 'card-grid' },
    chartCard({
      title: 'Matchups — winrate vs 50%',
      sub: 'Blue = winning matchup, red = losing. ' + (rare.length ? 'One-off opponents: ' + rare.map(c => `${c.char} ${c.w}–${c.l}`).join(', ') : ''),
      draw: host => drawMatchups(host, main),
      table: () => buildTable(
        [{ key: 'char', label: 'Character' }, { key: 'n', label: 'Games', num: true },
         { key: 'rec', label: 'Record', num: true }, { key: 'wr', label: 'Winrate', num: true }],
        chars.map(c => ({ char: c.char, n: c.n, rec: `${c.w}–${c.l}`, wr: pct(c.wr) }))),
    }),
    chartCard({
      title: 'Winrate by opponent strength',
      sub: `Opponent ${T.unit} relative to yours at match time.`,
      draw: host => drawBars(host, buckets, { isPct: true, labelW: 168 }),
      table: () => buildTable(
        [{ key: 'label', label: `Opponent ${T.unit} diff` }, { key: 'n', label: 'Games', num: true },
         { key: 'detail', label: 'Record', num: true }, { key: 'wr', label: 'Winrate', num: true }],
        buckets.map(b => ({ label: b.label, n: b.n, detail: b.detail, wr: pct(b.value) }))),
    })));

  // round-level breakdown (rounds with a recorded winner)
  const roundAgg = won => {
    const map = new Map();
    for (const m of ms) for (const r of m.rounds) {
      if (roundSign(r) !== (won ? 'W' : 'L')) continue;
      const label = FINISH_NAME[roundFinish(r)] || roundFinish(r) || 'Unspecified';
      map.set(label, (map.get(label) || 0) + 1);
    }
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const wonRounds = roundAgg(true), lostRounds = roundAgg(false);
  const roundTable = rows => () => buildTable(
    [{ key: 'label', label: 'Finish' }, { key: 'value', label: 'Rounds', num: true }], rows);
  if (wonRounds.length || lostRounds.length) pane.append(h('div', { class: 'card-grid' },
    chartCard({
      title: 'Rounds you won — the finish',
      sub: `${wonRounds.reduce((a, r) => a + r.value, 0)} rounds taken.`,
      draw: host => drawBars(host, wonRounds, { labelW: 110 }),
      table: roundTable(wonRounds),
    }),
    chartCard({
      title: 'Rounds you lost — what ended you',
      sub: `${lostRounds.reduce((a, r) => a + r.value, 0)} rounds dropped.`,
      draw: host => drawBars(host, lostRounds, { labelW: 110 }),
      table: roundTable(lostRounds),
    })));

  // round flow within a match — sweeps, closing a 1–0 lead, deciding rounds
  const flow = roundFlow(ms);
  if (flow.total >= 6) {
    const tile = (label, r, sub) => h('div', { class: 'kpi' },
      h('div', { class: 'k-label' }, label),
      h('div', { class: 'k-value' }, r.n ? pct(r.wr) : '—'),
      h('div', { class: 'k-delta' }, r.n ? `${r.w} of ${r.n} · ${sub}` : 'no data yet'));
    const p = flow.paths;
    const insight = `You win round 1 in ${pct(flow.r1.wr)} of matches. Take it and you close ${pct(flow.closeOut.wr)}; drop it and you recover only ${pct(flow.comeback.wr)}. You blew a 1–0 lead ${p.WLL} time${p.WLL === 1 ? '' : 's'} and were swept 0–2 ${p.LL} time${p.LL === 1 ? '' : 's'}.`;
    // every decided best-of-3, most decisive win → most decisive loss
    const pathRows = [
      { label: '2–0', value: p.WW, n: p.WW, color: '--blue', detail: 'won both rounds' },
      { label: '2–1 · won R1', value: p.WLW, n: p.WLW, color: '--blue', detail: 'W–L–W, held on' },
      { label: '2–1 · lost R1', value: p.LWW, n: p.LWW, color: '--blue', detail: 'L–W–W, comeback' },
      { label: '1–2 · won R1', value: p.WLL, n: p.WLL, color: '--red', detail: 'W–L–L, blew a 1–0 lead' },
      { label: '1–2 · lost R1', value: p.LWL, n: p.LWL, color: '--red', detail: 'L–W–L, forced a 3rd, lost it' },
      { label: '0–2', value: p.LL, n: p.LL, color: '--red', detail: 'lost both rounds' },
    ];
    const roundRows = [
      { label: 'Round 1', value: flow.r1.wr, n: flow.r1.n, detail: `${flow.r1.w}–${flow.r1.n - flow.r1.w}`, color: flow.r1.wr >= 50 ? '--blue' : '--red' },
      { label: 'Round 2', value: flow.r2.wr, n: flow.r2.n, detail: `${flow.r2.w}–${flow.r2.n - flow.r2.w}`, color: flow.r2.wr >= 50 ? '--blue' : '--red' },
      { label: 'Round 3 (decider)', value: flow.r3.wr, n: flow.r3.n, detail: `${flow.r3.w}–${flow.r3.n - flow.r3.w}`, color: flow.r3.wr >= 50 ? '--blue' : '--red' },
    ];
    pane.append(h('div', { class: 'card' },
      h('h3', {}, 'Round flow — how your matches play out'),
      h('p', { class: 'sub' }, insight),
      h('div', { class: 'kpis' },
        tile('2–0 sweep rate', flow.sweep, 'of all matches'),
        tile('Close out a 1–0 lead', flow.closeOut, 'won round 1 → won match'),
        tile('Come back from 0–1', flow.comeback, 'lost round 1 → won match'),
        tile('Deciding round winrate', flow.decider, 'game-3 rounds')),
      h('div', { class: 'card-grid', style: 'margin-top:14px' },
        chartCard({
          title: 'Every way a match ends',
          sub: `All 6 best-of-3 paths across ${flow.total} matches${flow.partial ? ` (${flow.partial} with partial round data excluded)` : ''}.`,
          draw: host => drawBars(host, pathRows, { labelW: 108 }),
          table: () => buildTable(
            [{ key: 'label', label: 'Path' }, { key: 'detail', label: '' }, { key: 'value', label: 'Matches', num: true }],
            pathRows.map(r => ({ label: r.label, detail: r.detail, value: r.value }))),
        }),
        chartCard({
          title: 'Winrate by round',
          sub: 'Which round position you actually win.',
          draw: host => drawBars(host, roundRows, { isPct: true, labelW: 118 }),
          table: () => buildTable(
            [{ key: 'label', label: 'Round' }, { key: 'n', label: 'Matches', num: true },
             { key: 'detail', label: 'Record', num: true }, { key: 'wr', label: 'Winrate', num: true }],
            roundRows.map(r => ({ label: r.label, n: r.n, detail: r.detail, wr: pct(r.value) }))),
        }))));
  }

  // set adaptation — do you adjust inside a first-to-2?
  const allSets = [...new Set(ms.map(m => m._set))];
  const adapt = setAdaptation(allSets);
  if (adapt.g1.n >= 6) {
    const tile = (label, r, sub) => h('div', { class: 'kpi' },
      h('div', { class: 'k-label' }, label),
      h('div', { class: 'k-value' }, r.n ? pct(r.wr) : '—'),
      h('div', { class: 'k-delta' }, r.n ? `${r.w}–${r.n - r.w} · ${sub}` : 'not enough sets yet'));
    const delta = adapt.later.wr - adapt.g1.wr;
    const insight = Math.abs(delta) < 4
      ? 'Your game-1 and later-game winrates are close — you neither snowball nor adjust much within a set.'
      : delta > 0
        ? `You win ${Math.round(delta)} pts more in games 2–3 than in game 1 — you adapt as a set goes on.`
        : `You win ${Math.round(-delta)} pts less after game 1 — opponents are adjusting to you faster than you adjust to them.`;
    pane.append(h('div', { class: 'card' },
      h('h3', {}, 'Sets — do you adapt?'),
      h('p', { class: 'sub' }, insight),
      h('div', { class: 'kpis' },
        tile('Game 1 winrate', adapt.g1, 'the opener'),
        tile('Games 2–3 winrate', adapt.later, 'after adjusting'),
        tile('Close out a 1–0 lead', adapt.close, 'won game 1 → won set'),
        tile('Reverse a 0–1 hole', adapt.comeback, 'lost game 1 → won set'))));
  }

  // tilt & fatigue — session flow
  const sessSeqs = sessionSequences(ms);
  const byPos = tiltByPosition(sessSeqs), afterL = tiltAfterLosses(sessSeqs);
  const gb = giveBackStats(sessSeqs);
  if (ms.filter(m => !m.placement).length >= 12) {
    const unit = st ? (st.track === 'mr' ? 'MR' : 'LP') : 'LP';
    const gbLine = gb.gaveBackN
      ? `You peaked then gave rating back in ${gb.gaveBackN} of ${gb.counted} multi-game sessions — an average of ${fmt(gb.avg)} ${unit} handed back after your high point${gb.worst ? ` (worst: ${fmt(gb.worst.gb)} ${gb.worst.track === 'mr' ? 'MR' : 'LP'} on ${gb.worst.date})` : ''}. Knowing your stop point is free rating.`
      : 'You tend to log off at or near your session high — good discipline.';
    pane.append(h('div', { class: 'card' },
      h('h3', {}, 'Session flow — tilt & fatigue'),
      h('p', { class: 'sub' }, gbLine),
      h('div', { class: 'card-grid' },
        chartCard({
          title: 'Winrate by game # in a session',
          sub: 'Does your play fall off deep into a session?',
          draw: host => drawBars(host, byPos, { isPct: true, labelW: 110 }),
          table: () => buildTable(
            [{ key: 'label', label: 'When' }, { key: 'n', label: 'Games', num: true },
             { key: 'detail', label: 'Record', num: true }, { key: 'wr', label: 'Winrate', num: true }],
            byPos.map(b => ({ label: b.label, n: b.n, detail: b.detail, wr: pct(b.value) }))),
        }),
        chartCard({
          title: 'Winrate after consecutive losses',
          sub: 'Does a loss snowball into the next match?',
          draw: host => drawBars(host, afterL, { isPct: true, labelW: 130 }),
          table: () => buildTable(
            [{ key: 'label', label: 'State' }, { key: 'n', label: 'Games', num: true },
             { key: 'detail', label: 'Record', num: true }, { key: 'wr', label: 'Winrate', num: true }],
            afterL.map(b => ({ label: b.label, n: b.n, detail: b.detail, wr: pct(b.value) }))),
        }))));
  }

  // sessions table
  const sess = sessionsOf(all).reverse();
  pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Sessions'),
    h('div', { class: 'tbl-wrap' },
      h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Date'), h('th', { class: 'num' }, 'Games'), h('th', { class: 'num' }, 'Record'),
          h('th', { class: 'num' }, 'Winrate'), h('th', { class: 'num' }, 'Net LP'), h('th', { class: 'num' }, 'End LP'), h('th', {}, 'End rank'))),
        h('tbody', {}, sess.map(sx => {
          const netParts = [];
          if (sx.netLP || !sx.netMR) netParts.push(`${sx.netLP >= 0 ? '+' : ''}${fmt(sx.netLP)}`);
          if (sx.netMR) netParts.push(`${sx.netMR >= 0 ? '+' : ''}${fmt(sx.netMR)} MR`);
          const netSign = (sx.netMR || sx.netLP) >= 0;
          return h('tr', {},
            h('td', {}, sx.date),
            h('td', { class: 'num' }, sx.n),
            h('td', { class: 'num' }, `${sx.w}–${sx.l}`),
            h('td', { class: 'num' }, pct(sx.wr)),
            h('td', { class: 'num ' + (netSign ? 'delta-up' : 'delta-down') }, sx.end ? netParts.join(' · ') : '—'),
            h('td', { class: 'num' }, sx.end ? `${fmt(sx.end.value)}${sx.end.track === 'mr' ? ' MR' : ''}` : '—'),
            h('td', {}, sx.end ? (sx.end.track === 'mr' ? 'Master' : rankOf(sx.end.value).name) : 'Placements'));
        }))))));
}

/* ---------- MATCHES TAB ---------- */
let matchFilter = { char: 'all', result: 'all' };
function renderMatches() {
  const pane = panes.matches;
  pane.innerHTML = '';
  const all = P.matches;
  computeSets(all);
  const chars = [...new Set(all.map(m => m.oppChar))].sort();
  const list = all.filter(m =>
    (matchFilter.char === 'all' || m.oppChar === matchFilter.char) &&
    (matchFilter.result === 'all' || m.result === matchFilter.result)).slice().reverse();

  pane.append(h('div', { class: 'card filter-row' },
    h('label', {}, 'Opponent'),
    h('select', { onchange: e => { matchFilter.char = e.target.value; renderMatches(); } },
      h('option', { value: 'all' }, 'All characters'),
      chars.map(c => h('option', { value: c, selected: matchFilter.char === c }, c))),
    h('label', {}, 'Result'),
    h('select', { onchange: e => { matchFilter.result = e.target.value; renderMatches(); } },
      h('option', { value: 'all' }, 'All'),
      h('option', { value: 'W', selected: matchFilter.result === 'W' }, 'Wins'),
      h('option', { value: 'L', selected: matchFilter.result === 'L' }, 'Losses')),
    h('span', { class: 'hint' }, `${list.length} of ${all.length} matches`)));

  if (!all.length) {
    pane.append(h('div', { class: 'card' }, h('p', { class: 'sub' }, 'No matches yet.')));
    return;
  }
  pane.append(h('div', { class: 'card' }, h('div', { class: 'tbl-wrap' },
    h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'num' }, '#'), h('th', {}, 'Date'), h('th', {}, 'W/L'),
        h('th', { class: 'num' }, 'LP after'), h('th', { class: 'num' }, 'Δ'), h('th', {}, 'Rank'),
        h('th', {}, 'Rounds'), h('th', {}, 'Opponent'), h('th', { class: 'num' }, 'Set'),
        h('th', {}, 'Notes'), h('th', {}, ''))),
      h('tbody', {}, list.map(m => {
        const set = m._set;
        const setTxt = set && set.closed && set.games[set.games.length - 1] === m ? `${set.wins}–${set.losses}` : '';
        return h('tr', {},
          h('td', { class: 'num' }, m.num),
          h('td', {}, m.date),
          h('td', {}, h('span', { class: `badge ${m.result}` }, m.result)),
          h('td', { class: 'num' }, m.placement ? '—' : fmt(lpAfter(m)) + (trackOf(m) === 'mr' ? ' MR' : '')),
          m.placement ? h('td', { class: 'num' }, '—')
            : m.pendingDelta ? h('td', { class: 'num', title: 'CFN lists the rating going into each match — this delta appears once the next match is synced' }, '…')
            : h('td', { class: 'num ' + (m.delta >= 0 ? 'delta-up' : 'delta-down'),
              title: deltaMismatch(m) ? 'LP change disagrees with the recorded result — check this row' : null },
              `${m.delta >= 0 ? '+' : ''}${m.delta}${deltaMismatch(m) ? ' ⚠' : ''}`),
          h('td', {}, m.placement ? 'Placement' : trackOf(m) === 'mr' ? 'Master' : rankOf(lpAfter(m)).name),
          h('td', {}, h('span', { class: 'round-badges' }, m.rounds.map(r =>
            h('span', { class: 'badge ' + (roundSign(r) || 'N'), title: roundSign(r) ? (roundSign(r) === 'W' ? 'round won' : 'round lost') : 'winner not recorded' },
              roundFinish(r) || '•')))),
          h('td', {}, `${m.oppChar}${m.newChallenger ? ' (NC)' : m.oppLP ? ' · ' + fmt(m.oppLP) : ''}`),
          h('td', { class: 'num' }, setTxt),
          h('td', { class: 'note-cell' }, m.note),
          h('td', {},
            h('button', { class: 'rowbtn', title: 'Edit', onclick: () => {
              editId = m.id;
              logDraft = {
                date: m.date, result: m.result,
                placement: !!m.placement, track: trackOf(m),
                before: m.placement ? '' : m.lpBefore,
                change: m.placement ? '' : String(Math.abs(m.delta)),
                total: m.placement ? '' : String(lpAfter(m)), lastEdited: 'total',
                oppChar: m.oppChar, oppLP: m.oppLP ?? '', newChallenger: m.newChallenger,
                rounds: [0, 1, 2].map(i => m.rounds[i]
                  ? { w: roundSign(m.rounds[i]), f: roundFinish(m.rounds[i]) || null }
                  : { w: null, f: null }),
                modern: /modern/i.test(m.note), note: m.note.replace(/\s*·?\s*Modern Controls/i, ''),
              };
              switchTab('log');
            } }, '✎'),
            armedRowBtn('Delete', () => {
              P.matches = P.matches.filter(x => x.id !== m.id); saveDB(); renderAll();
            })));
      }))))));
}

/* ---------- DEFENSE TAB ---------- */
let defDraft = null;
function renderDefense() {
  const pane = panes.defense;
  pane.innerHTML = '';
  const lastNum = P.matches.reduce((a, m) => Math.max(a, m.num), 0);
  if (!defDraft) defDraft = { match: lastNum || '', health: '', round: null, attempt: null, offense: null, result: null, wakeup: null, corner: null, note: '' };
  const d = defDraft;

  const charHint = h('span', { class: 'hint' });
  const syncChar = () => {
    const m = P.matches.find(x => x.num === parseInt(d.match));
    charHint.textContent = m ? `vs ${m.oppChar}` : '';
  };
  const matchInput = h('input', { type: 'number', value: d.match, oninput: e => { d.match = e.target.value; syncChar(); } });
  syncChar();
  const healthInput = h('input', { type: 'number', min: 0, max: 100, value: d.health, placeholder: 'your health %', oninput: e => { d.health = e.target.value; } });
  const noteInput = h('input', { type: 'text', value: d.note, placeholder: 'what actually happened…', oninput: e => { d.note = e.target.value; } });
  const msg = h('span', { class: 'hint' });

  pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Log a defensive rep'),
    h('p', { class: 'sub' }, 'Track what you tried on defense and what it got you — the charts below tell you which options are actually working.'),
    h('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('span', {}, 'Match #'), matchInput, charHint),
        h('div', { class: 'field' }, h('span', {}, 'Your health %'), healthInput),
        h('div', { class: 'field' }, h('span', {}, 'Round'), chipGroup([1, 2, 3], d.round, v => { d.round = v; }, { small: true }))),
      h('div', { class: 'field' }, h('span', {}, 'What you tried'), chipGroup(DEF_ATTEMPTS, d.attempt, v => { d.attempt = v; }, { small: true })),
      h('div', { class: 'field' }, h('span', {}, 'Opponent went for'), chipGroup(DEF_OFFENSE, d.offense, v => { d.offense = v; }, { small: true })),
      h('div', { class: 'field' }, h('span', {}, 'Result'), chipGroup(DEF_RESULTS, d.result, v => { d.result = v; }, { small: true })),
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('span', {}, 'Wakeup'), chipGroup(DEF_WAKEUPS, d.wakeup, v => { d.wakeup = v; }, { small: true })),
        h('div', { class: 'field' }, h('span', {}, 'In the corner?'), chipGroup(['Yes', 'No'], d.corner, v => { d.corner = v; }, { small: true }))),
      h('div', { class: 'field' }, h('span', {}, 'Notes'), noteInput),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', onclick: () => {
          if (!d.attempt || !d.result) { msg.textContent = 'Need at least what you tried and the result.'; return; }
          const m = P.matches.find(x => x.num === parseInt(d.match));
          P.defense.push({
            id: uid(), match: parseInt(d.match) || null, oppChar: m ? m.oppChar : '',
            health: d.health === '' ? null : +d.health, round: d.round,
            attempt: d.attempt, offense: d.offense || '', result: d.result,
            wakeup: d.wakeup || '', corner: d.corner || '', note: d.note.trim(),
          });
          saveDB();
          defDraft = { ...defDraft, health: '', attempt: null, offense: null, result: null, note: '' };
          renderDefense();
        } }, 'Save rep'), msg))));

  const reps = P.defense;
  const outcomeOf = r => OUT_ESCAPED.includes(r.result) ? 0 : OUT_HELD.includes(r.result) ? 1 : OUT_LOST.includes(r.result) ? 2 : 1;
  const groupStacks = keyFn => {
    const map = new Map();
    for (const r of reps) {
      const k = keyFn(r);
      if (!k) continue;
      if (!map.has(k)) map.set(k, [0, 0, 0]);
      map.get(k)[outcomeOf(r)]++;
    }
    return [...map.entries()].map(([label, segs]) => ({ label, segs, n: segs[0] + segs[1] + segs[2] }))
      .sort((a, b) => b.n - a.n);
  };
  const legend = [
    { label: 'Escaped / won the exchange', color: cssVar('--blue') },
    { label: 'Held ground (blocked, reset)', color: cssVar('--neutral-seg') },
    { label: 'Got opened up', color: cssVar('--red') },
  ];
  const stackTable = rows => () => buildTable(
    [{ key: 'label', label: '' }, { key: 'n', label: 'Attempts', num: true },
     { key: 'a', label: 'Escaped', num: true }, { key: 'b', label: 'Held', num: true }, { key: 'c', label: 'Opened up', num: true }],
    rows.map(r => ({ label: r.label, n: r.n, a: r.segs[0], b: r.segs[1], c: r.segs[2] })));

  const byAttempt = groupStacks(r => r.attempt);
  const byOffense = groupStacks(r => r.offense || null);
  const byCorner = groupStacks(r => r.corner === 'Yes' ? 'In the corner' : r.corner === 'No' ? 'Midscreen' : null);

  pane.append(chartCard({
    title: 'How each defensive option is working out',
    sub: `${reps.length} logged reps. Sorted by how often you go for it.`,
    legend, draw: host => drawOutcomeStacks(host, byAttempt), table: stackTable(byAttempt),
  }));
  pane.append(h('div', { class: 'card-grid' },
    chartCard({ title: 'By what the opponent did', legend, draw: host => drawOutcomeStacks(host, byOffense), table: stackTable(byOffense) }),
    chartCard({ title: 'Corner vs midscreen', legend, draw: host => drawOutcomeStacks(host, byCorner), table: stackTable(byCorner) })));

  if (reps.length) pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Latest reps'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'num' }, 'Match'), h('th', {}, 'vs'), h('th', { class: 'num' }, 'HP%'), h('th', { class: 'num' }, 'Rd'),
        h('th', {}, 'Tried'), h('th', {}, 'Opp did'), h('th', {}, 'Result'), h('th', {}, 'Corner'), h('th', {}, 'Notes'), h('th', {}, ''))),
      h('tbody', {}, reps.slice(-15).reverse().map(r => h('tr', {},
        h('td', { class: 'num' }, r.match ?? ''),
        h('td', {}, r.oppChar),
        h('td', { class: 'num' }, r.health ?? ''),
        h('td', { class: 'num' }, r.round ?? ''),
        h('td', {}, r.attempt),
        h('td', {}, r.offense),
        h('td', {}, r.result),
        h('td', {}, r.corner),
        h('td', { class: 'note-cell' }, r.note),
        h('td', {}, h('button', { class: 'rowbtn', onclick: () => {
          P.defense = P.defense.filter(x => x.id !== r.id); saveDB(); renderDefense();
        } }, '✕')))))))));
}

/* ---------- HITS TAB ---------- */
let hitDraft = null;
function renderHits() {
  const pane = panes.hits;
  pane.innerHTML = '';
  const lastNum = P.matches.reduce((a, m) => Math.max(a, m.num), 0);
  if (!hitDraft) hitDraft = { match: lastNum || '', round: null, type: null, reason: '', wakeup: null, panic: null, pdm: 0, note: '' };
  const d = hitDraft;

  const reasons = [...new Set(P.hits.map(x => x.reason).filter(Boolean))].sort();
  const dl = h('datalist', { id: 'reasonList' }, reasons.map(r => h('option', { value: r })));
  const matchInput = h('input', { type: 'number', value: d.match, oninput: e => { d.match = e.target.value; } });
  const reasonInput = h('input', { type: 'text', list: 'reasonList', value: d.reason, placeholder: 'why did it land? (e.g. MASHING, Bad Throw Attempt)', oninput: e => { d.reason = e.target.value; } });
  const noteInput = h('input', { type: 'text', value: d.note, oninput: e => { d.note = e.target.value; }, placeholder: 'details…' });
  const msg = h('span', { class: 'hint' });

  pane.append(dl, h('div', { class: 'card' },
    h('h3', {}, 'Log a hit you took'),
    h('p', { class: 'sub' }, 'Name the reason honestly — the ranked list below shows what to fix in training mode first.'),
    h('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('span', {}, 'Match #'), matchInput),
        h('div', { class: 'field' }, h('span', {}, 'Round'), chipGroup([1, 2, 3], d.round, v => { d.round = v; }, { small: true })),
        h('div', { class: 'field' }, h('span', {}, 'Poor-decision meter (0–5)'), chipGroup([0, 1, 2, 3, 4, 5], d.pdm, v => { d.pdm = v ?? 0; }, { small: true, allowNone: false }))),
      h('div', { class: 'field' }, h('span', {}, 'Type of hit'), chipGroup(HIT_TYPES, d.type, v => { d.type = v; }, { small: true })),
      h('div', { class: 'field' }, h('span', {}, 'Reason'), reasonInput),
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('span', {}, 'On your wakeup?'), chipGroup(['Yes', 'No'], d.wakeup, v => { d.wakeup = v; }, { small: true })),
        h('div', { class: 'field' }, h('span', {}, 'Panic moment?'), chipGroup(['Yes', 'No'], d.panic, v => { d.panic = v; }, { small: true }))),
      h('div', { class: 'field' }, h('span', {}, 'Notes'), noteInput),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', onclick: () => {
          if (!d.reason.trim() && !d.type) { msg.textContent = 'Give it at least a type or a reason.'; return; }
          const m = P.matches.find(x => x.num === parseInt(d.match));
          P.hits.push({
            id: uid(), match: parseInt(d.match) || null, oppChar: m ? m.oppChar : '',
            health: null, round: d.round, type: d.type || '', reason: d.reason.trim(),
            wakeup: d.wakeup || '', panic: d.panic || '', pdm: d.pdm || 0, note: d.note.trim(),
          });
          saveDB();
          hitDraft = { ...hitDraft, type: null, reason: '', wakeup: null, panic: null, pdm: 0, note: '' };
          renderHits();
        } }, 'Save hit'), msg))));

  const hits = P.hits;
  const norm = sx => sx.trim().toLowerCase();
  const reasonCounts = new Map();
  for (const x of hits) {
    if (!x.reason) continue;
    const k = norm(x.reason);
    if (!reasonCounts.has(k)) reasonCounts.set(k, { label: x.reason, value: 0 });
    reasonCounts.get(k).value++;
  }
  const reasonRows = [...reasonCounts.values()].sort((a, b) => b.value - a.value).slice(0, 12);
  const typeCounts = new Map();
  for (const x of hits) {
    if (!x.type) continue;
    if (!typeCounts.has(x.type)) typeCounts.set(x.type, { label: x.type, value: 0 });
    typeCounts.get(x.type).value++;
  }
  const typeRows = [...typeCounts.values()].sort((a, b) => b.value - a.value);
  const panicN = hits.filter(x => x.panic === 'Yes').length;
  const panicKnown = hits.filter(x => x.panic).length;
  const wakeN = hits.filter(x => x.wakeup === 'Yes').length;
  const wakeKnown = hits.filter(x => x.wakeup).length;
  const pdmTotal = hits.reduce((a, x) => a + (x.pdm || 0), 0);

  if (hits.length) pane.append(h('div', { class: 'kpis' },
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Hits logged'), h('div', { class: 'k-value' }, hits.length)),
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Panic moments'), h('div', { class: 'k-value' }, panicKnown ? pct(100 * panicN / panicKnown) : '—'), h('div', { class: 'k-delta' }, `${panicN} of ${panicKnown} recorded`)),
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'On wakeup'), h('div', { class: 'k-value' }, wakeKnown ? pct(100 * wakeN / wakeKnown) : '—'), h('div', { class: 'k-delta' }, `${wakeN} of ${wakeKnown} recorded`)),
    h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, 'Poor-decision points'), h('div', { class: 'k-value' }, pdmTotal), h('div', { class: 'k-delta' }, 'sum of the 0–5 meter'))));

  pane.append(h('div', { class: 'card-grid' },
    chartCard({
      title: 'Why you get hit — ranked',
      sub: 'Your training-mode to-do list, most frequent first.',
      draw: host => drawBars(host, reasonRows, { labelW: 190 }),
      table: () => buildTable(
        [{ key: 'label', label: 'Reason' }, { key: 'value', label: 'Count', num: true }],
        reasonRows.map(r => ({ label: r.label, value: r.value }))),
    }),
    chartCard({
      title: 'Type of hit',
      draw: host => drawBars(host, typeRows, { labelW: 130 }),
      table: () => buildTable(
        [{ key: 'label', label: 'Type' }, { key: 'value', label: 'Count', num: true }],
        typeRows.map(r => ({ label: r.label, value: r.value }))),
    })));

  if (hits.length) pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Latest hits'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'num' }, 'Match'), h('th', {}, 'vs'), h('th', { class: 'num' }, 'Rd'), h('th', {}, 'Type'),
        h('th', {}, 'Reason'), h('th', {}, 'Wakeup'), h('th', {}, 'Panic'), h('th', { class: 'num' }, 'PDM'), h('th', {}, 'Notes'), h('th', {}, ''))),
      h('tbody', {}, hits.slice(-15).reverse().map(x => h('tr', {},
        h('td', { class: 'num' }, x.match ?? ''),
        h('td', {}, x.oppChar),
        h('td', { class: 'num' }, x.round ?? ''),
        h('td', {}, x.type),
        h('td', {}, x.reason),
        h('td', {}, x.wakeup),
        h('td', {}, x.panic),
        h('td', { class: 'num' }, x.pdm || 0),
        h('td', { class: 'note-cell' }, x.note),
        h('td', {}, h('button', { class: 'rowbtn', onclick: () => {
          P.hits = P.hits.filter(y => y.id !== x.id); saveDB(); renderHits();
        } }, '✕')))))))));
}

/* ---------- DATA TAB ---------- */
function toCSV(rows) {
  const esc = v => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return rows.map(r => r.map(esc).join(',')).join('\n');
}
function download(name, text, mime = 'text/csv') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove();
}

let undoState = null; // {json, label} — one-shot restore after a destructive action
const dbSnapshot = () => JSON.stringify(db, (k, v) => k.startsWith('_') ? undefined : v);

function loadSeedIntoActive() {
  // the spreadsheet history is Zangief's — seed always lands in his profile
  if (!db.profiles.Zangief) {
    const cur = db.profiles[db.active];
    const curEmpty = !cur.matches.length && !cur.defense.length && !cur.hits.length;
    if (db.active === 'Main' && curEmpty) delete db.profiles.Main; // fold the empty starter profile away
    db.profiles.Zangief = emptyProfile();
  }
  setActive('Zangief');
  const seeded = parseSeed();
  const existingIds = new Set(P.matches.map(m => m.id));
  P.matches = [...seeded.matches.filter(m => !existingIds.has(m.id)), ...P.matches.filter(m => !String(m.id).startsWith('seed-'))];
  // renumber anything logged after the seed so numbers stay unique
  let n = 0;
  for (const m of P.matches) { n++; if (!String(m.id).startsWith('seed-')) m.num = Math.max(m.num, n); }
  const dIds = new Set(P.defense.map(x => x.id));
  P.defense = [...seeded.defense.filter(x => !dIds.has(x.id)), ...P.defense.filter(x => !String(x.id).startsWith('seed-'))];
  const hIds = new Set(P.hits.map(x => x.id));
  P.hits = [...seeded.hits.filter(x => !hIds.has(x.id)), ...P.hits.filter(x => !String(x.id).startsWith('seed-'))];
  db.seedDismissed = true;
  saveDB(); logDraft = null; renderAll();
}

/* ---------- CFN auto-sync ----------
   cfn-watcher/watch.js (run on your gaming PC) writes cfn-sync.json; matches
   land here either via file import or by polling the watcher's localhost
   server. Each match is routed to the profile named after YOUR character. */
const charKey = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const CHAR_BY_KEY = new Map(ROSTER.map(c => [charKey(c), c]));
const normChar = s => CHAR_BY_KEY.get(charKey(s)) || String(s);

// Buckler's battle log lists each player's rating GOING INTO the match
// (verified against real data by chaining consecutive entries), so a match's
// delta = the next same-track match's before-value minus its own. The newest
// match's delta stays pending until the next sync reveals it.
// Round-result codes observed in real data: 0 = lost round; winners carry the
// finish type. Best-effort mapping, re-derived from raw codes on every import
// so a corrected table here fixes history retroactively.
const CFN_FINISH = { 1: 'V', 2: 'P', 5: 'CA', 6: 'SA', 7: 'T', 8: 'OD' }; // confirmed against real matches; chip's code not yet observed
function cfnRounds(myRaw, opRaw) {
  const n = Math.max(myRaw ? myRaw.length : 0, opRaw ? opRaw.length : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const my = (myRaw && +myRaw[i]) || 0, op = (opRaw && +opRaw[i]) || 0;
    if (my > 0) out.push('+' + (CFN_FINISH[my] || 'V'));
    else if (op > 0) out.push('-' + (CFN_FINISH[op] || 'V'));
  }
  return out;
}

// Re-derive deltas for CFN-sourced matches; also converts records imported by
// the old after-value logic (lpAfter of old record = true before-value).
function repairCFNChains(prof) {
  let changed = false;
  const ms = prof.matches;
  for (const m of ms) {
    if (m.cfnId && !m.cfnBefore && !m.placement) {
      m.lpBefore = m.lpBefore + m.delta;
      m.delta = 0;
      m.cfnBefore = true; m.pendingDelta = true;
      m.note = (m.note || '').replace(/\s*·?\s*CFN sync anchor[^·]*/, '').trim();
      changed = true;
    }
  }
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (!m.cfnBefore || m.placement) continue;
    let next = null;
    for (let j = i + 1; j < ms.length; j++) {
      const c = ms[j];
      if (!c.placement && trackOf(c) === trackOf(m)) { next = c; break; }
    }
    if (next && next.lpBefore != null) {
      const d = next.lpBefore - m.lpBefore;
      if (m.delta !== d || m.pendingDelta) { m.delta = d; m.pendingDelta = false; changed = true; }
    } else if (!next && !m.pendingDelta) {
      m.pendingDelta = true; changed = true;
    }
  }
  return changed;
}

function mergeCFN(payload) {
  if (!payload || !Array.isArray(payload.matches)) throw new Error('not a cfn-sync file');
  const list = payload.matches.slice().sort((a, b) => (a.playedAt || 0) - (b.playedAt || 0));
  let added = 0, updated = 0, skipped = 0;
  const touched = new Set();
  for (const cm of list) {
    const profName = cm.myChar ? normChar(cm.myChar) : db.active;
    if (!db.profiles[profName]) db.profiles[profName] = emptyProfile();
    const prof = db.profiles[profName];
    const cfnId = cm.cfnId != null ? String(cm.cfnId) : null;
    const rounds = (cm.myRoundsRaw || cm.oppRoundsRaw)
      ? cfnRounds(cm.myRoundsRaw, cm.oppRoundsRaw)
      : (Array.isArray(cm.rounds) ? cm.rounds.map(String) : []);

    const existing = cfnId && prof.matches.find(m => m.cfnId === cfnId);
    if (existing) { // re-import refreshes finishes so mapping fixes apply retroactively
      if (existing.rounds.join(',') !== rounds.join(',') || (cm.myRoundsRaw && !existing.roundsRaw)) {
        existing.rounds = rounds;
        if (cm.myRoundsRaw) existing.roundsRaw = { my: cm.myRoundsRaw, opp: cm.oppRoundsRaw };
        updated++;
      } else skipped++;
      touched.add(profName);
      continue;
    }

    const track = cm.myMR > 0 ? 'mr' : 'lp';
    const val = track === 'mr' ? cm.myMR : cm.myLP;
    const placement = track === 'lp' && (val == null || val < 0); // CFN reports no/negative LP during placements
    prof.matches.push({
      id: 'cfn-' + (cfnId || uid()), cfnId, cfnBefore: !placement, pendingDelta: !placement,
      num: prof.matches.reduce((a, m) => Math.max(a, m.num), 0) + 1,
      date: cm.playedAt ? new Date(cm.playedAt * 1000).toISOString().slice(0, 10) : todayISO(),
      playedAt: cm.playedAt ?? null,
      result: cm.result === 'W' ? 'W' : 'L', placement, track,
      lpBefore: placement ? null : val, delta: placement ? null : 0,
      rounds, roundsRaw: cm.myRoundsRaw ? { my: cm.myRoundsRaw, opp: cm.oppRoundsRaw } : null,
      oppLP: (track === 'mr' ? cm.oppMR : cm.oppLP) ?? null, newChallenger: false,
      oppChar: cm.oppChar ? normChar(cm.oppChar) : '?',
      note: cm.oppControl === 'M' ? 'Modern Controls' : '',
    });
    touched.add(profName);
    added++;
  }
  let repaired = false;
  for (const [name, prof] of Object.entries(db.profiles))
    if (touched.has(name) || prof.matches.some(m => m.cfnId))
      if (repairCFNChains(prof)) repaired = true;
  if (added || updated || repaired) saveDB();
  return { added, updated, skipped, profiles: [...touched] };
}

let cfnStatus = '';
let cfnTimer = null;
async function pollCFNWatcher() {
  try {
    const res = await fetch('http://127.0.0.1:8787/sync', { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const { added, updated, skipped, profiles } = mergeCFN(await res.json());
    cfnStatus = (added || updated)
      ? `synced ${added} new / ${updated} refreshed into ${profiles.join(', ')} at ${new Date().toLocaleTimeString()}`
      : `up to date (${skipped} known) at ${new Date().toLocaleTimeString()}`;
    if (added || updated) renderAll();
    else if (activeTab === 'data') renderData();
  } catch (e) {
    cfnStatus = 'No watcher found. Double-click start-watcher in the cfn-watcher folder and sign into Buckler, then try Sync again.';
    if (activeTab === 'data') renderData();
  }
}
window.pollCFNWatcher = pollCFNWatcher;
function setCFNAuto(on) {
  db.cfnAuto = on; saveDB();
  clearInterval(cfnTimer); cfnTimer = null;
  if (on) { cfnTimer = setInterval(pollCFNWatcher, 30_000); pollCFNWatcher(); }
}

function renderData() {
  const pane = panes.data;
  pane.innerHTML = '';
  computeSets(P.matches);
  const dataMsg = h('span', { class: 'hint' });

  // ---- characters ----
  const charMsg = h('span', { class: 'hint' });
  const newInput = h('input', { type: 'text', list: 'newCharList', placeholder: 'e.g. Ken', style: 'max-width:180px' });
  const charRows = Object.entries(db.profiles).map(([name, prof]) => {
    const nameBtn = h('button', {
      class: 'chip' + (name === db.active ? ' sel' : ''),
      onclick: () => { if (name !== db.active) { setActive(name); renderAll(); } },
    }, name);
    const renameBtn = h('button', { class: 'rowbtn', title: 'Rename', onclick: () => {
      const inp = h('input', { type: 'text', value: name, style: 'max-width:150px' });
      const commit = () => {
        const next = inp.value.trim();
        if (!next || next === name) { renderData(); return; }
        if (db.profiles[next]) { charMsg.textContent = `"${next}" already exists.`; return; }
        const np = {};
        for (const k of Object.keys(db.profiles)) np[k === name ? next : k] = db.profiles[k];
        db.profiles = np;
        if (db.active === name) db.active = next;
        saveDB(); renderAll();
      };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') renderData(); });
      inp.addEventListener('blur', commit);
      nameBtn.replaceWith(inp); inp.focus(); inp.select();
    } }, '✎');
    const delBtn = armedRowBtn(`Delete ${name} and all its data`, () => {
      undoState = { json: dbSnapshot(), label: `deleting ${name}` };
      delete db.profiles[name];
      if (!Object.keys(db.profiles).length) db.profiles.Main = emptyProfile();
      if (!db.profiles[db.active]) setActive(Object.keys(db.profiles)[0]);
      saveDB(); renderAll();
    });
    return h('div', { class: 'recent-item' },
      nameBtn,
      h('span', { class: 'who hint' },
        `${prof.matches.length} matches · ${(() => { const sx = [...prof.matches].reverse().find(m => !m.placement); return sx ? `${fmt(lpAfter(sx))} ${trackOf(sx) === 'mr' ? 'MR · Master' : 'LP · ' + rankOf(lpAfter(sx)).name}` : 'not placed yet'; })()}`),
      renameBtn, delBtn);
  });
  pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Characters'),
    h('p', { class: 'sub' }, 'Each character has its own SF6 rank, so each keeps its own matches, LP/MR, placements, and labs. Switch anytime from the picker in the header.'),
    h('div', { class: 'recent-list' }, charRows),
    h('datalist', { id: 'newCharList' }, ROSTER.map(c => h('option', { value: c }))),
    h('div', { class: 'btn-row', style: 'margin-top:10px' },
      newInput,
      h('button', { class: 'btn primary', onclick: () => {
        const name = newInput.value.trim();
        if (!name) { charMsg.textContent = 'Give the character a name.'; return; }
        if (db.profiles[name]) { charMsg.textContent = `"${name}" already exists — switch to it instead.`; return; }
        db.profiles[name] = emptyProfile();
        setActive(name);
        renderAll();
        switchTab('log'); // fresh character starts in placement mode
      } }, 'Start new character'),
      charMsg)));

  // ---- CFN auto-sync ----
  const cfnMsg = h('span', { class: 'hint' }, cfnStatus);
  const syncNowBtn = h('button', { class: 'btn primary', onclick: async () => {
    cfnMsg.textContent = 'syncing…'; syncNowBtn.disabled = true;
    await pollCFNWatcher();
    syncNowBtn.disabled = false; renderData();
  } }, 'Sync from CFN now');
  const autoChip = chipGroup(['Keep syncing automatically'],
    db.cfnAuto ? 'Keep syncing automatically' : null,
    v => { setCFNAuto(!!v); renderData(); }, { small: true });
  const cfnImport = (() => {
    const inp = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: e => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then(t => {
        const { added, updated, skipped, profiles } = mergeCFN(JSON.parse(t));
        cfnStatus = `imported ${added} new, refreshed ${updated}${profiles.length ? ' in ' + profiles.join(', ') : ''}, ${skipped} unchanged`;
        renderAll(); switchTab('data');
      }).catch(() => { cfnMsg.textContent = 'That does not look like a cfn-sync.json file — nothing was changed.'; });
    } });
    return h('label', {}, inp, h('span', { class: 'btn' }, 'Choose cfn-sync.json'));
  })();
  pane.append(h('div', { class: 'card' },
    h('h3', {}, 'CFN auto-sync'),
    h('p', { class: 'sub' }, 'Start the watcher on your PC (double-click start-watcher in the cfn-watcher folder — no command line needed), then just hit Sync. Matches log themselves: result, LP/MR, opponent, rounds — routed to the right character. Defense/hit labs and notes stay yours.'),
    h('div', { class: 'btn-row' }, syncNowBtn, autoChip),
    h('div', { class: 'btn-row', style: 'margin-top:8px' }, cfnMsg),
    h('details', { style: 'margin-top:10px' },
      h('summary', { class: 'hint', style: 'cursor:pointer' }, 'Watcher not running, or on another device? Import the file manually'),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, cfnImport))));

  // ---- backup / seed ----
  const gief = db.profiles.Zangief;
  const seedBtn = gief && gief.matches.length
    ? armedBtn('Load spreadsheet history (Zangief)', loadSeedIntoActive,
        { confirmText: 'Re-adds 164 matches to Zangief — click again', danger: false })
    : h('button', { class: 'btn primary', onclick: loadSeedIntoActive }, 'Load spreadsheet history (Zangief)');

  const grandTotal = matchTotal(db);
  const sinceExport = grandTotal - (db.lastExport ? db.lastExport.total : 0);
  const nudge = sinceExport >= 25
    ? h('p', { class: 'hint warn' }, `${sinceExport} matches logged since your last downloaded backup — export one to keep a copy outside this browser.`)
    : db.lastExport ? h('p', { class: 'hint' }, `Last downloaded backup: ${new Date(db.lastExport.ts).toLocaleDateString()}.`) : null;
  pane.append(h('div', { class: 'card' },
    h('h3', {}, `Your data — ${db.active}`),
    h('p', { class: 'sub' }, `${P.matches.length} matches · ${P.defense.length} defense reps · ${P.hits.length} hits on ${db.active}. Everything is stored in this browser (localStorage), with automatic local snapshots below — but for a copy that survives a cleared browser, download a backup. It includes every character.`),
    nudge,
    h('div', { class: 'btn-row' },
      seedBtn,
      h('button', { class: 'btn primary', onclick: () => {
        download('sf6lab-backup.json', dbSnapshot(), 'application/json');
        db.lastExport = { ts: Date.now(), total: matchTotal(db) }; saveDB(); renderData();
      } }, 'Export backup (JSON)'),
      (() => {
        const inp = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: e => {
          const f = e.target.files[0];
          if (!f) return;
          f.text().then(t => {
            const next = JSON.parse(t);
            if (!next.profiles && !Array.isArray(next.matches)) throw new Error('bad file');
            undoState = { json: dbSnapshot(), label: 'importing the backup' };
            const theme = db.theme;
            db = migrateDB(next);
            if (db.theme == null) db.theme = theme;
            setActive(db.active);
            applyTheme(); renderAll();
          }).catch(() => { dataMsg.textContent = 'That file does not look like an SF6 Ranked Lab backup — nothing was changed.'; });
        } });
        return h('label', {}, inp, h('span', { class: 'btn' }, 'Import backup (JSON)'));
      })(),
      dataMsg,
      undoState ? h('button', { class: 'btn', onclick: () => {
        db = migrateDB(JSON.parse(undoState.json));
        undoState = null;
        setActive(db.active); applyTheme(); renderAll();
      } }, `Undo ${undoState.label}`) : null)));

  // ---- automatic local snapshots ----
  const ring = loadBackups().slice().reverse();
  pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Safety net — automatic snapshots'),
    h('p', { class: 'sub' }, 'This browser keeps the last few states of all your data automatically, so an accidental wipe or a bad import is recoverable. These live in this browser only — a downloaded backup is still your off-device copy.'),
    ring.length
      ? h('div', { class: 'recent-list' }, ring.map(bk => h('div', { class: 'recent-item' },
          h('span', { class: 'who' }, `${new Date(bk.ts).toLocaleString()}`),
          h('span', { class: 'hint' }, `${bk.total} matches`),
          armedBtn('Restore this', () => {
            undoState = { json: dbSnapshot(), label: 'the restore' };
            const theme = db.theme;
            db = migrateDB(JSON.parse(bk.json));
            if (db.theme == null) db.theme = theme;
            setActive(db.active); applyTheme(); renderAll();
          }, { confirmText: 'Replace current data — click again', danger: false }))))
      : h('p', { class: 'hint' }, 'No snapshots yet — they start accumulating as you log matches.')));

  pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Export CSV (spreadsheet-compatible)'),
    h('p', { class: 'sub' }, 'Same columns as the original Google Sheet, with rank and set score filled in for every row.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => {
        const rows = [['Date', 'Match Number', 'Win/Loss', 'LP', 'Gain/Loss', 'Rank', 'RD1', 'RD2', 'RD3', 'Opponent LP', 'Opponent Rank', 'Opponent Character', 'Series Wins', 'Series Losses', 'Notes']];
        for (const m of P.matches) {
          const set = m._set;
          const isSetEnd = set && set.closed && set.games[set.games.length - 1] === m;
          const rankLbl = m.placement ? 'Placement' : trackOf(m) === 'mr' ? 'Master (MR)' : rankOf(m.lpBefore).name;
          const oppRankLbl = m.newChallenger ? 'New Challenger'
            : m.oppLP == null ? '' : trackOf(m) === 'mr' ? 'Master (MR)' : rankOf(m.oppLP).name;
          rows.push([m.date, m.num, m.result === 'W' ? 'Win' : 'Loss',
            m.placement ? '' : m.lpBefore, m.placement ? '' : m.delta,
            rankLbl, m.rounds[0] || '', m.rounds[1] || '', m.rounds[2] || '',
            m.oppLP ?? '', oppRankLbl,
            m.oppChar, isSetEnd ? set.wins : '', isSetEnd ? set.losses : '', m.note]);
        }
        download('sf6-matches.csv', toCSV(rows));
      } }, 'Matches CSV'),
      h('button', { class: 'btn', onclick: () => {
        const rows = [['Match', 'Character', 'Health', 'Round', 'Defense Attempt', 'Opponent Offense', 'Result', 'Wakeup', 'In Corner', 'Notes']];
        for (const r of P.defense) rows.push([r.match ?? '', r.oppChar, r.health ?? '', r.round ?? '', r.attempt, r.offense, r.result, r.wakeup, r.corner, r.note]);
        download('sf6-defense.csv', toCSV(rows));
      } }, 'Defense CSV'),
      h('button', { class: 'btn', onclick: () => {
        const rows = [['Match', 'Character', 'Health', 'Round', 'Type of Hit', 'Reason for Hit', 'Wakeup', 'Panic', 'Poor Decision Meter', 'Notes']];
        for (const x of P.hits) rows.push([x.match ?? '', x.oppChar, x.health ?? '', x.round ?? '', x.type, x.reason, x.wakeup, x.panic, x.pdm || 0, x.note]);
        download('sf6-hits.csv', toCSV(rows));
      } }, 'Hits CSV'))));

  pane.append(h('div', { class: 'card' },
    h('h3', {}, 'Danger zone'),
    h('p', { class: 'sub' }, 'Destructive buttons ask for a second click instead of a popup, and leave an Undo (above) until you leave this tab.'),
    h('div', { class: 'btn-row' },
      armedBtn(`Clear ${db.active}'s data`, () => {
        undoState = { json: dbSnapshot(), label: `clearing ${db.active}` };
        db.profiles[db.active] = emptyProfile();
        setActive(db.active);
        renderAll();
      }),
      armedBtn('Wipe everything (all characters)', () => {
        undoState = { json: dbSnapshot(), label: 'the wipe' };
        const theme = db.theme;
        db = migrateDB(null);
        db.theme = theme; db.seedDismissed = true;
        setActive('Main');
        renderAll();
      }))));
}

/* ---------- shell ---------- */
function updatePill() {
  const pill = document.getElementById('lpPill');
  pill.innerHTML = '';
  if (!P.matches.length) { pill.textContent = 'no matches yet'; return; }
  const st = currentStatus();
  if (!st) {
    const p = P.matches.filter(m => m.placement).length;
    pill.append(h('b', {}, `placements ${Math.min(p, 10)}/10`), ' · not placed yet');
  } else if (st.track === 'mr') {
    pill.append(h('b', {}, fmt(st.value) + ' MR'), ' · Master');
  } else {
    pill.append(h('b', {}, fmt(st.value) + ' LP'), ` · ${rankOf(st.value).name}`);
  }
}

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('sel', b.dataset.tab === name));
  for (const [k, el] of Object.entries(panes)) el.hidden = k !== name;
  renderActive();
  window.scrollTo({ top: 0 });
}
function renderActive() {
  liveCharts = [];
  ({ log: renderLog, dash: renderDash, matches: renderMatches, defense: renderDefense, hits: renderHits, data: renderData })[activeTab]();
}
function updateProfileSel() {
  const sel = document.getElementById('profileSel');
  sel.innerHTML = '';
  for (const name of Object.keys(db.profiles))
    sel.append(h('option', { value: name, selected: name === db.active }, name));
  sel.append(h('option', { value: '__new' }, '＋ New character…'));
}
document.getElementById('profileSel').addEventListener('change', e => {
  if (e.target.value === '__new') {
    updateProfileSel(); // snap the select back to the active character
    switchTab('data');
    return;
  }
  setActive(e.target.value);
  renderAll();
});

function renderAll() {
  updatePill();
  updateProfileSel();
  const banner = document.getElementById('seedBanner');
  banner.hidden = !(P.matches.length === 0 && !db.seedDismissed);
  renderActive();
}

document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if (btn) switchTab(btn.dataset.tab);
});
document.getElementById('seedLoadBtn').addEventListener('click', loadSeedIntoActive);
document.getElementById('seedDismissBtn').addEventListener('click', () => {
  db.seedDismissed = true; saveDB(); renderAll();
});

/* theme */
function applyTheme() {
  if (db.theme) document.documentElement.dataset.theme = db.theme;
  else delete document.documentElement.dataset.theme;
}
document.getElementById('themeBtn').addEventListener('click', () => {
  const effectiveDark = db.theme ? db.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  db.theme = effectiveDark ? 'light' : 'dark';
  saveDB(); applyTheme(); renderAll();
});

applyTheme();
saveDB(); // persist any load-time migration (profiles rename, round-sign refresh)
renderAll();
if (db.cfnAuto) setCFNAuto(true);
document.body.append(h('footer', {},
  'SF6 Ranked Lab — data stays in your browser. LP thresholds: Rookie→Master per the in-game ladder; rank and set scores are derived, not typed.'));
