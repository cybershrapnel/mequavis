// meq-tone-engine.js
// Uses the 7 seeker color swatches (in #seekerStatusContent) to play tones.
//
// - Adds a "Seeker Tone Engine" panel under the Segments area in #segmentLog.
// - Sliders let you morph the instrument:
//      * Base Frequency (Hz)
//      * Range (Octaves)
//      * Tone Duration (seconds)
//      * Master Volume
// - Each of the 7 color swatches triggers a short tone whenever its color changes.
// - Color → frequency mapping:
//      * Convert color to HSL, use hue as position on a spiral/overtone wheel.
//      * freq = baseFreq * 2^(hueNormalized * rangeOctaves)
// - "Play Tones" / "Disable Tones" button toggles the engine on/off.

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
  let volume = 0.3;        // 0..1

  // Last seen swatch colors (7 slots)
  let lastColors = new Array(7).fill(null);

  // Utility: create audio context lazily
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

  // Utility: parse CSS color string -> {r,g,b}
  function parseColorToRGB(str) {
    if (!str || str === "transparent") return null;

    // rgb(...) case
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

    // Hex #rrggbb
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

    // Fallback: let browser compute it via a temp element
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

  // RGB -> HSL (0..1 each), we only care about hue
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
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  // Map a color string to a frequency in Hz
  function colorToFrequency(colorStr) {
    const rgb = parseColorToRGB(colorStr);
    if (!rgb) return baseFreq;

    const { h } = rgbToHsl(rgb.r, rgb.g, rgb.b); // 0..1
    const hueNorm = isNaN(h) ? 0 : h;            // safety

    // Spiral/octave mapping:
    //   freq = baseFreq * 2^(hue * rangeOctaves)
    const f = baseFreq * Math.pow(2, hueNorm * rangeOctaves);
    return f;
  }

  // Actually play a tone for a color
  function playToneForColor(colorStr) {
    if (!tonesEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const freq = colorToFrequency(colorStr);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine"; // could randomize or vary by swatch/index if you want
    osc.frequency.value = freq;

    gain.gain.value = 0;
    gain.connect(masterGain);
    osc.connect(gain);

    const now = ctx.currentTime;
    const dur = toneDuration;

    // Simple attack/decay envelope
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

  // Read the 7 swatches from seekerStatusContent
  function getCurrentSwatchColors() {
    const result = new Array(7).fill(null);
    const content = document.getElementById("seekerStatusContent");
    if (!content) return result;

    // Swatches are divs with width:18px;height:18px; in that flex row.
    const swatches = content.querySelectorAll(
      'div[style*="width:18px"][style*="height:18px"]'
    );
    if (!swatches.length) return result;

    for (let i = 0; i < 7 && i < swatches.length; i++) {
      const el = swatches[i];
      const bg = el.style.backgroundColor || "";
      if (bg && bg !== "transparent") {
        result[i] = bg;
      } else {
        result[i] = null;
      }
    }
    return result;
  }

  // Detect swatch color changes and trigger tones
  function handleSwatchChanges() {
    const current = getCurrentSwatchColors();
    for (let i = 0; i < current.length; i++) {
      const now = current[i];
      const prev = lastColors[i];
      if (now !== prev && now) {
        // color changed to a non-null color → play tone
        playToneForColor(now);
      }
    }
    lastColors = current;
  }

  // Build Tone Panel UI under Segments in #segmentLog
  function buildTonePanel() {
    const panel = document.getElementById("segmentLog");
    if (!panel) return;

    if (document.getElementById("tonePanel")) return; // already built

    const tonePanel = document.createElement("div");
    tonePanel.id = "tonePanel";
    tonePanel.style.marginTop = "6px";
    tonePanel.style.borderTop = "1px solid #222";
    tonePanel.style.paddingTop = "6px";
    tonePanel.style.fontSize = "11px";
    tonePanel.style.color = "#0ff";

    tonePanel.innerHTML = `
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

      <div style="margin-bottom:6px;">
        <label>Volume:
          <span id="toneVolumeValue">${(volume * 100).toFixed(0)}%</span>
        </label><br>
        <input id="toneVolume" type="range" min="0" max="1" step="0.05" value="${volume}"
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
      ">Play Tones</button>
    `;

    panel.appendChild(tonePanel);

    // Wire sliders
    const baseSlider = document.getElementById("toneBaseFreq");
    const baseLabel  = document.getElementById("toneBaseFreqValue");
    const rangeSlider = document.getElementById("toneRange");
    const rangeLabel  = document.getElementById("toneRangeValue");
    const durSlider = document.getElementById("toneDuration");
    const durLabel  = document.getElementById("toneDurationValue");
    const volSlider = document.getElementById("toneVolume");
    const volLabel  = document.getElementById("toneVolumeValue");
    const toggleBtn = document.getElementById("toneToggleBtn");

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
        volume = parseFloat(volSlider.value) || 0.3;
        volLabel.textContent = `${(volume * 100).toFixed(0)}%`;
        if (masterGain) {
          masterGain.gain.value = volume;
        }
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", async () => {
        const ctx = ensureAudioContext();
        if (!ctx) return;

        // Resume context if needed (autoplay policies)
        if (ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch (e) {
            console.warn("[meq-tone-engine] resume failed:", e);
          }
        }

        tonesEnabled = !tonesEnabled;
        toggleBtn.textContent = tonesEnabled ? "Disable Tones" : "Play Tones";
      });
    }
  }

  // Watch seeker swatches for changes using MutationObserver
  function setupSwatchObserver() {
    const target = document.getElementById("seekerStatusContent");
    if (!target) return false;

    const observer = new MutationObserver(() => {
      handleSwatchChanges();
    });

    observer.observe(target, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["style", "class"]
    });

    // Prime initial state
    lastColors = getCurrentSwatchColors();
    return true;
  }

  // Bootstrap: wait for DOM and seeker block to exist
  function initWhenReady() {
    const panel = document.getElementById("segmentLog");
    const seeker = document.getElementById("seekerStatusContent");

    if (panel && seeker) {
      buildTonePanel();
      setupSwatchObserver();
      return true;
    }
    return false;
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    // try now, or poll
    if (!initWhenReady()) {
      const iv = setInterval(() => {
        if (initWhenReady()) clearInterval(iv);
      }, 500);
    }
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (!initWhenReady()) {
        const iv = setInterval(() => {
          if (initWhenReady()) clearInterval(iv);
        }, 500);
      }
    });
  }

  console.log("[meq-tone-engine] Seeker Tone Engine initialized.");
})();
