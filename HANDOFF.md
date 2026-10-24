# Voice Notes → Idea Map: Handoff

Handoff from a claude.ai prototyping session (2026-10-22) into Claude Code. It records the goal, what exists, what we learned, the decisions so far, and the next steps. The working prototype is `voice-notes.html` (single file, no build step).

---

## 1. Goal

A browser tool for **brainstorming out loud**, for example while developing a talk. You speak freely. The tool:

1. Transcribes speech live.
2. Uses **on-device Gemini Nano** (Chrome built-in AI) to pull out **concepts, keywords, and the connections between them**.
3. Produces a **distilled intermediate document** (Markdown with anchors and cross-links) that gives a higher-level overview of what was said.
4. Shows that structure as an **interactive mind map** that can be panned, zoomed, folded and unfolded, with cross-links between ideas.

Guiding preference from the user: **use established libraries rather than hand-written code** wherever possible, for reliability.

## 2. The four stages

| Stage | What it does | Status |
|---|---|---|
| 1. Transcript | Live speech-to-text into a text field | **Working prototype** (`voice-notes.html`) |
| 2. Extraction | Nano extracts concepts, keywords and relations | Prototype extracts summary and flat keywords only; relations not started |
| 3. Distilled doc | Concept graph rendered as Markdown with anchors and "See also" links | Not started |
| 4. Mind map | Interactive map built from the graph or Markdown | Not started |

## 3. Current prototype: `voice-notes.html`

A single self-contained HTML file. It uses Google Fonts from a CDN and loads no JS libraries.

**What it does**
- **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`): `continuous = true`, `interimResults = true`.
  - Final text accumulates in a textarea. Interim text shows in grey underneath.
  - It auto-restarts in `onend` while recording, because Chrome stops after silence.
- **On-device speech (optional)**: if `SpeechRecognition.available()` exists, a checkbox sets `processLocally = true`. It calls `SpeechRecognition.install({langs, processLocally:true})` when the model is downloadable.
- **Stop & summarize** button:
  - **Summarizer API** with `type:'key-points'`, `format:'markdown'`, `length:'medium'` and a `sharedContext` explaining that the input is a speech transcript.
  - Uses `summarizeStreaming` when available.
  - If `measureInputUsage` exceeds `inputQuota`, it summarizes the transcript in chunks and then summarizes the joined chunk summaries.
- **Keywords**:
  - **Prompt API** (`LanguageModel.create` plus `session.prompt(text, {responseConstraint: schema})`) returns `{keywords: string[]}`.
  - If the Prompt API is missing or fails, it falls back to a word-frequency extractor with a stopword list. The UI labels which source was used.
- **UI details**:
  - Status pills show availability of each API (`available` / `downloadable` / `unavailable` / missing).
  - Download progress comes from `monitor` → `downloadprogress`.
  - The transcript is editable after stopping, and a "Summarize" button re-runs the analysis.
  - Other controls: language selector, Clear, Copy summary. Light and dark themes are supported.
- **Frame detection**: if `window.self !== window.top`, a banner explains that the page must be opened directly in a Chrome tab.

**Known gaps in the prototype**
- Extraction runs only once, at Stop, on the whole transcript. There's no incremental processing.
- Keywords are a flat list, with no concepts, relations or themes.
- Nothing persists (no storage, no export).
- It hasn't been tested end to end on a machine where Nano reports `available`. The user's first run was inside the claude.ai preview frame (see 4.1).

## 4. Lessons learned (important)

### 4.1 Never run it inside an iframe or preview pane
In the claude.ai file preview, the mic failed with `not-allowed`, and both `Summarizer` and `LanguageModel` reported **`unavailable`**. Sandboxed or cross-origin frames block the microphone and built-in AI unless the frame grants permissions policy. The Speech pill still showed green, because that check only tests whether the API exists, not whether it's permitted.

**Run it like this:**
```
python3 -m http.server   # in the project folder
# open http://localhost:8000/voice-notes.html in desktop Chrome
```
localhost counts as a secure context. Use a dev server (e.g. Vite) once there's a build step.

### 4.2 Chrome built-in AI requirements (from Chrome docs, checked 2026-10-22)
- **Prompt API on web pages: Chrome 148+.** In extensions it has been available since Chrome 138. Only the sampling parameters (`samplingMode`, temperature/topK) remain behind an origin trial on the web.
- Summarizer API: Chrome 138+.
- Hardware and OS:
  - OS: Windows 10/11, macOS 13+, Linux, ChromeOS (Chromebook Plus). **Not Android or iOS.**
  - Disk: **22 GB+ free**. The model is removed if free space drops below 10 GB.
  - GPU with more than 4 GB VRAM, **or** a CPU with 16 GB+ RAM and 4+ cores.
  - Unmetered network for the first model download.
- Debug page: `chrome://on-device-internals` shows the model state.
- If the Prompt API shows "missing" on an older Chrome, try `chrome://flags/#prompt-api-for-gemini-nano`.
- `create()` may need **user activation** when a download is required. Call it from a click handler, as the Stop button does now.

### 4.3 Prompt API features we plan to rely on
- `responseConstraint`: a JSON Schema passed to `prompt()` or `promptStreaming()`, which forces the output to match the schema. The schema consumes context unless `omitResponseConstraintInput` is used.
- `session.contextWindow` and `session.contextUsage` report the limit and current usage. `measureContextUsage()` estimates the cost of a prompt.
- On overflow, the oldest turns are dropped (the system prompt is kept) and a `contextoverflow` event fires. If the input can't fit at all, the call throws `QuotaExceededError`.
- `session.append()` adds messages without generating a reply, which is useful for feeding transcript as it arrives.
- Audio input (`expectedInputs: [{type:'audio'}]`, GPU only) exists. We could feed audio straight to Nano later, but Web Speech is fine for now.

## 5. Key architecture decision

**Gemini Nano outputs structured JSON only. Code, not the model, produces the Markdown and the mind map.**

The reasoning: a small model is much more reliable at filling a strict schema than at writing a coherent, cross-linked document. Keeping the model's job narrow also lets us swap Nano for a cloud model in that one step, with the same schemas, if Nano turns out to be too weak.

```
speech ──► transcript chunks ──► Nano (schema-constrained) ──► merge/dedupe in code
                                                                     │
                                                          Concept graph (JSON) = source of truth
                                                           │                         │
                                              Markdown (anchors, See also)     Mind Elixir data
                                                           │                         │
                                                  markmap (tree view)     mind map with cross-link arrows
```

### 5.1 Extraction strategy for a small model
- **Incremental**: process every N finalized sentences (or every ~30–60 s) while the user talks, not one big pass at Stop.
- **One small task per call**:
  1. *Concepts*: from this chunk, return the new concepts, each with a short label, a 1–2 sentence gist, and keywords.
  2. *Relations*: given the list of existing concept IDs, return the relations among them. Make `from` and `to` a **JSON Schema `enum` of the existing IDs**, so the model can't invent nodes.
  3. *Themes*: group the concepts into 3–7 themes, again with the concept IDs as an `enum`. This step builds the hierarchy for the tree view.
- **Merge and dedupe in code** by normalized label, with optional fuzzy matching. Don't ask the model to maintain global state.
- Keep chunks small and check `contextUsage`. Create fresh sessions per task, or `clone()` a primed session, rather than one ever-growing session.
- Expect noise. Make the UI let the user rename, merge and delete concepts and relations.

### 5.2 Draft schemas (starting point, not final)
```json
// Concepts (per chunk)
{ "type":"object", "required":["concepts"], "properties":{
  "concepts":{ "type":"array", "maxItems":8, "items":{
    "type":"object", "required":["label","gist"], "properties":{
      "label":{"type":"string"}, "gist":{"type":"string"},
      "keywords":{"type":"array","items":{"type":"string"},"maxItems":5}
}}}}}

// Relations (IDS = current concept ids, injected at runtime)
{ "type":"object", "required":["relations"], "properties":{
  "relations":{ "type":"array", "items":{
    "type":"object", "required":["from","to","kind"], "properties":{
      "from":{"enum":IDS}, "to":{"enum":IDS},
      "kind":{"enum":["supports","contrasts","example-of","leads-to","part-of","related"]},
      "note":{"type":"string"}
}}}}}

// Themes
{ "type":"object", "required":["themes"], "properties":{
  "themes":{ "type":"array", "maxItems":7, "items":{
    "type":"object", "required":["title","conceptIds"], "properties":{
      "title":{"type":"string"}, "conceptIds":{"type":"array","items":{"enum":IDS}}
}}}}}
```

### 5.3 Concept graph (source of truth)
```ts
type Concept  = { id: string; label: string; gist: string; keywords: string[]; mentions: number; firstSeenAt: number; sourceSpans?: [number, number][] };
type Relation = { from: string; to: string; kind: string; note?: string };
type Theme    = { id: string; title: string; conceptIds: string[] };
type Graph    = { title?: string; concepts: Concept[]; relations: Relation[]; themes: Theme[]; transcript: string };
```
Persist it to IndexedDB or localStorage, and add JSON and Markdown export.

### 5.4 Markdown generation (deterministic)
- `# Title`, then `## Theme` for each theme, then `### Concept` with its gist, keywords, and a **See also** list of `[Other concept](#slug)` links from the relations.
- Concepts that belong to no theme go under `## Other ideas`.

## 6. Libraries (researched, not yet integrated)

| Need | Library | Notes |
|---|---|---|
| Heading anchors / slugs | **github-slugger** | Stable `#slug` for each heading; keeps generated links valid |
| Markdown → HTML | **markdown-it** + **markdown-it-anchor** | Renders the document view with ids on headings |
| Markdown → mind map (tree) | **markmap** (`markmap-lib`, `markmap-view`, `markmap-toolbar`, `markmap-autoloader`) | Parses Markdown structure into an interactive SVG map with fold/unfold and pan/zoom. Tree only: cross-references appear as links inside nodes, not drawn edges. Lowest-effort first view. https://markmap.js.org |
| Mind map with cross-links | **Mind Elixir** (`mind-elixir`, v5.x) | JSON data model (`getData`/`refresh`), editable nodes, **custom links between nodes**, **summaries** over node groups, plugin system, SVG/PNG/HTML export, CDN available. Best fit for showing connections. https://github.com/ssshooter/mind-elixir-core |
| Free-form concept network (later) | **Cytoscape.js** or **vis-network** | If a non-hierarchical graph view is wanted |
| Skip | Mermaid mindmap | Mostly static rendering |

Plan: build both views from the same graph. markmap reads the generated Markdown. Mind Elixir gets a converter from the graph: themes become branches, concepts become child nodes, and relations become Mind Elixir links.

Check before integrating: exact current versions and APIs, especially Mind Elixir's link/arrow data shape and its markmap-style import, plus licenses.

## 7. Suggested next steps in Claude Code
1. Set up the repo: Vite + vanilla TS (or keep a single HTML file until it hurts). Move `voice-notes.html` in, and split it into modules: `speech`, `nano`, `graph`, `markdown`, `views`.
2. Confirm on the user's machine that Summarizer and LanguageModel both report `available` in a normal tab. Record the Chrome version and the `contextWindow` value.
3. Implement incremental chunking off the finalized transcript, then the concept extraction call.
4. Implement the graph store, the merge/dedupe logic, and persistence.
5. Add the relations and themes calls, using enum-constrained IDs.
6. Generate the Markdown and render a document view (markdown-it + anchors).
7. Add the markmap view.
8. Add the Mind Elixir view, with relations drawn as links.
9. Add editing: rename, merge and delete concepts; regenerate the views.
10. Write an evaluation script that runs a few saved sample transcripts (e.g. a talk-brainstorm monologue) through extraction and records the output, so prompt changes can be compared over time.

## 8. Open questions
- Is Nano good enough for relations? Test with real brainstorm transcripts before investing heavily. Keep the extraction step swappable (Nano vs. a cloud model behind the same schemas).
- Chunk size and cadence: by sentence count, by time, or by pause detection?
- Should the user be able to steer it while talking (e.g. saying "new section: …" or "connect that to …")?
- Which view is primary: markmap tree, Mind Elixir map, or the Markdown document?
- Storage: keep multiple brainstorm sessions, and merge them across sessions?

## 9. Sources
- Chrome Prompt API docs: https://developer.chrome.com/docs/ai/prompt-api
- Chrome Summarizer API docs: https://developer.chrome.com/docs/ai/summarizer-api
- markmap: https://markmap.js.org/docs/markmap
- Mind Elixir readme: https://unpkg.com/mind-elixir@5.15.0/readme.md
