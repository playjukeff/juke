// Juke logo — shark mark + Archivo 900 wordmark
//
// Drop-in replacement for the goalpost version. The public API is unchanged,
// so none of the six existing call sites need editing:
//
//   <JukeLogo />                        horizontal lockup, 21px wordmark
//   <JukeLogo size={32} />              larger lockup
//   <JukeLogo variant="mark" />         mark only
//   <JukeLogo variant="stacked" />      mark above wordmark
//   <JukeLogo mono />                   single-colour mark (inherits currentColor)
//
// Two things did change, and both are deliberate:
//
//   1. The mark's aspect ratio went from 54:56 (0.96:1) to 564:352 (1.602:1).
//      The shark is wide. markWidth is now size * 1.7 rather than size * 1.15,
//      which makes the lockup roughly 10px wider at every size — measured 105px
//      at size=21 and 90px at size=18. See "The one layout note" in README.md
//      for where that actually lands and where it does not.
//
//   2. Below 28px the mark automatically drops to the silhouette. The
//      three-value face does not survive smaller than that, and silently
//      rendering mush was the failure mode of the artwork this replaces.
//
// Colours come from the existing palette — no new tokens.
//   mint      #5EEAD4   linework
//   foreground #F2F5FA  wordmark
//   negatives           whatever the ground is; see `surface` below
//
// The ink is ONE hex on every surface. What changes per surface is the
// interior negatives — the eyes, the jaw line, the gill slits — and the
// two are different things in a way that is worth being explicit about,
// because the wrong one looks deliberate.
//
// A viewer does not read those shapes as colour. They read as holes in the
// shark, and a hole shows the surface behind it. So a mark carrying #070A0D
// negatives onto a #1E2733 screen drags a visibly darker patch around inside
// itself — which is exactly what "the logo changed between pages" looks
// like. Negatives tracking the ground is correct and invisible; the ink
// tracking the ground is the thing that would actually be wrong.
//
// That is why these are separate files rather than one file recoloured: in
// the supplied artwork the negatives are filled, not knocked out, so there
// is no transparency to let a ground show through and no `fill` override
// that could put one there.

import React from "react";

const FOREGROUND = "#F2F5FA";

// Assets live in web/public, same as the icons already there.
//
// THERE IS ONE FILE NOW, AND THE FIVE-ENTRY TABLE THAT USED TO BE HERE IS
// GONE. It is worth saying why, because the argument for that table was a good
// one and it is still in CLAUDE.md: "a variant per ground, not one file you
// recolour". The supplied artwork filled the eyes, teeth and jaw with the
// CANVAS colour, so the mark was a cut-out and only worked on the exact ground
// it was cut for - hence /juke-mark-void.svg at #070A0D, /juke-mark.svg at
// #0B0E14, and three more.
//
// Design package 02's mark is not a cut-out. Its body is #1A222D, a real slate
// that is not any page ground in this app, so the negatives are the shark
// rather than a hole in the shape of one. Checked rather than taken on trust:
// the old /juke-mark.svg fills 16 paths with #0B0E14 (obsidian, the page) and
// the new one fills 11 with #1A222D (nothing). That is the whole difference,
// and it is exactly the property the five variants were compensating for.
//
// So `surface` stays in the signature and is now ignored for the source. Kept
// rather than removed because every call site passes it and a prop that
// vanishes is a silent behaviour change at a dozen sites; it also still says
// something true about intent, and if a ground ever needs its own cut again
// this is where that comes back.
const MARK = "/juke-shark-mark.svg";
const MARK_DETAIL = "/juke-mark-detail.svg";         // adds shading, >= 120px only
const MARK_FG = "/juke-mark-fg.svg";                 // white linework, for gradient/photo chrome
const SILHOUETTE = "/juke-mark-mono.svg";            // one shape, used as a CSS mask

const ASPECT = 564 / 352;          // 1.602 — do not stretch
const SILHOUETTE_BELOW = 28;       // px of mark width
const DETAIL_ABOVE = 120;
const MIN_WIDTH = 12;

export function JukeMark({
  width = 36,
  mono = false,
  detail = false,
  onLight = false,
  surface = "void",
  className = "",
  style,
}) {
  const height = width / ASPECT;

  if (width < MIN_WIDTH) return null;

  // mono: a single shape filled with currentColor. Masking rather than an
  // inline <svg> keeps ~24KB of path data out of the bundle while still
  // inheriting colour, which an <img> cannot do.
  if (mono || width < SILHOUETTE_BELOW) {
    return (
      <span
        aria-label="Juke"
        role="img"
        className={className}
        style={{
          display: "inline-block",
          width,
          height,
          backgroundColor: "currentColor",
          WebkitMaskImage: `url(${SILHOUETTE})`,
          maskImage: `url(${SILHOUETTE})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          ...style,
        }}
      />
    );
  }

  // onLight and `surface` both survive in the signature and neither picks a
  // file any more — see the note on MARK for why there is only one. onLight
  // still suppresses the detail variant, which is the one thing it did that
  // was about more than which cut-out to load: MARK_DETAIL adds shading tuned
  // for a dark ground and is genuinely wrong on white.
  const ground = onLight ? "light" : surface;
  const src =
    detail && width >= DETAIL_ABOVE && ground !== "light" ? MARK_DETAIL : MARK;

  return (
    <img
      src={src}
      alt="Juke"
      width={width}
      height={height}
      className={className}
      style={{ display: "block", ...style }}
    />
  );
}

export function JukeWordmark({ size = 21, color = FOREGROUND, className = "", style }) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "'Archivo', sans-serif",
        fontWeight: 900,
        fontSize: size,
        lineHeight: 0.9,
        letterSpacing: "-0.045em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      Juke
    </span>
  );
}

export default function JukeLogo({
  variant = "lockup",
  size = 21,
  mono = false,
  detail = false,
  onLight = false,
  surface = "void",
  color = FOREGROUND,
  className = "",
  style,
  markWidth: markWidthProp,
}) {
  // 1.7 rather than the goalpost's 1.15: the shark is a wide mark, and this
  // is the ratio that puts its visual mass level with the wordmark's cap
  // height. Verified at sizes 18, 19, 21 and 32.
  //
  // markWidth overrides it where a bar constrains HEIGHT rather than the
  // wordmark's size — the app bar is one: at size 18 the derived 31px mark
  // resolved 31 paths into 19px of height, which reads as a smudge rather
  // than a shark. A prop rather than an inline style at the call site, so
  // the size is a value the component owns and a reviewer can find.
  const markWidth = markWidthProp || Math.round(size * 1.7);

  if (variant === "mark") {
    return (
      <JukeMark
        width={markWidth}
        mono={mono}
        detail={detail}
        onLight={onLight}
        surface={surface}
        className={className}
        style={style}
      />
    );
  }

  if (variant === "stacked") {
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: size * 0.34,
          ...style,
        }}
      >
        <JukeMark width={Math.round(size * 2.4)} mono={mono} detail={detail} onLight={onLight} surface={surface} />
        <JukeWordmark size={size} color={color} />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.42, ...style }}
    >
      <JukeMark width={markWidth} mono={mono} detail={detail} onLight={onLight} surface={surface} />
      <JukeWordmark size={size} color={color} />
    </span>
  );
}
