# SF6 Ranked Lab

A web-app replacement for the ranked-grind Google Sheet. Open `index.html` in a
browser (or serve the repo and visit `/sf6-tracker/`). No build step, no
dependencies; all data stays in your browser's localStorage.

## What it does that the spreadsheet couldn't

**Everything derived is now automatic.** You set your LP once, then per match
just enter the change the game shows — wins add, losses subtract, and the
running total, your rank (full Rookie→Master LP table), promotions/demotions,
and the first-to-2 set scores are all derived. The auto-computed "new total" is
editable if it ever drifts. Match numbers and dates fill themselves in.

**Per-character profiles.** Each character you play has its own SF6 rank, so
each gets its own profile — separate matches, LP/MR, placements, and labs.
Switch characters from the picker in the header; start a new one from the Data
tab (it begins in placement mode automatically). Existing single-character data
migrates into a "Main" profile you can rename. Backups include every character.

**Knows the whole ladder lifecycle:**

- **Placements** — a fresh start begins in placement mode: log W/L only for the
  first 10 matches (SF6 hides LP), then enter your placed LP once and continue.
- **Master Rate** — crossing 25,000 LP flags "YOU HIT MASTER" and switches
  tracking to MR (starting at 1500): MR gets its own over-time chart,
  Master-aware rank labels, and MR-scaled opponent-strength buckets.

**Analytics the sheet had no way to show:**

- **Dashboard** — current LP/rank with progress to the next division, winrate,
  set winrate, streak; an LP-over-time chart with rank thresholds and session
  markers; a **matchup chart** (winrate vs 50% per opponent character — instantly
  shows e.g. the Cammy problem); winrate by opponent strength (are losses coming
  from stronger players or upsets?); per-session summary table.
- **Defense lab** — the sheet's second tab, now with outcome breakdowns:
  how each defensive option (block / parry / neutral jump / …) actually resolves,
  split by what the opponent did and corner vs midscreen.
- **Hit lab** — the sheet's third tab, now a ranked "why I get hit" list
  (a data-driven training-mode to-do list), hit-type mix, panic rate, and the
  poor-decision meter totals.

**Quality of life:**

- Per-round tracking: each round records who won it and the finish (KO,
  Perfect, Overdrive, Super Art, Critical Art, chip) — shown as green/red
  badges like the sheet's colored cells, with dashboard breakdowns of how you
  win rounds vs how you lose them. The seed's round winners were recovered
  from the original sheet's green/red cell colors (which also revealed that
  matches 107–108 had their Win/Loss column swapped — corrected in the seed).
- One-tap Win/Loss, character chips sorted by how often you face them, a
  "Rematch" button that pre-fills the opponent for game 2/3 of a set.
- Flags rows where the recorded result and LP change disagree (the original
  sheet has a few).
- Destructive actions (wipe, clear/delete a character, delete a match) use a
  click-again-to-confirm button plus a one-shot Undo — no browser popups, so
  they work even in sandboxed embeds that block `confirm()`.
- Light/dark theme, phone-friendly layout for logging between games.
- Every chart has a table view; hover any mark for details.

## CFN auto-sync (no more typing between games)

`cfn-watcher/` is a companion tool you run on your gaming PC. It signs into
Buckler's Boot Camp **with your own Capcom ID in a real browser window** (first
run only; the session is kept locally) and polls your ranked battle log while
you play. Every new match — result, LP/MR, opponent character and LP/MR,
per-round wins with finish types, opponent control type — lands in
`cfn-sync.json`. The tracker's Data tab then either auto-merges it every 30 s
("Auto-sync from local watcher") or imports the file on demand. Matches route
to the profile named after the character **you** played, and duplicates are
dropped by CFN replay id. See `cfn-watcher/README.md` for setup and the
one-time field-mapping verification.

## Your data

- **Load spreadsheet history** (first-run banner or the Data tab) imports the
  full original sheet into a **Zangief** profile: 164 matches, 61 defense reps,
  30 hit entries — cleaned of the ~100 empty drag-filled rows, with per-round
  winners recovered from the cell colors.
- Export/import a full **JSON backup**, or export **CSVs with the original
  sheet's exact columns** (with rank and set score filled in for every row) if
  you ever want to go back to Sheets.

## Files

```
index.html   page shell
style.css    theme (light/dark) and layout
app.js       state, rank/set math, charts (hand-rolled SVG), all six tabs
seed.js      the transcribed spreadsheet history
```
