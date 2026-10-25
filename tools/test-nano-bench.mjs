// Headless smoke test for nano-bench.html: runs the page's script in jsdom with a fake Gemini Nano (LanguageModel)
// and fake embeddings, on a synthetic session (a sample transcript plus spoken edits). Checks that a replay places
// utterances, tidies big points, carries out merge/remove/reorganize commands, and that the edit-case mode runs.
// Usage (from tools/, after `npm install`):  node test-nano-bench.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'nano-bench.html'), 'utf8');
const script = html.match(/<script>\n([\s\S]*)<\/script>/)[1];
const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:8000/nano-bench.html' });
const w = dom.window;
w.AbortSignal = globalThis.AbortSignal;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fake Nano: answers by task (recognised from the system prompt) with simple, valid operations.
const seen = {};
const answer = (task, user) => {
  if (task === 'place') {
    const n = (user.match(/^\d+\. /gm) || []).length;
    if (!n || /second topic/i.test(user.split('New utterance: ')[1])) return { ops: [{ action: 'new', point: 0, title: `Topic ${Date.now() % 1000}`, bullet: user.split('New utterance: ')[1].slice(0, 40), replaces: 0 }] };
    if (/actually/i.test(user.split('New utterance: ')[1])) return { ops: [{ action: 'revise', point: 1, title: '', bullet: 'revised', replaces: 1 }] };
    return { ops: [{ action: 'add', point: 1, title: '', bullet: user.split('New utterance: ')[1].slice(0, 40), replaces: 0 }] };
  }
  if (task === 'tidy') { const b = [...user.matchAll(/^\d+\) (.*)$/gm)].map((m) => m[1]); return { title: user.match(/^Title: (.*)$/m)[1], summary: 'Tidied.', bullets: b.slice(-4) }; }
  if (task === 'command') {
    const said = user.split('What they said: ')[1];
    if (/combine/i.test(said)) return { ops: [{ action: 'merge', points: [1, 2], title: 'Merged', categories: [], find: '', replace: '' }] };
    if (/delete/i.test(said)) return { ops: [{ action: 'remove', points: [1, 99], title: '', categories: [], find: '', replace: '' }] };
    if (/collapse/i.test(said)) return { ops: [{ action: 'tidy', points: [], title: '', categories: [], find: '', replace: '' }] };
    if (/reorgani/i.test(said)) return { ops: [{ action: 'reorganize', points: [], title: '', categories: ['Alpha', 'Beta'], find: '', replace: '' }] };
    return { ops: [{ action: 'none', points: [], title: '', categories: [], find: '', replace: '' }] };
  }
  if (task === 'classify') { const n = (user.split('Bullets:')[1].match(/^\d+\) /gm) || []).length; return { assign: Array.from({ length: n }, (_, j) => j % 3) }; }
};
const taskOf = (sys) => (/tidy one point/.test(sys) ? 'tidy' : /giving an instruction/.test(sys) ? 'command' : /sort outline bullets/.test(sys) ? 'classify' : 'place');
w.LanguageModel = {
  availability: async () => 'available',
  create: async ({ initialPrompts }) => {
    const task = taskOf(initialPrompts[0].content);
    const s = { prompt: async (user, opts) => { seen[task] = (seen[task] || 0) + 1; if (!opts.responseConstraint) throw new Error('no schema'); await sleep(1); return JSON.stringify(answer(task, user)); },
      destroy() {}, clone: async () => s };
    return s;
  },
};
w.EMBED_OVERRIDE = async (texts) => texts.map((t) => { const v = Array.from({ length: 8 }, (_, i) => Math.sin(t.length * (i + 1))); const n = Math.hypot(...v); return v.map((x) => x / n); });

// Synthetic session: sample transcript, with edits and a change of mind mixed in.
const lines = fs.readFileSync(path.join(ROOT, 'tools', 'ubuntu.txt'), 'utf8').split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 18);
lines.splice(4, 0, 'A second topic entirely.');
lines.splice(9, 0, 'Actually no, I was wrong about that first thing.');
lines.splice(12, 0, 'Combine points one and two please.');
lines.splice(15, 0, 'Delete point one.');
lines.push('Please reorganize this around alpha and beta.');
lines.push('Collapse the repeats.');
const utterances = lines.map((text, i) => ({ text, t: i * 5000 }));
const versions = [4, 10, 13, 16, utterances.length].map((upto, k) => ({ upto, points: [{ id: `p${k + 1}`, title: `Cloud ${k + 1}`, summary: 's', bullets: ['x'] }, { id: `p${k + 9}`, title: 'Other', summary: 's', bullets: ['y'] }] }));
const session = { id: 'test', topic: 'Test topic', utterances, versions };

const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
w.eval(script);
const doc = w.document;
await sleep(20);
const file = doc.getElementById('file');
Object.defineProperty(file, 'files', { value: [{ name: 'session.json', text: async () => JSON.stringify(session) }], configurable: true });
file.dispatchEvent(new w.Event('change'));
await sleep(20);
const check = (label, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
const status = () => doc.getElementById('status').textContent;
check('session loads and Nano shows available', /utterances/.test(doc.getElementById('loaded').textContent) && !doc.getElementById('run').disabled, doc.getElementById('loaded').textContent);

doc.getElementById('step').click(); await sleep(100);
check('Step runs one utterance', /1 of/.test(doc.getElementById('pos').textContent) && doc.querySelectorAll('#left .points > li').length === 1);
doc.getElementById('run').click();
for (let i = 0; i < 100 && !/finished|Failed/.test(status()); i++) await sleep(50);
const ops = () => doc.getElementById('ops').textContent;
check('replay finishes without errors', /finished/.test(status()) && !errors.length, `${status()} ${errors.join('; ')}`);
const scrub = doc.getElementById('scrub');
const at = (n) => { scrub.value = n; scrub.dispatchEvent(new w.Event('input')); return ops(); };
check('change of mind revises a bullet', /revise/.test(at(10)), at(10));
check('combine runs a merge and a tidy', /merge 1\+2/.test(at(13)) && /tidy/.test(at(13)), at(13));
check('delete ignores a point number that does not exist', /remove/.test(at(16)) && /don't exist/.test(at(16)), at(16));
check('collapse tidies every point', /tidy all points/.test(at(utterances.length)), at(utterances.length));
check('reorganize sorts bullets into the named categories', /reorganize around: Alpha \/ Beta/.test(at(utterances.length - 1)) && [...doc.querySelectorAll('#left h4')].map((h) => h.textContent).join('|').includes('Alpha'), [...doc.querySelectorAll('#left h4')].map((h) => h.textContent).join('|'));
check('big points get tidied to 4 bullets or fewer', [...doc.querySelectorAll('#left .points > li')].every((li) => li.querySelectorAll('ul li').length <= 5));
check('cloud column shows the matching version', /Cloud \(version after utterance/.test(doc.getElementById('right-head').textContent));

doc.getElementById('edits').click();
for (let i = 0; i < 100 && !/Edit cases done|Failed/.test(status()); i++) await sleep(50);
check('edit cases run on the cloud outline as it was', /Edit cases done: 5 of 5/.test(status()) && /Cloud applied/.test(doc.getElementById('right-head').textContent), status());
console.log('Nano calls by task:', JSON.stringify(seen));
process.exit(0);
