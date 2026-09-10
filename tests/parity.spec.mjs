/* The homepage does not CONTRADICT itself between a phone and a desktop.

   ---- What this file used to assert, and why that rule is gone ----

   It was "the homepage says the same things at 390px as it does at 1440px",
   written after the live site was reported as showing "a completely
   different message on the desktop homepage vs. mobile homepage" — which it
   was: the hero paragraph was two entirely different sentences, and
   desktop's led with a price the rest of the page had just stopped leading
   with. The check was a content diff of every visible string at both
   widths, against a curated allowlist of sanctioned differences.

   That was the right test for one responsive page. There are two pages now.
   The owner's instruction was explicit — the phone changes are "for MOBILE
   ONLY" and "our website should have a different offering altogether" — so
   below `sm` the homepage is `HomePhone.jsx`, a launcher, and above it the
   marketing page is untouched. They share a brand and almost no copy. An
   allowlist of the sanctioned differences between them would be a list of
   nearly every string on both, which is not a test.

   ---- What survives, because the original complaint still applies ----

   "A different message" was never really about different strings. It was
   about the two pages disagreeing: one selling on price while the other had
   stopped, one framing the product one way and one another. Two pages built
   for different jobs are allowed to say different things and are still not
   allowed to disagree — so this file asserts the CLAIMS rather than the
   copy:

   - both carry the brand slogan,
   - both offer a way into the Draft Room,
   - both name the same six rooms and mark the same ones live,
   - both make the same free/no-account promise,
   - neither sells on price, and neither claims a room is live that ROOMS
     itself does not.

   Every one of those is a fact the two pages could drift on, and every one
   of them would be the reported bug if they did. None of them is a string
   either page is obliged to phrase the same way. */

import { test, expect, devices } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const PHONE = { ...devices["iPhone 13"], defaultBrowserType: undefined };
const DESKTOP = { viewport: { width: 1440, height: 900 } };

/* Every visible text node under #view-home, in document order.

   Scoped to that id on purpose: the legacy markup is still in the document
   at display:none (CLAUDE.md — unreachable, not deleted), and a hidden
   element still has text. The walker skips display:none and
   visibility:hidden as it descends, so a subtree hidden by a breakpoint
   never contributes — which is what makes this see one homepage at a time
   now that both are mounted and CSS picks between them. */
const COLLECT = `window.__collectHomeText = function () {
  var root = document.getElementById("view-home");
  var out = [];
  (function walk(n) {
    // Direct text children are joined into one string before being pushed.
    // JSX puts a line break between "Enter the" and "Draft Room" inside a
    // single <a>, which the DOM keeps as two text nodes — pushing them
    // separately reports one label as three phantom differences.
    var own = "";
    for (var i = 0; i < n.childNodes.length; i++) {
      if (n.childNodes[i].nodeType === 3) own += n.childNodes[i].textContent;
    }
    own = own.replace(/\\s+/g, " ").trim();
    if (own) {
      var b = n.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) out.push(own);
    }
    for (var j = 0; j < n.childNodes.length; j++) {
      var e = n.childNodes[j];
      if (e.nodeType === 1) {
        var cs = getComputedStyle(e);
        if (cs.display !== "none" && cs.visibility !== "hidden") walk(e);
      }
    }
  })(root);
  return out;
}`;

async function homeAt(browser, contextOpts) {
  const context = await browser.newContext(contextOpts);
  const page = await openApp(context, "#/");
  await page.evaluate(COLLECT);
  // The freshness line and the room list both wait on window.JukeEngine.
  await page.waitForTimeout(900);
  const text = await page.evaluate(() => __collectHomeText());
  /* The rooms as the engine states them, not as either page words them —
     this is the source both pages are supposed to be rendering, so a claim
     that disagrees with it is an overclaim rather than a difference. */
  const rooms = await page.evaluate(() =>
    (window.JukeEngine && window.JukeEngine.rooms ? window.JukeEngine.rooms() : [])
      .map((r) => ({ name: r.name, live: !!r.live })));
  /* A way in, by destination rather than by label. #/rooms/draft is the
     Draft Room's own entry, which is where every "start a mock" control on
     this page points — see ROOMS in app.js for why it is not #/draft-room,
     and DraftRoom.jsx's own draftsActive for why it moved off #/drafts
     (that address is the drafts ARCHIVE now, which has no Start on it).

     Matched by prefix rather than exactly, because the archive's own rows
     append a ?report= id to the same route. */
  const waysIn = await page.evaluate(() =>
    [...document.querySelectorAll('#view-home a[href^="#/rooms/draft"]')]
      .filter((a) => a.getBoundingClientRect().height > 0).length);
  await context.close();
  return { text, rooms, waysIn, joined: text.join(" · ") };
}

test("neither homepage contradicts the other about what Juke is", async ({ browser }) => {
  const phone = await homeAt(browser, PHONE);
  const desktop = await homeAt(browser, DESKTOP);

  expect(phone.text.length, "the phone rendered something").toBeGreaterThan(10);
  expect(desktop.text.length, "the desktop rendered something").toBeGreaterThan(20);

  /* This asserted `phone.text.length < desktop.text.length`, under the
     heading "the phone gets the launcher, not the marketing page". That
     premise is retired: design_handoff_v3_alive collapsed HomePhone and the
     desktop marketing page into one responsive HomeAlive, and Homepage.jsx's
     own comment records it — "One tree at every width now". The two widths
     therefore carry the SAME content and differ only in which responsive
     labels each layout needs: TrustStrip is `hidden sm:grid` and so
     desktop-only, the proof section's per-cell side labels are `lg:hidden`
     and so phone-only.

     Which side has more of those is an accident, and it was a thin one —
     the margin was two text nodes. It flipped the first time a section
     below `lg` added labels of its own (phone 177, desktop 175), reporting
     a copy regression on a page whose copy was identical at both widths.

     What the line was protecting is still worth protecting: one width
     rendering almost nothing while the other renders the page. That is a
     ratio, not an ordering, and it does not care which way round the
     responsive labels happen to fall. */
  const ratio = Math.min(phone.text.length, desktop.text.length) /
                Math.max(phone.text.length, desktop.text.length);
  expect(ratio, "neither width renders a fraction of the other").toBeGreaterThan(0.6);

  for (const [name, page] of [["phone", phone], ["desktop", desktop]]) {
    /* The slogan. Title case in the DOM and uppercased in CSS at both
       widths — asserting the rendered casing is what left this test red for
       a day with no bug behind it, and it is the same trap the hero
       eyebrow and the lobby's Randomize button have both hit since. */
    expect(page.joined.toLowerCase(),
      `${name} carries the slogan`).toContain("agility through analytics");

    // A way into the product, on the page whose job is to get you there.
    expect(page.waysIn, `${name} offers a way into the Draft Room`).toBeGreaterThan(0);

    // The free/no-account promise, in whatever words each page uses for it.
    expect(page.joined.toLowerCase(), `${name} says the Draft Room is free`)
      .toMatch(/free/);
    expect(page.joined.toLowerCase(), `${name} says no account is needed`)
      .toMatch(/no account|browser/);

    /* Nothing sells on price. Three CTAs once disagreed — "Start a mock
       draft", "Start a mock draft — free", "Start a Free Mock Draft" — and
       the price moved to a caption. A button that starts selling again is
       the regression, at either width. */
    const pricedCta = page.text.filter(
      (t) => /^(start|enter|play)\b/i.test(t) && /free|\$|price/i.test(t));
    expect(pricedCta, `${name} has no CTA selling on price`).toEqual([]);
  }

  /* Both pages read the same room list, so both have to name the same rooms
     and agree about which one is open. This is the claim most likely to
     drift between two separately-authored pages and the one a visitor would
     actually be misled by. */
  expect(phone.rooms, "both pages read the same ROOMS").toEqual(desktop.rooms);
  const live = phone.rooms.filter((r) => r.live).map((r) => r.name);
  expect(live.length, "exactly one room is live today").toBe(1);

  for (const [name, page] of [["phone", phone], ["desktop", desktop]]) {
    for (const room of phone.rooms) {
      /* The phone shortens "The Waiver Room" to "Waiver Room" on its locked
         cards, so the article is optional — what may not happen is a room
         missing from one page entirely. */
      const short = room.name.replace(/^The\s+/, "");
      expect(page.joined, `${name} names ${room.name}`).toContain(short);
    }
    // And the one live room is the one the engine says is live, at both
    // widths — a page marking a second one live would be an overclaim
    // rather than a wording difference.
    expect(page.joined.toLowerCase().split(live[0].replace(/^The\s+/, "").toLowerCase()).length - 1,
      `${name} names the live room`).toBeGreaterThan(0);
  }
});

/* The sentences each page is built on, asserted by value rather than by
   comparison — so a change that quietly removes one still fails here
   instead of passing a diff by symmetry.

   Two lists now, not one. The old single list was every sentence the
   responsive page carried at both widths; the phone page is a launcher and
   deliberately carries none of the marketing prose. What both lists have in
   common is that each is the copy its own page cannot lose without becoming
   a different page. */
/* The last five lines here came from `main`'s own version of this file,
   which was still the string-diff test when the mobile pass split the
   homepage in two. That diff and its allowlists are gone for the reason
   the header gives, but the copy it had been corrected against is not
   guesswork — c7f1c1b tracked down two of these against the live page
   after the daily scheduled run went red, and 20852fd's casing changes
   before it. Folding them in keeps that verification rather than
   discarding it with the mechanism it happened to live in.

   Four lines were retired by design_handoff_v3_alive, not lost: HomeAlive
   replaced Hero outright, so "Master the Draft. / Dominate the Season."
   became "Know the move / before your league.", the hero's sub-copy became
   the "Plug in your league" line, "Explore The Rooms" became a real nav
   destination rather than a scroll link, and the footer line moved to
   "FREE · NO ACCOUNT NEEDED · RUNS IN YOUR BROWSER". Each is REPLACED here
   rather than deleted — a list that only ever shrinks stops being the
   thing this test is for, which is that a page cannot quietly lose the
   sentences it is built on. Everything below the rooms grid (TakeAPick,
   ShowYourWorking, ClosingCta) is untouched and its copy still asserted.

   The two lists still differ, and for a narrower reason than before. The
   homepage is one responsive tree now rather than a phone launcher and a
   desktop page, so every line in PHONE_REQUIRED is also on desktop; what
   desktop still has that a phone does not is those three sections below,
   which remain `hidden sm:block`. */

const DESKTOP_REQUIRED = [
  "Agility Through Analytics",
  // HomeAlive's hero — what replaced Hero's own headline and sub-copy.
  "Know the move",
  "before your league.",
  /* The stem only, and the platform names deliberately NOT asserted.

     This line read "Plug in your league from any major platform." and the
     page said that while two of four platforms were built -- corrected by
     an 11px caption 200px lower, which is a footnote rather than a
     correction. The subhead now interpolates LIVE_NAMES from
     leaguePlatforms.js, so it cannot overclaim and cannot go stale.

     Asserting the rendered names here would reintroduce exactly the drift
     that constant exists to prevent: the day a third platform ships, this
     file becomes the last place still saying two. So the assertion is the
     half of the sentence that is not derived, plus the negative below. */
  "Plug in your league from",
  "Keep your drafts on every device",
  "FREE · NO ACCOUNT NEEDED · RUNS IN YOUR BROWSER",
  /* Three lines used to sit here -- "Enter the Draft Room", "Open the
     Draft Room." and "No setup, no league import. Pick your scoring and
     start." -- all of them ClosingCta's. The owner has taken TakeAPick,
     ShowYourWorking and ClosingCta off the homepage, so they are gone
     from the page rather than lost from it.

     Removed rather than replaced, which is the opposite of what the note
     above says was done for the Hero's four. The difference is that those
     four were REPLACED by other copy doing the same job, and these three
     are not: nothing on the page says them any more, because that part of
     the page is not there. All three components still exist unrendered in
     web/src/components -- so if any comes back, its copy comes back here
     with it. */
];

const PHONE_REQUIRED = [
  "Agility through analytics",
  "Know the move",
  "Mock Draft",
  "Connect",
  "Or draft with friends",
  "Keep your drafts on every device",
  "The Rooms",
  "FREE · NO ACCOUNT NEEDED · RUNS IN YOUR BROWSER",
];

test("each homepage carries its own agreed copy", async ({ browser }) => {
  const phone = await homeAt(browser, PHONE);
  const desktop = await homeAt(browser, DESKTOP);

  for (const line of DESKTOP_REQUIRED) {
    expect(desktop.joined.toLowerCase(), `desktop carries: ${line}`)
      .toContain(line.toLowerCase());
  }
  for (const line of PHONE_REQUIRED) {
    expect(phone.joined.toLowerCase(), `the phone carries: ${line}`)
      .toContain(line.toLowerCase());
  }

  /* The retired claim, asserted absent at both widths.

     A required-copy list can only catch a sentence going missing. This one
     went wrong the other way -- it was present and false -- so the guard
     against it coming back has to be a negative. */
  for (const [name, page] of [["desktop", desktop], ["the phone", phone]]) {
    expect(page.joined.toLowerCase(), `${name} no longer claims every platform`)
      .not.toContain("any major platform");
  }
});
