// meq-tone-engine.js
// Seeker Tone Engine
//
// - Lives in #segmentLog, BEFORE the Segments header.
// - Uses the 7 seeker color swatches to generate tones:
//     * Any swatch color change → short tone (if tones enabled).
//     * Swatch #5 ALSO drives a constant beat whose tempo is adjustable.
// - Color → frequency mapping:
//     * Color -> RGB -> HSL -> Hue (0..1)
//     * freq = baseFreq * 2^(hue * rangeOctaves)

(function () {
  if (window._meqToneEngineInitialized) return;
  window._meqToneEngineInitialized = true;

  let audioCtx = null;
  let masterGain = null;

  let tonesEnabled = false;

  // Slider state
  let baseFreq = 440;      // Hz
  let rangeOctaves = 2;    // octaves
  let toneDuration = 0.2;  // seconds
  let volume = 0.05;        // 0..1
  let beatBpm = 120;       // BPM for swatch #5 beat

  // Beat timer
  let beatTimer = null;

  // Last seen swatch colors (7)
  let lastColors = new Array(7).fill(null);

  // Tone panel node
  let tonePanelEl = null;

  // ---------------------------------------------------------------------------
  // AUDIO HELPERS
  // ---------------------------------------------------------------------------

  function ensureAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        console.warn("[meq-tone-engine] Web Audio not supported.");
        return null;
      }
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(audioCtx.destination);
    }
    return audioCtx;
  }

  function parseColorToRGB(str) {
    if (!str || str === "transparent") return null;

    if (str.startsWith("rgb")) {
      const nums = str
        .replace(/[^\d,]/g, "")
        .split(",")
        .map((n) => parseInt(n.trim(), 10));
      if (nums.length >= 3) {
        return { r: nums[0], g: nums[1], b: nums[2] };
      }
      return null;
    }

    if (str[0] === "#") {
      let hex = str.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length !== 6) return null;
      const val = parseInt(hex, 16);
      return {
        r: (val >> 16) & 255,
        g: (val >> 8) & 255,
        b: val & 255
      };
    }

    try {
      const tmp = document.createElement("div");
      tmp.style.color = str;
      document.body.appendChild(tmp);
      const cs = getComputedStyle(tmp).color;
      document.body.removeChild(tmp);
      return parseColorToRGB(cs);
    } catch {
      return null;
    }
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  function colorToFrequency(colorStr) {
    const rgb = parseColorToRGB(colorStr);
    if (!rgb) return baseFreq;

    const { h } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hueNorm = isNaN(h) ? 0 : h;

    return baseFreq * Math.pow(2, hueNorm * rangeOctaves);
  }

  function playToneForColor(colorStr) {
    if (!tonesEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const freq = colorToFrequency(colorStr);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.value = 0;
    gain.connect(masterGain);
    osc.connect(gain);

    const now = ctx.currentTime;
    const dur = toneDuration;

    const attack = Math.min(0.02, dur * 0.2);
    const release = Math.min(0.08, dur * 0.4);
    const sustain = Math.max(0, dur - attack - release);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(1.0, now + attack);
    gain.gain.setValueAtTime(1.0, now + attack + sustain);
    gain.gain.linearRampToValueAtTime(0.0, now + attack + sustain + release);

    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  // ---------------------------------------------------------------------------
  // SWATCH HANDLING
  // ---------------------------------------------------------------------------

  function getCurrentSwatchColors() {
    const result = new Array(7).fill(null);
    const content = document.getElementById("seekerStatusContent");
    if (!content) return result;

    const swatches = content.querySelectorAll(
      'div[style*="width:18px"][style*="height:18px"]'
    );
    if (!swatches.length) return result;

    for (let i = 0; i < 7 && i < swatches.length; i++) {
      const el = swatches[i];
      const bg = el.style.backgroundColor || "";
      result[i] = (bg && bg !== "transparent") ? bg : null;
    }
    return result;
  }

  function handleSwatchChanges() {
    const current = getCurrentSwatchColors();
    for (let i = 0; i < current.length; i++) {
      const now = current[i];
      const prev = lastColors[i];
      if (now !== prev && now) {
        playToneForColor(now);
      }
    }
    lastColors = current;
  }

  // ---------------------------------------------------------------------------
  // BEAT LOOP (swatch #5)
  // ---------------------------------------------------------------------------

  function stopBeatLoop() {
    if (beatTimer) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
  }

  function scheduleBeatLoop() {
    stopBeatLoop();

    if (!tonesEnabled) return;
    if (!beatBpm || beatBpm <= 0) return;

    const intervalMs = Math.max(60, 60000 / beatBpm);

    beatTimer = setInterval(() => {
      const current = getCurrentSwatchColors();
      const sw5 = current[4];
      if (sw5) {
        playToneForColor(sw5);
      }
    }, intervalMs);
  }

  // ---------------------------------------------------------------------------
  // UI PANEL IN #segmentLog (before Segments)
  // ---------------------------------------------------------------------------

  function buildTonePanel() {
    const panel = document.getElementById("segmentLog");
    if (!panel || tonePanelEl) return;

    tonePanelEl = document.createElement("div");
    tonePanelEl.id = "tonePanel";
    tonePanelEl.style.marginTop = "6px";
    tonePanelEl.style.borderTop = "1px solid #222";
    tonePanelEl.style.paddingTop = "6px";
    tonePanelEl.style.fontSize = "11px";
    tonePanelEl.style.color = "#0ff";

    tonePanelEl.innerHTML = `
      <h3 style="font-size:11px;color:#0ff;margin:4px 0 4px;">Seeker Tone Engine</h3>

      <div style="margin-bottom:4px;">
        <label>Base Frequency:
          <span id="toneBaseFreqValue">${baseFreq.toFixed(0)} Hz</span>
        </label><br>
        <input id="toneBaseFreq" type="range" min="50" max="1000" value="${baseFreq}"
               style="width:100%;">
      </div>

      <div style="margin-bottom:4px;">
        <label>Range (Octaves):
          <span id="toneRangeValue">${rangeOctaves.toFixed(1)}</span>
        </label><br>
        <input id="toneRange" type="range" min="0.5" max="4" step="0.1" value="${rangeOctaves}"
               style="width:100%;">
      </div>

      <div style="margin-bottom:4px;">
        <label>Tone Duration:
          <span id="toneDurationValue">${toneDuration.toFixed(2)} s</span>
        </label><br>
        <input id="toneDuration" type="range" min="0.05" max="1" step="0.05" value="${toneDuration}"
               style="width:100%;">
      </div>

      <div style="margin-bottom:4px;">
        <label>Volume:
          <span id="toneVolumeValue">${(volume * 100).toFixed(0)}%</span>
        </label><br>
        <input id="toneVolume" type="range" min="0.01" max="1" step="0.01" value="${volume}"
               style="width:100%;">
      </div>


      <div style="margin-bottom:6px;">
        <label>Beat Tempo:
          <span id="toneTempoValue">${beatBpm.toFixed(0)} BPM</span>
        </label><br>
        <input id="toneTempo" type="range" min="40" max="240" value="${beatBpm}"
               style="width:100%;">
      </div>

      <button id="toneToggleBtn" style="
        width:100%;
        padding:4px;
        background:#111;
        color:#0ff;
        border:1px solid #0ff;
        border-radius:3px;
        cursor:pointer;
        font-size:11px;
        font-weight:bold;
      ">Enable Tones</button>
    `;

    // Insert BEFORE the Segments header if present, else at top
    const segmentsHeader =
      panel.querySelector("h2.segment-header") ||
      Array.from(panel.querySelectorAll("h2, h3")).find(h =>
        /segments/i.test((h.textContent || "").trim())
      );

    if (segmentsHeader && segmentsHeader.parentNode === panel) {
      panel.insertBefore(tonePanelEl, segmentsHeader);
    } else {
      panel.insertBefore(tonePanelEl, panel.firstChild);
    }

    wireTonePanelControls();
  }

  function wireTonePanelControls() {
    const baseSlider  = document.getElementById("toneBaseFreq");
    const baseLabel   = document.getElementById("toneBaseFreqValue");
    const rangeSlider = document.getElementById("toneRange");
    const rangeLabel  = document.getElementById("toneRangeValue");
    const durSlider   = document.getElementById("toneDuration");
    const durLabel    = document.getElementById("toneDurationValue");
    const volSlider   = document.getElementById("toneVolume");
    const volLabel    = document.getElementById("toneVolumeValue");
    const tempoSlider = document.getElementById("toneTempo");
    const tempoLabel  = document.getElementById("toneTempoValue");
    const toggleBtn   = document.getElementById("toneToggleBtn");

    if (baseSlider && baseLabel) {
      baseSlider.addEventListener("input", () => {
        baseFreq = parseFloat(baseSlider.value) || 440;
        baseLabel.textContent = `${baseFreq.toFixed(0)} Hz`;
      });
    }

    if (rangeSlider && rangeLabel) {
      rangeSlider.addEventListener("input", () => {
        rangeOctaves = parseFloat(rangeSlider.value) || 2;
        rangeLabel.textContent = rangeOctaves.toFixed(1);
      });
    }

    if (durSlider && durLabel) {
      durSlider.addEventListener("input", () => {
        toneDuration = parseFloat(durSlider.value) || 0.2;
        durLabel.textContent = `${toneDuration.toFixed(2)} s`;
      });
    }

    if (volSlider && volLabel) {
      volSlider.addEventListener("input", () => {
        let v = parseFloat(volSlider.value);
        if (isNaN(v)) {
          v = 0.05; // fallback to 5% if something goes weird
        }
        volume = v;
        volLabel.textContent = `${(volume * 100).toFixed(0)}%`;
        if (masterGain) {
          masterGain.gain.value = volume;
        }
      });
    }


    if (tempoSlider && tempoLabel) {
      tempoSlider.addEventListener("input", () => {
        beatBpm = parseFloat(tempoSlider.value) || 120;
        tempoLabel.textContent = `${beatBpm.toFixed(0)} BPM`;
        scheduleBeatLoop();
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", async () => {
        const ctx = ensureAudioContext();
        if (!ctx) return;

        if (ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch (e) {
            console.warn("[meq-tone-engine] resume failed:", e);
          }
        }

        tonesEnabled = !tonesEnabled;
        toggleBtn.textContent = tonesEnabled ? "Disable Tones" : "Enable Tones";

        if (!tonesEnabled) {
          stopBeatLoop();
        } else {
          scheduleBeatLoop();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------

  function initToneEngine() {
    const panel = document.getElementById("segmentLog");
    if (!panel) return false;

    buildTonePanel();
    lastColors = getCurrentSwatchColors();

    // Poll only the swatches, panel is static now
    setInterval(handleSwatchChanges, 200);

    console.log("[meq-tone-engine] Seeker Tone Engine initialized.");
    return true;
  }

  function waitForPanel() {
    if (initToneEngine()) return;
    const iv = setInterval(() => {
      if (initToneEngine()) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    waitForPanel();
  } else {
    document.addEventListener("DOMContentLoaded", waitForPanel);
  }
})();
