/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B0E14',
        charcoal: '#151923',
        teal: {
          // Continues the same +10%-lightness-per-step pattern 400/500/600
          // already use (hue 186, 100% saturation throughout — 40/50/60%
          // lightness) — not picked separately. Added because text-teal-300
          // was in real use (AnalysisTab.jsx, DraftBoardGrid.jsx) with no
          // 300 defined here, so it silently fell back to Tailwind's own
          // stock teal-300 (a different, more green hue) instead of brand
          // teal — the same "one color, two answers" drift this project
          // has already found and fixed for the position palette.
          300: '#66F0FF',
          DEFAULT: '#00E5FF',
          400: '#33EAFF',
          500: '#00E5FF',
          600: '#00B8CC',
        },
        purple: {
          DEFAULT: '#7B1FA2',
          400: '#9A3FC0',
          600: '#5E1780',
        },
        // Homepage-only secondary accents, from the Claude Design v2 handoff
        // (design_handoff_homepage_v2). Deliberately not a CTA/state colour —
        // every button, "Live" pill and the logo still read teal/purple
        // above, exactly as the Draft Room does. mint/skyblue are decorative
        // only: the hero overline, background glow, the odd label. They must
        // never touch a position chip — POS_BADGE (draftRoomPositions.js) is
        // documented as "the one hue reference for the whole site now, not
        // just the draft room," already shared by this same homepage's
        // ShowYourWorking.jsx, and introducing a second RB/WR colour here
        // would be exactly the "a position reads a different colour
        // depending which page you're looking at" bug that file was
        // rewritten once already to end.
        // #74E5CE as of the homepage cosmetic revision (design_handoff_
        // homepage_cosmetic) — was #5eead4. Converted from the handoff's
        // own oklch(0.85 0.11 178) rather than eyeballed; only three files
        // read this token (Hero.jsx, PhaseRail.jsx, RoomsGrid.jsx), all
        // homepage-only, so redefining in place is safe.
        mint: '#74E5CE',
        skyblue: '#38bdf8',
        // ---- Homepage cosmetic revision (design_handoff_homepage_cosmetic) ----
        // §1's four surface steps, converted from oklch(L 0.012 265) via the
        // real OKLab matrices, not approximated against an existing token —
        // the handoff is explicit that several of these changes exist
        // specifically to widen tonal separation between surfaces, so a
        // "close enough" substitution would defeat the point. Nested rather
        // than four more flat tokens: `surface.page/nav/card/row` reads as
        // one related step-scale, the same shape `slate.*` already uses for
        // the Draft Room's own ground/panel/sunk/rule steps — and it keeps
        // the marketing-only surface system visually distinct in this file
        // from the Draft Room's, which is the whole reason two separate
        // ground systems (`void` vs `slate`) exist here in the first place.
        surface: {
          page: '#0D0F15', // oklch(0.17 0.012 265)
          nav: '#111419', // oklch(0.19 0.012 265)
          card: '#13161C', // oklch(0.20 0.012 265)
          row: '#1A1C22', // oklch(0.225-0.23 0.012 265), midpoint 0.2275
        },
        // Hairline border and subtle divider — kept apart from `surface`
        // above (a border is not a fill) but named to sit next to it.
        line: {
          hairline: '#252930', // oklch(0.28 0.015 265)
          divider: '#1E2229', // oklch(0.24-0.26 0.015 265), midpoint 0.25
        },
        // ---- Flow v3 "Alive" (design_handoff_v3_alive) ----
        //
        // The accents this handoff adds that no existing token covers. Every
        // one of them is decorative or a state mark — none is a CTA colour,
        // because the CTA in this handoff is a gradient (see `.cta-alive` in
        // index.css) rather than a flat hue, and the one-primary-action rule
        // this project has held since the rebrand is unchanged by it.
        //
        // Deliberately NOT added: the handoff's own near-duplicates of
        // tokens that already exist. Its border #232A33 is `line.hairline`
        // (#252930), its page/nav/card grounds are `surface.*`, its body and
        // muted inks are `voidInk.*`, and its position tiles (WR #BFD3F5,
        // TE #F7D9A8) are POS_CHALK — which the handoff's README itself
        // defers to ("per repo"). A second value one step off an existing
        // one is the "a position reads a different colour depending which
        // page you're on" drift that draftRoomPositions.js was rewritten to
        // end, arriving through a design file instead of through code.
        flow: {
          // The three accents with no home in the palette. Named by hue
          // rather than by role because each one is a *room's* identity —
          // Trade is lavender, League is gold — and a room is not a state.
          blue: '#82A1F6',
          lavender: '#CDBDEF',
          gold: '#F7D9A8',
          // Negative. Distinct from Tailwind's own rose-* family, which is
          // a different hue; this is the handoff's value and it sits beside
          // `mint` as its opposite (a bye week, a ▼ in the power column).
          rose: '#F7A8A8',
          // The third state colour, and the only one the palette had no
          // answer for. `mint` is already this codebase's positive and
          // `rose` its negative (the comment above says so); a verdict can
          // also be neither — "inconclusive", "circumstances changed",
          // "recommendation changed" — and those are a warning rather than
          // a result.
          //
          // NOT `flow.gold`, which is four lines up and looks like it would
          // do: gold is the League Room's identity, and this group's own
          // opening comment is that a room is not a state. Spending an
          // identity on a state is how a colour comes to mean two things,
          // which is the drift draftRoomPositions.js was rewritten to end.
          //
          // Juke Journey v3's own `--warn`. Measured on all three grounds a
          // verdict badge can land on: 8.40 on #161D26, 7.47 on flow.hero,
          // 8.73 on surface.card.
          amber: '#E7AC4B',
          // The lit half of the CTA gradient, and the only place this value
          // appears alone: the avatar circle's own gradient start. It is a
          // step off `teal` (#00E5FF) rather than a second teal — solving
          // for a gradient that lands on `blue` above, not for a new brand
          // colour, which is why it is in here and not in `teal.*`.
          cyan: '#44D4E2',
          // The mint lozenge under an active nav tab and the "N CLAIMS"
          // badge. Opaque rather than `mint/15`: it sits on two different
          // grounds (the nav pill's blurred rgba and a card's #151920) and
          // an alpha tint reads as two different colours across them.
          mintDark: '#12302e',
          // The two raised surfaces above `surface.card`. `tile` is the
          // 42px icon square on a room card and the metric block on the
          // decision card; `hero` is the room hero's own ground, which the
          // accent wash is laid over. They are one step apart and both are
          // above anything in `surface.*`.
          tile: '#1E2530',
          hero: '#1E2733',
          // The kickoff pill, which is its own surface/border pair and
          // matches nothing else — a chrome element sitting in the header's
          // own translucent ground, so it cannot borrow `surface.nav`.
          pill: '#1A1F27',
          pillEdge: '#2A3138',
        },
        // Body text on the `surface.*`/void ground, raised from the old
        // `text-white/NN` opacity system (§9's own contrast audit already
        // found /25 through /45 failing 4.5:1 against these near-black
        // cards — see TakeAPick.jsx's MUTED comment). Named `voidInk`
        // rather than reusing `ink.*` above: that group is documented as
        // text on the Draft Room's `slate` ground specifically ("A value
        // tuned against #070A0D does not hold at #1E2733") — a second,
        // unrelated set of tokens under the same name would read as one
        // scale when it is measured against a completely different ground.
        voidInk: {
          primary: '#EDEEF2', // oklch(0.95 0.005 265)
          body: '#B9BCC1', // oklch(0.78-0.81 0.008 265), midpoint 0.795
          /* Lifted from #808389 on 9 September 2026, because it missed the
             project's own 4.5:1 floor on the darkest ground it lands on:
             measured 4.481 against surface.row (#1A1C22), on the four
             Practice Scenarios sublines at 13px, at both widths.

             Set from the WORST surface upward, which is the rule this
             ramp already follows in both themes -- not tuned against the
             card it was noticed on. Against the four grounds it actually
             meets it now measures 5.47 / 5.17 / 5.03 / 4.86 (page, card,
             raised card, row) where it measured 5.04 / 4.77 / 4.64 / 4.48.

             Nothing light names this token -- checked across all 70 call
             sites -- so lifting it can only raise contrast, never lower
             it somewhere else. That check is the one CLAUDE.md asks for
             whenever a token moves. */
          muted: '#868990', // oklch(~0.635 0.01 265)
        },
        // ---- The two-surface split (Claude Design, "Slate & Mint") ----
        //
        // Marketing surfaces stay on `void`. App surfaces — lobby, draft
        // room, cockpit, insights — move to `slate`. The reasoning is that
        // the two are looked at differently: a marketing or scores page is
        // scanned in bursts and has to host thirty-two team palettes, so
        // near-black is the only ground that lets all of them look right. A
        // draft room is sat in for an hour. Different jobs, different grounds
        // — and the switch itself signals you have crossed out of marketing
        // and into the tool.
        //
        // Nothing about the brand changes here. Every accent keeps its hex;
        // only the ground under them moves, and the three text values below
        // are re-derived against that new ground rather than carried over.
        // A value tuned against #070A0D does not hold at #1E2733 — see
        // DraftBoardGrid's empty-cell number for the case that proves it.
        //
        // `obsidian` and `charcoal` above are deliberately NOT deleted:
        // RoomPanel, TendenciesStrip and LockerTable still use them, and
        // some of those are marketing-side surfaces.
        slate: {
          // page / board ground
          DEFAULT: '#1E2733',
          // fixed header, lobby bar — a step under the page so a bar
          // still reads as a bar once the page is no longer near-black
          bar: '#1A222D',
          // cards, filled board cells — a step above the page
          panel: '#232D3A',
          // sunken: inputs, the queue's identity column. Must stay opaque
          // where the source says so; a sticky cell that lets the board
          // scroll under it is not a sticky cell.
          sunk: '#161D26',
          // borders, and the one step of lift above `panel` — avatar
          // placeholders and meter tracks use it as a fill for the same
          // reason a rule uses it as an edge: it is the value that reads
          // as "raised off the panel" without becoming a surface itself.
          rule: '#38434F',
          /* ---- Juke decision system (juke-decision.tailwind.js) ----
             The app frame: the ground behind the rail AND the content
             column, one step under `sunk`. It lives here rather than in
             `surface.*` because it is the outermost surface of a ROOM, and
             that group is the marketing side's own ladder measured against
             a different ground. */
          frame: '#151C25',
        },
        // Text on slate. These are re-derived, not the void values moved
        // across: measured 13.1:1, 6.6:1 and 4.9:1 against #1E2733. The
        // last is the floor for 11px and up and there is nothing under it
        // — anything dimmer than `muted` on this ground fails AA, which
        // is why `text-white/40` and `text-white/30` had to go rather than
        // be re-tuned.
        ink: {
          DEFAULT: '#EDF1F5',
          soft: '#A0AEBC',
          muted: '#8A9BAA',
          /* ---- Juke decision system ----
             One step above `muted`, for the 10px mono labels the decision
             primitives are full of. The paragraph above documents `muted`
             as the FLOOR at 11px and up; a 10px label with 0.13em tracking
             is below that size and wants a little more. Measured 6.1:1 on
             slate.panel, against muted's 4.9. */
          label: '#A9B7C5',
        },
        /* ---- Juke decision system: P1-P8 (juke-decision.tailwind.js) ----

           Everything below is additive. slate.*, ink.*, teal, font-body and
           font-plex are reused as-is, and `flow.*` is untouched.

           THE ONE RULE THESE EXIST TO ENFORCE: teal is the brand and the
           action, and it is never a value. A number that went the wrong way
           is `cost`; a number that went the right way is `gain`; a number
           with no sign at all is `evidence`. Before this there was no name
           for any of those, so a cost was `text-rose-300` in one card,
           `#E39284` inline in another and `text-teal-300` in a third - which
           is how a page ends up teaching a reader that cyan means "good"
           and then using cyan for a button. */

        /* P1. The sign pair.

           Deliberately NOT `flow.rose` (#F7A8A8) / `mint` (#74E5CE). Those
           two are marketing state marks measured against the void ground and
           `mint`'s own comment says it must never touch a position chip;
           these are measured against slate.panel and they sit beside each
           other in a table row, which is the case neither of those was
           tuned for.

           MEASURED, because the handoff's own contrast table is optimistic:
           it claims cost 7.2 and gain 10.6 on #232D3A, and the real figures
           are 5.78 and 9.36. Both still clear 4.5 comfortably, so nothing
           has to move — but the table is an acceptance criterion in the
           guide, and a criterion nobody has checked is not one. evidence is
           8.25 against a claimed 9.1; ink.label is 6.81 against a claimed
           6.1, which is the one it understates.

           `cost.deep` is 3.33 and so may NEVER be type. It is the fill under
           a bar and the 3px rule on a KPI card, both of which answer to
           1.4.11's 3:1 rather than to 4.5 - the same split this project
           already documents for the board's gold ring.

           `cost.deep` is the fill under a bar and the 3px rule on a KPI card
           - a mark, not type. NetAdpValueCard.jsx has drawn exactly this hex
           for exactly this meaning since it was written, and its own comment
           makes the same argument these do: "#BE6153 is a muted oxblood, not
           #F87171." */
        cost: { DEFAULT: '#E39284', deep: '#BE6153' },
        gain: '#ABDFC7',

        /* P2. The one light card on a page, and the only light surface in a
           room. Ink on it is slate.sunk.

           Near-identical to `flow.gold` (#F7D9A8) one group up, and that is
           the same distinction this file already draws between `flow.gold`
           and `flow.amber`: gold is the League Room's IDENTITY and a room is
           not a state. What is at stake on a screen is a state, so it gets
           its own name rather than borrowing a room's. */
        stake: '#FBD5A8',

        /* P3. An unsigned bar fill - a market gap, a share, a count. The
           colour a bar takes when the quantity has no direction. */
        evidence: '#AACAF2',

        /* P7 / P8. The run-next label, and the mark for something inactive
           or unsampled. Neither is a value colour and neither is a room. */
        accent: { pink: '#F7BCCB', neutral: '#C2CCD7' },

        // This page's background. Close to but deliberately not `obsidian`
        // (#0B0E14, used everywhere else) — the handoff's own value, and
        // this project's rule once a hex is explicitly chosen is to keep it
        // rather than round it off to the nearest existing token.
        void: '#070a0d',
      },
      /* Two hairlines, and they are not the same hairline.

         `line.hairline` (#252930) above is OPAQUE and is measured against the
         marketing side's `surface.*` ladder, where every ground is within a
         few points of the next. A room stacks four grounds - frame, page,
         panel, sunk - and one opaque line cannot read as an edge on all four:
         it is nearly invisible on `sunk` and heavy on `frame`. An alpha line
         holds on every step, which is the whole reason the decision system
         names its own.

         So `border-hairline` and `border-line-hairline` are different values
         and the names are one word apart. That is a real footgun and it is
         the reason for this paragraph: inside a room, use `hairline`. */
      borderColor: {
        hairline: 'rgba(255,255,255,0.07)',
        divider: 'rgba(255,255,255,0.05)',
      },
      boxShadow: {
        // resting glass panel: barely-there edge, no glow
        glass: '0 1px 0 0 rgb(255 255 255 / 0.04) inset',
        // hover state: a teal ring, and nothing else. It used to carry a
        // 32px outer glow and an `inset 0 0 40px rgb(123 31 162 / 0.5)`
        // purple wash as well. The inset was the real problem — an inset
        // shadow paints inside the box, which is where the card's own body
        // copy is, so it was a purple haze under text rather than ambience
        // around a card. The ring alone says "hovered" and says it more
        // precisely.
        //
        // Note this fixes a definition rather than a rendering: `shadow-
        // card-hover` has no call site in web/src, so Tailwind's JIT has
        // never emitted the rule and the purple wash has never been on
        // anybody's screen. Kept and corrected rather than deleted, so the
        // next surface that reaches for a hover shadow gets the right one.
        'card-hover': '0 0 0 1.5px rgb(0 229 255 / 0.9)',
        // "Your seat" identity — the Draft Room Cockpit's gold ring, named
        // by role rather than added as a `gold` colour token. #FFD166 is
        // 1.4:1 as text (CLAUDE.md), so the colour-ownership rule is
        // "never as type" — a colour token can't express that restriction
        // (Tailwind would happily generate `text-gold`), a shadow token
        // can't be applied to text at all. Same values DraftBoardGrid.jsx's
        // mineRing() already inlines; named here so new Cockpit surfaces
        // (the Entry seat grid, Picks rows) share the identical ring
        // instead of re-typing the hex.
        seat: 'inset 0 0 0 2px #FFD166',
        'seat-live': '0 0 15px rgba(0,229,255,0.4), inset 0 0 0 2px #FFD166',
      },
      backdropBlur: {
        glass: '16px',
      },
      fontSize: {
        /* ---- Juke decision system ----
           Four roles, and each one is a role rather than a size: a mono
           label, a small mono label, the big number on a KPI card, and a
           room's own H1. Named so the primitives cannot drift from each
           other the way eleven hand-picked sizes on one screen already did
           once (see style.css's type-scale note). */
        label: ['10px', { letterSpacing: '0.13em', lineHeight: '1' }],
        'label-sm': ['10.5px', { letterSpacing: '0.14em', lineHeight: '1' }],
        kpi: ['26px', { letterSpacing: '-0.02em', lineHeight: '1', fontWeight: '800' }],
        'room-h1': ['34px', { letterSpacing: '-0.02em', lineHeight: '1', fontWeight: '800' }],
      },
      borderRadius: {
        // The decision system's own ladder, by job rather than by number:
        // the app frame, a card, a panel, a KPI tile, a table row, a chip, a
        // badge. Same division style.css already uses for its five radii.
        frame: '22px',
        card: '18px',
        panel: '16px',
        kpi: '14px',
        row: '13px',
        chip: '10px',
        badge: '9px',
      },
      spacing: {
        // The one measurement the bar primitive is built from, so a track
        // and its fill can never be given two different heights.
        //
        // The handoff also names `rail: 72px`. It is NOT here: this app's
        // rail is 84px (RailNav.jsx), the handoff is describing its own
        // mockup, and a token nobody applies is a knob that turns nothing.
        'bar-track': '7px',
      },
      transitionDuration: { hover: '160ms' },
      fontFamily: {
        // The display face, and it has to be the same string style.css's
        // --font-display carries — two copies of "what the display face
        // is" is the written-down-twice failure with a typeface in it, and
        // it fails silently: the legacy pages and the React app simply
        // render in different fonts and nothing errors.
        //
        // It was Poppins here long after the 18 Aug rebrand moved the
        // legacy side off it, so every font-display heading and the grade
        // glyph fell back to system-ui the entire time — a face that was
        // never requested cannot be the face on screen. Then Barlow
        // Condensed, matching style.css. Gabarito as of 4 September 2026,
        // matching it again; see style.css's own note for what changed
        // about the argument and what did not.
        //
        // No narrow fallback: Gabarito is not a narrow face, so falling
        // back to one would reflow every heading on the one load the
        // fallback exists for.
        display: ['Gabarito', 'system-ui', 'sans-serif'],
        // Hanken Grotesk as of the sitewide font-consistency pass that
        // followed the homepage cosmetic revision — was Inter, and Inter
        // was barely load-bearing when it was: the homepage never applied
        // `font-body` anywhere (rendering in the bare browser/OS sans stack
        // instead), and only three Draft Room Cockpit components
        // (DraftEntryScreen.jsx, DraftCockpitHeader.jsx, NewMockPanel.jsx)
        // used it for real. The homepage pass itself scoped its own face to
        // `voidBody` rather than touch this token, specifically because
        // redefining `body` in place would have silently reskinned those
        // three Cockpit components while doing nothing for the homepage —
        // a homepage-only handoff had no business changing shared,
        // app-wide type. That constraint is gone now that the owner wants
        // one consistent face across both the homepage and the Cockpit, so
        // `voidBody` and `body` collapsed into this single token — every
        // call site that said `font-voidBody` now says `font-body`.
        body: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        // Montserrat — was `voidNumeral`, homepage-only, for the same
        // reason `body` above was scoped away from Inter: this token is now
        // used by both the homepage and the Draft Room Cockpit's own
        // prose/single-value numerals (report-card scores, stat-card
        // figures, percentages in a sentence), so the homepage-specific
        // name no longer fit. `plex` (IBM Plex Mono) is deliberately
        // untouched and still the right choice wherever a numeral's own
        // monospace WIDTH is load-bearing rather than just its face — pick
        // codes, team/position abbreviations, and any board or stat-table
        // grid whose columns depend on every cell measuring the same.
        numeral: ['"Montserrat"', 'system-ui', 'sans-serif'],
        // A new, separate token — not `mono` itself, so a page still using
        // bare `font-mono` (Tailwind's own system-mono fallback) never gets
        // silently reskinned just because this file changed. That was the
        // homepage-only reasoning when this token was added; checked again
        // for the Draft Room Cockpit and it turned out to already be moot
        // there — grepped `web/src` for the literal class `font-mono` and
        // got zero matches. Nothing in the Draft Room was using it at all,
        // despite an older version of this comment claiming pick codes and
        // AnalysisTab did. `font-plex` is used explicitly by both the
        // homepage components and the Cockpit's pick codes/team
        // abbreviations/tabular figures — self-hosted from /fonts/ as of
        // homepage v4 pass 1 (see index.css's @font-face rules and
        // index.html's preload), not loaded from Google Fonts any more.
        // Same font either way, still not homepage-only.
        plex: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        /* ---- Juke decision system: the rooms' own display face ----

           Bricolage Grotesque, self-hosted from /fonts/ like Plex and
           Archivo. It is `font-decision` and NOT a redefinition of
           `font-display`, which stays Gabarito: that token is named in
           exactly two places (this file and style.css) and the legacy pages
           read the other one, so moving it here would leave the two halves
           of the site in different faces with nothing erroring.

           Gabarito is the fallback rather than system-ui, so a failed font
           load lands on the face the app already draws headings in instead
           of on whatever the OS supplies. */
        decision: ['"Bricolage Grotesque"', 'Gabarito', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(0,229,255,0.4)' },
          '50%': { boxShadow: '0 0 30px rgba(0,229,255,0.7), 0 0 18px rgba(123,31,162,0.5)' },
        },
        // A JS-driven restart-on-complete loop (Framer Motion's animate())
        // measurably hitched at the wraparound — every restart cost a real
        // frame of JS between onComplete firing and the next animate() call.
        // A native CSS loop has no such seam: the browser repeats the
        // keyframe on the compositor thread with nothing for JS to do.
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        // Sonar. These four are a second copy of the keyframes that index.html
        // carries inline for the #boot-sonar cold-load overlay, and the
        // duplication is deliberate rather than drift: that copy has to be
        // readable before any bundle is, and under `vite dev` this stylesheet
        // arrives via JavaScript. They are global @keyframes under one name
        // each, so if the two ever disagree, whichever stylesheet the document
        // loads later wins for the overlay *and* for the components. Change
        // one, change the other. (index.html writes the same values in CSS's
        // own shorthand - .16 for 0.16 - so compare values, not characters.)
        'sonar-ring': {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '12%': { opacity: '0.65' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        'sonar-focus': {
          '0%': { transform: 'scale(1.2)', opacity: '0', filter: 'blur(7px)' },
          '100%': { transform: 'scale(1)', opacity: '1', filter: 'blur(0)' },
        },
        'sonar-label': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // The reduced-motion substitute for the two above, not a variant of
        // them: opacity only, no blur, no travel. It states its own 0% for a
        // reason - a keyframe declaring only a `to` starts from whatever the
        // element already computes, which is opacity 1 here, so it would fade
        // nothing at all. That was a real bug in the handoff's boot overlay.
        'sonar-fade': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        // Tier 3 only. No index.html counterpart - the overlay has no inline
        // tier, so this one lives here alone.
        'sonar-pulse': { '0%, 100%': { opacity: '0.32' }, '50%': { opacity: '1' } },
      },
      animation: {
        'pulse-glow': 'pulse-glow 1.8s ease-in-out infinite',
        marquee: 'marquee 45s linear infinite',
        // SonarLoader.jsx overrides duration and delay inline per ring, so the
        // 2100ms here is the default rather than the only value.
        'sonar-ring': 'sonar-ring 2100ms ease-out infinite both',
        'sonar-focus': 'sonar-focus 580ms cubic-bezier(0.16,1,0.3,1) both',
        'sonar-label': 'sonar-label 500ms ease-out 340ms both',
        'sonar-fade': 'sonar-fade 300ms ease-out both',
        'sonar-pulse': 'sonar-pulse 1500ms ease-in-out infinite both',
      },
    },
  },
  plugins: [
    function ({ addUtilities, theme }) {
      addUtilities({
        '.glass-panel': {
          backgroundColor: 'rgb(21 25 35 / 0.55)',
          backdropFilter: `blur(${theme('backdropBlur.glass')})`,
          WebkitBackdropFilter: `blur(${theme('backdropBlur.glass')})`,
          border: '1px solid rgb(255 255 255 / 0.08)',
        },
        // The background half of "your seat," beside the shadow.seat ring
        // above — a background-color utility, so `text-seat-wash` isn't a
        // class Tailwind can even generate. Same #FFD166 the ring uses, at
        // the wash strength the Cockpit's board column and Picks rows both
        // call for.
        '.seat-wash': {
          backgroundColor: 'rgba(255,209,102,0.07)',
        },
      })
    },
  ],
}
