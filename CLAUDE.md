# Draft0

Think out loud and watch a live outline of your main points build up, so you can pause, reflect and redirect, including by editing it by voice. See `README.md`.

**The goal is entirely on-device** (local speech + local model; nothing leaves the device). The cloud model (OpenRouter) is only a stepping stone to validate the UX. Every design choice should keep the path back to a local model open: prefer designs a small model can handle (small, local tasks; code holds global state), and record anything learned that matters for that move.

## Start here
`docs/LEARNINGS.md` has the current state, findings and next steps. Read it first.

## Files
- `draft0.html` is the app: on-device speech, outline from a cloud model via OpenRouter, patch-style updates, edits by voice. The prompt is the `SYSTEM` constant.
- `sessions/` (git-ignored, personal) holds saved sessions `session-cloud-*.json`: utterances, every outline version, calls. Replay them in the page or analyse them with `tools/analyze-session.py`. The user sometimes downloads copies to `~/Downloads`; compare them before trusting one.
- `tools/` holds the headless test, the session analyser and sample transcripts (`ubuntu.txt`, `talk.txt`). See `tools/README.md`. **Run `node tools/test-draft0.mjs` after changing draft0.html.**
- The retired on-device prototype (Nano + embeddings pipeline, test bench, original plan in HANDOFF.md) is at the git tag `nano-prototype`.

## Running
`python3 -m http.server` in this folder, then open `http://localhost:8000/draft0.html` in desktop Chrome. Never use an iframe or preview pane: the mic is blocked there. The user runs sessions and saves the JSON; Claude analyses it. After any page change, the user must hard-reload (Cmd+Shift+R).

The user supplies the OpenRouter key in the page; it lives only in their browser's localStorage. Never put it in files. The repo is public: no keys, no session data, no personal content from sessions in committed files (describe test content generically in docs). Headless testing: `cd tools && npm install`, then the scripts in `tools/README.md`.

## Keeping docs/ up to date
- **Update `docs/LEARNINGS.md` after every test run or design decision,** before ending the turn.
- **Hard limit of about 80 lines.** Edit or replace existing lines rather than appending. When a run's details have been absorbed into a general rule, delete the details and keep the rule.
- One line per finding, with the numbers that back it (e.g. "51 of 66 statements").
- Record failures as well as successes, under "Didn't work", so they aren't retried.
- Keep "Current state" and "Next" accurate; they're what a fresh session acts on.
- Don't repeat README, the code, or anything git would show.

## Working conventions
- Discuss and get approval before changing direction or architecture; small fixes the user asked for can go straight ahead.
- Check the data before theorizing: analyse the session JSON before proposing fixes.
- Keep the app single-file with no build step; load any library from a pinned CDN version.
