// Headless smoke test for draft0.html: runs the page's own script in jsdom with a fake OpenRouter and a
// fake save folder (slow writes, to catch overlapping-save bugs), replays a transcript in Fast mode, and checks
// patch-style updates (unchanged points kept, removals undoable), stable/retired ids, the saved file, and the
// "Allow saving" permission button.
// Usage (from tools/, after `npm install`):  node test-draft0.mjs [ubuntu.txt]
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const replayPath = path.resolve(process.argv[2] || path.join(ROOT, 'tools', 'ubuntu.txt'));
const html = fs.readFileSync(path.join(ROOT, 'draft0.html'), 'utf8');
const script = html.match(/<script>\n([\s\S]*)<\/script>/)[1];
const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:8000/draft0.html' });
const w = dom.window;
w.AbortSignal = globalThis.AbortSignal; w.confirm = () => true; w.webkitSpeechRecognition = function () {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fake OpenRouter, patch-style: one point per 6 utterances. Each call returns only new points plus the newest one,
// so the page must keep the others as they are. Call 4 merges p1 into p2; the first refresh with nothing new removes p2.
const calls = [], created = new Set();
let removedP2 = false;
w.fetch = async (url, opts) => {
  if (url.endsWith('/models')) return { json: async () => ({ data: [{ id: 'anthropic/claude-sonnet-5.5' }, { id: 'anthropic/claude-opus-5.5' }, { id: 'anthropic/claude-sonnet-5.5:batch' }] }) };
  const body = JSON.parse(opts.body);
  calls.push(body);
  const user = body.messages[1].content;
  if (body.response_format.json_schema.name === 'distill') { // reword one point; questions, loose ends, left out
    await sleep(5);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ updated: [{ id: 'p3', title: 'Distilled 3', summary: 's', bullets: ['b'] }], removed: [], order: [], questions: ['Open Q?', 'Second Q?'], looseEnds: ['Loose end'], leftOut: ['filler'], changes: 'distilled' }) } }], usage: { cost: 0.01 } }) };
  }
  const n = Math.max(0, ...[...user.matchAll(/^(\d+)\. /gm)].map((m) => +m[1]));
  const k = calls.length;
  const P = Math.ceil(n / 6);
  const answered = /Open questions:\n- q1: Open Q\?/.test(user) ? [{ id: 'q1', answer: 'the answer' }] : [];
  const updated = [], removed = [];
  for (let i = 1; i <= P; i++) {
    if (i === 1 && k >= 4) continue;
    if (!created.has(i) || i === P) updated.push({ id: `p${i}`, title: `Point ${i}`, summary: `Covers up to utterance ${n}`, bullets: [`b${i}`] });
    created.add(i);
  }
  if (k === 4) removed.push({ id: 'point 1', reason: 'merged into p2' }); // by displayed number, as small models do
  if (/New utterances:\n\(nothing new\)/.test(user) && !removedP2) { removedP2 = true; updated.length = 0; removed.push({ id: 'p2', reason: 'you asked' }); }
  await sleep(5);
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ updated, removed, order: [], answered, topic: k === 1 ? 'Guessed topic' : '', changes: `call ${k}` }) } }], usage: { prompt_tokens: user.length / 4 | 0, completion_tokens: 200, cost: 0.002 } }) };
};
// Fake folder with slow writes.
let disk = null, writes = 0, permission = 'granted';
w.showDirectoryPicker = async () => ({ name: 'sessions',
  queryPermission: async () => permission, requestPermission: async () => (permission = 'granted'),
  getFileHandle: async () => ({ createWritable: async () => { let buf = ''; return { write: async (t) => { buf = t; await sleep(300); }, close: async () => { await sleep(200); disk = buf; writes++; } }; } }) });

const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
w.localStorage.setItem('mirror-cloud.key', 'sk-or-test');
w.eval(script);
const doc = w.document;
await sleep(50);
doc.getElementById('folder').click(); await sleep(50);
doc.getElementById('speed').value = 'max';
const input = doc.getElementById('replay-file');
const text = fs.readFileSync(replayPath, 'utf8');
Object.defineProperty(input, 'files', { value: [{ name: path.basename(replayPath), text: async () => text }] });
input.dispatchEvent(new w.Event('change'));
for (let i = 0; i < 600 && !/finished|stopped|failed/i.test(doc.getElementById('status').textContent); i++) await sleep(100);

const check = (label, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
const dl = []; w.URL.createObjectURL = (b) => { dl.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
doc.getElementById('download').click();
const json = JSON.parse(await new Promise((r) => { const fr = new w.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(dl[0]); }));
check('replay finished without errors', /finished/.test(doc.getElementById('status').textContent) && !errors.length, errors.join('; '));
check('requests use structured output + default model', calls[0].response_format?.json_schema && calls[0].model === 'anthropic/claude-sonnet-5.5');
const lastUser = calls.at(-1).messages[1].content;
check('last request ends at the last utterance, with only a few earlier ones', lastUser.includes(`\n${json.utterances.length}. `) && !/^1\. /m.test(lastUser) && /New utterances:/.test(lastUser), `${json.utterances.length} utterances, ${json.versions.length} versions`);
const finalPts = json.versions.at(-1).points.map((p) => p.id);
const P = Math.ceil(json.utterances.length / 6);
check('points the model left out are kept', finalPts.length === P - 1 && finalPts.every((id, i) => id === `p${i + 2}`), finalPts.join(' '));
check('merged-away p1 never comes back', json.versions.slice(3).every((v) => !v.points.some((p) => p.id === 'p1')) && json.versions[3].removed?.[0]?.reason === 'merged into p2');
check('topic guessed on the first call and sent back after', json.topic === 'Guessed topic' && doc.getElementById('topic').value === 'Guessed topic' && calls[1].messages[1].content.startsWith('Topic (your earlier guess): Guessed topic'));
check('retired id passed back to the model', calls.some((c) => c.messages[1].content.includes('Retired ids (do not reuse): p1')));
doc.getElementById('v-prev').click();
check('version history navigates', /Version \d+ of/.test(doc.querySelector('.vnav span').textContent) && !!doc.getElementById('v-latest'));
await sleep(2500);
const onDisk = JSON.parse(disk);
check('saved file matches final state', onDisk.versions.length === json.versions.length && onDisk.utterances.length === json.utterances.length, `${writes} writes`);
doc.getElementById('v-latest')?.click();
doc.getElementById('refresh').click(); await sleep(100);
const undo = doc.querySelector('.undo[data-id="p2"]');
check('a removal shows with Undo', !!undo && /Removed: Point 2/.test(doc.querySelector('.retired')?.textContent || ''));
undo?.click(); await sleep(50);
check('Undo restores the point in place', doc.querySelector('.points h2')?.textContent.startsWith('Point 2') && /Restored/.test(doc.querySelector('.changes').textContent));
const lastCall = () => calls.at(-1).messages[1].content;
doc.getElementById('distill').click(); await sleep(100);
const d1 = lastCall();
check('first distill sends everything said, all points new', calls.at(-1).response_format.json_schema.name === 'distill' && /Everything they have said:\n1\. /.test(d1) && /"kind": "new"/.test(d1) && !/"kind": "existing"/.test(d1));
check('distill shows as a version with questions (above), loose ends and left out', /distilled/.test(doc.querySelector('.vnav span').textContent) && /Open Q\?/.test(doc.getElementById('questions').textContent) && !doc.getElementById('questions').hidden && /Loose end/.test(doc.querySelector('.notes')?.textContent) && !!doc.querySelector('.leftout') && doc.body.textContent.includes('Distilled 3'));
doc.getElementById('refresh').click(); await sleep(100); // a live version on top of the distill
check('a live update clears an answered question, shown struck through', doc.querySelector('#questions s')?.textContent === 'Open Q?' && /the answer/.test(doc.getElementById('questions').textContent) && /Second Q\?/.test(doc.getElementById('questions').textContent) && !doc.querySelector('.leftout'));
doc.getElementById('distill').click(); await sleep(100);
const d2 = lastCall();
check('second distill marks earlier points existing and sends only what is new', /"kind": "existing"/.test(d2) && /New since the last distill:\n\(nothing new\)/.test(d2) && /Open questions:\n- Second Q\?$/m.test(d2) && !/Everything they have said/.test(d2));
permission = 'prompt'; doc.getElementById('refresh').click(); await sleep(16500);
check('"Allow saving" button appears when permission is lost', !!doc.getElementById('allow-save'));
doc.getElementById('allow-save')?.click(); await sleep(1200);
check('saving resumes after Allow', /saved/.test(doc.getElementById('saved').textContent));
process.exit(0);
