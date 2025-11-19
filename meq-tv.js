// meq-tv.js
// WATCH AI CABLE TV panel with YouTube playlist support.
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

  // 2) Create the TV panel (same geometry as AI MUSIC), but flex column so video fits
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
      gap: 6px;
    ">
      <span>AI CABLE TV • YouTube Playlist</span>
      <div style="display:flex; gap:4px;">
        <button id="tvPanelNext" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">NEXT VIDEO</button>
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

  const closeBtn = panel.querySelector("#tvPanelClose");
  const nextBtn  = panel.querySelector("#tvPanelNext");
  const playerContainerId = "tvPlayerContainer";

  // 3) YouTube IFrame API loader & player
  let player = null;
  let ytApiLoading = false;

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
    if (container) {
      container.innerHTML = "";
    }
  }

  // 4) Panel controls
  function openPanel() {
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
      playNextVideo();
    });
  }

  // Optional: safety on unload
  // window.addEventListener("beforeunload", destroyPlayer);
})();
