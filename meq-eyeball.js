// meq-eyeball.js
// Wandering eyeball node that always links to a MEQUAVIS node.
// Lock-aware + hybrid-aware:
//  - If connected to a locked BIG wheel, line color = that wheel's bridge color.
//  - If OMEGA is locked, always connect to big OMEGA center,
//    and the line is split into 4 segments using the ALPHA/BETA/GAMMA/DELTA
//    hybrid bridge colors to OMEGA.
//  - When OMEGA is locked, also draw a SECOND line to the nearest *other* BIG
//    wheel that is also locked (ALPHA/BETA/GAMMA/DELTA only, no small wheels).

(function () {
  if (window._meqEyeballPatched) return;
  window._meqEyeballPatched = true;

  const originalRAF = window.requestAnimationFrame;
  if (typeof originalRAF !== "function") {
    console.warn("[meq-eyeball] requestAnimationFrame not available.");
    return;
  }

  const bigLabels = new Set(["ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"]);
  let eyeball = null;

  function ensureEyeballInit() {
    try {
      if (typeof canvas === "undefined") return;
      if (!eyeball) {
        const width  = typeof W !== "undefined" ? W : canvas.width;
        const height = typeof H !== "undefined" ? H : canvas.height;

        eyeball = {
          x: width / 2,
          y: height / 2,
          vx: 2.1,
          vy: -1.4,
          speed: 2.5,
          radius: 12
        };
      }
    } catch (err) {
      console.warn("[meq-eyeball] init error:", err);
    }
  }

  function updateEyeball() {
    if (!eyeball) return;
    if (typeof W === "undefined" || typeof H === "undefined") return;

    // Small random heading change – smooth wandering arcs.
    const maxTurn = 0.08; // radians per frame
    const turn = (Math.random() - 0.5) * 2 * maxTurn;
    const angle = Math.atan2(eyeball.vy, eyeball.vx) + turn;

    eyeball.vx = Math.cos(angle) * eyeball.speed;
    eyeball.vy = Math.sin(angle) * eyeball.speed;

    eyeball.x += eyeball.vx;
    eyeball.y += eyeball.vy;

    // Soft bounds so the eyeball never leaves the MEQUAVIS canvas
    const marginX = 260; // left/right band clamp
    const marginY = 40;  // top/bottom clamp

    if (eyeball.x < marginX || eyeball.x > W - marginX) {
      eyeball.vx *= -1;
      eyeball.x = Math.max(marginX, Math.min(W - marginX, eyeball.x));
    }
    if (eyeball.y < marginY || eyeball.y > H - marginY) {
      eyeball.vy *= -1;
      eyeball.y = Math.max(marginY, Math.min(H - marginY, eyeball.y));
    }
  }

  // Same style of blend as in your main animate()
  function blendColors(c1, c2) {
    try {
      if (!c1 || !c2) return "#0ff";

      const fromHexOrRgb = (c) => {
        if (c.startsWith("rgb")) {
          const nums = c.replace(/[^\d,]/g, "").split(",").map(n => parseInt(n.trim(), 10));
          return { r: nums[0] || 0, g: nums[1] || 0, b: nums[2] || 0 };
        }
        const hex = parseInt(c.slice(1), 16);
        return {
          r: (hex >> 16) & 255,
          g: (hex >> 8) & 255,
          b: hex & 255
        };
      };

      const a = fromHexOrRgb(c1);
      const b = fromHexOrRgb(c2);
      const r = Math.floor((a.r + b.r) / 2);
      const g = Math.floor((a.g + b.g) / 2);
      const bl = Math.floor((a.b + b.b) / 2);
      return `rgb(${r},${g},${bl})`;
    } catch {
      return "#0ff";
    }
  }

  // Get the 4 hybrid colors between ALPHA/BETA/GAMMA/DELTA seekers and OMEGA seekers.
  // Uses the same seekerPositions array your animate() uses.
  function getOmegaHybridColors() {
    try {
      if (typeof seekerPositions === "undefined") return null;
      const sps = seekerPositions;
      if (!Array.isArray(sps) || !sps.length) return null;

      const omegaSeekers = sps.filter(s => s && s.label === "OMEGA");
      if (!omegaSeekers.length) return null;

      const order = ["ALPHA", "BETA", "GAMMA", "DELTA"];
      const hybrids = [];

      for (const label of order) {
        const s = sps.find(sp => sp && sp.label === label);
        if (!s || !s.color) continue;

        let nearest = null;
        let best = Infinity;
        for (const o of omegaSeekers) {
          const dx = o.x - s.x;
          const dy = o.y - s.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            best = d2;
            nearest = o;
          }
        }
        if (nearest && nearest.color) {
          hybrids.push(blendColors(s.color, nearest.color));
        }
      }

      return hybrids.length ? hybrids : null;
    } catch (err) {
      console.warn("[meq-eyeball] getOmegaHybridColors error:", err);
      return null;
    }
  }

  // Get the color of the bridge node for a locked BIG wheel.
  function getBridgeColor(label) {
    try {
      // First try seekerPositions (global, not window.*)
      if (typeof seekerPositions !== "undefined" && Array.isArray(seekerPositions)) {
        const sp = seekerPositions.find(
          (s) => s && s.label === label && s.color
        );
        if (sp) return sp.color;
      }

      // Fallback: derive from lockState.outerIndex + outerOrder + nodeColors
      if (
        window.nofurLockState &&
        window.nofurLockState[label] &&
        typeof window.nofurLockState[label].outerIndex === "number" &&
        typeof outerOrder !== "undefined" &&
        typeof nodeColors !== "undefined"
      ) {
        const idx = window.nofurLockState[label].outerIndex;
        if (idx >= 0 && idx < outerOrder.length) {
          const num = outerOrder[idx];
          if (num != null && nodeColors[num]) {
            return nodeColors[num];
          }
        }
      }
    } catch (err) {
      console.warn("[meq-eyeball] getBridgeColor error:", err);
    }

    return "#0ff";
  }

  function drawEyeballOnly() {
    if (!eyeball || typeof ctx === "undefined") return;

    ctx.save();

    // Outer white eyeball
    ctx.beginPath();
    ctx.arc(eyeball.x, eyeball.y, eyeball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0ff";
    ctx.stroke();

    // Iris
    ctx.beginPath();
    ctx.arc(eyeball.x, eyeball.y, eyeball.radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#00aaff";
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.arc(eyeball.x, eyeball.y, eyeball.radius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    ctx.restore();
  }

  function drawSegmentedLine(x1, y1, x2, y2, colors) {
    if (!colors || !colors.length || typeof ctx === "undefined") return;

    const n = colors.length;
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;

      const sx = x1 + (x2 - x1) * t0;
      const sy = y1 + (y2 - y1) * t0;
      const ex = x1 + (x2 - x1) * t1;
      const ey = y1 + (y2 - y1) * t1;

      ctx.save();
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEyeballAndLink() {
    try {
      if (typeof ctx === "undefined") return;
      if (!eyeball) return;

      let nodes = [];
      if (Array.isArray(window.nofurs)) {
        nodes = window.nofurs;
      } else if (typeof nofurs !== "undefined" && Array.isArray(nofurs)) {
        nodes = nofurs;
      }

      if (!nodes.length) {
        drawEyeballOnly();
        return;
      }

      const lockState = window.nofurLockState || {};
      const omegaLock = lockState.OMEGA || { locked: false };

      // Find big OMEGA center node (not the small side wheels)
      let omegaCenter = null;
      for (const n of nodes) {
        if (
          n &&
          n.label === "OMEGA" &&
          n.center &&
          n.flag !== "left" &&
          n.flag !== "right"
        ) {
          omegaCenter = n;
          break;
        }
      }

      let targetNode = null;
      let lineColor = "#0ff"; // string or array

      // For potential 2nd line when OMEGA is locked
      let secondaryTarget = null;
      let secondaryColor = null;

      // If OMEGA is locked: line → OMEGA center,
      // using concatenation of the 4 hybrid colors if available.
      if (omegaLock.locked && omegaCenter) {
        targetNode = omegaCenter;

        const hybridColors = getOmegaHybridColors();
        if (hybridColors && hybridColors.length) {
          lineColor = hybridColors; // multi-segment line
        } else {
          lineColor = getBridgeColor("OMEGA");
        }

        // === SECOND LINE LOGIC ===
        // Only when OMEGA is locked:
        // find the nearest *other* BIG wheel (ALPHA/BETA/GAMMA/DELTA)
        // that is also locked, and draw a second line to it.
        const candidates = ["ALPHA", "BETA", "GAMMA", "DELTA"];
        let bestDist = Infinity;
        let bestNode = null;
        let bestLabel = null;

        for (const label of candidates) {
          const state = lockState[label];
          if (!state || !state.locked) continue; // only other locked bigs

          // find the big node for this label (no small side wheels)
          const node = nodes.find(
            (n) =>
              n &&
              n.label === label &&
              n.center &&
              n.flag !== "left" &&
              n.flag !== "right"
          );
          if (!node) continue;

          const dx = eyeball.x - node.center.x;
          const dy = eyeball.y - node.center.y;
          const d2 = dx * dx + dy * dy;

          if (d2 < bestDist) {
            bestDist = d2;
            bestNode = node;
            bestLabel = label;
          }
        }

        if (bestNode && bestLabel) {
          secondaryTarget = bestNode;
          secondaryColor = getBridgeColor(bestLabel);
        }
      } else {
        // Otherwise, connect to closest node on canvas
        let closest = null;
        let bestDist = Infinity;

        for (const n of nodes) {
          if (!n || !n.center) continue;
          const dx = eyeball.x - n.center.x;
          const dy = eyeball.y - n.center.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestDist) {
            bestDist = d2;
            closest = n;
          }
        }

        targetNode = closest;

        // If we are connected to a BIG locked wheel, line color = that bridge color
        if (
          targetNode &&
          bigLabels.has(targetNode.label) &&
          lockState[targetNode.label] &&
          lockState[targetNode.label].locked
        ) {
          lineColor = getBridgeColor(targetNode.label);
        }
      }

      // Draw primary line from eye to target
      if (targetNode && targetNode.center) {
        const x1 = eyeball.x;
        const y1 = eyeball.y;
        const x2 = targetNode.center.x;
        const y2 = targetNode.center.y;

        if (Array.isArray(lineColor)) {
          drawSegmentedLine(x1, y1, x2, y2, lineColor);
        } else {
          ctx.save();
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw secondary line (only exists when OMEGA is locked and another big is locked)
      if (secondaryTarget && secondaryTarget.center && secondaryColor) {
        const x1 = eyeball.x;
        const y1 = eyeball.y;
        const x2 = secondaryTarget.center.x;
        const y2 = secondaryTarget.center.y;

        ctx.save();
        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }

      // Finally draw the eyeball itself on top
      drawEyeballOnly();
    } catch (err) {
      console.warn("[meq-eyeball] draw error:", err);
    }
  }

  function eyeballStep() {
    ensureEyeballInit();
    if (!eyeball) return;
    updateEyeball();
    drawEyeballAndLink();
  }

  // Patch requestAnimationFrame so every MEQUAVIS frame
  // also updates + draws the eyeball afterwards.
  window.requestAnimationFrame = function (callback) {
    const wrapped = function (timestamp) {
      callback(timestamp);
      eyeballStep();
    };
    return originalRAF.call(window, wrapped);
  };

  console.log("[meq-eyeball] Eyeball wanderer initialized (dual-line omega mode).");
})();
