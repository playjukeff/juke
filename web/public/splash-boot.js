// The two decisions the cold-load splash has to make before its first frame.
//
// Loaded parser-blocking, immediately after #boot-sonar in web/index.html.
// Neither answer survives being late: a same-session reload would flash the
// reveal it is meant to suppress, and a reduced-motion visitor would watch the
// animation start before it was taken away. Both have to be settled while the
// element exists and nothing has painted, which is exactly one position in the
// document and this is it.
//
// It is a file rather than an inline block because _headers says
// script-src 'self'. See index.html's own note.
(function () {
  var el = document.getElementById('boot-sonar')
  if (!el) return

  // ---- 1. Is this a cold load? -------------------------------------------
  //
  // Package 01, item 6: "gate it so it does not play on warm loads,
  // client-side navigations, or refreshes within the same session."
  //
  // This is a reversal of a decision recorded in CLAUDE.md and it is worth
  // saying so out loud rather than leaving the next reader to find the
  // contradiction. The owner previously removed a skip-gate from this overlay,
  // on the measured grounds that production traffic on a fast connection never
  // saw it at all — and then reversed a second, narrower gate (installed-app
  // only) for the same reason, "an overlay restricted to installed users is an
  // overlay almost nobody sees at all."
  //
  // What makes this gate a different thing from those two: both of those hid
  // the splash from a person who had never seen it. This one hides it from a
  // person who watched it a moment ago and pressed reload. The first visit of
  // every session still plays in full, on every device and every connection
  // speed, which is the property those reversals were protecting.
  //
  // sessionStorage rather than localStorage, deliberately — per tab, cleared
  // when the tab closes, so "cold" means what a visitor would mean by it.
  //
  // Client-side navigations need no handling here at all: this file runs once
  // per document load, and every route in this app is a hash change.
  var cold = true
  try {
    cold = !sessionStorage.getItem('juke.splash.seen')
    sessionStorage.setItem('juke.splash.seen', '1')
  } catch (e) {
    // Private mode, or storage blocked outright. Treat it as a cold load and
    // play: a visitor seeing the reveal twice is a far smaller failure than a
    // visitor never seeing it, and this is the branch a privacy-hardened
    // browser takes on every single load.
    cold = true
  }

  if (!cold) {
    // Remove rather than hide. A fixed element at z-index 9999 swallows every
    // click on the page whether or not it is transparent, and leaving it in
    // the DOM would also leave main.jsx's teardown holding for a reveal that
    // is not playing. Gone before first paint is gone.
    el.remove()
    return
  }

  // ---- 2. Does it play animated? -----------------------------------------
  //
  // Package 01, item 7: under prefers-reduced-motion, render
  // <juke-mark variant="static"> on the same ground for a 600ms hold.
  //
  // This has to be a script. juke-mark.js ships unedited from the design
  // package and carries no reduced-motion handling of its own, and its
  // animations live inside a shadow root, so index.html's stylesheet cannot
  // reach them however the selector is written. Swapping the attribute is the
  // supported way to ask that element for a different thing, and it is what
  // the design package's own note asks for.
  //
  // The ambient water is CSS and is stilled by the @media block in
  // index.html. The finite layers need no handling at all now: they ship at
  // opacity:0 with no animation, so not running the start pass below IS the
  // reduced-motion behaviour. That used to need a display:none rule.
  //
  // Guarded because matchMedia is the kind of API that is present everywhere
  // and still worth not assuming: this script runs before anything else on
  // the page and a throw here leaves the overlay up for ever.
  var reduced = false
  try {
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch (e) {
    reduced = false
  }

  if (reduced) {
    var mark = el.querySelector('juke-mark')
    // setAttribute rather than replacing the element: juke-mark observes
    // 'variant' and re-renders itself, so this is one attribute write rather
    // than a teardown and a second upgrade.
    if (mark) mark.setAttribute('variant', 'static')
    // main.jsx reads this to shorten its hold from the reveal's 2700ms to the
    // 600ms the design package asks for. An attribute on the element rather
    // than a second sessionStorage read, so the two files cannot disagree
    // about what this load decided.
    el.setAttribute('data-splash-reduced', '')
    // Nothing finite is left to start — variant="static" has no animations and
    // the CSS has dropped the specks and the droplet — so the rest of this
    // file has nothing to do.
    return
  }

  // ---- 3. Start the composition, in one pass, when it can be SEEN --------
  //
  // Design package 01's revised handoff asks for exactly this and the reason
  // is the fault the owner reported twice. Every finite layer in the overlay
  // ships at opacity:0 with NO animation, carrying its timing in a data-anim
  // attribute instead; this applies them all in a single pass and calls
  // mark.replay() in the same breath, so the drops, the impact, the droplet
  // and the mark's own rise share one zero.
  //
  // The package's own reference starts that pass on
  // customElements.whenDefined('juke-mark'). Here that resolves almost
  // immediately — juke-mark.js is a blocking script in <head> — and starting
  // there would put the zero back where it was: at style resolution, which on
  // a real machine can be a second or more before the browser presents
  // anything. Measured from the owner's desktop recording at 20ms per frame:
  // seven frames of empty ground, then the mark already at full size, because
  // the first ~1.2s had run into frames nobody saw.
  //
  // So the pass waits for BOTH conditions: the element defined and mounted
  // (the package's requirement, and it says starting the layers before the
  // mark is mounted is the failure mode to avoid), and a painted frame (this
  // project's). first-contentful-paint is presentation-based, which is the
  // browser saying "the viewer has now seen something"; two frames after it
  // so the mark's own SVG has had a raster opportunity.
  //
  // This replaces a restart that rewound the animations after the fact. The
  // package's approach is better and makes that one unnecessary: holding a
  // layer that has not begun costs nothing, where rewinding one that has is a
  // visible jump if it lands late.
  var started = false

  // The mark is held hidden until the pass starts. Its `form` variant renders
  // on upgrade with its own animation already running, so on a machine whose
  // first paint is late the rise could FINISH before the pass below calls
  // replay() — the finished shark showed for a moment, vanished on replay,
  // and then rose again. Reported from a cold launch, 18 September 2026.
  // Hidden before first paint, shown in the same pass as replay(), so the
  // only rise anybody sees is the one that shares the layers' zero.
  var heldMark = el.querySelector('juke-mark')
  if (heldMark) heldMark.style.visibility = 'hidden'

  function startPass() {
    if (started) return
    var mark = el.querySelector('juke-mark')
    // The package's own precondition. An un-upgraded element has no shadow
    // root, so replay() would not exist and the mark would sit out the pass
    // the layers had just committed to.
    if (!mark || typeof mark.replay !== 'function') return
    started = true

    var layers = el.querySelectorAll('[data-anim]')
    var i
    // Clear, flush, then apply — the reference's own three steps. The flush is
    // what makes this a restart rather than a no-op on a replay: without it
    // the style change coalesces and nothing re-triggers.
    for (i = 0; i < layers.length; i++) layers[i].style.animation = 'none'
    void el.offsetWidth
    for (i = 0; i < layers.length; i++) {
      layers[i].style.animation = layers[i].getAttribute('data-anim')
    }
    try { mark.replay() } catch (e) { /* the layers still run */ }
    mark.style.visibility = ''

    // main.jsx holds from here — see its own note. An attribute rather than a
    // global so there is one fact on the element itself, the same way
    // data-splash-reduced already works.
    el.setAttribute('data-splash-started-at', String(Math.round(performance.now())))
  }

  // Never later than this. If first paint is seconds in, the composition has
  // to start anyway or the overlay sits on a dead frame until its own 8s
  // failsafe fades it.
  var START_DEADLINE = 4000
  var deadline = setTimeout(startPass, START_DEADLINE)

  function armStart() {
    // Retry across frames: the mark upgrades on its own schedule and the
    // element may not be mounted on the very first callback.
    var tries = 0
    ;(function attempt() {
      startPass()
      if (started) { clearTimeout(deadline); return }
      if (++tries < 40) requestAnimationFrame(attempt)
    })()
  }

  try {
    var po = new PerformanceObserver(function (list) {
      var entries = list.getEntries()
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name !== 'first-contentful-paint') continue
        po.disconnect()
        requestAnimationFrame(function () { requestAnimationFrame(armStart) })
        return
      }
    })
    po.observe({ type: 'paint', buffered: true })
  } catch (e) {
    // No observer: fall back to a frame after definition, which is still
    // better than the parse-time zero this whole block exists to move.
    if (window.customElements && customElements.whenDefined) {
      customElements.whenDefined('juke-mark').then(function () {
        requestAnimationFrame(armStart)
      })
    } else {
      requestAnimationFrame(armStart)
    }
  }
})()
