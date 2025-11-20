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
    display: none;          /* hidden by default */
    flex-direction: column;
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
      <div style="display:flex; gap:4px;">
        <button id="musicPanelNext" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">NEXT SONG</button>
        <button id="musicPanelShowPlaylist" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">Show Playlist</button>
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

  const closeBtn       = panel.querySelector("#musicPanelClose");
  const nextBtn        = panel.querySelector("#musicPanelNext");
  const showPlaylistBtn= panel.querySelector("#musicPanelShowPlaylist");
  const iframe         = panel.querySelector("#musicFrame");
  let iframeLoaded     = false;

  // --- NEXT button cooldown state ---
  const NEXT_COOLDOWN_SECONDS = 5;
  let nextCooldownActive      = false;
  let nextCooldownTimer       = null;
  let nextCooldownRemaining   = 0;

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

    // Clear any existing timer
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
    panel.style.display = "flex";

    // Lazy-load iframe the first time the panel is opened with the RANDOM player
    if (!iframeLoaded && iframe) {
      const target = iframe.getAttribute("data-random-src");
      if (target) {
        // Cache-bust to force reload / random selection
        iframe.src = target + "&_=" + Date.now();
        iframeLoaded = true;
      }
    }

    // Reset NEXT button cooldown each time we open
    resetNextCooldown();
  }

  function closePanel() {
    panel.style.display = "none";
    resetNextCooldown();
  }

  // Helper: load a fresh random song
  function loadRandomSong() {
    if (!iframe) return;
    const base = iframe.getAttribute("data-random-src") || "https://xtdevelopment.net/embed/player/?song=RANDOM";
    // cache-buster so the browser actually reloads
    iframe.src = base + "&_=" + Date.now();
    iframeLoaded = true;
  }

  // Helper: show full playlist site
  function loadPlaylist() {
    if (!iframe) return;
    const url = iframe.getAttribute("data-playlist-src") || "https://music.nanocheeze.com";
    iframe.src = url;
    iframeLoaded = true;
  }

  // Toggle panel when AI MUSIC button is clicked
  musicBtn.addEventListener("click", () => {
    if (panel.style.display === "flex") {
      closePanel();
    } else {
      openPanel();
    }
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener("click", closePanel);
  }

  // NEXT SONG button with cooldown
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (nextCooldownActive) return; // ignore if in cooldown
      loadRandomSong();
      startNextCooldown();
    });
  }

  // Show Playlist button
  if (showPlaylistBtn) {
    showPlaylistBtn.addEventListener("click", () => {
      loadPlaylist();
    });
  }
})();
