#!/usr/bin/env node
/*
 * CFN watcher — pulls your own SF6 ranked match history from Buckler's Boot Camp
 * while you play, and writes it to cfn-sync.json for SF6 Ranked Lab to import.
 *
 * Usage:
 *   node watch.js            poll every 60s, write cfn-sync.json
 *   node watch.js --serve    also serve the sync file at http://127.0.0.1:8787/sync
 *                            so the tracker page can auto-merge while you play
 *   node watch.js --once     one pass, then exit
 *
 * First run opens a real Chrome window on the Buckler login — sign in with your
 * Capcom ID there. The session is kept in ~/.sf6lab-cfn so later runs skip login.
 *
 * Notes:
 * - This reads only your own data with your own login, the same way tools like
 *   cfn-tracker do. It is still against the site's ToS in the strict sense.
 * - Buckler is a Next.js app: every page embeds its data as JSON in
 *   window.__NEXT_DATA__, which is what we read — no fragile HTML parsing.
 * - Field names and round-result codes are mapped best-effort and defensively;
 *   if parsing fails the raw entry is dumped to cfn-raw-sample.json so the
 *   mapping tables below can be corrected in one place.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const SERVE = args.includes('--serve');
const ONCE = args.includes('--once');
const OUT = path.join(__dirname, 'cfn-sync.json');
const RAW_SAMPLE = path.join(__dirname, 'cfn-raw-sample.json');
const PROFILE_DIR = path.join(os.homedir(), '.sf6lab-cfn');
const POLL_MS = 60_000;
const PORT = 8787;
const BUCKLER = 'https://www.streetfighter.com/6/buckler';

// Round-result code → finish label (V/P/OD/SA/CA/C). Codes observed in real
// battle logs: 1, 2, 5, 6, 7, 8. Best-effort mapping — the app re-derives
// finishes from the raw codes on import, so fixes there apply retroactively.
const CODE_FINISH = { 1: 'V', 2: 'P', 5: 'CA', 6: 'SA', 7: 'C', 8: 'OD' };

// tolerate snake_case / camelCase across site updates
const pick = (obj, ...names) => {
  for (const n of names) if (obj && obj[n] !== undefined && obj[n] !== null) return obj[n];
  return undefined;
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { version: 1, matches: [] }; }
}

function deepFindReplayList(node, depth = 0) {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    if (node.length && typeof node[0] === 'object' && node[0] &&
        (pick(node[0], 'replay_id', 'replayId') !== undefined) &&
        (pick(node[0], 'player1_info', 'player1Info') !== undefined)) return node;
    for (const v of node) { const hit = deepFindReplayList(v, depth + 1); if (hit) return hit; }
    return null;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) { const hit = deepFindReplayList(v, depth + 1); if (hit) return hit; }
  }
  return null;
}

function sideInfo(entry, which) {
  const info = pick(entry, `player${which}_info`, `player${which}Info`) || {};
  const player = pick(info, 'player') || info;
  return {
    shortId: String(pick(player, 'short_id', 'shortId', 'sid') ?? ''),
    name: pick(player, 'fighter_id', 'fighterId', 'name') ?? '',
    char: pick(info, 'character_name', 'characterName', 'character_tool_name') ?? '?',
    lp: numOr(pick(info, 'league_point', 'leaguePoint', 'lp'), null),
    mr: numOr(pick(info, 'master_rating', 'masterRating', 'mr'), null),
    control: numOr(pick(info, 'battle_input_type', 'battleInputType'), null), // 0 classic / 1 modern (best effort)
    rounds: pick(info, 'round_results', 'roundResults') || [],
  };
}
const numOr = (v, d) => (typeof v === 'number' && !isNaN(v) ? v : d);

function encodeRounds(mine, theirs) {
  // Each side's round_results holds one code per round: 0 = lost that round,
  // >0 = won it, code = finish type. Merge both sides into the app's ±finish form.
  const n = Math.max(mine.length, theirs.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const my = numOr(mine[i], 0), op = numOr(theirs[i], 0);
    if (my > 0) out.push('+' + (CODE_FINISH[my] || 'V'));
    else if (op > 0) out.push('-' + (CODE_FINISH[op] || 'V'));
  }
  return out;
}

function parseEntry(entry, myShortId) {
  const p1 = sideInfo(entry, 1), p2 = sideInfo(entry, 2);
  let me = p1, opp = p2;
  if (myShortId && p2.shortId === String(myShortId)) { me = p2; opp = p1; }
  else if (myShortId && p1.shortId !== String(myShortId) && p2.shortId === String(myShortId)) { me = p2; opp = p1; }
  const myWins = me.rounds.filter(c => numOr(c, 0) > 0).length;
  const oppWins = opp.rounds.filter(c => numOr(c, 0) > 0).length;
  const playedAtRaw = numOr(pick(entry, 'uploaded_at', 'uploadedAt', 'played_at'), null);
  return {
    cfnId: String(pick(entry, 'replay_id', 'replayId')),
    playedAt: playedAtRaw, // epoch seconds
    myChar: me.char, oppChar: opp.char,
    result: myWins >= oppWins ? 'W' : 'L',
    myLP: me.lp, myMR: me.mr, oppLP: opp.lp, oppMR: opp.mr,
    oppControl: opp.control === 1 ? 'M' : opp.control === 0 ? 'C' : null,
    rounds: encodeRounds(me.rounds, opp.rounds),
    myRoundsRaw: me.rounds, oppRoundsRaw: opp.rounds, // kept for fixing CODE_FINISH later
  };
}

function startServer() {
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url.startsWith('/sync')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(fs.existsSync(OUT) ? fs.readFileSync(OUT) : '{"version":1,"matches":[]}');
    } else { res.statusCode = 404; res.end('cfn-watcher: use /sync'); }
  }).listen(PORT, '127.0.0.1', () => console.log(`serving sync file at http://127.0.0.1:${PORT}/sync`));
}

async function waitForShortId(page) {
  // /profile/auth redirects to your own profile once logged in; the short id is
  // in the URL (…/profile/<short_id>) and in __NEXT_DATA__.
  for (;;) {
    const m = page.url().match(/\/profile\/(\d{5,})/);
    if (m) return m[1];
    const sid = await page.evaluate(() => {
      try {
        const d = window.__NEXT_DATA__ && window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps;
        const s = JSON.stringify(d || {});
        const hit = s.match(/"short_id":\s*"?(\d{5,})"?/);
        return hit ? hit[1] : null;
      } catch (e) { return null; }
    }).catch(() => null);
    if (sid) return sid;
    console.log('waiting for login… (sign in with your Capcom ID in the browser window)');
    await page.waitForTimeout(4000);
  }
}

(async () => {
  const state = loadState();
  const known = new Set(state.matches.map(m => m.cfnId));
  if (SERVE) startServer();

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  console.log('opening Buckler\'s Boot Camp…');
  await page.goto(`${BUCKLER}/profile/auth`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const sid = await waitForShortId(page);
  console.log(`logged in — CFN short id ${sid}`);
  state.shortId = sid;
  const logUrl = `${BUCKLER}/en/profile/${sid}/battlelog/rank`;

  async function readLogPage(pageNo) {
    await page.goto(pageNo > 1 ? `${logUrl}?page=${pageNo}` : logUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const pageProps = await page.evaluate(() =>
      (window.__NEXT_DATA__ && window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps) || null);
    return { list: deepFindReplayList(pageProps), pageProps };
  }

  // Buckler shows 10 matches per page and keeps ~100: sweep every page on the
  // first pass (and with --once); later polls only need page 1 for new matches.
  let fullSweep = true;
  for (;;) {
    try {
      let added = 0;
      let firstIdOfPage1 = null;
      const maxPages = fullSweep ? 12 : 1;
      for (let p = 1; p <= maxPages; p++) {
        const { list, pageProps } = await readLogPage(p);
        if (!list || !list.length) {
          if (p === 1) {
            console.warn('could not find the battle log in the page data — dumping snapshot to cfn-raw-sample.json');
            fs.writeFileSync(RAW_SAMPLE, JSON.stringify(pageProps, null, 1));
          }
          break; // past the last page
        }
        const firstId = String(pick(list[0], 'replay_id', 'replayId'));
        if (p === 1) firstIdOfPage1 = firstId;
        else if (firstId === firstIdOfPage1) break; // site ignored ?page= — stop rather than re-reading page 1
        for (const entry of list) {
          let parsed;
          try { parsed = parseEntry(entry, sid); } catch (e) {
            console.warn('entry failed to parse — dumping it to cfn-raw-sample.json:', e.message);
            fs.writeFileSync(RAW_SAMPLE, JSON.stringify(entry, null, 1));
            continue;
          }
          if (!parsed.cfnId || known.has(parsed.cfnId)) continue;
          known.add(parsed.cfnId);
          state.matches.push(parsed);
          added++;
          console.log(`+ ${parsed.result} ${parsed.myChar} vs ${parsed.oppChar} (${parsed.rounds.join(' ')})`);
        }
        if (fullSweep) console.log(`  …page ${p} read (${list.length} entries)`);
      }
      if (added) {
        state.matches.sort((a, b) => (a.playedAt || 0) - (b.playedAt || 0));
        state.generatedAt = Date.now();
        fs.writeFileSync(OUT, JSON.stringify(state, null, 1));
        console.log(`wrote ${added} new match(es) → ${OUT} (${state.matches.length} total)`);
      } else {
        console.log(`no new matches (${new Date().toLocaleTimeString()})`);
      }
      fullSweep = false;
    } catch (e) {
      console.warn('poll failed:', e.message);
    }
    if (ONCE) break;
    await page.waitForTimeout(POLL_MS);
  }
  await ctx.close();
})();
