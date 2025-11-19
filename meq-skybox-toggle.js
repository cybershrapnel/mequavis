// meq-skybox.js
// - Find the "Show map UI" button
// - Rename it to "Show Digital Skybox"
// - Toggle a full overlay panel (same size/position as musicPanel)
// - Lazy-load https://skybox.nanocheeze.com into an iframe

(function () {
  // Try to find a specific action button first, then fall back to text match
  function findMapButton() {
    const byAction = document.querySelector('.action-btn[data-action="map-ui"]');
    if (byAction) return byAction;

    const candidates = Array.from(
      document.querySelectorAll('button, .action-btn, input[type="button"], input[type="submit"]')
    );
    for (const el of candidates) {
      const txt = (el.textContent || el.value || "").trim();
      if (txt === "SHOW MAP UI") {
        return el;
      }
    }
    return null;
  }

  const mapBtn = findMapButton();
  if (!mapBtn) return;

  // Rename button
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
  `;

  panel.innerHTML = `
    <div style="
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
      <span>DIGITAL SKYBOX • skybox.nanocheeze.com</span>
      <button id="skyboxPanelClose" style="
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
      id="skyboxFrame"
      data-src="https://skybox.nanocheeze.com"
      src="about:blank"
      style="width:100%;height:calc(100% - 28px);border:none;">
    </iframe>
  `;

  document.body.appendChild(panel);

  const closeBtn   = panel.querySelector("#skyboxPanelClose");
  const iframe     = panel.querySelector("#skyboxFrame");
  let iframeLoaded = false;

  function openPanel() {
    panel.style.display = "block";

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

  // Toggle panel when "Show Digital Skybox" button is clicked
  mapBtn.addEventListener("click", () => {
    if (panel.style.display === "block") {
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
