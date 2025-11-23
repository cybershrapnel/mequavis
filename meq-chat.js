// meq-chat.js

window.MeqChat = (function () {
  const modelSelect   = document.getElementById("modelSelect");
  const fullChatBtn   = document.querySelector('.action-btn[data-action="full-chat"]');
  const rightMiddleEl = document.getElementById("rightMiddle");
  const aiOutputEl    = document.getElementById("aiOutput");
  const aiInputEl     = document.getElementById("aiInput");

  let currentSessionId        = null;
  let currentSessionCreatedAt = null;
  let sessions                = []; // [{ id, created_at, owner, title, favorite }]

  // Which folder are we viewing in the left panel?
  // "active"  -> chat_logs
  // "deleted" -> deleted (owner-only list)
  // "archive" -> archive (public list like normal)
  let sessionViewMode = "active";

  // ✅ Adjustable restore window for archive -> active (in days)
  // Change this later whenever you want.
  const ARCHIVE_RESTORE_MAX_DAYS = 1;

  function getListActionForMode(mode) {
    if (mode === "deleted") return "list_deleted_sessions";
    if (mode === "archive") return "list_archive_sessions";
    return "list_sessions";
  }

  function getLoadActionForMode(mode) {
    if (mode === "deleted") return "load_deleted_session";
    if (mode === "archive") return "load_archive_session";
    return "load_session";
  }

  async function setSessionViewMode(mode) {
    sessionViewMode = mode;
    await loadSessionList(mode);
  }

  function isArchiveRestoreAllowed(sessionObj) {
    if (!sessionObj || !sessionObj.created_at) return false;

    const rawCreated = sessionObj.created_at;
    const t = Date.parse(rawCreated);
    if (Number.isNaN(t)) {
      console.warn("[ArchiveRestoreCheck] Bad created_at date:", rawCreated);
      return false;
    }

    const ageMs = Date.now() - t;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    console.log(
      "[ArchiveRestoreCheck]",
      {
        created_at: rawCreated,
        parsed_ms: t,
        now_ms: Date.now(),
        age_days: ageDays,
        limit_days: ARCHIVE_RESTORE_MAX_DAYS,
        allowed: ageDays <= ARCHIVE_RESTORE_MAX_DAYS
      }
    );

    return ageDays <= ARCHIVE_RESTORE_MAX_DAYS;
  }

  let contextMenuEl           = null;
  let contextMenuSessionId    = null;

  // Session list filters
  const filters = {
    hideFav:       false,
    hideNonFav:    false,
    hideOthers:    false,
    hideSelf:      false,
    hideUserChat:  false,
    searchTerm:    ""
  };

  const state = {
    messages: []
  };

  // ---------------------------------------------------------------------------
  // TOP-BAR TEXT + UI CONTROLS
  // ---------------------------------------------------------------------------

  const TEXT_PREFS_KEY = "meqChatTextPrefs_v2";
  const UI_PREFS_KEY   = "meqChatUiPrefs_v1";

  function getDefaultTextPrefs() {
    let defaultSize = 11;
    let defaultColor = "#00ffff";
    let defaultFont = "inherit";

    try {
      const refEl = aiOutputEl || document.body;
      const cs = window.getComputedStyle(refEl);
      const fs = parseFloat(cs.fontSize);
      if (!Number.isNaN(fs) && fs > 0) defaultSize = fs;

      const col = cs.color;
      const m = col && col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (m) defaultColor = rgbToHex(+m[1], +m[2], +m[3]);

      const fam = cs.fontFamily;
      if (fam) defaultFont = fam;
    } catch (e) {}

    return {
      fontSizePx: defaultSize,
      baseColorHex: defaultColor,
      hueOffsetDeg: 0,
      fontFamily: defaultFont
    };
  }

  function getDefaultUiPrefs() {
    return {
      baseUiHex: "#00ffff",
      uiHueOffsetDeg: 0
    };
  }

  const INITIAL_TEXT_DEFAULTS = (() => {
    const d = getDefaultTextPrefs();
    d.baseColorHex = "#00ffff";
    d.hueOffsetDeg = 0;
    d.fontFamily   = "inherit";
    return d;
  })();

  const INITIAL_UI_DEFAULTS = (() => {
    const d = getDefaultUiPrefs();
    d.baseUiHex = "#00ffff";
    d.uiHueOffsetDeg = 0;
    return d;
  })();

  let textPrefs = (() => {
    try {
      const raw = localStorage.getItem(TEXT_PREFS_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === "object") {
          const d = INITIAL_TEXT_DEFAULTS;
          return {
            fontSizePx: typeof j.fontSizePx === "number" ? j.fontSizePx : d.fontSizePx,
            baseColorHex: typeof j.baseColorHex === "string" ? j.baseColorHex : d.baseColorHex,
            hueOffsetDeg: typeof j.hueOffsetDeg === "number" ? j.hueOffsetDeg : d.hueOffsetDeg,
            fontFamily: typeof j.fontFamily === "string" ? j.fontFamily : d.fontFamily
          };
        }
      }
    } catch (e) {}
    return { ...INITIAL_TEXT_DEFAULTS };
  })();

  let uiPrefs = (() => {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === "object") {
          const d = INITIAL_UI_DEFAULTS;
          return {
            baseUiHex: typeof j.baseUiHex === "string" ? j.baseUiHex : d.baseUiHex,
            uiHueOffsetDeg: typeof j.uiHueOffsetDeg === "number" ? j.uiHueOffsetDeg : d.uiHueOffsetDeg
          };
        }
      }
    } catch (e) {}
    return { ...INITIAL_UI_DEFAULTS };
  })();

  function saveTextPrefs() {
    try { localStorage.setItem(TEXT_PREFS_KEY, JSON.stringify(textPrefs)); } catch (e) {}
  }
  function saveUiPrefs() {
    try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs)); } catch (e) {}
  }

  function applyTextPrefs() {
    const targetEls = [];
    if (aiOutputEl) targetEls.push(aiOutputEl);
    if (aiInputEl)  targetEls.push(aiInputEl);

    const finalColor = applyHueOffsetToHex(textPrefs.baseColorHex, textPrefs.hueOffsetDeg);

    targetEls.forEach(el => {
      el.style.fontSize   = textPrefs.fontSizePx + "px";
      el.style.color      = finalColor;
      el.style.fontFamily = textPrefs.fontFamily;
    });
  }

  function applyUiPrefs() {
    const accentHex = applyHueOffsetToHex(uiPrefs.baseUiHex, uiPrefs.uiHueOffsetDeg);

    document.documentElement.style.setProperty("--meq-accent", accentHex);

    let styleEl = document.getElementById("meqUiAccentOverride");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "meqUiAccentOverride";
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      :root { --meq-accent: ${accentHex}; }

      /* Borders */
      #chatSessionPanel,
      #chatInfoPanel,
      #sessionContextMenu,
      #rightPanel,
      #rightTop,
      #aiInput,
      #aiOutput,
      #meqTopControlWrap .meq-mini-btn,
      #meqTopControlWrap select,
      #meqTopControlWrap input[type="range"],
      #meqTopControlWrap input[type="color"],
      #sessionSearchInput,
      #modelSelect {
        border-color: var(--meq-accent) !important;
      }

      /* UI text color (chrome + labels + panels + Model: + news area) */
      #chatSessionPanel,
      #chatInfoPanel,
      #chatInfoPanel *,
      #sessionContextMenu,
      #meqTopControlWrap,
      #meqTopControlWrap .meq-mini-btn,
      #meqTopControlWrap .meq-mini-label,
      #meqTopControlWrap select,
      #rightTop,
      #rightTop label,
      #rightTop span,
      #modelSelect,
      #modelSelect option {
        color: var(--meq-accent) !important;
      }

      /* Make sure model select background stays dark */
      #modelSelect,
      #modelSelect option {
        background: #000 !important;
      }

      /* General buttons/menus follow accent (NOTE: leaves background alone) */
      #chatSessionPanel button,
      #chatInfoPanel button,
      #rightPanel button,
      #rightPanel input[type="button"],
      #rightPanel input[type="submit"],
      #rightTop .action-btn,
      #sessionContextMenu div {
        border-color: var(--meq-accent) !important;
        color: var(--meq-accent) !important;
      }

      /* AI action icons follow accent */
      #aiOutput .msg-copy-btn,
      #aiOutput .msg-play-btn {
        color: var(--meq-accent) !important;
      }

      /* --- FAVORITES MUST STAY FIXED COLORS --- */
      /* Your favorites = green */
      #chatSessionPanel .fav-btn.solid,
      #chatSessionPanel .fav-btn.hollow {
        color: #0f0 !important;
      }

      /* Other users' favorites = red */
      #chatSessionPanel .fav-foreign {
        color: #f00 !important;
      }


      /* Scrollbars */
      body,
      #chatSessionPanel,
      #chatInfoPanel,
      #aiOutput,
      #rightMiddle {
        scrollbar-color: var(--meq-accent) #050505;
      }
      body::-webkit-scrollbar,
      #chatSessionPanel::-webkit-scrollbar,
      #chatInfoPanel::-webkit-scrollbar,
      #aiOutput::-webkit-scrollbar,
      #rightMiddle::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      body::-webkit-scrollbar-track,
      #chatSessionPanel::-webkit-scrollbar-track,
      #chatInfoPanel::-webkit-scrollbar-track,
      #aiOutput::-webkit-scrollbar-track,
      #rightMiddle::-webkit-scrollbar-track {
        background: #050505;
      }
      body::-webkit-scrollbar-thumb,
      #chatSessionPanel::-webkit-scrollbar-thumb,
      #chatInfoPanel::-webkit-scrollbar-thumb,
      #aiOutput::-webkit-scrollbar-thumb,
      #rightMiddle::-webkit-scrollbar-thumb {
        background: var(--meq-accent);
        border-radius: 8px;
        border: 2px solid #050505;
      }

      /* glow */
      #chatSessionPanel,
      #chatInfoPanel,
      #meqTopControlWrap .meq-mini-btn {
        box-shadow: 0 0 8px color-mix(in srgb, var(--meq-accent) 40%, transparent) !important;
      }

      /* --- SEND BUTTON SPECIAL CASE ---
         IMPORTANT: use higher specificity than #rightPanel button */
      #rightPanel #aiSend,
      #aiSend,
      #rightPanel .send-btn,
      #rightPanel .chat-send,
      #rightPanel .meq-send-btn,
      #rightPanel input[type="submit"],
      #rightPanel button[type="submit"],
      #sendBtn {
        background: var(--meq-accent) !important;
        border-color: var(--meq-accent) !important;
        color: #000 !important;        /* text stays black */
        font-weight: 700;
      }

      #rightPanel #aiSend:hover,
      #aiSend:hover,
      #rightPanel .send-btn:hover,
      #rightPanel .chat-send:hover,
      #rightPanel .meq-send-btn:hover,
      #rightPanel input[type="submit"]:hover,
      #rightPanel button[type="submit"]:hover,
      #sendBtn:hover {
        background: color-mix(in srgb, var(--meq-accent) 85%, #fff) !important;
        border-color: var(--meq-accent) !important;
        color: #000 !important;
      }
    `;

    // --- Hard fail-safe: directly apply to known elements in case late CSS rewrites inline styles
    try {
      if (modelSelect) {
        modelSelect.style.borderColor = accentHex;
        modelSelect.style.color = accentHex;
        modelSelect.style.background = "#000";
      }
      const aiSendBtn = document.getElementById("aiSend");
      if (aiSendBtn) {
        aiSendBtn.style.background = accentHex;
        aiSendBtn.style.borderColor = accentHex;
        aiSendBtn.style.color = "#000";
      }
    } catch (e) {}
  }

  function initTopTextControls() {
    if (!modelSelect) return;
    const parent = modelSelect.parentElement;
    if (!parent) return;

    if (document.getElementById("meqTopControlWrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "meqTopControlWrap";
    wrap.style.cssText = `
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      gap:6px;
      width:100%;
    `;

    parent.insertBefore(wrap, modelSelect);
    wrap.appendChild(modelSelect);
modelSelect.style.width = "180px";
    // --- NEW: toggle button right after model dropdown
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "meq-mini-btn meq-toggle-btn";
    toggleBtn.textContent = "▶";
    toggleBtn.title = "Show controls";
    toggleBtn.style.padding = "2px 4px"; // slightly tighter than normal mini buttons
    wrap.appendChild(toggleBtn);

    // --- NEW: container that holds ALL injected controls we want to hide/show
    const controlsDiv = document.createElement("div");
    controlsDiv.id = "meqTopInjectedControls";
    controlsDiv.style.cssText = `
      display:none;
      flex-wrap:wrap;
      align-items:center;
      gap:6px;
      width:100%;
      flex: 1 1 100%;
      margin-top:4px;
    `;
    wrap.appendChild(controlsDiv);

    let controlsOpen = false;
    toggleBtn.addEventListener("click", () => {
      controlsOpen = !controlsOpen;
      controlsDiv.style.display = controlsOpen ? "flex" : "none";
      toggleBtn.textContent = controlsOpen ? "▼" : "▶";
      toggleBtn.title = controlsOpen ? "Hide controls" : "Show controls";
    });

    const style = document.createElement("style");
    style.textContent = `
/* --- Chat Sessions panel should follow accent --- */
#chatSessionPanel {
  position: fixed;
  left: 10px;
  top: 60px;
  width: 260px;
  height: calc(100vh - 70px);
  background: #050505;

  border: 1px solid var(--meq-accent) !important;
  padding: 8px;
  font-family: monospace;
  font-size: 11px;
  color: var(--meq-accent) !important;
  overflow-y: auto;
  z-index: 998;
  display: none;
}
#chatSessionPanel h2 {
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--meq-accent) !important;
}

/* Buttons in chat sessions */
#chatSessionPanel #newSessionBtn,
#chatSessionPanel #viewDeletedBtn,
#chatSessionPanel #viewArchiveBtn {
  width: 100%;
  margin-bottom: 6px;
  padding: 4px;
  background: #111;

  color: var(--meq-accent) !important;
  border: 1px solid var(--meq-accent) !important;
  border-radius: 4px;
  cursor: pointer;
  font-family: monospace;
  font-size: 11px;
}

      #meqTopControlWrap .meq-mini-btn {
        background:#111;
        color:#0ff;
        border:1px solid #0ff;
        border-radius:4px;
        padding:2px 6px;
        cursor:pointer;
        font-family:monospace;
        font-size:11px;
        line-height:1.2;
      }
      #meqTopControlWrap .meq-mini-btn:hover { background:#033; }
      #meqTopControlWrap .meq-mini-label {
        font-family:monospace;
        font-size:11px;
        color:#0ff;
        opacity:0.9;
        margin-left:2px;
        margin-right:2px;
        white-space:nowrap;
      }
      #meqTopControlWrap select,
      #meqTopControlWrap input[type="color"],
      #meqTopControlWrap input[type="range"] {
        background:#050505;
        color:#0ff;
        border:1px solid #0ff;
        border-radius:4px;
        font-family:monospace;
        font-size:11px;
        padding:2px 4px;
      }
      #meqTopControlWrap input[type="range"] {
        height: 14px;
      }
    `;
    document.head.appendChild(style);

    // GROUP 1
    const groupFont = document.createElement("div");
    groupFont.style.cssText = `
      display:flex;
      align-items:center;
      gap:6px;
      flex:0 0 auto;
      white-space:nowrap;
    `;

    const minusBtn = document.createElement("button");
    minusBtn.className = "meq-mini-btn";
    minusBtn.textContent = "−";
    minusBtn.title = "Decrease font size";

    const plusBtn = document.createElement("button");
    plusBtn.className = "meq-mini-btn";
    plusBtn.textContent = "+";
    plusBtn.title = "Increase font size";

    const sizeLabel = document.createElement("span");
    sizeLabel.className = "meq-mini-label";
    sizeLabel.id = "meqFontSizeLabel";

    function updateSizeLabel() {
      sizeLabel.textContent = `${Math.round(textPrefs.fontSizePx)}px`;
    }

    minusBtn.addEventListener("click", () => {
      textPrefs.fontSizePx = clamp(textPrefs.fontSizePx - 1, 8, 32);
      updateSizeLabel();
      applyTextPrefs();
      saveTextPrefs();
    });

    plusBtn.addEventListener("click", () => {
      textPrefs.fontSizePx = clamp(textPrefs.fontSizePx + 1, 8, 32);
      updateSizeLabel();
      applyTextPrefs();
      saveTextPrefs();
    });

    const fontLabel = document.createElement("span");
    fontLabel.className = "meq-mini-label";
    fontLabel.textContent = "Font";

    const fontSelect = document.createElement("select");
    fontSelect.title = "Change chat font";

    const FONT_OPTIONS = [
      { label: "Default", value: "inherit" },
      { label: "Monospace", value: "monospace" },
      { label: "Courier New", value: '"Courier New", monospace' },
      { label: "Arial", value: "Arial, sans-serif" },
      { label: "Verdana", value: "Verdana, sans-serif" },
      { label: "Georgia", value: "Georgia, serif" },
      { label: "Times", value: '"Times New Roman", serif' }
    ];

    FONT_OPTIONS.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      fontSelect.appendChild(o);
    });

    const initialFont = textPrefs.fontFamily || "inherit";
    const match = FONT_OPTIONS.find(o => o.value === initialFont);
    fontSelect.value = match ? match.value : "inherit";

    fontSelect.addEventListener("change", () => {
      textPrefs.fontFamily = fontSelect.value;
      applyTextPrefs();
      saveTextPrefs();
    });

    groupFont.appendChild(minusBtn);
    groupFont.appendChild(plusBtn);
    groupFont.appendChild(sizeLabel);
    groupFont.appendChild(fontLabel);
    groupFont.appendChild(fontSelect);
    controlsDiv.appendChild(groupFont);

    // GROUP 2
    const groupText = document.createElement("div");
    groupText.style.cssText = `
      display:flex;
      align-items:center;
      gap:6px;
      flex:0 0 auto;
      white-space:nowrap;
    `;

    const colorLabel = document.createElement("span");
    colorLabel.className = "meq-mini-label";
    colorLabel.textContent = "Text";

    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = textPrefs.baseColorHex;
    colorPicker.title = "Pick base text color";

    const hueLabel = document.createElement("span");
    hueLabel.className = "meq-mini-label";
    hueLabel.textContent = "Hue";

    const hueSlider = document.createElement("input");
    hueSlider.type = "range";
    hueSlider.min = "-180";
    hueSlider.max = "180";
    hueSlider.step = "1";
    hueSlider.value = String(textPrefs.hueOffsetDeg || 0);
    hueSlider.title = "Shift hue of text color";
    hueSlider.style.width = "80px";

    colorPicker.addEventListener("input", () => {
      textPrefs.baseColorHex = colorPicker.value;
      applyTextPrefs();
      saveTextPrefs();
    });

    hueSlider.addEventListener("input", () => {
      textPrefs.hueOffsetDeg = parseInt(hueSlider.value, 10) || 0;
      applyTextPrefs();
      saveTextPrefs();
    });

    groupText.appendChild(colorLabel);
    groupText.appendChild(colorPicker);
    groupText.appendChild(hueLabel);
    groupText.appendChild(hueSlider);
    controlsDiv.appendChild(groupText);

    // GROUP 3
    const groupUi = document.createElement("div");
    groupUi.style.cssText = `
      display:flex;
      align-items:center;
      gap:6px;
      flex:0 0 auto;
      white-space:nowrap;
    `;

    const uiLabel = document.createElement("span");
    uiLabel.className = "meq-mini-label";
    uiLabel.textContent = "UI";

    const uiColorPicker = document.createElement("input");
    uiColorPicker.type = "color";
    uiColorPicker.value = uiPrefs.baseUiHex;
    uiColorPicker.title = "Pick base UI accent color";

    const uiHueLabel = document.createElement("span");
    uiHueLabel.className = "meq-mini-label";
    uiHueLabel.textContent = "Hue";

    const uiHueSlider = document.createElement("input");
    uiHueSlider.type = "range";
    uiHueSlider.min = "-180";
    uiHueSlider.max = "180";
    uiHueSlider.step = "1";
    uiHueSlider.value = String(uiPrefs.uiHueOffsetDeg || 0);
    uiHueSlider.title = "Shift hue of UI accent color";
    uiHueSlider.style.width = "80px";

    uiColorPicker.addEventListener("input", () => {
      uiPrefs.baseUiHex = uiColorPicker.value;
      applyUiPrefs();
      saveUiPrefs();
    });

    uiHueSlider.addEventListener("input", () => {
      uiPrefs.uiHueOffsetDeg = parseInt(uiHueSlider.value, 10) || 0;
      applyUiPrefs();
      saveUiPrefs();
    });

    groupUi.appendChild(uiLabel);
    groupUi.appendChild(uiColorPicker);
    groupUi.appendChild(uiHueLabel);
    groupUi.appendChild(uiHueSlider);
    controlsDiv.appendChild(groupUi);

    // GROUP 4
    const resetGroup = document.createElement("div");
    resetGroup.style.cssText = `
      display:flex;
      align-items:center;
      gap:6px;
      flex:0 0 auto;
      white-space:nowrap;
    `;

    const resetBtn = document.createElement("button");
    resetBtn.className = "meq-mini-btn";
    resetBtn.textContent = "Reset Defaults";
    resetBtn.title = "Reset text + UI settings to defaults";

    resetBtn.addEventListener("click", () => {
      textPrefs = { ...INITIAL_TEXT_DEFAULTS };
      uiPrefs   = { ...INITIAL_UI_DEFAULTS };

      colorPicker.value = textPrefs.baseColorHex;
      hueSlider.value   = String(textPrefs.hueOffsetDeg || 0);
      fontSelect.value  = "inherit";
      updateSizeLabel();

      uiColorPicker.value = uiPrefs.baseUiHex;
      uiHueSlider.value   = String(uiPrefs.uiHueOffsetDeg || 0);

      applyTextPrefs();
      applyUiPrefs();
      saveTextPrefs();
      saveUiPrefs();
    });

    resetGroup.appendChild(resetBtn);
    controlsDiv.appendChild(resetGroup);

    updateSizeLabel();
    applyTextPrefs();
    applyUiPrefs();
  }


  // --- Color math helpers (hex <-> HSL) ---
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function hexToRgb(hex) {
    const h = (hex || "").replace("#", "").trim();
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return { r, g, b };
    }
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    if ([r,g,b].some(x => Number.isNaN(x))) return null;
    return { r, g, b };
  }

  function rgbToHex(r, g, b) {
    const toHex = (v) => {
      const s = clamp(Math.round(v), 0, 255).toString(16);
      return s.length === 1 ? "0" + s : s;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2*l - 1)) * s;
    const x = c * (1 - Math.abs(((h/60) % 2) - 1));
    const m = l - c/2;
    let r1=0, g1=0, b1=0;

    if (h < 60)      { r1=c; g1=x; b1=0; }
    else if (h < 120){ r1=x; g1=c; b1=0; }
    else if (h < 180){ r1=0; g1=c; b1=x; }
    else if (h < 240){ r1=0; g1=x; b1=c; }
    else if (h < 300){ r1=x; g1=0; b1=c; }
    else             { r1=c; g1=0; b1=x; }

    return {
      r: (r1 + m) * 255,
      g: (g1 + m) * 255,
      b: (b1 + m) * 255
    };
  }

  function applyHueOffsetToHex(hex, offsetDeg) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const newH = hsl.h + (offsetDeg || 0);
    const outRgb = hslToRgb(newH, hsl.s, hsl.l);
    return rgbToHex(outRgb.r, outRgb.g, outRgb.b);
  }

  // ---------------------------------------------------------------------------
  // EVE SPEECH CONTROL FROM CHAT
  // ---------------------------------------------------------------------------
  let lastEveSpeechText = null;

  function playEveForText(text) {
    if (!text) return;
    const trimmed = String(text).trim();
    if (!trimmed) return;

    if (!window.meqEveOverlay || typeof window.meqEveOverlay.setSpeechText !== "function") {
      console.warn("Eve overlay not ready for speech.");
      return;
    }

    const overlay = window.meqEveOverlay;
    const isSpeaking = !!overlay.isSpeaking;
    const sameAsLast = (lastEveSpeechText === trimmed);

    if (sameAsLast && isSpeaking) {
      if (typeof overlay.stopSpeech === "function") overlay.stopSpeech();
      return;
    }

    overlay.setSpeechText(trimmed);

    if (typeof overlay.speak === "function") overlay.speak();
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));

    lastEveSpeechText = trimmed;
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (err) {
      console.warn("Copy failed:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // MODEL HANDLING
  // ---------------------------------------------------------------------------
  function getCurrentModel() {
    if (!modelSelect) {
      return { provider: "gemini", model: "gemini-2.0-flash" };
    }
    const raw = modelSelect.value || "gemini:gemini-2.0-flash";
    const parts = raw.split(":");
    return {
      provider: parts[0] || "gemini",
      model: parts[1] || "gemini-2.0-flash"
    };
  }

  // ---------------------------------------------------------------------------
  // PUBLIC SEND ENTRYPOINT
  // ---------------------------------------------------------------------------
  async function send(userText) {
    const { provider, model } = getCurrentModel();

    state.messages.push({ role: "user", content: userText });

    const reply = await callPhpProxy(provider, model, state.messages);

    state.messages.push({ role: "assistant", content: reply });

    let label;
    if (provider === "openai") label = `OpenAI (${model})`;
    else if (provider === "gemini") label = `Gemini (${model})`;
    else label = provider.toUpperCase();

    try {
      if (window.meqEveOverlay && typeof window.meqEveOverlay.setSpeechText === "function") {
        window.meqEveOverlay.setSpeechText(reply);
      } else {
        window.EVE_SPEECH_TEXT = reply;
      }
    } catch (e) {
      console.warn("Failed to set Eve speech text:", e);
    }

    streamAIReply(label, reply);
  }

  // ---------------------------------------------------------------------------
  // CALL PHP BACKEND (CHAT + LOGGING)
  // ---------------------------------------------------------------------------
  async function callPhpProxy(provider, model, messages) {
    try {
      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          provider,
          model,
          session_id: currentSessionId,
          messages
        })
      });

      if (!res.ok) {
        const txt = await res.text();
        return `[Proxy error ${res.status}]: ${txt}`;
      }

      const data = await res.json();

      if (data.session_id) {
        currentSessionId        = data.session_id;
        currentSessionCreatedAt = data.created_at || currentSessionCreatedAt;
        const ownerFlag         = !!data.owner;
        upsertSession(currentSessionId, currentSessionCreatedAt, ownerFlag);
        renderSessionList();
      }

      return data.reply || "[Empty reply from proxy]";
    } catch (err) {
      return "[Network error: " + err.message + "]";
    }
  }

  // ---------------------------------------------------------------------------
  // SMALL MARKDOWN-ISH FORMATTER
  // ---------------------------------------------------------------------------
  function formatStreamText(text) {
    if (!text) return "";

    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    escaped = escaped.replace(/\r\n|\r|\n/g, "<br>");

    return escaped;
  }

  function isAISender(sender) {
    if (!sender) return false;
    const s = String(sender).toLowerCase();
    if (s === "ai") return true;
    if (s.startsWith("openai ")) return true;
    if (s.startsWith("gemini ")) return true;
    if (s.indexOf("fake api reply") !== -1) return true;
    if (s === "eve") return true;
    return false;
  }

  function applyUserChatFilter() {
    if (!aiOutputEl) return;
    const hide = !!filters.hideUserChat;
    const msgs = aiOutputEl.querySelectorAll(".msg.msg-user");
    msgs.forEach(m => {
      m.style.display = hide ? "none" : "";
    });
  }

  // ---------------------------------------------------------------------------
  // APPEND A FULLY-FORMATTED MESSAGE
  // ---------------------------------------------------------------------------
  function appendFormattedMessage(sender, text) {
    if (!aiOutputEl) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = "msg";

    if (isAISender(sender)) msgDiv.classList.add("msg-ai");
    else if (sender === "You" || sender === "User Query") msgDiv.classList.add("msg-self");
    else if (sender === "System") msgDiv.classList.add("msg-system");
    else msgDiv.classList.add("msg-user");

    const senderSpan = document.createElement("span");
    senderSpan.className = "sender";
    senderSpan.textContent = sender + ": ";

    const contentSpan = document.createElement("span");
    contentSpan.className = "streamed-text";
    contentSpan.innerHTML = formatStreamText(text);

    let playBtn = null;
    let copyBtn = null;

    if (isAISender(sender)) {
      playBtn = document.createElement("button");
      playBtn.className = "msg-play-btn";
      playBtn.title = "Make Eve say this";
      playBtn.textContent = "▶";
      playBtn.addEventListener("click", () => playEveForText(text));

      copyBtn = document.createElement("button");
      copyBtn.className = "msg-copy-btn";
      copyBtn.title = "Copy response to clipboard";
      copyBtn.textContent = "📋";
      copyBtn.addEventListener("click", () => copyToClipboard(text));
    }

    if (playBtn) msgDiv.appendChild(playBtn);
    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(contentSpan);
    if (copyBtn) msgDiv.appendChild(copyBtn);

    aiOutputEl.appendChild(msgDiv);

    const scrollEl = rightMiddleEl || aiOutputEl.parentElement || aiOutputEl;
    scrollEl.scrollTop = scrollEl.scrollHeight;

    applyUserChatFilter();
  }

  // ---------------------------------------------------------------------------
  // STREAMING OUTPUT
  // ---------------------------------------------------------------------------
  function streamAIReply(senderLabel, fullText) {
    if (!aiOutputEl) {
      if (typeof window.appendAIMessage === "function") {
        window.appendAIMessage(senderLabel, fullText);
      }
      return;
    }

    const msgDiv = document.createElement("div");
    msgDiv.className = "msg msg-ai";

    const senderSpan = document.createElement("span");
    senderSpan.className = "sender";
    senderSpan.textContent = senderLabel + ": ";

    const contentSpan = document.createElement("span");
    contentSpan.className = "streamed-text";

    const playBtn = document.createElement("button");
    playBtn.className = "msg-play-btn";
    playBtn.title = "Make Eve say this";
    playBtn.textContent = "▶";
    playBtn.addEventListener("click", () => playEveForText(fullText));

    const copyBtn = document.createElement("button");
    copyBtn.className = "msg-copy-btn";
    copyBtn.title = "Copy response to clipboard";
    copyBtn.textContent = "📋";
    copyBtn.addEventListener("click", () => copyToClipboard(fullText));

    msgDiv.appendChild(playBtn);
    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(contentSpan);
    msgDiv.appendChild(copyBtn);

    aiOutputEl.appendChild(msgDiv);

    const scrollEl = rightMiddleEl || aiOutputEl.parentElement || aiOutputEl;
    scrollEl.scrollTop = scrollEl.scrollHeight;

    const tokens = fullText.match(/(\s+|[^\s]+)/g) || [];
    let idx = 0;
    const delay = 40;
    let renderedSoFar = "";

    function step() {
      if (idx >= tokens.length) return;
      const nextToken = tokens[idx++];
      renderedSoFar += nextToken;

      contentSpan.innerHTML = formatStreamText(renderedSoFar);

      scrollEl.scrollTop = scrollEl.scrollHeight;
      setTimeout(step, delay);
    }

    step();
    applyUserChatFilter();
  }

  // ---------------------------------------------------------------------------
  // CHAT SESSION PANEL
  // ---------------------------------------------------------------------------
  function createSessionPanel() {
    if (document.getElementById("chatSessionPanel")) return;

    const panel = document.createElement("div");
    panel.id = "chatSessionPanel";
    panel.innerHTML = `
      <h2>Chat Sessions</h2>
      <div id="sessionFilters">
        <label><input type="checkbox" id="filterHideFav"> Hide favorited</label>
        <label><input type="checkbox" id="filterHideNonFav"> Hide non-favorited</label>
        <label><input type="checkbox" id="filterHideOthers" checked> Hide sessions from others</label>
        <label><input type="checkbox" id="filterHideSelf"> Hide my sessions</label>
        <label><input type="checkbox" id="filterHideUserChat"> Hide User Chat</label>
        <div id="sessionSearchWrap">
          <input type="text" id="sessionSearchInput"
                 placeholder="Search sessions..."
                 style="width:100%; box-sizing:border-box; margin-top:4px;
                        background:#050505; border:1px solid #0ff; color:#0ff;
                        font-family:monospace; font-size:10px; border-radius:3px; padding:2px 4px;">
        </div>
      </div>

      <button id="newSessionBtn">NEW SESSION</button>
      <button id="viewDeletedBtn">VIEW MY DELETED SESSIONS</button>
      <button id="viewArchiveBtn">VIEW ARCHIVE</button>

      <div id="sessionList"></div>
    `;
    document.body.appendChild(panel);

    const newBtn = panel.querySelector("#newSessionBtn");
    if (newBtn) newBtn.addEventListener("click", startNewSession);

    const deletedBtn = panel.querySelector("#viewDeletedBtn");
    if (deletedBtn) deletedBtn.addEventListener("click", () => setSessionViewMode("deleted"));

    const archiveBtn = panel.querySelector("#viewArchiveBtn");
    if (archiveBtn) archiveBtn.addEventListener("click", () => setSessionViewMode("archive"));

    const hideFavCb       = panel.querySelector("#filterHideFav");
    const hideNonFavCb    = panel.querySelector("#filterHideNonFav");
    const hideOthersCb    = panel.querySelector("#filterHideOthers");
    if (hideOthersCb && hideOthersCb.checked) filters.hideOthers = true;
    const hideSelfCb      = panel.querySelector("#filterHideSelf");
    const hideUserChatCb  = panel.querySelector("#filterHideUserChat");
    const searchInput     = panel.querySelector("#sessionSearchInput");

    if (hideFavCb) hideFavCb.addEventListener("change", () => { filters.hideFav = hideFavCb.checked; renderSessionList(); });
    if (hideNonFavCb) hideNonFavCb.addEventListener("change", () => { filters.hideNonFav = hideNonFavCb.checked; renderSessionList(); });
    if (hideOthersCb) hideOthersCb.addEventListener("change", () => { filters.hideOthers = hideOthersCb.checked; renderSessionList(); });
    if (hideSelfCb) hideSelfCb.addEventListener("change", () => { filters.hideSelf = hideSelfCb.checked; renderSessionList(); });
    if (hideUserChatCb) hideUserChatCb.addEventListener("change", () => { filters.hideUserChat = hideUserChatCb.checked; applyUserChatFilter(); });
    if (searchInput) searchInput.addEventListener("input", () => { filters.searchTerm = searchInput.value.toLowerCase(); renderSessionList(); });

    contextMenuEl = document.createElement("div");
    contextMenuEl.id = "sessionContextMenu";
    document.body.appendChild(contextMenuEl);

    contextMenuEl.addEventListener("click", onContextMenuClick);
    document.addEventListener("click", (e) => {
      if (!contextMenuEl) return;
      if (e.target === contextMenuEl || contextMenuEl.contains(e.target)) return;
      hideContextMenu();
    });
  }

  function createRightInfoPanel() {
    if (document.getElementById("chatInfoPanel")) return;

    const panel = document.createElement("div");
    panel.id = "chatInfoPanel";
    panel.innerHTML = `
      <h2>MEQUA Info Panel</h2>
      <div id="chatInfoContent">
        <div style="font-size:11px; color:#0ff;">
          <p><img src="ncz.png"></p>
          <p>MEQUA News:</p>
          <p>Gemini 2.0 Flash model is active for use.</p>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  function startNewSession() {
    currentSessionId        = null;
    currentSessionCreatedAt = null;
    state.messages          = [];

    if (aiOutputEl) aiOutputEl.innerHTML = "";

    sessionViewMode = "active";
    loadSessionList("active");
  }

  function upsertSession(id, createdAt, owner, title, favorite) {
    if (!id) return;
    const existing = sessions.find(s => s.id === id);
    if (existing) {
      if (createdAt && !existing.created_at) existing.created_at = createdAt;
      if (typeof owner === "boolean")        existing.owner      = owner;
      if (typeof title === "string")         existing.title      = title;
      if (typeof favorite === "boolean")     existing.favorite   = favorite;
    } else {
      sessions.push({
        id,
        created_at: createdAt || "",
        owner: !!owner,
        title: typeof title === "string" ? title : "",
        favorite: !!favorite
      });
    }
  }

  function renderSessionList() {
    const panel = document.getElementById("chatSessionPanel");
    if (!panel) return;

    const listEl = panel.querySelector("#sessionList");
    if (!listEl) return;

    listEl.innerHTML = "";

    let any = false;
    const term = filters.searchTerm || "";

    sessions.forEach(s => {
      if (filters.hideFav && s.favorite)      return;
      if (filters.hideNonFav && !s.favorite)  return;
      if (filters.hideOthers && !s.owner)     return;
      if (filters.hideSelf && s.owner)        return;

      if (term) {
        const base = (s.title && s.title.trim())
          ? s.title.trim()
          : (s.created_at || s.id || "");
        const haystack = base.toLowerCase();
        if (!haystack.includes(term)) return;
      }

      any = true;

      const entry = document.createElement("div");
      entry.className = "session-entry";
      if (s.id === currentSessionId) entry.classList.add("current");
      if (s.owner) entry.classList.add("owned");

      const labelSpan = document.createElement("span");
      labelSpan.className = "session-label";

      const base = s.title && s.title.trim()
        ? s.title.trim()
        : (s.created_at || s.id);

      labelSpan.textContent = (s.id === currentSessionId) ? `Current: ${base}` : base;
      entry.appendChild(labelSpan);

      if (s.owner) {
        const favBtn = document.createElement("button");
        favBtn.className = "fav-btn " + (s.favorite ? "solid" : "hollow");
        favBtn.textContent = s.favorite ? "★" : "☆";
        favBtn.title = s.favorite ? "Unfavorite" : "Favorite";
        favBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(s.id); });
        entry.appendChild(favBtn);
      } else if (s.favorite) {
        const foreignFav = document.createElement("span");
        foreignFav.className = "fav-foreign";
        foreignFav.textContent = "★";
        foreignFav.title = "Favorited by owner";
        entry.appendChild(foreignFav);
      }

      entry.dataset.sessionId = s.id;

      entry.addEventListener("click", () => {
        if (s.id === currentSessionId) return;
        loadSessionFromServer(s.id);
      });

      entry.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!s.owner) return;

        if (sessionViewMode === "archive" && !isArchiveRestoreAllowed(s)) return;
        showContextMenu(s.id, e.pageX, e.pageY);
      });

      listEl.appendChild(entry);
    });

    if (!any) listEl.innerHTML = `<div class="session-entry">No sessions match filters</div>`;
  }

  async function loadSessionList(mode = sessionViewMode) {
    try {
      const action = getListActionForMode(mode);

      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });

      if (!res.ok) return;

      const data = await res.json();
      sessions = Array.isArray(data.sessions) ? data.sessions : [];
      renderSessionList();
    } catch (err) {
      console.error("Error loading session list:", err);
    }
  }

  async function loadSessionFromServer(sessionId) {
    try {
      const action = getLoadActionForMode(sessionViewMode);

      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, session_id: sessionId })
      });

      if (!res.ok) {
        console.error("Failed to load session", sessionId);
        return;
      }

      const data = await res.json();
      currentSessionId        = data.session_id || sessionId;
      currentSessionCreatedAt = data.created_at || null;
      const ownerFlag         = !!data.owner;
      const title             = typeof data.title === "string" ? data.title : "";
      const favorite          = !!data.favorite;

      const msgs = Array.isArray(data.messages) ? data.messages : [];
      state.messages = msgs;

      if (aiOutputEl) aiOutputEl.innerHTML = "";

      msgs.forEach(msg => {
        const role    = msg.role || "";
        const content = msg.content || "";
        const sender  = role === "user" ? "User Query" : "AI";
        appendFormattedMessage(sender, content);
      });

      upsertSession(currentSessionId, currentSessionCreatedAt, ownerFlag, title, favorite);
      renderSessionList();
    } catch (err) {
      console.error("Error loading session:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // FAVORITES + META UPDATE
  // ---------------------------------------------------------------------------
  async function toggleFavorite(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.owner) return;

    const newFav = !s.favorite;
    s.favorite = newFav;
    renderSessionList();

    try {
      await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_session_meta",
          session_id: sessionId,
          favorite: newFav
        })
      });
    } catch (err) {
      console.error("Error updating favorite:", err);
    }
  }

  async function renameSession(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.owner) return;

    const currentLabel = s.title && s.title.trim()
      ? s.title.trim()
      : (s.created_at || s.id);

    const newName = window.prompt("Rename session:", currentLabel);
    if (newName === null) return;

    const trimmed = newName.trim();
    s.title = trimmed;
    renderSessionList();

    try {
      await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_session_meta",
          session_id: sessionId,
          title: trimmed
        })
      });
    } catch (err) {
      console.error("Error renaming session:", err);
    }
  }

  async function deleteSession(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.owner) return;

    const ok = window.confirm("Delete this session? It will be moved to the deleted folder.");
    if (!ok) return;

    try {
      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_session",
          session_id: sessionId
        })
      });

      if (!res.ok) console.error("Failed to delete session", sessionId);
    } catch (err) {
      console.error("Error deleting session:", err);
    }

    sessions = sessions.filter(x => x.id !== sessionId);
    if (currentSessionId === sessionId) currentSessionId = null;
    renderSessionList();
  }

  async function archiveSession(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.owner) return;

    const ok = window.confirm("Archive this session? It will be moved to the archive folder.");
    if (!ok) return;

    try {
      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "archive_session",
          session_id: sessionId
        })
      });

      if (!res.ok) console.error("Failed to archive session", sessionId);
    } catch (err) {
      console.error("Error archiving session:", err);
    }

    sessions = sessions.filter(x => x.id !== sessionId);
    if (currentSessionId === sessionId) currentSessionId = null;
    renderSessionList();
  }

  async function restoreSession(sessionId) {
    const ok = window.confirm("Restore this session back to active sessions?");
    if (!ok) return;

    try {
      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_session",
          session_id: sessionId
        })
      });

      if (!res.ok) console.error("Failed to restore session", sessionId);
    } catch (err) {
      console.error("Error restoring session:", err);
    }

    sessions = sessions.filter(x => x.id !== sessionId);
    renderSessionList();
  }

  async function unarchiveSession(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.owner) return;

    if (!isArchiveRestoreAllowed(s)) {
      window.alert("This archive is too old to restore to active.");
      return;
    }

    const ok = window.confirm("Move this archived session back to active?");
    if (!ok) return;

    try {
      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unarchive_session",
          session_id: sessionId
        })
      });

      if (!res.ok) console.error("Failed to unarchive session", sessionId);
    } catch (err) {
      console.error("Error unarchiving session:", err);
    }

    sessions = sessions.filter(x => x.id !== sessionId);
    if (currentSessionId === sessionId) currentSessionId = null;
    renderSessionList();
  }

  async function trashSession(sessionId) {
    const ok = window.confirm("Permanently delete this session? It will be moved to the trash folder.");
    if (!ok) return;

    try {
      const res = await fetch("https://xtdevelopment.net/chat-proxy/chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trash_session",
          session_id: sessionId,
          from: sessionViewMode
        })
      });

      if (!res.ok) console.error("Failed to trash session", sessionId);
    } catch (err) {
      console.error("Error trashing session:", err);
    }

    sessions = sessions.filter(x => x.id !== sessionId);
    if (currentSessionId === sessionId) currentSessionId = null;
    renderSessionList();
  }

  // ---------------------------------------------------------------------------
  // CONTEXT MENU (MODE-AWARE)
  // ---------------------------------------------------------------------------
  function buildContextMenuHtmlForMode(sessionObj) {
    if (sessionViewMode === "active") {
      return `
        <div data-menu-action="rename">Rename Session</div>
        <div data-menu-action="archive">Archive Session</div>
        <div data-menu-action="delete">Delete Session</div>
      `;
    }

    if (sessionViewMode === "deleted") {
      return `
        <div data-menu-action="restore">Restore Session</div>
        <div data-menu-action="trash">Permanent Delete</div>
      `;
    }

    if (sessionViewMode === "archive") {
      return `
        <div data-menu-action="unarchive">Restore to Active</div>
      `;
    }

    return "";
  }

  function showContextMenu(sessionId, x, y) {
    if (!contextMenuEl) return;

    const s = sessions.find(z => z.id === sessionId) || null;
    const html = buildContextMenuHtmlForMode(s);
    if (!html.trim()) return;

    contextMenuSessionId = sessionId;
    contextMenuEl.innerHTML = html;
    contextMenuEl.style.display = "block";
    contextMenuEl.style.left = x + "px";
    contextMenuEl.style.top = y + "px";
  }

  function hideContextMenu() {
    if (!contextMenuEl) return;
    contextMenuEl.style.display = "none";
    contextMenuSessionId = null;
  }

  function onContextMenuClick(e) {
    const action = e.target.getAttribute("data-menu-action");
    if (!action || !contextMenuSessionId) return;

    const sid = contextMenuSessionId;
    hideContextMenu();

    if (action === "rename") renameSession(sid);
    else if (action === "delete") deleteSession(sid);
    else if (action === "archive") archiveSession(sid);
    else if (action === "restore") restoreSession(sid);
    else if (action === "trash") trashSession(sid);
    else if (action === "unarchive") unarchiveSession(sid);
  }

  // ---------------------------------------------------------------------------
  // FULL CHAT MODE
  // ---------------------------------------------------------------------------
  function installFullChatButton() {
    if (!fullChatBtn) return;

    const style = document.createElement("style");
    style.textContent = `
      #chatSessionPanel .fav-foreign {
        flex: 0 0 auto;
        padding: 0 4px;
        font-size: 13px;
        color: #f00;
        opacity: 0.9;
      }

      #chatSessionPanel {
        position: fixed;
        left: 10px;
        top: 60px;
        width: 260px;
        height: calc(100vh - 70px);
        background: #050505;
        border: 1px solid var(--meq-accent);
        padding: 8px;
        font-family: monospace;
        font-size: 11px;
        color: var(--meq-accent);
        overflow-y: auto;
        z-index: 998;
        display: none;
      }
      #chatSessionPanel h2 {
        font-size: 12px;
        margin-bottom: 4px;
        color: var(--meq-accent);
      }
      #chatSessionPanel #newSessionBtn {
        width: 100%;
        margin-bottom: 6px;
        padding: 4px;
        background: #111;
        color: var(--meq-accent);
        border: 1px solid var(--meq-accent);
        border-radius: 4px;
        cursor: pointer;
        font-family: monospace;
        font-size: 11px;
      }
      #chatSessionPanel #newSessionBtn:hover { background: #033; }

      #chatSessionPanel #viewDeletedBtn,
      #chatSessionPanel #viewArchiveBtn {
        width: 100%;
        margin-bottom: 6px;
        padding: 4px;
        background: #111;
        color: var(--meq-accent);
        border: 1px solid var(--meq-accent);
        border-radius: 4px;
        cursor: pointer;
        font-family: monospace;
        font-size: 11px;
      }
      #chatSessionPanel #viewDeletedBtn:hover,
      #chatSessionPanel #viewArchiveBtn:hover { background: #033; }

      #chatSessionPanel .session-entry {
        border-bottom: 1px solid #222;
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      #chatSessionPanel .session-entry:hover { background: #033; }
      #chatSessionPanel .session-entry.current { background: #022; }
      #chatSessionPanel .session-entry.owned { border-left: 2px solid #0f0; }
      #chatSessionPanel .session-label {
        flex: 1 1 auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #chatSessionPanel .fav-btn {
        flex: 0 0 auto;
        padding: 0 4px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 13px;
      }
      #chatSessionPanel .fav-btn.solid { color: #0f0; }
      #chatSessionPanel .fav-btn.hollow { color: #0f0; opacity: 0.4; }

      #sessionFilters {
        margin-top: 8px;
        border-top: 1px solid #222;
        padding-top: 4px;
        font-size: 10px;
      }
      #sessionFilters label { display: block; margin-top: 2px; cursor: pointer; }
      #sessionFilters input[type="checkbox"] { margin-right: 4px; }
      #sessionSearchWrap { margin-top: 4px; }

      #chatInfoPanel {
        position: fixed;
        right: 10px;
        top: 60px;
        width: 260px;
        height: calc(100vh - 70px);
        background: #050505;
        border: 1px solid var(--meq-accent);
        padding: 8px;
        font-family: monospace;
        font-size: 11px;
        color: var(--meq-accent);
        overflow-y: auto;
        z-index: 998;
        display: none;
      }
      #chatInfoPanel h2 { font-size: 12px; margin-bottom: 4px; color: var(--meq-accent); }

      #sessionContextMenu {
        position: absolute;
        display: none;
        background: #111;
        border: 1px solid var(--meq-accent);
        font-family: monospace;
        font-size: 11px;
        color: var(--meq-accent);
        z-index: 2000;
        min-width: 140px;
      }
      #sessionContextMenu div { padding: 4px 8px; cursor: pointer; }
      #sessionContextMenu div:hover { background: #033; }

      body.chat-full-active #segmentLog { display: none !important; }
      body.chat-full-active #chatSessionPanel { display: block; }
      body.chat-full-active #chatInfoPanel { display: block; }

      body.chat-full-active #rightPanel {
        position: fixed;
        left: 280px;
        right: 280px;
        top: 70px;
        bottom: 20px;
        width: auto;
        height: auto;
        z-index: 999;
      }

      body.chat-full-active #rightTop { flex: 0 0 auto; }
      body.chat-full-active #rightTop .action-btn { display: none; }
      body.chat-full-active #rightTop .action-btn[data-action="full-chat"] { display: block; }

      #aiOutput .streamed-text { white-space: normal; }
      #aiOutput code { font-family: monospace; font-size: 11px; }

      #aiOutput .msg-play-btn,
      #aiOutput .msg-copy-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 11px;
        padding: 0 3px;
      }
      #aiOutput .msg-play-btn { color: #0f0; margin-right: 4px; }
      #aiOutput .msg-copy-btn { color: var(--meq-accent); margin-left: 4px; }
      #aiOutput .msg-play-btn:hover,
      #aiOutput .msg-copy-btn:hover { filter: brightness(1.4); }
    `;
    document.head.appendChild(style);

    fullChatBtn.addEventListener("click", () => {
      const body = document.body;
      const activating = !body.classList.contains("chat-full-active");

      if (activating) {
        body.classList.add("chat-full-active");
        fullChatBtn.textContent = "COLLAPSE CHAT";
      } else {
        body.classList.remove("chat-full-active");
        fullChatBtn.textContent = "FULL CHAT MODE";
      }

      if (typeof window.updateCanvasScale === "function") {
        window.updateCanvasScale();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------
  installFullChatButton();
  createSessionPanel();
  createRightInfoPanel();
  loadSessionList("active");
  initTopTextControls();

  window.appendAIMessage = appendFormattedMessage;

  if (fullChatBtn) {
    setTimeout(() => {
      if (!document.body.classList.contains("chat-full-active")) {
        fullChatBtn.click();
      }
    }, 500);
  }

  return {
    send,
    getCurrentSessionId: function () {
      return currentSessionId;
    },
    adoptSessionFromSlash: function (meta) {
      if (!meta || !meta.session_id) return;

      currentSessionId        = meta.session_id;
      currentSessionCreatedAt = meta.created_at || currentSessionCreatedAt;

      const ownerFlag = !!meta.owner;
      const title     = typeof meta.title === "string" ? meta.title : "";
      const favorite  = !!meta.favorite;

      upsertSession(currentSessionId, currentSessionCreatedAt, ownerFlag, title, favorite);
      renderSessionList();
    }
  };
})();
