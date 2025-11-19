// meq-nofur-lock.js
// Click a BIG nofur (ALPHA/BETA/GAMMA/DELTA/OMEGA) to lock/unlock its bridge
// line to the currently connected outer node. The seeker dot never moves; only
// the line's target locks. Plays lock.wav / unlock.wav on toggle.

(function () {
  const canvas = document.getElementById("mequavis");
  if (!canvas) return;

  // Make sure required globals from your main script exist
  try {
    void seekerAngles;
    void outerOrder;
    void nofurs;
    void rot;
    void ctx;
    void innerPairs;
    void nodeColors;
    void seekerPositions;
    void drawNode;
  } catch (e) {
    // If any are missing, bail quietly
    return;
  }

  // Rotation multipliers per label (must match drawOmniverse logic)
  const rotationFactors = {
    ALPHA: 0.8,
    BETA:  0.9,
    OMEGA: 1.0,
    DELTA: 1.1,
    GAMMA: 1.2
  };

  // Per-wheel lock state (outerIndex is index into outerOrder)
  const lockState = {
    ALPHA: { locked: false, outerIndex: null },
    BETA:  { locked: false, outerIndex: null },
    GAMMA: { locked: false, outerIndex: null },
    DELTA: { locked: false, outerIndex: null },
    OMEGA: { locked: false, outerIndex: null }
  };
  window.nofurLockState = lockState; // handy to inspect in console

  // Sounds
  const lockSound   = new Audio("d.mp3");
  const unlockSound = new Audio("d.mp3");
  lockSound.volume   = 0.3;
  unlockSound.volume = 0.3;

  function playSoundSafe(audio) {
    try {
      audio.currentTime = 0;
      audio.play();
    } catch (_) {
      // Ignore autoplay errors
    }
  }

  // Figure out which OUTER INDEX the seeker is connected to *right now*
  function computeCurrentOuterIndex(label) {
    const anglesArr = seekerAngles[label];
    if (!anglesArr || !anglesArr.length) return null;

    const seekerAngle = anglesArr[0];
    const factor      = rotationFactors[label] || 1.0;
    const rotationVal = rot * factor;          // same rotation used in drawNofur

    const radiusOuter  = 100;
    const seekerRadius = radiusOuter + 45;

    // seeker position in local ring coords
    const sx = Math.cos(seekerAngle) * seekerRadius;
    const sy = Math.sin(seekerAngle) * seekerRadius;

    const n = outerOrder.length;
    let bestIndex = null;
    let bestDist2 = Infinity;

    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + rotationVal;
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
  }

  const bigLabels = new Set(["ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"]);

  // Click handler: toggle lock on big nofurs
  canvas.addEventListener("click", (e) => {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top)  * scaleY;

    if (!Array.isArray(nofurs) || !nofurs.length) return;

    for (const n of nofurs) {
      if (!bigLabels.has(n.label)) continue;
      if (n.flag === "left" || n.flag === "right") continue; // skip small wheels

      const dx   = mouseX - n.center.x;
      const dy   = mouseY - n.center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const radius = n.outerRadius || 100;
      if (dist <= radius + 10) {
        const label = n.label;
        const lock  = lockState[label];

        if (!lock.locked) {
          // Lock: remember which outer node this seeker is connected to *now*
          const idx = computeCurrentOuterIndex(label);
          if (idx !== null) {
            lock.locked     = true;
            lock.outerIndex = idx;
            playSoundSafe(lockSound);
          }
        } else {
          // Unlock: go back to nearest-node behavior
          lock.locked     = false;
          lock.outerIndex = null;
          playSoundSafe(unlockSound);
        }

        // Only toggle one wheel per click
        break;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Override drawNofur so the bridge line respects lockState
  //  - seeker dot position stays fixed by seekerAngles[label]
  //  - if locked, we force the line to connect to the remembered outer node
  // ---------------------------------------------------------------------------
  window.drawNofur = function (
    baseX,
    baseY,
    label,
    rotation = 0,
    scale = 1,
    spinInner = true,
    isLeft = false,
    isRight = false
  ) {
    // local ring coords
    const radiusOuter = 100;
    const radiusInner = 50;

    // === Outer ring ===
    let outerCoords = [];
    for (let i = 0; i < outerOrder.length; i++) {
      const angle = (i / outerOrder.length) * Math.PI * 2 - Math.PI / 2 + rotation;
      const x = Math.cos(angle) * radiusOuter;
      const y = Math.sin(angle) * radiusOuter;
      outerCoords.push({ x, y, num: outerOrder[i] });
    }

    // === Inner ring ===
    let innerCoords = [];
    const innerRot = spinInner ? rotation : 0;
    for (let i = 0; i < innerPairs.length; i++) {
      const aIndex = outerOrder.indexOf(innerPairs[i][0]);
      const bIndex = outerOrder.indexOf(innerPairs[i][1]);
      const angleA =
        (aIndex / outerOrder.length) * Math.PI * 2 - Math.PI / 2 + innerRot;
      const angleB =
        (bIndex / outerOrder.length) * Math.PI * 2 - Math.PI / 2 + innerRot;
      const midAngle = (angleA + angleB) / 2;
      const x = Math.cos(midAngle) * radiusInner;
      const y = Math.sin(midAngle) * radiusInner;
      innerCoords.push({ x, y, num: 14 + i });
    }

    // === Draw the rotating ring stack ===
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.scale(scale, scale);

    drawNode(0, 0, 13, nodeColors[13]);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#888";
    for (let i = 0; i < innerCoords.length; i++) {
      const inner = innerCoords[i];
      const [a, b] = innerPairs[i];
      const leftOuter = outerCoords.find((o) => o.num === a);
      const rightOuter = outerCoords.find((o) => o.num === b);
      if (leftOuter && rightOuter) {
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(leftOuter.x, leftOuter.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(rightOuter.x, rightOuter.y);
        ctx.stroke();
      }
    }

    if (!isLeft && !isRight) {
      for (let i = 0; i < innerCoords.length; i++) {
        for (let j = i + 1; j < innerCoords.length; j++) {
          const a = innerCoords[i];
          const b = innerCoords[j];
          const aOdd = a.num % 2 !== 0;
          const bOdd = b.num % 2 !== 0;

          if (aOdd && bOdd) {
            ctx.strokeStyle = "#FF00FF";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          } else if (!aOdd && !bOdd) {
            ctx.strokeStyle = "#FF0000";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    ctx.strokeStyle = "#001F3F";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#555";
    ctx.beginPath();
    ctx.arc(0, 0, radiusInner + 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#FFA500";
    ctx.beginPath();
    ctx.arc(0, 0, radiusOuter + 10, 0, Math.PI * 2);
    ctx.stroke();

    for (let n of outerCoords) drawNode(n.x, n.y, n.num);
    for (let i = 0; i < innerCoords.length; i++) {
      const n = innerCoords[i];
      const color = i % 2 === 0 ? "#444444" : "#BBBBBB";
      drawNode(n.x, n.y, n.num, color);
    }

    ctx.restore();

    // Label below/above ring
    ctx.fillStyle = "white";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    if (!isLeft && !isRight && (label === "ALPHA" || label === "BETA")) {
      ctx.fillText(label, baseX, baseY - radiusOuter * scale - 25);
    } else {
      ctx.fillText(label, baseX, baseY + radiusOuter * scale + 25);
    }

    // === Dynamic seeker node(s) (bridge node + line) ===
    if (!isLeft && !isRight) {
      const globalOuter = outerCoords.map((o) => ({
        gx: baseX + o.x * scale,
        gy: baseY + o.y * scale,
        num: o.num,
        localIndex: outerCoords.indexOf(o)
      }));

      function drawSeeker(angleOffset) {
        const seekerRadius = (radiusOuter + 45) * scale;
        const seekerX = baseX + Math.cos(angleOffset) * seekerRadius;
        const seekerY = baseY + Math.sin(angleOffset) * seekerRadius;

        let nearest = null;

        // If locked, force bridge to the stored outerIndex
        const lock = lockState[label];
        if (lock && lock.locked && typeof lock.outerIndex === "number") {
          const idx = lock.outerIndex;
          if (idx >= 0 && idx < outerCoords.length) {
            const local = outerCoords[idx];
            nearest = {
              gx: baseX + local.x * scale,
              gy: baseY + local.y * scale,
              num: local.num
            };
          }
        }

        // If not locked (or bad index), fall back to nearest-node behavior
        if (!nearest) {
          let nearestDist = Infinity;
          for (let o of globalOuter) {
            const dx = seekerX - o.gx;
            const dy = seekerY - o.gy;
            const d2 = dx * dx + dy * dy;
            if (d2 < nearestDist) {
              nearestDist = d2;
              nearest = o;
            }
          }
        }

        const matchColor = nearest
          ? nodeColors[nearest.num] || "#ffffff"
          : "#ffffff";

        if (nearest) {
          ctx.strokeStyle = matchColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(seekerX, seekerY);
          ctx.lineTo(nearest.gx, nearest.gy);
          ctx.stroke();
        }

        // Seeker (bridge node) – stays fixed in world-space
        ctx.beginPath();
        ctx.arc(seekerX, seekerY, 8, 0, Math.PI * 2);
        ctx.fillStyle = matchColor;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();

        // record for omega-connection pass
        seekerPositions.push({ label, x: seekerX, y: seekerY, color: matchColor });
      }

      const angles = seekerAngles[label] || [Math.PI * 3 / 4];
      for (let ang of angles) drawSeeker(ang);
    }
  };
})();
