// meq-ncz-menu.js
// - Adds "Collapse Menu" button to rightPanel
// - Adds "NanoCheeZe ▾" button with NCZ dropdown
// - Expanded: main button becomes "NanoCheeZe Certifications" (no arrow)
// - Clicking "NanoCheeZe Certifications" opens NCZ iframe panel
// - NCZ sub-buttons (Upload / Explorer / Wallet) each open their own URL
// - Collapse Menu hides everything except itself and resets NanoCheeZe state
// - Panel border + close button + NCZ buttons follow UI accent color

(function () {
  if (window._meqNczMenuPatched) return;
  window._meqNczMenuPatched = true;

  // ---------------- UI ACCENT HELPERS (same pattern as other files) ---------

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
        "--meq-accent",
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

    if (!btn._meqNczHoverWired) {
      btn._meqNczHoverWired = true;
      btn.addEventListener("mouseenter", () => {
        btn.style.background = hoverBg;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "#111";
      });
    }
  }

  // --------------------- MAIN INIT -----------------------------------------

  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  onReady(initNczMenu);

  function initNczMenu() {
    const rightPanel = document.getElementById("rightPanel");
    if (!rightPanel) {
      console.warn("[meq-ncz-menu] #rightPanel not found");
      return;
    }

    const firstActionBtn = rightPanel.querySelector(".action-btn");
    const menuContainer = firstActionBtn ? firstActionBtn.parentElement : rightPanel;
    const defaultDisplay = firstActionBtn
      ? (getComputedStyle(firstActionBtn).display || "inline-block")
      : "inline-block";

    function makeMenuButton(label, actionName) {
      const tag = firstActionBtn ? firstActionBtn.tagName : "button";
      const btn = document.createElement(tag);

      if (tag.toLowerCase() === "button") {
        btn.type = "button";
      }
      btn.className = firstActionBtn ? firstActionBtn.className : "action-btn";

      if (actionName) btn.dataset.action = actionName;

      if (tag === "INPUT") {
        btn.value = label;
      } else {
        btn.textContent = label;
      }
      return btn;
    }

    function setButtonLabel(btn, label) {
      if (!btn) return;
      if (btn.tagName === "INPUT") {
        btn.value = label;
      } else {
        btn.textContent = label;
      }
    }

    // -----------------------------------------------------------------------
    // Collapse Menu button
    // -----------------------------------------------------------------------
    const collapseBtn = makeMenuButton("Collapse Menu", "collapse-menu");
    collapseBtn.dataset.collapsed = "false";
    menuContainer.insertBefore(collapseBtn, menuContainer.firstChild);

    // -----------------------------------------------------------------------
    // NanoCheeZe toggle + sub-buttons
    // -----------------------------------------------------------------------
    const nczToggleBtn = makeMenuButton("NanoCheeZe ▾", "ncz-toggle");
    nczToggleBtn.dataset.expanded = "false";
    menuContainer.insertBefore(nczToggleBtn, collapseBtn.nextSibling);

    let insertAnchor = nczToggleBtn;
    function insertBelowToggle(btn) {
      menuContainer.insertBefore(btn, insertAnchor.nextSibling);
      insertAnchor = btn;
    }

    const nczUploadBtn   = makeMenuButton("Upload File 2 NCZ", "ncz-upload");
    const nczExplorerBtn = makeMenuButton("NCZ Block Explorer", "ncz-explorer");
    const nczWalletBtn   = makeMenuButton("NCZ Web Wallet", "ncz-wallet");

    const nczChildren = [nczUploadBtn, nczExplorerBtn, nczWalletBtn];
    nczChildren.forEach(btn => {
      btn.style.display = "none";
      insertBelowToggle(btn);
    });

    // -----------------------------------------------------------------------
    // NCZ panel stub (iframe panel)
    // -----------------------------------------------------------------------
    const nczPanel = document.createElement("div");
    nczPanel.id = "nczPanel";
    nczPanel.style.cssText = [
      "position:fixed",
      "left:280px",
      "right:280px",
      "top:70px",
      "bottom:20px",
      "background:#000",
      "border:1px solid #0ff",
      "z-index:998",
      "padding:0",
      "box-sizing:border-box",
      "flex-direction:column"
    ].join(";");
    // start hidden
    nczPanel.style.display = "none";

    nczPanel.innerHTML = `
      <div id="nczPanelHeader" style="
        flex:0 0 auto;
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
        <span id="nczPanelTitle">NanoCheeZe</span>
        <button id="nczPanelClose" type="button" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">CLOSE</button>
      </div>
      <iframe
        id="nczPanelFrame"
        src="about:blank"
        style="
          width:100%;
          flex:1 1 auto;
          min-height:0;
          height:auto;
          border:none;
          display:block;
          box-sizing:border-box;
        ">
      </iframe>
    `;
    document.body.appendChild(nczPanel);

    const nczTitle  = document.getElementById("nczPanelTitle");
    const nczClose  = document.getElementById("nczPanelClose");
    const nczFrame  = document.getElementById("nczPanelFrame");
    const nczHeader = document.getElementById("nczPanelHeader");

    // 🔗 Per-button URLs – tweak these as needed
    const NCZ_URL_CERT     = "https://certification.nanocheeze.com/";
    const NCZ_URL_UPLOAD   = "https://info.nanocheeze.com";
    const NCZ_URL_EXPLORER = "https://explorer.nanocheeze.com";
    const NCZ_URL_WALLET   = "https://wallet.nanocheeze.com/";

    function openNczPanel(title, url) {
      if (nczTitle) nczTitle.textContent = title;
      if (nczFrame) nczFrame.src = url || "https://info.nanocheeze.com";
      nczPanel.style.display = "flex";
    }

    if (nczClose) {
      nczClose.addEventListener("click", () => {
        nczPanel.style.display = "none";
      });
    }

    // Sub-buttons: each opens its own URL
    nczUploadBtn.addEventListener("click", () => {
      openNczPanel("Upload File 2 NCZ", NCZ_URL_UPLOAD);
    });
    nczExplorerBtn.addEventListener("click", () => {
      openNczPanel("NCZ Block Explorer", NCZ_URL_EXPLORER);
    });
    nczWalletBtn.addEventListener("click", () => {
      openNczPanel("NCZ Web Wallet", NCZ_URL_WALLET);
    });

    // -----------------------------------------------------------------------
    // NanoCheeZe dropdown behavior
    // -----------------------------------------------------------------------
    function setNczCollapsed() {
      nczToggleBtn.dataset.expanded = "false";
      setButtonLabel(nczToggleBtn, "NanoCheeZe ▾"); // arrow in collapsed state
      nczChildren.forEach(btn => {
        btn.style.display = "none";
      });
    }

    function setNczExpanded() {
      nczToggleBtn.dataset.expanded = "true";
      // expanded: no arrow, Certifications label
      setButtonLabel(nczToggleBtn, "NanoCheeZe Certifications");
      nczChildren.forEach(btn => {
        btn.style.display = "";
      });
    }

    nczToggleBtn.addEventListener("click", () => {
      const expanded = nczToggleBtn.dataset.expanded === "true";
      if (!expanded) {
        setNczExpanded();
      } else {
        // Certifications main button = its own URL
        openNczPanel("NanoCheeZe Certifications", NCZ_URL_CERT);
      }
    });

    // -----------------------------------------------------------------------
    // Collapse Menu behavior
    // -----------------------------------------------------------------------
    collapseBtn.addEventListener("click", () => {
      const isCollapsed = collapseBtn.dataset.collapsed === "true";
      const allButtons = Array.from(menuContainer.querySelectorAll(".action-btn"));

      if (!isCollapsed) {
        // collapsing: hide everything but Collapse, remember previous inline display
        allButtons.forEach(btn => {
          if (btn === collapseBtn) return;
          btn.dataset._prevDisplay = btn.style.display || "";
          btn.style.display = "none";
        });

        setNczCollapsed();

        setButtonLabel(collapseBtn, "Show Menu");
        collapseBtn.dataset.collapsed = "true";
      } else {
        // expanding:
        allButtons.forEach(btn => {
          if (btn === collapseBtn) return;

          const isNczChild = nczChildren.includes(btn);
          const prev = btn.dataset._prevDisplay;

          if (isNczChild) {
            // children obey the NCZ expanded/collapsed state
            btn.style.display =
              nczToggleBtn.dataset.expanded === "true"
                ? ""
                : "none";
          } else {
            // restore whatever inline display was there before collapse
            btn.style.display = (typeof prev === "string") ? prev : "";
          }
        });

        setButtonLabel(collapseBtn, "Collapse Menu");
        collapseBtn.dataset.collapsed = "false";
      }
    });

    setNczCollapsed();

    // -----------------------------------------------------------------------
    // Accent wiring: panel border + header + close + NCZ buttons
    // -----------------------------------------------------------------------
    let lastAccent = null;

    function applyAccent() {
      const accent = getUIAccent();
      if (!accent || accent === lastAccent) return;
      lastAccent = accent;
      const hoverBg = getSoftHoverBg();

      // Panel
      nczPanel.style.borderColor = accent;
      if (nczHeader) {
        nczHeader.style.color = accent;
        nczHeader.style.borderBottomColor = accent;
      }

      // Close button
      if (nczClose) {
        nczClose.style.background = "#111";
        nczClose.style.color = accent;
        nczClose.style.border = `1px solid ${accent}`;
        nczClose.style.fontFamily = "monospace";
        nczClose.style.fontSize = "11px";
        nczClose.style.padding = "2px 8px";
        nczClose.style.cursor = "pointer";

        if (!nczClose._meqNczHoverWired) {
          nczClose._meqNczHoverWired = true;
          nczClose.addEventListener("mouseenter", () => {
            nczClose.style.background = hoverBg;
          });
          nczClose.addEventListener("mouseleave", () => {
            nczClose.style.background = "#111";
          });
        }
      }

      // Menu buttons styling to track accent
      styleActionButton(collapseBtn, accent, hoverBg);
      styleActionButton(nczToggleBtn, accent, hoverBg);
      styleActionButton(nczUploadBtn, accent, hoverBg);
      styleActionButton(nczExplorerBtn, accent, hoverBg);
      styleActionButton(nczWalletBtn, accent, hoverBg);
    }

    applyAccent();
    setInterval(applyAccent, 400);
  }
})();

