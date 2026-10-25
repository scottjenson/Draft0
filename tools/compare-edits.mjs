// Re-runs each spoken edit from a saved session through draft0's live prompt on several models, next to what the
// session's model did. Each case rebuilds the exact live call that carried the edit (same outline, open questions,
// context and new utterances), so point numbers mean what the speaker meant.
// Usage (from tools/):  OPENROUTER_API_KEY=sk-or-… node compare-edits.mjs <session.json> [--models a,b,c] [--no-think] [--variant reorg|compact]
// An edit is an utterance that matches draft0's EDIT_CUE. Writes an HTML page (one row per edit, one column per
// model) next to the session (sessions/ is git-ignored) and opens it. The key is read from the environment only.
import fs from 'fs';
import { loadPage, retiredBefore, line, count, callModel, usageText, pickModels, esc, outlineHTML, writeReport, openFile } from './draft0-code.mjs';
import { REORG_CUE, reorganize, compact } from './variants.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a) => a.endsWith('.json'));
const key = process.env.OPENROUTER_API_KEY;
const noThink = args.includes('--no-think'); // skip the model's thinking phase
const variant = opt('--variant'); // reorg or compact: see variants.mjs
if (!file) { console.error('Usage: OPENROUTER_API_KEY=… node compare-edits.mjs <session.json> [--models a,b]'); process.exit(1); }

// ---------- the edit cases ----------
const session = JSON.parse(fs.readFileSync(file, 'utf8'));
const { EDIT_CUE } = loadPage({ ...session, retired: [] });
const cases = session.utterances.map((u, i) => ({ u, n: i + 1 })).filter(({ u }) => EDIT_CUE.test(u.text)).flatMap(({ u, n }) => {
  // The live call that carried this utterance: the first non-distill version that saw it, built on the version before.
  const k = session.versions.findIndex((v) => !v.distill && v.model !== 'undo' && v.upto >= n);
  if (k < 0) return [];
  const versions = session.versions.slice(0, k), prev = versions.at(-1), target = session.versions[k];
  const S = { ...session, versions, retired: retiredBefore(versions, prev) };
  const page = loadPage(S);
  return [{ n, text: u.text, prev, target, page, user: page.liveInput(prev, target.upto, line) }];
});
console.log(`${cases.length} edit cases: ${cases.map((c) => `utterance ${c.n}`).join(', ')}`);
if (!cases.length) process.exit(0);

const models = await pickModels(opt('--models'));
if (!models.length) process.exit(0);
if (!key && models.some((m) => !m.startsWith('ollama/'))) { console.error('Cloud models need OPENROUTER_API_KEY; ollama/<tag> models run locally without one.'); process.exit(1); }

// ---------- run: every case on every model, in parallel ----------
// With --variant reorg, a reorganize request also goes through the reorg variant (its own prompt, coverage checked).
console.log(`Running ${models.join(', ')}${variant ? ` (+ variant ${variant})` : ''}…\n`);
const show = (title, r, extra = {}) => (r.error ? { title, error: r.error, raw: r.raw }
  : { title, stat: `${count(r.points)} · ${usageText(r)}${r.note ? ` · ${r.note}` : ''}`, raw: r.raw, points: r.points, removed: r.removed, ...extra });
const results = await Promise.all(cases.map((c) => Promise.all(models.flatMap((model) => {
  const plain = (async () => {
    const r = await callModel({ key, model, system: c.page.SYSTEM, user: c.user, name: 'outline', schema: c.page.SCHEMA, noThink });
    if (r.error) return show(model, r);
    try {
      const patch = c.page.parsePatch(r.raw);
      return show(model, { ...r, ...c.page.applyPatch(c.prev?.points || [], patch) }, { changes: patch.changes, answered: patch.answered });
    } catch (e) { return show(model, { ...r, error: `unreadable output: ${e.message}` }); }
  })();
  if (variant === 'compact') return [plain, compact({ key, model, noThink, prev: c.prev, liveUser: c.user, topic: session.topic })
    .then((r) => show(`${model} + compact`, r, { changes: r.changes, answered: r.answered, log: r.log }))];
  if (variant !== 'reorg' || !REORG_CUE.test(c.text)) return [plain];
  const said = c.user.split('\n\nNew utterances:\n')[1] || c.text;
  return [plain, reorganize({ key, model, noThink, prevPoints: c.prev?.points || [], said })
    .then((r) => show(`${model} + reorg`, r, { changes: r.changes, dropped: r.dropped }))];
}))));

// ---------- report: one row per edit, one column per model ----------
const column = (r) => `<section class="col"><h2>${esc(r.title)}</h2>`
  + (r.error ? `<p class="err">${esc(r.error)}</p>`
    : `<p class="stat">${esc(r.stat)}</p><p class="changes">${esc(r.changes)}</p>${outlineHTML(r.points)}`
      + (r.removed?.length ? `<p class="removed">Removed: ${r.removed.map((x) => esc(`${x.point.title} (${x.reason})`)).join('; ')}</p>` : '')
      + (r.dropped?.length ? `<p class="removed">Dropped with a reason: ${r.dropped.map(esc).join('; ')}</p>` : '')
      + (r.log?.length ? `<p class="removed">Code: ${r.log.map(esc).join('; ')}</p>` : '')
      + (r.answered?.length ? `<p class="changes">Answered: ${r.answered.map((a) => esc(`${a.id}: ${a.answer}`)).join('; ')}</p>` : ''))
  + (r.raw ? `<details><summary>Raw output</summary><pre>${esc(r.raw)}</pre></details>` : '')
  + '</section>';
const rows = cases.map((c, ci) => {
  const original = { title: `${c.target.model} (original)`, stat: `${count(c.target.points)} · ${(c.target.ms / 1000).toFixed(1)} s`, changes: c.target.changes, points: c.target.points,
    removed: c.target.removed, answered: c.target.answered?.map((a) => ({ id: a.id, answer: a.answer })) };
  const cols = [original, ...results[ci]];
  console.log(`utterance ${c.n}: ${cols.map((r) => `${r.title.split('/').pop()} ${r.error ? 'error' : count(r.points)}`).join(' | ')}`);
  return `<section class="case"><div class="said"><span class="stat">Utterance ${c.n} · before: ${count(c.prev?.points || [])}</span><br>${esc(c.text)}</div>
<div class="grid">${cols.map(column).join('')}</div>
<details><summary>Outline before this edit</summary><section class="col">${outlineHTML(c.prev?.points || [])}</section></details>
<details><summary>Input sent to every model (plain)</summary><pre>${esc(c.user)}</pre></details></section>`;
});
const tag = `edits${noThink ? '-nothink' : ''}${variant ? `-${variant}` : ''}`;
const out = writeReport(file, tag, `Edit comparison: ${cases.length} spoken edits${noThink ? ' (thinking off)' : ''}${variant ? `, variant ${variant}` : ''}`,
  `<p class="sub">Each row is one spoken edit, run through draft0's live prompt with the same input the session's model got.${variant === 'reorg' ? ' "+ reorg" columns use the reorganize variant (tools/variants.mjs).' : ''}</p>${rows.join('\n')}`);
console.log(`\nReport: ${out}`);
await openFile(out);
