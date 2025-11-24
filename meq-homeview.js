/* meq-homeview.js
   Drop this AFTER your main canvas script in the HTML.

   This version:
   - View Home button stays centered under canvas.
   - "Activate Wormhole" button sits to the LEFT of View Home (same row),
     and ONLY appears while Home mode is active.
     When ON, inner ring spins backwards continuously.
   - Overlay button sits to the RIGHT of View Home (same row),
     and ONLY appears while Home mode is active.
   - ✅ Bottom row (ONLY visible in home mode):
       * "Reset Alignment"     -> aligns both rings + resets BOTH speeds + directions
       * "Slow Outer Ring"     -> slows only outer ring
       * "Slow Inner Ring"     -> slows only inner ring
       * "Reverse Outer Ring"  -> toggles outer ring direction
   - Wormhole coloring:
       * When wormholeActive: Earth→Moon spokes are GREEN
       * When wormholeActive: EXISTING Moon→Moon star lines become RED
         (no new moon-to-moon lines are added)
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
  const MIN_SPIN_SPEED  = 0.001;  // don't let it go to 0
  const SLOW_FACTOR     = 0.8;    // each click slows by 20%

  // z-index plan
  const Z_OVERLAY_CANVAS = 200;     // blocks clicks to underlying canvas
  const Z_MOON           = 350;     // home-view moons
  const Z_EARTH          = 400;     // home-view earths ABOVE moons/other overlays
  const Z_BTN_NORMAL     = 40;      // normal UI stacking when home view is off
  const Z_BTN_ACTIVE     = 450;     // clickable above overlay when home view is on

  let homeActive = false;
  let overlayOpaque = false; // black background toggle

  // rotations
  let homeRot = 0;   // outer ring accumulator
  let innerRot = 0;  // inner ring accumulator (independent)

  // speeds (mutable)
  let outerSpeed = BASE_SPIN_SPEED;
  let innerSpeed = BASE_SPIN_SPEED;

  // directions
  let outerDir = 1;  // +1 forward, -1 backward (button toggles this)
  let wormholeActive = false;
  let wormholeDir = 1;  // +1 forward, -1 reverse for INNER while wormhole ON

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

  let btnResetAlign = null;
  let btnSlowOuter  = null;
  let btnSlowInner  = null;
  let btnReverseOuter = null;

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

  function showHomeControls(show) {
    const disp = show ? "block" : "none";

    if (btnOverlay)       btnOverlay.style.display = disp;
    if (btnWormhole)      btnWormhole.style.display = disp;
    if (btnResetAlign)    btnResetAlign.style.display = disp;
    if (btnSlowOuter)     btnSlowOuter.style.display = disp;
    if (btnSlowInner)     btnSlowInner.style.display = disp;
    if (btnReverseOuter)  btnReverseOuter.style.display = disp;

    const z = show ? Z_BTN_ACTIVE : Z_BTN_NORMAL;
    [btnOverlay, btnWormhole, btnResetAlign, btnSlowOuter, btnSlowInner, btnReverseOuter].forEach(b => {
      if (b) b.style.zIndex = String(z);
    });
  }

  function updateReverseOuterLabel() {
    if (!btnReverseOuter) return;
    btnReverseOuter.textContent = (outerDir === 1) ? "Reverse Outer Ring" : "Forward Outer Ring";
  }

  function ensureButtons() {
    // Wormhole button (LEFT of View Home) — only visible in home mode
    if (!btnWormhole) {
      btnWormhole = document.createElement("button");
      btnWormhole.id = "wormholeBtn";
      btnWormhole.textContent = "Activate Wormhole";
      styleBasicButton(btnWormhole);
      btnWormhole.style.display = "none";
      btnWormhole.style.opacity = "0.9";
      document.body.appendChild(btnWormhole);

      btnWormhole.addEventListener("click", () => {
        wormholeActive = !wormholeActive;

        if (wormholeActive) {
          btnWormhole.textContent = "Deactivate Wormhole";
          wormholeDir = -1; // reverse inner while active
        } else {
          btnWormhole.textContent = "Activate Wormhole";
          wormholeDir = 1;  // forward inner when off
        }
      });
    }

    // Reset alignment + speed + directions
    if (!btnResetAlign) {
      btnResetAlign = document.createElement("button");
      btnResetAlign.id = "resetAlignBtn";
      btnResetAlign.textContent = "Reset Alignment";
      styleBasicButton(btnResetAlign);
      btnResetAlign.style.display = "none";
      btnResetAlign.style.opacity = "0.9";
      document.body.appendChild(btnResetAlign);

      btnResetAlign.addEventListener("click", () => {
        // align both rings + reset speeds + directions
        homeRot = 0;
        innerRot = 0;

        outerSpeed = BASE_SPIN_SPEED;
        innerSpeed = BASE_SPIN_SPEED;

        outerDir = 1;
        wormholeActive = false;
        wormholeDir = 1;

        if (btnWormhole) btnWormhole.textContent = "Activate Wormhole";
        updateReverseOuterLabel();
      });
    }

    // Slow outer
    if (!btnSlowOuter) {
      btnSlowOuter = document.createElement("button");
      btnSlowOuter.id = "slowOuterBtn";
      btnSlowOuter.textContent = "Slow Outer Ring";
      styleBasicButton(btnSlowOuter);
      btnSlowOuter.style.display = "none";
      btnSlowOuter.style.opacity = "0.9";
      document.body.appendChild(btnSlowOuter);

      btnSlowOuter.addEventListener("click", () => {
        outerSpeed = Math.max(MIN_SPIN_SPEED, outerSpeed * SLOW_FACTOR);
      });
    }

    // Slow inner
    if (!btnSlowInner) {
      btnSlowInner = document.createElement("button");
      btnSlowInner.id = "slowInnerBtn";
      btnSlowInner.textContent = "Slow Inner Ring";
      styleBasicButton(btnSlowInner);
      btnSlowInner.style.display = "none";
      btnSlowInner.style.opacity = "0.9";
      document.body.appendChild(btnSlowInner);

      btnSlowInner.addEventListener("click", () => {
        innerSpeed = Math.max(MIN_SPIN_SPEED, innerSpeed * SLOW_FACTOR);
      });
    }

    // ✅ Reverse outer direction
    if (!btnReverseOuter) {
      btnReverseOuter = document.createElement("button");
      btnReverseOuter.id = "reverseOuterBtn";
      btnReverseOuter.textContent = "Reverse Outer Ring";
      styleBasicButton(btnReverseOuter);
      btnReverseOuter.style.display = "none";
      btnReverseOuter.style.opacity = "0.9";
      document.body.appendChild(btnReverseOuter);

      btnReverseOuter.addEventListener("click", () => {
        outerDir *= -1;
        updateReverseOuterLabel();
      });
    }

    // View Home (center)
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
        btnHome.style.zIndex = String(homeActive ? Z_BTN_ACTIVE : Z_BTN_NORMAL);

        ensureOverlayCanvas();
        ensureGifOverlays();
        ensureButtons();

        overlayCanvas.style.display = homeActive ? "block" : "none";
        setGifVisible(homeActive);

        if (homeActive) {
          showHomeControls(true);

          btnOverlay.textContent  = overlayOpaque ? "Transparent Mode" : "Disable Transparency";
          btnWormhole.textContent = wormholeActive ? "Deactivate Wormhole" : "Activate Wormhole";
          updateReverseOuterLabel();

          // on entering home view, align rings (but don't reset speeds)
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
          showHomeControls(false);

          if (savedEyeState) {
            if (savedEyeState.eyeWasEnabled) window._meqEyeEnabled = true;
            if (savedEyeState.autoWasEnabled) window._meqEyeAutoTraverse = true;
            savedEyeState = null;
          }
        }

        positionButtonAndOverlay();
      });
    }

    // Overlay button (RIGHT of View Home)
    if (!btnOverlay) {
      btnOverlay = document.createElement("button");
      btnOverlay.id = "overlayModeBtn";
      btnOverlay.textContent = "Disable Transparency";
      styleBasicButton(btnOverlay);
      btnOverlay.style.display = "none";
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

    return {
      btnHome, btnOverlay, btnWormhole,
      btnResetAlign, btnSlowOuter, btnSlowInner, btnReverseOuter
    };
  }

  function positionButtonAndOverlay() {
    const mainCanvas = window.meqCanvas?.canvas || document.getElementById("mequavis");
    if (!mainCanvas) return;

    const rect = mainCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;

    const row1Y = rect.bottom - 40; // main row
    const row2Y = row1Y + 34;       // second row

    // View Home centered (row 1)
    if (btnHome) {
      btnHome.style.left = `${cx}px`;
      btnHome.style.top  = `${row1Y}px`;
    }

    // row 1: wormhole LEFT, overlay RIGHT
    if (btnWormhole && homeActive && btnWormhole.style.display !== "none") {
      const gap = 12;
      const homeRect = btnHome.getBoundingClientRect();
      const wormRect = btnWormhole.getBoundingClientRect();
      const wormCenterX = homeRect.left - gap - wormRect.width / 2;

      btnWormhole.style.left = `${wormCenterX}px`;
      btnWormhole.style.top  = `${row1Y}px`;
    }

    if (btnOverlay && homeActive && btnOverlay.style.display !== "none") {
      const gap = 12;
      const homeRect = btnHome.getBoundingClientRect();
      const overlayRect = btnOverlay.getBoundingClientRect();
      const overlayCenterX = homeRect.right + gap + overlayRect.width / 2;

      btnOverlay.style.left = `${overlayCenterX}px`;
      btnOverlay.style.top  = `${row1Y}px`;
    }

    // row 2: four buttons centered as a group
    if (homeActive) {
      const buttonsRow2 = [
        btnResetAlign, btnSlowOuter, btnSlowInner, btnReverseOuter
      ].filter(b => b && b.style.display !== "none");

      if (buttonsRow2.length) {
        const gap = 10;

        const widths = buttonsRow2.map(b => b.getBoundingClientRect().width);
        const totalW = widths.reduce((a,b)=>a+b,0) + gap * (buttonsRow2.length - 1);

        let startX = cx - totalW / 2;
        for (let i = 0; i < buttonsRow2.length; i++) {
          const b = buttonsRow2[i];
          const w = widths[i];
          const centerXbtn = startX + w / 2;
          b.style.left = `${centerXbtn}px`;
          b.style.top  = `${row2Y}px`;
          startX += w + gap;
        }
      }
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
    const rotInner = innerRot;

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

    // spokes (Earth→Moon)
    ctx.lineWidth = 2.5;
    innerCoords.forEach((inner) => {
      const [a, b] = inner.pair;
      const oa = outerCoords.find(o => o.num === a);
      const ob = outerCoords.find(o => o.num === b);

      if (oa) {
        ctx.strokeStyle = wormholeActive ? "#00ff00" : getNodeColor(a);
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(oa.x, oa.y);
        ctx.stroke();
      }
      if (ob) {
        ctx.strokeStyle = wormholeActive ? "#00ff00" : getNodeColor(b);
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(ob.x, ob.y);
        ctx.stroke();
      }
    });

    // inner 6-node star (Moon→Moon) — ONLY existing parity lines
    for (let i = 0; i < innerCoords.length; i++) {
      for (let j = i + 1; j < innerCoords.length; j++) {
        const a = innerCoords[i];
        const b = innerCoords[j];

        const aOdd = a.num % 2 !== 0;
        const bOdd = b.num % 2 !== 0;

        if (aOdd && bOdd) {
          ctx.strokeStyle = wormholeActive ? "red" : "#FF00FF";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (!aOdd && !bOdd) {
          ctx.strokeStyle = wormholeActive ? "red" : "#FF0000";
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
        // outer ring uses outerDir
        homeRot += outerSpeed * outerDir;

        // inner ring: reverse if wormhole, otherwise forward
        innerRot += innerSpeed * (wormholeActive ? wormholeDir : 1);
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
