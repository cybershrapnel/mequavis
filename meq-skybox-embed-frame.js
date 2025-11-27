// meq-skybox-embed-frame.js
// Skybox embed + canvas/skybox mode controls + panel hide/show
// + full chat wiring to .action-btn[data-action="full-chat"].

// EXPECTS:
//   - #skyboxPanel with #skyboxHeader, #skyboxPanelClose, #skyboxFrame
//   - #mequavis canvas
//   - #segmentLog left panel
//   - .action-btn[data-action="full-chat"] that toggles text between
//       "FULL CHAT MODE" and "COLLAPSE CHAT"

(function () {
  function findMapButton() {
    const byAction = document.querySelector('.action-btn[data-action="map-ui"]');
    if (byAction) return byAction;

    const candidates = Array.from(
      document.querySelectorAll(
        'button, .action-btn, input[type="button"], input[type="submit"]'
      )
    );
    for (const el of candidates) {
      const txt = (el.textContent || el.value || "").trim().toUpperCase();
      if (
        txt === "SHOW MAP UI" ||
        txt === "SHOW DIGITAL SKYBOX" ||
        txt === "HIDE DIGITAL SKYBOX"
      ) {
        return el;
      }
    }
    return null;
  }

  function setupWhenReady() {
    const panel     = document.getElementById("skyboxPanel");
    const headerEl  = panel && panel.querySelector("#skyboxHeader");
    const closeBtn  = panel && panel.querySelector("#skyboxPanelClose");
    const iframe    = panel && panel.querySelector("#skyboxFrame");
    const canvas    = document.getElementById("mequavis");
    const layoutBtn = document.getElementById("layoutBtn");
    const leftPanel = document.getElementById("segmentLog");

    if (!panel || !headerEl || !iframe || !canvas || !leftPanel) return false;

    const mapBtn = findMapButton();
    if (panel._meqEmbedInitialized) return true;
    panel._meqEmbedInitialized = true;

    let embedBtn          = null;
    let modeToggleBtn     = null;
    let hidePanelBtn      = null;
    let showPanelBtn      = null;
    let floatingModeBtn   = null;
    let floatingCanvasBtn = null;

    const original = {
      panel: {
        left:       panel.style.left,
        right:      panel.style.right,
        top:        panel.style.top,
        bottom:     panel.style.bottom,
        border:     panel.style.border,
        padding:    panel.style.padding,
        zIndex:     panel.style.zIndex,
        background: panel.style.background,
      },
      headerDisplay: headerEl.style.display,
      iframe: {
        position: iframe.style.position,
        top:      iframe.style.top,
        right:    iframe.style.right,
        bottom:   iframe.style.bottom,
        left:     iframe.style.left,
        width:    iframe.style.width,
        height:   iframe.style.height,
        flex:     iframe.style.flex,
      },
      canvasBg:            canvas.style.backgroundColor,
      canvasPointerEvents: canvas.style.pointerEvents,
      canvasDisplay:       canvas.style.display,
      layoutBtnPosition:   layoutBtn ? layoutBtn.style.position : null,
      layoutBtnZIndex:     layoutBtn ? layoutBtn.style.zIndex   : null,
      leftPanelDisplay:    leftPanel.style.display,
    };

    let embedActive    = false;
    let shiftDown      = false;
    let controlMode    = "canvas"; // "canvas" | "skybox"
    let canvasHidden   = false;
    let fullChatActive = false;    // driven by full-chat button text

    function leftPanelIsHidden() {
      return leftPanel && leftPanel.style.display === "none";
    }

    function effectiveMode() {
      if (!embedActive) return "canvas";
      if (shiftDown) return "skybox";
      return controlMode;
    }

    function updateModeToggleLabel() {
      const eff = effectiveMode();
      const label = eff === "skybox" ? "Skybox" : "Canvas";

      if (modeToggleBtn) {
        modeToggleBtn.textContent = label;
        modeToggleBtn.title = label;
      }
      if (floatingModeBtn) {
        floatingModeBtn.textContent = label;
        floatingModeBtn.title = label;
      }
    }

    function applyCanvasVisibility() {
      if (canvasHidden) {
        canvas.style.display = "none";
      } else {
        canvas.style.display = original.canvasDisplay || "";
      }
      if (floatingCanvasBtn) {
        floatingCanvasBtn.textContent = canvasHidden ? "Show Canvas" : "Hide Canvas";
        floatingCanvasBtn.title = canvasHidden ? "Show the MEQ canvas" : "Hide the MEQ canvas";
      }
    }

    function applyCanvasPointerMode() {
      const mode = effectiveMode();
      if (!embedActive || mode === "canvas") {
        if (original.canvasPointerEvents) {
          canvas.style.pointerEvents = original.canvasPointerEvents;
        } else {
          canvas.style.removeProperty("pointer-events");
        }
      } else {
        canvas.style.pointerEvents = "none";
      }
      updateModeToggleLabel();
    }

    function activateEmbed() {
      if (embedActive) return;
      embedActive = true;

      panel.style.left   = "0";
      panel.style.right  = "0";
      panel.style.top    = "0";
      panel.style.bottom = "0";
      panel.style.border = "none";
      panel.style.padding = "0";
      panel.style.background = "transparent";
      panel.style.zIndex = "-10";

      headerEl.style.display = "none";

      iframe.style.position = "absolute";
      iframe.style.top      = "0";
      iframe.style.left     = "0";
      iframe.style.right    = "0";
      iframe.style.bottom   = "0";
      iframe.style.width    = "100%";
      iframe.style.height   = "100%";
      iframe.style.flex     = "none";

      canvas.style.backgroundColor = "transparent";

      if (layoutBtn) {
        if (!layoutBtn.style.position) {
          layoutBtn.style.position = "relative";
        }
        layoutBtn.style.zIndex = "-20";
      }

      applyCanvasPointerMode();
    }

    function resetEmbed() {
      if (!embedActive) return;
      embedActive = false;
      shiftDown   = false;
      controlMode = "canvas";

      panel.style.left      = original.panel.left;
      panel.style.right     = original.panel.right;
      panel.style.top       = original.panel.top;
      panel.style.bottom    = original.panel.bottom;
      panel.style.border    = original.panel.border;
      panel.style.padding   = original.panel.padding;
      panel.style.zIndex    = original.panel.zIndex;
      panel.style.background= original.panel.background;

      headerEl.style.display = original.headerDisplay;

      iframe.style.position = original.iframe.position;
      iframe.style.top      = original.iframe.top;
      iframe.style.right    = original.iframe.right;
      iframe.style.bottom   = original.iframe.bottom;
      iframe.style.left     = original.iframe.left;
      iframe.style.width    = original.iframe.width;
      iframe.style.height   = original.iframe.height;
      iframe.style.flex     = original.iframe.flex;

      if (original.canvasBg) {
        canvas.style.backgroundColor = original.canvasBg;
      } else {
        canvas.style.removeProperty("background-color");
      }

      if (layoutBtn) {
        layoutBtn.style.position = original.layoutBtnPosition;
        layoutBtn.style.zIndex   = original.layoutBtnZIndex;
      }

      applyCanvasPointerMode();
    }

    // Full chat visibility for bottom-left 3 buttons
    function setFullChatActive(on) {
      fullChatActive = !!on;

      const hidden = leftPanelIsHidden();

      if (showPanelBtn) {
        showPanelBtn.style.display =
          (!fullChatActive && hidden) ? "block" : "none";
      }
      if (floatingModeBtn) {
        floatingModeBtn.style.display =
          (!fullChatActive && hidden) ? "block" : "none";
      }
      if (floatingCanvasBtn) {
        floatingCanvasBtn.style.display =
          (!fullChatActive && hidden) ? "block" : "none";
      }
    }

    // Make it debuggable if you want to poke it manually
    window.MeqSkyboxEmbed_setFullChat = setFullChatActive;

    // Shift = temporary skybox (click-through)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Shift" && !shiftDown) {
        shiftDown = true;
        applyCanvasPointerMode();
      }
    });

    document.addEventListener("keyup", (e) => {
      if (e.key === "Shift") {
        shiftDown = false;
        applyCanvasPointerMode();
      }
    });

    // Click outside iframe in skybox mode → back to canvas mode
    document.addEventListener(
      "mousedown",
      (e) => {
        if (!embedActive) return;
        if (effectiveMode() !== "skybox") return;

        const t = e.target;
        if (t === iframe) return;

        const ignoreTargets = [
          modeToggleBtn,
          hidePanelBtn,
          showPanelBtn,
          floatingModeBtn,
          floatingCanvasBtn,
          mapBtn,
          closeBtn,
          embedBtn,
          leftPanel,
        ].filter(Boolean);

        for (const el of ignoreTargets) {
          if (el === t || (el.contains && el.contains(t))) return;
        }

        controlMode = "canvas";
        shiftDown   = false;
        applyCanvasPointerMode();
      },
      true
    );

    // Right-click canvas toggles base mode
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      controlMode = controlMode === "canvas" ? "skybox" : "canvas";
      shiftDown   = false;
      applyCanvasPointerMode();
    });

    // EMBED FRAME button in header
    embedBtn = document.createElement("button");
    embedBtn.id = "skyboxEmbedFrameBtn";
    embedBtn.textContent = "EMBED FRAME";

    if (closeBtn) {
      embedBtn.style.background  = closeBtn.style.background || "#111";
      embedBtn.style.color       = closeBtn.style.color || "#0ff";
      embedBtn.style.border      = closeBtn.style.border || "1px solid #0ff";
      embedBtn.style.fontFamily  = closeBtn.style.fontFamily || "monospace";
      embedBtn.style.fontSize    = closeBtn.style.fontSize || "11px";
      embedBtn.style.padding     = closeBtn.style.padding || "2px 8px";
      embedBtn.style.cursor      = "pointer";
      embedBtn.style.marginRight = "4px";
    } else {
      embedBtn.style.background  = "#111";
      embedBtn.style.color       = "#0ff";
      embedBtn.style.border      = "1px solid #0ff";
      embedBtn.style.fontFamily  = "monospace";
      embedBtn.style.fontSize    = "11px";
      embedBtn.style.padding     = "2px 8px";
      embedBtn.style.cursor      = "pointer";
      embedBtn.style.marginRight = "4px";
    }

    headerEl.insertBefore(embedBtn, closeBtn || headerEl.lastChild);

    embedBtn.addEventListener("click", () => {
      if (embedActive) resetEmbed();
      else             activateEmbed();
    });

    if (mapBtn) {
      mapBtn.addEventListener("click", () => {
        if (embedActive) resetEmbed();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (embedActive) resetEmbed();
      });
    }

    // LEFT PANEL HEADER ROW: [Canvas/Skybox] [Hide Panel]
    const modeRow = document.createElement("div");
    modeRow.id = "meqCanvasModeRow";
    modeRow.style.cssText = `
      display: flex;
      gap: 4px;
      margin-bottom: 6px;
      font-size: 10px;
    `;

    modeToggleBtn = document.createElement("button");
    modeToggleBtn.id = "meqCanvasModeToggleBtn";
    modeToggleBtn.style.cssText = `
      flex: 1;
      padding: 4px 6px;
      border: 1px solid var(--meq-accent, #0ff);
      background: #111;
      color: var(--meq-accent, #0ff);
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
    `;
    modeToggleBtn.addEventListener("click", () => {
      controlMode = controlMode === "canvas" ? "skybox" : "canvas";
      shiftDown   = false;
      applyCanvasPointerMode();
    });

    hidePanelBtn = document.createElement("button");
    hidePanelBtn.id = "meqLeftPanelHideBtn";
    hidePanelBtn.textContent = "Hide Panel";
    hidePanelBtn.style.cssText = `
      padding: 4px 6px;
      border: 1px solid var(--meq-accent, #0ff);
      background: #111;
      color: var(--meq-accent, #0ff);
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
      white-space: nowrap;
    `;
    hidePanelBtn.addEventListener("click", () => {
      leftPanel.style.display = "none";
      if (!fullChatActive) {
        if (showPanelBtn)      showPanelBtn.style.display = "block";
        if (floatingModeBtn)   floatingModeBtn.style.display = "block";
        if (floatingCanvasBtn) floatingCanvasBtn.style.display = "block";
      }
    });

    modeRow.appendChild(modeToggleBtn);
    modeRow.appendChild(hidePanelBtn);
    leftPanel.insertBefore(modeRow, leftPanel.firstChild);

    // Keep that row above Download Segment Log if present
    let attempts = 0;
    const rowTimer = setInterval(() => {
      const panelEl = document.getElementById("segmentLog");
      const rowEl   = document.getElementById("meqCanvasModeRow");
      if (!panelEl || !rowEl) {
        clearInterval(rowTimer);
        return;
      }
      const dl = panelEl.querySelector("#downloadSegmentLogBtn");
      if (dl && panelEl.firstChild !== rowEl) {
        panelEl.insertBefore(rowEl, dl);
      }
      attempts++;
      if (attempts > 20) clearInterval(rowTimer);
    }, 250);

    // BOTTOM-LEFT: Show Panel
    showPanelBtn = document.createElement("button");
    showPanelBtn.id = "meqLeftPanelShowBtn";
    showPanelBtn.textContent = "Show Panel";
    showPanelBtn.style.cssText = `
      position: fixed;
      left: 8px;
      bottom: 8px;
      padding: 4px 8px;
      border: 1px solid var(--meq-accent, #0ff);
      background: #111;
      color: var(--meq-accent, #0ff);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      z-index: 1000;
      display: none;
    `;
    showPanelBtn.addEventListener("click", () => {
      leftPanel.style.display = original.leftPanelDisplay || "block";
      showPanelBtn.style.display = "none";
      if (floatingModeBtn)   floatingModeBtn.style.display = "none";
      if (floatingCanvasBtn) floatingCanvasBtn.style.display = "none";
    });
    document.body.appendChild(showPanelBtn);

    // BOTTOM-LEFT: floating mode toggle
    floatingModeBtn = document.createElement("button");
    floatingModeBtn.id = "meqCanvasModeToggleFloatingBtn";
    floatingModeBtn.style.cssText = `
      position: fixed;
      left: 110px;
      bottom: 8px;
      padding: 4px 8px;
      border: 1px solid var(--meq-accent, #0ff);
      background: #111;
      color: var(--meq-accent, #0ff);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      z-index: 1000;
      display: none;
    `;
    floatingModeBtn.addEventListener("click", () => {
      controlMode = controlMode === "canvas" ? "skybox" : "canvas";
      shiftDown   = false;
      applyCanvasPointerMode();
    });
    document.body.appendChild(floatingModeBtn);

    // BOTTOM-LEFT: canvas visibility toggle
    floatingCanvasBtn = document.createElement("button");
    floatingCanvasBtn.id = "meqCanvasVisibilityToggleBtn";
    floatingCanvasBtn.style.cssText = `
      position: fixed;
      left: 260px;
      bottom: 8px;
      padding: 4px 8px;
      border: 1px solid var(--meq-accent, #0ff);
      background: #111;
      color: var(--meq-accent, #0ff);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      z-index: 1000;
      display: none;
    `;
    floatingCanvasBtn.addEventListener("click", () => {
      canvasHidden = !canvasHidden;
      applyCanvasVisibility();
    });
    document.body.appendChild(floatingCanvasBtn);

    // Initial labels & visibility
    updateModeToggleLabel();
    applyCanvasVisibility();
    applyCanvasPointerMode();

    // === WIRE FULL CHAT BUTTON (NO MORE GUESSING) ===
    const fullChatButtons = Array.from(
      document.querySelectorAll('.action-btn[data-action="full-chat"]')
    );
    fullChatButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        // Let your own handler run first and update the text,
        // then inspect it on the next tick.
        setTimeout(() => {
          const txt = (btn.textContent || btn.value || "").trim().toUpperCase();
          if (txt === "COLLAPSE CHAT") {
            // We are NOW in full chat mode
            setFullChatActive(true);
          } else {
            // Anything else -> not in full chat
            setFullChatActive(false);
          }
        }, 0);
      });
    });

    return true;
  }

  function init() {
    if (setupWhenReady()) return;
    const timer = setInterval(() => {
      if (setupWhenReady()) clearInterval(timer);
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
