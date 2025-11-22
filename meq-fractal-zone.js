// meq-fractal-zone.js
(() => {
  // ---- Persistent fractal-zone state on window ----
  if (typeof window._meqFractalMode === "undefined") window._meqFractalMode = "single"; // "single" | "hex"
  if (typeof window._meqFractalSection === "undefined") window._meqFractalSection = 1;

  // rotation offsets for triads
  if (typeof window._meqFractalOddOffset === "undefined") window._meqFractalOddOffset = 0;   // cycles 1,3,5
  if (typeof window._meqFractalEvenOffset === "undefined") window._meqFractalEvenOffset = 0; // cycles 2,4,6

  const sectionColors = {
    1: "#ff0000", // bottom main red
    2: "#ffff00",
    3: "#00ffff",
    4: "#ff00ff",
    5: "#00ff00",
    6: "#0066ff"
  };

  if (typeof window._meqFractalColor === "undefined") {
    window._meqFractalColor = sectionColors[window._meqFractalSection] || "#ff0000";
  }

  // Mini hit targets updated every frame in hex mode
  window._meqFractalMiniHits = [];

  // Clickable number hit targets (outside labels)
  window._meqFractalLabelHits = [];

  // Button rects updated every frame
  window._meqFractalButtonRect = null;        // Change Zone (top-right)
  window._meqFractalRotateOddRect = null;     // bottom-left (hex only)
  window._meqFractalRotateEvenRect = null;    // bottom-right (hex only)

  // ---- Helper: draw recursive Sierpinski triangle ----
  function drawSierpinski(ctx, x1, y1, x2, y2, x3, y3, depth) {
    if (depth <= 0) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.stroke();
      return;
    }

    const mx1 = (x1 + x2) / 2, my1 = (y1 + y2) / 2;
    const mx2 = (x2 + x3) / 2, my2 = (y2 + y3) / 2;
    const mx3 = (x3 + x1) / 2, my3 = (y3 + y1) / 2;

    drawSierpinski(ctx, x1, y1, mx1, my1, mx3, my3, depth - 1);
    drawSierpinski(ctx, mx1, my1, x2, y2, mx2, my2, depth - 1);
    drawSierpinski(ctx, mx3, my3, mx2, my2, x3, y3, depth - 1);
  }

  // ---- Helper: info box INSIDE top-left of fractal box ----
  function drawFractalSectionBox(ctx, boxX, boxY) {
    const pad = 6;
    const w = 35;
    const h = 40;

    const x = boxX + pad;
    const y = boxY + pad;

    ctx.save();
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "#ff0000";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    ctx.fillText("Zone", x + w / 2, y + 6);

    ctx.fillStyle = "#00ff00";
    ctx.font = "14px monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(String(window._meqFractalSection), x + w / 2, y + h - 10);

    ctx.restore();
  }

  // ---- Helper: canvas-space mouse coords ----
  function getCanvasMouse(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // ---- Helper: point-in-triangle hit test ----
  function pointInTri(px, py, ax, ay, bx, by, cx, cy) {
    function sign(x1,y1,x2,y2,x3,y3){
      return (x1 - x3)*(y2 - y3) - (x2 - x3)*(y1 - y3);
    }
    const b1 = sign(px,py, ax,ay, bx,by) < 0.0;
    const b2 = sign(px,py, bx,by, cx,cy) < 0.0;
    const b3 = sign(px,py, cx,cy, ax,ay) < 0.0;
    return (b1 === b2) && (b2 === b3);
  }

  // ---- Click handling (capture so we can block nofur clicks when needed) ----
  function installCaptureClickHandler() {
    const canvas = document.getElementById("mequavis");
    if (!canvas) return;

    canvas.addEventListener("click", (e) => {
      const { x, y } = getCanvasMouse(e, canvas);

      // --- Change Zone button ---
      if (window._meqFractalButtonRect) {
        const btn = window._meqFractalButtonRect;
        const inBtn =
          x >= btn.x && x <= btn.x + btn.w &&
          y >= btn.y && y <= btn.y + btn.h;

        if (inBtn && window._meqFractalMode === "single") {
          window._meqFractalMode = "hex";
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }

        // ignore Change Zone clicks in hex mode
        if (inBtn && window._meqFractalMode === "hex") {
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }

      // --- Rotate Odd button (hex only; rect is null in single mode) ---
      if (window._meqFractalRotateOddRect) {
        const r = window._meqFractalRotateOddRect;
        const inR =
          x >= r.x && x <= r.x + r.w &&
          y >= r.y && y <= r.y + r.h;

        if (inR) {
          window._meqFractalOddOffset = (window._meqFractalOddOffset + 1) % 3;
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }

      // --- Rotate Even button (hex only; rect is null in single mode) ---
      if (window._meqFractalRotateEvenRect) {
        const r = window._meqFractalRotateEvenRect;
        const inR =
          x >= r.x && x <= r.x + r.w &&
          y >= r.y && y <= r.y + r.h;

        if (inR) {
          window._meqFractalEvenOffset = (window._meqFractalEvenOffset + 1) % 3;
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }

      if (window._meqFractalMode === "hex") {
        // ✅ First: click on outside corner number labels
        for (const hit of window._meqFractalLabelHits) {
          const dx = x - hit.cx;
          const dy = y - hit.cy;
          if (dx * dx + dy * dy <= hit.r * hit.r) {
            window._meqFractalSection = hit.section;
            window._meqFractalColor = sectionColors[hit.section] || "#ff0000";
            window._meqFractalMode = "single";
            e.stopImmediatePropagation();
            e.stopPropagation();
            return;
          }
        }

        // then triangles (still clickable too)
        for (const hit of window._meqFractalMiniHits) {
          if (pointInTri(x, y, hit.x1, hit.y1, hit.x2, hit.y2, hit.x3, hit.y3)) {
            window._meqFractalSection = hit.section;
            window._meqFractalColor = sectionColors[hit.section] || "#ff0000";
            window._meqFractalMode = "single";
            e.stopImmediatePropagation();
            e.stopPropagation();
            return;
          }
        }
      }
    }, true); // capture = true
  }

  // Install once after DOM is live
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCaptureClickHandler);
  } else {
    installCaptureClickHandler();
  }

  // -------------------------------------------------------------------
  // PUBLIC: keep your original function name so animate() doesn't change
  // -------------------------------------------------------------------
  window.drawSierpinskiBox = function drawSierpinskiBox() {
    const canvas = document.getElementById("mequavis");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const center = { x: W / 2, y: H / 2 };

    const boxWidth = 250;
    const boxHeight = 250;
    const boxX = center.x - boxWidth / 2;
    const boxY = center.y - 380;

    // Outer box
    ctx.save();
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    ctx.restore();

    // Inside top-left "Zone/Section" box
    drawFractalSectionBox(ctx, boxX, boxY);

    // --- Top-right: Change Zone button ---
    const btnPad = 6;
    const btnW = 45;
    const btnH = 35;

    const btnX = boxX + boxWidth - btnW - btnPad;
    const btnY = boxY + btnPad;

    window._meqFractalButtonRect = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.save();
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    ctx.fillStyle = "#ff0000";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Change", btnX + btnW / 2, btnY + btnH / 2 - 8);
    ctx.fillText("Zone", btnX + btnW / 2, btnY + btnH / 2 + 8);
    ctx.restore();

    // ✅ ONLY show rotate buttons in HEX mode
    if (window._meqFractalMode === "hex") {
      // --- Bottom-left: Rotate Odd button ---
      const oddX = boxX + btnPad;
      const oddY = boxY + boxHeight - btnH - btnPad;
      window._meqFractalRotateOddRect = { x: oddX, y: oddY, w: btnW, h: btnH };

      ctx.save();
      ctx.fillStyle = "#000";
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.fillRect(oddX, oddY, btnW, btnH);
      ctx.strokeRect(oddX, oddY, btnW, btnH);

      ctx.fillStyle = "#ff0000";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Rotate", oddX + btnW / 2, oddY + btnH / 2 - 8);
      ctx.fillText("Odd", oddX + btnW / 2, oddY + btnH / 2 + 8);
      ctx.restore();

      // --- Bottom-right: Rotate Even button ---
      const evenX = boxX + boxWidth - btnW - btnPad;
      const evenY = boxY + boxHeight - btnH - btnPad;
      window._meqFractalRotateEvenRect = { x: evenX, y: evenY, w: btnW, h: btnH };

      ctx.save();
      ctx.fillStyle = "#000";
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.fillRect(evenX, evenY, btnW, btnH);
      ctx.strokeRect(evenX, evenY, btnW, btnH);

      ctx.fillStyle = "#ff0000";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Rotate", evenX + btnW / 2, evenY + btnH / 2 - 8);
      ctx.fillText("Even", evenX + btnW / 2, evenY + btnH / 2 + 8);
      ctx.restore();
    } else {
      // ✅ in single mode, nuke rects so they don't exist / don't click
      window._meqFractalRotateOddRect = null;
      window._meqFractalRotateEvenRect = null;
    }

    if (window._meqFractalMode === "single") {
      // ---------------- SINGLE TRIANGLE MODE ----------------
      const margin = 20;

      const x1 = boxX + margin;
      const y1 = boxY + boxHeight - margin;
      const x2 = boxX + boxWidth - margin;
      const y2 = boxY + boxHeight - margin;
      const x3 = boxX + boxWidth / 2;
      const y3 = boxY + margin;

      ctx.save();
      ctx.strokeStyle = window._meqFractalColor || "#ff0000";
      ctx.lineWidth = 1;
      drawSierpinski(ctx, x1, y1, x2, y2, x3, y3, 4);
      ctx.restore();

      // Green segment-position line
      const seg = window.segmentCurrent || 1;
      const maxSeg = 17;
      const segClamped = Math.max(1, Math.min(seg, maxSeg));
      const t = (segClamped - 1) / (maxSeg - 1);

      const yLine = y3 + t * (y1 - y3);

      function interpX(xA, yA, xB, yB, y) {
        const ratio = (y - yA) / (yB - yA);
        return xA + ratio * (xB - xA);
      }

      const xLeft = interpX(x3, y3, x1, y1, yLine);
      const xRight = interpX(x3, y3, x2, y2, yLine);

      ctx.save();
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xLeft, yLine);
      ctx.lineTo(xRight, yLine);
      ctx.stroke();
      ctx.restore();

      return;
    }

    // ---------------- HEX FRACTAL ZONE MODE ----------------
    const margin = 20;
    const origSide = boxWidth - margin * 2;

    const miniSide = origSide * 0.50;
    const miniHeight = miniSide * Math.sqrt(3) / 2;

    const Cx = boxX + boxWidth / 2;
    const Cy = boxY + boxHeight / 2 + 8;

    window._meqFractalMiniHits = [];
    window._meqFractalLabelHits = [];

    const startAngle = Math.PI / 2;

    const baseOdd = [1, 3, 5];
    const baseEven = [2, 4, 6];

    for (let i = 0; i < 6; i++) {
      const theta = startAngle + i * (Math.PI / 3);

      let displaySection;
      if (i % 2 === 0) {
        const j = i / 2;
        displaySection = baseOdd[(j + window._meqFractalOddOffset) % 3];
      } else {
        const j = (i - 1) / 2;
        displaySection = baseEven[(j + window._meqFractalEvenOffset) % 3];
      }

      const color = sectionColors[displaySection] || "#ff0000";

      const x0 = Cx, y0 = Cy;

      const x1 = Cx + miniSide * Math.cos(theta - Math.PI / 3);
      const y1 = Cy + miniSide * Math.sin(theta - Math.PI / 3);

      const x2 = Cx + miniSide * Math.cos(theta + Math.PI / 3);
      const y2 = Cy + miniSide * Math.sin(theta + Math.PI / 3);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      drawSierpinski(ctx, x0, y0, x1, y1, x2, y2, 3);
      ctx.restore();

      const cornerAngle = theta + Math.PI / 6;
      const labelRadius = miniSide * 0.85;
      const labelX = Cx + labelRadius * Math.cos(cornerAngle);
      const labelY = Cy + labelRadius * Math.sin(cornerAngle);

      ctx.save();
      ctx.beginPath();
      ctx.arc(labelX, labelY, 13, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#000";
      ctx.strokeText(String(displaySection), labelX, labelY);
      ctx.fillStyle = color;
      ctx.fillText(String(displaySection), labelX, labelY);
      ctx.restore();

      window._meqFractalLabelHits.push({
        section: displaySection,
        cx: labelX,
        cy: labelY,
        r: 15
      });

      window._meqFractalMiniHits.push({
        section: displaySection,
        x1: x0, y1: y0,
        x2: x1, y2: y1,
        x3: x2, y3: y2
      });
    }
  };
})();
