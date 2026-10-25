# Draft0

This project is an experiment to find an alternative to "brainstorming with an LLM." I find the experience productive, but it isn't really brainstorming; I'm only talking to myself. This prototype explores two dimensions of that problem.

First, try to make it run entirely on local models? Second, what if it leaned into a self-reflective, talking-to-yourself metaphor rather than pretending to talk to another person? It listens to you speak using on-device speech-to-text, gathers the input, organizes it into a clear outline, and feeds it back so you can see what you've actually said.

You can ramble quite a bit, and it will collect the ideas together so you can interact with this intermediate artifact. The goal is to generate an early working draft, prompting you to reflect and think harder about what your idea should become. The guiding principle is simple: you're not talking to an AI, you're talking to yourself.

## The goal: entirely on-device

This version uses a local speech to text engine to capture all the text, but it does use a cloud model to process that text. That's clearly against the goal, but I am trying to validate the UX concept first and not fight local models that aren't ready yet. Once I've determined that this is actually a good idea and working well, I will try to find a way of using better local models.

I did try using the included local model in Chrome, Google Nano, and it was just not up to the task. 

The original suboptimal on-device prototype is preserved at the git tag [`nano-prototype`](../../tree/nano-prototype).

## Status

An early prototype, used by its author for real sessions.

- **Speech:** on-device, through the browser's Web Speech API.
- **Outline:** a cloud model (default: Claude Sonnet) through [OpenRouter](https://openrouter.ai). The model sees the current outline and what you just said, and returns only the points that changed. Edits by voice are sent right away.
- **Safety net:** nothing disappears unless it's explicitly removed, and every removal has an Undo. Every outline version is kept, so you can step back through them.

## Running it

1. In this folder, run `python3 -m http.server`.
2. Open `http://localhost:8000/draft0.html` in desktop Chrome. It must be a normal tab, because the microphone is blocked in iframes and previews.
3. Paste an OpenRouter API key into the page. **The key is stored only in your browser's localStorage.** It is never written to any file and is only sent to OpenRouter.
4. Press **Talk**.

Sessions can be saved to a folder you pick, or downloaded as JSON, and replayed later.

## Layout

- `draft0.html`: the whole app. A single file with no build step.
- `tools/`: headless tests (jsdom with a fake model), a session analyser, and two sample transcripts. See `tools/README.md`.
- `docs/LEARNINGS.md`: running notes on what worked and what didn't, including the lessons from the on-device attempt.
- `CLAUDE.md`: working notes for Claude Code, which is used to build this.
