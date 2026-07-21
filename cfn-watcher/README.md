# CFN watcher

Automatically pulls **your own** ranked match history from Capcom's Buckler's
Boot Camp while you play, so SF6 Ranked Lab fills itself in — no more typing LP
and opponents between games.

## No command line needed

**Just double-click `start-watcher.bat` (Windows) or `start-watcher.command` (Mac).**
The first run installs everything automatically (a couple of minutes); after that
it launches straight into the watcher. On macOS the very first time, right-click →
**Open** to clear the security prompt. Tip: make a desktop shortcut to that file so
it's one click before each session.

Then in the tracker's **Data tab**, hit **Sync from CFN now** (or flip on
"Keep syncing automatically"). No files, no terminal.

## What happens

- A Chrome window opens on Buckler's Boot Camp. **First run only:** sign in
  with your Capcom ID there. The session is stored in `~/.sf6lab-cfn`, so later
  runs skip straight past login (you'll re-auth occasionally when it expires).
- Leave the window open while you play. Every minute it checks your ranked
  battle log and writes new matches to `cfn-sync.json` — result, characters,
  LP/MR, opponent LP/MR, per-round wins/losses with finish types, control type.
- The tracker pulls that straight from the watcher when you hit **Sync from CFN
  now** or leave auto-sync on; matches route to the right character profile and
  de-duplicate by CFN replay id.

## Manual setup (if you prefer the command line)

```bash
cd cfn-watcher
npm install
npx playwright install chromium
npm start        # = node watch.js --serve
```

## The round-finish codes (already confirmed)

Battle-log finish codes are mapped and verified: 1 = V (KO), 2 = P (Perfect),
5 = CA, 6 = SA, 7 = T (time out), 8 = OD. Chip (C) hasn't appeared in real data
yet — if a round finish ever looks wrong, the raw codes are kept with every
match, so it's a one-line fix. If parsing fails outright the watcher writes
`cfn-raw-sample.json` for diagnosis.

## Notes

- This reads only your own data using your own login, same as community tools
  like cfn-tracker — but strictly speaking scraping is against the site's ToS.
  Your account, your call.
- Your Capcom credentials never leave your machine; the watcher stores only the
  browser session, locally.
- The labs (defense reps, hits, notes) stay manual on purpose — CFN knows what
  happened, not why.
