# tools/

Headless checks and analysis for `draft0.html`. The page itself has no build step; this folder exists only to test it.

Setup, once: `cd tools && npm install`

| Tool | What it does |
|---|---|
| `node test-draft0.mjs [ubuntu.txt]` | Runs draft0.html in jsdom with a fake OpenRouter and a fake slow-writing save folder. It replays a transcript in Fast mode and prints PASS/FAIL for patch-style updates (left-out points kept, merged ids not resurrected, Undo), bounded requests, retired ids, the guessed topic, Distill (first vs later input, questions carried forward), history, the saved file and the permission button. Run it after any change to draft0.html. |
| `OPENROUTER_API_KEY=… node compare-distill.mjs ../sessions/<file>.json [--distill N] [--fresh] [--models a,b]` | Re-runs one Distill from a saved session on several models side by side, with the page's own prompt, schema and input builder. Default: the second-to-last distill; `--fresh` ignores earlier distills (whole transcript, all points new). Without `--models` it lists OpenRouter models to pick from. Writes an HTML page (one column per model, plus the original) into `sessions/` and opens it. The key comes from the environment only. |
| `node test-nano-bench.mjs` | Runs nano-bench.html in jsdom with a fake Gemini Nano and fake embeddings on a synthetic session: placement, change-of-mind revisions, merge/remove/reorganize commands, tidying, and the edit-case mode. Run it after changing nano-bench.html. |
| `OPENROUTER_API_KEY=… node compare-edits.mjs ../sessions/<file>.json [--models a,b]` | Re-runs every spoken edit (utterances matching draft0's `EDIT_CUE`) through the live prompt on several models, each with the exact input the session's model got. HTML page: one row per edit, one column per model plus the original. Shares `draft0-code.mjs` with compare-distill. Both take `--no-think` (skip a model's thinking phase) and `--variant` (`reorg` for edits, `steps` for distill; see `variants.mjs`), and show each model's raw output. Models named `ollama/<tag>` run locally through Ollama (no key needed). |
| `python3 -I analyze-session.py ../sessions/<file>.json [--all-versions]` | Readable summary of a saved session: utterances, then the outline versions (distills with their questions, loose ends and left-out notes). |

`ubuntu.txt` and `talk.txt` are sample transcripts (one utterance per line) of two talk brainstorms, for replay in the page or the test.
