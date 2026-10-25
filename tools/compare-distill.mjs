// Re-runs one Distill from a saved session on several models side by side, using draft0.html's own prompt, schema,
// input builder and patch logic, so the only thing that changes is the model.
// Usage (from tools/):  OPENROUTER_API_KEY=sk-or-… node compare-distill.mjs <session.json> [--distill N] [--fresh] [--models a,b,c] [--no-think] [--variant steps]
//   --distill N  the Distill version to reproduce (default: the second-to-last distill); its input is rebuilt from the
//                version before it, exactly as the page built it
//   --fresh      ignore earlier distills: whole transcript, every point "new" (tests how boldly a model collapses)
//   --models     comma-separated OpenRouter ids; without it you pick from a list
// Writes an HTML page with one column per model next to the session (sessions/ is git-ignored) and opens it. The key is read from the environment only.
import fs from 'fs';
import { loadPage, retiredBefore, line, count, callModel, usageText, pickModels, esc, list, outlineHTML, writeReport, openFile } from './draft0-code.mjs';
import { duplicateQuestions, questionsStep } from './variants.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a) => a.endsWith('.json'));
const key = process.env.OPENROUTER_API_KEY;
const noThink = args.includes('--no-think'); // skip the model's thinking phase
const variant = opt('--variant'); // steps: see variants.mjs
if (!file) { console.error('Usage: OPENROUTER_API_KEY=… node compare-distill.mjs <session.json> [--distill N] [--fresh] [--models a,b]'); process.exit(1); }
const fresh = args.includes('--fresh');

// ---------- rebuild the state just before the chosen distill ----------
const session = JSON.parse(fs.readFileSync(file, 'utf8'));
const distills = session.versions.map((v, i) => (v.distill ? i + 1 : 0)).filter(Boolean);
const D = +(opt('--distill') || distills.at(-2) || distills.at(-1));
const target = session.versions[D - 1];
if (!target?.distill) { console.error(`Version ${D} is not a distill. Distills in this session: ${distills.join(', ')}`); process.exit(1); }
const before = session.versions.slice(0, D - 1);
const prev = before.at(-1);
const S = { ...session, versions: fresh ? before.map(({ distill, ...v }) => v) : before, retired: retiredBefore(before, prev) };
const { DISTILL, DISTILL_SCHEMA, distillInput, parsePatch, applyPatch } = loadPage(S);
const user = distillInput(fresh ? { ...prev, questions: [], looseEnds: [] } : prev, target.upto, line);

const models = await pickModels(opt('--models'));
if (!models.length) process.exit(0);
if (!key && models.some((m) => !m.startsWith('ollama/'))) { console.error('Cloud models need OPENROUTER_API_KEY; ollama/<tag> models run locally without one.'); process.exit(1); }

// ---------- run ----------
console.log(`\nDistill at version ${D} (utterances 1–${target.upto})${fresh ? ', fresh' : ''}. Before: ${count(prev.points)}. Original (${target.model}): ${count(target.points)}.`);
console.log(`Running ${models.join(', ')}${variant ? ` (+ variant ${variant})` : ''}…\n`);
const plain = await Promise.all(models.map(async (model) => {
  const r = await callModel({ key, model, system: DISTILL, user, name: 'distill', schema: DISTILL_SCHEMA, noThink });
  if (r.error) return r;
  try {
    const patch = parsePatch(r.raw);
    return { ...r, patch, ...applyPatch(prev.points, patch), stat: '' };
  } catch (e) { return { ...r, error: `unreadable output: ${e.message}` }; }
}));
// steps: the plain restructure is step 1; step 2 asks for questions and loose ends on its own; code adds duplicate checks.
const stepped = variant !== 'steps' ? [] : await Promise.all(plain.filter((r) => !r.error).map(async (r) => {
  const q = await questionsStep({ key, model: r.model, noThink, points: r.points, distillUser: user, topic: session.topic });
  return { ...r, model: `${r.model} + steps`, raw: `${r.raw}\n\n--- questions step ---\n${q.raw || q.error}`, ms: r.ms + q.ms,
    usage: r.usage && q.usage ? { ...r.usage, prompt_tokens: r.usage.prompt_tokens + q.usage.prompt_tokens, completion_tokens: r.usage.completion_tokens + q.usage.completion_tokens, cost: (r.usage.cost || 0) + (q.usage.cost || 0) } : r.usage,
    questions: [...duplicateQuestions(r.points), ...(q.questions || [])], looseEnds: q.looseEnds || [], leftOut: r.patch.leftOut, error: q.error && `questions step: ${q.error}` };
}));
const results = plain.flatMap((r) => [r, ...stepped.filter((x) => x.model === `${r.model} + steps`)]);

// ---------- report: an HTML page, one column per model ----------
const column = (r) => `<section class="col"><h2>${esc(r.model)}</h2>`
  + (r.error ? `<p class="err">${esc(r.error)}</p>` : `<p class="stat">${esc(r.stat)}</p>`
    + (r.changes || r.patch?.changes ? `<p class="changes">${esc(r.changes || r.patch.changes)}</p>` : '')
    + outlineHTML(r.points)
    + (r.removed?.length ? list('Removed', r.removed.map((x) => `${x.point.title} (${x.reason})`)) : '')
    + list('Open questions', r.questions || r.patch?.questions)
    + list('Loose ends', r.looseEnds || r.patch?.looseEnds)
    + list('Left out', r.leftOut || r.patch?.leftOut))
  + (r.raw ? `<details><summary>Raw output</summary><pre>${esc(r.raw)}</pre></details>` : '')
  + '</section>';
for (const r of results) if (!r.error) r.stat = `${count(r.points)} · ${usageText(r)}${r.note ? ` · ${r.note}` : ''}`;
const original = { model: `${target.model} (original)`, stat: `${count(target.points)} · ${(target.ms / 1000).toFixed(1)} s`, points: target.points, removed: target.removed,
  questions: target.questions, looseEnds: target.looseEnds, leftOut: target.leftOut, changes: target.changes };
const beforeCol = { model: `Before (version ${D - 1})`, stat: count(prev.points), points: prev.points, questions: prev.questions, looseEnds: prev.looseEnds };
const cols = fresh ? results : [original, ...results];
for (const r of cols) console.log(`${r.model.padEnd(45)} ${r.error ? `error: ${r.error}` : r.stat}`);

const out = writeReport(file, `v${D}${fresh ? '-fresh' : ''}${noThink ? '-nothink' : ''}${variant ? `-${variant}` : ''}`, `Distill comparison: version ${D}${fresh ? ' (fresh)' : ''}${noThink ? ' (thinking off)' : ''}${variant ? `, variant ${variant}` : ''}`,
  `<p class="sub">Utterances 1–${target.upto}. Before: ${count(prev.points)}.${fresh ? ' Fresh: whole transcript, every point treated as new.' : ' Points from the previous distill are marked existing.'}</p>
<div class="grid">${cols.map(column).join('')}</div>
<details><summary>Before: the outline that was distilled</summary>${column(beforeCol)}</details>
<details><summary>Input sent to every model</summary><pre>${esc(user)}</pre></details>`);
console.log(`\nReport: ${out}`);
await openFile(out);
