// meq-mandel.js
// Mandelbrot viewer driven by window.segmentHistory / global segmentHistory.
// No more mandelbrotZoomStep(fullAddress) from the click handler.
// The right-panel button just calls global showMandelPanel().
// UI UPDATE: NEXT / DOWNLOAD / PLAY + mandelInfo line follow UI color picker.
// Header title + close button unchanged.

(function () {
  if (window._meqMandelPatched) return;
  window._meqMandelPatched = true;

  let mandelPanel   = null;
  let mandelCanvas  = null;
  let mandelCtx     = null;

  // ---------------------------------------------------------------------------
  // UI COLOR PICKER SUPPORT (buttons + mandelInfo line)
  // ---------------------------------------------------------------------------

  function readCssVar(styleObj, name) {
    try {
      const v = styleObj.getPropertyValue(name);
      return v ? v.trim() : "";
    } catch {
      return "";
    }
  }

  function getUIAccent() {
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);

      const candidates = [
        "--ui-accent",
        "--ui-color",
        "--meq-ui-accent",
        "--meq-ui-color",
        "--accent-color",
        "--primary-color",
        "--theme-accent",
        "--picker-color",
        "--picker-accent"
      ];

      for (const v of candidates) {
        const a = readCssVar(rootStyle, v) || readCssVar(bodyStyle, v);
        if (a) return a;
      }

      if (typeof window._meqUIColor === "string" && window._meqUIColor.trim()) {
        return window._meqUIColor.trim();
      }
      if (typeof window._meqUIAccent === "string" && window._meqUIAccent.trim()) {
        return window._meqUIAccent.trim();
      }
      if (typeof window.uiAccent === "string" && window.uiAccent.trim()) {
        return window.uiAccent.trim();
      }

      const storageKeys = [
        "uiAccent",
        "uiColor",
        "meqUIColor",
        "meq-ui-accent",
        "accentColor",
        "themeAccent",
        "pickerColor",
        "pickerAccent"
      ];
      for (const k of storageKeys) {
        const val = localStorage.getItem(k);
        if (val && val.trim()) return val.trim();
      }

      const probes = ["#segmentLog", "#rightPanel", "#layoutBtn", ".action-btn", "#aiInput", "#aiSend"];
      for (const sel of probes) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const cs = getComputedStyle(el);
        const borders = [
          cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor, cs.borderColor
        ].filter(Boolean);

        for (const bc of borders) {
          if (bc && bc !== "transparent" && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(bc)) {
            return bc;
          }
        }
        if (cs.color && cs.color !== "transparent") return cs.color;
      }
    } catch {}
    return "#0ff";
  }

  function getSoftHoverBg() {
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const soft =
        readCssVar(rootStyle, "--soft-border") ||
        readCssVar(bodyStyle, "--soft-border");
      if (soft) return soft;
    } catch {}
    return "#033";
  }

  let _lastAccent = null;
  function restyleMandelUI() {
    const accent = getUIAccent();
    if (!accent || accent === _lastAccent) {
      // still ensure info line survives DOM resets
      const info = document.getElementById("mandelInfo");
      if (info && accent) info.style.color = accent;
      return;
    }
    _lastAccent = accent;

    const hoverBg = getSoftHoverBg();
    const ids = ["mandelNext", "mandelDownload", "mandelPlay"];

    ids.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;

      btn.style.background = "#111";
      btn.style.color = accent;
      btn.style.border = `1px solid ${accent}`;
      btn.style.fontFamily = "monospace";
      btn.style.fontSize = "11px";
      btn.style.padding = "2px 8px";
      btn.style.cursor = "pointer";

      btn.onmouseenter = () => { btn.style.background = hoverBg; };
      btn.onmouseleave = () => { btn.style.background = "#111"; };
    });

    // ✅ Info line follows accent now
    const info = document.getElementById("mandelInfo");
    if (info) {
      info.style.color = accent;
    }
  }

  setInterval(restyleMandelUI, 300);

  // Current view
  let mandelCenterX   = -0.75;
  let mandelCenterY   = 0.0;
  let mandelScale     = 3.0;
  let mandelZoomLevel = 0;

  // Playback / segment stepping
  let mandelPlaybackIndex   = 0;
  let mandelPlaybackTimer   = null;
  let mandelPlaybackPlaying = false;
  const MANDEL_PLAY_DELAY   = 1500;

  // Last *good* boundary view we know about
  let lastInterestingCenterX = -0.75;
  let lastInterestingCenterY = 0.0;
  let lastInterestingScale   = 3.0;
  let hasLastInteresting     = true;

  const MIN_INTERESTING_SCORE = 10;

  function addressToDigits(addressStr) {
    const digits = (addressStr || "0").replace(/\D/g, "");
    return digits.length ? digits : "0";
  }

  function addressToComplex(addressStr) {
    const digits = addressToDigits(addressStr);
    const padded = digits.padStart(16, "0").slice(0, 16);
    const half   = 8;

    const xStr = padded.slice(0, half);
    const yStr = padded.slice(half);

    const max   = Math.pow(10, half) - 1;
    const xVal  = parseInt(xStr, 10) || 0;
    const yVal  = parseInt(yStr, 10) || 0;

    const nx = xVal / max;
    const ny = yVal / max;

    const cx = -2   + nx * 3;
    const cy = -1.5 + ny * 3;
    return { cx, cy };
  }

  function drawMandelbrot() {
    if (!mandelCanvas || !mandelCtx) return;
    const w = mandelCanvas.width;
    const h = mandelCanvas.height;

    const img     = mandelCtx.createImageData(w, h);
    const data    = img.data;
    const maxIter = 120 + mandelZoomLevel * 12;

    for (let py = 0; py < h; py++) {
      const y0 = mandelCenterY + (py - h / 2) * (mandelScale / h);

      for (let px = 0; px < w; px++) {
        const x0 = mandelCenterX + (px - w / 2) * (mandelScale / w);

        let x = 0, y = 0, iter = 0;
        while (x * x + y * y <= 4 && iter < maxIter) {
          const xTemp = x * x - y * y + x0;
          y = 2 * x * y + y0;
          x = xTemp;
          iter++;
        }

        const idx = (py * w + px) * 4;
        if (iter === maxIter) {
          data[idx]     = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        } else {
          const shade = Math.floor(255 * iter / maxIter);
          data[idx]     = shade;
          data[idx + 1] = (shade * 2) % 255;
          data[idx + 2] = (shade * 3) % 255;
        }
        data[idx + 3] = 255;
      }
    }

    mandelCtx.putImageData(img, 0, 0);
  }

  function evaluateCenterInteresting(cx, cy, scale) {
    const grid    = 22;
    const maxIter = 60;

    let sawInside  = false;
    let sawOutside = false;
    let minEscIter = Infinity;
    let maxEscIter = -1;

    for (let iy = 0; iy < grid; iy++) {
      const fy = (iy / (grid - 1)) - 0.5;
      const y0 = cy + fy * scale;

      for (let ix = 0; ix < grid; ix++) {
        const fx = (ix / (grid - 1)) - 0.5;
        const x0 = cx + fx * scale;

        let x = 0, y = 0, iter = 0;
        while (x * x + y * y <= 4 && iter < maxIter) {
          const xTemp = x * x - y * y + x0;
          y = 2 * x * y + y0;
          x = xTemp;
          iter++;
        }

        if (iter === maxIter) {
          sawInside = true;
        } else {
          sawOutside = true;
          if (iter < minEscIter) minEscIter = iter;
          if (iter > maxEscIter) maxEscIter = iter;
        }
      }
    }

    if (!sawInside || !sawOutside) return 0;

    const spread = maxEscIter - minEscIter;
    if (spread <= maxIter * 0.30) return 0;
    return spread;
  }

  function makeAddressRng(addressStr) {
    const digits = addressToDigits(addressStr);
    let seed = 0;
    for (let i = 0; i < digits.length; i++) {
      seed = (seed * 10 + (digits.charCodeAt(i) - 48)) >>> 0;
      seed ^= (seed << 13);
      seed ^= (seed >>> 17);
      seed ^= (seed << 5);
      seed >>>= 0;
    }
    if (seed === 0) seed = 123456789;

    return function rand() {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0xFFFFFFFF;
    };
  }

  function findFractalCenterForStep(addressStr, targetScale) {
    const baseCx = hasLastInteresting ? lastInterestingCenterX : -0.75;
    const baseCy = hasLastInteresting ? lastInterestingCenterY : 0.0;

    const rng           = makeAddressRng(addressStr);
    const numCandidates = 18;

    let bestCx    = baseCx;
    let bestCy    = baseCy;
    let bestScore = evaluateCenterInteresting(baseCx, baseCy, targetScale);

    for (let i = 0; i < numCandidates; i++) {
      const angle = 2 * Math.PI * rng();
      const rFrac = 0.05 + 0.55 * rng();
      const r     = targetScale * rFrac;

      const cx = baseCx + Math.cos(angle) * r;
      const cy = baseCy + Math.sin(angle) * r;

      const score = evaluateCenterInteresting(cx, cy, targetScale);
      if (score > bestScore) {
        bestScore = score;
        bestCx    = cx;
        bestCy    = cy;
      }
    }

    return { cx: bestCx, cy: bestCy, score: bestScore };
  }

  function getSegmentHistoryList() {
    if (Array.isArray(window.segmentHistory) && window.segmentHistory.length) {
      return window.segmentHistory;
    }

    try {
      if (
        typeof segmentHistory !== "undefined" &&
        Array.isArray(segmentHistory) &&
        segmentHistory.length
      ) {
        window.segmentHistory = segmentHistory;
        return segmentHistory;
      }
    } catch (e) {}

    return null;
  }

  function makeSegmentName(entry) {
    if (!entry) return "";
    const g = entry.gasket;
    const p = entry.power;
    const s = entry.segment;

    let gPart = (g !== undefined) ? `G${g}` : "G?";
    if (p !== undefined && p !== 1) gPart += `^${p}`;

    const sPart = (s !== undefined) ? `S${s}` : "S?";
    return `${gPart} ${sPart}`;
  }

  function getSegmentAddressForIndex(index) {
    const list = getSegmentHistoryList();
    if (!list || !list.length) return null;

    const total = list.length;
    if (index < 0 || index >= total) return null;

    const entry = list[index];
    if (!entry) return null;

    return {
      address: entry.address || "0",
      index,
      total,
      segmentName: makeSegmentName(entry)
    };
  }

  function refreshInfoFromState(address, idx, total, segmentName) {
    const info = document.getElementById("mandelInfo");
    if (!info) return;

    const step     = (typeof idx === "number")   ? idx + 1 : 0;
    const totalStr = (typeof total === "number") ? total   : 0;
    const zoom     = mandelZoomLevel;
    const scaleStr = mandelScale.toExponential(3);
    const cxStr    = mandelCenterX.toFixed(10);
    const cyStr    = mandelCenterY.toFixed(10);

    const segLabel = segmentName ? ` | ${segmentName}` : "";

    if (!address) {
      info.textContent =
        `Base view | Zoom ${zoom} | Scale ${scaleStr} | Center ${cxStr} + ${cyStr}i`;
      return;
    }

    info.textContent =
      `Step ${step}/${totalStr}${segLabel} | Zoom ${zoom} | Scale ${scaleStr} | ` +
      `Center ${cxStr} + ${cyStr}i | Address ${address}`;
  }

  function refreshInfoMessage(msg) {
    const info = document.getElementById("mandelInfo");
    if (!info) return;
    info.textContent = msg;
  }

  function applyAddressStep(address, idx, total, segmentName) {
    const addr        = address || "0";
    const targetZoom  = mandelZoomLevel + 1;
    const targetScale = 3.0 * Math.pow(0.5, targetZoom);

    const proposal = findFractalCenterForStep(addr, targetScale);
    const score    = proposal.score || 0;

    if (score < MIN_INTERESTING_SCORE) {
      refreshInfoMessage(
        `${segmentName || "Segment"}: no usable boundary at this zoom, step not advanced.`
      );
      return false;
    }

    mandelZoomLevel = targetZoom;
    mandelScale     = targetScale;
    mandelCenterX   = proposal.cx;
    mandelCenterY   = proposal.cy;

    lastInterestingCenterX = mandelCenterX;
    lastInterestingCenterY = mandelCenterY;
    lastInterestingScale   = mandelScale;
    hasLastInteresting     = true;

    drawMandelbrot();
    refreshInfoFromState(addr, idx, total, segmentName);
    return true;
  }

  function handleNextStep() {
    const segInfo = getSegmentAddressForIndex(mandelPlaybackIndex);
    if (!segInfo) {
      const list  = getSegmentHistoryList();
      const count = list ? list.length : 0;

      if (count === 0) {
        refreshInfoMessage("No segments recorded yet.");
      } else {
        refreshInfoMessage(
          `Reached end of segment history (${count} entries). ` +
          `Reset or open panel again to replay from the beginning.`
        );
      }
      return;
    }

    const ok = applyAddressStep(
      segInfo.address,
      segInfo.index,
      segInfo.total,
      segInfo.segmentName
    );

    if (ok) {
      mandelPlaybackIndex = segInfo.index + 1;
    }
  }

  function stopPlayback() {
    mandelPlaybackPlaying = false;
    if (mandelPlaybackTimer) {
      clearInterval(mandelPlaybackTimer);
      mandelPlaybackTimer = null;
    }
  }

  function startPlayback() {
    let segInfo = getSegmentAddressForIndex(mandelPlaybackIndex);
    if (!segInfo) {
      mandelPlaybackIndex = 0;
      segInfo = getSegmentAddressForIndex(mandelPlaybackIndex);
      if (!segInfo) {
        const list  = getSegmentHistoryList();
        const count = list ? list.length : 0;
        refreshInfoMessage(`No segments recorded yet (found ${count}).`);
        return false;
      }
    }

    mandelPlaybackPlaying = true;

    if (mandelPlaybackTimer) {
      clearInterval(mandelPlaybackTimer);
      mandelPlaybackTimer = null;
    }

    mandelPlaybackTimer = setInterval(() => {
      let info = getSegmentAddressForIndex(mandelPlaybackIndex);

      if (!info) {
        mandelPlaybackIndex = 0;
        info = getSegmentAddressForIndex(mandelPlaybackIndex);
        if (!info) {
          stopPlayback();
          const playBtn = document.getElementById("mandelPlay");
          if (playBtn) playBtn.textContent = "PLAY";
          return;
        }
      }

      applyAddressStep(
        info.address,
        info.index,
        info.total,
        info.segmentName
      );

      mandelPlaybackIndex = info.index + 1;
    }, MANDEL_PLAY_DELAY);

    return true;
  }

  function togglePlayback() {
    const btn = document.getElementById("mandelPlay");
    if (mandelPlaybackPlaying) {
      stopPlayback();
      if (btn) btn.textContent = "PLAY";
    } else {
      const ok = startPlayback();
      if (ok && btn) btn.textContent = "PAUSE";
    }
  }

  function downloadCurrentFrame() {
    if (!mandelCanvas) return;

    const link    = document.createElement("a");
    const dataURL = mandelCanvas.toDataURL("image/png");

    const currentIndex = Math.max(0, mandelPlaybackIndex - 1);
    const segInfo      = getSegmentAddressForIndex(currentIndex);
    const zoomLabel    = `Z${mandelZoomLevel}`;
    const stepLabel    = segInfo ? `S${segInfo.index + 1}` : "S0";
    const segmentName  = segInfo && segInfo.segmentName
      ? segInfo.segmentName.replace(/\s+/g, "_")
      : "base";

    link.href     = dataURL;
    link.download = `mandel_${segmentName}_${zoomLabel}_${stepLabel}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function setupControls() {
    if (!mandelPanel || !mandelCanvas) return;

    const headerRow = mandelPanel.querySelector("div");
    if (!headerRow) return;

    const closeBtn = document.getElementById("mandelClose");
    const accent = getUIAccent();

    let nextBtn = document.getElementById("mandelNext");
    if (!nextBtn) {
      nextBtn = document.createElement("button");
      nextBtn.id          = "mandelNext";
      nextBtn.textContent = "NEXT STEP";
      nextBtn.style.background  = "#111";
      nextBtn.style.color       = accent;
      nextBtn.style.border      = `1px solid ${accent}`;
      nextBtn.style.fontFamily  = "monospace";
      nextBtn.style.fontSize    = "11px";
      nextBtn.style.padding     = "2px 8px";
      nextBtn.style.cursor      = "pointer";
      nextBtn.style.marginRight = "4px";

      nextBtn.addEventListener("click", () => {
        if (mandelPlaybackPlaying) {
          stopPlayback();
          const play = document.getElementById("mandelPlay");
          if (play) play.textContent = "PLAY";
        }
        handleNextStep();
      });

      headerRow.appendChild(nextBtn);
    }

    let downloadBtn = document.getElementById("mandelDownload");
    if (!downloadBtn) {
      downloadBtn = document.createElement("button");
      downloadBtn.id          = "mandelDownload";
      downloadBtn.textContent = "DOWNLOAD";
      downloadBtn.style.background  = "#111";
      downloadBtn.style.color       = accent;
      downloadBtn.style.border      = `1px solid ${accent}`;
      downloadBtn.style.fontFamily  = "monospace";
      downloadBtn.style.fontSize    = "11px";
      downloadBtn.style.padding     = "2px 8px";
      downloadBtn.style.cursor      = "pointer";
      downloadBtn.style.marginRight = "4px";

      downloadBtn.addEventListener("click", downloadCurrentFrame);

      headerRow.appendChild(downloadBtn);
    }

    let playBtn = document.getElementById("mandelPlay");
    if (!playBtn) {
      playBtn = document.createElement("button");
      playBtn.id          = "mandelPlay";
      playBtn.textContent = "PLAY";
      playBtn.style.background  = "#111";
      playBtn.style.color       = accent;
      playBtn.style.border      = `1px solid ${accent}`;
      playBtn.style.fontFamily  = "monospace";
      playBtn.style.fontSize    = "11px";
      playBtn.style.padding     = "2px 8px";
      playBtn.style.cursor      = "pointer";
      playBtn.style.marginRight = "4px";

      playBtn.addEventListener("click", togglePlayback);

      headerRow.appendChild(playBtn);
    }

    [nextBtn, downloadBtn, playBtn, closeBtn].forEach(btn => {
      if (btn && btn.parentNode === headerRow) headerRow.removeChild(btn);
    });
    if (nextBtn)     headerRow.appendChild(nextBtn);
    if (downloadBtn) headerRow.appendChild(downloadBtn);
    if (playBtn)     headerRow.appendChild(playBtn);
    if (closeBtn)    headerRow.appendChild(closeBtn);

    if (!document.getElementById("mandelInfo")) {
      const info = document.createElement("div");
      info.id = "mandelInfo";
      info.style.marginTop    = "-14px";
      info.style.marginLeft   = "100px";
      info.style.marginBottom = "2px";
      info.style.fontFamily   = "monospace";
      info.style.fontSize     = "11px";
      info.style.color        = accent; // ✅ now follows picker

      mandelPanel.insertBefore(info, mandelCanvas);
    }

    restyleMandelUI();
  }

  function resetView() {
    mandelCenterX   = -0.75;
    mandelCenterY   = 0.0;
    mandelScale     = 3.0;
    mandelZoomLevel = 0;
    mandelPlaybackIndex = 0;

    lastInterestingCenterX = mandelCenterX;
    lastInterestingCenterY = mandelCenterY;
    lastInterestingScale   = mandelScale;
    hasLastInteresting     = true;

    drawMandelbrot();
    refreshInfoFromState(null, null, null, null);
  }

  function initMandelDom() {
    mandelPanel  = document.getElementById("mandelPanel");
    mandelCanvas = document.getElementById("mandelCanvas");

    if (!mandelPanel || !mandelCanvas) {
      console.warn("[meq-mandel] mandelPanel or mandelCanvas not found in DOM.");
      return false;
    }

    mandelCtx = mandelCanvas.getContext("2d");

    const closeBtn = document.getElementById("mandelClose");
    if (closeBtn && !closeBtn._meqMandelWire) {
      closeBtn._meqMandelWire = true;
      closeBtn.addEventListener("click", () => {
        stopPlayback();
        mandelPanel.style.display = "none";
      });
    }

    setupControls();

(function () {
  // 🔹 Pin the top flex header bar & make it click-through
  const flexBar = [...document.querySelectorAll("div")].find(el => {
    const cs = getComputedStyle(el);
    return (
      cs.display === "flex" &&
      cs.justifyContent === "space-between" &&
      cs.alignItems === "center" &&
      el.getBoundingClientRect().top < 150
    );
  });

  if (flexBar) {
    flexBar.style.position = "fixed";
    flexBar.style.top = "0px";
    flexBar.style.left = "400px";
    flexBar.style.right = "0px";
    flexBar.style.justifyContent = "right";
    flexBar.style.pointerEvents = "none"; // click-through
    console.log("✅ flex header bar pinned & click-through");
  }

  // 🔹 Lock mandelInfo at top-center, non-interactive
  const info = document.getElementById("mandelInfo");
  if (info) {
    info.style.setProperty("position", "fixed", "important");
    info.style.setProperty("top", "30px", "important");
    info.style.setProperty("left", "50%", "important");
    info.style.setProperty("transform", "translateX(-50%)", "important");
    info.style.setProperty("margin", "0", "important");
    info.style.setProperty("text-align", "center", "important");
    info.style.setProperty("background", "rgba(0,0,0,0.3)", "important");
    info.style.setProperty("padding", "2px 8px", "important");
    info.style.setProperty("border-radius", "4px", "important");
    info.style.setProperty("pointer-events", "none", "important"); // click-through
    console.log("✅ mandelInfo anchored & click-through");
  }

  // 🔹 Center mandelCanvas dead-even on screen, no border
  const mandelCanvas = document.getElementById("mandelCanvas");
  if (mandelCanvas) {
    function centerMandel() {
      mandelCanvas.style.setProperty("position", "fixed", "important");
      mandelCanvas.style.setProperty("top", "50%", "important");
      mandelCanvas.style.setProperty("left", "50%", "important");
      mandelCanvas.style.setProperty("transform", "translate(-50%, -50%)", "important");
      mandelCanvas.style.setProperty("margin", "0", "important");
      mandelCanvas.style.setProperty("pointer-events", "auto", "important");
      // explicitly kill any border we might have added earlier
      mandelCanvas.style.setProperty("border", "none", "important");
    }

    centerMandel();
    window.addEventListener("resize", centerMandel);

    console.log("✅ mandelCanvas centered dead-even, no border");
  }

  // 🔹 Keep Mandelbrot control buttons clickable
  ["mandelNext", "mandelDownload", "mandelPlay", "mandelClose"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.style.pointerEvents = "auto";
      console.log(`✅ ${id} still clickable`);
    }
  });
})();


    return true;
  }

  window.showMandelPanel = function () {
    if (!initMandelDom()) return;

    mandelPanel.style.display = "block";
    resetView();
    restyleMandelUI();
  };

  console.log("[meq-mandel] Mandelbrot viewer ready (strict per-segment zoom + snapback + download).");
})();
