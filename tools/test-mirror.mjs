// Headless smoke test for mirror.html (the on-device Nano version): runs the page's script in jsdom with a fake Nano
// and the REAL embedding model, replays a .txt or saved session .json at max speed, and prints the main points.
// The fake "clean" step reuses a session's recorded P1 statements when replaying a session file, otherwise splits
// sentences. Roles are always "content", so topic detection exercises only the regex backstop.
// This tests the plumbing (queue, grouping, placement, saving), not Nano's judgment.
// Usage (from tools/, after `npm install`):  node test-mirror.mjs ../sessions/session-live-…json
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const replayPath = path.resolve(process.argv[2] || path.join(ROOT, 'ubuntu.txt'));
const html = fs.readFileSync(path.join(ROOT, 'mirror.html'), 'utf8');
const script = html.match(/<script>\n([\s\S]*)<\/script>/)[1].replace('await import(TRANSFORMERS_URL)', 'await window.__importTransformers()');
const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:8000/mirror.html' });
const w = dom.window;
w.__importTransformers = () => import('@huggingface/transformers');
w.AbortSignal = globalThis.AbortSignal; w.confirm = () => true; w.webkitSpeechRecognition = function () {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isSession = /\.json$/i.test(replayPath);
const RECORDED = isSession ? new Map(JSON.parse(fs.readFileSync(replayPath, 'utf8')).utterances.map((u) => [u.text, u.raw || []])) : new Map();
const counts = {};
const fake = (system) => ({
  async prompt(user, { responseConstraint }) {
    await sleep(2);
    const task = system.startsWith('You clean') ? 'clean' : system.startsWith('You summarize') ? 'label' : system.startsWith('You sort') ? 'place' : 'distill';
    counts[task] = (counts[task] || 0) + 1;
    if (task === 'clean') {
      const p = user.split('Passage to rewrite: "')[1].slice(0, -1);
      const texts = RECORDED.get(p)?.length ? RECORDED.get(p) : p.split(/(?<=[.!?])\s+/).slice(0, 6);
      return JSON.stringify({ statements: texts.map((t) => ({ text: t, role: 'content', title: '' })) });
    }
    if (task === 'label') { const first = user.split('\n1. ')[1].split('\n')[0]; return JSON.stringify({ label: first.split(' ').slice(0, 5).join(' '), summary: first, kind: 'point' }); }
    if (task === 'place') { const ids = responseConstraint.properties.main.enum; return JSON.stringify({ main: ids.includes('new') && Math.random() < 0.35 ? 'new' : ids[0], title: 'New point' }); }
    return JSON.stringify({ title: 'Distilled', text: 'Distilled text.' });
  },
  destroy() {}, clone() { return Promise.resolve(fake(system)); },
});
w.LanguageModel = { availability: async () => 'available', create: async (o) => fake(o.initialPrompts[0].content) };
const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
w.eval(script);
const doc = w.document;
doc.getElementById('speed').value = 'max';
const input = doc.getElementById('replay-file');
const text = fs.readFileSync(replayPath, 'utf8');
Object.defineProperty(input, 'files', { value: [{ name: path.basename(replayPath), text: async () => text }] });
input.dispatchEvent(new w.Event('change'));
for (let i = 0; i < 1200; i++) {
  await sleep(500);
  if (/finished|stopped|failed|done/i.test(doc.getElementById('status').textContent) && /^idle · queue: 0 to clean, 0 groups to label, 0 to place, 0 points to distil/.test(doc.getElementById('queue').textContent)) break;
}
console.log('status:', doc.getElementById('status').textContent, '| errors:', errors.length ? errors : 'none');
console.log('queue :', doc.getElementById('queue').textContent);
console.log('fake Nano calls:', counts);
for (const m of doc.querySelectorAll('.main')) { console.log('#', m.querySelector('h2').textContent.trim()); for (const li of m.querySelectorAll('.stmts li')) console.log('     ', li.textContent); }
console.log('set aside / not yet grouped:', [...doc.querySelectorAll('.side li')].map((l) => l.textContent));
process.exit(0);
