(function () {
  "use strict";

  var DESKTOP_DURATION_MS = 2050;
  var MOBILE_DURATION_MS = 2200;
  var MOBILE_BREAKPOINT_PX = 640;
  var LAUNCH_END = 0.12;
  var ORBIT_END = 0.9;
  var TRAIL_LAGS = [0.026, 0.052];
  var TRAIL_OPACITIES = [0.22, 0.1];

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeInOutSine(t) {
    return (1 - Math.cos(Math.PI * t)) / 2;
  }

  function easeOutBack(t) {
    var overshoot = 1.1;
    return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
  }

  function mix(from, to, t) {
    return from + (to - from) * t;
  }

  function cubicPoint(from, control1, control2, to, t) {
    var inv = 1 - t;
    return {
      x: inv * inv * inv * from.x + 3 * inv * inv * t * control1.x +
        3 * inv * t * t * control2.x + t * t * t * to.x,
      y: inv * inv * inv * from.y + 3 * inv * inv * t * control1.y +
        3 * inv * t * t * control2.y + t * t * t * to.y
    };
  }

  function rotationForTangent(tangent) {
    return Math.atan2(tangent.y, tangent.x) * 180 / Math.PI - 90;
  }

  function unwrapAxisRotation(rotation, previousRotation) {
    while (rotation - previousRotation > 90) rotation -= 180;
    while (rotation - previousRotation < -90) rotation += 180;
    return rotation;
  }

  function roundedCornerState(centerX, centerY, radius, startAngle, distance) {
    var angle = startAngle + distance / radius;
    return {
      point: {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      },
      tangent: {
        x: -Math.sin(angle),
        y: Math.cos(angle)
      }
    };
  }

  function orbitState(config, progress) {
    var radius = config.cornerRadius;
    var horizontalLength = 2 * (config.radiusX - radius);
    var verticalLength = 2 * (config.radiusY - radius);
    var cornerLength = Math.PI * radius / 2;
    var perimeter = 2 * horizontalLength + 2 * verticalLength + 4 * cornerLength;
    var distance = (perimeter - cornerLength / 2 + progress * perimeter) % perimeter;
    var left = config.center.x - config.radiusX;
    var right = config.center.x + config.radiusX;
    var top = config.center.y - config.radiusY;
    var bottom = config.center.y + config.radiusY;

    if (distance < horizontalLength) {
      return {
        point: { x: left + radius + distance, y: top },
        tangent: { x: 1, y: 0 }
      };
    }
    distance -= horizontalLength;

    if (distance < cornerLength) {
      return roundedCornerState(right - radius, top + radius, radius, -Math.PI / 2, distance);
    }
    distance -= cornerLength;

    if (distance < verticalLength) {
      return {
        point: { x: right, y: top + radius + distance },
        tangent: { x: 0, y: 1 }
      };
    }
    distance -= verticalLength;

    if (distance < cornerLength) {
      return roundedCornerState(right - radius, bottom - radius, radius, 0, distance);
    }
    distance -= cornerLength;

    if (distance < horizontalLength) {
      return {
        point: { x: right - radius - distance, y: bottom },
        tangent: { x: -1, y: 0 }
      };
    }
    distance -= horizontalLength;

    if (distance < cornerLength) {
      return roundedCornerState(left + radius, bottom - radius, radius, Math.PI / 2, distance);
    }
    distance -= cornerLength;

    if (distance < verticalLength) {
      return {
        point: { x: left, y: bottom - radius - distance },
        tangent: { x: 0, y: -1 }
      };
    }
    distance -= verticalLength;

    return roundedCornerState(left + radius, top + radius, radius, Math.PI, distance);
  }

  function pathState(config, progress) {
    if (progress < LAUNCH_END) {
      var launchPhase = progress / LAUNCH_END;
      var launchProgress = easeOutCubic(launchPhase);
      return {
        point: cubicPoint(
          config.origin,
          config.launchControl1,
          config.launchControl2,
          config.orbitStart,
          launchProgress
        ),
        scale: mix(1, config.flightScale, launchProgress),
        rotate: mix(0, config.orbitStartRotation, easeInOutSine(launchPhase))
      };
    }

    if (progress < ORBIT_END) {
      var orbitProgress = (progress - LAUNCH_END) / (ORBIT_END - LAUNCH_END);
      var orbit = orbitState(config, orbitProgress);
      return {
        point: orbit.point,
        scale: config.flightScale,
        rotate: rotationForTangent(orbit.tangent)
      };
    }

    var returnPhase = (progress - ORBIT_END) / (1 - ORBIT_END);
    var returnProgress = easeInOutCubic(returnPhase);
    return {
      point: cubicPoint(
        config.orbitStart,
        config.returnControl1,
        config.returnControl2,
        config.origin,
        returnProgress
      ),
      scale: mix(config.flightScale, 1, easeOutBack(returnPhase)),
      rotate: mix(config.orbitStartRotation, 0, easeInOutSine(returnPhase))
    };
  }

  function setupDropcap(trigger) {
    if (trigger.getAttribute("data-intro-dropcap-ready") === "true") return;

    var bio = trigger.closest ? trigger.closest(".intro-bio") : trigger.parentElement;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    var mobileViewport = window.matchMedia && window.matchMedia("(max-width: " + MOBILE_BREAKPOINT_PX + "px)");
    var initialAriaLabel = trigger.getAttribute("aria-label");
    var animationFrame = null;
    var feedbackTimer = null;
    var layers = [];
    var isRunning = false;

    if (!bio) return;
    trigger.setAttribute("data-intro-dropcap-ready", "true");
    trigger.disabled = false;

    function removeLayers() {
      layers.forEach(function (layer) {
        layer.element.remove();
      });
      layers = [];
    }

    function finish() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      removeLayers();
      trigger.removeAttribute("data-orbit-state");
      trigger.style.removeProperty("--intro-dropcap-origin-opacity");
      trigger.setAttribute("aria-label", initialAriaLabel);
      isRunning = false;
    }

    function playReducedFeedback() {
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      trigger.classList.remove("is-reduced-feedback");
      void trigger.offsetWidth;
      trigger.classList.add("is-reduced-feedback");
      feedbackTimer = window.setTimeout(function () {
        trigger.classList.remove("is-reduced-feedback");
        feedbackTimer = null;
      }, 260);
    }

    function createLayer(className, rect, computed, lag, opacity) {
      var element = document.createElement("span");
      element.className = "intro-dropcap-orbit " + className;
      element.textContent = trigger.textContent || "I";
      element.setAttribute("aria-hidden", "true");
      element.style.width = rect.width + "px";
      element.style.height = rect.height + "px";
      element.style.fontFamily = computed.fontFamily;
      element.style.fontSize = computed.fontSize;
      element.style.fontWeight = computed.fontWeight;
      element.style.lineHeight = computed.lineHeight;
      bio.appendChild(element);
      layers.push({ element: element, lag: lag, opacity: opacity, rotation: 0 });
    }

    function start() {
      if (isRunning) {
        finish();
        return;
      }

      if (reducedMotion && reducedMotion.matches) {
        playReducedFeedback();
        return;
      }

      var triggerRect = trigger.getBoundingClientRect();
      var bioRect = bio.getBoundingClientRect();
      if (!triggerRect.width || !triggerRect.height || !bioRect.width || !bioRect.height) return;

      var isMobile = mobileViewport && mobileViewport.matches;
      var computed = window.getComputedStyle(trigger);
      var flightScale = isMobile ? 0.62 : 0.68;
      var horizontalGap = isMobile ? 5 : 8;
      var verticalGap = isMobile ? 5 : 7;
      var edgeReach = isMobile ? 7 : 10;
      var verticalReach = isMobile ? 10 : 14;
      var viewportCenterX = bioRect.left + bioRect.width / 2;
      var center = {
        x: bioRect.width / 2,
        y: bioRect.height / 2
      };
      var radiusX = Math.min(
        bioRect.width / 2 + horizontalGap,
        viewportCenterX - triggerRect.width * flightScale / 2 - 5,
        window.innerWidth - viewportCenterX - triggerRect.width * flightScale / 2 - 5
      );
      var config = {
        origin: {
          x: triggerRect.left - bioRect.left + triggerRect.width / 2,
          y: triggerRect.top - bioRect.top + triggerRect.height / 2
        },
        center: center,
        radiusX: Math.max(32, radiusX),
        radiusY: Math.max(28, bioRect.height / 2 + verticalGap),
        flightScale: flightScale
      };
      config.cornerRadius = Math.min(
        isMobile ? 38 : 48,
        config.radiusX * 0.25,
        config.radiusY * 0.58
      );
      var startState = orbitState(config, 0);
      config.orbitStart = startState.point;
      var startTangent = startState.tangent;
      config.orbitStartRotation = unwrapAxisRotation(rotationForTangent(startTangent), 0);
      config.launchControl1 = {
        x: config.origin.x,
        y: config.origin.y - verticalReach
      };
      config.launchControl2 = {
        x: config.orbitStart.x - startTangent.x * edgeReach,
        y: config.orbitStart.y - startTangent.y * edgeReach
      };
      config.returnControl1 = {
        x: config.orbitStart.x + startTangent.x * edgeReach,
        y: config.orbitStart.y + startTangent.y * edgeReach
      };
      config.returnControl2 = {
        x: config.origin.x,
        y: config.origin.y - verticalReach
      };

      TRAIL_LAGS.forEach(function (lag, index) {
        createLayer("intro-dropcap-orbit--trail", triggerRect, computed, lag, TRAIL_OPACITIES[index]);
      });
      createLayer("intro-dropcap-orbit--main", triggerRect, computed, 0, 1);

      isRunning = true;
      trigger.setAttribute("data-orbit-state", "running");
      trigger.setAttribute("aria-label", "I — stop the introduction orbit animation");
      var startTime = null;
      var duration = isMobile ? MOBILE_DURATION_MS : DESKTOP_DURATION_MS;

      function tick(timestamp) {
        if (startTime === null) startTime = timestamp;
        var progress = clamp((timestamp - startTime) / duration, 0, 1);
        var departureProgress = clamp(progress / 0.045, 0, 1);
        var settleProgress = clamp((progress - 0.925) / 0.075, 0, 1);
        var originOpacity = progress < 0.045
          ? mix(1, 0.16, departureProgress)
          : mix(0.16, 1, settleProgress);
        trigger.style.setProperty("--intro-dropcap-origin-opacity", originOpacity.toFixed(3));

        layers.forEach(function (layer) {
          var localProgress = clamp(progress - layer.lag, 0, 1);
          var state = pathState(config, localProgress);
          var fadeIn = clamp(localProgress / 0.045, 0, 1);
          var fadeOut = clamp((1 - progress) / 0.075, 0, 1);
          layer.rotation = unwrapAxisRotation(state.rotate, layer.rotation);
          layer.element.style.opacity = (layer.opacity * fadeIn * fadeOut).toFixed(3);
          layer.element.style.left = (state.point.x - triggerRect.width / 2).toFixed(2) + "px";
          layer.element.style.top = (state.point.y - triggerRect.height / 2).toFixed(2) + "px";
          layer.element.style.transform =
            "rotate(" + layer.rotation.toFixed(2) + "deg) " +
            "scale(" + state.scale.toFixed(4) + ")";
        });

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(tick);
        } else {
          finish();
        }
      }

      animationFrame = window.requestAnimationFrame(tick);
    }

    function cancelOnViewportChange() {
      if (isRunning) finish();
    }

    function handleKeydown(event) {
      if (event.key !== "Escape" || !isRunning) return;
      event.preventDefault();
      finish();
    }

    function handleMotionChange() {
      if (reducedMotion && reducedMotion.matches && isRunning) finish();
    }

    trigger.addEventListener("click", start);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("visibilitychange", cancelOnViewportChange);
    window.addEventListener("resize", cancelOnViewportChange);
    window.addEventListener("orientationchange", cancelOnViewportChange);

    if (reducedMotion) {
      if (typeof reducedMotion.addEventListener === "function") {
        reducedMotion.addEventListener("change", handleMotionChange);
      } else if (typeof reducedMotion.addListener === "function") {
        reducedMotion.addListener(handleMotionChange);
      }
    }
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll(".intro-dropcap-trigger"), setupDropcap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
