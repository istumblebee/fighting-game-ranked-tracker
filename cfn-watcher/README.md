# CFN watcher

Automatically pulls **your own** ranked match history from Capcom's Buckler's
Boot Camp while you play, so SF6 Ranked Lab fills itself in — no more typing LP
and opponents between games.

## One-time setup (on the PC you play from)

```bash
cd cfn-watcher
npm install
npx playwright install chromium
```

## Every session

```bash
npm start        # = node watch.js --serve
```

- A Chrome window opens on Buckler's Boot Camp. **First run only:** sign in
  with your Capcom ID there. The session is stored in `~/.sf6lab-cfn`, so later
  runs skip straight past login (you'll re-auth occasionally when it expires).
- Leave it running while you play. Every minute it checks your ranked battle
  log and appends new matches to `cfn-sync.json` — result, characters, LP/MR,
  opponent LP/MR, per-round wins/losses with finish types, opponent control type.
- In the tracker's **Data tab**, either turn on **Auto-sync from local watcher**
  (the page merges new matches every 30 seconds while open) or use
  **Import cfn-sync.json** manually after a session. Matches are routed to the
  right character profile automatically and de-duplicated by CFN replay id.

## First-run verification (please do this once)

Capcom doesn't document the battle-log format, so two mappings are best-effort
until checked against real data:

1. **Round finish codes** (`CODE_FINISH` at the top of `watch.js`): after your
   first synced session, compare a few matches against what the game showed
   (V / P / OD / SA / CA). If a code is mismatched, fix the one-line table.
2. If parsing fails outright, the watcher writes the raw data to
   `cfn-raw-sample.json` — send that file back to have the field mapping fixed.

## Notes

- This reads only your own data using your own login, same as community tools
  like cfn-tracker — but strictly speaking scraping is against the site's ToS.
  Your account, your call.
- Your Capcom credentials never leave your machine; the watcher stores only the
  browser session, locally.
- The labs (defense reps, hits, notes) stay manual on purpose — CFN knows what
  happened, not why.
