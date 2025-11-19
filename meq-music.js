// meq-music.js

(function () {
  // Find the OTHER MODE button
  const musicBtn = document.querySelector('.action-btn[data-action="other-mode"]');
  if (!musicBtn) return;

  // Rename button
  musicBtn.textContent = "AI MUSIC";

  // Create the AI Music panel
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
      <span>AI MUSIC • music.nanocheeze.com</span>
      <button id="musicPanelClose" style="
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
      id="musicFrame"
      data-src="https://music.nanocheeze.com"
      src="about:blank"
      style="width:100%;height:calc(100% - 28px);border:none;">
    </iframe>
  `;

  document.body.appendChild(panel);

  const closeBtn   = panel.querySelector("#musicPanelClose");
  const iframe     = panel.querySelector("#musicFrame");
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

  // Toggle panel when AI MUSIC button is clicked
  musicBtn.addEventListener("click", () => {
    if (panel.style.display === "block") {
      closePanel();
    } else {
      openPanel();
    }
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener("click", closePanel);
  }
})();
