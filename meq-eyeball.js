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
//        (3rd line is active ANY time OMEGA is locked, even if no 2nd line exists.)
//
// Left column UI (under Nofur Locks, above Segments):
//  - Shows 3 links (when enabled):
//      Eye Link 1 → <primaryLabel>
//      Eye Link 2 → <secondaryLabel or ->
//      Eye Link 3 → <thirdParentLabel or -> node <thirdNodeNum or ->
//  - Shows 7 swatches total:
//      1–4: the 4 hybrid colors (if present)
//      5:   second line color (if present)
//      6:   third line color (if present)
//      =   7: blend of all non-null colors (cumulative hybrid)
//  - Bridge Nodes summary (always updating, even when eye is disabled):
//      ALPHA/BETA/GAMMA/DELTA → node <locked node if locked, else live contact>
//      OMEGA → node <locked node only when locked, else "-">
//  - Controls:
//      [Disable Seeker Eye] / [Enable Seeker Eye]
//      [Follow Mouse] / [Stop Following]
//      Eye Speed slider: 0 → stopped, up to 100 (internally 0–10× base speed)
//      [Auto Eye Traverse] / [Stop Auto Traverse]
//        → when enabled, whenever Eye Link 1 is connected to a SMALL nofur
//           (flag "left"/"right"), simulate a click on that small nofur,
//           BUT never twice in a row on the same one (by label+flag+baseDigit).
//
//  - When eye is disabled:
//      * No movement, no lines.
//      * Eye is drawn parked at the center of the Sierpinski box area.
//      * Panel shows "Eye disabled" + Bridge Nodes + controls.

(function () {
  if (window._meqEyeballPatched) return;
  window._meqEyeballPatched = true;

  const originalRAF = window.requestAnimationFrame;
  if (typeof originalRAF !== "function") {
    console.warn("[meq-eyeball] requestAnimationFrame not available.");
    return;
  }

  // Global flags
  if (typeof window._meqEyeEnabled === "undefined") {
    window._meqEyeEnabled = true;
  }
  if (typeof window._meqEyeFollowMouse === "undefined") {
    window._meqEyeFollowMouse = false;
  }
  if (typeof window._meqEyeSpeedScale === "undefined") {
    // Slider value 0..100, default ~ baseline
    window._meqEyeSpeedScale = 10.0;
  }
  if (typeof window._meqEyeAutoTraverse === "undefined") {
    window._meqEyeAutoTraverse = false;
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

  // Mouse-follow target (canvas coords)
  let mouseTarget = { x: null, y: null };
  let mouseListenerAttached = false;

  // Auto-traverse: last small nofur we triggered on (by label+flag+baseDigit)
  let lastTraverseNodeKey = null;

  function attachMouseListener() {
    if (mouseListenerAttached) return;
    if (typeof canvas === "undefined" || !canvas) return;

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      mouseTarget.x = (e.clientX - rect.left) * scaleX;
      mouseTarget.y = (e.clientY - rect.top) * scaleY;
    });

    mouseListenerAttached = true;
  }

  function getSpeedScale() {
    const s = window._meqEyeSpeedScale;
    if (typeof s !== "number" || isNaN(s)) return 10.0;
    return Math.max(0, Math.min(100, s));
  }

  function ensureEyeballInit() {
    try {
      if (typeof canvas === "undefined" || !canvas) return;
      if (!eyeball) {
        const width = typeof W !== "undefined" ? W : canvas.width;
        const height = typeof H !== "undefined" ? H : canvas.height;

        eyeball = {
          x: width / 2,
          y: height / 2,
          vx: 2.1,
          vy: -1.4,
          baseSpeed: 2.5,
          radius: 12
        };
      }
    } catch (err) {
      console.warn("[meq-eyeball] init error:", err);
    }
  }

  // Random wander
  function updateEyeballRandom() {
    if (!eyeball) return;
    if (typeof W === "undefined" || typeof H === "undefined") return;

    const sliderVal = getSpeedScale();  // 0..100
    const norm = sliderVal / 10;        // 0..10
    const speed = eyeball.baseSpeed * norm; // 0.. ~25 px/frame

    if (speed <= 0) return; // frozen

    const maxTurn = 0.08;
    const turn = (Math.random() - 0.5) * 2 * maxTurn;
    const angle = Math.atan2(eyeball.vy, eyeball.vx) + turn;

    eyeball.vx = Math.cos(angle) * speed;
    eyeball.vy = Math.sin(angle) * speed;

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

  // Follow mouse
  function updateEyeballFollowMouse() {
    if (!eyeball) return;
    if (typeof W === "undefined" || typeof H === "undefined") return;

    const sliderVal = getSpeedScale();  // 0..100
    const norm = sliderVal / 10;        // 0..10
    const maxStep = norm * 5;           // 0..50 px/frame

    if (maxStep <= 0) return; // stopped

    if (mouseTarget.x == null || mouseTarget.y == null) {
      updateEyeballRandom();
      return;
    }

    const dx = mouseTarget.x - eyeball.x;
    const dy = mouseTarget.y - eyeball.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

    const step = Math.min(maxStep, dist);
    const moveX = (dx / dist) * step;
    const moveY = (dy / dist) * step;

    eyeball.vx = moveX;
    eyeball.vy = moveY;

    eyeball.x += moveX;
    eyeball.y += moveY;

    const marginX = 260;
    const marginY = 40;

    eyeball.x = Math.max(marginX, Math.min(W - marginX, eyeball.x));
    eyeball.y = Math.max(marginY, Math.min(H - marginY, eyeball.y));
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

  function drawEyeballAt(x, y) {
    if (!eyeball || typeof ctx === "undefined") return;

    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, eyeball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0ff";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, eyeball.radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#00aaff";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, eyeball.radius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    ctx.restore();
  }

  function drawEyeballOnly() {
    if (!eyeball) return;
    drawEyeballAt(eyeball.x, eyeball.y);
  }

  function drawEyeballDisabled() {
    if (!eyeball || typeof ctx === "undefined") return;
    try {
      if (typeof center !== "undefined") {
        const sx = center.x;
        const sy = center.y - 225;
        drawEyeballAt(sx, sy);
      } else if (typeof W !== "undefined" && typeof H !== "undefined") {
        drawEyeballAt(W / 2, H / 2 - 200);
      } else {
        drawEyeballAt(eyeball.x, eyeball.y);
      }
    } catch {
      drawEyeballAt(eyeball.x, eyeball.y);
    }
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

  function simulateCanvasClickAt(px, py) {
    try {
      if (typeof canvas === "undefined" || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + (px / canvas.width) * rect.width;
      const clientY = rect.top + (py / canvas.height) * rect.height;

      const evt = new MouseEvent("click", {
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        view: window
      });
      canvas.dispatchEvent(evt);
    } catch (e) {
      console.warn("[meq-eyeball] simulateCanvasClickAt error:", e);
    }
  }

  // Auto traverse: when Eye Link 1 is on a SMALL nofur (left/right),
  // simulate click once, but NEVER for the same (label+flag+baseDigit) twice in a row.
  // Auto traverse: when Eye Link 1 is on a SMALL nofur (left/right),
  // simulate click once, but NEVER for the same (flag+baseDigit) twice in a row.
  function maybeAutoTraverse(targetNode) {
    if (!window._meqEyeAutoTraverse) return;
    if (!targetNode || !targetNode.center) return;

    // Only small nofur wheels, not big rings / small circles
    if (targetNode.flag !== "left" && targetNode.flag !== "right") return;
    if (typeof targetNode.baseDigit !== "number") return;

    // 🔑 STABLE identity for this small wheel:
    //    - flag: "left" or "right"
    //    - baseDigit: 2,3,4,5,6,7,8,9,0,1
    const key = `${targetNode.flag}:${targetNode.baseDigit}`;

    // Same small nofur as last time we auto-fired → do nothing
    if (key === lastTraverseNodeKey) {
      return;
    }

    // New small nofur → trigger once and remember
    simulateCanvasClickAt(targetNode.center.x, targetNode.center.y);
    lastTraverseNodeKey = key;
  }


  function drawEyeballAndLink() {
    try {
      if (typeof ctx === "undefined") return;
      if (!eyeball) return;

      if (!window._meqEyeEnabled) {
        window._meqEyeballStatus = null;
        drawEyeballDisabled();
        return;
      }

      let nodes = [];
      if (Array.isArray(window.nofurs)) {
        nodes = window.nofurs;
      } else if (typeof nofurs !== "undefined" && Array.isArray(nofurs)) {
        nodes = nofurs;
      }

      if (!nodes.length) {
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

      // A: OMEGA locked → tri-line mode
      if (omegaLock.locked && omegaCenter) {
        targetNode = omegaCenter;
        primaryLabel = "OMEGA";

        const hybridColors = getOmegaHybridColors();
        if (hybridColors && hybridColors.length) {
          primaryHybridColors = hybridColors.slice(0, 4);
        } else {
          primaryColor = getBridgeColor("OMEGA");
        }

        // Second line: nearest locked big among ALPHA/BETA/GAMMA/DELTA
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

        // Third line: nearest small circle in any big nofur
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

        // In OMEGA-locked mode, auto-traverse is not used.
      } else {
        // B: Normal behavior
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

        // Auto eye traverse in normal mode only
        maybeAutoTraverse(targetNode);
      }
      // 🔁 Reset last small-click whenever Eye Link 1 is on a BIG nofur wheel
      // (i.e., not a small left/right wheel). This lets us click the same
      // small wheel twice in a row as long as we "touch" a big wheel in between.
      if (
        targetNode &&
        targetNode.flag !== "left" &&
        targetNode.flag !== "right"
      ) {
        lastTraverseNodeKey = null;
      }
      // Primary line
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

      // Second line
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

      // Third line
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
    if (!panel) return;

    const enabled = !!window._meqEyeEnabled;
    const follow = !!window._meqEyeFollowMouse;
    const autoTrav = !!window._meqEyeAutoTraverse;
    const speedScale = getSpeedScale();
    const status = window._meqEyeballStatus;

    let container = document.getElementById("seekerStatus");
    if (!container) {
      container = document.createElement("div");
      container.id = "seekerStatus";
      container.style.marginTop = "4px";
      container.style.borderTop = "1px solid #222";
      container.style.paddingTop = "4px";

      const headers = Array.from(panel.querySelectorAll("h2,h3"));
      const segmentsHeader = headers.find((h) =>
        /segments/i.test(h.textContent || "")
      );
      if (segmentsHeader && segmentsHeader.parentNode === panel) {
        panel.insertBefore(container, segmentsHeader);
      } else {
        panel.appendChild(container);
      }
    }

    let content = document.getElementById("seekerStatusContent");
    if (!content) {
      content = document.createElement("div");
      content.id = "seekerStatusContent";
      container.appendChild(content);
    }

    let btnRow = document.getElementById("seekerButtonRow");
    if (!btnRow) {
      btnRow = document.createElement("div");
      btnRow.id = "seekerButtonRow";
      btnRow.style.marginTop = "4px";
      btnRow.style.display = "flex";
      btnRow.style.gap = "4px";
      container.appendChild(btnRow);
    }

    let toggleBtn = document.getElementById("toggleEyeBtn");
    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.id = "toggleEyeBtn";
      toggleBtn.style.flex = "1 1 auto";
      toggleBtn.style.padding = "3px 6px";
      toggleBtn.style.fontSize = "10px";
      toggleBtn.style.background = "#111";
      toggleBtn.style.color = "#0ff";
      toggleBtn.style.border = "1px solid #0ff";
      toggleBtn.style.borderRadius = "3px";
      toggleBtn.style.cursor = "pointer";
      toggleBtn.addEventListener("click", function () {
        window._meqEyeEnabled = !window._meqEyeEnabled;
      });
      btnRow.appendChild(toggleBtn);
    }
    toggleBtn.textContent = enabled ? "Disable Seeker Eye" : "Enable Seeker Eye";

    let followBtn = document.getElementById("followEyeBtn");
    if (!followBtn) {
      followBtn = document.createElement("button");
      followBtn.id = "followEyeBtn";
      followBtn.style.flex = "1 1 auto";
      followBtn.style.padding = "3px 6px";
      followBtn.style.fontSize = "10px";
      followBtn.style.background = "#111";
      followBtn.style.color = "#0ff";
      followBtn.style.border = "1px solid #0ff";
      followBtn.style.borderRadius = "3px";
      followBtn.style.cursor = "pointer";
      followBtn.addEventListener("click", function () {
        window._meqEyeFollowMouse = !window._meqEyeFollowMouse;
      });
      btnRow.appendChild(followBtn);
    }
    followBtn.textContent = follow ? "Stop Following" : "Follow Mouse";

    let speedRow = document.getElementById("eyeSpeedRow");
    if (!speedRow) {
      speedRow = document.createElement("div");
      speedRow.id = "eyeSpeedRow";
      speedRow.style.marginTop = "4px";
      speedRow.style.marginBottom = "4px";
      speedRow.style.fontSize = "10px";
      speedRow.style.color = "#0ff";

      const label = document.createElement("span");
      label.textContent = "Eye Speed: ";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.id = "eyeSpeedSlider";
      slider.min = "0";
      slider.max = "100";
      slider.step = "0.5";
      slider.value = String(speedScale);
      slider.style.width = "140px";
      slider.style.margin = "0 4px";

      const valSpan = document.createElement("span");
      valSpan.id = "eyeSpeedValue";
      valSpan.textContent = speedScale.toFixed(1);

      slider.addEventListener("input", () => {
        const v = parseFloat(slider.value);
        window._meqEyeSpeedScale = isNaN(v) ? 10.0 : v;
        valSpan.textContent = getSpeedScale().toFixed(1);
      });

      speedRow.appendChild(label);
      speedRow.appendChild(slider);
      speedRow.appendChild(valSpan);

      container.appendChild(speedRow);
    } else {
      const valSpan = document.getElementById("eyeSpeedValue");
      if (valSpan) {
        valSpan.textContent = speedScale.toFixed(1);
      }
    }

    let autoRow = document.getElementById("autoEyeRow");
    if (!autoRow) {
      autoRow = document.createElement("div");
      autoRow.id = "autoEyeRow";
      autoRow.style.marginTop = "4px";

      const autoBtn = document.createElement("button");
      autoBtn.id = "autoEyeBtn";
      autoBtn.style.padding = "3px 6px";
      autoBtn.style.fontSize = "10px";
      autoBtn.style.background = "#111";
      autoBtn.style.color = "#0ff";
      autoBtn.style.border = "1px solid #0ff";
      autoBtn.style.borderRadius = "3px";
      autoBtn.style.cursor = "pointer";
      autoBtn.addEventListener("click", function () {
        window._meqEyeAutoTraverse = !window._meqEyeAutoTraverse;
      });

      autoRow.appendChild(autoBtn);
      container.appendChild(autoRow);
    }
    const autoBtn = document.getElementById("autoEyeBtn");
    if (autoBtn) {
      autoBtn.textContent = autoTrav ? "Stop Auto Traverse" : "Auto Eye Traverse";
    }

    function currentOuterIndexFor(label) {
      try {
        if (
          typeof seekerAngles === "undefined" ||
          typeof outerOrder === "undefined" ||
          typeof rot === "undefined"
        ) {
          return null;
        }
        const anglesArr = seekerAngles[label];
        if (!anglesArr || !anglesArr.length) return null;

        const seekerAngle = anglesArr[0];
        const factor = rotationFactors[label] || 1.0;
        const rotationVal = rot * factor;

        const radiusOuter = 100;
        const seekerRadius = radiusOuter + 45;

        const sx = Math.cos(seekerAngle) * seekerRadius;
        const sy = Math.sin(seekerAngle) * seekerRadius;

        let bestIndex = null;
        let bestDist2 = Infinity;

        for (let i = 0; i < outerOrder.length; i++) {
          const angle =
            (i / outerOrder.length) * Math.PI * 2 -
            Math.PI / 2 +
            rotationVal;
          const x = Math.cos(angle) * radiusOuter;
          const y = Math.sin(angle) * radiusOuter;
          const dx = sx - x;
          const dy = sy - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestDist2) {
            bestDist2 = d2;
            bestIndex = i;
          }
        }
        return bestIndex;
      } catch {
        return null;
      }
    }

    function buildBridgeNodesHtml() {
      let html = `<div style="font-size:10px;color:#0ff;margin-top:4px;">Bridge Nodes:<br>`;
      const lockState = window.nofurLockState || {};
      const bigList = ["ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"];

      if (typeof outerOrder !== "undefined" && Array.isArray(outerOrder)) {
        for (const label of bigList) {
          let nodeTxt = "-";
          const ls = lockState[label];

          if (label === "OMEGA") {
            if (
              ls &&
              ls.locked &&
              typeof ls.outerIndex === "number" &&
              ls.outerIndex >= 0 &&
              ls.outerIndex < outerOrder.length
            ) {
              nodeTxt = outerOrder[ls.outerIndex];
            }
          } else {
            let idx = null;

            if (
              ls &&
              ls.locked &&
              typeof ls.outerIndex === "number" &&
              ls.outerIndex >= 0 &&
              ls.outerIndex < outerOrder.length
            ) {
              idx = ls.outerIndex;
            } else {
              idx = currentOuterIndexFor(label);
            }

            if (idx != null && idx >= 0 && idx < outerOrder.length) {
              nodeTxt = outerOrder[idx];
            }
          }

          html += `${label} → node ${nodeTxt}<br>`;
        }
      }

      html += `</div>`;
      return html;
    }

    let html = `<h3 style="font-size:11px;color:#0ff;margin:4px 0 2px;">Seeker Links</h3>`;

    if (!enabled || !status) {
      html += `<div style="font-size:10px;color:#888;">
        Seeker eye is currently <span style="color:#f33;">DISABLED</span>.
      </div>`;
      html += buildBridgeNodesHtml();
      html += `<br>`;
      content.innerHTML = html;
      return;
    }

    const {
      primaryLabel,
      primaryHybridColors,
      secondaryLabel,
      secondaryColor,
      thirdParentLabel,
      thirdNodeNum,
      thirdColor
    } = status;

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
    html += `</div>`;

    html += buildBridgeNodesHtml();
    html += `<br>`;
    content.innerHTML = html;
  }

  function eyeballStep() {
    ensureEyeballInit();
    attachMouseListener();
    if (!eyeball) return;

    if (window._meqEyeEnabled) {
      if (window._meqEyeFollowMouse) {
        updateEyeballFollowMouse();
      } else {
        updateEyeballRandom();
      }
    }
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
    "[meq-eyeball] Eyeball wanderer initialized (tri-line + 7-swatch UI + bridge-node summary + parked-eye-on-disable + Follow Mouse + 0–100 speed + auto-traverse with no repeated small nofur)."
  );
})();
