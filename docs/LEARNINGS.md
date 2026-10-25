# Learnings

Running log for picking up after lost context. The goal is in `../README.md` (entirely on-device; the cloud model is a stepping stone). This file records only what we found.

**Keep it compact:** under ~80 lines. Edit or replace entries rather than appending; delete what's no longer true. One line per finding.

## Current state (2026-10-24)
- **Small models have their own file, `docs/SMALL-MODELS.md`.** Read it before any local-model work.
- **`draft0.html`** (was `mirror-cloud.html`): on-device speech → utterances; outline from a cloud model via OpenRouter (default `anthropic/claude-sonnet-5.5`, json_schema structured output). Headless test: `tools/test-draft0.mjs`.
- **Request:** current outline (with displayed `point` numbers), retired ids, the last 4 already-outlined utterances as context only, and the new utterances. Input stays flat at about 2.6k tokens.
- **Response (patch):** `updated` (changed or new points, complete), `removed` (id + reason), `order`, `changes`. Code applies it and keeps every other point verbatim. A point can only vanish via `removed`; removals show with an Undo (a new version, model `undo`). Retired ids are never resurrected.
- **Cadence:** a refresh at a pause, at most every 30 s; an edit-like phrase (`EDIT_CUE`: "point two", combine, collapse, delete, spelled…) refreshes at once. Stop refreshes only if something is new. Talk continues the session on screen, including a replay (New clears it); `liveFrom` marks the first live utterance.
- **Topic is guessed, not typed:** the response has a `topic` field, filled on the first outline (empty after unless clearly wrong). It shows as an editable heading; a typed correction wins and is sent as "from the speaker". Replays no longer carry a saved topic over, so they test the guess. Untested live.
- **Calm UI:** only Talk, timer and New session up top; key, model, replay, saving, transcript and calls sit in a "Tools & debug" twisty (opens itself when no key is saved).
- **Distill (button, or say "distill" / "clean this up"):** separate prompt (`DISTILL`), an opinionated mirror. Points in the last distill are `existing` (inertia: may be added to, never reworked; overlaps come back as questions for a voice edit); everything since is `new` and fair game. First distill sends the whole transcript, later ones only what's new since. Same patch format.
- **Open questions** sit above the outline. Only Distill adds them (≤4); a live update clears one the speaker answers (`answered`, shown struck through with the answer for that version). Loose ends and "Left out" stay below the outline.
- **Distill runs 1–2 (contradictory planning ramble replayed + live, 58 utterances, $0.52):** Sonnet distills stay moderate even with the bolder prompt (bullets 23→18, 23→16, 38→31; inertia respected, overlaps asked as questions). Big restructures came from spoken commands ("reorganize around these four items", "collapse the repeats"). **Dynamic questions worked:** 12 answered live, each struck through with a correct answer; Distill's questions drove most of the speaker's later utterances. Gemini Argon calls returned no usage, so session cost undercounts.
- **Voice vs Distill:** restructuring by voice works when the speaker knows the shape; Distill's job is what voice can't do: ask the questions, clear duplicates and clutter, propose a shape.
- **Distill by model:** only Opus and Gemini Argon caught a real gap (one of four items lacked a detail the others had) and led with the overall strategy; Sonnet and Haiku were tactical. Cost per distill: Haiku $0.002, Argon $0.02, Sonnet $0.03–0.04, Opus $0.08. Argon once wrote a Hindi word mid-sentence. Details: `SMALL-MODELS.md`.
- Every version is kept (◀/▶ history). Sessions auto-save to a picked folder (`sessions/`, git-ignored) or download as JSON.
- Retired at the `nano-prototype` tag: the on-device pipeline (`mirror.html`), the batch test bench, the original prototype and HANDOFF.md.
- Environment: Chrome 155 on macOS; the Prompt API (Nano) reports `available`.

## Speech recognition (Web Speech API)
- **On-device works and is good:** `processLocally = true` after `SR.available/install({langs:['en-US'], processLocally:true})`. Live test: "shockingly good"; it missed rare foreign terms and, oddly, "rework".
- **Without `processLocally`, Chrome still runs on-device once the en-US pack is installed:** a "cloud" pass of a 1-min, 138-word recording matched the local pass character for character and worked with Wi-Fi off. The spec has no way to force the cloud (a cloud-only option was dropped; Chrome plans to phase cloud out), and draft0 (which doesn't set the flag) is probably already on-device on this machine.
- `recognition.start(audioTrack)` accepts a recording played into a `MediaStreamDestination`, so one recording can be re-transcribed (the test page was deleted). A real cloud comparison would need OpenRouter's `/audio/transcriptions` (Whisper, Scribe); not pursued, as cloud speech isn't a goal.

## What the user needs (shapes every decision)
- Rambling to explore ideas, then seeing them laid out to pause, reflect and change direction. Speech is full of revisions ("actually", "on second thought").
- **A mirror, not an analyst:** distil what was said into its main points. No thesis, tensions, questions or advice. Not specific to talks.
- **Editing the outline by voice is the core goal:** a document the user works with and changes ("combine 2 and 3", "drop 4", "rename", "fix that spelling"), not just a transcript summary. Edits outrank content.
- Summarizing and organizing is the point, so avoid absolute prompt rules ("use exactly that"); they risk odd side effects. A small slip is fixed with a follow-up spoken edit.
- Keeping content matters more than being concise, but the default view must stay short.
- Prefer established libraries; no build step.

## Cloud findings (draft0)
- **First replay** of a natural session on Sonnet: "quite good, big step up" over the Nano pipeline; about $0.05.
- **First live session** (4 min todo list, 10 utterances, $0.063): 6 tasks became 6 stable points; bullets were only added to, never reworded. Utterances cut mid-sentence gave a placeholder point that the next refresh completed.
- **Full-rewrite output (the old format), Sonnet:** voice edits worked (merge 4–6 with a self-correction mid-sentence, a spelled-out name fix, a late title correction), but each took 6–7 s after speech, and 30 s+ when throttled.
- **Haiku 5.5, same test:** 10× cheaper ($0.007 vs $0.070) but not faster (2.3–9.2 s; 2–3× more output). It made a session preamble its first point. It **re-applied an old "delete point 1" to the renumbered outline** and **read "point number two" in off-topic talk as a removal**, deleting two real tasks. **Full rewrites let a model drop content silently; a "new since" marker alone doesn't stop re-application on a small model.** Decision: Sonnet.
- **Patch format, Sonnet, same test:** edit calls fired as the utterance ended. Model time was 2.1–2.9 s (was 4–5.4) and output 172–256 tokens (was 640–730), so about 4–4.5 s from end of speech. Untouched points stayed verbatim; the merge recorded "merged into p4". Cost $0.056 vs $0.070. The first call made no point from the preamble. The merge kept 1 unasked bullet (4 for the 3 named; full rewrite kept 5). A product name was misheard differently from earlier runs (run-to-run variation).
- `EDIT_CUE` on all sessions so far: 4/4 real edits caught, plus 1 harmless off-topic hit (an extra call).
- Gotchas: **hard-reload (Cmd+Shift+R) after any page change**; one run silently used the old build. Folder auto-save is serialized with a change counter, and an "Allow saving" button appears when Chrome needs permission again.

## On-device lessons (Nano prototype, see tag `nano-prototype`)
Kept for the move back to a local model.
- **Whole transcript in one Nano call fits easily** (~1,300 words ≈ 2k tokens); the problem is quality, not context. Nano was far below Gemini/Claude on the same prompt.
- **Small models need small, local tasks:** each call sees a little text; code holds global state.
- **Nano can't make judgment calls between statements:** matching a statement to one of N points swung from 3 to 66 new points with one prompt change, and "superseded" marking treated repetition as revision. Do matching in code (embeddings); give Nano only labelling and summarizing of small groups.
- **Never delete or overwrite content on a model's say-so:** two wrong drops hid 41 of 66 statements. Splitting ideas too much is cheap (visible, fixable); merging is risky (invisible). The patch format plus Undo applies the same rule in draft0.
- **Per-statement topic detection lacks context:** in a natural session Nano caught about 1 of 4 real topic changes, with 4 false positives (agenda talk). Strict routing then misfiled everything after a false topic. The granular pipeline kept fighting the need for holistic merging across back-and-forth, which prompted the cloud move.
- **Embeddings (all-MiniLM-L6-v2):** good for clustering near-duplicates; centroids drift into catch-alls (re-split at threshold +0.1); attaching singles works at ≥0.45 (below, matches turn random). Grouping groups into main points by embedding fails: one blob plus singletons.
- Cleanup pass (P1): it re-emits the previous passage unless told not to; it leaves "it"/"that" unresolved; it invents change-of-mind phrases unless forbidden. A Topic line helps fix speech-recognition errors but can bias labels.
- **Prompt examples leak into output** (an example product name appeared in another talk's summaries): use neutral rules, not topic examples.
- Timing: cleanup about 4 s per call, labels about 3 s, sections about 15 s. Nano sometimes loops until the output limit (8.5 min, then `QuotaExceededError`); time calls out at 45 s.
- Only explicit cues ("actually", "on second thought", "scratch that") flag a revision; "I mean" is mostly filler.

## Didn't work
- Chunked concept/relation/theme extraction: it treats speech as append-only, so a later "Y should be R" just adds R alongside Y.
- A bonus for the previous statement's group; spotting "about the talk" remarks by comparison with sample sentences (2 clear hits, plus a false positive).
- Haiku for the outline (see above). A "use exactly that" rule for merges (decided against).

## Next
- **Focus: the UX on the cloud model** (Sonnet), to prove the concept before returning to local models.
- Open UX question: Distill's role vs spoken restructuring (voice did the big reorganizations; Distill's value was the questions). Consider renaming it, or a stronger model for Distill only (Opus and Argon caught a real gap; Sonnet didn't).
- A walk session with back-and-forth and a real change of mind; both are still untested live.
- Then UX iterations (layout, cadence, highlighting).
- **Small / local models: parked.** See `SMALL-MODELS.md` for the props, evidence and conclusion (on a base M2, local models are either fast or accurate, not both) and the one idea worth returning to. Back to the UX on the cloud model to prove the concept first.
