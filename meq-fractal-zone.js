// meq-fractal-zone.js
(() => {
  // ---- Persistent fractal-zone state on window ----
  if (typeof window._meqFractalMode === "undefined") window._meqFractalMode = "single"; // "single" | "hex"
  if (typeof window._meqFractalSection === "undefined") window._meqFractalSection = 1;

  // ✅ Anti mode flag (persistent)
  if (typeof window._meqFractalAnti === "undefined") window._meqFractalAnti = false;

  // rotation offsets for triads
  if (typeof window._meqFractalOddOffset === "undefined") window._meqFractalOddOffset = 0;   // cycles 1,3,5
  if (typeof window._meqFractalEvenOffset === "undefined") window._meqFractalEvenOffset = 0; // cycles 2,4,6

  // zoom counter (unbounded, zooming OUT)
  if (typeof window._meqFractalDepthOffset === "undefined") window._meqFractalDepthOffset = 0;

  const BASE_SINGLE_DEPTH = 4;   // original single depth
  const BASE_HEX_DEPTH    = 3;   // original hex depth
  const DETAIL_ZOOMS_MAX  = 3;   // after 3 zooms, stop increasing detail

  const sectionColors = {
    1: "#ff0000",
    2: "#ffff00",
    3: "#00ffff",
    4: "#ff00ff",
    5: "#00ff00",
    //6: "#0066ff"
    6: "#0000ff"
  };

  if (typeof window._meqFractalColor === "undefined") {
    const absSection = Math.abs(window._meqFractalSection);
    window._meqFractalColor = sectionColors[absSection] || "#ff0000";
  }

  // Mini hit targets updated every frame in hex mode
  window._meqFractalMiniHits = [];
  window._meqFractalLabelHits = [];

  // Button rects updated every frame
  window._meqFractalButtonRect = null;        // Change/Anti Zone (top-right)
  window._meqFractalRotateOddRect = null;     // bottom-left (hex only)
  window._meqFractalRotateEvenRect = null;    // bottom-right (hex only)

  // +/- circle buttons (TOP in BOTH modes)
  // LEFT "-" raises zoom, RIGHT "+" lowers zoom
  window._meqFractalMinusCircle = null;
  window._meqFractalPlusCircle  = null;

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

  // ---- Helper: zoom indicator in the Sierpinski void/center ----
  function drawZoomIndicatorInTri(ctx, x1, y1, x2, y2, x3, y3, zoomLevel, outlineColor) {
    const cx = (x1 + x2 + x3) / 3;
    const cy = (y1 + y2 + y3) / 3 + 6;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "bold 16px monospace";
    ctx.lineWidth = 5;
    ctx.strokeStyle = outlineColor;   // ✅ conditional outline
    ctx.strokeText("Zoom", cx, cy - 10);
    ctx.fillStyle = "#00ff00";
    ctx.fillText("Zoom", cx, cy - 10);

    ctx.font = "bold 22px monospace";
    ctx.lineWidth = 6;
    ctx.strokeStyle = outlineColor;   // ✅ conditional outline
    ctx.strokeText(String(zoomLevel), cx, cy + 12);
    ctx.fillStyle = "#00ff00";
    ctx.fillText(String(zoomLevel), cx, cy + 12);

    ctx.restore();
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
    return { x, y, w, h };
  }

  function getCanvasMouse(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function pointInTri(px, py, ax, ay, bx, by, cx, cy) {
    function sign(x1,y1,x2,y2,x3,y3){
      return (x1 - x3)*(y2 - y3) - (x2 - x3)*(y1 - y3);
    }
    const b1 = sign(px,py, ax,ay, bx,by) < 0.0;
    const b2 = sign(px,py, bx,by, cx,cy) < 0.0;
    const b3 = sign(px,py, cx,cy, ax,ay) < 0.0;
    return (b1 === b2) && (b2 === b3);
  }

  function powBigInt(base, exp) {
    let r = 1n;
    for (let i = 0; i < exp; i++) r *= base;
    return r;
  }

  function getGreenLineDriver(zoomLevel) {
    const maxSeg = 17;

    if (zoomLevel === 0) {
      return Math.max(1, Math.min(window.segmentCurrent || 1, maxSeg));
    }
    if (zoomLevel === 1) {
      return Math.max(1, Math.min(window.gasketCurrent || 1, maxSeg));
    }

    const gpNum = window.gasketPowerCurrent || 1;
    const gp = BigInt(gpNum);

    const digitIndex = zoomLevel - 2;
    const denom = powBigInt(17n, digitIndex);

    const idx0 = (gp - 1n) / denom;
    const level = (idx0 % 17n) + 1n;

    return Number(level);
  }

  // ---- Click handling ----
  function installCaptureClickHandler() {
    const canvas = document.getElementById("mequavis");
    if (!canvas) return;

    canvas.addEventListener("click", (e) => {
      const { x, y } = getCanvasMouse(e, canvas);

      // Top-right Change/Anti Zone button
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
if (inBtn && window._meqFractalMode === "hex") {
  window._meqFractalAnti = !window._meqFractalAnti;

  // ✅ add/remove negative on the actual zone number
  const cur = window._meqFractalSection || 1;
  if (window._meqFractalAnti) {
    window._meqFractalSection = -Math.abs(cur);
  } else {
    window._meqFractalSection = Math.abs(cur);
  }

  // keep color synced to the absolute zone
  const absSection = Math.abs(window._meqFractalSection);
  window._meqFractalColor = sectionColors[absSection] || "#ff0000";

  e.stopImmediatePropagation();
  e.stopPropagation();
  return;
}

      }

      // LEFT "-" circle: zoom OUT
      if (window._meqFractalMinusCircle) {
        const c = window._meqFractalMinusCircle;
        const dx = x - c.cx, dy = y - c.cy;
        if (dx*dx + dy*dy <= c.r*c.r) {
          window._meqFractalDepthOffset++;
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }

      // RIGHT "+" circle: zoom IN
      if (window._meqFractalPlusCircle) {
        const c = window._meqFractalPlusCircle;
        const dx = x - c.cx, dy = y - c.cy;
        if (dx*dx + dy*dy <= c.r*c.r) {
          if (window._meqFractalDepthOffset > 0) {
            window._meqFractalDepthOffset--;
          }
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }

      // Rotate Odd
      if (window._meqFractalRotateOddRect) {
        const r = window._meqFractalRotateOddRect;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          window._meqFractalOddOffset = (window._meqFractalOddOffset + 1) % 3;
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }

      // Rotate Even
      if (window._meqFractalRotateEvenRect) {
        const r = window._meqFractalRotateEvenRect;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          window._meqFractalEvenOffset = (window._meqFractalEvenOffset + 1) % 3;
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }

      if (window._meqFractalMode === "hex") {
        // corner labels
        for (const hit of window._meqFractalLabelHits) {
          const dx = x - hit.cx;
          const dy = y - hit.cy;
          if (dx * dx + dy * dy <= hit.r * hit.r) {
            const picked = hit.section;
            const signed = window._meqFractalAnti ? -picked : picked;

            window._meqFractalSection = signed;
            window._meqFractalColor = sectionColors[picked] || "#ff0000";
            window._meqFractalMode = "single";

            e.stopImmediatePropagation();
            e.stopPropagation();
            return;
          }
        }

        // triangles
        for (const hit of window._meqFractalMiniHits) {
          if (pointInTri(x, y, hit.x1, hit.y1, hit.x2, hit.y2, hit.x3, hit.y3)) {
            const picked = hit.section;
            const signed = window._meqFractalAnti ? -picked : picked;

            window._meqFractalSection = signed;
            window._meqFractalColor = sectionColors[picked] || "#ff0000";
            window._meqFractalMode = "single";

            e.stopImmediatePropagation();
            e.stopPropagation();
            return;
          }
        }
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCaptureClickHandler);
  } else {
    installCaptureClickHandler();
  }

  // -------------------------------------------------------------------
  window.drawSierpinskiBox = function drawSierpinskiBox() {
    const canvas = document.getElementById("mequavis");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.style.filter = window._meqFractalAnti ? "invert(1)" : "none";

    // ✅ outline color so invert makes it black
    const outlineColor = window._meqFractalAnti ? "#ffffff" : "#000000";

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

    const zoneRect = drawFractalSectionBox(ctx, boxX, boxY);

    // Top-right button
    const btnPad = 6;
    const btnW = 45;
    const btnH = 35;
    const btnX = boxX + boxWidth - btnW - btnPad;
    const btnY = boxY + btnPad;

    window._meqFractalButtonRect = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.save();
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    ctx.fillStyle = "#ff0000";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (window._meqFractalMode === "hex") {
      ctx.fillText("Anti", btnX + btnW / 2, btnY + btnH / 2 - 8);
      ctx.fillText("Zone", btnX + btnW / 2, btnY + btnH / 2 + 8);
    } else {
      ctx.fillText("Change", btnX + btnW / 2, btnY + btnH / 2 - 8);
      ctx.fillText("Zone", btnX + btnW / 2, btnY + btnH / 2 + 8);
    }
    ctx.restore();

    const zoomLevel = window._meqFractalDepthOffset || 0;
    const detailZoom = Math.min(zoomLevel, DETAIL_ZOOMS_MAX);

    const singleDepth = BASE_SINGLE_DEPTH + detailZoom;
    const hexDepth    = BASE_HEX_DEPTH    + detailZoom;

    // +/- circles
    const circR = 14;

    const minusCx = zoneRect.x + zoneRect.w + 19;
    const minusCy = zoneRect.y + zoneRect.h / 2;

    const plusCx  = btnX - 6 - circR;
    const plusCy  = btnY + btnH / 2;

    window._meqFractalMinusCircle = { cx: minusCx, cy: minusCy, r: circR };
    window._meqFractalPlusCircle  = { cx: plusCx,  cy: plusCy,  r: circR };

    const plusEnabled = zoomLevel > 0;
    const plusColor = plusEnabled ? "#ff0000" : "#550000";

    // minus
    ctx.save();
    ctx.beginPath();
    ctx.arc(minusCx, minusCy, circR, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ff0000";
    ctx.stroke();
    ctx.fillStyle = "#ff0000";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("-", minusCx, minusCy + 1);
    ctx.restore();

    // plus
    ctx.save();
    ctx.beginPath();
    ctx.arc(plusCx, plusCy, circR, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = plusColor;
    ctx.stroke();
    ctx.fillStyle = plusColor;
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", plusCx, plusCy + 1);
    ctx.restore();

    // Rotate buttons only in hex mode
    if (window._meqFractalMode === "hex") {
      const oddX = boxX + btnPad;
      const oddY = boxY + boxHeight - btnH - btnPad;
      window._meqFractalRotateOddRect = { x: oddX, y: oddY, w: btnW, h: btnH };

      ctx.save();
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.strokeRect(oddX, oddY, btnW, btnH);
      ctx.fillStyle = "#ff0000";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Rotate", oddX + btnW / 2, oddY + btnH / 2 - 8);
      ctx.fillText("Odd", oddX + btnW / 2, oddY + btnH / 2 + 8);
      ctx.restore();

      const evenX = boxX + boxWidth - btnW - btnPad;
      const evenY = boxY + boxHeight - btnH - btnPad;
      window._meqFractalRotateEvenRect = { x: evenX, y: evenY, w: btnW, h: btnH };

      ctx.save();
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.strokeRect(evenX, evenY, btnW, btnH);
      ctx.fillStyle = "#ff0000";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Rotate", evenX + btnW / 2, evenY + btnH / 2 - 8);
      ctx.fillText("Even", evenX + btnW / 2, evenY + btnH / 2 + 8);
      ctx.restore();
    } else {
      window._meqFractalRotateOddRect = null;
      window._meqFractalRotateEvenRect = null;
    }

    if (window._meqFractalMode === "single") {
      const margin = 20;

      const x1 = boxX + margin;
      const y1 = boxY + boxHeight - margin;
      const x2 = boxX + boxWidth - margin;
      const y2 = boxY + boxHeight - margin;
      const x3 = boxX + boxWidth / 2;
      const y3 = boxY + margin;

      ctx.save();
      const absSection = Math.abs(window._meqFractalSection);
      ctx.strokeStyle = window._meqFractalColor || sectionColors[absSection] || "#ff0000";
      ctx.lineWidth = 1;
      drawSierpinski(ctx, x1, y1, x2, y2, x3, y3, singleDepth);
      ctx.restore();

if (zoomLevel > 0) {
  drawZoomIndicatorInTri(ctx, x1, y1, x2, y2, x3, y3, zoomLevel, outlineColor);
}


      const maxSeg = 17;
      const driver = getGreenLineDriver(zoomLevel);
      const t = (driver - 1) / (maxSeg - 1);
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

    // ---- HEX MODE ----
    const margin = 20;
    const origSide = boxWidth - margin * 2;
    const miniSide = origSide * 0.50;

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
      drawSierpinski(ctx, x0, y0, x1, y1, x2, y2, hexDepth);
      ctx.restore();

      const cornerAngle = theta + Math.PI / 6;
      const labelRadius = miniSide * 0.82;
      const labelX = Cx + labelRadius * Math.cos(cornerAngle);
      const labelY = Cy + labelRadius * Math.sin(cornerAngle);

      ctx.save();
      ctx.beginPath();
      ctx.arc(labelX, labelY, 14, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = outlineColor;  // ✅ conditional outline
      ctx.strokeText(String(displaySection), labelX, labelY+1);
      ctx.fillStyle = color;
      ctx.fillText(String(displaySection), labelX, labelY+1);
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
