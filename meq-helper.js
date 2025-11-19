// meq-helper.js
// - Clickable bottom control rectangles
// - LAYER UP: decrements current layer (increments activeLayers) + plays up.wav + pop last digit off omniverseAddress
// - TOP LAYER: jump to Layer 1 (activeLayers = pyramidLayers) + plays up.wav + keep only first digit of omniverseAddress
//   (but ignored if already at top)
// - RESET SYSTEM: reset layers/gasket/segment/omniverse/segmentHistory + unlock all nofurs + plays up.wav
// - RETURN HOME: same reset but keep nofur locks + plays up.wav
// - "Nofur Locks" block above Segments, showing mapped node numbers via outerOrder

(function () {
  const canvas = document.getElementById("mequavis");
  if (!canvas) {
    console.warn("meq-helper.js: #mequavis canvas not found.");
    return;
  }

  const BIG_NOFURS = ["ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"];
  const LOCK_CONTAINER_ID = "nofurLockStatus";

  // -----------------------------------------------------------
  // up.wav (30% volume)
  // -----------------------------------------------------------
  const upSound = new Audio("up.wav");
  upSound.volume = 0.3;

  function playUpSoundSafe() {
    try {
      upSound.currentTime = 0;
      upSound.play().catch(() => {});
    } catch (err) {
      console.warn("up.wav play failed:", err);
    }
  }

  // -----------------------------------------------------------
  // 1) CLICK HANDLING FOR BOTTOM CONTROL RECTANGLES
  // -----------------------------------------------------------

  function getControlRects() {
    const centerX = center.x;
    const centerY = center.y + 245;
    const controlOffsetX = 90;
    const controlOffsetY = 100;

    return [
      {
        id: "reset",
        label: "RESET SYSTEM",
        x: centerX - controlOffsetX - 25,
        y: centerY - controlOffsetY,
        w: 50,
        h: 30
      },
      {
        id: "return_home",
        label: "RETURN HOME",
        x: centerX + controlOffsetX - 25,
        y: centerY - controlOffsetY,
        w: 50,
        h: 30
      },
      {
        id: "layer_up",
        label: "LAYER UP",
        x: centerX - controlOffsetX - 50,
        y: centerY + controlOffsetY,
        w: 100,
        h: 20
      },
      {
        id: "top_layer",
        label: "TOP LAYER",
        x: centerX + controlOffsetX - 50,
        y: centerY + controlOffsetY,
        w: 100,
        h: 20
      }
    ];
  }

  function canvasToInternalCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // --- reset helpers for globals (NO window.* writes) -----------------------
  function resetCoreState({ resetLocks }) {
    // layers: force to top (Layer 1)
    if (typeof pyramidLayers !== "undefined" &&
        typeof activeLayers !== "undefined") {
      activeLayers = pyramidLayers;
    }

    // segment / gasket / power
    if (typeof segment !== "undefined")      segment = 1;
    if (typeof gasket !== "undefined")       gasket = 1;
    if (typeof gasketPower !== "undefined")  gasketPower = 1;

    // omniverse address
    if (typeof omniverseAddress !== "undefined") {
      omniverseAddress = "";
    }

    // segment history
    if (typeof segmentHistory !== "undefined" &&
        Array.isArray(segmentHistory)) {
      segmentHistory.length = 0;
    }

    if (resetLocks) {
      const container = detectLockContainer();
      if (container) {
        if (typeof container.resetAllLocks === "function") {
          container.resetAllLocks();
        } else if (typeof container.unlockAll === "function") {
          container.unlockAll();
        } else {
          BIG_NOFURS.forEach((label) => {
            let lockObj = null;
            if (Object.prototype.hasOwnProperty.call(container, label)) {
              lockObj = container[label];
            } else if (container.locks && container.locks[label]) {
              lockObj = container.locks[label];
            }

            if (lockObj && typeof lockObj === "object") {
              if ("locked" in lockObj)     lockObj.locked = false;
              if ("nodeIndex" in lockObj)  lockObj.nodeIndex = -1;
              if ("index" in lockObj)      lockObj.index = -1;
              if ("nodeNum" in lockObj)    lockObj.nodeNum = 0;
              if ("num" in lockObj)        lockObj.num = 0;
            }
          });
        }
      }
    }

    if (typeof window.updateSegmentLog === "function") {
      window.updateSegmentLog();
    } else {
      renderLockStatus();
    }
  }

  function handleCanvasClick(e) {
    const { x, y } = canvasToInternalCoords(e);
    const rects = getControlRects();

    for (const box of rects) {
      if (
        x >= box.x &&
        x <= box.x + box.w &&
        y >= box.y &&
        y <= box.y + box.h
      ) {
        console.log("[MEQ helper] Control box clicked:", box.id, box.label);

        // ---- LAYER UP ----
        if (box.id === "layer_up") {
          if (
            typeof activeLayers !== "undefined" &&
            typeof pyramidLayers !== "undefined"
          ) {
            if (activeLayers < pyramidLayers) {
              // pop last digit off omniverseAddress
              if (typeof omniverseAddress !== "undefined") {
                omniverseAddress = String(omniverseAddress || "");
                if (omniverseAddress.length > 0) {
                  omniverseAddress = omniverseAddress.slice(0, -1);
                }
              }

              activeLayers++;
              console.log(
                "[MEQ helper] LAYER UP → activeLayers now:",
                activeLayers,
                "omniverseAddress:",
                omniverseAddress
              );
              playUpSoundSafe();
            } else {
              console.log(
                "[MEQ helper] LAYER UP ignored – already at top (currentLayer = 1)"
              );
            }
          } else {
            console.warn(
              "[MEQ helper] LAYER UP: activeLayers / pyramidLayers not found."
            );
          }
        }

        // ---- TOP LAYER (Layer 1) + sound, but ignore if already top ----
        if (box.id === "top_layer") {
          if (
            typeof activeLayers !== "undefined" &&
            typeof pyramidLayers !== "undefined"
          ) {
            if (activeLayers < pyramidLayers) {
              activeLayers = pyramidLayers;

              // keep only first digit of omniverseAddress
              if (typeof omniverseAddress !== "undefined") {
                omniverseAddress = String(omniverseAddress || "");
                if (omniverseAddress.length > 1) {
                  omniverseAddress = omniverseAddress.charAt(0);
                }
              }

              console.log(
                "[MEQ helper] TOP LAYER → currentLayer = 1 (activeLayers =",
                activeLayers,
                "), omniverseAddress:",
                omniverseAddress
              );
              playUpSoundSafe();
            } else {
              console.log(
                "[MEQ helper] TOP LAYER ignored – already at top (currentLayer = 1)"
              );
            }
          } else {
            console.warn(
              "[MEQ helper] TOP LAYER: activeLayers / pyramidLayers not found."
            );
          }
        }

        // ---- RESET SYSTEM: full reset + unlock locks + sound ----
        if (box.id === "reset") {
          console.log("[MEQ helper] RESET SYSTEM → full reset + unlock locks");
          resetCoreState({ resetLocks: true });
          playUpSoundSafe();
        }

        // ---- RETURN HOME: reset core, keep locks + sound ----
        if (box.id === "return_home") {
          console.log(
            "[MEQ helper] RETURN HOME → reset core state, keep nofur locks"
          );
          resetCoreState({ resetLocks: false });
          playUpSoundSafe();
        }

        break;
      }
    }

    setTimeout(renderLockStatus, 0);
  }

  canvas.addEventListener("click", handleCanvasClick);

  // -----------------------------------------------------------
  // 2) LOCK CONTAINER DETECTION
  // -----------------------------------------------------------

  let cachedLockContainer = null;

  function looksLikeLockContainer(obj) {
    if (!obj || typeof obj !== "object") return false;
    return BIG_NOFURS.every((key) =>
      Object.prototype.hasOwnProperty.call(obj, key)
    );
  }

  function detectLockContainer() {
    if (cachedLockContainer && typeof cachedLockContainer === "object") {
      return cachedLockContainer;
    }

    const obvious = [
      "NOFUR_LOCKS",
      "NOFUR_LOCK_STATE",
      "NOFUR_LOCK",
      "MEQ_NOFUR_LOCKS"
    ];

    for (const name of obvious) {
      if (window[name] && looksLikeLockContainer(window[name])) {
        cachedLockContainer = window[name];
        console.log("[MEQ helper] Using lock container:", name);
        return cachedLockContainer;
      }
    }

    const globals = Object.getOwnPropertyNames(window);
    for (const name of globals) {
      const val = window[name];
      if (!val || typeof val !== "object") continue;

      if (looksLikeLockContainer(val)) {
        cachedLockContainer = val;
        console.log("[MEQ helper] Auto-detected lock container:", name);
        return cachedLockContainer;
      }
      if (val.locks && typeof val.locks === "object" && looksLikeLockContainer(val.locks)) {
        cachedLockContainer = val.locks;
        console.log("[MEQ helper] Auto-detected lock container:", name + ".locks");
        return cachedLockContainer;
      }
      if (val.state && typeof val.state === "object" && looksLikeLockContainer(val.state)) {
        cachedLockContainer = val.state;
        console.log("[MEQ helper] Auto-detected lock container:", name + ".state");
        return cachedLockContainer;
      }
    }

    return null;
  }

  // -----------------------------------------------------------
  // 3) NODE INDEX → OUTER RING NUMBER (using outerOrder)
  // -----------------------------------------------------------

  function remapIndexToOuterNode(idx) {
    if (typeof idx !== "number" || !Number.isFinite(idx)) {
      return 0;
    }
    if (idx < 0) return 0; // unlocked

    if (typeof outerOrder !== "undefined" && Array.isArray(outerOrder)) {
      if (idx >= 0 && idx < outerOrder.length) {
        return outerOrder[idx];
      }
    }
    return idx;
  }

  function extractNodeIndexFromLock(lockObj) {
    if (!lockObj || typeof lockObj !== "object") return 0;

    if ("locked" in lockObj && !lockObj.locked) {
      return -1;
    }

    const preferredKeys = [
      "nodeIndex",
      "index",
      "nodeNum",
      "node",
      "lockedNode",
      "lockedIndex",
      "targetNode",
      "targetIndex",
      "num",
      "id"
    ];

    for (const key of preferredKeys) {
      if (key in lockObj) {
        const val = lockObj[key];
        if (typeof val === "number" && Number.isFinite(val)) return val;
        if (typeof val === "string" && /^\d+$/.test(val)) return parseInt(val, 10);
      }
    }

    for (const value of Object.values(lockObj)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      } else if (typeof value === "string" && /^\d+$/.test(value)) {
        return parseInt(value, 10);
      } else if (value && typeof value === "object") {
        const nested = extractNodeIndexFromLock(value);
        if (nested !== 0) return nested;
      }
    }

    return 0;
  }

  function getLockedNodeFor(label) {
    const container = detectLockContainer();
    if (!container) return 0;

    let lockObj = null;

    if (Object.prototype.hasOwnProperty.call(container, label)) {
      lockObj = container[label];
    } else if (container.locks && container.locks[label]) {
      lockObj = container.locks[label];
    } else if (typeof container.getLock === "function") {
      lockObj = container.getLock(label);
    }

    if (!lockObj) return 0;

    const rawIndex = extractNodeIndexFromLock(lockObj);
    if (rawIndex < 0) return 0;

    return remapIndexToOuterNode(rawIndex);
  }

  // -----------------------------------------------------------
  // 4) RENDER "NOFUR LOCKS"
  // -----------------------------------------------------------

  function renderLockStatus() {
    const panel = document.getElementById("segmentLog");
    if (!panel) return;

    let lockDiv = document.getElementById(LOCK_CONTAINER_ID);
    if (!lockDiv) {
      lockDiv = document.createElement("div");
      lockDiv.id = LOCK_CONTAINER_ID;
      lockDiv.style.marginBottom = "6px";
      lockDiv.style.borderBottom = "1px solid #222";
      lockDiv.style.paddingBottom = "4px";

      if (panel.firstChild) {
        panel.insertBefore(lockDiv, panel.firstChild);
      } else {
        panel.appendChild(lockDiv);
      }
    }

    const rows = BIG_NOFURS.map((name) => {
      const node = getLockedNodeFor(name);
      return `<div>${name}: ${node}</div>`;
    }).join("");

    lockDiv.innerHTML = `
      <h2 style="font-size:12px;margin-bottom:2px;color:#0ff;">Nofur Locks</h2>
      ${rows}
    `;
  }

  // -----------------------------------------------------------
  // 5) HOOK INTO updateSegmentLog
  // -----------------------------------------------------------

  if (typeof window.updateSegmentLog === "function") {
    const originalUpdate = window.updateSegmentLog;
    window.updateSegmentLog = function () {
      originalUpdate();
      renderLockStatus();
    };
  } else {
    window.addEventListener("load", () => {
      if (typeof window.updateSegmentLog === "function") {
        const originalUpdate = window.updateSegmentLog;
        window.updateSegmentLog = function () {
          originalUpdate();
          renderLockStatus();
        };
      }
      renderLockStatus();
    });
  }

  renderLockStatus();
  window.refreshNofurLocks = renderLockStatus;
})();
