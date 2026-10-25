// Structural variants tried on small models before any of them goes into draft0: the same task, broken into steps a
// small model can do, with code checking the result.
//   reorg: "reorganize around X" gets its own prompt. The model builds the new outline and labels every bullet with
//          the old bullets it came from; code checks that every old bullet was used (or dropped with a reason) and
//          puts back any it missed, so a reorganization can't lose content.
//   steps: Distill as restructure first, then a separate call for open questions and loose ends, then a code check
//          for points that look like duplicates (asked as a question, never merged).
import { callModel } from './draft0-code.mjs';

export const REORG_CUE = /\breorgani[sz]e\b|\borgani[sz]e (this|it|the outline) (by|around)\b/i;

const REORGANIZE = `The speaker asked you to reorganize their outline. Build the new outline they asked for, organized around what they named.

Every bullet in the current outline has a label like 2.3 (point 2, bullet 3). In the new outline:
- Each point has a short title, a one-sentence summary, and bullets.
- Each bullet says which old bullets it comes from (their labels). Combine old bullets that say the same thing into one.
- Use every old bullet. Leave one out only if a later bullet replaces it or it repeats another; then list it in dropped with the reason.
- If some bullets are about the whole topic rather than one of the things they named, keep them in a first overview point.
- Use their words. Do not add ideas of your own.`;
const REORGANIZE_SCHEMA = { type: 'object', additionalProperties: false, required: ['points', 'dropped'], properties: {
  points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'summary', 'bullets'], properties: {
    title: { type: 'string' }, summary: { type: 'string' },
    bullets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'from'], properties: { text: { type: 'string' }, from: { type: 'array', items: { type: 'string' } } } } } } } },
  dropped: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'reason'], properties: { label: { type: 'string' }, reason: { type: 'string' } } } } } };

const QUESTIONS = `Someone has been thinking out loud, and their outline has just been tidied. You get the outline and what they said. List what is still unresolved, in their terms.
- questions (at most 4): undecided choices, contradictions they never settled, things they said they still need to figure out, and anything specified for some items but not for others. Not advice and not new topics.
- looseEnds (at most 4): odd or specific details they mentioned that the outline doesn't cover but might matter later.
Return empty lists if there is nothing.`;
const QUESTIONS_SCHEMA = { type: 'object', additionalProperties: false, required: ['questions', 'looseEnds'], properties: {
  questions: { type: 'array', items: { type: 'string' } }, looseEnds: { type: 'array', items: { type: 'string' } } } };

const parse = (raw) => { try { return JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (!m) throw new Error('model returned no JSON'); return JSON.parse(m[0]); } };

// ---------- reorg ----------
export async function reorganize({ key, model, noThink, prevPoints, said }) {
  const labels = prevPoints.flatMap((p, i) => p.bullets.map((b, j) => ({ label: `${i + 1}.${j + 1}`, text: b })));
  const user = `Current outline:\n${prevPoints.map((p, i) => `${i + 1}. ${p.title}\n${p.bullets.map((b, j) => `   ${i + 1}.${j + 1} ${b}`).join('\n')}`).join('\n')}\n\nWhat they said:\n${said}`;
  const r = await callModel({ key, model, system: REORGANIZE, user, name: 'reorganize', schema: REORGANIZE_SCHEMA, noThink });
  if (r.error) return r;
  let out;
  try { out = parse(r.raw); } catch (e) { return { ...r, error: `unreadable output: ${e.message}` }; }
  const used = new Set((out.points || []).flatMap((p) => (p.bullets || []).flatMap((b) => b.from || [])).map(String));
  const dropped = (out.dropped || []).filter((d) => labels.some((l) => l.label === String(d.label)));
  const missing = labels.filter((l) => !used.has(l.label) && !dropped.some((d) => String(d.label) === l.label));
  const points = (out.points || []).map((p, i) => ({ id: `r${i + 1}`, title: String(p.title || ''), summary: String(p.summary || ''), bullets: (p.bullets || []).map((b) => String(b.text || '')).filter(Boolean) }));
  if (missing.length) points.push({ id: 'r-missing', title: 'Not yet placed (put back by code)', summary: 'Old bullets the reorganization left out without a reason.', bullets: missing.map((l) => l.text) });
  const covered = labels.length - missing.length;
  return { ...r, points, removed: [], changes: `Reorganized; ${covered} of ${labels.length} old bullets accounted for${dropped.length ? `, ${dropped.length} dropped with a reason` : ''}${missing.length ? `, ${missing.length} put back by code` : ''}.`,
    dropped: dropped.map((d) => `${d.label} ${labels.find((l) => l.label === String(d.label)).text} — ${d.reason}`) };
}

// ---------- steps ----------
const STOP = new Set('a an and the of for to in on with by is are their its it his her what how why who which professions profession point points'.split(' '));
const words = (t) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)));
// Two points whose titles share most of their words (or one's words are all in the other's) may be the same thing.
export function duplicateQuestions(points) {
  const qs = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const a = words(points[i].title), b = words(points[j].title);
    const shared = [...a].filter((w) => b.has(w)).length;
    if (shared && (shared === Math.min(a.size, b.size) || shared / new Set([...a, ...b]).size >= 0.5))
      qs.push(`Points ${i + 1} and ${j + 1} ("${points[i].title}" and "${points[j].title}") may cover the same ground. Combine them?`);
  }
  return qs;
}
export async function questionsStep({ key, model, noThink, points, distillUser, topic }) {
  const said = distillUser.split(/\n\n(?=Earlier utterances|Everything they have said)/).slice(1).join('\n\n');
  const user = `${topic ? `Topic: ${topic}\n\n` : ''}Outline:\n${points.map((p, i) => `${i + 1}. ${p.title}: ${p.summary}\n${p.bullets.map((b) => `   - ${b}`).join('\n')}`).join('\n')}\n\n${said}`;
  const r = await callModel({ key, model, system: QUESTIONS, user, name: 'questions', schema: QUESTIONS_SCHEMA, noThink });
  if (r.error) return r;
  try { const o = parse(r.raw); return { ...r, questions: (o.questions || []).map(String).slice(0, 4), looseEnds: (o.looseEnds || []).map(String).slice(0, 4) }; }
  catch (e) { return { ...r, error: `unreadable output: ${e.message}` }; }
}

// ---------- compact ----------
// The live update as small operations on labelled points (1, 2, 3) and bullets (2.1, 2.2). The model never sees ids
// and never re-writes text it isn't changing, so output stays short (speed) and ids can't be garbled (accuracy).
// Labels refer to the outline as given; new points are numbered after the existing ones in the order created.
const COMPACT = `You keep a live outline of what someone says while thinking out loud. You get the outline (points numbered 1, 2, 3; bullets labelled 2.1, 2.2 and so on), any open questions, a few earlier utterances for context, and what they said since. Return only the edits the new utterances call for, as a short list of operations. Everything you don't touch stays exactly as it is.

The outline is their main points, merged and clarified: 3 to 8 points, each with a short title, a one-sentence summary and a few bullets. Put new material in the point it belongs to; organize by idea, not by time. When they change their mind, edit the bullet to their latest position. Leave out filler, asides and talk about the session itself. Do not add ideas of your own. The transcript has speech-recognition errors; read through them.

Operations. Numbers and labels refer to the outline as given, before any of your changes; new points are numbered after the existing ones, in the order you create them.
- add: a new bullet (text) in point "point".
- new: a new point with a title and its first bullet (text).
- edit: replace bullet "point"."bullet" with text.
- drop: delete bullet "point"."bullet" (a repeat, or a position they replaced).
- move: move bullet "point"."bullet" to point "to".
- merge: merge point "point" into point "to".
- remove: delete point "point"; text = why.
- rename: give point "point" a new title.
- summary: give point "point" a new summary (text).
Use 0 and "" for fields an operation doesn't need.

When they talk about the outline itself ("combine two and three", "delete point one", "reorganize around these", "collapse the repeats"), carry it out fully with these operations. Speech recognition may write "point one" as "0.1". Act only on the new utterances; the earlier ones are context and already in the outline. A number mentioned in passing is not an instruction.
answered: open questions the new utterances answer (q = its number; answer = their answer in a few words).
changes: one short sentence on what you did.`;
const COMPACT_SCHEMA = { type: 'object', additionalProperties: false, required: ['ops', 'answered', 'changes'], properties: {
  ops: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['op', 'point', 'bullet', 'to', 'title', 'text'], properties: {
    op: { type: 'string', enum: ['add', 'new', 'edit', 'drop', 'move', 'merge', 'remove', 'rename', 'summary'] },
    point: { type: 'integer' }, bullet: { type: 'integer' }, to: { type: 'integer' }, title: { type: 'string' }, text: { type: 'string' } } } },
  answered: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'answer'], properties: { q: { type: 'integer' }, answer: { type: 'string' } } } },
  changes: { type: 'string' } } };

export function compactInput(prev, liveUser, topic) {
  const pts = prev?.points || [];
  const said = liveUser.slice(liveUser.search(/\n\n(Earlier utterances|New utterances)/));
  return `${topic ? `Topic: ${topic}\n\n` : ''}Outline:\n${pts.length ? pts.map((p, i) => `${i + 1}. ${p.title} — ${p.summary}\n${p.bullets.map((b, j) => `   ${i + 1}.${j + 1} ${b}`).join('\n')}`).join('\n') : '(none yet)'}`
    + (prev?.questions?.length ? `\n\nOpen questions:\n${prev.questions.map((q, i) => `q${i + 1}. ${q.text}`).join('\n')}` : '') + said;
}

// Applies the operations in code. Bad references are skipped and logged, never guessed.
export function applyOps(prevPoints, ops) {
  const pts = prevPoints.map((p) => ({ id: p.id, title: p.title, summary: p.summary, gone: false, bullets: p.bullets.map((text) => ({ text, gone: false })) }));
  const log = [], removed = [];
  const P = (n) => (pts[n - 1] && !pts[n - 1].gone ? pts[n - 1] : null);
  const B = (n, k) => { const b = P(n)?.bullets[k - 1]; return b && !b.gone ? b : null; };
  let made = 0;
  for (const o of ops) {
    const p = P(o.point), b = B(o.point, o.bullet), to = P(o.to), text = (o.text || '').trim();
    const skip = (why) => log.push(`skipped ${o.op} ${o.point}${o.bullet ? `.${o.bullet}` : ''}${o.to ? `→${o.to}` : ''}: ${why}`);
    if (o.op === 'add') { if (!p) skip('no such point'); else if (!text) skip('empty'); else p.bullets.push({ text, gone: false }); }
    else if (o.op === 'new') { if (!o.title && !text) skip('empty'); else pts.push({ id: `c${++made}`, title: o.title || text, summary: '', gone: false, bullets: text ? [{ text, gone: false }] : [] }); }
    else if (o.op === 'edit') { if (!b) skip('no such bullet'); else if (!text) skip('empty'); else b.text = text; }
    else if (o.op === 'drop') { if (!b) skip('no such bullet'); else b.gone = true; }
    else if (o.op === 'move') { if (!b || !to) skip('no such bullet or target'); else if (to === p) skip('same point'); else { b.gone = true; to.bullets.push({ text: b.text, gone: false }); } }
    else if (o.op === 'merge') { if (!p || !to || p === to) skip('bad points'); else { to.bullets.push(...p.bullets.filter((x) => !x.gone).map((x) => ({ text: x.text, gone: false }))); p.gone = true; removed.push({ id: p.id, point: p, reason: `merged into ${to.title}` }); } }
    else if (o.op === 'remove') { if (!p) skip('no such point'); else { p.gone = true; removed.push({ id: p.id, point: p, reason: text || 'removed' }); } }
    else if (o.op === 'rename') { if (!p || !o.title) skip('no such point or no title'); else p.title = o.title; }
    else if (o.op === 'summary') { if (!p || !text) skip('no such point or no text'); else p.summary = text; }
    else skip('unknown op');
  }
  const points = pts.filter((p) => !p.gone).map((p) => ({ id: p.id, title: p.title, summary: p.summary, bullets: [...new Set(p.bullets.filter((x) => !x.gone).map((x) => x.text))] }));
  for (const p of points.filter((x) => !x.bullets.length)) log.push(`point "${p.title}" left empty and dropped`);
  return { points: points.filter((p) => p.bullets.length), removed: removed.map((r) => ({ ...r, point: { ...r.point, bullets: r.point.bullets.map((x) => x.text) } })), log };
}

export async function compact({ key, model, noThink, prev, liveUser, topic }) {
  const r = await callModel({ key, model, system: COMPACT, user: compactInput(prev, liveUser, topic), name: 'compact', schema: COMPACT_SCHEMA, noThink });
  if (r.error) return r;
  let o;
  try { o = parse(r.raw); } catch (e) { return { ...r, error: `unreadable output: ${e.message}` }; }
  const { points, removed, log } = applyOps(prev?.points || [], o.ops || []);
  const answered = (o.answered || []).flatMap((a) => (prev?.questions?.[a.q - 1] ? [{ id: prev.questions[a.q - 1].id, answer: a.answer }] : []));
  return { ...r, points, removed, answered, log, changes: `${o.changes || ''} (${(o.ops || []).length} operations${log.length ? `; ${log.length} skipped or dropped` : ''})` };
}
