# tools/

Headless checks and analysis for `draft0.html`. The page itself has no build step; this folder exists only to test it.

Setup, once: `cd tools && npm install`

| Tool | What it does |
|---|---|
| `node test-draft0.mjs [ubuntu.txt]` | Runs draft0.html in jsdom with a fake OpenRouter and a fake slow-writing save folder. It replays a transcript in Fast mode and prints PASS/FAIL for patch-style updates (left-out points kept, merged ids not resurrected, Undo), bounded requests, retired ids, history, the saved file and the permission button. Run it after any change to draft0.html. |
| `python3 -I analyze-session.py ../sessions/<file>.json [--all-versions]` | Readable summary of a saved session: utterances, then the outline versions. |

`ubuntu.txt` and `talk.txt` are sample transcripts (one utterance per line) of two talk brainstorms, for replay in the page or the test.
