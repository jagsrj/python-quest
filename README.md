# Python Quest

A fun Python course for students in grades 7 to 10. It starts from zero. Learners follow Pip the python through story missions, run real Python in the browser, draw with turtle graphics, and earn XP, streaks and badges. Each mission unlocks the next.

## What's in v1

- **3 worlds, 14 missions:** Launch Pad (print, math, bugs, turtle), Memory Vault (variables, strings, f-strings, input, shapes) and Decision Dungeon (booleans, if/else, elif, random, a Rock Paper Scissors boss).
- **Each mission has** a story intro, short "Learn" steps with runnable code, a quiz, an auto-checked mission and a harder bonus challenge.
- **Two tracks:** Explorer (around grade 7; bonus is optional and hints come sooner) and Challenger (around grade 10; the bonus is needed to unlock the next mission).
- **Python in the browser:** Pyodide runs in a Web Worker. Turtle graphics are drawn on a canvas, `input()` gets an answer box, programs that never finish are stopped after 6 seconds, and errors are explained in plain English.
- **Saved locally or online:** progress is stored in the browser, with several nickname profiles per device (good for siblings or a classroom computer). Learners can also create an account to save progress online and continue on any computer. Teacher mode unlocks every mission.

## Accounts (kid-safe)

Accounts follow the same design as DSA Hero, adjusted for children:

- **Only a username and a password.** No email, real name, birthday or Google sign-in. The sign-up form tells kids not to use their real name.
- **Grown-up check:** sign-up requires ticking "A parent, guardian or teacher said I can make an account" (the server rejects sign-ups without it).
- **Save Code:** at sign-up the learner gets a one-time code (like `PY43-SKH3-SFW2-BDY2`) that resets a forgotten password. The screen asks them to write it down and give it to a grown-up. Resetting signs out every other device.
- **Security:** passwords and Save Codes are hashed with PBKDF2-SHA256; sessions are HMAC-signed HttpOnly cookies (90 days).
- **Sync:** pull, merge, push only when something changed (about 15 s after progress, and when the page is hidden). Merging only moves forward: stars, badges and best streak are combined, the newest code wins per mission, and XP is recalculated from progress so it can't be double-counted.
- **Signing out** removes that learner from the device (their progress stays online), which suits shared classroom computers.
- **Privacy page** at `#privacy`, and **Delete online account** erases everything stored online.

Server code is in `functions/` (Cloudflare Pages Functions): `functions/api/auth/*` and `functions/api/progress.js`.

### One-time Cloudflare setup

1. **Storage:** Cloudflare dashboard → **Storage & Databases → KV → Create namespace**, name it `python-quest-store`. Then open the Pages project → **Settings → Bindings → Add → KV namespace**, variable name **`STORE`**, pick `python-quest-store`, **Save**.
2. **Session secret (recommended):** **Settings → Variables and Secrets → Add**, name `AUTH_SECRET`, type *Secret*, value: any long random string.
3. **Redeploy:** **Deployments → ⋯ on the latest deployment → Retry deployment.** Bindings only apply to new deployments.

Without the `STORE` binding the site still works in this-device-only mode and hides sign-in.

KV's free plan allows 1,000 writes a day. Sign-up costs 2 writes and each sync that changed something costs 1; syncs are batched, which is plenty for families and small classes.

## Project layout

```
src/engine.py            Python runner: stdout capture, input queue, turtle shim, error info
src/lessons.js           All course content and the auto-checks
src/app.js               UI, editor, runner, progress, XP, badges
src/cloud.js             Accounts, Save Code screens, sync and merge, privacy page
functions/               Cloudflare Pages Functions: sign-up, sign-in, reset, account, progress
scripts/dev-server.mjs   Local server: dist/ + the functions with in-memory storage
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
node scripts/dev-server.mjs      # http://localhost:8788 with working accounts (in-memory)
```

## Deploy (Cloudflare Pages)

Build command: `python3 build.py`. Output directory: `dist`.

## Adding a mission

Add an object to `LESSONS` in `src/lessons.js` with `story`, `learn`, `quiz`, `main` and `bonus`. Each `check(t)` calls `await t.run(inputs, seed)` and returns `H.ok()` or `H.no(message)`. Then run the tests.
