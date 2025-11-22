// meq-eyeball.js
// Wandering eyeball node that always links to a MEQUAVIS node.
//
// Behavior:
//  - Normal (OMEGA unlocked):
//      * Eye Link 1: Eye → nearest node (big or small), same as before.
//      * Auto Traverse OFF: no clicks.
//      * Auto Traverse ON:
//          - Traversal Link (Link 4) target = Eye Link 1 target,
//            but ONLY if it is a SMALL nofur wheel (flag "left"/"right").
//          - Traversal Link label is "sticky": keeps showing the last small
//            nofur wheel that Eye Link 1 pointed at, until a new one is hit.
//          - Traversal auto-clicks that small wheel once per unique (flag:baseDigit).
//
//  - OMEGA locked:
//      * Eye Link 1: Eye → big OMEGA center, hybrid colors if available.
//      * Eye Link 2: Eye → nearest locked big (ALPHA/BETA/GAMMA/DELTA).
//      * Eye Link 3: Eye → nearest small circle INSIDE any big nofur (inner nodes).
//      * Auto Traverse OFF: no traversal clicks.
//      * Auto Traverse ON:
//          - Traversal Link (Link 4) target = nearest small nofur WHEEL
//            (flag "left"/"right"), independent of Eye Link 1.
//          - Traversal Link draws a 4th line from eye → that small wheel.
//          - Traversal auto-clicks that wheel once per unique (flag:baseDigit),
//            without hammering it.
//
//  - Left column UI:
//      Eye Link 1 → <primaryLabel>
//      Eye Link 2 → <secondaryLabel or ->
//      Eye Link 3 → <thirdParentLabel or -> node <thirdNodeNum or ->
//      Traversal Link → <sticky small wheel label or ->  (ONLY if Auto Traverse is ON)
//
//
//  - Controls:
//      [Disable Seeker Eye] / [Enable Seeker Eye]
//      [Follow Mouse] / [Stop Following]
//      Eye Speed slider: 0 → stopped, up to 100 (internally 0–10× base speed)
//      [Auto Eye Traverse] / [Stop Auto Traverse]
//      [Stop Nofur Spin] / [Start Nofur Spin] (global big-wheel spin toggle)

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
  // Master toggle for big wheel spin (used by rotation code in main HTML)
  if (typeof window._meqBigWheelSpinEnabled === "undefined") {
    window._meqBigWheelSpinEnabled = true;
  }

  const bigLabels = new Set(["ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"]);
  const rotationFactors = {
    ALPHA: 0.8,
    BETA: 0.9,
    OMEGA: 1.0,
    DELTA: 1.1,
    GAMMA: 1.2
  };

  // ---------------------------------------------------------------------------
  // OMNIVERSE LABEL HELPERS (DISPLAY ONLY)
  // ---------------------------------------------------------------------------

  // Turn something like "L2-O..27" into "Layer 2 – Omniverse 027"
  function formatOmniLabel(raw) {
    if (!raw) return raw;
    let out = String(raw);

    // L → Layer
    out = out.replace(/\bL(\d+)/g, "Layer $1");

    // O.. → Omniverse <current omniverseNumber>
    const omni = (typeof window.omniverseNumber === "string" &&
                  window.omniverseNumber.length)
      ? window.omniverseNumber
      : "..";

    // Handles "O.." variants
    out = out.replace(/O\.\./g, "Omniverse " + omni);

    return out;
  }

  // Prepend Gasket + Segment on their own line above the label
  function prependGasketSegment(label) {
    if (!label) return label;

    const g  = (typeof window.gasketCurrent === "number")
      ? window.gasketCurrent
      : null;
    const gp = (typeof window.gasketPowerCurrent === "number")
      ? window.gasketPowerCurrent
      : null;
    const seg = (typeof window.segmentCurrent === "number")
      ? window.segmentCurrent
      : null;

    let gasketLabel;
    if (g != null && gp != null) {
      gasketLabel = gp === 1
        ? `Gasket ${g}`
        : `Gasket ${g}^${gp}`;
    } else {
      gasketLabel = "Gasket ?";
    }

    const segLabel = seg != null ? `Segment ${seg}` : "Segment ?";

    // Line break before the Layer/Omniverse part
    return `${gasketLabel}, ${segLabel}<br>${label}`;
  }

  // ---------------------------------------------------------------------------

  let eyeball = null;

  // Mouse-follow target (canvas coords)
  let mouseTarget = { x: null, y: null };
  let mouseListenerAttached = false;

  // Auto-traverse: last small nofur we triggered on (by flag+baseDigit)
  let lastTraverseNodeKey = null;

  // Snapshot of traversal display text (frozen at moment of click)
  let traversalDisplaySnapshot = null;

  // Disabled-eye random traversal state
  let disabledTraverseTarget = null;
  let disabledTraverseLastSwitchTime = 0;
  let disabledTraverseInterval = 0; // ms between picks (20–200, scaled)

  // Sticky label for Traversal Link when OMEGA is unlocked (raw label, like "L2-O..2")
  let traversalStickyLabel = null;

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

  // Parked/disabled eye anchor position
  function getDisabledEyeballAnchor() {
    try {
      if (typeof center !== "undefined" && center) {
        return { x: center.x, y: center.y - 225 };
      } else if (typeof W !== "undefined" && typeof H !== "undefined") {
        return { x: W / 2, y: H / 2 - 200 };
      } else if (eyeball) {
        return { x: eyeball.x, y: eyeball.y };
      }
    } catch {
      if (eyeball) {
        return { x: eyeball.x, y: eyeball.y };
      }
    }
    return { x: 0, y: 0 };
  }

  function drawEyeballOnly() {
    if (!eyeball) return;
    drawEyeballAt(eyeball.x, eyeball.y);
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

  // Auto traverse: always driven from Traversal Link (Link 4).
  // We:
  //  1) Build traversal text from the *current* (pre-click) globals
  //  2) Snapshot that text
  //  3) Click the small nofur
  //  4) Never change the snapshot again until a new small nofur is targeted
  function maybeAutoTraverse(targetNode, rawTraversalLabel) {
    if (!window._meqEyeAutoTraverse) return;

    // If the current traversal target isn't a small side wheel,
    // DO NOT clear the snapshot — keep the last text until a real
    // small wheel is hit again.
    if (
      !targetNode ||
      !targetNode.center ||
      (targetNode.flag !== "left" && targetNode.flag !== "right") ||
      typeof targetNode.baseDigit !== "number"
    ) {
      return;
    }

    const key = `${targetNode.flag}:${targetNode.baseDigit}`;

    // Same small nofur as last time → no new click, keep old snapshot text.
    if (key === lastTraverseNodeKey) {
      return;
    }

    // --- NEW TARGET: snapshot the *pre-click* text first ---

    // Prefer the raw traversal label; fall back to node.label if needed
    let labelToUse = rawTraversalLabel;
    if (!labelToUse && typeof targetNode.label === "string") {
      labelToUse = targetNode.label;
    }

    if (labelToUse) {
      let t = formatOmniLabel(labelToUse); // L → Layer, O.. → Omniverse N
      t = prependGasketSegment(t);        // Gasket / Segment line
      traversalDisplaySnapshot = t;
    } else {
      traversalDisplaySnapshot = "-";
    }

    // --- Now fire the click, which mutates segment/gasket/omniverse ---
    simulateCanvasClickAt(targetNode.center.x, targetNode.center.y);
    lastTraverseNodeKey = key;
  }

  // Disabled-eye random small-wheel traversal (visual + click)
  function updateDisabledAutoTraverse(timestamp) {
    if (!window._meqEyeAutoTraverse || window._meqEyeEnabled) {
      disabledTraverseTarget = null;
      disabledTraverseInterval = 0;
      disabledTraverseLastSwitchTime = 0;
      return;
    }

    let nodes = [];
    if (Array.isArray(window.nofurs)) {
      nodes = window.nofurs;
    } else if (typeof nofurs !== "undefined" && Array.isArray(nofurs)) {
      nodes = nofurs;
    }

    const smalls = nodes.filter(
      (n) =>
        n &&
        n.center &&
        (n.flag === "left" || n.flag === "right")
    );

    if (!smalls.length) {
      disabledTraverseTarget = null;
      return;
    }

    function computeInterval() {
      const speedValRaw = getSpeedScale();   // 0..100
      const speedVal = speedValRaw <= 0 ? 0.25 : speedValRaw;

      const baselineMin = 20;   // ms
      const baselineMax = 200;  // ms
      const base = baselineMin + Math.random() * (baselineMax - baselineMin);

      const multiplier = 10 / speedVal; // lower slider → slower picks, higher → faster

      return base * multiplier;
    }

    // Initialize on first run
    if (!disabledTraverseTarget) {
      const idx = Math.floor(Math.random() * smalls.length);
      disabledTraverseTarget = smalls[idx];
      disabledTraverseInterval = computeInterval();
      disabledTraverseLastSwitchTime = timestamp;
      return;
    }

    if (!disabledTraverseInterval) {
      disabledTraverseInterval = computeInterval();
    }
    if (!disabledTraverseLastSwitchTime) {
      disabledTraverseLastSwitchTime = timestamp;
    }

    const elapsed = timestamp - disabledTraverseLastSwitchTime;
    if (elapsed >= disabledTraverseInterval) {
      const idx = Math.floor(Math.random() * smalls.length);
      disabledTraverseTarget = smalls[idx];
      disabledTraverseInterval = computeInterval(); // next scaled interval
      disabledTraverseLastSwitchTime = timestamp;
    }
  }

  function drawEyeballAndLink() {
    try {
      if (typeof ctx === "undefined") return;
      if (!eyeball) return;

      // Disabled eye but Auto Traverse ON → park and draw to random small nofur
      if (!window._meqEyeEnabled) {
        const anchor = getDisabledEyeballAnchor();

        let traversalLabel = null;

        if (
          window._meqEyeAutoTraverse &&
          disabledTraverseTarget &&
          disabledTraverseTarget.center
        ) {
          const x1 = anchor.x;
          const y1 = anchor.y;
          const x2 = disabledTraverseTarget.center.x;
          const y2 = disabledTraverseTarget.center.y;

          ctx.save();
          ctx.strokeStyle =
            disabledTraverseTarget.color || "#0f0";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();

          traversalLabel = disabledTraverseTarget.label || null;

          // Use the same pre-click snapshot logic for disabled mode
          maybeAutoTraverse(disabledTraverseTarget, traversalLabel);
        }

        drawEyeballAt(anchor.x, anchor.y);

        // Even when disabled, expose traversalLabel so the UI can show Traversal Link
        window._meqEyeballStatus = {
          primaryLabel: null,
          primaryColor: null,
          primaryHybridColors: null,
          secondaryLabel: null,
          secondaryColor: null,
          thirdParentLabel: null,
          thirdNodeNum: null,
          thirdColor: null,
          traversalLabel
        };
        return;
      }

      // === Eye enabled path ===

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

      // Traversal Link (4th)
      let traversalTarget = null;
      let traversalLabel = null;

      let targetNode = null; // Eye Link 1 nearest node

      // A: OMEGA locked → tri-line + traversal
      if (omegaLock.locked && omegaCenter) {
        // Eye Link 1 → OMEGA
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

        // Traversal Link (4): nearest SMALL nofur wheel (left/right)
        let bestSmallWheel = null;
        let bestSmallWheelDist = Infinity;

        for (const n of nodes) {
          if (!n || !n.center) continue;
          if (n.flag !== "left" && n.flag !== "right") continue;

          const dx = eyeball.x - n.center.x;
          const dy = eyeball.y - n.center.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestSmallWheelDist) {
            bestSmallWheelDist = d2;
            bestSmallWheel = n;
          }
        }

        if (bestSmallWheel) {
          traversalTarget = bestSmallWheel;
          traversalLabel = bestSmallWheel.label || null;
        }
            } else {
        // B: Normal behavior (OMEGA unlocked)
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

        // Traversal Link (4) in normal mode:
        //   - target = Eye Link 1 target ONLY if it is a small nofur wheel.
        //   - label is sticky across frames.
        if (
          targetNode &&
          (targetNode.flag === "left" || targetNode.flag === "right") &&
          typeof targetNode.baseDigit === "number"
        ) {
          traversalTarget = targetNode;
          traversalStickyLabel = targetNode.label || traversalStickyLabel;
        }

        traversalLabel = traversalStickyLabel;

        // --- FIX: break the small-wheel streak when we're not on a small nofur ---
        // If Eye Link 1 is *not* currently targeting a small nofur wheel, we
        // clear lastTraverseNodeKey so that coming back to the same small
        // (after a big in between) counts as a fresh hit.
        if (!traversalTarget) {
          lastTraverseNodeKey = null;
        }
      }


      // === Draw lines ===

      // Eye Link 1
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

      // Eye Link 2
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

      // Eye Link 3
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

      // Traversal Link (4)
      if (
        window._meqEyeAutoTraverse &&
        traversalTarget &&
        traversalTarget.center
      ) {
        const x1 = eyeball.x;
        const y1 = eyeball.y;
        const x2 = traversalTarget.center.x;
        const y2 = traversalTarget.center.y;

        ctx.save();
        ctx.strokeStyle =
          traversalTarget.color ||
          (thirdColor || primaryColor || "#0f0");
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Auto traverse click (with pre-click text snapshot)
      maybeAutoTraverse(traversalTarget, traversalLabel);

      drawEyeballOnly();

      window._meqEyeballStatus = {
        primaryLabel,
        primaryColor,
        primaryHybridColors,
        secondaryLabel,
        secondaryColor,
        thirdParentLabel,
        thirdNodeNum,
        thirdColor,
        traversalLabel
      };
    } catch (err) {
      console.warn("[meq-eyeball] draw error:", err);
      window._meqEyeballStatus = null;
    }
  }

  function renderSeekerStatusDom() {
    const panel = document.getElementById("segmentLog");
    if (!panel) return;

    const enabled   = !!window._meqEyeEnabled;
    const follow    = !!window._meqEyeFollowMouse;
    const autoTrav  = !!window._meqEyeAutoTraverse;
    const bigSpin   = !!window._meqBigWheelSpinEnabled;
    const speedScale = getSpeedScale();
    const status    = window._meqEyeballStatus;

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

    // Auto Eye Traverse + Big Wheel Spin row
    let autoRow = document.getElementById("autoEyeRow");
    if (!autoRow) {
      autoRow = document.createElement("div");
      autoRow.id = "autoEyeRow";
      autoRow.style.marginTop = "4px";
      autoRow.style.display = "flex";
      autoRow.style.gap = "4px";

      const autoBtn = document.createElement("button");
      autoBtn.id = "autoEyeBtn";
      autoBtn.style.flex = "1 1 auto";
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

      const bigSpinBtn = document.createElement("button");
      bigSpinBtn.id = "bigWheelSpinBtn";
      bigSpinBtn.style.flex = "1 1 auto";
      bigSpinBtn.style.padding = "3px 6px";
      bigSpinBtn.style.fontSize = "10px";
      bigSpinBtn.style.background = "#111";
      bigSpinBtn.style.color = "#0f0";
      bigSpinBtn.style.border = "1px solid #0f0";
      bigSpinBtn.style.borderRadius = "3px";
      bigSpinBtn.style.cursor = "pointer";
      bigSpinBtn.addEventListener("click", function () {
        window._meqBigWheelSpinEnabled = !window._meqBigWheelSpinEnabled;
      });

      autoRow.appendChild(bigSpinBtn);

      container.appendChild(autoRow);
    }

    const autoBtn = document.getElementById("autoEyeBtn");
    if (autoBtn) {
      autoBtn.textContent = autoTrav ? "Stop Auto Traverse" : "Auto Eye Traverse";
    }

    const bigSpinBtn = document.getElementById("bigWheelSpinBtn");
    if (bigSpinBtn) {
      bigSpinBtn.textContent = bigSpin ? "Stop Nofur Spin" : "Start Nofur Spin";
      bigSpinBtn.style.color = bigSpin ? "#f00" : "#0f0";
      bigSpinBtn.style.borderColor = bigSpin ? "#f00" : "#0f0";
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

    // Show a note if disabled, but DO NOT bail out – we still want Traversal Link text.
    if (!enabled) {
      html += `<div style="font-size:10px;color:#888;">
        Seeker eye is currently <span style="color:#f33;">DISABLED</span> (Auto Traverse ${
          autoTrav ? "ON" : "OFF"
        }).
      </div>`;
    }

    // If we have no status at all, fall back to bridge node info only.
    if (!status) {
      html += buildBridgeNodesHtml();
      html += `<br>`;
      content.innerHTML = html;
      return;
    }

    const {
      primaryLabel,
      primaryColor,
      primaryHybridColors,
      secondaryLabel,
      secondaryColor,
      thirdParentLabel,
      thirdNodeNum,
      thirdColor,
      traversalLabel // raw short label of link 4
    } = status;

    // Eye Link 1: raw label, but:
    //  When OMEGA is locked and active, append the current short form of link 4.
    const lockState = window.nofurLockState || {};
    const omegaLock = lockState.OMEGA || { locked: false };

    let displayPrimaryLabel = primaryLabel || "-";
    if (
      primaryLabel === "OMEGA" &&
      omegaLock.locked &&
      traversalLabel
    ) {
      displayPrimaryLabel = `OMEGA ${traversalLabel}`;
    }

    // Traversal Link: show frozen pre-click snapshot (works for enabled & disabled)
    const displayTraversalLabel = traversalDisplaySnapshot || "-";

    html += `<div style="font-size:10px;color:#0ff;">`;
    html += `Eye Link 1 → ${displayPrimaryLabel}`;
    html += `<br>Eye Link 2 → ${secondaryLabel || "-"}`;
    html += `<br>Eye Link 3 → ${
      thirdParentLabel || "-"
    } node ${thirdNodeNum != null ? thirdNodeNum : "-"}`;
    if (autoTrav) {
      html += `<br>Traversal Link → ${displayTraversalLabel}`;
    }
    html += `</div>`;

    // --- COLOR SWATCHES: first 4 always populated ---
    const baseCols = new Array(6).fill(null);

    // Prefer global OMEGA hybrid palette for the first 4 swatches,
    // regardless of OMEGA lock state.
    let omegaHybrids = getOmegaHybridColors();

    if (Array.isArray(omegaHybrids) && omegaHybrids.length) {
      for (let i = 0; i < 4; i++) {
        baseCols[i] = omegaHybrids[i % omegaHybrids.length];
      }
    } else if (Array.isArray(primaryHybridColors) && primaryHybridColors.length) {
      // Fallback: use Eye Link 1's hybrid colors if present
      for (let i = 0; i < 4; i++) {
        baseCols[i] =
          primaryHybridColors[i] ||
          primaryHybridColors[primaryHybridColors.length - 1];
      }
    } else if (primaryColor) {
      // Last resort: fill with the primary link color
      for (let i = 0; i < 4; i++) {
        baseCols[i] = primaryColor;
      }
    } else {
      // Absolute fallback: give them something visible
      for (let i = 0; i < 4; i++) {
        baseCols[i] = "#0ff";
      }
    }

    // Swatch 5 (secondary or composite big-bridge) & 6 (third link)
    if (secondaryColor) {
      baseCols[4] = secondaryColor;
    }

    // If swatch 5 is still null, use a concat/blend of any locked
    // ALPHA/BETA/GAMMA/DELTA bridge colors (NOT OMEGA).
    if (!baseCols[4]) {
      const lsAll = window.nofurLockState || {};
      const bridgeLabels = ["ALPHA", "BETA", "GAMMA", "DELTA"];
      const bridgeCols = [];

      for (const label of bridgeLabels) {
        const ls = lsAll[label];
        if (ls && ls.locked) {
          const col = getBridgeColor(label);
          if (col) bridgeCols.push(col);
        }
      }

      if (bridgeCols.length) {
        baseCols[4] = bridgeCols.reduce(
          (acc, c) => (acc ? blendColors(acc, c) : c),
          null
        );
      }
      // If no bridgeCols, we intentionally leave baseCols[4] as null.
    }

    if (thirdColor) baseCols[5] = thirdColor;

    // >>> NEW: when seeker is DISABLED and OMEGA is locked,
    //     swatch 6 shows the color OMEGA is locked to.
    if (!enabled && omegaLock.locked) {
      baseCols[5] = getBridgeColor("OMEGA");
    }
    // <<< END NEW

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


  function eyeballStep(timestamp) {
    ensureEyeballInit();
    attachMouseListener();
    if (!eyeball) return;

    // Update random disabled traverse timing
    updateDisabledAutoTraverse(
      typeof timestamp === "number" ? timestamp : performance.now()
    );

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
      eyeballStep(timestamp);
      renderSeekerStatusDom();
    };
    return originalRAF.call(window, wrapped);
  };

  console.log(
    "[meq-eyeball] Eyeball wanderer initialized (tri-line + Traversal Link + 7-swatch UI + bridge-node summary + parked-eye-on-disable + Follow Mouse + 0–100 speed + auto-traverse via Link 4 + big wheel spin toggle + disabled-eye random small-wheel traversal + omniverse-aware labels + gasket/segment prefix + pre-click traversal snapshot + OMEGA+L4 short label + disabled-mode Traversal Link display + always-on 4-swatch palette + composite non-OMEGA bridge swatch 5)."
  );
})();
