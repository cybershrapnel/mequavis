// meq-tv.js
// WATCH AI CABLE TV panel with YouTube playlist support + Music Videos mode.
// (UI COLOR UPDATE: all borders/buttons/text now follow live UI color picker)

(function () {
  // 0) Read playlist from separate file
  let rawList = Array.isArray(window.MEQ_TV_VIDEO_IDS)
    ? window.MEQ_TV_VIDEO_IDS.slice()
    : [];

  if (!rawList.length) {
    console.warn("meq-tv.js: No MEQ_TV_VIDEO_IDS found. Add them in meq-tv-videos.js");
  }

  // Working playlist + index
  let playlist = [];
  let currentIndex = -1;

  function shufflePlaylist() {
    playlist = rawList.slice();
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
    currentIndex = -1;
  }

  function getNextVideoId() {
    if (!playlist.length) {
      shufflePlaylist();
    }
    if (!playlist.length) return null;

    currentIndex++;
    if (currentIndex >= playlist.length) {
      shufflePlaylist();
      currentIndex = 0;
    }
    return playlist[currentIndex];
  }

  // 1) Find the "WATCH AI CABLE TV" button
  let tvBtn = document.querySelector('.action-btn[data-action="watch-tv"]');

  if (!tvBtn) {
    tvBtn = Array.from(document.querySelectorAll(".action-btn")).find((btn) =>
      btn.textContent.trim().toUpperCase().includes("WATCH AI CABLETV")
    );
  }

  if (!tvBtn) {
    console.warn("meq-tv.js: WATCH AI CABLE TV button not found.");
    return;
  }

  tvBtn.textContent = "WATCH AI CABLE TV";

  // ---------------------------------------------------------------------------
  // UI COLOR PICKER SUPPORT (same strategy as your other updated panels)
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

  function stylePanelButton(btn, accent, hoverBg) {
    if (!btn) return;
    btn.style.background = "#111";
    btn.style.color = accent;
    btn.style.border = `1px solid ${accent}`;
    btn.style.fontFamily = "monospace";
    btn.style.fontSize = "11px";
    btn.style.padding = "2px 8px";
    btn.style.cursor = "pointer";
    btn.onmouseenter = () => { btn.style.background = hoverBg; };
    btn.onmouseleave = () => { btn.style.background = "#111"; };
  }

  // 2) Create the TV panel
  const panel = document.createElement("div");
  panel.id = "tvPanel";
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
    overflow: hidden;

    /* Let dynamic styles use this */
    --meq-accent: #0ff;
    --meq-soft: #033;
  `;

  panel.innerHTML = `
    <div id="tvPanelHeader" style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:4px 8px;
      border-bottom:1px solid var(--meq-accent);
      background:#050505;
      font-family:monospace;
      font-size:12px;
      color:var(--meq-accent);
      gap: 6px;
      box-sizing:border-box;
      flex:0 0 auto;
    ">
      <span>AI CABLE TV • YouTube Playlist</span>
      <div style="display:flex; gap:4px;">
        <button id="tvPanelView">View Videos</button>
        <button id="tvPanelMusicVideos">Music Videos</button>
        <button id="tvPanelNext">NEXT VIDEO</button>
        <button id="tvPanelPopout">Popout video</button>
        <button id="tvPanelClose">CLOSE</button>
      </div>
    </div>
    <div
      id="tvPlayerContainer"
      style="
        width:100%;
        flex: 1 1 auto;
        min-height:0;
        height:auto;
        overflow:hidden;
        position:relative;
      ">
    </div>
  `;

  document.body.appendChild(panel);

  const headerEl          = panel.querySelector("#tvPanelHeader");
  const closeBtn          = panel.querySelector("#tvPanelClose");
  const nextBtn           = panel.querySelector("#tvPanelNext");
  const popoutBtn         = panel.querySelector("#tvPanelPopout");
  const viewBtn           = panel.querySelector("#tvPanelView");
  const musicBtn          = panel.querySelector("#tvPanelMusicVideos");
  const playerContainerId = "tvPlayerContainer";

  // ---------------------------------------------------------------------------
  // Accent applier (runs live)
  // ---------------------------------------------------------------------------

  let lastAccent = null;
  function applyAccentEverywhere() {
    const accent = getUIAccent();
    if (!accent || accent === lastAccent) return;
    lastAccent = accent;

    const soft = getSoftHoverBg();

    panel.style.setProperty("--meq-accent", accent);
    panel.style.setProperty("--meq-soft", soft);

    panel.style.borderColor = accent;
    if (headerEl) {
      headerEl.style.color = accent;
      headerEl.style.borderBottomColor = accent;
    }

    // Header buttons
    stylePanelButton(viewBtn, accent, soft);
    stylePanelButton(musicBtn, accent, soft);
    stylePanelButton(nextBtn, accent, soft);
    stylePanelButton(popoutBtn, accent, soft);
    stylePanelButton(closeBtn, accent, soft);

    // Top action button in right panel
    styleActionButton(tvBtn, accent, soft);

    // If MV overlay is open, restyle it + its rows
    const container = document.getElementById(playerContainerId);
    const overlay = container?.querySelector("#mvPlaylistOverlay");
    if (overlay) {
      overlay.style.borderLeftColor = accent;
      overlay.style.color = accent;

      const ovHeader = overlay.querySelector(".mvOverlayHeader");
      if (ovHeader) {
        ovHeader.style.borderBottomColor = accent;
        ovHeader.style.color = accent;
      }

      const ovClose = overlay.querySelector("#mvOverlayClose");
      if (ovClose) stylePanelButton(ovClose, accent, soft);

      overlay.querySelectorAll(".mvRow").forEach(row => {
        const isCurrent = row.dataset.current === "1";
        row.style.borderColor = isCurrent ? accent : soft;
        row.style.background = isCurrent ? accent : "#000";
        row.style.color = isCurrent ? "#000" : accent;
      });
    }

    // MV wrapper borders that are already in DOM
    const mvTitle = container?.querySelector("#mvTitle");
    const mvAuthor = container?.querySelector("#mvAuthor");
    if (mvTitle) mvTitle.style.borderBottomColor = accent;
    if (mvAuthor) mvAuthor.style.borderTopColor = accent;

    const mvAudioHolder = container?.querySelector("#mvAudioHolder");
    if (mvAudioHolder) mvAudioHolder.style.borderTopColor = accent;
  }

  setInterval(applyAccentEverywhere, 300);
  applyAccentEverywhere();

  // ---------------------------------------------------------------------------
  // 3) YouTube IFrame API loader & player
  // ---------------------------------------------------------------------------
  let player = null;
  let ytApiLoading = false;
  let isExternalViewActive = false;
  let isMusicVideosMode = false;

  function updateMusicBtnLabel() {
    if (!musicBtn) return;
    musicBtn.textContent = isMusicVideosMode ? "Videos" : "Music Videos";
  }

  function ensureYouTubeAPI(callback) {
    if (window.YT && typeof YT.Player === "function") {
      callback();
      return;
    }

    if (!ytApiLoading) {
      ytApiLoading = true;

      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);

      const prev = window.onYouTubeIframeAPIReady;
      window._meqTvYTCallbacks = [];

      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === "function") prev();
        if (Array.isArray(window._meqTvYTCallbacks)) {
          window._meqTvYTCallbacks.forEach((cb) => {
            try { cb(); } catch (e) { console.error("meq-tv.js callback error:", e); }
          });
          window._meqTvYTCallbacks.length = 0;
        }
      };
    }

    window._meqTvYTCallbacks = window._meqTvYTCallbacks || [];
    window._meqTvYTCallbacks.push(callback);
  }

  function createPlayer() {
    if (!rawList.length) return;

    if (!playlist.length) shufflePlaylist();
    const firstId = getNextVideoId();
    if (!firstId) return;

    const container = document.getElementById(playerContainerId);
    if (!container) return;
    container.innerHTML = "";

    player = new YT.Player(playerContainerId, {
      height: "100%",
      width: "100%",
      videoId: firstId,
      playerVars: {
        autoplay: 1,
        rel: 0,
        controls: 1,
        playsinline: 1
      },
      events: {
        onStateChange: onPlayerStateChange
      }
    });
  }

  function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
      playNextVideo();
    }
  }

  function playNextVideo() {
    const nextId = getNextVideoId();
    if (!nextId) return;
    if (player && typeof player.loadVideoById === "function") {
      player.loadVideoById(nextId);
    }
  }

  function destroyPlayer() {
    if (player && typeof player.destroy === "function") {
      try { player.stopVideo(); } catch (e) {}
      player.destroy();
    }
    player = null;

    const container = document.getElementById(playerContainerId);
    if (container && !isMusicVideosMode && !isExternalViewActive) {
      container.innerHTML = "";
    }
  }

  // ---------------------------------------------------------------------------
  // 3.25) VIEW VIDEOS external iframe (normal mode only)
  // ---------------------------------------------------------------------------
  function loadExternalVideoSite() {
    destroyPlayer();
    exitMusicVideosMode();

    const container = document.getElementById(playerContainerId);
    if (!container) return;

    container.innerHTML = `
      <iframe
        src="https://xtdevelopment.net/mtv/"
        style="width:100%; height:100%; border:none; display:block;"
        loading="lazy"
      ></iframe>
    `;

    isExternalViewActive = true;
    updateMusicBtnLabel();
  }

  // ---------------------------------------------------------------------------
  // 3.3) MUSIC VIDEOS MODE
  // ---------------------------------------------------------------------------
  let musicVideosList = [];
  let currentMusicIndex = -1;
  let musicVideosLoaded = false;
  let mvAudioEl = null;
  let mvVideoEl = null;

  let musicOrder = [];
  let currentMusicOrderIndex = -1;

  let mvOverlayOpen = false;

  function shuffleMusicOrder() {
    musicOrder = musicVideosList.map((_, idx) => idx);
    for (let i = musicOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [musicOrder[i], musicOrder[j]] = [musicOrder[j], musicOrder[i]];
    }
    currentMusicOrderIndex = -1;
  }

  function getNextMusicIndex() {
    if (!musicVideosList.length) return -1;
    if (!musicOrder.length) shuffleMusicOrder();

    currentMusicOrderIndex++;
    if (currentMusicOrderIndex >= musicOrder.length) {
      shuffleMusicOrder();
      currentMusicOrderIndex = 0;
    }
    return musicOrder[currentMusicOrderIndex];
  }

  function stopMusicVideoPlayback() {
    if (mvAudioEl) {
      try { mvAudioEl.pause(); } catch (e) {}
      mvAudioEl.src = "";
      mvAudioEl = null;
    }
    if (mvVideoEl) {
      try { mvVideoEl.pause(); } catch (e) {}
      mvVideoEl.src = "";
      mvVideoEl.load?.();
      mvVideoEl = null;
    }
    const container = document.getElementById(playerContainerId);
    if (container && isMusicVideosMode === false && !isExternalViewActive && !player) {
      container.innerHTML = "";
    }
  }

  function exitMusicVideosMode() {
    if (!isMusicVideosMode) return;
    isMusicVideosMode = false;
    mvOverlayOpen = false;
    stopMusicVideoPlayback();
    const container = document.getElementById(playerContainerId);
    if (container && !isExternalViewActive) {
      container.innerHTML = "";
    }
    updateMusicBtnLabel();
  }

  function parseVideosTxt(text) {
    const lines = text.split(/\r?\n/);
    const items = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 4) continue;
      const [title, audioUrl, videoUrl, author] = parts;
      items.push({
        title: title.trim(),
        audioUrl: audioUrl.trim(),
        videoUrl: videoUrl.trim(),
        author: author.trim()
      });
    }
    return items;
  }

  function loadMusicVideosList(callback) {
    if (musicVideosLoaded) {
      if (typeof callback === "function") callback();
      return;
    }

    fetch("videos.txt", { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load videos.txt");
        return res.text();
      })
      .then((text) => {
        musicVideosList = parseVideosTxt(text);
        musicVideosLoaded = true;
        if (!musicVideosList.length) {
          console.warn("meq-tv.js: videos.txt is empty or malformed.");
        }
        if (typeof callback === "function") callback();
      })
      .catch((err) => {
        console.error("meq-tv.js: Error loading videos.txt:", err);
        if (typeof callback === "function") callback();
      });
  }

  // Inject dark audio styling (accent-aware)
  function ensureMeqTvPlayerStyles() {
    if (document.getElementById("meqTvPlayerStyles")) return;

    const style = document.createElement("style");
    style.id = "meqTvPlayerStyles";
    style.textContent = `
      #tvPanel #mvAudioHolder {
        padding: 8px 10px !important;
        background: #1e1e1e !important;
        border-top: 1px solid var(--meq-accent, #0ff) !important;
        box-sizing: border-box !important;
      }
      #tvPanel audio#mvAudio {
        width: 100% !important;
        background: #2c2c2c !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 4px 0 !important;
      }
      #tvPanel audio#mvAudio::-webkit-media-controls-panel {
        background-color: #2c2c2c !important;
        color: #fff !important;
      }
      #tvPanel audio#mvAudio::-webkit-media-controls-play-button,
      #tvPanel audio#mvAudio::-webkit-media-controls-pause-button,
      #tvPanel audio#mvAudio::-webkit-media-controls-mute-button {
        filter: invert(1);
      }
      #tvPanel audio#mvAudio::-webkit-media-controls-timeline {
        background-color: #2c2c2c;
      }
      #tvPanel audio#mvAudio::-webkit-media-controls-current-time-display,
      #tvPanel audio#mvAudio::-webkit-media-controls-time-remaining-display {
        color: #ccc;
      }
      #tvPanel audio#mvAudio::-webkit-media-controls-volume-slider {
        background-color: #444;
        border-radius: 5px;
      }
    `;
    document.head.appendChild(style);
  }

  // ----- MV PLAYLIST OVERLAY -----
  function removeMusicOverlay() {
    const container = document.getElementById(playerContainerId);
    const overlay = container?.querySelector("#mvPlaylistOverlay");
    if (overlay) overlay.remove();
    mvOverlayOpen = false;
  }

  function buildMusicOverlay() {
    const container = document.getElementById(playerContainerId);
    if (!container) return;

    const old = container.querySelector("#mvPlaylistOverlay");
    if (old) old.remove();

    const accent = getUIAccent();
    const soft  = getSoftHoverBg();

    const overlay = document.createElement("div");
    overlay.id = "mvPlaylistOverlay";
    overlay.style.cssText = `
      position:absolute;
      inset:0;
      background: rgba(0,0,0,0.92);
      border-left:1px solid ${accent};
      z-index: 50;
      display:flex;
      flex-direction:column;
      font-family:monospace;
      color:${accent};
      box-sizing:border-box;
    `;

    overlay.innerHTML = `
      <div class="mvOverlayHeader" style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:6px 8px;
        border-bottom:1px solid ${accent};
        background:#050505;
        font-size:12px;
        flex:0 0 auto;
        color:${accent};
        box-sizing:border-box;
      ">
        <span>Music Videos Playlist</span>
        <button id="mvOverlayClose">CLOSE</button>
      </div>
      <div id="mvOverlayList" style="
        flex:1 1 auto;
        overflow-y:auto;
        padding:6px;
        box-sizing:border-box;
      "></div>
    `;

    const closeOverlayBtn = overlay.querySelector("#mvOverlayClose");
    stylePanelButton(closeOverlayBtn, accent, soft);

    const listEl = overlay.querySelector("#mvOverlayList");
    if (listEl) {
      musicVideosList.forEach((entry, idx) => {
        const row = document.createElement("div");
        row.className = "mvRow";
        const isCurrent = idx === currentMusicIndex;
        row.dataset.current = isCurrent ? "1" : "0";
        row.style.cssText = `
          padding:6px 8px;
          margin:2px 0;
          border:1px solid ${isCurrent ? accent : soft};
          background:${isCurrent ? accent : "#000"};
          color:${isCurrent ? "#000" : accent};
          cursor:pointer;
          font-size:12px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          box-sizing:border-box;
        `;
        row.textContent = entry.title || `(untitled ${idx+1})`;
        row.addEventListener("click", () => {
          mvOverlayOpen = false;
          currentMusicIndex = idx;
          renderMusicVideo(currentMusicIndex);
          removeMusicOverlay();
        });
        listEl.appendChild(row);
      });
    }

    closeOverlayBtn?.addEventListener("click", removeMusicOverlay);

    const wrapper = container.querySelector("#musicVideoWrapper");
    if (wrapper) {
      wrapper.appendChild(overlay);
      mvOverlayOpen = true;
    }
  }

  function toggleMusicOverlay() {
    if (!isMusicVideosMode) return;
    if (mvOverlayOpen) removeMusicOverlay();
    else buildMusicOverlay();
  }

  function renderMusicVideo(index) {
    ensureMeqTvPlayerStyles();
    stopMusicVideoPlayback();

    const container = document.getElementById(playerContainerId);
    if (!container) return;
    const entry = musicVideosList[index];
    if (!entry) return;

    const accent = getUIAccent();

    container.innerHTML = `
      <div id="musicVideoWrapper" style="
        position:relative;
        display:flex;
        flex-direction:column;
        width:100%;
        height:100%;
        background:#000;
        color:${accent};
        font-family:monospace;
        overflow:hidden;
        box-sizing:border-box;
      ">
        <div id="mvTitle" style="
          padding:4px 8px;
          font-size:14px;
          font-weight:bold;
          border-bottom:1px solid ${accent};
          box-sizing:border-box;
        "></div>
        <div id="mvVideoHolder" style="
          flex:1 1 auto;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
        ">
          <video id="mvVideo" style="
            width:100%;
            height:100%;
            object-fit:cover;
            display:block;
          " muted loop playsinline></video>
        </div>
        <div id="mvAuthor" style="
          padding:4px 8px;
          font-size:12px;
          opacity:0.8;
          border-top:1px solid ${accent};
          box-sizing:border-box;
        "></div>
        <div id="mvAudioHolder" style="border-top:1px solid ${accent};"></div>
      </div>
    `;

    const titleEl  = container.querySelector("#mvTitle");
    const authorEl = container.querySelector("#mvAuthor");
    mvVideoEl      = container.querySelector("#mvVideo");
    mvAudioEl      = container.querySelector("#mvAudio");

    if (titleEl) titleEl.textContent = entry.title || "";
    if (authorEl) authorEl.textContent = entry.author || "";

    if (mvVideoEl) {
      mvVideoEl.src = entry.videoUrl;
      mvVideoEl.muted = true;
      mvVideoEl.loop = true;
      mvVideoEl.controls = false;
      mvVideoEl.play().catch(() => {});
    }

    // Rebuild audio holder with controls (keeps style tag working)
    const audioHolder = container.querySelector("#mvAudioHolder");
    if (audioHolder) {
      audioHolder.innerHTML = `<audio id="mvAudio" controls></audio>`;
    }
    mvAudioEl = container.querySelector("#mvAudio");

    if (mvAudioEl) {
      mvAudioEl.src = entry.audioUrl;
      mvAudioEl.controls = true;
      mvAudioEl.loop = false;

      mvAudioEl.addEventListener("ended", () => {
        if (isMusicVideosMode) playNextMusicVideo();
      });

      mvAudioEl.play().catch(() => {});
    }

    if (mvOverlayOpen) buildMusicOverlay();
    applyAccentEverywhere();
  }

  function startMusicVideosMode() {
    if (!musicVideosList.length) {
      const container = document.getElementById(playerContainerId);
      if (container) {
        container.innerHTML = `
          <div style="
            display:flex;
            align-items:center;
            justify-content:center;
            width:100%;
            height:100%;
            background:#000;
            color:#f55;
            font-family:monospace;
            padding:16px;
            text-align:center;
          ">
            Unable to load music videos. Check videos.txt on the server.
          </div>
        `;
      }
      return;
    }

    shuffleMusicOrder();
    const firstIndex = getNextMusicIndex();
    if (firstIndex === -1) return;

    isMusicVideosMode = true;
    isExternalViewActive = false;
    currentMusicIndex = firstIndex;
    mvOverlayOpen = false;
    renderMusicVideo(currentMusicIndex);
    updateMusicBtnLabel();
  }

  function enterMusicVideosMode() {
    isExternalViewActive = false;
    destroyPlayer();
    exitMusicVideosMode();
    loadMusicVideosList(() => startMusicVideosMode());
  }

  function playNextMusicVideo() {
    if (!isMusicVideosMode || !musicVideosList.length) return;
    const nextIndex = getNextMusicIndex();
    if (nextIndex === -1) return;
    currentMusicIndex = nextIndex;
    renderMusicVideo(currentMusicIndex);
  }

  // ---------------------------------------------------------------------------
  // 3.5) POPOUT + DRAG LOGIC
  // ---------------------------------------------------------------------------
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let poppedOut   = false;

  function onMouseDownHeader(e) {
    if (!poppedOut) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    isDragging = true;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    panel.style.left   = rect.left + "px";
    panel.style.top    = rect.top + "px";
    panel.style.right  = "auto";
    panel.style.bottom = "auto";
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragOffsetX) + "px";
    panel.style.top  = (e.clientY - dragOffsetY) + "px";
  }

  function onMouseUp() {
    isDragging = false;
  }

  if (headerEl) headerEl.addEventListener("mousedown", onMouseDownHeader);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  function popoutPanel() {
    if (poppedOut) return;
    poppedOut = true;

    const rect = panel.getBoundingClientRect();
    const scaleFactor = 0.2;

    const newWidth  = rect.width * scaleFactor;
    const newHeight = rect.height * scaleFactor;

    panel.style.left   = rect.left + "px";
    panel.style.top    = rect.top + "px";
    panel.style.right  = "auto";
    panel.style.bottom = "auto";
    panel.style.width  = newWidth + "px";

    let extraHeight = 100;
    if (isMusicVideosMode) extraHeight += 200;
    panel.style.height = newHeight + extraHeight + "px";

    if (popoutBtn) {
      popoutBtn.style.display = "none";
      popoutBtn.disabled = true;
    }
    if (viewBtn) {
      viewBtn.style.display = "none";
      viewBtn.disabled = true;
    }
    if (musicBtn) {
      musicBtn.style.display = "none";
      musicBtn.disabled = true;
    }
  }

  if (popoutBtn) popoutBtn.addEventListener("click", popoutPanel);

  // 4) Panel controls
  function openPanel() {
    panel.style.left   = "280px";
    panel.style.right  = "280px";
    panel.style.top    = "70px";
    panel.style.bottom = "20px";
    panel.style.width  = "";
    panel.style.height = "";
    poppedOut = false;

    isExternalViewActive = false;
    exitMusicVideosMode();

    if (popoutBtn) {
      popoutBtn.style.display = "inline-block";
      popoutBtn.disabled = false;
    }
    if (viewBtn) {
      viewBtn.style.display = "inline-block";
      viewBtn.disabled = false;
    }
    if (musicBtn) {
      musicBtn.style.display = "inline-block";
      musicBtn.disabled = false;
    }

    applyAccentEverywhere();
    panel.style.display = "flex";

    shufflePlaylist();

    ensureYouTubeAPI(createPlayer);
    updateMusicBtnLabel();
  }

  function closePanel() {
    panel.style.display = "none";
    isExternalViewActive = false;
    exitMusicVideosMode();
    destroyPlayer();
    updateMusicBtnLabel();
  }

  // 5) Wire up button toggling
  tvBtn.addEventListener("click", () => {
    if (panel.style.display === "flex") closePanel();
    else openPanel();
  });

  if (closeBtn) closeBtn.addEventListener("click", closePanel);

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (isMusicVideosMode) {
        playNextMusicVideo();
      } else if (isExternalViewActive) {
        const container = document.getElementById(playerContainerId);
        if (container) container.innerHTML = "";
        isExternalViewActive = false;
        ensureYouTubeAPI(createPlayer);
      } else {
        playNextVideo();
      }
      updateMusicBtnLabel();
      applyAccentEverywhere();
    });
  }

  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      if (isMusicVideosMode) {
        toggleMusicOverlay();
      } else {
        loadExternalVideoSite();
      }
      applyAccentEverywhere();
    });
  }

  if (musicBtn) {
    musicBtn.addEventListener("click", () => {
      if (isMusicVideosMode) {
        exitMusicVideosMode();
        isExternalViewActive = false;

        const container = document.getElementById(playerContainerId);
        if (container) container.innerHTML = "";

        ensureYouTubeAPI(createPlayer);
      } else {
        enterMusicVideosMode();
      }
      updateMusicBtnLabel();
      applyAccentEverywhere();
    });
  }
})();
