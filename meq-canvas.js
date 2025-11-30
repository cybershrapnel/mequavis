// ===== RIGHT PANEL: SIMPLE CHAT / CONTROL WIRES =====
const aiOutputEl = document.getElementById("aiOutput");
const aiInputEl  = document.getElementById("aiInput");
const aiSendBtn  = document.getElementById("aiSend");

// Accent CSS var for non-canvas UI only (auto-shifts with your theme)
const ACCENT_VAR = "var(--meq-accent, #0ff)";

// ✅ Canvas needs a real color value (not "var(...)"), so read the picker color:
function readCssVar(styleObj, name) {
  try {
    const v = styleObj.getPropertyValue(name);
    return v ? v.trim() : "";
  } catch {
    return "";
  }
}

let _canvasAccentCache = "#0ff";
let _canvasAccentCacheTime = 0;

function getCanvasAccent() {
  const now = performance.now();
  if (now - _canvasAccentCacheTime < 250) return _canvasAccentCache;

  try {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);

    const candidates = [
      "--ui-accent",
      "--ui-color",
      "--meq-ui-accent",
      "--meq-ui-color",
      "--meq-accent",
      "--accent-color",
      "--primary-color",
      "--theme-accent",
      "--picker-color",
      "--picker-accent"
    ];

    for (const v of candidates) {
      const a = readCssVar(rootStyle, v) || readCssVar(bodyStyle, v);
      if (a) {
        _canvasAccentCache = a;
        _canvasAccentCacheTime = now;
        return a;
      }
    }

    if (typeof window._meqUIColor === "string" && window._meqUIColor.trim()) {
      _canvasAccentCache = window._meqUIColor.trim();
      _canvasAccentCacheTime = now;
      return _canvasAccentCache;
    }
    if (typeof window._meqUIAccent === "string" && window._meqUIAccent.trim()) {
      _canvasAccentCache = window._meqUIAccent.trim();
      _canvasAccentCacheTime = now;
      return _canvasAccentCache;
    }
    if (typeof window.uiAccent === "string" && window.uiAccent.trim()) {
      _canvasAccentCache = window.uiAccent.trim();
      _canvasAccentCacheTime = now;
      return _canvasAccentCache;
    }

    const storageKeys = [
      "uiAccent",
      "uiColor",
      "meqUIColor",
      "meq-ui-accent",
      "meq-accent",
      "accentColor",
      "themeAccent",
      "pickerColor",
      "pickerAccent"
    ];
    for (const k of storageKeys) {
      const val = localStorage.getItem(k);
      if (val && val.trim()) {
        _canvasAccentCache = val.trim();
        _canvasAccentCacheTime = now;
        return _canvasAccentCache;
      }
    }

    // last-resort: sniff border/text from known UI nodes
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
          _canvasAccentCache = bc;
          _canvasAccentCacheTime = now;
          return bc;
        }
      }
      if (cs.color && cs.color !== "transparent") {
        _canvasAccentCache = cs.color;
        _canvasAccentCacheTime = now;
        return cs.color;
      }
    }
  } catch {}

  _canvasAccentCache = "#0ff";
  _canvasAccentCacheTime = now;
  return _canvasAccentCache;
}

// --- 30s cooldown state for AI send button ---
const AI_SEND_COOLDOWN_SECONDS = 30;
let aiSendCooldown            = false;
let aiSendCooldownTimer       = null;
let aiSendCooldownRemaining   = 0;

// Start / manage the cooldown on the SEND button
function startAiSendCooldown() {
  if (!aiSendBtn) return;

  // Save original label once
  if (!aiSendBtn.dataset.originalLabel) {
    aiSendBtn.dataset.originalLabel = aiSendBtn.textContent || aiSendBtn.value || "SEND";
  }

  // Reset any existing timer
  if (aiSendCooldownTimer) {
    clearInterval(aiSendCooldownTimer);
    aiSendCooldownTimer = null;
  }

  aiSendCooldown          = true;
  aiSendCooldownRemaining = AI_SEND_COOLDOWN_SECONDS;
  aiSendBtn.disabled      = true;

  const setLabel = (txt) => {
    if ("textContent" in aiSendBtn) {
      aiSendBtn.textContent = txt;
    } else if ("value" in aiSendBtn) {
      aiSendBtn.value = txt;
    }
  };

  setLabel(`WAIT ${aiSendCooldownRemaining}s`);

  aiSendCooldownTimer = setInterval(() => {
    aiSendCooldownRemaining--;

    if (aiSendCooldownRemaining <= 0) {
      clearInterval(aiSendCooldownTimer);
      aiSendCooldownTimer = null;
      aiSendCooldown      = false;
      aiSendBtn.disabled  = false;

      const original = aiSendBtn.dataset.originalLabel || "SEND";
      setLabel(original);
    } else {
      setLabel(`WAIT ${aiSendCooldownRemaining}s`);
    }
  }, 1000);
}

// Helper to append messages to the middle log
function appendAIMessage(sender, text) {
  if (!aiOutputEl) return;
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<span class="sender">${sender}:</span> ${text}`;
  aiOutputEl.appendChild(div);
  aiOutputEl.scrollTop = aiOutputEl.scrollHeight;
}

// Handle sending input
function handleSend() {
  if (!aiInputEl) return;

  // Block sends while cooldown is active
  if (aiSendCooldown) return;

  const text = aiInputEl.value.trim();
  if (!text) return;

  // Show user message in the log
  appendAIMessage("User Query", text);

  // Clear box
  aiInputEl.value = "";

  // Kick off the 30s cooldown
  startAiSendCooldown();

  // Hand off to external chat module (meq-chat.js)
  if (window.MeqChat && typeof window.MeqChat.send === "function") {
    window.MeqChat.send(text);
  } else {
    // Fallback if external JS isn't loaded yet
    appendAIMessage("AI", "(chat backend not ready)");
  }
}

// Wire up send button + Enter key
if (aiSendBtn) {
  aiSendBtn.addEventListener("click", handleSend);
}
if (aiInputEl) {
  aiInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(); // this will no-op if cooldown is active
    }
  });
}

// Wire up the big top buttons to log into the middle panel
document.querySelectorAll(".action-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const label  = btn.textContent.trim();
    const action = btn.dataset.action || "unknown";
    appendAIMessage("System", `[${label}] clicked (action = ${action})`);

    if (action === "mandelbrot-zoom") {
      // safe-call in case mandel module hasn't loaded yet
      if (typeof showMandelPanel === "function") showMandelPanel();
    }
    // later you can switch(action) { ... } to trigger real UI modes
  });
});

const canvas = document.getElementById("mequavis");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const BASE_W = W;
const BASE_H = H;

// --- Omega overlay sources ---
const EARTH_GIF_SRC = "earth.gif";
const MOON_GIF_SRC  = "moon.gif";

// --- Animated Earth/Moon overlay for OMEGA (DOM, not canvas) ---
let omegaEarthEl = null;

function ensureOmegaEarthOverlay() {
  if (omegaEarthEl) return omegaEarthEl;

  omegaEarthEl = document.createElement("img");
  omegaEarthEl.id = "omegaEarthOverlay";
  omegaEarthEl.src = EARTH_GIF_SRC; // default
  omegaEarthEl.dataset.src = EARTH_GIF_SRC;
  omegaEarthEl.style.position = "fixed"; // fixed works well with transformed canvas
  omegaEarthEl.style.left = "0px";
  omegaEarthEl.style.top = "0px";
  omegaEarthEl.style.width = "0px";
  omegaEarthEl.style.height = "0px";
  omegaEarthEl.style.transform = "translate(-50%, -50%)";
  omegaEarthEl.style.pointerEvents = "none";
  omegaEarthEl.style.zIndex = "50"; // on top of canvas

  document.body.appendChild(omegaEarthEl);
  return omegaEarthEl;
}

function updateOmegaEarthOverlay(cx, cy, earthSzCanvas, visible, srcOverride = null) {
  const el = ensureOmegaEarthOverlay();
  if (!visible) {
    el.style.display = "none";
    return;
  }

  // swap gif if requested
  if (srcOverride && el.dataset.src !== srcOverride) {
    el.src = srcOverride;
    el.dataset.src = srcOverride;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const screenX = rect.left + cx * scaleX;
  const screenY = rect.top  + cy * scaleY;

  const earthSzPx = earthSzCanvas * scaleX; // use X scale (uniform anyway)

  el.style.display = "block";
  el.style.left = `${screenX}px`;
  el.style.top  = `${screenY}px`;
  el.style.width  = `${earthSzPx}px`;
  el.style.height = `${earthSzPx}px`;
}


// 🔹 Big wheel spin toggle (default ON)
window._meqBigWheelSpinEnabled = true;

function updateCanvasScale() {
  const leftPanel  = document.getElementById("segmentLog");
  const rightPanel = document.getElementById("rightPanel");

  const leftWidth  = leftPanel  ? leftPanel.offsetWidth  + 20 : 0;
  const rightWidth = rightPanel ? rightPanel.offsetWidth + 20 : 0;

  const availableWidth  = window.innerWidth;
  const availableHeight = window.innerHeight - 40;

  const scale = Math.min(
    availableWidth  / BASE_W,
    availableHeight / BASE_H,
    1
  );

  canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

updateCanvasScale();
window.addEventListener("resize", updateCanvasScale);

const center = {x: W/2, y: H/2};
let compact = false;

window.nofurs = [];
let nofurs = window.nofurs;

let seekerPositions = [];
let omniverseAddress = "";

// Add this near your global variables:
let segment = 1;
let segmentHistory = [];
if (typeof window._meqTraversalMute === "undefined") {
  window._meqTraversalMute = false;
}

function downloadSegmentLog() {
  const lines = [];
  lines.push("Segments");
  segmentHistory.forEach(entry => {
    const gasketLabel = entry.power === 1
      ? `Gasket ${entry.gasket}`
      : `Gasket ${entry.gasket}^${entry.power}`;
    lines.push(`${gasketLabel}, Seg ${entry.segment}: ${entry.address}`);
  });

  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "segment-log.txt";
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// Gasket indexing
let gasket = 1;
let gasketPower = 1;
const GASKET_MAX = 17;
// 🔁 expose to other scripts (like meq-room-chat.js)
window.gasket = gasket;
window.gasketPower = gasketPower;

// Render the segment history into the left panel WITHOUT nuking other children
function updateSegmentLog() {
  const panel = document.getElementById("segmentLog");
  if (!panel) return;

  let downloadBtn = panel.querySelector("#downloadSegmentLogBtn");
  if (!downloadBtn) {
    downloadBtn = document.createElement("button");
    downloadBtn.id = "downloadSegmentLogBtn";
    downloadBtn.textContent = "Download Segment Log";
    downloadBtn.style.cssText = `
      width: 100%;
      margin-bottom: 6px;
      padding: 6px 4px;
      border: 1px solid ${ACCENT_VAR};
      background: #111;
      color: ${ACCENT_VAR};
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: bold;
      text-align: center;
    `;
    downloadBtn.addEventListener("click", downloadSegmentLog);
    panel.insertBefore(downloadBtn, panel.firstChild);
  }

  let muteRow = panel.querySelector("#segmentMuteRow");
  if (!muteRow) {
    muteRow = document.createElement("div");
    muteRow.id = "segmentMuteRow";
    muteRow.style.cssText = `
      margin-bottom: 6px;
      font-size: 10px;
      color: ${ACCENT_VAR};
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "muteTraversalSound";
    cb.style.cursor = "pointer";
    cb.checked = !!window._meqTraversalMute;

    cb.addEventListener("change", () => {
      window._meqTraversalMute = cb.checked;
    });

    const label = document.createElement("label");
    label.htmlFor = "muteTraversalSound";
    label.textContent = "Mute traversal sound";

    muteRow.appendChild(cb);
    muteRow.appendChild(label);
    downloadBtn.insertAdjacentElement("afterend", muteRow);
  } else {
    const cb = muteRow.querySelector("#muteTraversalSound");
    if (cb) cb.checked = !!window._meqTraversalMute;
  }

  let header = panel.querySelector("h2.segment-header");
  if (!header) {
    header = document.createElement("h2");
    header.className = "segment-header";
    header.textContent = "Segments";
    panel.appendChild(header);
  }

  // Style header every time (so it stays in sync with theme swaps)
  header.style.cssText = `
    margin: 4px 0 6px;
    padding: 4px 0 2px;
    font-size: 12px;
    font-weight: bold;
    color: ${ACCENT_VAR};
    border-top: 1px solid #222;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  `;

  let list = panel.querySelector(".segment-list");
  if (!list) {
    list = document.createElement("div");
    list.className = "segment-list";
    panel.appendChild(list);
  }

  // Style list container every time
  list.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 10px;
    color: ${ACCENT_VAR};
  `;

  if (segmentHistory.length === 0) {
    list.innerHTML = `
      <div class="entry" style="
        padding: 4px 6px;
        border: 1px solid #222;
        background: #0b0b0b;
        color: ${ACCENT_VAR};
        border-radius: 3px;
        opacity: 0.7;
      ">No segments yet</div>
    `;
    return;
  }

  list.innerHTML = segmentHistory.map(entry => {
    const gasketLabel = entry.power === 1
      ? `Gasket ${entry.gasket}`
      : `Gasket ${entry.gasket}^${entry.power}`;
    return `
      <div class="entry" style="
        padding: 4px 6px;
        border: 1px solid #222;
        background: #0b0b0b;
        color: ${ACCENT_VAR};
        border-radius: 3px;
      ">
        ${gasketLabel}, Seg ${entry.segment}: ${entry.address}
      </div>
    `;
  }).join("");

}

updateSegmentLog();

// === CLICK HANDLER ===
canvas.addEventListener("click", e => {
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;

  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top)  * scaleY;

  for (const n of nofurs) {
    if (!n.flag || (n.flag !== "left" && n.flag !== "right")) continue;

    const dx = mouseX - n.center.x;
    const dy = mouseY - n.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < n.outerRadius + 10) {

      let digit = null;

      if (typeof n.baseDigit === "number") {
        digit = String(n.baseDigit);
        omniverseAddress += digit;

        if (n.address !== undefined) {
          n.address += digit;
        }
      }

      if (activeLayers > 1) {
        activeLayers--;
      } else {
        const fullAddress = (omniverseAddress === "" ? "0" : omniverseAddress);

        segmentHistory.push({
          gasket: gasket,
          power: gasketPower,
          segment: segment,
          address: fullAddress
        });
        updateSegmentLog();

        if (digit !== null) {
          lastBaseDigit = digit;
        }

        segment++;
        if (segment > pyramidLayers) {
          segment = 1;
          gasket++;
          if (gasket > GASKET_MAX) {
            gasket = 1;
            gasketPower++;
          }
        }
// 🔁 keep window in sync for other scripts
window.gasket = gasket;
window.gasketPower = gasketPower;
        activeLayers = pyramidLayers;
        omniverseAddress = "";
      }

      break;
    }
  }
});

const nodeColors = {
  1:"#ff0000",12:"#ff0000",
  2:"#ffff00",11:"#ffff00",
  3:"#00ffff",10:"#00ffff",
  4:"#ff00ff",9:"#ff00ff",
  5:"#00ff00",8:"#00ff00",
  6:"#0000ff",7:"#0000ff",
  13:"#8888ff"
};

function mainCanvasTextColor() {
  return window._meqFractalAnti ? "#000000" : "#ffffff";
}

// --- lock / earth overlay images (loaded once) ---
const lockIconImg = new Image();
lockIconImg.src = "lockicon.png";   // <-- change path if needed

const earthGifImg = new Image();
earthGifImg.src = "earth.gif";      // <-- still here just in case


const outerOrder = [12,1,2,11,10,3,4,9,5,8,7,6];
const innerPairs = [
  [12,1],[2,11],[10,3],[4,9],[5,8],[6,7]
];

function drawNode(x, y, num, colorOverride = null) {
  const color = colorOverride || nodeColors[num] || "#999";
  const antiOn = window._meqFractalAnti === true;

  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.strokeStyle = antiOn ? "#ffffff" : "#333333";
  ctx.stroke();

  ctx.fillStyle = antiOn ? "#ffffff" : "#000000";
  ctx.font = "13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(num, x, y);
}

// Custom seeker angle offsets (in radians)
const seekerAngles = {
  ALPHA: [Math.PI * 0.20],
  BETA: [Math.PI * 0.80],
  DELTA: [Math.PI * 1.85],
  GAMMA: [Math.PI * 1.15],
  OMEGA: [
    Math.PI * 0.75,
    Math.PI * 0.25,
    Math.PI * 1.25,
    Math.PI * 1.75
  ]
};

function drawNofur(baseX, baseY, label, rotation = 0, scale = 1, spinInner = true, isLeft = false, isRight = false) {
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.scale(scale, scale);

  const radiusOuter = 100;
  const radiusInner = 50;

  let outerCoords = [];
  for (let i = 0; i < outerOrder.length; i++) {
    const angle = (i / outerOrder.length) * Math.PI * 2 - Math.PI / 2 + rotation;
    const x = Math.cos(angle) * radiusOuter;
    const y = Math.sin(angle) * radiusOuter;
    outerCoords.push({ x, y, num: outerOrder[i] });
  }

  let innerCoords = [];
  const innerRot = spinInner ? rotation : 0;


  for (let i = 0; i < innerPairs.length; i++) {
    const aIndex = outerOrder.indexOf(innerPairs[i][0]);
    const bIndex = outerOrder.indexOf(innerPairs[i][1]);
    const angleA = (aIndex / outerOrder.length) * Math.PI * 2 - Math.PI / 2 + innerRot;
    const angleB = (bIndex / outerOrder.length) * Math.PI * 2 - Math.PI / 2 + innerRot;
    const midAngle = (angleA + angleB) / 2;
    const x = Math.cos(midAngle) * radiusInner;
    const y = Math.sin(midAngle) * radiusInner;
    innerCoords.push({ x, y, num: 14 + i });
  }

  drawNode(0, 0, 13, nodeColors[13]);

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#888";
  for (let i = 0; i < innerCoords.length; i++) {
    const inner = innerCoords[i];
    const [a, b] = innerPairs[i];
    const leftOuter = outerCoords.find(o => o.num === a);
    const rightOuter = outerCoords.find(o => o.num === b);
    if (leftOuter && rightOuter) {
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(leftOuter.x, leftOuter.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(rightOuter.x, rightOuter.y);
      ctx.stroke();
    }
  }

  if (!isLeft && !isRight) {
    for (let i = 0; i < innerCoords.length; i++) {
      for (let j = i + 1; j < innerCoords.length; j++) {
        const a = innerCoords[i];
        const b = innerCoords[j];
        const aOdd = a.num % 2 !== 0;
        const bOdd = b.num % 2 !== 0;

        if (aOdd && bOdd) {
          ctx.strokeStyle = "#FF00FF";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (!aOdd && !bOdd) {
          ctx.strokeStyle = "#FF0000";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  ctx.strokeStyle = "#001F3F";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = "#555";
  ctx.beginPath(); ctx.arc(0, 0, radiusInner + 10, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = "#FFA500";
  ctx.beginPath(); ctx.arc(0, 0, radiusOuter + 10, 0, Math.PI * 2); ctx.stroke();

  for (let n of outerCoords) drawNode(n.x, n.y, n.num);
  for (let i = 0; i < innerCoords.length; i++) {
    const n = innerCoords[i];
    const color = (i % 2 === 0) ? "#444444" : "#BBBBBB";
    drawNode(n.x, n.y, n.num, color);
  }

  ctx.restore();

  ctx.fillStyle = mainCanvasTextColor();
  ctx.font = "16px monospace";
  ctx.textAlign = "center";
  if (!isLeft && !isRight && (label === "ALPHA" || label === "BETA")) {
    ctx.fillText(label, baseX, baseY - radiusOuter * scale - 25);
  } else {
    ctx.fillText(label, baseX, baseY + radiusOuter * scale + 25);
  }

  if (!isLeft && !isRight) {
    const globalOuter = outerCoords.map(o => ({
      gx: baseX + o.x * scale,
      gy: baseY + o.y * scale,
      num: o.num
    }));

    function drawSeeker(angleOffset) {
      const seekerRadius = (radiusOuter + 45) * scale;
      const seekerX = baseX + Math.cos(angleOffset) * seekerRadius;
      const seekerY = baseY + Math.sin(angleOffset) * seekerRadius;

      let nearest = null;
      let nearestDist = Infinity;
      for (let o of globalOuter) {
        const dx = seekerX - o.gx;
        const dy = seekerY - o.gy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestDist) {
          nearestDist = d2;
          nearest = o;
        }
      }

      const matchColor = nearest ? nodeColors[nearest.num] || "#ffffff" : "#ffffff";

      if (nearest) {
        ctx.strokeStyle = matchColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(seekerX, seekerY);
        ctx.lineTo(nearest.gx, nearest.gy);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(seekerX, seekerY, 8, 0, Math.PI * 2);
      ctx.fillStyle = matchColor;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();

      seekerPositions.push({ label, x: seekerX, y: seekerY, color: matchColor });
    }

    const angles = seekerAngles[label] || [Math.PI * 3 / 4];
    for (let ang of angles) drawSeeker(ang);
  }
}

const baseOffsets = [
  {id:"ALPHA",x:-300,y:-250},
  {id:"BETA", x:300,y:-250},
  {id:"DELTA",x:-300,y:250},
  {id:"GAMMA",x:300,y:250},
  {id:"OMEGA",x:0,y:0}
];

function formatSmallLabel(n) {
  return "L2-O" + n.address;
}

function drawOmniverse(baseX,baseY,rot,scale=1,isSmall=false,isLeft=false,isRight=false){
  for(let nf of baseOffsets){
    let shrinkFactor = (compact && isSmall && nf.id!=="OMEGA") ? 0.5 : 1.0;
    let dx = nf.x * scale * shrinkFactor;
    let dy = nf.y * scale * shrinkFactor;

    let label = nf.id;
    let baseDigit = null;

    if(isSmall && isLeft){
      if(nf.id==="ALPHA") baseDigit = 2;
      if(nf.id==="BETA")  baseDigit = 3;
      if(nf.id==="DELTA") baseDigit = 6;
      if(nf.id==="GAMMA") baseDigit = 7;
      if(nf.id==="OMEGA") baseDigit = 0;
    }
    if(isSmall && isRight){
      if(nf.id==="ALPHA") baseDigit = 4;
      if(nf.id==="BETA")  baseDigit = 5;
      if(nf.id==="DELTA") baseDigit = 8;
      if(nf.id==="GAMMA") baseDigit = 9;
      if(nf.id==="OMEGA") baseDigit = 1;
    }

    let addressStr = "";

    if (isSmall && baseDigit !== null) {
      const currentLayer = (pyramidLayers - activeLayers) + 1;
      const displayLayer = currentLayer + 1;

      const key = isLeft ? "leftAddress" : (isRight ? "rightAddress" : null);

      if (key) {
        if (!nf[key]) nf[key] = String(baseDigit);
        addressStr = nf[key];
      } else {
        addressStr = String(baseDigit);
      }

      label = `L${displayLayer}-O..` + addressStr;
    }

    let speed = rot;
    if(!isSmall){
      if(nf.id === "ALPHA")      speed = rot * 0.8;
      else if(nf.id === "BETA")  speed = rot * 0.9;
      else if(nf.id === "OMEGA") speed = rot * 1.0;
      else if(nf.id === "DELTA") speed = rot * 1.1;
      else if(nf.id === "GAMMA") speed = rot * 1.2;
    } else {
      speed = rot * 0.8;
    }

    //const spinInner = !(isLeft || isRight);
const spinInner = true; // allow inner spin on small nofurs too

    const cx = baseX + dx;
    const cy = baseY + dy;

    drawNofur(cx, cy, label, speed, scale, spinInner, isLeft, isRight);

    nofurs.push({
      label,
      baseDigit,
      address: baseDigit !== null ? String(baseDigit) : "",
      center: { x: cx, y: cy },
      outerRadius: 100 * scale,
      flag: isLeft ? "left" : (isRight ? "right" : null)
    });

    if(isSmall){
      ctx.fillStyle = mainCanvasTextColor();
      ctx.font="16px monospace";
      ctx.textAlign="center";
      ctx.textBaseline="middle";
      const tags = isLeft ? {
        ALPHA:["A1","2"], BETA:["A2","3"], OMEGA:["O1","0"], DELTA:["D1","6"], GAMMA:["D2","7"]
      } : isRight ? {
        ALPHA:["B1","4"], BETA:["B2","5"], OMEGA:["O2","1"], DELTA:["G1","8"], GAMMA:["G2","9"]
      } : {};
      if(tags[nf.id]){
        const [tag1, tag2] = tags[nf.id];
        const offsetX = (nf.id==="BETA"||nf.id==="GAMMA"||(isRight && nf.id==="OMEGA")) ? -50 : 50;
        ctx.fillText(tag1, cx+offsetX, cy-15);
        ctx.fillText(tag2, cx+offsetX, cy+15);
      }
    }
  }
}

function drawLockOverlays() {
  // hide by default each frame; we re-show if omega is locked
  updateOmegaEarthOverlay(0, 0, 0, false);

  const ls = window.nofurLockState || {};
  if (!ls) return;

  for (const nf of nofurs) {
    if (!nf || !nf.center) continue;

    // big nofurs only
    if (nf.flag === "left" || nf.flag === "right") continue;

    const label = nf.label;
    if (
      label !== "ALPHA" &&
      label !== "BETA" &&
      label !== "GAMMA" &&
      label !== "DELTA" &&
      label !== "OMEGA"
    ) continue;

    const st = ls[label];
    if (!st || !st.locked) continue;

    const cx = nf.center.x;
    const cy = nf.center.y;

    const scale = (nf.outerRadius || 100) / 100; // outerRadius=100*scale
    const boxHalf = 110 * scale;                // (radiusOuter+10)*scale
    const pad = 6 * scale;

    if (label === "OMEGA") {
      const earthSz = 70 * scale;

      const showEarth = window._meqOmegaShowEarth === true;
      const src = showEarth ? EARTH_GIF_SRC : MOON_GIF_SRC;

      updateOmegaEarthOverlay(cx, cy, earthSz, true, src);
      continue;
    }

    // Lock icon in corners
    const iconSz = 18 * scale;

    let ix, iy;
    if (label === "ALPHA" || label === "DELTA") {
      // bottom-left
      ix = cx - boxHalf + pad;
      iy = cy + boxHalf - iconSz - pad;
    } else {
      // bottom-right (BETA/GAMMA)
      ix = cx + boxHalf - iconSz - pad;
      iy = cy + boxHalf - iconSz - pad;
    }

    if (lockIconImg.naturalWidth > 0) {
      // --- draw lock icons, keeping them white even in Anti mode ---
if (lockIconImg.naturalWidth > 0) {
  ctx.save();
  if (window._meqFractalAnti) {
    // cancel global invert for just this image
    ctx.filter = "invert(1)";
  }
  ctx.drawImage(lockIconImg, ix, iy, iconSz, iconSz);
  ctx.restore();
}

    }
  }
}


function drawTitle() {
  // ✅ follow UI picker for title line
  ctx.fillStyle = getCanvasAccent();
  ctx.font = "24px monospace";
  ctx.textAlign = "center";

  const currentLayer = (pyramidLayers - activeLayers) + 1;

  let baseDigit = "0";
  if (segmentHistory.length > 0) {
    const lastEntry = segmentHistory[segmentHistory.length - 1];
    const addr = (lastEntry.address || "").toString();
    if (addr.length > 0) {
      baseDigit = addr[addr.length - 1];
    }
  }

  const core = omniverseAddress || "";
  const addressDisplay = baseDigit + core;

  window.omniverseNumber     = addressDisplay;
  window.gasketCurrent       = gasket;
  window.gasketPowerCurrent  = gasketPower;
  window.segmentCurrent      = segment;

  const gasketLabel = gasketPower === 1
    ? `Gasket ${gasket}`
    : `Gasket ${gasket}^${gasketPower}`;

  const zoneNum = (typeof window._meqFractalSection === "number")
    ? window._meqFractalSection
    : 1;

  // ✅ only show Earth at the root title:
  // Zone 1 • Gasket 1 • Segment 1 • Layer 1 • Omniverse 0
  window._meqOmegaShowEarth =
    gasket === 1 &&
    gasketPower === 1 &&
    segment === 1 &&
    currentLayer === 1 &&
    addressDisplay === "0";

  ctx.fillText(
    `Zone ${zoneNum} • ${gasketLabel} • Segment ${segment} • Layer ${currentLayer} • Omniverse ${addressDisplay}`,
    center.x,
    50
  );
}

function connectNofurs(parent, leftChild, rightChild) {
  ctx.save();
  ctx.strokeStyle = "#ff0000";
  ctx.lineWidth = 2;
  const startX = parent.x;
  const startY = parent.y + 100;
  const leftX = leftChild.x + 110;
  const leftY = leftChild.y;
  const rightX = rightChild.x - 110;
  const rightY = rightChild.y;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX, leftY - 100);
  ctx.lineTo(leftX, leftY - 100);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX, rightY - 100);
  ctx.lineTo(rightX, rightY - 100);
  ctx.stroke();
  ctx.restore();
}

// === Pyramid Stack System ===
let pyramidLayers = 17;
let activeLayers = 17;

function drawPyramidStack() {
  const centerX = center.x;
  const centerY = center.y + 245;
  const baseSize = 150;
  const layerStep = 5;

  for (let i = 0; i < activeLayers; i++) {
    const size = baseSize - i * layerStep;
    const half = size / 3;
    const color = `hsl(${(i * 40) % 360},100%,60%)`;

    ctx.save();
    ctx.translate(centerX, centerY-15);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-half, -half, size, size);
    ctx.restore();
  }

  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  const boxSize = baseSize + 5;
  const half = boxSize / 3;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-half-10, -half-10, boxSize, boxSize);
  ctx.restore();

  const controlOffsetX = 90;
  const controlOffsetY = 100;

  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "red";

  ctx.strokeRect(centerX - controlOffsetX - 25, centerY - controlOffsetY, 50, 30);
  ctx.fillText("RESET", centerX - controlOffsetX, centerY - controlOffsetY + 10);
  ctx.fillText("SYSTEM", centerX - controlOffsetX, centerY - controlOffsetY + 20);

  ctx.strokeRect(centerX + controlOffsetX - 25, centerY - controlOffsetY, 50, 30);
  ctx.fillText("RETURN", centerX + controlOffsetX, centerY - controlOffsetY + 10);
  ctx.fillText("HOME", centerX + controlOffsetX, centerY - controlOffsetY + 20);

  ctx.strokeRect(centerX - controlOffsetX - 50, centerY + controlOffsetY, 100, 20);
  ctx.fillText("LAYER UP", centerX - controlOffsetX, centerY + controlOffsetY + 10);

  ctx.strokeRect(centerX + controlOffsetX - 50, centerY + controlOffsetY, 100, 20);
  ctx.fillText("TOP LAYER", centerX + controlOffsetX, centerY + controlOffsetY + 10);

  // ✅ keep Layer readout stable green (not picker)
  ctx.fillStyle = "#0f0";
  ctx.font = "20px monospace";

  const currentLayer = (pyramidLayers - activeLayers) + 1;
  ctx.fillText(`Layer ${currentLayer}`, centerX, centerY - 95);
}

let rot = 0;
let smallRot = 0;

// Track last base digit between segments (your original logic references it)
let lastBaseDigit = "0";

function animate(){
  ctx.clearRect(0,0,W,H);
  seekerPositions = [];
  nofurs = [];
  window.nofurs = nofurs;

  const currentLayer = (pyramidLayers - activeLayers) + 1;
  const layerSpeed   = 0.01 * currentLayer;

  if (window._meqBigWheelSpinEnabled !== false) {
    rot += layerSpeed;
  }
  smallRot += layerSpeed;

  drawTitle();
  if (typeof window.drawSierpinskiBox === "function") {
    window.drawSierpinskiBox();
  }
  drawPyramidStack();

  const alphaTop = { x: center.x - 300, y: center.y - 235 };
  const leftBelow = { x: alphaTop.x - 175, y: alphaTop.y + 250 };
  const rightBelow = { x: alphaTop.x + 175, y: alphaTop.y + 250 };
  connectNofurs(alphaTop, leftBelow, rightBelow);

  const betaTop = { x: center.x + 300, y: center.y - 235 };
  const betaLeft = { x: betaTop.x - 175, y: betaTop.y + 250 };
  const betaRight = { x: betaTop.x + 175, y: betaTop.y + 250 };
  connectNofurs(betaTop, betaLeft, betaRight);

  const gammaTop = { x: center.x - 300, y: center.y + 40 };
  const gammaLeft = { x: gammaTop.x - 175, y: gammaTop.y + 150 };
  const gammaRight = { x: gammaTop.x + 175, y: gammaTop.y + 150 };
  connectNofurs(gammaTop, gammaLeft, gammaRight);

  const deltaTop = { x: center.x + 300, y: center.y + 40 };
  const deltaLeft = { x: deltaTop.x - 175, y: deltaTop.y + 150 };
  const deltaRight = { x: deltaTop.x + 175, y: deltaTop.y + 150 };
  connectNofurs(deltaTop, deltaLeft, deltaRight);

  const omegaCenter = { x: center.x, y: center.y };
  const outerRadius = 110;
  const omegaLeftEdge  = { x: omegaCenter.x - outerRadius, y: omegaCenter.y };
  const omegaRightEdge = { x: omegaCenter.x + outerRadius, y: omegaCenter.y };
  const omegaLeftTarget  = { x: omegaLeftEdge.x - 175, y: omegaLeftEdge.y };
  const omegaRightTarget = { x: omegaRightEdge.x + 175, y: omegaRightEdge.y };
  ctx.strokeStyle = "#FF0000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(omegaLeftEdge.x, omegaLeftEdge.y);
  ctx.lineTo(omegaLeftTarget.x+25, omegaLeftTarget.y);
  ctx.moveTo(omegaRightEdge.x, omegaRightEdge.y);
  ctx.lineTo(omegaRightTarget.x-25, omegaRightTarget.y);
  ctx.stroke();

  drawOmniverse(center.x, center.y, rot, 1.0);
  drawOmniverse(center.x-300, center.y, smallRot, 0.35, true, true, false);
  drawOmniverse(center.x+300, center.y, smallRot, 0.35, true, false, true);

  const omegaSeekers = seekerPositions.filter(s => s.label === "OMEGA");
  const otherSeekers = seekerPositions.filter(s => s.label !== "OMEGA");

  function blendColors(c1, c2) {
    const hex = x => parseInt(x.slice(1),16);
    const r1=(hex(c1)>>16)&255,g1=(hex(c1)>>8)&255,b1=hex(c1)&255;
    const r2=(hex(c2)>>16)&255,g2=(hex(c2)>>8)&255,b2=hex(c2)&255;
    const r=Math.floor((r1+r2)/2),g=Math.floor((g1+g2)/2),b=Math.floor((b1+b2)/2);
    return `rgb(${r},${g},${b})`;
  }

  ctx.lineWidth = 2;
  for(let s of otherSeekers){
    let nearest = null;
    let nearestDist = Infinity;
    for(let o of omegaSeekers){
      const dx = o.x - s.x;
      const dy = o.y - s.y;
      const d2 = dx*dx+dy*dy;
      if(d2 < nearestDist){nearestDist=d2;nearest=o;}
    }
    if(nearest){
      ctx.strokeStyle = blendColors(s.color, nearest.color);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(nearest.x, nearest.y);
      ctx.stroke();
    }
  }

  // ✅ draw lock icons / earth/moon gif LAST so they're on top
  drawLockOverlays();
  requestAnimationFrame(animate);
}

animate();

document.getElementById("layoutBtn").addEventListener("click",()=>{ compact = !compact; });

// Optional: expose basic refs in case any other file wants window access
window.meqCanvas = { canvas, ctx, W, H, center };
