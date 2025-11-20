// meq-eyeball.js
// Wandering eyeball node that always links to a MEQUAVIS node.
//
// Behavior:
//  - Normal: eye links to nearest node on canvas.
//  - If linked node is a locked BIG wheel, line color = that wheel's bridge color.
//  - If OMEGA is locked:
//      * Primary line: Eye → big OMEGA center, segmented with 4 hybrid colors
//        (ALPHA/BETA/GAMMA/DELTA ↔ OMEGA) when available.
//      * Second line: Eye → nearest locked BIG (ALPHA/BETA/GAMMA/DELTA), solid color.
//      * Third line: Eye → nearest small circle INSIDE ANY BIG NOFUR ONLY, solid color.
//
// Left column UI (under Nofur Locks, above Segments):
//  - Shows 3 lines:
//      Eye Link 1 → <primaryLabel>
//      Eye Link 2 → <secondaryLabel or ->
//      Eye Link 3 → <thirdParentLabel or -> node <thirdNodeNum or ->
//  - Shows 7 swatches total:
//      1–4: the 4 hybrid colors (if present)
//      5:   second line color (if present)
//      6:   third line color (if present)
//      =   7: blend of all non-null colors (cumulative hybrid)

(function () {
  if (window._meqEyeballPatched) return;
  window._meqEyeballPatched = true;

  const originalRAF = window.requestAnimationFrame;
  if (typeof originalRAF !== "function") {
    console.warn("[meq-eyeball] requestAnimationFrame not available.");
    return;
  }

  const bigLabels = new Set(["ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"]);
  const rotationFactors = {
    ALPHA: 0.8,
    BETA: 0.9,
    OMEGA: 1.0,
    DELTA: 1.1,
    GAMMA: 1.2
  };

  let eyeball = null;

  function ensureEyeballInit() {
    try {
      if (typeof canvas === "undefined") return;
      if (!eyeball) {
        const width = typeof W !== "undefined" ? W : canvas.width;
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

    const maxTurn = 0.08;
    const turn = (Math.random() - 0.5) * 2 * maxTurn;
    const angle = Math.atan2(eyeball.vy, eyeball.vx) + turn;

    eyeball.vx = Math.cos(angle) * eyeball.speed;
    eyeball.vy = Math.sin(angle) * eyeball.speed;

    eyeball.x += eyeball.vx;
    eyeball.y += eyeball.vy;

    const marginX = 260;
    const marginY = 40;

    if (eyeball.x < marginX || eyeball.x > W - marginX) {
      eyeball.vx *= -1;
      eyeball.x = Math.max(marginX, Math.min(W - marginX, eyeball.x));
    }
    if (eyeball.y < marginY || eyeball.y > H - marginY) {
      eyeball.vy *= -1;
      eyeball.y = Math.max(marginY, Math.min(H - marginY, eyeball.y));
    }
  }

  function blendColors(c1, c2) {
    try {
      if (!c1 && !c2) return "#0ff";
      if (!c1) return c2;
      if (!c2) return c1;

      const fromHexOrRgb = (c) => {
        if (c.startsWith("rgb")) {
          const nums = c
            .replace(/[^\d,]/g, "")
            .split(",")
            .map((n) => parseInt(n.trim(), 10));
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

  function getOmegaHybridColors() {
    try {
      if (typeof seekerPositions === "undefined") return null;
      const sps = seekerPositions;
      if (!Array.isArray(sps) || !sps.length) return null;

      const omegaSeekers = sps.filter((s) => s && s.label === "OMEGA");
      if (!omegaSeekers.length) return null;

      const order = ["ALPHA", "BETA", "GAMMA", "DELTA"];
      const hybrids = [];

      for (const label of order) {
        const s = sps.find((sp) => sp && sp.label === label);
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

  function getBridgeColor(label) {
    try {
      if (
        typeof seekerPositions !== "undefined" &&
        Array.isArray(seekerPositions)
      ) {
        const sp = seekerPositions.find((s) => s && s.label === label && s.color);
        if (sp) return sp.color;
      }

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

    ctx.beginPath();
    ctx.arc(eyeball.x, eyeball.y, eyeball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0ff";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(eyeball.x, eyeball.y, eyeball.radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#00aaff";
    ctx.fill();

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

  // Recompute all small circles inside BIG nofurs, independent of drawNode.
  function computeBigSmallNodes() {
    const result = [];
    try {
      if (
        typeof nofurs === "undefined" ||
        !Array.isArray(nofurs) ||
        typeof outerOrder === "undefined" ||
        typeof innerPairs === "undefined" ||
        typeof rot === "undefined"
      ) {
        return result;
      }

      const radiusOuter = 100;
      const radiusInner = 50;
      const nOuter = outerOrder.length;

      function angleForIndex(idx, baseRot) {
        return (idx / nOuter) * Math.PI * 2 - Math.PI / 2 + baseRot;
      }

      for (const nf of nofurs) {
        if (!nf || !nf.center) continue;
        if (nf.flag === "left" || nf.flag === "right") continue;
        const label = nf.label;
        if (!bigLabels.has(label)) continue;

        const cx = nf.center.x;
        const cy = nf.center.y;
        const scale =
          nf.outerRadius && nf.outerRadius !== 0
            ? nf.outerRadius / radiusOuter
            : 1.0;

        const baseRot =
          (typeof rot === "number" ? rot : 0) *
          (rotationFactors[label] || 1.0);

        const outerLocal = [];
        for (let i = 0; i < nOuter; i++) {
          const angle = angleForIndex(i, baseRot);
          const lx = Math.cos(angle) * radiusOuter;
          const ly = Math.sin(angle) * radiusOuter;
          outerLocal.push({ lx, ly, num: outerOrder[i], idx: i });
        }

        for (const o of outerLocal) {
          const wx = cx + o.lx * scale;
          const wy = cy + o.ly * scale;
          const num = o.num;
          const color =
            (typeof nodeColors !== "undefined" && nodeColors[num]) || "#999";
          result.push({
            x: wx,
            y: wy,
            num,
            color,
            parentLabel: label
          });
        }

        for (let i = 0; i < innerPairs.length; i++) {
          const [aNum, bNum] = innerPairs[i];
          const aIndex = outerOrder.indexOf(aNum);
          const bIndex = outerOrder.indexOf(bNum);
          if (aIndex < 0 || bIndex < 0) continue;

          const angleA = angleForIndex(aIndex, baseRot);
          const angleB = angleForIndex(bIndex, baseRot);
          const midAngle = (angleA + angleB) / 2;

          const lx = Math.cos(midAngle) * radiusInner;
          const ly = Math.sin(midAngle) * radiusInner;

          const wx = cx + lx * scale;
          const wy = cy + ly * scale;

          const num = 14 + i;
          const color =
            (typeof nodeColors !== "undefined" && nodeColors[num]) || "#999";

          result.push({
            x: wx,
            y: wy,
            num,
            color,
            parentLabel: label
          });
        }
      }
    } catch (e) {
      console.warn("[meq-eyeball] computeBigSmallNodes error:", e);
    }
    return result;
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
        window._meqEyeballStatus = null;
        return;
      }

      const lockState = window.nofurLockState || {};
      const omegaLock = lockState.OMEGA || { locked: false };

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

      let primaryLabel = null;
      let primaryColor = null;
      let primaryHybridColors = null;

      let secondaryLabel = null;
      let secondaryColor = null;
      let secondaryTarget = null;

      let thirdParentLabel = null;
      let thirdNodeNum = null;
      let thirdColor = null;
      let thirdTarget = null;

      let targetNode = null;

      // === CASE A: OMEGA locked ===
      if (omegaLock.locked && omegaCenter) {
        targetNode = omegaCenter;
        primaryLabel = "OMEGA";

        const hybridColors = getOmegaHybridColors();
        if (hybridColors && hybridColors.length) {
          primaryHybridColors = hybridColors.slice(0, 4);
        } else {
          primaryColor = getBridgeColor("OMEGA");
        }

        // SECONDARY: nearest locked big (ALPHA/BETA/GAMMA/DELTA)
        const candidates = ["ALPHA", "BETA", "GAMMA", "DELTA"];
        let bestDist = Infinity;
        let bestNode = null;
        let bestLabel = null;

        for (const label of candidates) {
          const state = lockState[label];
          if (!state || !state.locked) continue;

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
          secondaryLabel = bestLabel;
          secondaryColor = getBridgeColor(bestLabel);
        }

        // THIRD: nearest small circle in BIG nofurs (only if we have a second line)
        if (secondaryTarget && secondaryColor) {
          const smallNodes = computeBigSmallNodes();
          let bestSmall = null;
          let bestSmallDist = Infinity;

          for (const sn of smallNodes) {
            if (!sn) continue;

            const dxE = eyeball.x - sn.x;
            const dyE = eyeball.y - sn.y;
            const d2E = dxE * dxE + dyE * dyE;

            if (d2E < bestSmallDist) {
              bestSmallDist = d2E;
              bestSmall = sn;
            }
          }

          if (bestSmall) {
            thirdTarget = { center: { x: bestSmall.x, y: bestSmall.y } };
            thirdColor = bestSmall.color || "#ffffff";
            thirdNodeNum = bestSmall.num;
            thirdParentLabel = bestSmall.parentLabel || null;
          }
        }
      } else {
        // === CASE B: Normal (OMEGA not locked) ===
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
        if (targetNode && targetNode.label) {
          primaryLabel = targetNode.label;
        }

        if (
          targetNode &&
          bigLabels.has(targetNode.label) &&
          lockState[targetNode.label] &&
          lockState[targetNode.label].locked
        ) {
          primaryColor = getBridgeColor(targetNode.label);
        } else {
          primaryColor = "#0ff";
        }
      }

      // --- Draw primary line ---
      if (targetNode && targetNode.center) {
        const x1 = eyeball.x;
        const y1 = eyeball.y;
        const x2 = targetNode.center.x;
        const y2 = targetNode.center.y;

        if (Array.isArray(primaryHybridColors) && primaryHybridColors.length) {
          drawSegmentedLine(x1, y1, x2, y2, primaryHybridColors);
        } else if (primaryColor) {
          ctx.save();
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // --- Draw secondary line ---
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

      // --- Draw third line ---
      if (thirdTarget && thirdTarget.center && thirdColor) {
        const x1 = eyeball.x;
        const y1 = eyeball.y;
        const x2 = thirdTarget.center.x;
        const y2 = thirdTarget.center.y;

        ctx.save();
        ctx.strokeStyle = thirdColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }

      drawEyeballOnly();

      window._meqEyeballStatus = {
        primaryLabel,
        primaryColor,
        primaryHybridColors,
        secondaryLabel,
        secondaryColor,
        thirdParentLabel,
        thirdNodeNum,
        thirdColor
      };
    } catch (err) {
      console.warn("[meq-eyeball] draw error:", err);
      window._meqEyeballStatus = null;
    }
  }

  function renderSeekerStatusDom() {
    const panel = document.getElementById("segmentLog");
    const status = window._meqEyeballStatus;
    if (!panel || !status) return;

    const {
      primaryLabel,
      primaryHybridColors,
      secondaryLabel,
      secondaryColor,
      thirdParentLabel,
      thirdNodeNum,
      thirdColor
    } = status;

    let box = document.getElementById("seekerStatus");
    if (!box) {
      box = document.createElement("div");
      box.id = "seekerStatus";
      box.style.marginTop = "4px";
      box.style.borderTop = "1px solid #222";
      box.style.paddingTop = "4px";

      const headers = Array.from(panel.querySelectorAll("h2,h3"));
      const segmentsHeader = headers.find((h) =>
        /segments/i.test(h.textContent || "")
      );
      if (segmentsHeader && segmentsHeader.parentNode === panel) {
        panel.insertBefore(box, segmentsHeader);
      } else {
        panel.appendChild(box);
      }
    }

    let html = `<h3 style="font-size:11px;color:#0ff;margin:4px 0 2px;">Seeker Links</h3>`;
    html += `<div style="font-size:10px;color:#0ff;">`;

    html += `Eye Link 1 → ${primaryLabel || "-"}`;
    html += `<br>Eye Link 2 → ${secondaryLabel || "-"}`;
    html += `<br>Eye Link 3 → ${
      thirdParentLabel || "-"
    } node ${thirdNodeNum != null ? thirdNodeNum : "-"}`;

    html += `</div>`;

    const baseCols = new Array(6).fill(null);

    if (Array.isArray(primaryHybridColors)) {
      for (let i = 0; i < 4; i++) {
        baseCols[i] = primaryHybridColors[i] || null;
      }
    }
    if (secondaryColor) baseCols[4] = secondaryColor;
    if (thirdColor) baseCols[5] = thirdColor;

    const valid = baseCols.filter(Boolean);
    let mixColor = null;
    if (valid.length) {
      mixColor = valid.reduce((acc, c) => (acc ? blendColors(acc, c) : c), null);
    }

    html += `<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;align-items:center;">`;

    baseCols.forEach((c, idx) => {
      const bg = c || "transparent";
      const border = c ? "#0ff" : "#333";
      html += `<div title="${c || ""}" style="
        width:18px;
        height:18px;
        border:1px solid ${border};
        background:${bg};
        box-shadow:0 0 4px ${border};
      "></div>`;

      if (idx === 5) {
        html += `<div style="font-size:12px;color:#0ff;padding:0 2px;">=</div>`;
        const mixBg = mixColor || "transparent";
        const mixBorder = mixColor ? "#0ff" : "#333";
        html += `<div title="${mixColor || ""}" style="
          width:18px;
          height:18px;
          border:1px solid ${mixBorder};
          background:${mixBg};
          box-shadow:0 0 4px ${mixBorder};
        "></div>`;
      }
    });

    html += `<br /></div><br />`;

    box.innerHTML = html;
  }

  function eyeballStep() {
    ensureEyeballInit();
    if (!eyeball) return;
    updateEyeball();
    drawEyeballAndLink();
  }

  window.requestAnimationFrame = function (callback) {
    const wrapped = function (timestamp) {
      callback(timestamp);
      eyeballStep();
      renderSeekerStatusDom();
    };
    return originalRAF.call(window, wrapped);
  };

  console.log(
    "[meq-eyeball] Eyeball wanderer initialized (tri-line big-only + 7-swatch seeker UI, geom-based 3rd line)."
  );
})();
