// meq-skybox.js
// - Find the "Show map UI" button
// - Rename it to "Show Digital Skybox"
// - Toggle a full overlay panel (same size/position as musicPanel)
// - Lazy-load https://skybox.nanocheeze.com into an iframe
//
// UI UPDATE:
//  - All borders / text / close button use the live UI picker accent.
//  - Top action button (mapBtn) also tracks accent.
//  - No canvas / map / iframe behavior changed.

(function () {
  // Try to find a specific action button first, then fall back to text match
  function findMapButton() {
    const byAction = document.querySelector('.action-btn[data-action="map-ui"]');
    if (byAction) return byAction;

    const candidates = Array.from(
      document.querySelectorAll('button, .action-btn, input[type="button"], input[type="submit"]')
    );
    for (const el of candidates) {
      const txt = (el.textContent || el.value || "").trim().toUpperCase();
      if (txt === "SHOW MAP UI") {
        return el;
      }
    }
    return null;
  }

  const mapBtn = findMapButton();
  if (!mapBtn) return;

  // ---------------------------------------------------------------------------
  // UI COLOR PICKER SUPPORT
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

  function styleActionButton(btn, accent, hoverBg) {
    if (!btn) return;
    btn.style.setProperty("border-color", accent, "important");
    btn.style.setProperty("color", accent, "important");
    btn.style.background = "#111";
    btn.onmouseenter = () => { btn.style.background = hoverBg; };
    btn.onmouseleave = () => { btn.style.background = "#111"; };
  }

  // ---------------------------------------------------------------------------
  // Rename button
  // ---------------------------------------------------------------------------
  const SHOW_LABEL = "Show Digital Skybox";
  const HIDE_LABEL = "Hide Digital Skybox";

  if (mapBtn.tagName === "INPUT") {
    mapBtn.value = SHOW_LABEL;
  } else {
    mapBtn.textContent = SHOW_LABEL;
  }

  // Create the Digital Skybox panel – same geometry as musicPanel
  const panel = document.createElement("div");
  panel.id = "skyboxPanel";
  panel.style.cssText = `
    display: none;
    position: fixed;
    left: 280px;
    right: 280px;
    top: 70px;
    bottom: 20px;
    background: #000;
    border: 1px solid #0ff;
    z-index: 999;
    padding: 0;
    box-sizing: border-box;

    /* ✅ Fix iframe fit: flex column container */
    flex-direction: column;
    overflow: hidden;
  `;

  panel.innerHTML = `
    <div id="skyboxHeader" style="
      flex: 0 0 auto;              /* ✅ header fixed height */
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:4px 8px;
      border-bottom:1px solid #0ff;
      background:#050505;
      font-family:monospace;
      font-size:12px;
      color:#0ff;
      box-sizing:border-box;
    ">
      <span>DIGITAL SKYBOX • skybox.nanocheeze.com</span>
      <button id="skyboxPanelClose">CLOSE</button>
    </div>
    <iframe
      id="skyboxFrame"
      data-src="https://skybox.nanocheeze.com"
      src="about:blank"
      style="
        width:100%;
        flex: 1 1 auto;            /* ✅ take remaining height */
        min-height: 0;             /* ✅ allow proper flex shrinking */
        height:auto;
        border:none;
        display:block;             /* ✅ no inline gap */
        box-sizing:border-box;
      ">
    </iframe>
  `;

  document.body.appendChild(panel);

  const closeBtn   = panel.querySelector("#skyboxPanelClose");
  const headerEl   = panel.querySelector("#skyboxHeader");
  const iframe     = panel.querySelector("#skyboxFrame");
  let iframeLoaded = false;

  // ---------------------------------------------------------------------------
  // Apply accent to panel + close button (live)
  // ---------------------------------------------------------------------------
  let lastAccent = null;

  function applyAccent() {
    const accent = getUIAccent();
    if (!accent || accent === lastAccent) return;
    lastAccent = accent;

    const hoverBg = getSoftHoverBg();

    panel.style.borderColor = accent;

    if (headerEl) {
      headerEl.style.color = accent;
      headerEl.style.borderBottomColor = accent;
    }

    if (closeBtn) {
      closeBtn.style.background = "#111";
      closeBtn.style.color = accent;
      closeBtn.style.border = `1px solid ${accent}`;
      closeBtn.style.fontFamily = "monospace";
      closeBtn.style.fontSize = "11px";
      closeBtn.style.padding = "2px 8px";
      closeBtn.style.cursor = "pointer";
      closeBtn.onmouseenter = () => { closeBtn.style.background = hoverBg; };
      closeBtn.onmouseleave = () => { closeBtn.style.background = "#111"; };
    }

    styleActionButton(mapBtn, accent, hoverBg);
  }

  setInterval(applyAccent, 300);
  applyAccent();

  function openPanel() {
    applyAccent();

    // ✅ flex so iframe fills correctly
    panel.style.display = "flex";

    // Lazy-load iframe the first time the panel is opened
    if (!iframeLoaded && iframe) {
      const target = iframe.getAttribute("data-src");
      if (target) {
        iframe.src = target;
        iframeLoaded = true;
      }
    }
  }

  function closePanel() {
    panel.style.display = "none";
  }

  // Toggle panel when button is clicked
  mapBtn.addEventListener("click", () => {
    if (panel.style.display === "flex") {
      closePanel();
      if (mapBtn.tagName === "INPUT") {
        mapBtn.value = SHOW_LABEL;
      } else {
        mapBtn.textContent = SHOW_LABEL;
      }
    } else {
      openPanel();
      if (mapBtn.tagName === "INPUT") {
        mapBtn.value = HIDE_LABEL;
      } else {
        mapBtn.textContent = HIDE_LABEL;
      }
    }
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closePanel();
      if (mapBtn.tagName === "INPUT") {
        mapBtn.value = SHOW_LABEL;
      } else {
        mapBtn.textContent = SHOW_LABEL;
      }
    });
  }
})();
