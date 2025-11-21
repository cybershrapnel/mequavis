// meq-toolkit.js
// "OPEN TOOLKIT" button -> movable mini phone dialer panel
// Now: CALL dials the Omniverse digits (0-9) via simulated canvas clicks,
// with 0.1s between each digit, max 17 digits.
// ADDED: DTMF-like dial tones on keypad button presses.
// ADDED: Auto dial controls (count + interval in ms).
// ADDED: Upload Dial Log -> read txt file, feed digits directly to nofurs handlers.

(function () {
  // 1) Find the OPEN TOOLKIT button
  let toolkitBtn = document.querySelector('.action-btn[data-action="open-tools"]')
    || document.querySelector('.action-btn[data-action="toolkit"]');

  if (!toolkitBtn) {
    toolkitBtn = Array.from(document.querySelectorAll(".action-btn")).find((btn) =>
      btn.textContent.trim().toUpperCase().includes("OPEN TOOLKIT")
    );
  }

  if (!toolkitBtn) {
    console.warn("meq-toolkit.js: OPEN TOOLKIT button not found.");
    return;
  }

  // Normalize button label
  toolkitBtn.textContent = "OPEN TOOLKIT";

  // 2) Create the floating dialer panel
  const panel = document.createElement("div");
  panel.id = "toolkitPanel";
  panel.style.cssText = `
    display: none;
    position: fixed;
    right: 20px;
    bottom: 90px;
    width: 220px;
    height: 330px;
    background: #111;
    border: 1px solid #0ff;
    border-radius: 6px;
    box-shadow: 0 0 12px rgba(0,255,255,0.25);
    z-index: 2000;
    font-family: monospace;
    color: #0ff;
    box-sizing: border-box;
    overflow: hidden;
  `;

  panel.innerHTML = `
    <div id="toolkitHeader" style="
      cursor: move;
      background: linear-gradient(135deg, #222, #555);
      color: #0ff;
      padding: 4px 6px;
      font-size: 11px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      border-bottom: 1px solid #0ff;
      text-shadow: 0 0 3px #000;
    ">
      <span>MEQUA TOOLKIT • DIALER</span>
      <button id="toolkitClose" style="
        background:#111;
        color:#0ff;
        border:1px solid #0ff;
        font-size:10px;
        padding:0 6px;
        cursor:pointer;
        border-radius:3px;
      ">X</button>
    </div>
    <div style="padding:6px; display:flex; flex-direction:column; height:calc(100% - 22px);">
      <div id="dialerDisplay" style="
        height:32px;
        background: radial-gradient(circle at 10% 10%, #222 0, #000 60%);
        border:1px inset #444;
        border-radius:3px;
        margin-bottom:6px;
        padding:4px 6px;
        font-size:13px;
        letter-spacing:1px;
        color:#0f0;
        overflow:hidden;
        white-space:nowrap;
      "></div>

      <!-- Auto dial row -->
      <div id="autoDialRow" style="
        display:flex;
        align-items:center;
        gap:4px;
        margin-bottom:4px;
        font-size:10px;
      ">
        <button id="autoDialStart" style="
          flex:0 0 auto;
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          border-radius:3px;
          padding:2px 6px;
          cursor:pointer;
        ">Auto dial</button>
        <input id="autoDialCount" type="number" min="0" value="0" style="
          flex:1 1 0;
          background:#000;
          color:#0ff;
          width:50px;
          border:1px solid #0ff;
          border-radius:3px;
          padding:2px 4px;
        " placeholder="# dials (0=∞)" />
        <input id="autoDialInterval" type="number" min="10" value="1000" style="
          flex:1 1 0;
          background:#000;
          color:#0ff;
          width:100px;
          border:1px solid #0ff;
          border-radius:3px;
          padding:2px 4px;
        " placeholder="ms" />
      </div>

      <div id="dialerPad" style="
        flex:1 1 auto;
        display:grid;
        grid-template-columns: repeat(3, 1fr);
        grid-auto-rows: 40px;
        gap:4px;
      "></div>
      <!-- Upload Dial Log row (under CALL) -->
      <div style="margin-top:4px;">
        <button id="uploadDialLog" style="
          width:100%;
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          border-radius:3px;
          font-size:11px;
          cursor:pointer;
          padding:3px 4px;
        ">Upload Dial Log</button>
        <input id="dialLogFileInput" type="file" accept=".txt" style="display:none;" />
      </div>
      <div style="margin-top:6px; display:flex; gap:4px;">
        <button id="dialerBackspace" style="
          flex:1;
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          border-radius:3px;
          font-size:11px;
          cursor:pointer;
        ">⌫</button>
        <button id="dialerClear" style="
          flex:1;
          background:#300;
          color:#f66;
          border:1px solid #f00;
          border-radius:3px;
          font-size:11px;
          cursor:pointer;
        ">CLR</button>
        <button id="dialerCall" style="
          flex:1;
          background:#030;
          color:#0f0;
          border:1px solid #0f0;
          border-radius:3px;
          font-size:11px;
          cursor:pointer;
        ">CALL</button>
      </div>


    </div>
  `;

  document.body.appendChild(panel);

  const headerEl   = panel.querySelector("#toolkitHeader");
  const closeBtn   = panel.querySelector("#toolkitClose");
  const displayEl  = panel.querySelector("#dialerDisplay");
  const padEl      = panel.querySelector("#dialerPad");
  const backspace  = panel.querySelector("#dialerBackspace");
  const clearBtn   = panel.querySelector("#dialerClear");
  const callBtn    = panel.querySelector("#dialerCall");

  // Auto dial controls
  const autoDialBtn           = panel.querySelector("#autoDialStart");
  const autoDialCountInput    = panel.querySelector("#autoDialCount");
  const autoDialIntervalInput = panel.querySelector("#autoDialInterval");

  // Upload dial log controls
  const uploadDialLogBtn = panel.querySelector("#uploadDialLog");
  const dialLogFileInput = panel.querySelector("#dialLogFileInput");

  // ---------------------------------------------------------------------------
  // 2.5) SIMPLE DTMF-LIKE AUDIO FOR KEYS
  // ---------------------------------------------------------------------------

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function getAudioCtx() {
    if (!AudioCtx) return null;
    if (!audioCtx) {
      audioCtx = new AudioCtx();
    }
    return audioCtx;
  }

  // DTMF frequency map (low + high tone pairs)
  const DTMF_FREQS = {
    "1": [697, 1209],
    "2": [697, 1336],
    "3": [697, 1477],
    "4": [770, 1209],
    "5": [770, 1336],
    "6": [770, 1477],
    "7": [852, 1209],
    "8": [852, 1336],
    "9": [852, 1477],
    "*": [941, 1209],
    "0": [941, 1336],
    "#": [941, 1477]
  };

  function playDialTone(key) {
    const ctx = getAudioCtx();
    if (!ctx) return;

    const freqs = DTMF_FREQS[key];
    if (!freqs) return;

    const duration = 0.12; // ~120ms like a quick keypress
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.linearRampToValueAtTime(0.0, now + duration);

    gain.connect(ctx.destination);

    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    });
  }

  // 3) Build the keypad (old-school metal dialer style)
  const keys = ["1","2","3","4","5","6","7","8","9","*","0","#"];

  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.textContent = key;
    btn.style.cssText = `
      background: radial-gradient(circle at 30% 20%, #666 0, #333 40%, #111 100%);
      border: 1px solid #777;
      border-radius: 50%;
      color:#0ff;
      font-size:14px;
      text-shadow:0 0 3px #000;
      cursor:pointer;
      box-shadow: inset 0 0 2px #000, 0 0 4px rgba(0,0,0,0.8);
    `;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      btn.style.transform = "translateY(1px)";
      btn.style.boxShadow = "inset 0 0 4px #000";
    });
    btn.addEventListener("mouseup", () => {
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "inset 0 0 2px #000, 0 0 4px rgba(0,0,0,0.8)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "inset 0 0 2px #000, 0 0 4px rgba(0,0,0,0.8)";
    });

    btn.addEventListener("click", () => {
      const current = displayEl.textContent || "";
      if (current.length >= 17) return; // hard cap at 17 chars in display as well
      displayEl.textContent = current + key;

      // play dial tone for this key
      playDialTone(key);
    });

    padEl.appendChild(btn);
  });

  // 4) Dialer controls (local display)
  if (backspace) {
    backspace.addEventListener("click", () => {
      const current = displayEl.textContent || "";
      displayEl.textContent = current.slice(0, -1);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      displayEl.textContent = "";
    });
  }

  // --- Omniverse digit dialing helper --------------------------------------
  function dialOmniverseDigit(digitChar) {
    const d = parseInt(digitChar, 10);
    if (isNaN(d)) return;

    const canvas = document.getElementById("mequavis");
    if (!canvas) return;

    let target = null;
    try {
      if (typeof nofurs === "undefined") {
        return;
      }
      target = nofurs.find(
        (n) =>
          n &&
          typeof n.baseDigit === "number" &&
          n.baseDigit === d &&
          (n.flag === "left" || n.flag === "right")
      );
    } catch (e) {
      return;
    }

    if (!target || !target.center) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = rect.left + target.center.x / scaleX;
    const clientY = rect.top  + target.center.y / scaleY;

    const evt = new MouseEvent("click", {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      view: window
    });

    canvas.dispatchEvent(evt);
  }

  function dialOmniverseSequence(rawNumber) {
    if (!rawNumber) return;

    // Only numeric digits, max 17
    let digits = (rawNumber.match(/[0-9]/g) || []).join("");
    if (!digits) return;
    if (digits.length > 17) {
      digits = digits.slice(0, 17);
    }

    const intervalMs = 100;
    digits.split("").forEach((ch, idx) => {
      setTimeout(() => {
        dialOmniverseDigit(ch);
      }, idx * intervalMs);
    });
  }

  // ---------------------------------------------------------------------------
  // Upload Dial Log -> parse file & feed digits directly to nofurs handlers
  // ---------------------------------------------------------------------------
  function processDialLogFile(text) {
    if (!text) return;

    const lines = text.split(/\r?\n/);
    const sequences = [];

    lines.forEach((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return;

      const after = line.slice(idx + 1);
      const digits = (after.match(/[0-9]/g) || []).join("");
      if (digits) {
        sequences.push(digits);
      }
    });

    if (!sequences.length) return;

    // As fast as possible: directly call dialOmniverseDigit for each digit.
    // No keypad button presses, no artificial delay.
    sequences.forEach((seq) => {
      for (const ch of seq) {
        dialOmniverseDigit(ch);
      }
    });

    // Optional: brief status in display (non-blocking)
    displayEl.textContent = `Uploaded ${sequences.length} segments`;
    setTimeout(() => {
      displayEl.textContent = "";
    }, 1500);
  }

  // Auto dial logic
  let autoDialTimer      = null;
  let autoDialActive     = false;
  let autoDialDigits     = "";
  let autoDialIntervalMs = 1000;
  let autoDialRemaining  = 0;

  function stopAutoDial() {
    autoDialActive = false;
    if (autoDialTimer) {
      clearTimeout(autoDialTimer);
      autoDialTimer = null;
    }
    if (autoDialBtn) {
      autoDialBtn.textContent = "Auto dial";
    }
  }

  function startAutoDial() {
    if (!autoDialBtn || !autoDialCountInput || !autoDialIntervalInput) return;

    const current = (displayEl.textContent || "").trim();
    const digits  = (current.match(/[0-9]/g) || []).join("");
    if (!digits) return;

    const countVal    = parseInt(autoDialCountInput.value, 10);
    const intervalVal = parseInt(autoDialIntervalInput.value, 10);

    autoDialDigits     = digits;
    autoDialIntervalMs = (!isNaN(intervalVal) && intervalVal > 0) ? intervalVal : 1000;
    autoDialRemaining  = (!isNaN(countVal) && countVal > 0) ? countVal : Infinity;

    autoDialActive = true;
    autoDialBtn.textContent = "Stop";

    function scheduleNext() {
      if (!autoDialActive) return;

      if (autoDialRemaining === 0) {
        stopAutoDial();
        return;
      }

      // perform one dial
      dialOmniverseSequence(autoDialDigits);
      if (isFinite(autoDialRemaining)) {
        autoDialRemaining--;
      }

      if (autoDialRemaining === 0) {
        stopAutoDial();
        return;
      }

      autoDialTimer = setTimeout(scheduleNext, autoDialIntervalMs);
    }

    scheduleNext();
  }

  if (autoDialBtn) {
    autoDialBtn.addEventListener("click", () => {
      if (autoDialActive) {
        stopAutoDial();
      } else {
        startAutoDial();
      }
    });
  }

  // Upload Dial Log wiring
  if (uploadDialLogBtn && dialLogFileInput) {
    uploadDialLogBtn.addEventListener("click", () => {
      dialLogFileInput.click();
    });

    dialLogFileInput.addEventListener("change", (e) => {
      const input = e.target;
      if (!input || !input.files || !input.files[0]) return;

      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (ev) => {
        const text = ev.target && typeof ev.target.result === "string"
          ? ev.target.result
          : "";
        processDialLogFile(text);
      };

      reader.readAsText(file);

      // reset input so selecting the same file again still fires change
      input.value = "";
    });
  }

  // 5) CALL button: drive the omniverse dial
  if (callBtn) {
    callBtn.addEventListener("click", () => {
      const current = (displayEl.textContent || "").trim();
      if (!current) return;

      const rawDigits = (current.match(/[0-9]/g) || []).join("");
      if (!rawDigits) return;
      const displayDigits = rawDigits.length > 17 ? rawDigits.slice(0,17) : rawDigits;

      displayEl.textContent = "DIALING " + displayDigits + "...";

      dialOmniverseSequence(rawDigits);

      setTimeout(() => {
        displayEl.textContent = displayDigits;
      }, Math.min(rawDigits.length * 120, 3000));
    });
  }

  // 6) Dragging logic for the mini panel
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function onMouseDownHeader(e) {
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    isDragging = true;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const newLeft = e.clientX - dragOffsetX;
    const newTop  = e.clientY - dragOffsetY;

    panel.style.left = newLeft + "px";
    panel.style.top  = newTop + "px";
  }

  function onMouseUp() {
    isDragging = false;
  }

  if (headerEl) {
    headerEl.addEventListener("mousedown", onMouseDownHeader);
  }
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // 7) Open / close behavior
  function openPanel() {
    panel.style.display = "block";
  }

  function closePanelFn() {
    panel.style.display = "none";
    // stop auto dial when panel closes
    stopAutoDial();
  }

  toolkitBtn.addEventListener("click", () => {
    if (panel.style.display === "block") {
      closePanelFn();
    } else {
      openPanel();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", closePanelFn);
  }
})();
