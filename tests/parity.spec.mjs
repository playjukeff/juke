/* The homepage does not CONTRADICT itself between a phone and a desktop.

   ---- What this file used to assert, and why that rule is gone ----

   It was "the homepage says the same things at 390px as it does at 1440px",
   written after the live site was reported as showing "a completely
   different message on the desktop homepage vs. mobile homepage" — which it
   was: the hero paragraph was two entirely different sentences, and
   desktop's led with a price the rest of the page had just stopped leading
   with. The check was a content diff of every visible string at both
   widths, against a curated allowlist of sanctioned differences.

   That was the right test for one responsive page, and for a while there
   were two: the owner's instruction was explicit — the phone changes are
   "for MOBILE ONLY" and "our website should have a different offering
   altogether" — so below `sm` the homepage was `HomePhone.jsx`, a launcher,
   and above it the marketing page. They shared a brand and almost no copy,
   and an allowlist of the sanctioned differences would have been a list of
   nearly every string on both, which is not a test.

   **That split is gone twice over and this paragraph described it for
   months after.** Flow v3 collapsed the two into one responsive HomeAlive,
   and the cutover replaced HomeAlive with Now. Measured at both widths on
   the real page, the copy is identical and the only difference is where
   the nav is drawn. So the reason for asserting claims rather than strings
   is no longer that two pages say different things — it is that ONE page
   has two season states, which is a different argument reaching the same
   answer. See the note above REQUIRED.

   ---- What survives, because the original complaint still applies ----

   "A different message" was never really about different strings. It was
   about the two pages disagreeing: one selling on price while the other had
   stopped, one framing the product one way and one another. Two pages built
   for different jobs are allowed to say different things and are still not
   allowed to disagree — so this file asserts the CLAIMS rather than the
   copy:

   - both name the same places,
   - both offer a way into the Draft Room,
   - both make the same free/no-account promise,
   - both make the same read-only promise about somebody's league,
   - neither sells on price, and neither claims more platforms than are
     built.

   Every one of those is a fact the two widths could drift on, and every
   one would be the reported bug if they did. None is a string either width
   is obliged to phrase the same way.

   **Two of that list have been rewritten rather than dropped**, and each
   is argued where it is asserted rather than here, so the reasoning cannot
   go stale separately from the code:

   - "both carry the brand slogan" — the slogan is ARCHIVED (owner's call,
     14 September 2026; it may come back). See REQUIRED.
   - "both name the same six rooms and mark the same ones live" — there are
     five PLACES now rather than six rooms, and Now is not a rooms lobby.
     See the places assertion in the first test. */

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
  /* A way in, by destination rather than by label. #/rooms/draft is the
     Draft Room's own entry, which is where every "start a mock" control on
     this page points — see ROOMS in app.js for why it is not #/draft-room,
     and DraftRoom.jsx's own draftsActive for why it moved off #/drafts
     (that address is the drafts ARCHIVE now, which has no Start on it).

     Matched by prefix rather than exactly, because the archive's own rows
     append a ?report= id to the same route. */
  const waysIn = await page.evaluate(() =>
    [...document.querySelectorAll('#view-home a[href^="#/draft"]')]
      .filter((a) => a.getBoundingClientRect().height > 0).length);
  /* The five places, read off the nav rather than listed here.
     `nav[aria-label="Primary"]` is the same element rail-nav.spec.mjs pins
     to exactly one visible instance per width — desktop renders it in the
     header and a phone as a fixed bar, and `md:flex`/`md:hidden` picks. So
     this reads whichever one is alive, which is what makes comparing the
     two widths mean anything. */
  const places = await page.evaluate(() =>
    [...document.querySelectorAll('#view-home nav[aria-label="Primary"] a')]
      .filter((a) => a.getBoundingClientRect().height > 0)
      .map((a) => (a.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean));
  await context.close();
  return { text, waysIn, places, joined: text.join(" · ") };
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
    /* The slogan was asserted here, at both widths, and it is ARCHIVED
       with the two list entries — see DESKTOP_REQUIRED for the reasoning
       and for the words themselves.

       This was its third copy and the one that would have outlived the
       other two: the lists are read in a loop and this is written out by
       hand, so removing a line from an array leaves it asserted here with
       nothing to say where the third copy went. Worth noticing rather than
       quietly deleting — a fact stated in three places is the
       written-down-twice rule with an extra step, and it is why archiving
       one sentence took three edits.

       What it USED to be about is kept, because it is not about the
       slogan: the DOM carries title case and CSS uppercases it, so
       asserting the rendered casing left this test red for a day with no
       bug behind it. The same trap has since caught the hero eyebrow and
       the lobby's Randomize button. Whatever goes in this slot next gets
       compared lowercased, as everything else here already is. */

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

  /* ---- The five places, which is what the room assertion became ----

     This block read ROOMS off the engine and asserted both pages named all
     six and agreed which one was live. It could not survive the cutover and
     it should not: Now is not a rooms lobby, `#/rooms` is redirected, and
     CLAUDE.md states the shape plainly — there are five PLACES (Now,
     League, Players, Draft, Record) rather than six rooms, with the three
     in-season rooms now tools a call opens. `JukeEngine.rooms()` still
     answers five entries with one live, so the old assertion was not
     reading a stale source; it was asking a question the product had
     stopped answering on this page.

     What the claim was really protecting transfers exactly. It was never
     about rooms — it was that the two widths must not disagree about what
     the product IS, which is the reported bug this whole file exists for.
     The nav is where that now lives.

     Asserted as a COMPARISON against a list read off the page, rather than
     against five names written down here. The old version needed the
     engine's list because it was checking pages against a source; the
     source here is the nav itself, and phone-against-desktop is the whole
     question. So a sixth place ships without touching this file, and a
     place that renders at one width and not the other still fails — which
     a hardcoded array would have got backwards on both counts.

     The floor is what stops that being vacuous: two widths that both
     render no nav at all agree perfectly. It is a floor rather than the
     exact five for the same reason — five is today's answer, and pinning
     it here is how this file went stale the first time. */
  expect(phone.places, "both widths name the same places").toEqual(desktop.places);
  expect(desktop.places.length, "and the nav is actually there")
    .toBeGreaterThanOrEqual(5);
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

/* ---- One list now, not two, and one page in two season states ----

   The two arrays were DESKTOP_REQUIRED and PHONE_REQUIRED, written when the
   phone got a launcher and the desktop got the marketing page. That premise
   retired twice over: Flow v3 collapsed them into one responsive HomeAlive,
   and the cutover replaced HomeAlive with Now. Measured at both widths on
   the real page, the copy is now identical — the only thing that differs is
   where the nav is drawn, which the places assertion above covers and which
   is not copy. Two arrays holding the same sentences is the
   written-down-twice rule with prose in it.

   What replaced them is not the old lists re-aimed. Every line below was
   read off the rendered page rather than off the components, because that
   is the difference between asserting what the page says and asserting what
   somebody believes it says.

   ---- Why some lines are stems ----

   Now has TWO guest states and the nightly decides which: out of season
   `now/Now.jsx`, in season `now/NowSeason.jsx`. They are different pages
   with different headlines, different sub-copy and different calls to
   action, so a line naming either alone writes today's date into an
   assertion — the trap shell-routes.spec.mjs already had to answer by
   naming both headlines. SEASONAL below is lists, and one of each list has
   to be on the page.

   And the in-season headline carries the week number ("Week 1 is here.
   Bring your league."), so the stem is the half that survives week two.
   Same reasoning as the platform names below: assert the part that is not
   derived. */

/* Both widths, both season states, signed out — which is what a keyless
   build renders and therefore all this file can see. */
const REQUIRED = [
  // The freshness strip: this page's claim that its numbers are current.
  "players priced",
  /* The read-only promise, which is the one claim here about what Juke does
     to somebody's league. Punctuation deliberately not asserted: out of
     season it is "Read-only. Juke never edits your league." and in season
     "Read-only — Juke never edits your league ·". */
  "Juke never edits your league",
  /* The method links — the page's own offer to show its working, which is
     the pitch, and the only route to those documents. */
  "How Juke calls it",
  "The draft grade",
  "The small print",
  /* The free/no-account promise in the footer's own words. The CLAIM is
     asserted loosely in the other test (/free/, /no account|browser/); this
     pins the sentence that actually makes it. */
  "runs entirely in your browser",
];

/* One of each list has to be present. Workstream B made the guest home
   ONE page, the landing page, in every phase of the season: it carries the
   week in its eyebrow rather than swapping headlines, so each list is a
   single sentence today. They stay lists so a seasonal variant can come
   back as a real pair. The old sentences are retired by design, not lost:
   "Every call, with the math shown." became the landing's own headline and
   section title, and "A rank tells you who goes first" is the method
   section's support line. */
const SEASONAL = [
  // The headline, whose line break is a <br>, so the stem is asserted.
  ["Every call,"],
  // The supporting line: the claim the whole product makes.
  ["the player your league would start instead"],
  // The primary call to action.
  ["Run a free mock draft"],
];

test("each homepage carries its own agreed copy", async ({ browser }) => {
  const phone = await homeAt(browser, PHONE);
  const desktop = await homeAt(browser, DESKTOP);

  for (const [name, page] of [["desktop", desktop], ["the phone", phone]]) {
    for (const line of REQUIRED) {
      expect(page.joined.toLowerCase(), `${name} carries: ${line}`)
        .toContain(line.toLowerCase());
    }

    /* One of each pair, and the failure names BOTH — a run that reports
       only the state it happened to be in sends the next reader to check
       the wrong component. Which state this is depends on the nightly, so
       the message has to carry that rather than assume it. */
    for (const alts of SEASONAL) {
      const hit = alts.some((a) => page.joined.toLowerCase().includes(a.toLowerCase()));
      expect(hit, `${name} carries one of: ${alts.map((a) => `"${a}"`).join(" or ")}`)
        .toBe(true);
    }
  }

  /* And the two states are not both on screen at once, which is the one
     way this could pass while the page was wrong: a headline from each
     would satisfy every pair above and mean Now had rendered twice. */
  for (const [name, page] of [["desktop", desktop], ["the phone", phone]]) {
    // Only a real pair can be in two states at once; a one-line entry is
    // the same page in every season.
    for (const alts of SEASONAL.filter((a) => a.length > 1)) {
      const both = alts.every((a) => page.joined.toLowerCase().includes(a.toLowerCase()));
      expect(both, `${name} is in one season state, not both: ${alts[0]}`).toBe(false);
    }
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
