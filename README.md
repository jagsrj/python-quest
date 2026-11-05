# Python Quest

A fun Python course for students in grades 7 to 10. It starts from zero. Learners follow Pip the python through story missions, run real Python in the browser, draw with turtle graphics, and earn XP, streaks and badges. Each mission unlocks the next.

## What's in v1

- **3 worlds, 14 missions:** Launch Pad (print, math, bugs, turtle), Memory Vault (variables, strings, f-strings, input, shapes) and Decision Dungeon (booleans, if/else, elif, random, a Rock Paper Scissors boss).
- **Each mission has** a story intro, short "Learn" steps with runnable code, a quiz, an auto-checked mission and a harder bonus challenge.
- **Two tracks:** Explorer (around grade 7; bonus is optional and hints come sooner) and Challenger (around grade 10; the bonus is needed to unlock the next mission).
- **Python in the browser:** Pyodide runs in a Web Worker. Turtle graphics are drawn on a canvas, `input()` gets an answer box, programs that never finish are stopped after 6 seconds, and errors are explained in plain English.
- **Saved locally:** progress is stored in the browser, with several nickname profiles per device (good for siblings or a classroom computer). Teacher mode unlocks every mission.

## Project layout

```
src/engine.py            Python runner: stdout capture, input queue, turtle shim, error info
src/lessons.js           All course content and the auto-checks
src/app.js               UI, editor, runner, progress, XP, badges
src/style.css            Styles
src/index.template.html  Page shell
build.py                 Bundles everything into dist/index.html
test-lessons.mjs         Runs every reference solution (and starter) through the checks
```

## Build and test

```bash
python3 build.py                 # writes dist/index.html
npm i pyodide@0.26.4             # once, for the tests
node test-lessons.mjs            # every solution must pass and every starter must fail
```

## Deploy (Cloudflare Pages)

Build command: `python3 build.py`. Output directory: `dist`.

## Adding a mission

Add an object to `LESSONS` in `src/lessons.js` with `story`, `learn`, `quiz`, `main` and `bonus`. Each `check(t)` calls `await t.run(inputs, seed)` and returns `H.ok()` or `H.no(message)`. Then run the tests.
