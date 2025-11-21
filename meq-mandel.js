// meq-mandel.js
// Mandelbrot viewer driven by window.segmentHistory / global segmentHistory.
// No more mandelbrotZoomStep(fullAddress) from the click handler.
// The right-panel button just calls global showMandelPanel().

(function () {
  if (window._meqMandelPatched) return;
  window._meqMandelPatched = true;

  let mandelPanel   = null;
  let mandelCanvas  = null;
  let mandelCtx     = null;

  // Current view
  let mandelCenterX   = -0.75;
  let mandelCenterY   = 0.0;
  let mandelScale     = 3.0;   // width of visible region in the complex plane
  let mandelZoomLevel = 0;

  // Playback / segment stepping
  let mandelPlaybackIndex   = 0;      // index into segment history
  let mandelPlaybackTimer   = null;
  let mandelPlaybackPlaying = false;
  const MANDEL_PLAY_DELAY   = 1500;   // ms between auto-steps

  // Last *good* boundary view we know about
  let lastInterestingCenterX = -0.75;
  let lastInterestingCenterY = 0.0;
  let lastInterestingScale   = 3.0;
  let hasLastInteresting     = true;  // base view is interesting

  // Minimum "interestingness" score required to accept a new zoom
  const MIN_INTERESTING_SCORE = 10;

  // ========= BASIC UTILS =========

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

    const nx = xVal / max; // 0..1
    const ny = yVal / max; // 0..1

    // Standard Mandelbrot window:
    // real: [-2, 1], imag: [-1.5, 1.5]
    const cx = -2   + nx * 3;
    const cy = -1.5 + ny * 3;
    return { cx, cy };
  }

  // Render full 800x800 view at current center/scale
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
          // In set: black
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

  // ========= FAST "INTERESTINGNESS" EVALUATION =========
  // Coarse grid + low iterations to detect whether a region is actually
  // on a detailed Mandelbrot boundary, vs flat gradient / solid color.

  function evaluateCenterInteresting(cx, cy, scale) {
    const grid    = 22;     // 22x22 = 484 samples
    const maxIter = 60;     // low, just for classification

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

    // Pure black or pure exterior: boring, treat as "all one color".
    if (!sawInside || !sawOutside) return 0;

    const spread = maxEscIter - minEscIter;

    // If spread is too small, it's basically a flat gradient → boring.
    if (spread <= maxIter * 0.30) return 0;

    // Score = how wide the escape band is.
    return spread;
  }

  // Deterministic pseudo-random generator seeded from address digits
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

  // Given the last interesting view + an address, pick candidate offsets
  // near that point at a *specific target scale* and choose the most detailed.
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
      const rFrac = 0.05 + 0.55 * rng(); // between 0.05 and 0.60 of view width
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

    return {
      cx: bestCx,
      cy: bestCy,
      score: bestScore
    };
  }

  // ========= SEGMENT / INFO HELPERS =========

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
    } catch (e) {
      // segmentHistory might not exist; ignore
    }

    return null;
  }

  // 🔹 Build a human-readable unique name for a segment entry:
  //    G<gasket> or G<gasket>^<power> + S<segment>
  function makeSegmentName(entry) {
    if (!entry) return "";
    const g = entry.gasket;
    const p = entry.power;
    const s = entry.segment;

    let gPart = (g !== undefined) ? `G${g}` : "G?";
    if (p !== undefined && p !== 1) {
      gPart += `^${p}`;
    }

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

  // ========= STEP LOGIC (strict: 1 segment = 1 zoom if accepted) =========

  // Returns true if the zoom was accepted (we zoomed in), false otherwise.
  function applyAddressStep(address, idx, total, segmentName) {
    const addr        = address || "0";
    const targetZoom  = mandelZoomLevel + 1;
    const targetScale = 3.0 * Math.pow(0.5, targetZoom);

    const proposal = findFractalCenterForStep(addr, targetScale);
    const score    = proposal.score || 0;

    // If the candidate region is "all one color" / boring,
    // DO NOT commit the zoom and DO NOT advance the segment index.
    if (score < MIN_INTERESTING_SCORE) {
      refreshInfoMessage(
        `${segmentName || "Segment"}: no usable boundary at this zoom, step not advanced.`
      );
      return false;
    }

    // Accept the new, interesting zoom
    mandelZoomLevel = targetZoom;
    mandelScale     = targetScale;
    mandelCenterX   = proposal.cx;
    mandelCenterY   = proposal.cy;

    // Commit as new "last interesting" shoreline
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

    // ✅ Only advance to the next segment if we actually zoomed.
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

      const ok = applyAddressStep(
        info.address,
        info.index,
        info.total,
        info.segmentName
      );

      // For autoplay, if step fails we still move on so the movie doesn't hang,
      // but we don't change zoom on that step.
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

  // ========= DOWNLOAD CURRENT IMAGE =========

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

  // ========= DOM INIT / CONTROLS =========

  function setupControls() {
    if (!mandelPanel || !mandelCanvas) return;

    const headerRow = mandelPanel.querySelector("div");
    if (!headerRow) return;

    const closeBtn = document.getElementById("mandelClose");

    // NEXT STEP
    let nextBtn = document.getElementById("mandelNext");
    if (!nextBtn) {
      nextBtn = document.createElement("button");
      nextBtn.id          = "mandelNext";
      nextBtn.textContent = "NEXT STEP";
      nextBtn.style.background  = "#111";
      nextBtn.style.color       = "#0ff";
      nextBtn.style.border      = "1px solid #0ff";
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

    // DOWNLOAD button (between NEXT STEP and PLAY)
    let downloadBtn = document.getElementById("mandelDownload");
    if (!downloadBtn) {
      downloadBtn = document.createElement("button");
      downloadBtn.id          = "mandelDownload";
      downloadBtn.textContent = "DOWNLOAD";
      downloadBtn.style.background  = "#111";
      downloadBtn.style.color       = "#0ff";
      downloadBtn.style.border      = "1px solid #0ff";
      downloadBtn.style.fontFamily  = "monospace";
      downloadBtn.style.fontSize    = "11px";
      downloadBtn.style.padding     = "2px 8px";
      downloadBtn.style.cursor      = "pointer";
      downloadBtn.style.marginRight = "4px";

      downloadBtn.addEventListener("click", downloadCurrentFrame);

      headerRow.appendChild(downloadBtn);
    }

    // PLAY / PAUSE
    let playBtn = document.getElementById("mandelPlay");
    if (!playBtn) {
      playBtn = document.createElement("button");
      playBtn.id          = "mandelPlay";
      playBtn.textContent = "PLAY";
      playBtn.style.background  = "#111";
      playBtn.style.color       = "#0ff";
      playBtn.style.border      = "1px solid #0ff";
      playBtn.style.fontFamily  = "monospace";
      playBtn.style.fontSize    = "11px";
      playBtn.style.padding     = "2px 8px";
      playBtn.style.cursor      = "pointer";
      playBtn.style.marginRight = "4px";

      playBtn.addEventListener("click", togglePlayback);

      headerRow.appendChild(playBtn);
    }

    // Ensure button order: NEXT, DOWNLOAD, PLAY, CLOSE
    [nextBtn, downloadBtn, playBtn, closeBtn].forEach(btn => {
      if (btn && btn.parentNode === headerRow) {
        headerRow.removeChild(btn);
      }
    });
    if (nextBtn)     headerRow.appendChild(nextBtn);
    if (downloadBtn) headerRow.appendChild(downloadBtn);
    if (playBtn)     headerRow.appendChild(playBtn);
    if (closeBtn)    headerRow.appendChild(closeBtn);

    // Info line
    if (!document.getElementById("mandelInfo")) {
      const info = document.createElement("div");
      info.id = "mandelInfo";
      info.style.marginTop    = "-14px";
      info.style.marginLeft   = "100px";
      info.style.marginBottom = "2px";
      info.style.fontFamily   = "monospace";
      info.style.fontSize     = "11px";
      info.style.color        = "#0ff";

      mandelPanel.insertBefore(info, mandelCanvas);
    }
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
    return true;
  }

  // ========= GLOBAL ENTRYPOINT =========

  window.showMandelPanel = function () {
    if (!initMandelDom()) return;

    mandelPanel.style.display = "block";
    resetView();
  };

  console.log("[meq-mandel] Mandelbrot viewer ready (strict per-segment zoom + snapback + download).");
})();
