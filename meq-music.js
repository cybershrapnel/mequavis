// meq-music.js

(function () {
  const musicBtn = document.querySelector('.action-btn[data-action="other-mode"]');
  if (!musicBtn) return;

  musicBtn.textContent = "AI MUSIC";

  // ---------------------------------------------------------------------------
  // UI COLOR PICKER SUPPORT (robust)
  // Priority:
  //  1) CSS vars on :root or body
  //  2) window globals
  //  3) localStorage common keys
  //  4) computed border/text color from existing UI elements
  //  5) fallback cyan
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

      // FINAL BACKSTOP:
      // pull accent from something your picker already recolors
      const probeSelectors = [
        "#segmentLog",
        "#rightPanel",
        "#layoutBtn",
        ".action-btn",
        "#aiInput",
        "#aiSend"
      ];

      for (const sel of probeSelectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const cs = getComputedStyle(el);

        // prefer borders first
        const borderCols = [
          cs.borderTopColor,
          cs.borderRightColor,
          cs.borderBottomColor,
          cs.borderLeftColor,
          cs.borderColor
        ].filter(Boolean);

        for (const bc of borderCols) {
          if (bc && bc !== "transparent" && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(bc)) {
            return bc;
          }
        }

        // then text color
        if (cs.color && cs.color !== "transparent") {
          return cs.color;
        }
      }
    } catch {}

    return "#0ff";
  }

  function getSoftHoverBg(accent) {
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const soft =
        readCssVar(rootStyle, "--soft-border") ||
        readCssVar(bodyStyle, "--soft-border");
      if (soft) return soft;
    } catch {}

    // small safe dark tint based on accent presence
    return "#033";
  }

  // ---------------------------------------------------------------------------

  const panel = document.createElement("div");
  panel.id = "musicPanel";
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
    flex-direction: column;
  `;

  panel.innerHTML = `
    <div id="musicPanelHeader" style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:4px 8px;
      border-bottom:1px solid #0ff;
      background:#050505;
      font-family:monospace;
      font-size:12px;
      color:#0ff;
    ">
      <span>AI MUSIC • music.nanocheeze.com</span>
      <div style="display:flex; gap:4px;">
        <button id="musicPanelNext">NEXT SONG</button>
        <button id="musicPanelShowPlaylist">Show Playlist</button>
        <button id="musicPanelClose">CLOSE</button>
      </div>
    </div>
    <iframe
      id="musicFrame"
      data-random-src="https://xtdevelopment.net/embed/player/?song=RANDOM"
      data-playlist-src="https://music.nanocheeze.com"
      src="about:blank"
      style="width:100%;flex:1 1 auto;height:auto;border:none;">
    </iframe>
  `;

  document.body.appendChild(panel);

  const headerEl        = panel.querySelector("#musicPanelHeader");
  const closeBtn        = panel.querySelector("#musicPanelClose");
  const nextBtn         = panel.querySelector("#musicPanelNext");
  const showPlaylistBtn = panel.querySelector("#musicPanelShowPlaylist");
  const iframe          = panel.querySelector("#musicFrame");
  let iframeLoaded      = false;

  // Apply picker accent to panel + header + buttons
  let lastAccent = null;
  function applyAccent() {
    const accent = getUIAccent();
    if (!accent || accent === lastAccent) return;
    lastAccent = accent;

    const hoverBg = getSoftHoverBg(accent);

    panel.style.borderColor = accent;

    if (headerEl) {
      headerEl.style.borderBottomColor = accent;
      headerEl.style.color = accent;
    }

    const btns = [nextBtn, showPlaylistBtn, closeBtn];
    btns.forEach((b) => {
      if (!b) return;

      b.style.background = "#111";
      b.style.color = accent;
      b.style.border = `1px solid ${accent}`;
      b.style.fontFamily = "monospace";
      b.style.fontSize = "11px";
      b.style.padding = "2px 8px";
      b.style.cursor = "pointer";
      b.style.borderRadius = "3px";

      b.onmouseenter = () => { b.style.background = hoverBg; };
      b.onmouseleave = () => { b.style.background = "#111"; };
    });
  }

  // Keep synced if picker changes
  setInterval(applyAccent, 300);

  // --- NEXT button cooldown state ---
  const NEXT_COOLDOWN_SECONDS = 5;
  let nextCooldownActive    = false;
  let nextCooldownTimer     = null;
  let nextCooldownRemaining = 0;

  function resetNextCooldown() {
    if (nextCooldownTimer) {
      clearInterval(nextCooldownTimer);
      nextCooldownTimer = null;
    }
    nextCooldownActive = false;
    nextCooldownRemaining = 0;

    if (nextBtn) {
      nextBtn.disabled = false;
      const original = nextBtn.dataset.originalLabel || "NEXT SONG";
      nextBtn.textContent = original;
    }
  }

  function startNextCooldown() {
    if (!nextBtn) return;

    if (!nextBtn.dataset.originalLabel) {
      nextBtn.dataset.originalLabel = nextBtn.textContent || "NEXT SONG";
    }

    if (nextCooldownTimer) {
      clearInterval(nextCooldownTimer);
      nextCooldownTimer = null;
    }

    nextCooldownActive    = true;
    nextCooldownRemaining = NEXT_COOLDOWN_SECONDS;
    nextBtn.disabled      = true;
    nextBtn.textContent   = `NEXT (${nextCooldownRemaining})`;

    nextCooldownTimer = setInterval(() => {
      nextCooldownRemaining--;
      if (nextCooldownRemaining <= 0) {
        resetNextCooldown();
      } else if (nextBtn) {
        nextBtn.textContent = `NEXT (${nextCooldownRemaining})`;
      }
    }, 1000);
  }

  function openPanel() {
    applyAccent();
    panel.style.display = "flex";

    if (!iframeLoaded && iframe) {
      const target = iframe.getAttribute("data-random-src");
      if (target) {
        iframe.src = target + "&_=" + Date.now();
        iframeLoaded = true;
      }
    }
    resetNextCooldown();
  }

  function closePanel() {
    panel.style.display = "none";
    resetNextCooldown();
  }

  function loadRandomSong() {
    if (!iframe) return;
    const base = iframe.getAttribute("data-random-src") ||
      "https://xtdevelopment.net/embed/player/?song=RANDOM";
    iframe.src = base + "&_=" + Date.now();
    iframeLoaded = true;
  }

  function loadPlaylist() {
    if (!iframe) return;
    const url = iframe.getAttribute("data-playlist-src") ||
      "https://music.nanocheeze.com";
    iframe.src = url;
    iframeLoaded = true;
  }

  musicBtn.addEventListener("click", () => {
    if (panel.style.display === "flex") closePanel();
    else openPanel();
  });

  if (closeBtn) closeBtn.addEventListener("click", closePanel);

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (nextCooldownActive) return;
      loadRandomSong();
      startNextCooldown();
    });
  }

  if (showPlaylistBtn) {
    showPlaylistBtn.addEventListener("click", loadPlaylist);
  }

  applyAccent();
})();
