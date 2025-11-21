// meq-boom.js
// Play boom.wav whenever one of the digit-assigned small nofur wheels is clicked.

(function () {
  const canvas = document.getElementById("mequavis");
  if (!canvas) {
    console.warn("meq-boom.js: #mequavis canvas not found.");
    return;
  }

  // Preload boom sound (boom.wav should be in the same directory as the HTML,
  // or adjust the path below if needed).
  const boomSound = new Audio("i.mp3");
  boomSound.preload = "auto";
  boomSound.volume = 0.1; // 10% volume

  canvas.addEventListener("click", (e) => {
    // 🔇 Global mute check: if set, *do not* play the sound at all.
    if (window._meqTraversalMute) {
      return;
    }

    // Make sure the global nofurs array exists
    let nfRef;
    try {
      nfRef = nofurs; // uses the global from your main script
    } catch (err) {
      return; // not initialized yet
    }
    if (!Array.isArray(nfRef)) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top)  * scaleY;

    for (const n of nfRef) {
      if (!n) continue;

      // Only the 10 small wheels have baseDigit set (0–9).
      if (typeof n.baseDigit !== "number") continue;
      if (!n.center || typeof n.outerRadius !== "number") continue;

      const dx = mouseX - n.center.x;
      const dy = mouseY - n.center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Match your existing hit radius logic: outerRadius + 10
      if (dist < n.outerRadius + 10) {
        try {
          boomSound.currentTime = 0;
          boomSound.play().catch(() => {});
        } catch (_) {
          // ignore playback errors (autoplay restrictions, etc.)
        }
        break; // only need one boom per click
      }
    }
  });
})();
