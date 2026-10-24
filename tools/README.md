# tools/

Headless checks and analysis for the Mirror pages. The pages themselves have no build step; this folder exists only to test them.

Setup, once: `cd tools && npm install`

| Tool | What it does |
|---|---|
| `node test-mirror-cloud.mjs [../ubuntu.txt]` | Runs mirror-cloud.html in jsdom with a fake OpenRouter and a fake slow-writing save folder. It replays a transcript in Fast mode and prints PASS/FAIL for patch-style updates (left-out points kept, merged ids not resurrected, Undo), bounded requests, retired ids, history, the saved file and the permission button. Run it after any change to mirror-cloud.html. |
| `node test-mirror.mjs [../sessions/<file>.json]` | Runs mirror.html in jsdom with a fake Nano and the real embedding model, replays a transcript or saved session, and prints the main points. It tests plumbing, not Nano's judgment. |
| `python3 -I analyze-session.py ../sessions/<file>.json [--all-versions]` | Readable summary of a saved session from either page: utterances, then the outline versions (cloud) or statements, groups and main points (Nano). |

Grouping experiments (thresholds, re-splitting, attaching loose statements): extract the clustering functions from mirror.html or extract-test.html and run them with `@huggingface/transformers` and `Xenova/all-MiniLM-L6-v2` (`dtype: 'q8'`). Results are recorded in `docs/LEARNINGS.md`.
