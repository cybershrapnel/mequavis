// meq-tv.js
// WATCH AI CABLE TV panel with YouTube playlist support + Music Videos mode.
// - Uses global window.MEQ_TV_VIDEO_IDS from meq-tv-videos.js
// - Random starting video
// - Plays next video when current ends
// - Destroys player/iframe on close and recreates on open

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
    // Fisher-Yates shuffle
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
    if (!playlist.length) return null; // still empty, nothing we can do

    currentIndex++;
    if (currentIndex >= playlist.length) {
      // Loop: reshuffle and start again
      shufflePlaylist();
      currentIndex = 0;
    }
    return playlist[currentIndex];
  }

  // 1) Find the "WATCH AI CABLE TV" button
  let tvBtn = document.querySelector('.action-btn[data-action="watch-tv"]');

  if (!tvBtn) {
    // Fallback: locate by label text
    tvBtn = Array.from(document.querySelectorAll(".action-btn")).find((btn) =>
      btn.textContent.trim().toUpperCase().includes("WATCH AI CABLETV")
    );
  }

  if (!tvBtn) {
    console.warn("meq-tv.js: WATCH AI CABLE TV button not found.");
    return;
  }

  // Ensure label is correct
  tvBtn.textContent = "WATCH AI CABLE TV";

  // 2) Create the TV panel (flex column so video fits)
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
    display: none;           /* we will set to flex in openPanel() */
    flex-direction: column;  /* header + player container */
  `;

  panel.innerHTML = `
    <div id="tvPanelHeader" style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:4px 8px;
      border-bottom:1px solid #0ff;
      background:#050505;
      font-family:monospace;
      font-size:12px;
      color:#0ff;
      gap: 6px;
    ">
      <span>AI CABLE TV • YouTube Playlist</span>
      <div style="display:flex; gap:4px;">
        <button id="tvPanelView" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">View Videos</button>
        <button id="tvPanelMusicVideos" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">Music Videos</button>
        <button id="tvPanelNext" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">NEXT VIDEO</button>
        <button id="tvPanelPopout" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">Popout video</button>
        <button id="tvPanelClose" style="
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
    <div
      id="tvPlayerContainer"
      style="
        width:100%;
        flex: 1 1 auto;
        height:auto;
        overflow:hidden;
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
  // 3) YouTube IFrame API loader & player
  // ---------------------------------------------------------------------------
  let player = null;
  let ytApiLoading = false;
  let isExternalViewActive = false; // external iframe mode
  let isMusicVideosMode = false;    // new music videos mode flag

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

      // If another script already set onYouTubeIframeAPIReady, chain it
      const prev = window.onYouTubeIframeAPIReady;
      window._meqTvYTCallbacks = [];

      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === "function") prev();
        if (Array.isArray(window._meqTvYTCallbacks)) {
          window._meqTvYTCallbacks.forEach((cb) => {
            try {
              cb();
            } catch (e) {
              console.error("meq-tv.js callback error:", e);
            }
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

    if (!playlist.length) {
      shufflePlaylist();
    }

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
      try {
        player.stopVideo();
      } catch (e) {
        // ignore if not ready
      }
      player.destroy();
    }
    player = null;

    const container = document.getElementById(playerContainerId);
    if (container && !isMusicVideosMode && !isExternalViewActive) {
      // only clear here if we're not about to overwrite container
      container.innerHTML = "";
    }
  }

  // ---------------------------------------------------------------------------
  // 3.25) VIEW VIDEOS (load external site into the div via iframe)
  // ---------------------------------------------------------------------------
  function loadExternalVideoSite() {
    // Kill the YouTube player and music mode if active
    destroyPlayer();
    exitMusicVideosMode();

    const container = document.getElementById(playerContainerId);
    if (!container) return;

    container.innerHTML = `
      <iframe
        src="https://xtdevelopment.net/mtv/"
        style="width:100%; height:100%; border:none;"
        loading="lazy"
      ></iframe>
    `;

    isExternalViewActive = true; // mark that we're in external mode
  }

  // ---------------------------------------------------------------------------
  // 3.3) MUSIC VIDEOS MODE (videos.txt -> div with video + audio)
  // ---------------------------------------------------------------------------
  let musicVideosList = [];      // { title, audioUrl, videoUrl, author }
  let currentMusicIndex = -1;
  let musicVideosLoaded = false;
  let mvAudioEl = null;
  let mvVideoEl = null;

  // random order for music videos
  let musicOrder = [];
  let currentMusicOrderIndex = -1;

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
    if (!musicOrder.length) {
      shuffleMusicOrder();
    }
    currentMusicOrderIndex++;
    if (currentMusicOrderIndex >= musicOrder.length) {
      shuffleMusicOrder();
      currentMusicOrderIndex = 0;
    }
    return musicOrder[currentMusicOrderIndex];
  }

  function stopMusicVideoPlayback() {
    if (mvAudioEl) {
      try {
        mvAudioEl.pause();
      } catch (e) {}
      mvAudioEl.src = "";
      mvAudioEl = null;
    }
    if (mvVideoEl) {
      try {
        mvVideoEl.pause();
      } catch (e) {}
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
    stopMusicVideoPlayback();
    const container = document.getElementById(playerContainerId);
    if (container && !isExternalViewActive) {
      container.innerHTML = "";
    }
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
        if (!res.ok) {
          throw new Error("Failed to load videos.txt");
        }
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

  function renderMusicVideo(index) {
    const container = document.getElementById(playerContainerId);
    if (!container) return;
    const entry = musicVideosList[index];
    if (!entry) return;

    container.innerHTML = `
      <div id="musicVideoWrapper" style="
        display:flex;
        flex-direction:column;
        width:100%;
        height:100%;
        background:#000;
        color:#0ff;
        font-family:monospace;
      ">
        <div id="mvTitle" style="
          padding:4px 8px;
          font-size:14px;
          font-weight:bold;
          border-bottom:1px solid #0ff;
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
          border-top:1px solid #0ff;
        "></div>
        <div id="mvAudioHolder" style="
          padding:4px 8px;
          background:#050505;
          border-top:1px solid #0ff;
        ">
          <audio id="mvAudio" controls style="width:100%;"></audio>
        </div>
      </div>
    `;

    const titleEl  = container.querySelector("#mvTitle");
    const authorEl = container.querySelector("#mvAuthor");
    mvVideoEl      = container.querySelector("#mvVideo");
    mvAudioEl      = container.querySelector("#mvAudio");

    if (titleEl) {
      titleEl.textContent = entry.title || "";
    }
    if (authorEl) {
      authorEl.textContent = entry.author || "";
    }

    if (mvVideoEl) {
      mvVideoEl.src = entry.videoUrl;
      mvVideoEl.muted = true;
      mvVideoEl.loop = true;
      mvVideoEl.controls = false;
      mvVideoEl.play().catch(() => {
        // Autoplay might be blocked; that's fine.
      });
    }

    if (mvAudioEl) {
      mvAudioEl.src = entry.audioUrl;
      mvAudioEl.controls = true;
      mvAudioEl.play().catch(() => {
        // User will need to press play if autoplay is blocked.
      });
    }
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

    // random order + random start
    shuffleMusicOrder();
    const firstIndex = getNextMusicIndex();
    if (firstIndex === -1) return;

    isMusicVideosMode = true;
    isExternalViewActive = false;
    currentMusicIndex = firstIndex;
    renderMusicVideo(currentMusicIndex);
  }

  function enterMusicVideosMode() {
    // leave other modes
    isExternalViewActive = false;
    destroyPlayer();
    exitMusicVideosMode(); // makes sure any old audio/video are cleared

    loadMusicVideosList(() => {
      startMusicVideosMode();
    });
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
    if (!poppedOut) return; // only draggable in popout mode
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    isDragging = true;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    // Ensure left/top mode for dragging
    panel.style.left   = rect.left + "px";
    panel.style.top    = rect.top + "px";
    panel.style.right  = "auto";
    panel.style.bottom = "auto";
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const newLeft = e.clientX - dragOffsetX;
    const newTop  = e.clientY - dragOffsetY;

    panel.style.left = newLeft + "px";
    panel.style.top  = newTop + "px";
  }

  function onMouseUp() {
    isDragging = false;
  }

  if (headerEl) {
    headerEl.addEventListener("mousedown", onMouseDownHeader);
  }
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

    // base extra height is 100; music videos get +200 more
    let extraHeight = 100;
    if (isMusicVideosMode) {
      extraHeight += 200; // make popout about 200px taller than normal in music mode
    }
    panel.style.height = newHeight + extraHeight + "px";

    // 🔹 Remove the Popout button after use
    if (popoutBtn) {
      popoutBtn.style.display = "none";
      popoutBtn.disabled = true;
    }

    // 🔹 Remove the View Videos button after popout
    if (viewBtn) {
      viewBtn.style.display = "none";
      viewBtn.disabled = true;
    }

    // 🔹 Remove the Music Videos button after popout (only available when not popped out)
    if (musicBtn) {
      musicBtn.style.display = "none";
      musicBtn.disabled = true;
    }
  }

  if (popoutBtn) {
    popoutBtn.addEventListener("click", () => {
      popoutPanel();
    });
  }

  // 4) Panel controls
  function openPanel() {
    // Reset geometry each time we open (docked mode)
    panel.style.left   = "280px";
    panel.style.right  = "280px";
    panel.style.top    = "70px";
    panel.style.bottom = "20px";
    panel.style.width  = "";
    panel.style.height = "";
    poppedOut = false;
    isExternalViewActive = false;
    exitMusicVideosMode();

    // Restore Popout button on fresh open
    if (popoutBtn) {
      popoutBtn.style.display = "inline-block";
      popoutBtn.disabled = false;
    }

    // Restore View Videos button on fresh open
    if (viewBtn) {
      viewBtn.style.display = "inline-block";
      viewBtn.disabled = false;
    }

    // Restore Music Videos button on fresh open (only in non-popout mode)
    if (musicBtn) {
      musicBtn.style.display = "inline-block";
      musicBtn.disabled = false;
    }

    // use flex so header + player container layout nicely
    panel.style.display = "flex";

    // Fresh shuffle each time we open (optional – comment out if you want persistent order)
    shufflePlaylist();

    ensureYouTubeAPI(() => {
      createPlayer();
    });
  }

  function closePanel() {
    panel.style.display = "none";
    isExternalViewActive = false;
    exitMusicVideosMode();
    destroyPlayer();
  }

  // 5) Wire up button toggling
  tvBtn.addEventListener("click", () => {
    if (panel.style.display === "flex") {
      closePanel();
    } else {
      openPanel();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", closePanel);
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (isMusicVideosMode) {
        // In Music Videos mode: NEXT cycles through videos.txt entries (random order)
        playNextMusicVideo();
      } else if (isExternalViewActive) {
        // If we're currently showing the external site, NEXT should restore YouTube
        const container = document.getElementById(playerContainerId);
        if (container) {
          container.innerHTML = ""; // remove iframe
        }
        isExternalViewActive = false;

        ensureYouTubeAPI(() => {
          createPlayer();
        });
      } else {
        // Normal behavior: go to next YouTube video
        playNextVideo();
      }
    });
  }

  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      loadExternalVideoSite();
    });
  }

  if (musicBtn) {
    musicBtn.addEventListener("click", () => {
      enterMusicVideosMode();
    });
  }

  // Optional: safety on unload
  // window.addEventListener("beforeunload", destroyPlayer);
})();
