(function () {
  "use strict";

  var JUMPER_INDEX = 1;
  var STEP_DURATION_MS = 240;
  var STRETCH_DURATION_MS = 520;
  var RETURN_HOLD_MS = 56;
  var RIGHT_OF_O_GAP_PX = 8;
  var LETTER_LANDING_OVERLAP_PX = 3;
  var MOBILE_LETTER_LANDING_OVERLAP_PX = 9;
  var MOBILE_BREAKPOINT_PX = 640;
  var STRETCH_SQUAT_PX = 3.5;
  var STRETCH_SCALE_Y_PEAK = 1.16;
  var STRETCH_COMPRESS_SCALE_Y = 0.91;
  var STRETCH_SWAY_DEG = 3;

  var PATH = [
    { kind: "rightOfLetter", letterIndex: 10 },
    { kind: "letter", letterIndex: 10 },
    { kind: "letter", letterIndex: 9 },
    { kind: "letter", letterIndex: 8 },
    { kind: "letter", letterIndex: 6 },
    { kind: "letter", letterIndex: 5 },
    { kind: "letter", letterIndex: 4 },
    { kind: "letter", letterIndex: 3 },
    { kind: "letter", letterIndex: 2 },
    { kind: "letter", letterIndex: JUMPER_INDEX }
  ];

  var glyphAscentCache = {};

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutBack(t) {
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function cubicBezier(a, ctrl1, ctrl2, b, t) {
    var inv = 1 - t;
    return inv * inv * inv * a + 3 * inv * inv * t * ctrl1 + 3 * inv * t * t * ctrl2 + t * t * t * b;
  }

  function translate3d(x, y) {
    return "translate3d(" + x + "px, " + y + "px, 0)";
  }

  function measureGlyphAscent(font, char, fallback) {
    var key = font + "::" + char;
    if (glyphAscentCache[key] !== undefined) return glyphAscentCache[key];

    var ascent = fallback * 0.8;
    try {
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = font;
        var metrics = ctx.measureText(char);
        if (typeof metrics.actualBoundingBoxAscent === "number" && metrics.actualBoundingBoxAscent > 0) {
          ascent = metrics.actualBoundingBoxAscent;
        }
      }
    } catch (e) {
      // Keep fallback for older browsers.
    }

    glyphAscentCache[key] = ascent;
    return ascent;
  }

  function computeStretchTransform(t) {
    if (t <= 0.38) {
      var squatProgress = easeInOutCubic(t / 0.38);
      return {
        dy: STRETCH_SQUAT_PX * squatProgress,
        scaleY: 1 - 0.04 * squatProgress,
        rotateDeg: STRETCH_SWAY_DEG * Math.sin((t / 0.38) * Math.PI)
      };
    }

    if (t <= 0.75) {
      var stretchProgress = (t - 0.38) / 0.37;
      var stretchEase = easeOutBack(stretchProgress);
      return {
        dy: STRETCH_SQUAT_PX * (1 - stretchProgress),
        scaleY: 0.96 + (STRETCH_SCALE_Y_PEAK - 0.96) * stretchEase,
        rotateDeg: 0
      };
    }

    var compressProgress = easeInOutCubic((t - 0.75) / 0.25);
    return {
      dy: 0,
      scaleY: STRETCH_SCALE_Y_PEAK + (STRETCH_COMPRESS_SCALE_Y - STRETCH_SCALE_Y_PEAK) * compressProgress,
      rotateDeg: 0
    };
  }

  function buildSegment(from, to, isFirstHop) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var travelX = Math.abs(dx);
    var travelY = Math.abs(dy);
    var arc = clamp(
      travelX * (isFirstHop ? 0.08 : 0.045) + travelY * 0.16 + (isFirstHop ? 20 : 10),
      isFirstHop ? 34 : 12,
      isFirstHop ? 84 : 52
    );
    var crestY = Math.min(from.y, to.y) - arc;

    return {
      from: from,
      to: to,
      ctrl1: {
        x: from.x + dx * (isFirstHop ? 0.3 : travelX > 140 ? 0.26 : 0.22),
        y: from.y + (crestY - from.y) * (isFirstHop ? 0.96 : 0.9)
      },
      ctrl2: {
        x: from.x + dx * (isFirstHop ? 0.72 : travelX > 140 ? 0.7 : 0.62),
        y: to.y + (crestY - to.y) * (travelX > 120 ? 0.78 : 0.7) + dy * 0.03
      }
    };
  }

  function setupNameAnimation(root) {
    if (root.getAttribute("data-name-i-animation-ready") === "true") return;
    root.setAttribute("data-name-i-animation-ready", "true");

    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    var trigger = root.closest ? root.closest(".profile-name-trigger") : root.parentElement;
    var jumper = root.querySelector(".hero-letter-jumper");
    var letters = Array.prototype.slice.call(root.querySelectorAll(".hero-letter"));
    var animationFrame = null;
    var isRunning = false;

    if (!trigger || !jumper || !letters[JUMPER_INDEX]) return;
    jumper.textContent = letters[JUMPER_INDEX].textContent || "";

    function isMobileViewport() {
      return window.matchMedia && window.matchMedia("(max-width: " + (MOBILE_BREAKPOINT_PX - 1) + "px)").matches;
    }

    function finish() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      letters[JUMPER_INDEX].style.visibility = "";
      jumper.style.visibility = "hidden";
      jumper.style.transform = "";
      trigger.removeAttribute("data-animation-state");
      trigger.removeAttribute("aria-disabled");
      isRunning = false;
    }

    function start() {
      if (isRunning) return;
      if (reducedMotion && reducedMotion.matches) return;

      var containerRect = root.getBoundingClientRect();
      var iEl = letters[JUMPER_INDEX];
      var iRect = iEl.getBoundingClientRect();
      var jumperRect = jumper.getBoundingClientRect();
      var jumperWidth = jumperRect.width;
      var jumperHeight = jumperRect.height;
      var computed = window.getComputedStyle(iEl);
      var font = computed.font;
      var fallbackFontSize = parseFloat(computed.fontSize) || 16;
      var isMobile = isMobileViewport();
      var landingOverlap = isMobile ? MOBILE_LETTER_LANDING_OVERLAP_PX : LETTER_LANDING_OVERLAP_PX;
      var maxAscent = 0;
      var ascentByIndex = {};
      var pathIndices = {};

      pathIndices[JUMPER_INDEX] = true;
      PATH.forEach(function (point) {
        pathIndices[point.letterIndex] = true;
      });

      Object.keys(pathIndices).forEach(function (key) {
        var index = Number(key);
        var char = letters[index] ? letters[index].textContent : "";
        var ascent = measureGlyphAscent(font, char, fallbackFontSize);
        ascentByIndex[index] = ascent;
        maxAscent = Math.max(maxAscent, ascent);
      });

      var origin = {
        x: iRect.left - containerRect.left,
        y: iRect.top - containerRect.top
      };

      var waypoints = PATH.map(function (point) {
        var el = letters[point.letterIndex];
        if (!el) return origin;

        if (point.kind === "letter" && point.letterIndex === JUMPER_INDEX) {
          return origin;
        }

        var rect = el.getBoundingClientRect();
        var ascent = ascentByIndex[point.letterIndex] || fallbackFontSize * 0.8;
        var glyphTopY = rect.top + (maxAscent - ascent);

        if (point.kind === "rightOfLetter") {
          return {
            x: rect.right + RIGHT_OF_O_GAP_PX - jumperWidth / 2 - containerRect.left,
            y: rect.bottom - jumperHeight - containerRect.top
          };
        }

        return {
          x: rect.left + rect.width / 2 - jumperWidth / 2 - containerRect.left,
          y: glyphTopY - jumperHeight + landingOverlap - containerRect.top
        };
      });

      var segments = waypoints.map(function (to, index) {
        var from = index === 0 ? origin : waypoints[index - 1];
        return buildSegment(from, to, index === 0);
      });

      var timings = PATH.map(function (point, index) {
        var shouldHold = point.kind === "letter" && index > 0 && index < PATH.length - 1;
        return {
          moveDurationMs: STEP_DURATION_MS,
          holdDurationMs: shouldHold ? RETURN_HOLD_MS : 0,
          totalDurationMs: STEP_DURATION_MS + (shouldHold ? RETURN_HOLD_MS : 0)
        };
      });
      var jumpDurationMs = timings.reduce(function (total, timing) {
        return total + timing.totalDurationMs;
      }, 0);
      var startTs = null;

      isRunning = true;
      trigger.setAttribute("data-animation-state", "running");
      trigger.setAttribute("aria-disabled", "true");
      iEl.style.visibility = "hidden";
      jumper.style.visibility = "visible";
      jumper.style.transform = translate3d(origin.x, origin.y);

      function tick(ts) {
        if (startTs === null) startTs = ts;
        var elapsedMs = ts - startTs;

        if (elapsedMs < STRETCH_DURATION_MS) {
          var stretch = computeStretchTransform(elapsedMs / STRETCH_DURATION_MS);
          jumper.style.transform =
            translate3d(origin.x, origin.y + stretch.dy) + " " +
            "scaleY(" + stretch.scaleY.toFixed(4) + ") " +
            "rotate(" + stretch.rotateDeg.toFixed(2) + "deg)";
          animationFrame = window.requestAnimationFrame(tick);
          return;
        }

        var jumpElapsedMs = Math.min(elapsedMs - STRETCH_DURATION_MS, jumpDurationMs);
        var elapsedBeforeStep = 0;
        var stepIndex = timings.length - 1;
        var stepElapsedMs = timings[stepIndex].totalDurationMs;

        for (var index = 0; index < timings.length; index += 1) {
          if (jumpElapsedMs <= elapsedBeforeStep + timings[index].totalDurationMs || index === timings.length - 1) {
            stepIndex = index;
            stepElapsedMs = jumpElapsedMs - elapsedBeforeStep;
            break;
          }
          elapsedBeforeStep += timings[index].totalDurationMs;
        }

        var timing = timings[stepIndex];
        var segment = segments[stepIndex];
        var isHold = timing.holdDurationMs > 0 && stepElapsedMs > timing.moveDurationMs;
        var progress = isHold ? 1 : clamp(stepElapsedMs / timing.moveDurationMs, 0, 1);
        var eased = easeInOutCubic(progress);
        var x = isHold ? segment.to.x : cubicBezier(segment.from.x, segment.ctrl1.x, segment.ctrl2.x, segment.to.x, eased);
        var y = isHold ? segment.to.y : cubicBezier(segment.from.y, segment.ctrl1.y, segment.ctrl2.y, segment.to.y, eased);
        var scaleY = stepIndex === 0 ? STRETCH_COMPRESS_SCALE_Y + (1 - STRETCH_COMPRESS_SCALE_Y) * easeInOutCubic(progress) : 1;

        jumper.style.transform = scaleY !== 1
          ? translate3d(x, y) + " scaleY(" + scaleY.toFixed(4) + ")"
          : translate3d(x, y);

        if (jumpElapsedMs < jumpDurationMs) {
          animationFrame = window.requestAnimationFrame(tick);
        } else {
          finish();
        }
      }

      animationFrame = window.requestAnimationFrame(tick);
    }

    trigger.addEventListener("click", start);

    if (reducedMotion && reducedMotion.matches) {
      trigger.setAttribute("aria-disabled", "true");
    }
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll(".name-i-animation"), setupNameAnimation);
  }

  init();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
