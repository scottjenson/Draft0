// Shared by the compare-* scripts: draft0.html's own prompts, schemas, input builders and patch logic (so a comparison
// changes only the model), an OpenRouter call, model picking, and the HTML report shell.
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENROUTER = 'https://openrouter.ai/api/v1';

// Evaluates the needed pieces of draft0's script against a session-like `S` (utterances, versions, retired, topic).
export function loadPage(S) {
  const src = fs.readFileSync(path.join(ROOT, 'draft0.html'), 'utf8').match(/<script>\n([\s\S]*)<\/script>/)[1];
  const grab = (re, what) => { const m = src.match(re); if (!m) throw new Error(`draft0.html: can't find ${what}`); return m[0]; };
  const fn = (name) => grab(new RegExp(`\\n  function ${name}\\([\\s\\S]*?\\n  }\\n`), name);
  return new Function('S', [
    grab(/  const CONTEXT_UTTS = [^\n]*/, 'CONTEXT_UTTS'),
    grab(/  const EDIT_CUE = [^\n]*/, 'EDIT_CUE'),
    grab(/  const SYSTEM = `[\s\S]*?`;/, 'SYSTEM'),
    grab(/  const DISTILL = `[\s\S]*?`;/, 'DISTILL'),
    grab(/  const POINT = [\s\S]*?\n  const DISTILL_SCHEMA = [\s\S]*?\n  };/, 'schemas'),
    '  const lastDistill = () => S.versions.findLast((v) => v.distill);',
    fn('liveInput'), fn('distillInput'), fn('parsePatch'), fn('applyPatch'),
    '  return { EDIT_CUE, SYSTEM, SCHEMA, DISTILL, DISTILL_SCHEMA, liveInput, distillInput, parsePatch, applyPatch };',
  ].join('\n'))(S);
}

// Ids of points seen before a version that are gone from it: the session's retired list at that moment.
export const retiredBefore = (versions, prev) => [...new Set(versions.flatMap((v) => v.points.map((p) => p.id)))].filter((id) => !prev?.points.some((p) => p.id === id));
export const line = (u, i) => `${i + 1}. ${u.text}`;
export const count = (pts) => `${pts.length} points, ${pts.reduce((n, p) => n + p.bullets.length, 0)} bullets`;

// require_parameters routes only to providers that honour the JSON schema; small models are often served without it.
// noThink asks the provider to skip the model's reasoning (thinking) phase, as a local run would need for speed.
export async function callModel(opts) {
  if (opts.model.startsWith('ollama/')) return callLocal(opts);
  const r = await callOnce(opts);
  // A model without a thinking phase has no provider that takes the setting: retry without it.
  if (opts.noThink && /^404 No endpoints/.test(r.error || '')) return { ...(await callOnce({ ...opts, noThink: false })), note: 'no thinking setting for this model' };
  return r;
}
async function callOnce({ key, model, system, user, name, schema, noThink = false }) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Draft0 (comparison)' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }, provider: { require_parameters: true }, usage: { include: true }, ...(noThink && { reasoning: { enabled: false } }) }),
      signal: AbortSignal.timeout(180000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${body?.error?.message || res.statusText}`);
    return { model, ms: performance.now() - t0, usage: body.usage, raw: body.choices?.[0]?.message?.content || '' };
  } catch (e) { return { model, ms: performance.now() - t0, error: e.message }; }
}
// A model named ollama/<tag> runs on this machine through Ollama's own API: no key, nothing leaves the device.
// Calls are queued one at a time so timings mean something; thinking is off unless asked for, and the context window
// is set explicitly (Ollama's default is small and would cut our inputs off silently).
const OLLAMA = 'http://localhost:11434';
const LOCAL_CTX = 16384;
let localQueue = Promise.resolve();
function callLocal(opts) {
  const run = localQueue.then(async () => {
    const r = await callLocalNow(opts);
    return /does not support thinking/i.test(r.error || '') ? callLocalNow({ ...opts, noThink: null }) : r; // a model without a thinking phase
  });
  localQueue = run.catch(() => {});
  return run;
}
async function callLocalNow({ model, system, user, schema, noThink = true }) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.slice('ollama/'.length), messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        format: schema, ...(noThink !== null && { think: !noThink }), stream: false, options: { num_ctx: LOCAL_CTX } }),
      signal: AbortSignal.timeout(600000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${body?.error || res.statusText}`);
    const usage = { prompt_tokens: body.prompt_eval_count, completion_tokens: body.eval_count,
      load_s: body.load_duration / 1e9, tok_s: body.eval_count / (body.eval_duration / 1e9), prefill_s: body.prompt_eval_duration / 1e9 };
    return { model, ms: performance.now() - t0, usage, raw: body.message?.content || '', note: `local · ${usage.tok_s.toFixed(0)} tok/s · prefill ${usage.prefill_s.toFixed(1)} s${usage.load_s > 1 ? ` · load ${usage.load_s.toFixed(0)} s` : ''}` };
  } catch (e) { return { model, ms: performance.now() - t0, error: e.message }; }
}
export const usageText = (r) => `${(r.ms / 1000).toFixed(1)} s · ${r.usage?.prompt_tokens ?? '?'} in / ${r.usage?.completion_tokens ?? '?'} out${r.usage?.completion_tokens_details?.reasoning_tokens ? ` (${r.usage.completion_tokens_details.reasoning_tokens} thinking)` : ''}${r.usage?.cost ? ` · $${r.usage.cost.toFixed(4)}` : ''}`;

export async function pickModels(arg) {
  if (arg) return arg.split(',').map((s) => s.trim()).filter(Boolean);
  const list = (await (await fetch(`${OPENROUTER}/models`)).json()).data.map((m) => m.id)
    .filter((id) => /^(anthropic|google|openai|x-ai|deepseek|qwen|mistralai|meta-llama|microsoft)\//.test(id) && !/:|image|audio|embed|vision/.test(id)).sort();
  list.forEach((id, i) => console.log(`${String(i + 1).padStart(3)}  ${id}`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const picks = await rl.question('\nModels to compare (numbers or ids, comma-separated): ');
  rl.close();
  return picks.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (/^\d+$/.test(s) ? list[+s - 1] : s)).filter(Boolean);
}

// ---------- HTML ----------
export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const list = (title, items) => `<h3>${title}</h3>${items?.length ? `<ul>${items.map((x) => `<li>${esc(x.text || x)}</li>`).join('')}</ul>` : '<p class="none">(none)</p>'}`;
export const outlineHTML = (points) => `<ol class="points">${points.map((p) => `<li><h4>${esc(p.title)}</h4><p>${esc(p.summary)}</p><ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></li>`).join('')}</ol>`;
export function writeReport(file, tag, title, body) {
  const out = path.join(path.dirname(path.resolve(file)), `compare-${path.basename(file, '.json').slice(-24)}-${tag}-${Date.now()}.html`);
  fs.writeFileSync(out, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
:root { --bg: #f6f7f9; --surface: #fff; --ink: #1b1f24; --muted: #5d6673; --line: #dde2e8; --accent: #3557d6; --bad: #d0453a; --ok: #1f8a4c; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #11151b; --surface: #1a2029; --ink: #e7ebf1; --muted: #9aa5b4; --line: #2b3440; --accent: #7e9bff; --bad: #ff6a5c; --ok: #4cc782; color-scheme: dark; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--ink); font: 14px/1.5 system-ui, sans-serif; }
h1 { font-size: 1.2rem; margin: 0 0 4px; } .sub { color: var(--muted); margin: 0 0 12px; }
.grid { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(300px, 1fr); gap: 12px; overflow-x: auto; align-items: start; }
.col { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.col h2 { font-size: 1rem; margin: 0; color: var(--accent); } .stat { font: 12px ui-monospace, Menlo, monospace; color: var(--muted); margin: 2px 0 6px; }
.changes { font-style: italic; color: var(--muted); }
.points { padding-left: 1.3em; } .points > li { margin-bottom: 10px; } .points h4 { margin: 0; font-size: 0.95rem; } .points p { margin: 2px 0; }
.points ul { margin: 2px 0; padding-left: 1.1em; font-size: 0.9rem; }
h3 { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 12px 0 2px; }
.col > ul { margin: 2px 0; padding-left: 1.1em; font-size: 0.9rem; } .none { color: var(--muted); margin: 0; } .err { color: var(--bad); }
.case { margin: 0 0 28px; } .said { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 8px; padding: 8px 12px; margin: 0 0 10px; }
.removed { color: var(--bad); font-size: 0.88rem; margin: 6px 0 0; }
details { margin-top: 12px; } summary { cursor: pointer; color: var(--muted); } details .col { margin-top: 8px; max-width: 700px; }
pre { white-space: pre-wrap; font: 12px ui-monospace, Menlo, monospace; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
</style></head><body>
<h1>${esc(title)}</h1>
${body}
</body></html>`);
  return out;
}
export async function openFile(out) {
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) (await import('child_process')).spawn('open', [out], { detached: true, stdio: 'ignore' }).unref();
}
