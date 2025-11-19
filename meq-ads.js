// meq-ads.js
// Injects an advertisement panel under the "Send to Segment Room" button
// - Shows a muted looping video chosen randomly from a list
// - Changes to another random video every 5 minutes
// - Has a close (X) button to hide the panel

(function () {
  // List of local ad videos — edit these to match your real files.
  const AD_VIDEOS = [
    "ad1.mp4",
    "ad2.mp4",
    "ad3.mp4",
    "ad4.mp4",
    "ad5.mp4"
    // add/remove as needed
  ];

  const ROTATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  let adRotationTimer = null;

  function pickRandomVideo(exceptSrc) {
    if (!AD_VIDEOS.length) return null;

    // Try to avoid picking the same one if there is more than 1
    const candidates = AD_VIDEOS.slice();
    if (exceptSrc && AD_VIDEOS.length > 1) {
      const idx = candidates.indexOf(exceptSrc);
      if (idx !== -1) {
        candidates.splice(idx, 1);
      }
    }
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
  }

  function setupAdVideoRotation(panel) {
    const videoEl = panel.querySelector("video");
    if (!videoEl || !AD_VIDEOS.length) return;

    // Initial pick
    let currentSrc = pickRandomVideo(null);
    if (currentSrc) {
      videoEl.src = currentSrc;
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.play().catch(() => {});
    }

    // Clear any existing timer before making a new one
    if (adRotationTimer) {
      clearInterval(adRotationTimer);
      adRotationTimer = null;
    }

    // Rotate every 5 minutes
    adRotationTimer = setInterval(() => {
      if (panel.style.display === "none") return; // don't bother if hidden
      const nextSrc = pickRandomVideo(currentSrc);
      if (!nextSrc) return;
      currentSrc = nextSrc;
      videoEl.src = currentSrc;
      // reset + play (in case browser pauses)
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    }, ROTATION_INTERVAL_MS);
  }

  function injectAdPanel() {
    // Don't double-inject
    if (document.getElementById("meqAdPanel")) return;

    // 1) Find the "Send to Segment Room" button anywhere in the UI
    const allButtonsAndLinks = Array.from(document.querySelectorAll("button, a"));
    const anchor = allButtonsAndLinks.find(el =>
      el.textContent.trim().toUpperCase().includes("SEND TO SEGMENT ROOM")
    );

    if (!anchor) {
      console.warn("meq-ads.js: 'Send to Segment Room' button not found yet.");
      return;
    }

    // 2) Create the ad panel container
    const adPanel = document.createElement("div");
    adPanel.id = "meqAdPanel";
    adPanel.style.marginTop = "8px";
    adPanel.style.padding = "6px";
    adPanel.style.border = "1px solid #0ff";
    adPanel.style.borderRadius = "4px";
    adPanel.style.background = "#000";
    adPanel.style.fontFamily = "monospace";
    adPanel.style.fontSize = "11px";
    adPanel.style.color = "#0ff";

    // 3) Build the content, now with a header bar + X button
    adPanel.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-bottom:6px;
      ">
        <span style="font-weight:bold; color:#0ff;">
          SUPPORT THE MEQUAVIS PROJECT
        </span>
        <button id="meqAdCloseBtn" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          border-radius:3px;
          font-size:10px;
          padding:0 6px;
          cursor:pointer;
        ">X</button>
      </div>

      <div style="margin-bottom:6px;">
        <video
          id="meqAdVideo"
          muted
          autoplay
          loop
          playsinline
          style="width:100%; display:block; border:1px solid #222; border-radius:3px; background:#000;">
          Your browser does not support the video tag.
        </video>
      </div>

      <div style="margin-bottom:4px; text-align:center;">
        <span style="color:#0f0;">Cash App:</span>
        <a href="https://cash.app/$nanocheeze"
           target="_blank"
           rel="noopener noreferrer"
           style="color:#0ff; text-decoration:underline;">
          $nanocheeze
        </a>
      </div>

      <div style="margin:4px 0;">
        <img
          src="ad.png"
          alt="NanoCheeZe Ad"
          style="width:100%; display:block; border-radius:3px; border:1px solid #222;">
      </div>

      <div style="margin-top:4px; text-align:center;">
        <span style="color:#f0f;">Patreon:</span>
        <a href="https://www.patreon.com/hybridtales"
           target="_blank"
           rel="noopener noreferrer"
           style="color:#0ff; text-decoration:underline;">
          patreon.com/hybridtales
        </a>
      </div>
    `;

    // 4) Insert it *right after* the Send-to-Segment-Room button
    const parent = anchor.parentElement || anchor;
    if (anchor.nextSibling) {
      parent.insertBefore(adPanel, anchor.nextSibling);
    } else {
      parent.appendChild(adPanel);
    }

    // 5) Wire the close (X) button to hide the panel
    const closeBtn = adPanel.querySelector("#meqAdCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        adPanel.style.display = "none";
        if (adRotationTimer) {
          clearInterval(adRotationTimer);
          adRotationTimer = null;
        }
      });
    }

    // 6) Set up video rotation
    setupAdVideoRotation(adPanel);
  }

  // Try once on load, and also if DOM was already ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectAdPanel);
  } else {
    injectAdPanel();
  }

  // Optional: in case the full-chat UI is built dynamically *after* load,
  // you can re-call this from your full-chat activator:
  window.MEQ_injectAds = injectAdPanel;
})();
