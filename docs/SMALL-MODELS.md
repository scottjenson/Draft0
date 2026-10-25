# Small models: props, evidence, and whether they're worth it

## Status: parked (2026-10-24)
**Conclusion so far: on the user's base M2 (16 GB), local models are either fast enough to feel live or accurate enough to edit, not both.** Qwen3.5-4B (the fastest plausible candidate) can't fill in structured references reliably, with or without the props; Qwen3.5-9B edits well (3–4 of 4 in the cloud) but would take tens of seconds per update here. The props helped each side a little and closed neither gap. Much of the limit is this machine's memory bandwidth (~100 GB/s); a Pro/Max Mac would be 2–4× faster, which the user judged not worth buying for now.

The work is parked so the concept can be proven on the cloud model first. Come back if the cloud version turns out to be something special. **The one untested idea worth returning to:** split the problem by how fast each part must be. Named edits ("delete point one", "combine two and three", "rename point three") are parsed and done by code, instantly and exactly, with no model; content updates (already at most every 30 s) and vague edits ("collapse the repeats", "reorganize") go to a slower, accurate model such as Qwen3.5-9B.

## Why this file exists
Draft0's goal is to run entirely on-device. Frontier models (Sonnet, Opus, Gemini Argon) do the outline well from vague spoken instructions; small models that could run locally do not. **The question here is not whether bigger is better (it is). It is whether a few general props (structure in code, smaller tasks, checks) make a small model adequate, and whether each prop is worth what it costs.**

This is a hypothesis, not a commitment. It may turn out that no reasonable amount of scaffolding gets there, and that's a valid result. Read "Rules for this work" before adding anything.

## How we keep this honest (the guard against incrementing ourselves to death)
- **Check in regularly, by judgment rather than by number.** After each round of tests, step back with the user and ask: is the small model getting better, and is that worth what the props cost (latency, extra calls, code, new failure modes)? If the answer is "slightly, at a real cost", stop.
- **Narrow, don't widen.** Drop models and props that keep failing instead of propping them up. Fewer things in play is the goal.
- **Prefer the toolkit over special cases.** A new failure should be handled by one of the general mechanisms (B, C, D, G below). A fix for one phrase or one session is a patch, and patches are what we're avoiding.
- **Run things more than once.** Small models vary a lot from run to run, so one good or bad run proves little.
- **A task that still doesn't work after its props are tried goes to the cloud ("phone a friend") or is dropped.**

## What adequate looks like (judged with the user, not scored)
- Live outline: nothing lost or invented over a long session; readable without Distill.
- Spoken edits: does what was asked, and never removes something that wasn't named.
- Reorganize: everything accounted for; an overview kept when there was one.
- Speed: fast enough to feel live on the user's Mac (a few seconds per call).
- Distill (strategy, gaps, questions) is not expected locally.

## The gap: what frontier models do without being told
1. **Infer intent from vague speech**: "delete 0.1" means point one; "reorganize this" means rebuild the structure; "yes, do that" answers a question.
2. **Keep what they weren't asked to change.**
3. **Judge across the whole outline**: where a bullet belongs, what is a duplicate, what is missing.
4. **Do what they say they did** (a small model once reported "Removed point 1" and removed nothing).
5. **Pitch the size of a change right**: bold when a shake-up is wanted, gentle otherwise.
6. **Behave the same from run to run.**

## The toolkit
Each prop compensates for one or more of the gaps above. B, C, D and G are the general mechanisms; A, E and F support them.

| | Prop | Gap | Where | Status and evidence |
|---|---|---|---|---|
| A | Patch output instead of full rewrites | 2, 3 | draft0 `SCHEMA`, `applyPatch` | **Kept.** Cloud: rewrites let Haiku drop content; patches kept untouched points verbatim. Small models handle the format. |
| A | Menu of operations (Nano) | 3 | `nano-bench.html` | Shelved with Nano: Nano picked the right kind of edit in 3 of 4 but executed 1. |
| A | Tidy one point at a time | 3, 5 | `nano-bench.html` | Nano: renamed every title and lost content. Not tried on Qwen. |
| A | Embedding shortlist of 3 points | 3 | `nano-bench.html` | Untested (the Nano replay wasn't run). |
| B | A point vanishes only via an explicit removal; ids never resurrected; Undo | 2 | draft0 `applyPatch` | **Kept** (core). |
| B | Inertia: points from the last Distill are `existing`, may be added to but not reworked | 2, 5 | draft0 `distillInput` | **Kept.** With inertia Haiku kept the strategy point; without it, dropped it. Qwen obeyed it. |
| B | A point named by its displayed number ("1", "point 1") resolves to its id | 1, 4 | draft0 `applyPatch` | Trial. Unproven: in the next run Qwen used real ids. |
| B | Removal guard: a point can disappear only if the speaker named it or asked to merge or reorganize | 2 | not built | Proposed. Would have stopped Ministral's destructive edits; less pressing now that Ministral is dropped. Build only if Qwen shows the same failure. |
| C | Cue phrases route intent in code (`EDIT_CUE`, `DISTILL_CUE`, reorganize, change of mind) | 1 | draft0, `variants.mjs` | **Kept.** `EDIT_CUE` caught every real edit so far, plus one harmless false hit. |
| D | Reorganize cites sources: each new bullet names the old bullets it came from; code puts back any left out | 3, 4 | `variants.mjs` `reorg` | Trial. Safety net works: Qwen covered 15 of 23, code restored 8. Cost: one slower call (33 s on OpenRouter). The structure quality isn't judged yet. |
| D | Duplicate-title check, asked as "combine?" | 3 | `variants.mjs` | Trial, cheap. Caught both real duplicates seen so far. |
| A | `compact`: labelled points/bullets, operations out, code applies them | 2, 4, speed | `variants.mjs` | Trial. Faster (2–4×) on Qwen 4B, not more accurate; label format collided with the misheard "0.1". |
| D | Reject operations on points that don't exist | 4 | draft0, nano-bench | **Kept** (it is what made a bad delete a no-op instead of a wrong delete). |
| E | JSON schema; providers that honour it (`require_parameters`) | 4 | draft0, `draft0-code.mjs` | **Kept.** |
| E | Thinking off | 6 (speed) | `--no-think` | **Kept** for live tasks: Qwen went from 74–124 s to 2–13 s per call and stayed roughly as accurate. |
| F | Spell out the implicit ("keep an overview point", "a working assumption counts as an answer") | 1 | prompts | Trial. Use sparingly: each rule is a patch in disguise. |
| G | Ask, don't act: big moves on existing points become questions | 5 | `DISTILL` | **Kept.** Sonnet and Qwen both asked "combine?" questions. |
| G | Distill's questions as a separate call | 3 | `variants.mjs` `steps` | **Leaning Rejected.** No gain for Qwen: near-duplicate questions and loose ends about the session itself. |

## Results by task (current best; replace entries, don't append)
Test material: one 58-utterance planning session, replayed and continued live, in which the speaker assigns roles across four named items, contradicts themselves, and gives 4 spoken edits (a delete misheard as "0.1", "reorganize around the four items", and two "collapse the repeats"). Details stay in `sessions/` (git-ignored).

- **Named edits and collapse (live prompt):** Haiku 4 of 4 (matches Sonnet at about a tenth of the cost). Qwen3.5-9B with thinking off: 2 of 4 in one run and 4 of 4 in the next. Ministral 3B: 1 of 4 and destructive. Llama 3.2 3B: 0 of 4.
- **Reorganize:** Sonnet keeps an overview point and moves everything. Plain Qwen either did nothing or restructured while losing about 40% of the bullets and the overview point. Qwen with `reorg` lost nothing (code put bullets back) but left a "Not yet placed" bin.
- **Distill:** bullets after distilling a 38-bullet outline: Sonnet 31, Opus 20, Argon 17, Haiku 24, Qwen 27 (thinking off). **Only Opus and Argon caught the real gap** (one item lacked a detail every other item had). Qwen's questions vary from none to two plain ones.
- **Local speed (user's Mac: base M2, 16 GB; Ollama 0.40.6, MLX):** Gemma 4 12B took 60–121 s per edit call: prefill about 80 tok/s (23–29 s for 2k tokens), output 7–14 tok/s, 11 GB resident (memory pressure likely). Quality: 1 of 4 edits right. **On this machine output speed, not quality, is the binding limit**: a live update writes 200–800 tokens.
- **Local 4B-class models on the M2 (Ollama, thinking off; 4 edits × 2 runs each):** Gemma 4 E4B 4 of 8 (the delete and the bullet-combine right in both runs; reorganize and collapse wrong), 13–19 tok/s, 4.5–83 s per edit. Qwen3.5-4B about 2 of 8, 21–23 tok/s, 14–49 s. Granite 4 7B-A1B about 0 of 8, 30–31 tok/s, 15–32 s. **Common failure: ids.** Qwen 4B renumbered the real ids (p1, p3, p4…) as p1…p5, re-emitted every point and removed nothing, which produced duplicate points; Granite duplicated points the same way. **Speed is set by output length:** 300–1,100 output tokens at 13–31 tok/s; the one short answer (a 59-token delete) took 4.5 s. Ollama caches an identical prompt prefix (second-run prefill 0.1 s vs 5–13 s), which the live prompt's fixed system text would benefit from.
- **`compact` variant on Qwen3.5-4B (2 runs; labelled points/bullets, operations out, code applies):** **speed 2–4× better** on small edits (4.7–13.5 s, 91–213 output tokens, vs 13–49 s plain), reorganize still 31–43 s. **Accuracy no better, arguably worse:** "delete 0.1" deleted *bullet* 1.1 both runs (the bullet labels made the misheard "0.1" look like a bullet); reorganize created character points but left the old ones (run 1) or fell apart with 5 invalid operations (run 2); collapse either did nothing or removed the overview point; "combine two bullets" used merge on a bullet (skipped by code). The 4B misuses the operation fields (points where bullets go, merge for bullets). One call failed with "fetch failed" from Ollama.
- **Live outline from scratch (placement):** not yet tested on Qwen. Nano failed it earlier (see LEARNINGS, on-device lessons).

## Models
**Focus: Qwen3.5-9B only.** Everything else is dropped or a reference, so tests run one candidate plus the cloud original.

| Model | Status | Why |
|---|---|---|
| **Qwen3.5-9B** (WebLLM `Qwen3.5-9B-q4f16_1-MLC`, about 5 GB) | **Candidate** | Only small model that got most edits right, obeyed inertia and asked sensible "combine?" questions. Thinking must be off. Weak points: run-to-run inconsistency, content lost in a reorganize; both are what code-side props catch. |
| Qwen3.5-4B (WebLLM only) | Fallback | Try only if the 9B is too slow on the user's Mac. |
| Claude Haiku 5.5 | Reference (cloud) | What "small but good" looks like: matches Sonnet on edits, tactical at Distill. |
| Ministral 3B | **Dropped** | Destructive: wrong deletes twice, merged a whole outline into one point, removed a point when asked to combine two bullets. |
| Llama 3.2 3B | **Dropped** | 0 of 4 edits. |
| Gemma 4 12B (Ollama MLX, already installed) | Too slow | 60–121 s per call on the M2; 1 of 4 edits. |
| Gemma 4 E4B (Ollama, installed) | **Dropped** (user's call) | Scored best of the 4B class here (4 of 8 vs Qwen 4B's ~2 of 8), but the test is small and the user's experience with Gemma 4 on other tasks is poor. Qwen keeps a same-family step up (9B). |
| **Qwen3.5-4B** (Ollama) | **Candidate for props** | Weak on the plain prompt (renumbered ids, rewrote everything, duplicates); the props are tested on it. The 9B is the step up if they work. |
| Granite 4 7B-A1B (Ollama) | **Dropped** | Fastest (30 tok/s) but about 0 of 8. |
| Gemini Nano | **Shelved** | Reads intent but fails at judgments over content. |

OpenRouter runs full precision, so its results are an upper bound for the 4-bit WebLLM versions. Local speed on the user's Mac is untested.

## How to test
- `tools/compare-edits.mjs <session>` replays every spoken edit with the exact input the session's model got. `tools/compare-distill.mjs <session>` re-runs a Distill (`--fresh` drops inertia). Both take `--models a,b`, `--no-think` and `--variant` (`reorg`, `steps`), write an HTML page into `sessions/`, and show raw output. See `tools/README.md`.
- Cloud models: the key comes from the environment only, typed with `read -s` in the user's own terminal; Claude can't run those. **Local models: name them `ollama/<tag>`** (e.g. `ollama/qwen3.5:4b`); no key, nothing leaves the machine, so Claude can run them. Local calls run one at a time, with a 16k context and thinking off under `--no-think`; the page shows tok/s, prefill and load time.
- **Judge over 3 runs** before calling a prop better or worse (`--runs` is not built yet).
- `nano-bench.html` is the in-browser harness for an on-device model. It is Nano-specific today; WebLLM would reuse its replay and edit-case views.

## Didn't work
- Nano for edits: sorting bullets into named categories got about 5 of 23 right; tidy renamed titles and dropped content.
- Thinking on, for a local model: 6–11k thinking tokens per call, minutes locally.
- A separate questions call for Distill on Qwen (see `steps` above).

## Open questions and next steps (check in with the user after each)
1. Test Qwen3.5 locally through Ollama (draft0 can talk to it over localhost; on-device need not mean in-browser) for speed. This is the gate: if it can't feel live, the local path for live tasks stops here, whatever the quality.
2. If it passes: re-run the edit cases on local Qwen a few times (plain and `reorg`), and decide the number-to-id fix and `reorg`.
3. Then live placement from scratch on Qwen (replay a whole session).
