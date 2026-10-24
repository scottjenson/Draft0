# Voice Notes → Idea Map

Think out loud (e.g. on a walk) and watch a live outline of your main points build up, so you can pause, reflect and redirect. Current phase: validate that UX with a cloud model (`mirror-cloud.html`, via OpenRouter). The long-term goal is on-device (Gemini Nano in Chrome); that version (`mirror.html`) is parked.

## Start here
1. `docs/LEARNINGS.md` has the current state, findings and next steps. Read it first.
2. `HANDOFF.md` has the original goal, architecture and Chrome API notes. Treat it as background; where it conflicts with LEARNINGS, LEARNINGS wins.

## Files
- `mirror-cloud.html` is the current live app (UX test): on-device speech, outline from a cloud model via OpenRouter. Active work happens here.
- `mirror.html` is the on-device (Nano + embeddings) version, parked until the UX is validated.
- `extract-test.html` is the batch test bench (single pass vs multi-pass), kept for comparisons.
- `sessions/` holds saved sessions: `session-cloud-*.json` (mirror-cloud: utterances + every outline version + calls) and `session-live/replay-*.json` (mirror: utterances, statements, groups, main points). Each is test data: replay it in either page, or analyse it with `tools/analyze-session.py`. The user sometimes downloads copies to `~/Downloads`; compare them before trusting one.
- `tools/` holds headless tests (jsdom + fake model) and the session analyser. See `tools/README.md`. **Run `node tools/test-mirror-cloud.mjs` after changing mirror-cloud.html.**
- `ubuntu.txt`, `talk.txt` are older transcripts (one utterance per line) for replay tests.
- `voice-notes.html` is the original live speech prototype.
- `run-*.json` are runs the user downloaded from the test bench. Analyse them with a short Python/Node script; don't read them by eye.
- `docs/` holds project knowledge (see below). `docs/reference-synthesis.md` is the target output for the synthesis pass, written by Claude from the same input Nano gets.

## Running
`python3 -m http.server` in this folder, then open `http://localhost:8000/mirror-cloud.html` (or `mirror.html` / `extract-test.html`) in desktop Chrome. Never use an iframe or preview pane: Nano and the mic are blocked there. The user runs Nano tests and downloads the JSON; Claude analyses it.

The user supplies the OpenRouter key in the page; it lives only in their browser's localStorage. Never put it in files. Headless testing: `cd tools && npm install`, then the scripts in `tools/README.md`. This folder is a git repository; `.gitignore` excludes `tools/node_modules/` and `.env` files.

## Keeping docs/ up to date
- **Update `docs/LEARNINGS.md` after every test run or design decision,** before ending the turn.
- **Hard limit of about 80 lines.** Edit or replace existing lines rather than appending. When a run's details have been absorbed into a general rule, delete the details and keep the rule.
- One line per finding, with the numbers that back it (e.g. "51 of 66 statements").
- Record failures as well as successes, under "Didn't work", so they aren't retried.
- Keep "Current state" and "Next" accurate; they're what a fresh session acts on.
- Don't repeat HANDOFF.md, the code, or anything git would show.
- New docs/ files only for content that has a different purpose (e.g. a prompt library). Link them from LEARNINGS.

## Working conventions
- Discuss and get approval before changing direction or architecture; small fixes the user asked for can go straight ahead.
- Check the data before theorizing: analyse the run JSON before proposing fixes.
- Keep the test bench single-file with no build step; load libraries from a pinned CDN version.
- Prompts live as constants in each page (`SYSTEM` in mirror-cloud.html, `PROMPTS` in mirror.html). In extract-test.html, bump the localStorage prompt key (`cleanup-test.vN.prompt.*`) whenever default prompts change.
