# Learnings

Running log for picking up after lost context. Goal, original plan and API notes are in `../HANDOFF.md`; this file records only what we found since.

**Keep it compact:** under ~80 lines. Edit or replace entries rather than appending; delete what's no longer true. One line per finding.

## Current state (2026-10-23)
- **Active: `mirror-cloud.html`** (see Direction change below). Tests: `tools/` (headless; see `tools/README.md`).
- **`mirror.html`: the on-device (Nano) live app, now parked.** Speech → P1 clean/role → embeddings group → Nano labels/places/distils → numbered main points, with Replay, auto-save to a folder, and a debug drawer. It works mechanically; its structure quality is the open problem (see Findings).
- `extract-test.html`: the batch test bench (single pass vs multi-pass P1→embeddings→P2 labels→P3 sections→P4 synthesis, with Load run JSON). Kept for reference.
- `voice-notes.html` is the original live speech prototype; untouched so far.
- `run-*.json` are batch test-bench runs; `sessions/` holds live/replay sessions (analyse with `tools/analyze-session.py`).
- Environment: Chrome 155 on macOS; the Prompt API reports `available`. Context window not yet recorded.

## Direction change (2026-10-23)
- **The question now is UX, not engineering:** is a live outline of rambling actually helpful? Use a cloud model to answer it; on-device remains the long-term goal. The granular Nano pipeline kept fighting the need for holistic merging (back-and-forth across topics), so it is parked in mirror.html.
- **Built: `mirror-cloud.html`.**
  - On-device speech → utterances. At pauses (max once every 30 s, plus a manual Refresh), the previous outline plus the FULL transcript go to a model via OpenRouter (`/chat/completions`, json_schema structured output, default `anthropic/claude-sonnet-5.5`; model list fetched live).
  - The model returns the whole updated outline: 3–8 clarified points (title, summary, bullets) with stable ids, plus a one-line note of what changed.
  - Code diffs versions (new/updated badges, a "folded in" line) and keeps every version (◀/▶ history).
  - Shows "not in the outline yet" utterances while waiting.
  - Replay (fast mode refreshes every 3 utterances). Sessions save as `session-cloud-*.json`, sharing the folder choice with mirror.html. The key is kept in localStorage (local prototype only).
  - **First real run** (replay of the natural live session `…21-17-32`, Sonnet 5.5, fast): the user found the quality "quite good, big step up" over the Nano pipeline. Cost was $0.05 on the OpenRouter dashboard.
  - **First live session** (`sessions/session-cloud-live-2026-10-24T15-04-40`, 4 min todo list, 10 utterances, Sonnet 5.5, $0.063 for 8 calls): all 6 tasks became 6 points with stable ids and order, and bullets were only added to, never reworded. Mid-sentence cut-offs gave a placeholder point that the next refresh completed. A late correction landed in the right point, but not in its title, because there was no editing rule.
  - **Editing by voice works** (`sessions/session-cloud-replay-…15-18-18`: the 10-utterance todo replay, then live edits). "Collapse points three no no four five and six into one point, with just these three items" merged p4–p6 into one point with exactly those 3 bullets, and retired p5 and p6. The mid-sentence self-correction was handled. A spelled-out name correction ("point two, it's spelled …") fixed the title and summary. A late book-title remark now reached point 1's title. The user: "handled each one perfectly", but it feels a little slow.
  - **Patch build, verified** (`…15-47-27`, same replay plus edits, Sonnet): edit calls fired the moment the utterance ended (the merge came 27 s after the previous call, so it skipped the gap). Model time was 2.1–2.9 s (was 4–5.4) and output 172–256 tokens (was 640–730), so about 4–4.5 s from end of speech (was 6–7 s, up to 30 s+ with the throttle). Untouched points stayed verbatim; the merge removed p5 and p6 as "merged into p4". Cost $0.056 vs $0.070–0.073; input is flat at about 2.6k tokens instead of growing. The first call made no point from the preamble. Left: the merge kept 1 unasked bullet (4 for the 3 named; the old build kept 5), and one product name was misheard differently than in earlier runs (run-to-run variation).
  - **Haiku 5.5 on the same replay+edits** (`…15-26-32`): 10× cheaper ($0.007 vs $0.070) but **not faster** (2.3–9.2 s; it wrote 2–3× more output tokens, up to 2,070). It made a session preamble its point 1 ("Today's task list"), against the prompt. The first edits were right: delete point 1, fix the spelling, merge 4–6 (though it ignored "much simpler"). Then it **re-applied the old "delete point 1" to the renumbered outline and deleted the reading task**. It then read "point number two" in off-topic talk (the user dictating feedback) as a removal, **deleting a work task**, and rebuilt the reading task as a new p8. Sonnet made none of these errors. **Full-rewrite output lets a model silently drop content; the "new since" marker alone doesn't stop re-application on a small model.**
  - **Patch-style updates (2026-10-24).** The model gets the current outline (with displayed `point` numbers), retired ids, the last 4 already-outlined utterances as context only, and the new utterances. It returns `updated` (changed or new points, complete), `removed` (id + reason), `order` and `changes`. Code applies these and keeps every other point verbatim. A point can only vanish via `removed`; removals show with an Undo, which makes a new version (model `undo`). Retired ids are never resurrected. An edit-like phrase (`EDIT_CUE`: "point two", combine, collapse, delete, spelled…) refreshes at once, skipping the 30 s gap; on all 3 sessions it caught 4/4 real edits plus 1 harmless off-topic hit. Other changes: Stop refreshes only if something is new; Talk continues the session on screen (`liveFrom` marks the first live utterance). **Model choice: Sonnet 5.5** (the user: Haiku's savings aren't worth it).
- The user has an OpenRouter key (subscriptions don't include API access).

## What the user needs (shapes every decision)
- Rambling to explore ideas, then seeing them laid out to pause, reflect and change direction. Speech is full of revisions ("actually", "on second thought", "what I'm trying to say").
- Output = the current state of their thinking. Keeping content matters more than being concise, but the default view must stay short (details collapsed).
- **A mirror, not an analyst** (decided 2026-10-23): continuously distil what was said into its main points. No thesis, tensions or questions. It updates as each utterance arrives, the user reads it and responds by talking more. Not specific to talks.
- **Two kinds of utterance:** content (added to the pile and sorted) and editorial ("point three is wrong, remove it", "points two and three are the same, combine them"). Editorial ones carry more weight and must persist through re-synthesis. **Editing the outline by voice is the core goal**: a document the user works with and changes, not just a transcript summary.
- Latency is not a concern: text will stream in live, so per-call delays spread out across the time they're speaking.
- Prefer established libraries; no heavy build step.

## Findings
- **Chunked concept/relation/theme extraction: abandoned.** It treats speech as append-only, so a later "Y should be R" just adds R alongside Y.
- **Whole transcript in one Nano call: fits easily** (~1,300 words ≈ 2k tokens). Quality is far below Gemini/Claude on the same prompt. The problem is quality, not context.
- **Small models need small, local tasks.** Each call should see a little text; code holds global state.
- **Nano can't do judgment calls between statements:**
  - Matching a statement to one of N points swung from 3 new to 66 new with one prompt change (runs 1–2).
  - Marking "superseded" treated repetition as revision (run 3).
  - **Rule: do matching in code (embeddings); give Nano only labelling and summarizing of small groups.**
- **Never delete or overwrite content.** In run 1, two wrong `drops` hid 41 of 66 statements.
- **Splitting ideas too much is cheap; merging them is risky.** Duplicates on screen are visible and fixable; merged-away content is invisible.
- **First live session** (`sessions/session-live-…16-36-16`, 3.5 min; Nano kept up easily). The user named 4 topics aloud, yet everything landed in 1 main point. Causes: opening framing remarks became a catch-all that every placement chose; spoken structure was ignored; embeddings matched "the first idea is X" with "the final topic is Y" by sentence pattern; P1 invented "On second thought". **Fixes (verified by replaying that session headlessly with its recorded P1 output: 4 topics, all 24 statements in the right place):**
  - Named topics start a main point with the speaker's title, which is pinned and never rewritten. **Detection: P1 (Nano) tags each statement's role (content / new-topic + title / framing) in any wording**, which is the user's preference over rigid keywords. A regex for the plain forms ("the first topic is…", "topic three:") is a backstop. `detectedBy` (nano / regex / both) is recorded per topic; drop the regex once Nano proves reliable. Headless check: regex alone gives 4/4 topics; with Nano roles, a keyword-free "switching gears, let's get into metadata" also works and framing is set aside. Real Nano not yet tested.
  - Framing statements (tagged by P1) are set aside immediately and never attract content.
  - Each statement records the topic current when it was spoken, and groups are placed there **strictly**. A "clearly closer" override misfiled whole topics, because a new topic has only its title to compare against.
  - Embeddings use the subject without the marker wording. Groups in other named topics get a 0.15 penalty.
  - Groups can also be labelled `framing`. Placement sees titles only. P1: never add change-of-mind phrases; keep structure phrases.
  - UI: idea labels are visible under each point; ungrouped statements spoken under a topic show inside it.
- **P1 (clean/split) mostly works:**
  - It re-emits the previous passage unless told not to; a word-overlap filter catches the rest.
  - It leaves "it"/"that" unresolved, and those fragments can't be grouped.
  - The Topic line helps fix speech-recognition errors ("Andrew at iOS", "Ubuntu charge"). It can also bias P2: the weight plateau became "UX design plateau".
- **Embedding grouping:**
  - Good clusters: home-as-app, side bar, right gesture, "not your place" asides.
  - Centroids drift into catch-all groups; fix by re-splitting at threshold +0.1.
  - Attaching single statements at 0.45 cut loose statements from 50 to 26 on run 3's data; below 0.45 matches turn random.
- **Didn't work:**
  - A bonus for the previous statement's group (inconsistent).
  - Spotting "about the talk" remarks by comparing statements with sample sentences: only 2 clear hits; "subslide" was missed and "slide hoates" was a false positive.
  - **Main points by embedding (grouping the groups):** a threshold, stripping topic words, and merging to a fixed count all fail on both talks. They give one blob (70–134 statements) plus single groups, because all groups within one talk are similarly related. Grouping by idea needs Nano. (Nano's P3 sections in runs 4–5 were sensible.)
- **Batch runs 3–5 (test bench):** grouping generalizes across talks (talk.txt 17% loose, Ubuntu about 40%), but groups are too fine to be an outline and summaries describe rather than distil. Summaries sometimes misattribute views or invent things. **Prompt examples leak into output** ("Ubuntu Touch" appeared in talk.txt summaries), so use neutral rules, not topic examples.
- Timing: P1 about 4 s per call, P2 about 3 s, P3 about 15 s. Nano sometimes loops until the output limit (2 P1 calls took 8.5 min each, then `QuotaExceededError`). Calls now time out after 45 s, and a failed P1 falls back to plain sentence splitting.
- "I mean" is mostly filler; only explicit cues ("actually", "on second thought", "scratch that") flag a revision. Code tags these; nothing is struck through.
- Gotchas:
  - **Paste clipboard** pastes whatever is on the clipboard; check the word count before a run.
  - The threshold slider used to be remembered between sessions, and 0.85 silently ruined the ubuntu/talk runs (now resets to 0.5 on load).
  - Download during a run saves a partial run; the button now says so.
  - Folder auto-save could leave a stale file: overlapping saves, and a late save clearing the dirty flag. Fixed in both mirror pages: saves are serialized with a change counter, and an "Allow saving" button appears when Chrome needs permission again. Until a real session confirms it, check the file in `sessions/`.
  - Attaching loose statements could grow groups to 26; attaching is now capped at 10.

- **Real-Nano role tagging:** the scripted replay got 4/4 topics. The natural live session (`sessions/…21-17-32`) caught about 1 of 4 real topic changes, with 4 false positives (agenda talk), and missed announcements buried mid-utterance. P1 rewording also erased markers. Strict routing then misfiled everything after a false topic. **Per-statement detection lacks context; strict routing amplifies errors.** This is what prompted the move to the cloud model.

## Next
- Next: a walk session with back-and-forth and a real change of mind, which is still untested live. **Decided: no "use exactly that" rule for merges.** Absolute wording risks odd side effects, and summarizing and organizing is the point; an extra bullet is fixed with a follow-up edit. Hard-reload (Cmd+Shift+R) after any page change; one run was lost to a stale tab.
- Then UX iterations (layout, cadence, highlighting), and editorial utterances ("remove point 3"); with a cloud model these can simply go into the same prompt.
- On-device track (parked): `mirror.html`. Later, re-test the integrator design on a local model.
