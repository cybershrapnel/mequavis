// meq-ads.js
// Injects an advertisement panel under the gasket chat send button
// + ALSO injects a Key Bindings / Voice Commands help panel right under the Ad panel.
// - Ad panel shows a muted looping video chosen randomly from a list
// - Changes to another random video every 5 minutes
// - Both panels have a close (X) button to hide them
//
// Help panel includes:
//  - Eve overlay movement controls (meq-eve-overlay.js)
//  - Eve TTS / mouth controls (meq-eve-mouth.js)
//  - Whisper wake/command controls (meq-whisper.js)

(function () {
  const ACCENT = "var(--meq-accent, #0ff)";

  const AD_VIDEOS = [
    "ad1.mp4",
    "ad2.mp4",
    "ad3.mp4",
    "ad4.mp4",
    "ad5.mp4"
  ];

  const ROTATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  let adRotationTimer = null;

  function pickRandomVideo(exceptSrc) {
    if (!AD_VIDEOS.length) return null;

    const candidates = AD_VIDEOS.slice();
    if (exceptSrc && AD_VIDEOS.length > 1) {
      const idx = candidates.indexOf(exceptSrc);
      if (idx !== -1) candidates.splice(idx, 1);
    }
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
  }

  function setupAdVideoRotation(panel) {
    const videoEl = panel.querySelector("video");
    if (!videoEl || !AD_VIDEOS.length) return;

    let currentSrc = pickRandomVideo(null);
    if (currentSrc) {
      videoEl.src = currentSrc;
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.play().catch(() => {});
    }

    if (adRotationTimer) {
      clearInterval(adRotationTimer);
      adRotationTimer = null;
    }

    adRotationTimer = setInterval(() => {
      if (panel.style.display === "none") return;
      const nextSrc = pickRandomVideo(currentSrc);
      if (!nextSrc) return;
      currentSrc = nextSrc;
      videoEl.src = currentSrc;
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    }, ROTATION_INTERVAL_MS);
  }

  function findGasketSendButton() {
    let btn = document.getElementById("gasketRoomSendBtn");
    if (btn) return btn;

    btn = document.getElementById("segmentRoomSendBtn");
    if (btn) return btn;

    const allButtonsAndLinks = Array.from(document.querySelectorAll("button, a"));
    const anchor = allButtonsAndLinks.find(el => {
      const txt = (el.textContent || "").trim().toUpperCase();
      return txt.includes("SEND TO GASKET POWER CHAT") ||
             txt.includes("SEND TO SEGMENT ROOM");
    });

    return anchor || null;
  }

  function buildPanelShell(id, titleText, closeBtnId) {
    const panel = document.createElement("div");
    panel.id = id;
    panel.style.marginTop = "8px";
    panel.style.padding = "6px";
    panel.style.border = `1px solid ${ACCENT}`;
    panel.style.borderRadius = "4px";
    panel.style.background = "#000";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "11px";
    panel.style.color = ACCENT;

    panel.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-bottom:6px;
      ">
        <span style="font-weight:bold; color:${ACCENT};">
          ${titleText}
        </span>
        <button id="${closeBtnId}" style="
          background:#111;
          color:${ACCENT};
          border:1px solid ${ACCENT};
          border-radius:3px;
          font-size:10px;
          padding:0 6px;
          cursor:pointer;
        ">X</button>
      </div>
    `;
    return panel;
  }

  function injectAdPanel(anchor) {
    if (document.getElementById("meqAdPanel")) {
      return document.getElementById("meqAdPanel");
    }

    const adPanel = buildPanelShell(
      "meqAdPanel",
      "SUPPORT THE MEQUAVIS PROJECT",
      "meqAdCloseBtn"
    );

    adPanel.innerHTML += `
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
           style="color:${ACCENT}; text-decoration:underline;">
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
           style="color:${ACCENT}; text-decoration:underline;">
          patreon.com/hybridtales
        </a>
      </div>
    `;

    const parent = anchor.parentElement || anchor;
    if (anchor.nextSibling) parent.insertBefore(adPanel, anchor.nextSibling);
    else parent.appendChild(adPanel);

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

    setupAdVideoRotation(adPanel);
    return adPanel;
  }

  function injectKeybindPanel(anchor, afterEl) {
    if (document.getElementById("meqKeybindPanel")) {
      return document.getElementById("meqKeybindPanel");
    }

    const kbPanel = buildPanelShell(
      "meqKeybindPanel",
      "MEQUAVIS CONTROLS / KEY BINDINGS",
      "meqKeybindCloseBtn"
    );

    kbPanel.innerHTML += `
      <div style="line-height:1.35; color:${ACCENT};">

        <div style="margin-bottom:6px; font-weight:bold; color:#0f0;">
          Eve Overlay Controls (keyboard)
        </div>
        <ul style="margin:0 0 8px 16px; padding:0;">
          <li><b>Arrow Left</b> — move Eve left (enters user mode)</li>
          <li><b>Arrow Right</b> — move Eve right (enters user mode)</li>
          <li><b>Arrow Down</b> — face toward camera (no movement)</li>
          <li><b>Arrow Up</b> — face away from camera (no movement)</li>
          <li><b>PageUp</b> — move Eve up</li>
          <li><b>PageDown</b> — move Eve down</li>
          <li><b>Space</b> — jump</li>
          <li><b>+</b> / <b>=</b> — scale Eve bigger</li>
          <li><b>-</b> — scale Eve smaller</li>
          <li><i>User mode auto-returns to scripted mode after ~10s idle.</i></li>
        </ul>

        <div style="margin-bottom:6px; font-weight:bold; color:#0f0;">
          Eve TTS / Mouth (keyboard + session option)
        </div>
        <ul style="margin:0 0 8px 16px; padding:0;">
          <li><b>T</b> — Toggle speak / stop current Eve reply</li>
          <li><b>Y</b> — Fast-forward Eve audio ~5 seconds</li>
          <li><b>R</b> — Rewind Eve audio ~5 seconds</li>
          <li><i>Session checkbox:</i> <b>“Auto speak responses”</b> (left chat-sessions column) auto-plays every new reply.</li>
        </ul>

        <div style="margin-bottom:6px; font-weight:bold; color:#0f0;">
          Whisper Wake / Voice Commands (idle / Alexa-style)
        </div>
        <ul style="margin:0 0 8px 16px; padding:0;">
          <li><b>“prompt”</b> — clear box, start dictation</li>
          <li><b>“ask eve”</b> — clear box, insert <code>/eve </code>, start dictation</li>
          <li><b>“cancel”</b> — stop Eve audio (and if spoken first while dictating, cancels dictation)</li>
          <li><b>“play reply”</b> — replay last Eve reply</li>
          <li><b>“fast forward audio”</b> — skip ahead ~5s</li>
          <li><b>“rewind audio”</b> — skip back ~5s</li>
          <li><b>“layer up”</b> — click canvas Layer Up</li>
          <li><b>“layer down 0-9”</b> — click small nofur digit</li>
          <li><i>Session checkbox:</i> <b>“Auto listen for wake words”</b> disables the always-on listener.</li>
        </ul>

        <div style="margin-bottom:6px; font-weight:bold; color:#0f0;">
          Dictation Mode (after wake word or mic)
        </div>
        <ul style="margin:0 0 4px 16px; padding:0;">
          <li>Mic button <b>🎤</b> above textarea — toggles dictation</li>
          <li>Mic turns <b>red</b> while dictating</li>
          <li>Finish timer: stops ~5s after you stop speaking</li>
          <li>Saying <b>“prompt”</b> alone while dictating stops dictation</li>
          <li>Auto-send: if text ≥ 50 chars when dictation ends</li>
          <li>Textbox clears whenever wake word triggers.</li>
        </ul>
      </div>
    `;

    const parent = anchor.parentElement || anchor;
    if (afterEl && afterEl.parentElement === parent) {
      if (afterEl.nextSibling) parent.insertBefore(kbPanel, afterEl.nextSibling);
      else parent.appendChild(kbPanel);
    } else {
      if (anchor.nextSibling) parent.insertBefore(kbPanel, anchor.nextSibling);
      else parent.appendChild(kbPanel);
    }

    const closeBtn = kbPanel.querySelector("#meqKeybindCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        kbPanel.style.display = "none";
      });
    }

    return kbPanel;
  }

  function injectPanels() {
    const anchor = findGasketSendButton();
    if (!anchor) {
      console.warn("meq-ads.js: gasket/segment room send button not found yet.");
      return;
    }
    const adPanel = injectAdPanel(anchor);
    injectKeybindPanel(anchor, adPanel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectPanels);
  } else {
    injectPanels();
  }

  window.MEQ_injectAds = injectPanels;
})();
