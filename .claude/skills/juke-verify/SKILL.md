---
name: juke-verify
description: Juke's verification routine — prove a change works before reporting it done, and rule out the harness before believing a red run. Use when finishing a change to app.js, draft-engine.js, room.js, the worker or web/src; when a test fails and the cause is not obvious; when a Playwright run goes red in a way that describes a fault in something nobody changed; or when confirming a merged change is actually live.
---

# Verifying a change in Juke

CLAUDE.md holds the reasoning. This is the order to do things in, at the moment
it matters. Read the matching CLAUDE.md section before changing anything this
skill tells you to check.

## 1. Rule out the harness first

This repository has recorded **seven** separate incidents where a real,
reproducible symptom was the tooling rather than the code — and each one cost
hours, because a confident wrong diagnosis is what this failure mode produces.
Run these before believing any red result.

**The tell:** the failure describes a fault in something nobody touched, or
input going somewhere unexpected, rather than a value that moved.

- **Is another session sharing this checkout?** Two are common here. Check
  `git status -sb` and the ports below. Stage explicit paths, never the tree —
  `git add -A`, `git add .` and the writing forms of `git stash` have each
  eaten another session's uncommitted work.
- **What is actually being served?** The suite serves `web/dist`, and
  `reuseExistingServer` adopts anything already on the port — including another
  checkout's build, which skips the rebuild entirely.
  ```bash
  curl -s "http://localhost:8765/app.js?cb=1" | grep -c "<a symbol your change adds>"
  ```
  Zero means you are measuring a stale bundle, not a broken change.
- **Is `wrangler dev` up?** Eight specs fail with `ECONNREFUSED
  127.0.0.1:8787` when it misses its 120s startup window. The readiness probe
  is the same one `playwright.config.mjs` uses — our worker answers **403**
  there and a stray server answers 404:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8787/news?id=1"
  ```
- **Orphaned processes?** A killed run leaves `wrangler dev`/`workerd` alive
  and respawning. `pkill` from Git Bash reports success and kills nothing —
  use PowerShell: `Get-Process workerd | Stop-Process -Force`, plus the
  `node.exe` whose command line contains `wrangler`.
- **`preview_start` serves the repo root, not your worktree.** It produced
  eight consecutive measurements of a bundle that was not under test. Measure
  from a worktree with Playwright, never a preview port.
- **Did another session edit `tailwind.config.js`?** A long-lived `vite dev`
  does not reload it, and missing tokens fall through to Tailwind's own
  `#e5e7eb` — which reads as a design regression, not a stale server.
- **Baseline before attributing.** Revert your files, rebuild, re-run the same
  specs. That is the difference between "my change broke four tests" and "four
  tests were already red."

## 2. Run the suites that fit the change

| Changed | Run |
|---|---|
| `draft-engine.js`, `room.js` | `py scripts/test_engine.py` |
| `build_players.py`, the crosswalk | `python scripts/test_crosswalk.py` |
| `worker/store.js`, a migration | `python scripts/test_schema_ladder.py`, `python scripts/test_history_ownership.py` |
| `worker/auth.js`, the `/me` routes | `node worker/test-verified-user.mjs`, `node worker/test-me-routes.mjs` |
| sockets, the Durable Object | `wrangler dev --port 8787 --local`, then `node worker/test-sockets.mjs` |
| `style.css` (after moving a block) | `python scripts/check_css.py` — brace **depth**, not a brace count |
| anything in the browser | `npx playwright test` (≈16–22 min, 24 spec files) |

**Disable the HTTP cache when putting a bug back for one run.** `app.js?v=` is
a fixed address between deploys, so an edited `app.js` may be served from
cache — five mutations in a row once measured a mixture of both files and
looked like a suite with no discrimination at all.

**Do not rebuild into `web/dist` while a run is using it**, and do not pipe the
run into `tee` — a pipeline's exit status is the last command's, so a red run
reports 0.

## 3. Drive a real draft

Through the **Start button**, and assert `state.started` afterwards. Calling
`autoDraftRest()` from the console drafts a full board whether or not a draft
was ever started, so a harness that skips the button "passes" configurations
the app refuses.

Default shape: **140 picks, 140 distinct players, 14 a team**, snake order
intact, and every seat holding exactly the kicker and defense the format
starts. Then a second shape — 12 teams, 15 rounds, full PPR, **bench 6** — and
180 picks, 15 a team. Then a **superflex** draft, and check that holding the
quarterback the format obliges you to hold does not *cost* build points.

Open the Analysis tab **mid-draft as well as at the end**. A component written
for a finished roster behaves least like itself three rounds in, and that is a
state every user passes through.

## 4. Read what the screen says, not only what the code computed

Half the bugs in this repo's history were right values in the wrong place: a
pick number labelled with a seat, starter strength printed under a column of
totals, a fraction promising a limit that does not exist. None of them are
reachable by asserting on computed values.

For the grade specifically, print the **spread** of each component across the
room before believing it works — roster construction sat at exactly 100 for all
ten teams for every draft the app had ever graded. Then reconcile the total
against its own parts, and scrape the rendered table and compare it to the
numbers behind it.

Sweep for `NaN` **case-sensitively**: `/nan/i` matches the running back
Monangai, and Keenan Allen.

## 5. Prove it is live, do not infer it

- **Ask with a query string.** `curl "https://jukeff.com/<path>?cb=1"` misses
  the edge cache and reaches the origin. A bare URL has returned **200 from an
  entry whose origin no longer existed**.
- **Ask the database, not the response.** A worker change that is merged but
  not deployed, or deployed against an unmigrated schema, looks exactly like
  one that is working. `deploy-worker.yml` ships the code on a push;
  **migrations and secrets are still manual**.
- **A 200 proves the token, not the table.** Read the body.
- A browser tab you already had open may disagree with `curl`. That is the tab,
  not the deploy.

## 6. Before you say it is done

- Did you bump `?v=` in `web/index.html`, `404.html` and the how-it-works and
  legal pages, if you changed a file they load?
- Did the change alter what the product *is* rather than how it looks? Then
  grep the prose for what you just built — the privacy policy opened with
  "Juke has no accounts" for weeks after accounts shipped, and nothing failed.
- Does any new control actually do something? A dead control renders,
  contrasts, throws nothing and passes every check this project runs. The only
  thing that finds one is pressing it.
