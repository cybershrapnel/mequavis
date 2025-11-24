/* meq-homeview.js
   Drop this AFTER your main canvas script in the HTML.

   This version:
   - View Home button stays centered under canvas.
   - "Activate Wormhole" button sits to the LEFT of View Home (same row),
     and ONLY appears while Home mode is active.
     When ON, inner ring spins backwards continuously.
   - Overlay button sits to the RIGHT of View Home (same row),
     and ONLY appears while Home mode is active.
*/

(() => {
  // ---- config ----
  const EARTH_SRC = "earth.gif";
  const MOON_SRC  = "moon.gif";

  const OUTER_ORDER = [12,1,2,11,10,3,4,9,5,8,7,6];
  const INNER_PAIRS = [
    [12,1],[2,11],[10,3],[4,9],[5,8],[6,7]
  ];

  const FALLBACK_NODE_COLORS = {
    1:"#ff0000",12:"#ff0000",
    2:"#ffff00",11:"#ffff00",
    3:"#00ffff",10:"#00ffff",
    4:"#ff00ff",9:"#ff00ff",
    5:"#00ff00",8:"#00ff00",
    6:"#0000ff",7:"#0000ff",
    13:"#8888ff"
  };

  function getNodeColor(num) {
    try {
      if (window.nodeColors && window.nodeColors[num]) return window.nodeColors[num];
      if (typeof nodeColors !== "undefined" && nodeColors && nodeColors[num]) return nodeColors[num];
    } catch {}
    return FALLBACK_NODE_COLORS[num] || "#ffffff";
  }

  const EARTH_SCALE = 2.0;
  const MOON_SCALE  = 1.0;
  const BASE_SPIN_SPEED = 0.01;

  // z-index plan
  const Z_OVERLAY_CANVAS = 200;     // blocks clicks to underlying canvas
  const Z_MOON           = 350;     // home-view moons
  const Z_EARTH          = 400;     // home-view earths ABOVE moons/other overlays
  const Z_BTN_NORMAL     = 40;      // normal UI stacking when home view is off
  const Z_BTN_ACTIVE     = 450;     // clickable above overlay when home view is on

  let homeActive = false;
  let overlayOpaque = false; // black background toggle
  let homeRot = 0;

  // ✅ Wormhole state (continuous reverse while active)
  let wormholeActive = false;
  let wormholeDir = 1;  // +1 normal, -1 reverse
  let innerRot = 0;     // inner ring accumulator (so it doesn't snap)

  // Remember only what we actually change
  let savedEyeState = null;

  // Overlay canvas (top layer)
  let overlayCanvas = null;
  let overlayCtx = null;

  // DOM overlay gifs
  let outerImgs = [];
  let innerImgs = [];
  let centerImg = null;

  // Buttons
  let btnHome = null;
  let btnOverlay = null;
  let btnWormhole = null;

  function ensureOverlayCanvas() {
    if (overlayCanvas) return overlayCanvas;

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "meqHomeOverlayCanvas";
    overlayCanvas.style.position = "fixed";
    overlayCanvas.style.left = "0px";
    overlayCanvas.style.top = "0px";
    overlayCanvas.style.width = "0px";
    overlayCanvas.style.height = "0px";
    overlayCanvas.style.pointerEvents = "auto"; // block clicks-through
    overlayCanvas.style.zIndex = String(Z_OVERLAY_CANVAS);
    overlayCanvas.style.background = "transparent";

    document.body.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext("2d");

    overlayCanvas.style.display = "none";
    return overlayCanvas;
  }

  function ensureGifOverlays() {
    const mkImg = (src, cls, z) => {
      const im = document.createElement("img");
      im.src = src;
      im.className = cls;
      im.style.position = "fixed";
      im.style.left = "0px";
      im.style.top = "0px";
      im.style.width = "0px";
      im.style.height = "0px";
      im.style.transform = "translate(-50%, -50%)";
      im.style.pointerEvents = "none";
      im.style.userSelect = "none";
      im.style.zIndex = String(z);
      document.body.appendChild(im);
      return im;
    };

    if (!outerImgs.length) {
      outerImgs = OUTER_ORDER.map(() => mkImg(EARTH_SRC, "meqHomeOuterEarth", Z_EARTH));
      centerImg = mkImg(EARTH_SRC, "meqHomeCenterEarth", Z_EARTH);

      innerImgs = INNER_PAIRS.map(() => mkImg(MOON_SRC, "meqHomeInnerMoon", Z_MOON));

      setGifVisible(false);
    }
  }

  function setGifVisible(on) {
    ensureGifOverlays();
    const disp = on ? "block" : "none";
    outerImgs.forEach(im => im.style.display = disp);
    innerImgs.forEach(im => im.style.display = disp);
    centerImg.style.display = disp;
  }

  function styleBasicButton(b) {
    b.style.position = "fixed";
    b.style.zIndex = String(Z_BTN_NORMAL);
    b.style.padding = "6px 12px";
    b.style.fontSize = "12px";
    b.style.fontWeight = "bold";
    b.style.letterSpacing = "0.5px";
    b.style.borderRadius = "6px";
    b.style.border = "1px solid var(--meq-accent, #0ff)";
    b.style.background = "#111";
    b.style.color = "var(--meq-accent, #0ff)";
    b.style.cursor = "pointer";
    b.style.boxShadow = "0 0 6px rgba(0,0,0,0.6)";
    b.style.transform = "translateX(-50%)";
    b.style.whiteSpace = "nowrap";
  }

  function ensureButtons() {
    // ✅ Wormhole button (LEFT of View Home) — only visible in home mode
    if (!btnWormhole) {
      btnWormhole = document.createElement("button");
      btnWormhole.id = "wormholeBtn";
      btnWormhole.textContent = "Activate Wormhole";
      styleBasicButton(btnWormhole);
      btnWormhole.style.display = "none"; // ONLY visible in home mode
      btnWormhole.style.opacity = "0.9";
      document.body.appendChild(btnWormhole);

      btnWormhole.addEventListener("click", () => {
        wormholeActive = !wormholeActive;

        if (wormholeActive) {
          btnWormhole.textContent = "Deactivate Wormhole";

          // ✅ ALWAYS reverse when active
          wormholeDir = -1;

          // align inner to outer to avoid snap
          innerRot = homeRot;
        } else {
          btnWormhole.textContent = "Activate Wormhole";

          // ✅ normal when off
          wormholeDir = 1;

          // resync inner to outer
          innerRot = homeRot;
        }
      });
    }

    if (!btnHome) {
      btnHome = document.createElement("button");
      btnHome.id = "viewHomeBtn";
      btnHome.textContent = "View Quantum Moon Network";
      styleBasicButton(btnHome);
      document.body.appendChild(btnHome);

      btnHome.addEventListener("click", () => {
        homeActive = !homeActive;
        window._meqHomeViewActive = homeActive;

        btnHome.textContent = homeActive ? "Exit Moon Network" : "View Quantum Moon Network";

        // bump home button above overlay when active
        btnHome.style.zIndex = String(homeActive ? Z_BTN_ACTIVE : Z_BTN_NORMAL);

        ensureOverlayCanvas();
        ensureGifOverlays();
        ensureButtons(); // make sure overlay + wormhole buttons exist

        overlayCanvas.style.display = homeActive ? "block" : "none";
        setGifVisible(homeActive);

        if (homeActive) {
          // show overlay + wormhole buttons only in home mode
          btnOverlay.style.display = "block";
          btnOverlay.style.zIndex = String(Z_BTN_ACTIVE);
          btnOverlay.textContent = overlayOpaque ? "Transparent Mode" : "Disable Transparency";

          btnWormhole.style.display = "block";
          btnWormhole.style.zIndex = String(Z_BTN_ACTIVE);
          btnWormhole.textContent = wormholeActive ? "Deactivate Wormhole" : "Activate Wormhole";

          // align inner on entry
          innerRot = homeRot;

          const eyeWasEnabled =
            (typeof window._meqEyeEnabled !== "undefined") &&
            window._meqEyeEnabled === true;

          const autoWasEnabled =
            (typeof window._meqEyeAutoTraverse !== "undefined") &&
            window._meqEyeAutoTraverse === true;

          savedEyeState = { eyeWasEnabled, autoWasEnabled };

          window._meqEyeEnabled = false;
          window._meqEyeAutoTraverse = false;
        } else {
          // hide overlay + wormhole buttons when leaving home
          if (btnOverlay) {
            btnOverlay.style.display = "none";
            btnOverlay.style.zIndex = String(Z_BTN_NORMAL);
          }
          if (btnWormhole) {
            btnWormhole.style.display = "none";
            btnWormhole.style.zIndex = String(Z_BTN_NORMAL);
          }

          if (savedEyeState) {
            if (savedEyeState.eyeWasEnabled) window._meqEyeEnabled = true;
            if (savedEyeState.autoWasEnabled) window._meqEyeAutoTraverse = true;
            savedEyeState = null;
          }
        }

        positionButtonAndOverlay();
      });
    }

    if (!btnOverlay) {
      btnOverlay = document.createElement("button");
      btnOverlay.id = "overlayModeBtn";
      btnOverlay.textContent = "Disable Transparency";
      styleBasicButton(btnOverlay);
      btnOverlay.style.display = "none"; // ONLY visible in home mode
      btnOverlay.style.opacity = "0.9";
      document.body.appendChild(btnOverlay);

      btnOverlay.addEventListener("click", () => {
        overlayOpaque = !overlayOpaque;

        if (overlayCanvas) {
          overlayCanvas.style.background = overlayOpaque ? "#000" : "transparent";
        }

        btnOverlay.textContent = overlayOpaque ? "Transparent Mode" : "Disable Transparency";

        btnOverlay.style.opacity = overlayOpaque ? "1.0" : "0.9";
        btnOverlay.style.filter = overlayOpaque ? "drop-shadow(0 0 4px #000)" : "none";
      });
    }

    positionButtonAndOverlay();
    window.addEventListener("resize", positionButtonAndOverlay);
    window.addEventListener("scroll", positionButtonAndOverlay, true);

    return { btnHome, btnOverlay, btnWormhole };
  }

  function positionButtonAndOverlay() {
    const mainCanvas = window.meqCanvas?.canvas || document.getElementById("mequavis");
    if (!mainCanvas) return;

    const rect = mainCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const topRow = rect.bottom - 40;

    // View Home stays centered
    if (btnHome) {
      btnHome.style.left = `${cx}px`;
      btnHome.style.top  = `${topRow}px`;
    }

    // Wormhole button to LEFT of View Home, only if visible
    if (btnWormhole && homeActive && btnWormhole.style.display !== "none") {
      const gap = 12;
      const homeRect = btnHome.getBoundingClientRect();
      const wormRect = btnWormhole.getBoundingClientRect();

      const wormCenterX = homeRect.left - gap - wormRect.width / 2;

      btnWormhole.style.left = `${wormCenterX}px`;
      btnWormhole.style.top  = `${topRow}px`;
    }

    // Overlay button to RIGHT of View Home, only if visible
    if (btnOverlay && homeActive && btnOverlay.style.display !== "none") {
      const gap = 12;

      const homeRect = btnHome.getBoundingClientRect();
      const overlayRect = btnOverlay.getBoundingClientRect();

      const overlayCenterX = homeRect.right + gap + overlayRect.width / 2;

      btnOverlay.style.left = `${overlayCenterX}px`;
      btnOverlay.style.top  = `${topRow}px`;
    }

    // Overlay canvas exactly on top of main canvas
    if (overlayCanvas) {
      overlayCanvas.style.left = `${rect.left}px`;
      overlayCanvas.style.top  = `${rect.top}px`;
      overlayCanvas.style.width  = `${rect.width}px`;
      overlayCanvas.style.height = `${rect.height}px`;

      overlayCanvas.width  = mainCanvas.width;
      overlayCanvas.height = mainCanvas.height;
      overlayCanvas.style.zIndex = String(Z_OVERLAY_CANVAS);
      overlayCanvas.style.background = overlayOpaque ? "#000" : "transparent";
    }
  }

  function canvasToScreen(cx, cy) {
    const mainCanvas = window.meqCanvas?.canvas || document.getElementById("mequavis");
    if (!mainCanvas) return { x: 0, y: 0, sx: 1, sy: 1 };

    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = rect.width / mainCanvas.width;
    const scaleY = rect.height / mainCanvas.height;

    return {
      x: rect.left + cx * scaleX,
      y: rect.top  + cy * scaleY,
      sx: scaleX,
      sy: scaleY
    };
  }

  function drawHomeWheel() {
    if (!overlayCtx || !overlayCanvas) return;

    const ctx = overlayCtx;
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;

    if (overlayOpaque) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else {
      ctx.clearRect(0, 0, W, H);
    }

    const centerX = W / 2;
    const centerY = H / 2;

    const minDim = Math.min(W, H);
    const radiusOuter = minDim * 0.38;
    const radiusInner = radiusOuter * 0.50;

    const nodeSizeCanvas = minDim * 0.05;

    const rotOuter = homeRot;
    const rotInner = wormholeActive ? innerRot : homeRot;

    const outerCoords = OUTER_ORDER.map((num, i) => {
      const angle = (i / OUTER_ORDER.length) * Math.PI * 2 - Math.PI / 2 + rotOuter;
      return {
        num,
        x: centerX + Math.cos(angle) * radiusOuter,
        y: centerY + Math.sin(angle) * radiusOuter,
        angle
      };
    });

    const innerCoords = INNER_PAIRS.map((pair, i) => {
      const aIndex = OUTER_ORDER.indexOf(pair[0]);
      const bIndex = OUTER_ORDER.indexOf(pair[1]);
      const angleA = (aIndex / OUTER_ORDER.length) * Math.PI * 2 - Math.PI / 2 + rotInner;
      const angleB = (bIndex / OUTER_ORDER.length) * Math.PI * 2 - Math.PI / 2 + rotInner;
      const midAngle = (angleA + angleB) / 2;

      return {
        num: 14 + i,
        x: centerX + Math.cos(midAngle) * radiusInner,
        y: centerY + Math.sin(midAngle) * radiusInner,
        angle: midAngle,
        pair
      };
    });

    ctx.save();

    // spokes colored like outer nodes
    ctx.lineWidth = 2.5;
    innerCoords.forEach((inner) => {
      const [a, b] = inner.pair;
      const oa = outerCoords.find(o => o.num === a);
      const ob = outerCoords.find(o => o.num === b);

      if (oa) {
        ctx.strokeStyle = getNodeColor(a);
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(oa.x, oa.y);
        ctx.stroke();
      }
      if (ob) {
        ctx.strokeStyle = getNodeColor(b);
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(ob.x, ob.y);
        ctx.stroke();
      }
    });

    // inner 6-node star (two triangles)
    for (let i = 0; i < innerCoords.length; i++) {
      for (let j = i + 1; j < innerCoords.length; j++) {
        const a = innerCoords[i];
        const b = innerCoords[j];
        const aOdd = a.num % 2 !== 0;
        const bOdd = b.num % 2 !== 0;

        if (aOdd && bOdd) {
          ctx.strokeStyle = "#FF00FF";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (!aOdd && !bOdd) {
          ctx.strokeStyle = "#FF0000";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // inner ring RED
    ctx.strokeStyle = "red";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusInner + nodeSizeCanvas * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    // outer ring GREEN
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusOuter + nodeSizeCanvas * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    // center halo
    ctx.strokeStyle = "rgba(0,31,63,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, nodeSizeCanvas * 0.30, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    ensureGifOverlays();

    const earthSizeCanvas = nodeSizeCanvas * EARTH_SCALE;
    const moonSizeCanvas  = nodeSizeCanvas * MOON_SCALE;

    outerCoords.forEach((o, i) => {
      const s = canvasToScreen(o.x, o.y);
      const pxSize = earthSizeCanvas * s.sx;
      const im = outerImgs[i];
      im.style.left = `${s.x}px`;
      im.style.top  = `${s.y}px`;
      im.style.width  = `${pxSize}px`;
      im.style.height = `${pxSize}px`;
      im.style.zIndex = String(Z_EARTH);
    });

    innerCoords.forEach((inn, i) => {
      const s = canvasToScreen(inn.x, inn.y);
      const pxSize = moonSizeCanvas * s.sx;
      const im = innerImgs[i];
      im.style.left = `${s.x}px`;
      im.style.top  = `${s.y}px`;
      im.style.width  = `${pxSize}px`;
      im.style.height = `${pxSize}px`;
      im.style.zIndex = String(Z_MOON);
    });

    {
      const s = canvasToScreen(centerX, centerY);
      const pxSize = earthSizeCanvas * s.sx;
      centerImg.style.left = `${s.x}px`;
      centerImg.style.top  = `${s.y}px`;
      centerImg.style.width  = `${pxSize}px`;
      centerImg.style.height = `${pxSize}px`;
      centerImg.style.zIndex = String(Z_EARTH);
    }
  }

  function loop() {
    positionButtonAndOverlay();

    if (homeActive) {
      if (window._meqEyeEnabled) window._meqEyeEnabled = false;
      if (window._meqEyeAutoTraverse) window._meqEyeAutoTraverse = false;

      if (window._meqBigWheelSpinEnabled !== false) {
        // outer always forward
        homeRot += BASE_SPIN_SPEED;

        if (wormholeActive) {
          // inner spins continuously in chosen direction
          innerRot += BASE_SPIN_SPEED * wormholeDir;
        } else {
          // inner matches outer when wormhole off
          innerRot = homeRot;
        }
      }

      drawHomeWheel();
    } else {
      if (overlayCtx && overlayCanvas) {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
      setGifVisible(false);
      if (overlayCanvas) overlayCanvas.style.display = "none";
    }

    requestAnimationFrame(loop);
  }

  function init() {
    ensureOverlayCanvas();
    ensureButtons();
    ensureGifOverlays();
    loop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
