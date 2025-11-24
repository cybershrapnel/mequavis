/* meq-galaxy-maker.js (v15)
   Drop this AFTER your UI loads.

   v15:
   ✅ Load Skybox now uploads catalog, shows progress, and opens returned skyboxUrl IN the skybox iframe panel.
   ✅ Add "Download all as zip" button beside Load Skybox.
   ✅ Zip includes JSON, catalog txt, original galaxy, final zoom, selected crop,
      and final boxed image with green rectangle.
*/

(() => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const rand  = (a=0, b=1) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp  = (a, b, t) => a + (b - a) * t;

  function gauss(mean=0, std=1) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2*Math.PI*v);
    return mean + z * std;
  }

  function getAccent() {
    try {
      const root = getComputedStyle(document.documentElement);
      const v = root.getPropertyValue("--meq-accent").trim();
      return v || "#0ff";
    } catch {
      return "#0ff";
    }
  }

  function fmtNum(n) {
    try { return Math.round(n).toLocaleString(); }
    catch { return String(Math.round(n)); }
  }

  function downloadDataURL(dataURL, filename="download.png") {
    if (!dataURL) return;
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 0);
  }

  function downloadJSON(obj, filename="sector.json") {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function downloadText(txt, filename="starcatalog.txt") {
    const blob = new Blob([txt], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  async function copyTextToClipboard(txt) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(txt);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {}
    return false;
  }

  function safeFileStem(name) {
    const stem = (name || "galactic-sector")
      .toString()
      .trim()
      .replace(/[^a-z0-9_\-]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    return stem || "galactic-sector";
  }

  function dataURLToBlob(dataURL) {
    const parts = dataURL.split(",");
    const meta = parts[0];
    const base64 = parts[1];
    const mime = (meta.match(/data:([^;]+);base64/i) || [])[1] || "application/octet-stream";
    const binStr = atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function ensureJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => resolve(window.JSZip);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  // -----------------------------
  // Skybox panel opener (uses your meq-skybox panel)
  // -----------------------------
  function findSkyboxToggleButton() {
    const byAction = document.querySelector('.action-btn[data-action="map-ui"]');
    if (byAction) return byAction;

    const candidates = Array.from(
      document.querySelectorAll('button, .action-btn, input[type="button"], input[type="submit"]')
    );
    for (const el of candidates) {
      const txt = (el.textContent || el.value || "").trim().toUpperCase();
      if (txt === "SHOW DIGITAL SKYBOX" || txt === "HIDE DIGITAL SKYBOX" || txt === "SHOW MAP UI") {
        return el;
      }
    }
    return null;
  }

  function openSkyboxInPanel(url) {
    const panel = document.getElementById("skyboxPanel");
    const iframe = document.getElementById("skyboxFrame");
    const toggleBtn = findSkyboxToggleButton();

    if (panel && panel.style.display !== "block") {
      // Prefer clicking the toggle button so its label stays in sync
      if (toggleBtn) {
        try { toggleBtn.click(); } catch(e) {}
      } else {
        panel.style.display = "block";
      }
    }

    if (iframe) {
      iframe.src = url;
    } else {
      // last resort: same-tab navigation
      window.location.href = url;
    }
  }

  // Upload endpoint for Load Skybox
  const STARMAP_UPLOAD_URL = "https://xtdevelopment.net/chat-proxy/starmaps/starmaps.php";

  // -----------------------------
  // Insert button in rightTop
  // -----------------------------
  function insertMakeGalaxyButton() {
    const rightTop = document.getElementById("rightTop");
    if (!rightTop) return null;

    const fullChatBtn = [...rightTop.querySelectorAll(".action-btn")]
      .find(b =>
        (b.dataset.action || "").toLowerCase() === "full-chat" ||
        (b.textContent || "").toUpperCase().includes("FULL CHAT")
      );

    const btn = document.createElement("button");
    btn.className = "action-btn";
    btn.id = "makeGalaxyBtn";
    btn.dataset.action = "make-galaxy";
    btn.textContent = "Make New Galaxy";

    if (fullChatBtn) rightTop.insertBefore(btn, fullChatBtn);
    else rightTop.appendChild(btn);

    return btn;
  }

  // -----------------------------
  // Popup + Canvas + Footer
  // -----------------------------
  let popup, header, closeBtn, canvas, ctx, footer, consolePre, consoleToolbar;
  let ftType, ftCount, ftActionBtn;
  let isOpen = false;

  const DEFAULT_POPUP = { w: 760, h: 520, left: 120, top: 90 };

  // View / zoom state
  let zoomLevel = 0;
  const MAX_LEVELS = 7; // includes ultra-final
  let viewStack = [];

  // Representation scaling
  const ROOT_STARS_PER_DOT = 100000; // outer galaxy: symbolic scale
  let starsPerDot = ROOT_STARS_PER_DOT;

  // Performance dot targets for intermediate zooms
  const DOT_IDEAL = 150000;
  const DOT_MIN   = 80000;
  const DOT_MAX   = 220000;

  // When selection is <= this, next zoom becomes PRE-FINAL (starsPerDot=1)
  const FINAL_MAX_STARS = 40000;

  // Ultra-final flag
  let ultraFinal = false;

  // Current dots on screen
  let currentStars = [];
  let currentGalaxyName = "Unknown";

  // Selection state
  let selecting = false;
  let selStart = null;
  let selEnd = null;
  let selectionCanvasRect = null;
  let selectedDotsRaw = 0;          // dots inside box
  let selectedStarsEstimated = 0;   // dots * starsPerDot (unless starsPerDot=1)

  // Image captures
  let rootImageURL = null;
  let finalZoomImageURL = null;        // ultra-final before box
  let finalBoxedImageURL = null;       // ultra-final with green box (optional)
  let finalSelectedCropURL = null;     // cropped selection, no border

  // Last build outputs
  let lastSectorJSON = null;
  let lastStarCatalogText = null;

  function ensurePopup() {
    if (popup) return popup;

    const accent = getAccent();

    popup = document.createElement("div");
    popup.id = "galaxyPopup";
    popup.style.cssText = `
      position: fixed;
      left: ${DEFAULT_POPUP.left}px;
      top: ${DEFAULT_POPUP.top}px;
      width: ${DEFAULT_POPUP.w}px;
      height: ${DEFAULT_POPUP.h}px;
      background: rgba(0,0,0,0.96);
      border: 2px solid ${accent};
      border-radius: 10px;
      z-index: 9999;
      display: none;
      box-shadow: 0 0 18px rgba(0,0,0,0.9);
      user-select: none;
      overflow: hidden;
      flex-direction: column;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    `;

    header = document.createElement("div");
    header.id = "galaxyPopupHeader";
    header.style.cssText = `
      position: relative;
      height: 34px;
      line-height: 34px;
      padding: 0 10px;
      cursor: move;
      font-family: monospace;
      font-size: 12px;
      font-weight: bold;
      color: ${accent};
      background: #050505;
      border-bottom: 1px solid ${accent};
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 0 0 auto;
    `;

    const titleSpan = document.createElement("span");
    titleSpan.textContent = "GALAXY GENERATOR";

    closeBtn = document.createElement("button");
    closeBtn.textContent = "X";
    closeBtn.style.cssText = `
      margin-left: 8px;
      padding: 0 8px;
      height: 22px;
      line-height: 20px;
      font-family: monospace;
      font-size: 12px;
      font-weight: bold;
      color: ${accent};
      background: #111;
      border: 1px solid ${accent};
      border-radius: 4px;
      cursor: pointer;
    `;
    closeBtn.addEventListener("click", () => togglePopup(false));

    header.appendChild(titleSpan);
    header.appendChild(closeBtn);

    canvas = document.createElement("canvas");
    canvas.id = "galaxyCanvas";
    canvas.width = DEFAULT_POPUP.w;
    canvas.height = DEFAULT_POPUP.h - 34 - 28;
    canvas.style.cssText = `
      display: block;
      width: 100%;
      height: 100%;
      background: black;
      flex: 1 1 auto;
      cursor: crosshair;
    `;
    ctx = canvas.getContext("2d");

    footer = document.createElement("div");
    footer.id = "galaxyPopupFooter";
    footer.style.cssText = `
      height: 28px;
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 0 8px;
      background: #050505;
      border-top: 1px solid ${accent};
      font-family: monospace;
      font-size: 12px;
      color: ${accent};
    `;

    ftType = document.createElement("div");
    ftType.id = "galaxyTypeLabel";
    ftType.style.cssText = `text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`;
    ftType.textContent = "Galaxy Type: —";

    ftCount = document.createElement("div");
    ftCount.id = "galaxySelectionCount";
    ftCount.style.cssText = `text-align:center; white-space:nowrap;`;
    ftCount.textContent = "Stars in Box: 0";

    ftActionBtn = document.createElement("button");
    ftActionBtn.id = "galaxyActionBtn";
    ftActionBtn.textContent = "Zoom In";
    ftActionBtn.style.cssText = `
      padding: 4px 10px;
      font-family: monospace;
      font-size: 12px;
      font-weight: bold;
      color: ${accent};
      background: #111;
      border: 1px solid ${accent};
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 0 6px rgba(0,0,0,0.7);
    `;
    ftActionBtn.addEventListener("click", onFooterAction);

    footer.appendChild(ftType);
    footer.appendChild(ftCount);
    footer.appendChild(ftActionBtn);

    // Console toolbar (hidden until build)
    consoleToolbar = document.createElement("div");
    consoleToolbar.id = "galaxyConsoleToolbar";
    consoleToolbar.style.cssText = `
      display: none;
      gap: 8px;
      padding: 6px 8px;
      background: rgba(0,0,0,0.85);
      border-bottom: 1px solid ${accent};
      font-family: monospace;
      flex: 0 0 auto;
      align-items: center;
      flex-wrap: wrap;
    `;

    const mkToolBtn = (id, label) => {
      const b = document.createElement("button");
      b.id = id;
      b.textContent = label;
      b.style.cssText = `
        padding: 4px 8px;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        color: ${accent};
        background: #111;
        border: 1px solid ${accent};
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
      `;
      return b;
    };

    const btnCopyJSON    = mkToolBtn("copySectorJsonBtn", "Copy JSON");
    const btnDLJSON      = mkToolBtn("dlSectorJsonBtn", "Download JSON");
    const btnCopyCatalog = mkToolBtn("copyStarCatalogBtn", "Copy Catalog");
    const btnDLCatalog   = mkToolBtn("dlStarCatalogBtn", "Download Catalog");
    const btnDLRoot      = mkToolBtn("dlRootImgBtn", "Download Original Galaxy");
    const btnDLFinal     = mkToolBtn("dlFinalImgBtn", "Download Final Zoom");
    const btnDLBoxed     = mkToolBtn("dlBoxedImgBtn", "Download Selected Area");
const btnLoadSkybox  = mkToolBtn("loadSkyboxBtn", "Load & View Your Skybox");

// make it special + green + push to far right
btnLoadSkybox.classList.add("skybox-special");
btnLoadSkybox.style.marginLeft = "auto";                 // shove to right in flex row
btnLoadSkybox.style.borderColor = "#00ff00";
btnLoadSkybox.style.color = "#00ff00";
btnLoadSkybox.style.background = "#061a06";
btnLoadSkybox.style.boxShadow = "0 0 8px rgba(0,255,0,0.6)";

    const btnZipAll      = mkToolBtn("zipAllBtn", "Download all as zip"); // ✅ new

    consoleToolbar.appendChild(btnCopyJSON);
    consoleToolbar.appendChild(btnDLJSON);
    consoleToolbar.appendChild(btnCopyCatalog);
    consoleToolbar.appendChild(btnDLCatalog);
    consoleToolbar.appendChild(btnDLRoot);
    consoleToolbar.appendChild(btnDLFinal);
    consoleToolbar.appendChild(btnDLBoxed);

    consoleToolbar.appendChild(btnZipAll);

    consoleToolbar.appendChild(btnLoadSkybox);

    consolePre = document.createElement("pre");
    consolePre.id = "galaxyConsolePre";
    consolePre.style.cssText = `
      display: none;
      flex: 1 1 auto;
      margin: 0;
      padding: 10px;
      overflow: auto;
      background: rgba(0,0,0,0.7);
      color: #00ff00;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.35;
      white-space: pre-wrap;
      user-select: text;
    `;

    popup.appendChild(header);
    popup.appendChild(canvas);
    popup.appendChild(footer);
    popup.appendChild(consoleToolbar);
    popup.appendChild(consolePre);

    document.body.appendChild(popup);

    makeDraggable(popup, header);
    wireSelectionEvents();

    return popup;
  }

  function updateFooterAccent() {
    const accent = getAccent();
    popup.style.borderColor = accent;
    header.style.color = accent;
    header.style.borderBottomColor = accent;
    footer.style.color = accent;
    footer.style.borderTopColor = accent;

    closeBtn.style.borderColor = accent;
    closeBtn.style.color = accent;
    ftActionBtn.style.borderColor = accent;
    ftActionBtn.style.color = accent;

consoleToolbar.querySelectorAll("button").forEach(b => {
  if (b.classList.contains("skybox-special")) return; // leave it green
  b.style.borderColor = accent;
  b.style.color = accent;
});

  }

  function updateFooterMode() {
    ftActionBtn.textContent = ultraFinal ? "Build Galactic Sector" : "Zoom In";
  }

  function togglePopup(forceOpen = null) {
    ensurePopup();

    const wantOpen = forceOpen === null ? !isOpen : !!forceOpen;
    isOpen = wantOpen;

    popup.style.display = isOpen ? "flex" : "none";
    if (isOpen) {
      updateFooterAccent();
      generateRootGalaxy();
    }
  }

  // -----------------------------
  // Footer action (Zoom / Build)
  // -----------------------------
  function onFooterAction() {
    if (!selectionCanvasRect || selectionCanvasRect.w < 6 || selectionCanvasRect.h < 6) return;

    if (ultraFinal) {
      const finalStars = getStarsInSelection(selectionCanvasRect, currentStars);
      const jsonObj = buildSectorJSON(finalStars, selectionCanvasRect);
      lastSectorJSON = jsonObj;

      lastStarCatalogText = buildStarCatalogTXT(jsonObj);

      showConsole(jsonObj, lastStarCatalogText);
      return;
    }

    const selStars = selectedStarsEstimated;

    if (starsPerDot === 1 && !ultraFinal) {
      const seeds = getStarsInSelection(selectionCanvasRect, currentStars);
      const targetN = Math.max(1, Math.floor(selStars));

      viewStack.push({
        zoomLevel,
        galaxyName: currentGalaxyName,
        stars: currentStars,
        starsPerDot,
        ultraFinal
      });

      zoomLevel++;
      ultraFinal = true;
      starsPerDot = 1;
      currentStars = generateNormalStarfieldFromSeeds(
        seeds,
        selectionCanvasRect,
        targetN,
        canvas.width,
        canvas.height
      );

      drawView(currentStars, { keepNebula: true });

      finalZoomImageURL = canvas.toDataURL("image/png");
      finalBoxedImageURL = null;
      finalSelectedCropURL = null;

      clearSelection(true);
      updateFooterMode();
      updateCountFooter();
      return;
    }

    const shouldGoPreFinal =
      selStars <= FINAL_MAX_STARS ||
      zoomLevel >= (MAX_LEVELS - 2);

    const next = buildNextZoomStars(selectionCanvasRect, selStars, shouldGoPreFinal);

    viewStack.push({
      zoomLevel,
      galaxyName: currentGalaxyName,
      stars: currentStars,
      starsPerDot,
      ultraFinal
      });

    zoomLevel++;
    ultraFinal = false;
    currentStars = next.stars;
    starsPerDot  = next.starsPerDot;

    drawView(currentStars, { keepNebula: true });

    clearSelection(true);
    updateFooterMode();
    updateCountFooter();
  }

  // -----------------------------
  // Console view + buttons
  // -----------------------------
  function showConsole(jsonObj, catalogTxt) {
    canvas.style.display = "none";
    footer.style.display = "none";

    // background prefers cropped selection
    if (finalSelectedCropURL) {
      popup.style.backgroundImage = `url(${finalSelectedCropURL})`;
    } else if (finalBoxedImageURL) {
      popup.style.backgroundImage = `url(${finalBoxedImageURL})`;
    } else if (finalZoomImageURL) {
      popup.style.backgroundImage = `url(${finalZoomImageURL})`;
    } else {
      popup.style.backgroundImage = "none";
      popup.style.backgroundColor = "rgba(0,0,0,0.96)";
    }

    consoleToolbar.style.display = "flex";
    consolePre.style.display = "block";

    const jsonText = JSON.stringify(jsonObj, null, 2);
    consolePre.textContent = jsonText;

    const btnCopyJSON     = document.getElementById("copySectorJsonBtn");
    const btnDLJSON       = document.getElementById("dlSectorJsonBtn");
    const btnCopyCatalog  = document.getElementById("copyStarCatalogBtn");
    const btnDLCatalog    = document.getElementById("dlStarCatalogBtn");
    const btnDLRoot       = document.getElementById("dlRootImgBtn");
    const btnDLFinal      = document.getElementById("dlFinalImgBtn");
    const btnDLBoxed      = document.getElementById("dlBoxedImgBtn");
    const btnLoadSkybox   = document.getElementById("loadSkyboxBtn");
    const btnZipAll       = document.getElementById("zipAllBtn");

    if (btnCopyJSON) btnCopyJSON.onclick = async () => { await copyTextToClipboard(jsonText); };
    if (btnDLJSON)   btnDLJSON.onclick   = () => downloadJSON(jsonObj, "galactic-sector.json");

    if (btnCopyCatalog) btnCopyCatalog.onclick = async () => {
      await copyTextToClipboard(catalogTxt || "");
    };
    if (btnDLCatalog) btnDLCatalog.onclick = () => {
      downloadText(catalogTxt || "", "starcatalog.txt");
    };

    if (btnDLRoot)  btnDLRoot.onclick  = () => downloadDataURL(rootImageURL, "original-galaxy.png");
    if (btnDLFinal) btnDLFinal.onclick = () => downloadDataURL(finalZoomImageURL, "final-zoom.png");
    if (btnDLBoxed) btnDLBoxed.onclick = () =>
      downloadDataURL(finalSelectedCropURL || finalZoomImageURL, "final-zoom-selected.png");

    // ✅ Load Skybox upload flow
    if (btnLoadSkybox) {
      btnLoadSkybox.onclick = () => beginSkyboxUploadFlow(jsonObj, catalogTxt);
    }

    // ✅ ZIP download
    if (btnZipAll) {
      btnZipAll.onclick = () => downloadAllAsZip(jsonObj, catalogTxt);
    }
  }

  function beginSkyboxUploadFlow(jsonObj, catalogTxt) {
    const accent = getAccent();

    // Replace consolePre with form UI
    consolePre.style.display = "block";
    consolePre.innerHTML = ""; // clear

    const wrap = document.createElement("div");
    wrap.style.cssText = `
      font-family: monospace;
      font-size: 12px;
      color: ${accent};
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 4px;
    `;

    const label = document.createElement("div");
    label.textContent = "Galactic Sector Title:";

    const ta = document.createElement("textarea");
    ta.id = "skyboxTitleInput";
    ta.rows = 2;
    ta.placeholder = "Enter sector title...";
    ta.style.cssText = `
      width: 100%;
      resize: vertical;
      background: #050505;
      color: ${accent};
      border: 1px solid ${accent};
      padding: 6px;
      border-radius: 6px;
      outline: none;
    `;

    const proceed = document.createElement("button");
    proceed.textContent = "Proceed Upload";
    proceed.style.cssText = `
      width: fit-content;
      padding: 6px 10px;
      background: #111;
      color: ${accent};
      border: 1px solid ${accent};
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
    `;

    const barWrap = document.createElement("div");
    barWrap.style.cssText = `
      width: 100%;
      height: 12px;
      background: #111;
      border: 1px solid ${accent};
      border-radius: 999px;
      overflow: hidden;
      margin-top: 4px;
    `;

    const bar = document.createElement("div");
    bar.id = "skyboxUploadBar";
    bar.style.cssText = `
      height: 100%;
      width: 0%;
      background: ${accent};
      transition: width 0.1s linear;
    `;
    barWrap.appendChild(bar);

    const status = document.createElement("div");
    status.id = "skyboxUploadStatus";
    status.textContent = "Ready.";

    wrap.appendChild(label);
    wrap.appendChild(ta);
    wrap.appendChild(proceed);
    wrap.appendChild(barWrap);
    wrap.appendChild(status);

    consolePre.appendChild(wrap);

    proceed.onclick = () => {
      const title = ta.value.trim() || "Galactic Sector";
      status.textContent = "Uploading starcatalog.txt...";
      proceed.disabled = true;

      const stem = safeFileStem(title);
      const blob = new Blob([catalogTxt || ""], { type: "text/plain;charset=utf-8" });

      const fd = new FormData();
      fd.append("title", title);
      fd.append("file", blob, stem + ".txt");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", STARMAP_UPLOAD_URL, true);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        bar.style.width = pct + "%";
        status.textContent = "Uploading... " + pct + "%";
      };

      xhr.onload = () => {
        proceed.disabled = false;
        try {
          const resp = JSON.parse(xhr.responseText || "{}");
          if (!resp.ok || !resp.skyboxUrl) {
            status.textContent = "Upload failed: " + (resp.error || "Unknown error");
            return;
          }

          bar.style.width = "100%";
          status.textContent = "Uploaded. Opening Skybox...";

          // wait a couple seconds as requested
          setTimeout(() => {
            openSkyboxInPanel(resp.skyboxUrl);
            status.textContent = "Skybox opened in panel.";
          }, 2000);

        } catch (err) {
          status.textContent = "Upload response parse error.";
        }
      };

      xhr.onerror = () => {
        proceed.disabled = false;
        status.textContent = "Upload failed (network error).";
      };

      xhr.send(fd);
    };
  }

  async function downloadAllAsZip(jsonObj, catalogTxt) {
    const accent = getAccent();
    const btnZipAll = document.getElementById("zipAllBtn");
    const oldLabel = btnZipAll ? btnZipAll.textContent : "";

    try {
      if (btnZipAll) btnZipAll.textContent = "Zipping...";

      const JSZip = await ensureJSZip();
      const zip = new JSZip();

      // Add JSON and catalog
      zip.file("galactic-sector.json", JSON.stringify(jsonObj, null, 2));
      zip.file("starcatalog.txt", catalogTxt || "");

      // Images (data URLs)
      if (rootImageURL) {
        zip.file("original-galaxy.png", dataURLToBlob(rootImageURL));
      }
      if (finalZoomImageURL) {
        zip.file("final-zoom.png", dataURLToBlob(finalZoomImageURL));
      }
      if (finalSelectedCropURL) {
        zip.file("final-zoom-selected.png", dataURLToBlob(finalSelectedCropURL));
      }
      if (finalBoxedImageURL) {
        zip.file("final-zoom-boxed.png", dataURLToBlob(finalBoxedImageURL));
      }

      const blob = await zip.generateAsync({ type: "blob" });

      const nameStem = safeFileStem(jsonObj.galaxyType || "galactic-sector");
      downloadBlob(blob, nameStem + "-bundle.zip");

      if (btnZipAll) btnZipAll.textContent = oldLabel || "Download all as zip";
    } catch (e) {
      console.error("ZIP failed:", e);
      if (btnZipAll) btnZipAll.textContent = (oldLabel || "Download all as zip") + " (failed)";
      setTimeout(() => {
        if (btnZipAll) btnZipAll.textContent = oldLabel || "Download all as zip";
      }, 1500);

      // Also print to consolePre for visibility
      if (consolePre && consolePre.style.display === "block") {
        const msg = document.createElement("div");
        msg.style.color = accent;
        msg.textContent = "ZIP failed: " + (e.message || e);
        consolePre.appendChild(msg);
      }
    }
  }

  // -----------------------------
  // Draggable popup
  // -----------------------------
  function makeDraggable(target, handle) {
    let dragging = false;
    let startX = 0, startY = 0;
    let origX = 0, origY = 0;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = target.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;

      target.style.zIndex = String(9999);
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newX = origX + dx;
      const newY = origY + dy;

      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 60;

      target.style.left = clamp(newX, -40, maxX) + "px";
      target.style.top  = clamp(newY, -20, maxY) + "px";
    });

    window.addEventListener("mouseup", () => dragging = false);
  }

  // -----------------------------
  // Selection / green box
  // -----------------------------
  function wireSelectionEvents() {
    canvas.addEventListener("mousedown", (e) => {
      if (!isOpen) return;
      selecting = true;
      selStart = clientToCanvas(e);
      selEnd = { ...selStart };
      selectionCanvasRect = null;
      selectedDotsRaw = 0;
      selectedStarsEstimated = 0;
      updateCountFooter();
      redrawWithSelection();
      e.preventDefault();
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!isOpen || !selecting) return;
      selEnd = clientToCanvas(e);
      redrawWithSelection();
      e.preventDefault();
    });

    window.addEventListener("mouseup", (e) => {
      if (!isOpen || !selecting) return;
      selecting = false;
      selEnd = clientToCanvas(e);

      selectionCanvasRect = normalizeRect(selStart, selEnd);

      selectedDotsRaw = countDotsInRect(selectionCanvasRect, currentStars);
      selectedStarsEstimated = selectedDotsRaw * starsPerDot;

      updateCountFooter();
      redrawWithSelection();

      // ultra-final: capture BOTH boxed and cropped
      if (ultraFinal && selectionCanvasRect && selectionCanvasRect.w > 6 && selectionCanvasRect.h > 6) {
        const W = canvas.width;
        const H = canvas.height;
        const r = selectionCanvasRect;

        // boxed (current canvas includes green border)
        finalBoxedImageURL = canvas.toDataURL("image/png");

        // cropped from base view WITHOUT border
        if (lastViewImage) {
          const tmp = document.createElement("canvas");
          tmp.width = W;
          tmp.height = H;
          const tctx = tmp.getContext("2d");
          tctx.putImageData(lastViewImage, 0, 0);

          const crop = document.createElement("canvas");
          crop.width = Math.max(1, Math.round(r.w));
          crop.height = Math.max(1, Math.round(r.h));
          const cctx = crop.getContext("2d");

          cctx.drawImage(
            tmp,
            r.x, r.y, r.w, r.h,
            0, 0, crop.width, crop.height
          );

          finalSelectedCropURL = crop.toDataURL("image/png");
        } else {
          finalSelectedCropURL = null;
        }
      }
    });
  }

  function clearSelection(redraw=false) {
    selecting = false;
    selStart = selEnd = null;
    selectionCanvasRect = null;
    selectedDotsRaw = 0;
    selectedStarsEstimated = 0;
    updateCountFooter();
    if (redraw) redrawBaseView();
  }

  function clientToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy
    };
  }

  function normalizeRect(a, b) {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function countDotsInRect(r, stars) {
    if (!r || !stars || !stars.length) return 0;
    const x2 = r.x + r.w;
    const y2 = r.y + r.h;
    let c = 0;
    for (const s of stars) {
      if (s.x >= r.x && s.x <= x2 && s.y >= r.y && s.y <= y2) c++;
    }
    return c;
  }

  function getStarsInSelection(r, stars) {
    if (!r || !stars || !stars.length) return [];
    const x2 = r.x + r.w;
    const y2 = r.y + r.h;
    const out = [];
    for (const s of stars) {
      if (s.x >= r.x && s.x <= x2 && s.y >= r.y && s.y <= y2) out.push(s);
    }
    return out;
  }

  function updateCountFooter() {
    if (starsPerDot === 1) {
      ftCount.textContent = `Stars in Box: ${fmtNum(selectedStarsEstimated)}`;
    } else {
      ftCount.textContent = `Estimated Stars in Box: ${fmtNum(selectedStarsEstimated)}`;
    }
  }

  let lastViewImage = null;
  function redrawBaseView() {
    if (lastViewImage) ctx.putImageData(lastViewImage, 0, 0);
  }

  function drawSelectionRect(r, isLive=false) {
    if (!r) return;
    ctx.save();
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.setLineDash(isLive ? [6,4] : []);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  function redrawWithSelection() {
    redrawBaseView();

    if (selecting && selStart && selEnd) {
      const live = normalizeRect(selStart, selEnd);
      drawSelectionRect(live, true);
    } else if (selectionCanvasRect) {
      drawSelectionRect(selectionCanvasRect, false);
    }
  }

  // -----------------------------
  // JSON build output
  // -----------------------------
  function buildSectorJSON(starsSelected, rect) {
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    const depth = Math.max(1, Math.round(Math.min(rect.w, rect.h)));

    const usedZByCell = new Map();
    const starsOut = [];

    for (let i = 0; i < starsSelected.length; i++) {
      const s = starsSelected[i];

      const lx = clamp(Math.floor(s.x - rect.x), 0, w - 1);
      const ly = clamp(Math.floor(s.y - rect.y), 0, h - 1);
      const cellKey = lx + "," + ly;

      if (!usedZByCell.has(cellKey)) usedZByCell.set(cellKey, new Set());
      const usedSet = usedZByCell.get(cellKey);

      let zPick = randi(1, depth);
      if (usedSet.size < depth) {
        while (usedSet.has(zPick)) zPick = randi(1, depth);
      }
      usedSet.add(zPick);

      const x1 = lx + 1;
      const y1 = ly + 1;
      const z1 = zPick;

      starsOut.push({
        name: `Star ${x1}x${y1}x${z1}`,
        x: x1,
        y: y1,
        z: z1
      });
    }

    return {
      galaxyType: currentGalaxyName,
      zoomLevel,
      grid: { width: w, height: h, depth },
      starCount: starsOut.length,
      stars: starsOut
    };
  }

  function buildStarCatalogTXT(sectorJSON) {
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const R_SUN_LY = 7.35355e-8;
    const AU_LY = 1.58125e-5;          // 1 AU in lightyears (matches your working data)
    const EARTH_MASS_KG = 5.9722e24;
    const EARTH_RADIUS_LY = 6.734e-10; // Earth radius in ly (matches your working data)

    // We shrink radii to keep corona sane.
    const CORONA_SHRINK = 5;

    function mkValue(source, unit, quantity, measurementQualifier) {
      const obj = { source, value: { unit, quantity } };
      if (measurementQualifier) obj.measurementQualifier = measurementQualifier;
      return obj;
    }

    function tempToClass(T) {
      if (T >= 7500) return "A";
      if (T >= 6000) return "F";
      if (T >= 5200) return "G";
      if (T >= 3700) return "K";
      return "M";
    }

    function classToRaw(mainClass) {
      const subclass = randInt(0, 9);
      const lum = pick(["V", "IV", "", "III"]);
      return `${mainClass}${subclass}${lum}`;
    }

    function makeStarFromGrid(starIn, idx, grid, scaleLyPerUnit) {
      const gx = starIn.x;
      const gy = starIn.y;
      const gz = starIn.z;

      const cx = (gx - grid.width / 2) * scaleLyPerUnit;
      const cy = (gy - grid.height / 2) * scaleLyPerUnit;
      const cz = (gz - grid.depth / 2) * scaleLyPerUnit;

      const solDist = Math.sqrt(cx*cx + cy*cy + cz*cz);

      const rSol = rand(0.2, 2.8);
      const radiusLy = (R_SUN_LY * rSol) / CORONA_SHRINK;

      const tempK = rand(2800, 9000);
      const mainClass = tempToClass(tempK);

      const absMag = (() => {
        switch (mainClass) {
          case "A": return rand(0.5, 3.0);
          case "F": return rand(2.0, 5.0);
          case "G": return rand(3.5, 6.5);
          case "K": return rand(5.0, 9.0);
          case "M": return rand(8.0, 16.0);
          default: return rand(4.0, 12.0);
        }
      })();

      const raRad  = rand(0, Math.PI * 2);
      const decRad = rand(-Math.PI/2, Math.PI/2);

      const primaryId = idx;

      return {
        absoluteMagnitude: mkValue("INFERRED", "MV", absMag),
        identifiers: {
          hipparcosId: primaryId + 100000,
          henryDraperId: primaryId + 200000,
          harvardRevisedId: primaryId + 300000,
          glieseId: `NCZ ${primaryId}`
        },
        properName: starIn.name || `Star ${primaryId}`,
        type: "STAR",
        primaryId,
        nearbyObjectIDs: [primaryId],
        rightAscensionRadians: mkValue("INFERRED", "RADIAN", raRad),
        parsedStellarClassification: { mainClass },
        cartesianCoordsInLys: { x: cx, y: cy, z: cz },
        temperatureEstimate: mkValue("INFERRED", "K", tempK),
        solDistance: mkValue("INFERRED", "LY", solDist),
        links: {},
        radius: mkValue("INFERRED", "LY", radiusLy),
        declinationRadians: mkValue("INFERRED", "RADIAN", decRad),
        rawStellarClassification: classToRaw(mainClass)
      };
    }

    // ---- Planet generation ----

    function makePlanetsForStar(starObj, starId, startPlanetId) {
      const planets = [];
      const numPlanets = randInt(1, 6); // at least 1

      const letters = ["b","c","d","e","f","g","h","i"];
      let nextA_AU = rand(0.05, 0.6); // starting semi-major axis in AU

      for (let i = 0; i < numPlanets; i++) {
        const letter = letters[i] || `p${i+1}`;

        // Increase orbital distance each planet
        nextA_AU *= rand(1.4, 2.2);

        // Clamp somewhere reasonable
        const aAU = Math.min(nextA_AU, 60);
        const aLy = aAU * AU_LY;

        // Kepler-ish period (years -> days). P^2 = a^3
        const periodYears = Math.sqrt(aAU * aAU * aAU);
        const periodDays = periodYears * 365.256363;

        const e = rand(0, 0.35);
        const bLy = aLy * Math.sqrt(1 - e*e);

        // Pick a rough planet type bucket
        const typeBucket = pick(["rocky", "ice", "gas"]);
        let earthMasses, earthRadii, density;
        if (typeBucket === "rocky") {
          earthMasses = rand(0.2, 5);
          earthRadii = rand(0.5, 1.8);
          density = rand(3.0, 8.0);
        } else if (typeBucket === "ice") {
          earthMasses = rand(5, 25);
          earthRadii = rand(2.0, 4.5);
          density = rand(1.1, 3.0);
        } else {
          earthMasses = rand(25, 350);
          earthRadii = rand(4.0, 12.0);
          density = rand(0.4, 2.0);
        }

        const massKg = earthMasses * EARTH_MASS_KG;
        const radiusLy = earthRadii * EARTH_RADIUS_LY;

        const planetPrimaryId = startPlanetId + i;

        planets.push({
          starId: starId,
          inclination: mkValue("INFERRED", "DEGREE_GEOM", rand(0, 10)),
          orbitalPeriodDays: mkValue("INFERRED", "DAY", periodDays),
          longAscendingNode: mkValue("INFERRED", "DEGREE_GEOM", rand(0, 360)),
          semiMinorAxisLys: mkValue("INFERRED", "LY", bLy),
          properName: `${starObj.properName} ${letter}`,
          eccentricity: mkValue("INFERRED", "NONE", e),
          type: "PLANET",
          primaryId: planetPrimaryId,
          axialTilt: mkValue("INFERRED", "DEGREE_GEOM", rand(0, 40)),
          semiMajorAxisLys: mkValue("INFERRED", "LY", aLy),
          name: {
            planetLetter: letter,
            starName: starObj.properName
          },
          radiusLys: mkValue("INFERRED", "LY", radiusLy),
          densityGcc: mkValue("INFERRED", "G_PER_CC", density),
          radius: mkValue("INFERRED", "LY", radiusLy),
          massKg: mkValue("INFERRED", "KG", massKg, "Mass"),
          argumentPeriapsis: mkValue("INFERRED", "DEGREE_GEOM", rand(0, 360))
        });
      }

      return planets;
    }

    // ---- Build catalog ----

    const grid = sectorJSON.grid || { width: 100, height: 100, depth: 100 };
    const inputStars = Array.isArray(sectorJSON.stars) ? sectorJSON.stars : [];

    const solStar = {
      absoluteMagnitude: mkValue("SUPPLIED", "MV", 4.83),
      identifiers: {
        hipparcosId: "0",
        henryDraperId: "0",
        harvardRevisedId: "0",
        glieseId: "Sol"
      },
      properName: "Sol",
      type: "STAR",
      primaryId: 1,
      nearbyObjectIDs: [1],
      rightAscensionRadians: mkValue("SUPPLIED", "RADIAN", 0),
      parsedStellarClassification: { mainClass: "G" },
      cartesianCoordsInLys: { x: 0, y: 0, z: 0 },
      temperatureEstimate: mkValue("SUPPLIED", "K", 5778),
      solDistance: mkValue("SUPPLIED", "LY", 0),
      links: {},
      radius: mkValue("SUPPLIED", "LY", R_SUN_LY / CORONA_SHRINK),
      declinationRadians: mkValue("SUPPLIED", "RADIAN", 0),
      rawStellarClassification: "G2V"
    };

    const maxDim = Math.max(grid.width, grid.height, grid.depth, 1);
    const targetSpanLy = 140;
    const scaleLyPerUnit = targetSpanLy / maxDim;

    let starsOut = [solStar];
    let planetsOut = [];

    let nextStarId = 2;
    let nextPlanetId = 100000; // large offset to avoid collisions with star IDs

    // Add planets for Sol too (keeps exoplanet highlight logic happy)
    planetsOut.push(...makePlanetsForStar(solStar, 1, nextPlanetId));
    nextPlanetId += planetsOut.length;

    for (let i = 0; i < inputStars.length; i++) {
      const s = inputStars[i];
      const starObj = makeStarFromGrid(s, nextStarId, grid, scaleLyPerUnit);
      starsOut.push(starObj);

      const newPlanets = makePlanetsForStar(starObj, nextStarId, nextPlanetId);
      planetsOut.push(...newPlanets);
      nextPlanetId += newPlanets.length;

      nextStarId++;
    }

    const catalog = { stars: starsOut, planets: planetsOut };

    // ==========================================================
    // MEQ APPENDIX (added at end, safe to ignore by loader)
    // Stores:
    //  - original sector JSON
    //  - 4 base64 image dataURLs (if present)
    // ==========================================================
    catalog.__meq_appendix = {
      sectorJSON: sectorJSON, // your original galactic-sector.json
      images: {
        originalGalaxy: rootImageURL || null,
        finalZoom: finalZoomImageURL || null,
        finalSelectedCrop: finalSelectedCropURL || null,
        finalBoxed: finalBoxedImageURL || null
      }
    };

    return JSON.stringify(catalog);
  }

  // -----------------------------
  // Build next zoom stars
  // -----------------------------
  function buildNextZoomStars(selRect, selStarsEstimated, goPreFinal) {
    const W = canvas.width;
    const H = canvas.height;

    const seeds = getStarsInSelection(selRect, currentStars);

    let targetDots;
    let nextStarsPerDot;

    if (goPreFinal) {
      targetDots = Math.max(0, Math.floor(selStarsEstimated));
      nextStarsPerDot = 1;
    } else {
      targetDots = clamp(DOT_IDEAL, DOT_MIN, DOT_MAX);
      targetDots = Math.min(targetDots, Math.floor(selStarsEstimated));

      if (targetDots < DOT_MIN) {
        targetDots = Math.floor(selStarsEstimated);
        nextStarsPerDot = 1;
      } else {
        nextStarsPerDot = selStarsEstimated / targetDots;
      }
    }

    const stars = generateFromSeedsWarped(seeds, selRect, targetDots, W, H);
    return { stars, starsPerDot: nextStarsPerDot };
  }

  function generateFromSeedsWarped(seeds, selRect, targetN, W, H) {
    if (seeds.length < 5) {
      const out = [];
      for (let i = 0; i < targetN; i++) {
        out.push({
          x: rand(0, W),
          y: rand(0, H),
          size: rand(0.35, 1.4),
          alpha: rand(0.08, 0.7),
          color: `rgba(255,255,255,${rand(0.08,0.7)})`
        });
      }
      return out;
    }

    const normSeeds = seeds.map(s => ({
      nx: (s.x - selRect.x) / selRect.w,
      ny: (s.y - selRect.y) / selRect.h
    }));

    const seedStd = 0.05;
    const anchorStd = 0.10;

    const anchors = [];
    for (let i = 0; i < Math.min(6, normSeeds.length); i++) {
      anchors.push(normSeeds[randi(0, normSeeds.length-1)]);
    }

    const out = [];

    for (let i = 0; i < targetN; i++) {
      let nx, ny;

      const useSeed = Math.random() < 0.72;
      if (useSeed) {
        const p = normSeeds[randi(0, normSeeds.length-1)];
        nx = p.nx + gauss(0, seedStd);
        ny = p.ny + gauss(0, seedStd);
      } else {
        const a = anchors[randi(0, anchors.length-1)];
        nx = a.nx + gauss(0, anchorStd);
        ny = a.ny + gauss(0, anchorStd);
      }

      nx = clamp(nx, -0.2, 1.2);
      ny = clamp(ny, -0.2, 1.2);

      let x = nx * W;
      let y = ny * H;

      const dx = x - W/2;
      const dy = y - H/2;
      const r  = Math.sqrt(dx*dx + dy*dy) / (Math.min(W,H)/2);
      const warp = 1 / (1 + 0.45 * r * r);
      x = W/2 + dx * warp;
      y = H/2 + dy * warp;

      const bright = Math.random() < 0.07;
      const size = bright ? rand(1.0, 2.2) : rand(0.35, 1.1);
      const alpha = bright ? rand(0.55, 0.95) : rand(0.10, 0.55);

      out.push({
        x, y,
        size,
        alpha,
        color: bright
          ? `rgba(230,240,255,${alpha})`
          : `rgba(255,255,255,${alpha})`
      });
    }

    const bgN = randi(800, 2500);
    for (let i = 0; i < bgN; i++) {
      out.push({
        x: rand(0, W),
        y: rand(0, H),
        size: rand(0.2, 0.8),
        alpha: rand(0.03, 0.14),
        color: `rgba(255,255,255,${rand(0.03,0.12)})`
      });
    }

    return out;
  }

  function generateNormalStarfieldFromSeeds(seeds, selRect, targetN, W, H) {
    if (!seeds || seeds.length < 3) {
      const out = [];
      for (let i = 0; i < targetN; i++) {
        out.push({
          x: rand(0, W),
          y: rand(0, H),
          size: rand(0.35, 1.4),
          alpha: rand(0.12, 0.9),
          color: `rgba(255,255,255,${rand(0.12,0.9)})`
        });
      }
      return out;
    }

    const normSeeds = seeds.map(s => ({
      nx: (s.x - selRect.x) / selRect.w,
      ny: (s.y - selRect.y) / selRect.h
    }));

    const out = [];
    const seedStd = 0.04;

    for (let i = 0; i < targetN; i++) {
      let nx, ny;

      if (Math.random() < 0.7) {
        const p = normSeeds[randi(0, normSeeds.length - 1)];
        nx = p.nx + gauss(0, seedStd);
        ny = p.ny + gauss(0, seedStd);
      } else {
        nx = Math.random();
        ny = Math.random();
      }

      nx = clamp(nx, 0, 1);
      ny = clamp(ny, 0, 1);

      const x = nx * W;
      const y = ny * H;

      const bright = Math.random() < 0.06;
      const size = bright ? rand(1.0, 2.0) : rand(0.35, 1.1);
      const alpha = bright ? rand(0.6, 0.98) : rand(0.12, 0.6);

      out.push({
        x, y,
        size,
        alpha,
        color: `rgba(255,255,255,${alpha})`
      });
    }

    return out;
  }

  // -----------------------------
  // Root galaxy generation
  // -----------------------------
  function generateRootGalaxy() {
    consoleToolbar.style.display = "none";
    consolePre.style.display = "none";
    canvas.style.display = "block";
    footer.style.display = "grid";

    popup.style.backgroundImage = "none";
    popup.style.backgroundColor = "rgba(0,0,0,0.96)";

    zoomLevel = 0;
    viewStack = [];
    starsPerDot = ROOT_STARS_PER_DOT;
    ultraFinal = false;
    clearSelection(false);
    updateFooterMode();

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.42;

    ctx.clearRect(0, 0, W, H);
    drawBackgroundNebula(W, H);

    const skeletonType = pickSkeleton();
    currentGalaxyName = skeletonType.name;
    currentStars = skeletonType.generate(cx, cy, R);

    drawGalaxyGlow(cx, cy, R, skeletonType.glowColor);
    drawStars(currentStars);

    lastViewImage = ctx.getImageData(0, 0, W, H);

    rootImageURL = canvas.toDataURL("image/png");
    finalZoomImageURL = null;
    finalBoxedImageURL = null;
    finalSelectedCropURL = null;

    lastSectorJSON = null;
    lastStarCatalogText = null;

    ftType.textContent = `Galaxy Type: ${currentGalaxyName}`;
    updateCountFooter();
  }

  function drawView(stars, { keepNebula=true }={}) {
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    if (keepNebula) drawBackgroundNebula(W, H);

    drawGalaxyGlow(W/2, H/2, Math.min(W,H)*0.42, "rgba(120,160,255,0.14)");
    drawStars(stars);

    lastViewImage = ctx.getImageData(0, 0, W, H);
  }

  function pickSkeleton() {
    const types = [
      SKEL_SPIRAL(),
      SKEL_BARRED_SPIRAL(),
      SKEL_ELLIPTICAL(),
      SKEL_RING(),
      SKEL_IRREGULAR()
    ];
    return types[randi(0, types.length - 1)];
  }

  function drawBackgroundNebula(W, H) {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 5; i++) {
      const x = rand(0, W);
      const y = rand(0, H);
      const rx = rand(W*0.15, W*0.5);
      const ry = rand(H*0.08, H*0.3);
      const a = rand(0.03, 0.08);

      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0, `rgba(80,120,255,${a})`);
      g.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rand(0, Math.PI), 0, Math.PI*2);
      ctx.fill();
    }

    for (let i = 0; i < 900; i++) {
      const x = rand(0, W), y = rand(0, H);
      const r = rand(0.2, 1.1);
      const a = rand(0.05, 0.25);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGalaxyGlow(cx, cy, R, tint="rgba(120,160,255,0.25)") {
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R*1.1);
    g.addColorStop(0, tint);
    g.addColorStop(0.4, "rgba(60,80,140,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R*1.1, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawStars(stars) {
    ctx.save();
    for (const s of stars) {
      const {x,y, size, alpha, color} = s;
      ctx.fillStyle = color || `rgba(255,255,255,${alpha})`;
      if (size <= 0.6) {
        ctx.fillRect(x, y, 1, 1);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI*2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // -----------------------------
  // Skeletons / palettes (unchanged)
  // -----------------------------
  function SKEL_SPIRAL() {
    const arms = randi(2, 5);
    const twist = rand(2.8, 5.5);
    const armWidth = rand(0.06, 0.14);
    const coreN = randi(180, 320);
    const armN = randi(900, 1400);

    return {
      name: `Spiral (${arms} arms)`,
      glowColor: "rgba(120,170,255,0.28)",
      generate(cx, cy, R) {
        const stars = [];
        for (let i = 0; i < coreN; i++) {
          const r = Math.pow(Math.random(), 0.45) * R * 0.35;
          const a = rand(0, Math.PI*2);
          const x = cx + Math.cos(a)*r + gauss(0, R*0.01);
          const y = cy + Math.sin(a)*r + gauss(0, R*0.01);
          stars.push(star(x,y, rand(0.7, 1.6), rand(0.25,0.7), coreColor()));
        }
        for (let i = 0; i < armN; i++) {
          const armIndex = randi(0, arms-1);
          const rN = Math.pow(Math.random(), 0.62) * R;
          const baseAngle = (armIndex * (Math.PI*2/arms));
          const theta = baseAngle + rN * (twist / R) + gauss(0, armWidth);
          const spread = gauss(0, R*armWidth*0.6);
          const x = cx + Math.cos(theta)*rN + Math.cos(theta+Math.PI/2)*spread;
          const y = cy + Math.sin(theta)*rN + Math.sin(theta+Math.PI/2)*spread;
          const alpha = lerp(0.12, 0.75, 1 - rN/R);
          stars.push(star(x,y, rand(0.4, 1.2), alpha, armColor()));
        }
        for (let i = 0; i < 220; i++) {
          const rN = Math.pow(Math.random(), 0.9) * R * 1.1;
          const a = rand(0, Math.PI*2);
          stars.push(star(
            cx + Math.cos(a)*rN,
            cy + Math.sin(a)*rN,
            rand(0.3, 0.9),
            rand(0.06, 0.2),
            "rgba(255,255,255,0.18)"
          ));
        }
        return stars;
      }
    };
  }

  function SKEL_BARRED_SPIRAL() {
    const arms = randi(2, 4);
    const twist = rand(2.6, 4.8);
    const armWidth = rand(0.05, 0.12);
    const barLen = rand(0.35, 0.55);
    const barAng = rand(0, Math.PI);

    return {
      name: `Barred Spiral (${arms} arms)`,
      glowColor: "rgba(255,170,140,0.24)",
      generate(cx, cy, R) {
        const stars = [];
        const barN = randi(350, 520);
        for (let i = 0; i < barN; i++) {
          const t = gauss(0, 1);
          const xLocal = clamp(t, -2.2, 2.2) * R * barLen * 0.24;
          const yLocal = gauss(0, R*0.03);
          const x = cx + xLocal*Math.cos(barAng) - yLocal*Math.sin(barAng);
          const y = cy + xLocal*Math.sin(barAng) + yLocal*Math.cos(barAng);
          stars.push(star(x,y, rand(0.6,1.4), rand(0.2,0.6), coreColor()));
        }
        for (let i = 0; i < 220; i++) {
          const rN = Math.pow(Math.random(), 0.5)*R*0.25;
          const a = rand(0, Math.PI*2);
          stars.push(star(cx+Math.cos(a)*rN, cy+Math.sin(a)*rN, rand(0.7,1.6), rand(0.25,0.7), coreColor()));
        }
        const armN = randi(900, 1300);
        for (let i = 0; i < armN; i++) {
          const armIndex = randi(0, arms-1);
          const rN = Math.pow(Math.random(), 0.62) * R;
          const endOffset = (armIndex%2===0 ? 1 : -1) * R*barLen*0.28;
          const armBase = barAng + (armIndex * (Math.PI*2/arms));
          const theta = armBase + rN*(twist/R) + gauss(0, armWidth);
          const spread = gauss(0, R*armWidth*0.6);
          const x = cx + endOffset*Math.cos(barAng) + Math.cos(theta)*rN + Math.cos(theta+Math.PI/2)*spread;
          const y = cy + endOffset*Math.sin(barAng) + Math.sin(theta)*rN + Math.sin(theta+Math.PI/2)*spread;
          const alpha = lerp(0.12, 0.7, 1 - rN/R);
          stars.push(star(x,y, rand(0.4,1.2), alpha, armColorWarm()));
        }
        return stars;
      }
    };
  }

  function SKEL_ELLIPTICAL() {
    const axisRatio = rand(0.6, 0.95);
    const rot = rand(0, Math.PI);
    return {
      name: `Elliptical`,
      glowColor: "rgba(200,200,255,0.22)",
      generate(cx, cy, R) {
        const stars = [];
        const N = randi(1200, 1800);
        for (let i = 0; i < N; i++) {
          const rN = Math.pow(Math.random(), 0.45) * R;
          const a = rand(0, Math.PI*2);
          let x = Math.cos(a)*rN;
          let y = Math.sin(a)*rN*axisRatio;
          const xr = x*Math.cos(rot) - y*Math.sin(rot);
          const yr = x*Math.sin(rot) + y*Math.cos(rot);
          const ax = cx + xr + gauss(0, R*0.01);
          const ay = cy + yr + gauss(0, R*0.01);
          const alpha = lerp(0.12, 0.75, 1 - rN/R);
          stars.push(star(ax, ay, rand(0.5,1.5), alpha, coreColorCool()));
        }
        for (let i = 0; i < 260; i++) {
          const rN = Math.pow(Math.random(), 0.9)*R*1.05;
          const a = rand(0, Math.PI*2);
          stars.push(star(cx+Math.cos(a)*rN, cy+Math.sin(a)*rN, rand(0.3,0.9), rand(0.05,0.2), "rgba(255,255,255,0.18)"));
        }
        return stars;
      }
    };
  }

  function SKEL_RING() {
    const ringRadius = rand(0.65, 0.8);
    const thickness = rand(0.06, 0.12);
    return {
      name: "Ring Galaxy",
      glowColor: "rgba(160,255,200,0.20)",
      generate(cx, cy, R) {
        const stars = [];
        for (let i = 0; i < 280; i++) {
          const rN = Math.pow(Math.random(), 0.5) * R * 0.22;
          const a = rand(0, Math.PI*2);
          stars.push(star(cx+Math.cos(a)*rN, cy+Math.sin(a)*rN, rand(0.7,1.6), rand(0.25,0.7), coreColor()));
        }
        const ringN = randi(1200, 1700);
        for (let i = 0; i < ringN; i++) {
          const rBase = R * ringRadius;
          const rN = rBase + gauss(0, R*thickness);
          const a = rand(0, Math.PI*2);
          const x = cx + Math.cos(a)*rN;
          const y = cy + Math.sin(a)*rN;
          const alpha = lerp(0.15, 0.55, 1 - Math.abs(rN - rBase)/(R*thickness*3));
          stars.push(star(x,y, rand(0.4,1.2), alpha, armColor()));
        }
        return stars;
      }
    };
  }

  function SKEL_IRREGULAR() {
    const clumps = randi(3, 6);
    return {
      name: "Irregular / Dwarf",
      glowColor: "rgba(255,220,170,0.18)",
      generate(cx, cy, R) {
        const stars = [];
        const centers = [];
        for (let i = 0; i < clumps; i++) {
          centers.push({
            x: cx + gauss(0, R*0.25),
            y: cy + gauss(0, R*0.25),
            s: rand(0.08, 0.22)
          });
        }
        const N = randi(900, 1400);
        for (let i = 0; i < N; i++) {
          const c = centers[randi(0, centers.length-1)];
          const rN = Math.abs(gauss(0, R*c.s));
          const a = rand(0, Math.PI*2);
          const x = c.x + Math.cos(a)*rN;
          const y = c.y + Math.sin(a)*rN;
          const alpha = rand(0.12, 0.6);
          stars.push(star(x,y, rand(0.4,1.3), alpha, coreColorWarm()));
        }
        for (let i = 0; i < 220; i++) {
          const rN = Math.pow(Math.random(), 0.8) * R;
          const a = rand(0, Math.PI*2);
          stars.push(star(cx+Math.cos(a)*rN, cy+Math.sin(a)*rN, rand(0.3,0.9), rand(0.05,0.18), "rgba(255,255,255,0.18)"));
        }
        return stars;
      }
    };
  }

  function star(x,y,size=1,alpha=0.5,color=null) { return {x,y,size,alpha,color}; }
  function coreColor() {
    const t = rand();
    if (t < 0.6) return `rgba(255,255,255,${rand(0.25,0.8)})`;
    if (t < 0.85) return `rgba(255,230,200,${rand(0.25,0.7)})`;
    return `rgba(200,220,255,${rand(0.2,0.6)})`;
  }
  function coreColorCool() {
    const t = rand();
    if (t < 0.7) return `rgba(220,235,255,${rand(0.25,0.8)})`;
    return `rgba(255,255,255,${rand(0.25,0.7)})`;
  }
  function coreColorWarm() {
    const t = rand();
    if (t < 0.7) return `rgba(255,230,200,${rand(0.25,0.8)})`;
    return `rgba(255,255,255,${rand(0.25,0.7)})`;
  }
  function armColor() {
    const t = rand();
    if (t < 0.5) return `rgba(200,220,255,${rand(0.18,0.65)})`;
    if (t < 0.8) return `rgba(255,255,255,${rand(0.18,0.6)})`;
    return `rgba(180,255,220,${rand(0.12,0.5)})`;
  }
  function armColorWarm() {
    const t = rand();
    if (t < 0.5) return `rgba(255,220,180,${rand(0.18,0.65)})`;
    if (t < 0.8) return `rgba(255,255,255,${rand(0.18,0.6)})`;
    return `rgba(255,180,200,${rand(0.12,0.5)})`;
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function init() {
    const btn = insertMakeGalaxyButton();
    if (!btn) return;

    ensurePopup();
    injectMeqScrollbarTheme(); // ✅ add this line

    btn.addEventListener("click", () => {
      if (!isOpen) togglePopup(true);
      else {
        updateFooterAccent();
        generateRootGalaxy();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();


  // -----------------------------
  // MEQ Scrollbar Theme Injector
  // -----------------------------
  function injectMeqScrollbarTheme() {
    if (document.getElementById("meqScrollbarTheme")) return; // idempotent

    const style = document.createElement("style");
    style.id = "meqScrollbarTheme";
    style.textContent = `
      /* ==========================================
         MEQ Scrollbar Theme (accent-driven)
         ========================================== */

      /* Firefox */
      html, body, * {
        scrollbar-width: thin;
        scrollbar-color: var(--meq-accent) rgba(0,0,0,0.6);
      }

      /* WebKit (Chrome / Edge / Safari) */
      *::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }

      *::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.6);
        border-radius: 999px;
      }

      *::-webkit-scrollbar-thumb {
        background: var(--meq-accent);
        border-radius: 999px;
        border: 2px solid rgba(0,0,0,0.6);
        box-shadow: 0 0 6px rgba(0,0,0,0.8) inset;
      }

      *::-webkit-scrollbar-thumb:hover {
        filter: brightness(1.2);
      }
    `;
    document.head.appendChild(style);
  }

