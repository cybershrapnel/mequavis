
// meq-ncz-infobox.js
// Tiny NCZ info box pinned top-right, non-intrusive.
// - Talks to NanoCheeZe RPC (via local proxy on 127.0.0.1:12780) OR remote PHP proxy
// - Shows: NCZ balance (LOCAL ONLY), block count, "last block X ago"
// - Polls RPC every 30s; "ago" text updates every second.
// - When RPC offline: shows "RPC Offline" (opens help popup) or "Download NCZ" link
// - RPC config stored in cookie (nczRpcCfg) and restored on reload
// - Main box z-index is NORMAL now, and it auto-hides when Mandelbrot view is open

(function () {
  if (window._meqNczInfoBoxPatched) return;
  window._meqNczInfoBoxPatched = true;

  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  onReady(initNczInfoBox);

  function initNczInfoBox() {
    // ----- RPC config + cookie helpers -----
    let rpcConfig = {
      url: "http://127.0.0.1",
      port: "12782",
      user: "",
      pass: ""
    };

    function buildRpcUrl() {
      const base = (rpcConfig.url || "http://127.0.0.1").replace(/\/+$/, "");
      const port = rpcConfig.port || "12782";
      return base + ":" + port + "/";
    }

    function saveRpcConfig() {
      try {
        const json = JSON.stringify(rpcConfig);
        document.cookie =
          "nczRpcCfg=" + encodeURIComponent(json) + "; path=/; max-age=31536000";
      } catch (e) {
        console.warn("[ncz-infobox] failed to save RPC config cookie:", e);
      }
    }

    function loadRpcConfig() {
      try {
        const all = document.cookie ? document.cookie.split(";") : [];
        for (const c of all) {
          const [rawKey, ...rest] = c.split("=");
          if (!rawKey) continue;
          const key = rawKey.trim();
          if (key === "nczRpcCfg") {
            const val = rest.join("=");
            if (!val) break;
            const parsed = JSON.parse(decodeURIComponent(val));
            if (parsed && typeof parsed === "object") {
              rpcConfig.url  = parsed.url  || rpcConfig.url;
              rpcConfig.port = parsed.port || rpcConfig.port;
              rpcConfig.user = parsed.user || "";
              rpcConfig.pass = parsed.pass || "";
            }
            break;
          }
        }
      } catch (e) {
        console.warn("[ncz-infobox] failed to load RPC config cookie:", e);
      }
    }

    loadRpcConfig();

    // ----- NEW: connection mode state -----
    // false = remote (default, via PHP proxy), true = local (via 127.0.0.1:12780)
    let useLocalRpc = false;
    const REMOTE_PROXY_URL = "https://xtdevelopment.net/chat-proxy/ncz_rpc_proxy.php";

    // ----- UI: main fixed box (STATS ONLY) -----
    const box = document.createElement("div");
    box.id = "nczInfoBox";
    box.style.cssText = [
      "position:fixed",
      "top:4px",
      "right:4px",
      "z-index:10",
      "background:rgba(0,0,0,0.85)",
      "color:#0f0",
      "font-family:monospace",
      "font-size:11px",
      "padding:4px 8px 1px 8px",
      "border:1px solid #0f0",
      "border-radius:4px",
      "pointer-events:auto",
      "max-width:280px",
      "line-height:1.3",
      "text-align:right",
      "box-shadow:0 0 6px rgba(0,255,0,0.4)",
      "overflow:hidden",
      "min-height:52px"
    ].join(";");
    document.body.appendChild(box);

    const statsDiv = document.createElement("div");
    statsDiv.id = "nczInfoStats";
    statsDiv.textContent = "NCZ: connecting…";
    statsDiv.style.display = "block";
    statsDiv.style.minHeight = "3.4em"; // reserve space for 3 text lines
    box.appendChild(statsDiv);

    // ----- NEW: connection toggle button (bottom-left, 2-line text) -----
    const modeBtn = document.createElement("button");
    modeBtn.id = "nczConnToggleBtn";
    modeBtn.innerHTML = "Connect<br>local"; // default is remote, so button offers local
    modeBtn.style.cssText = [
      "position:absolute",
      "left:4px",
      "bottom:4px",
      "font-size:10px",
      "font-family:monospace",
      "background:#111",
      "color:#0f0",
      "border:1px solid #0f0",
      "padding:1px 6px",
      "cursor:pointer",
      "text-align:left",
      "line-height:1.1"
    ].join(";");
    box.appendChild(modeBtn);

    // helper: shift only lines 2/3 to the right of the button
    function layoutStatsLines() {
      const line1 = statsDiv.querySelector(".ncz-line1");
      const line23 = statsDiv.querySelectorAll(".ncz-line23");

      if (line1) {
        line1.style.marginLeft = "0";          // full width, can overlap button area
      }

      for (const el of line23) {
        el.style.marginLeft = "60px";          // shifted right so they don't sit under button
        el.style.display = "block";
        el.style.whiteSpace = "nowrap";        // keep those short lines on one row
      }
    }

    // ----- RPC offline help overlay (centered popup with FIELDS) -----
    const overlay = document.createElement("div");
    overlay.id = "nczRpcHelpOverlay";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(0,0,0,0.75)",
      "z-index:99998",
      "display:none",
      "align-items:center",
      "justify-content:center"
    ].join(";");
    document.body.appendChild(overlay);

    const panel = document.createElement("div");
    panel.id = "nczRpcHelpPanel";
    panel.style.cssText = [
      "background:#000",
      "border:1px solid #0ff",
      "max-width:520px",
      "width:90%",
      "padding:10px",
      "box-sizing:border-box",
      "font-family:monospace",
      "font-size:12px",
      "color:#0ff",
      "box-shadow:0 0 12px rgba(0,255,255,0.5)"
    ].join("");
    panel.innerHTML = `
      <div class="nczRpcHeader" style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:6px;
        padding-bottom:4px;
        border-bottom:1px solid #0ff;
      ">
        <span>NCZ RPC Offline — Node Setup / RPC Config</span>
        <button id="nczRpcHelpClose" type="button" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">CLOSE</button>
      </div>
      <div style="max-height:60vh; overflow:auto; line-height:1.4;">
        <p>This UI is trying to talk to your NanoCheeze node at:</p>
        <pre id="nczRpcUrlExample" style="background:#050505; padding:4px 6px; border-radius:4px; overflow:auto;">
${buildRpcUrl()}</pre>

        <p>Basic steps to get it running:</p>
        <ol style="padding-left:18px; margin:4px 0 8px 0;">
          <li>Download and install the latest NanoCheeze wallet / node from
            <a href="https://info.nanocheeze.com" target="_blank" rel="noopener"
               style="color:#0af; text-decoration:underline;">info.nanocheeze.com</a>.
          </li>
          <li>Start the NanoCheeze daemon or wallet with RPC enabled.</li>
          <li>Create or edit <code>nanocheeze.conf</code> in your NCZ
            data directory and add lines like:</li>
        </ol>

        <pre style="background:#050505; padding:4px 6px; border-radius:4px; overflow:auto;">
rpcuser=yourrpcuser
rpcpassword=yourstrongpassword
rpcallowip=127.0.0.1
rpcport=12782
server=1
daemon=1
        </pre>

        <ol start="4" style="padding-left:18px; margin:4px 0 8px 0;">
          <li>Restart your NanoCheeze node so it picks up the new config.</li>
          <li>Wait for it to sync. Once synced, this box should show:<br/>
            balance, block count, and last block age.
          </li>
        </ol>

        <p style="color:#aaa; margin-top:4px;">
          If your node already runs with <strong>different</strong> RPC settings,
          adjust them here and click <strong>Change RPC</strong>.
        </p>

        <div style="
          margin-top:8px;
          padding-top:6px;
          border-top:1px solid rgba(0,255,255,0.3);
          font-size:11px;
        ">
          <div style="margin-bottom:6px;">
            <strong>Local browser proxy (required for Connect local):</strong>
            <br>
            To let this page talk to your local NanoCheeze node, run the NCZ proxy script on your machine:
          </div>
          <pre style="background:#050505; padding:4px 6px; border-radius:4px; overflow:auto; margin-bottom:4px;">
<a href="https://raw.githubusercontent.com/cybershrapnel/mequavis/refs/heads/main/ncz_proxy.py">https://raw.githubusercontent.com/cybershrapnel/mequavis/refs/heads/main/ncz_proxy.py</a>
          </pre>
          <p style="margin:4px 0;">
            Download that file, then in a terminal run (Python 3):
          </p>
          <pre style="background:#050505; padding:4px 6px; border-radius:4px; overflow:auto; margin-bottom:6px;">
python ncz_proxy.py
          </pre>
          <p style="margin:4px 0;">
            Leave the proxy running while this site is open, then click
            <strong>"Connect local"</strong> in the NCZ info box<br />to see your balance and live stats
            from your own node.
          </p>

          <div style="margin-top:8px; padding-top:6px; border-top:1px solid rgba(0,255,255,0.3);">
            <div style="display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center; margin-bottom:3px;">
              <label for="nczRpcUrl" style="flex:0 0 48px;">URL:</label>
              <input id="nczRpcUrl" type="text" style="
                flex:1 1 auto;
                min-width:120px;
                font-size:11px;
                font-family:monospace;
                background:#050505;
                color:#0f0;
                border:1px solid #033;
                padding:2px 3px;
              ">
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center; margin-bottom:3px;">
              <label for="nczRpcPort" style="flex:0 0 48px;">Port:</label>
              <input id="nczRpcPort" type="text" style="
                flex:0 0 60px;
                font-size:11px;
                font-family:monospace;
                background:#050505;
                color:#0f0;
                border:1px solid #033;
                padding:2px 3px;
              ">
              <label for="nczRpcUser" style="flex:0 0 48px; text-align:right;">User:</label>
              <input id="nczRpcUser" type="text" style="
                flex:1 1 auto;
                min-width:80px;
                font-size:11px;
                font-family:monospace;
                background:#050505;
                color:#0f0;
                border:1px solid #033;
                padding:2px 3px;
              ">
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center; margin-bottom:4px;">
              <label for="nczRpcPass" style="flex:0 0 48px;">Pass:</label>
              <input id="nczRpcPass" type="password" style="
                flex:1 1 auto;
                min-width:120px;
                font-size:11px;
                font-family:monospace;
                background:#050505;
                color:#0f0;
                border:1px solid #033;
                padding:2px 3px;
              ">
            </div>
            <div style="text-align:right;">
              <button id="nczRpcApply" type="button" style="
                font-size:11px;
                font-family:monospace;
                background:#111;
                color:#0f0;
                border:1px solid #0f0;
                padding:2px 8px;
                cursor:pointer;
              ">Change RPC</button>
            </div>
          </div>
        </div>
      </div>
    `;
    overlay.appendChild(panel);

    const panelHeader = panel.querySelector(".nczRpcHeader");
    const helpClose   = panel.querySelector("#nczRpcHelpClose");
    const urlExample  = panel.querySelector("#nczRpcUrlExample");
    const urlInput    = panel.querySelector("#nczRpcUrl");
    const portInput   = panel.querySelector("#nczRpcPort");
    const userInput   = panel.querySelector("#nczRpcUser");
    const passInput   = panel.querySelector("#nczRpcPass");
    const applyBtn    = panel.querySelector("#nczRpcApply");

    // populate inputs from config
    if (urlInput)  urlInput.value  = rpcConfig.url;
    if (portInput) portInput.value = rpcConfig.port;
    if (userInput) userInput.value = rpcConfig.user;
    if (passInput) passInput.value = rpcConfig.pass;
    if (urlExample) urlExample.textContent = buildRpcUrl();

    helpClose.addEventListener("click", () => {
      overlay.style.display = "none";
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.style.display = "none";
      }
    });

    // ----- Accent helpers -----
    function readCssVar(styleObj, name) {
      try {
        const v = styleObj.getPropertyValue(name);
        return v ? v.trim() : "";
      } catch {
        return "";
      }
    }

    function getUIAccent() {
      try {
        const rootStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);

        const candidates = [
          "--ui-accent",
          "--ui-color",
          "--meq-ui-accent",
          "--meq-ui-color",
          "--meq-accent",
          "--accent-color",
          "--primary-color",
          "--theme-accent",
          "--picker-color",
          "--picker-accent"
        ];

        for (const v of candidates) {
          const a = readCssVar(rootStyle, v) || readCssVar(bodyStyle, v);
          if (a) return a;
        }

        if (typeof window._meqUIColor === "string" && window._meqUIColor.trim()) {
          return window._meqUIColor.trim();
        }
        if (typeof window._meqUIAccent === "string" && window._meqUIAccent.trim()) {
          return window._meqUIAccent.trim();
        }
        if (typeof window.uiAccent === "string" && window.uiAccent.trim()) {
          return window.uiAccent.trim();
        }

        const storageKeys = [
          "uiAccent",
          "uiColor",
          "meqUIColor",
          "meq-ui-accent",
          "accentColor",
          "themeAccent",
          "pickerColor",
          "pickerAccent"
        ];
        for (const k of storageKeys) {
          const val = localStorage.getItem(k);
          if (val && val.trim()) return val.trim();
        }

        const probes = ["#segmentLog", "#rightPanel", "#layoutBtn", ".action-btn", "#aiInput", "#aiSend"];
        for (const sel of probes) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const cs = getComputedStyle(el);
          const borders = [
            cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor, cs.borderColor
          ].filter(Boolean);

          for (const bc of borders) {
            if (bc && bc !== "transparent" && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(bc)) {
              return bc;
            }
          }
          if (cs.color && cs.color !== "transparent") return cs.color;
        }
      } catch {}

      return "#0ff";
    }

    function getSoftHoverBg() {
      try {
        const rootStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        const soft =
          readCssVar(rootStyle, "--soft-border") ||
          readCssVar(bodyStyle, "--soft-border");
        if (soft) return soft;
      } catch {}
      return "#033";
    }

    function applyAccent() {
      const accent = getUIAccent();
      if (!accent) return;
      const hoverBg = getSoftHoverBg();

      // Help panel
      panel.style.borderColor = accent;
      panel.style.color = accent;
      if (panelHeader) {
        panelHeader.style.borderBottomColor = accent;
        panelHeader.style.color = accent;
      }

      // Close button
      if (helpClose) {
        helpClose.style.background = "#111";
        helpClose.style.color = accent;
        helpClose.style.border = `1px solid ${accent}`;
        helpClose.style.fontFamily = "monospace";
        helpClose.style.fontSize = "11px";
        helpClose.style.padding = "2px 8px";
        helpClose.style.cursor = "pointer";

        if (!helpClose._meqHoverWired) {
          helpClose._meqHoverWired = true;
          helpClose.addEventListener("mouseenter", () => {
            helpClose.style.background = hoverBg;
          });
          helpClose.addEventListener("mouseleave", () => {
            helpClose.style.background = "#111";
          });
        }
      }

      // Change RPC button
      if (applyBtn) {
        applyBtn.style.background = "#111";
        applyBtn.style.color = accent;
        applyBtn.style.border = `1px solid ${accent}`;
        if (!applyBtn._meqHoverWired) {
          applyBtn._meqHoverWired = true;
          applyBtn.addEventListener("mouseenter", () => {
            applyBtn.style.background = hoverBg;
          });
          applyBtn.addEventListener("mouseleave", () => {
            applyBtn.style.background = "#111";
          });
        }
      }

      // Accent for mode toggle button
      if (modeBtn) {
        modeBtn.style.color = accent;
        modeBtn.style.borderColor = accent;
      }
    }

    applyAccent();
    setInterval(applyAccent, 500);

    // ----- internal state -----
    let lastBalance       = null;
    let lastBalanceStr    = "loading…";
    let lastBlockHeight   = null;
    let lastBlockTimeMs   = null;  // in ms
    let rpcOk             = false;

    // ----- JSON-RPC helper (LOCAL vs REMOTE) -----
    async function rpcCall(method, params = []) {
      let res;

      if (useLocalRpc) {
        // Browser → local proxy (127.0.0.1:12780) → NCZ RPC
        const proxyPayload = {
          url:  rpcConfig.url,
          port: rpcConfig.port,
          user: rpcConfig.user,
          pass: rpcConfig.pass,
          method,
          params
        };

        res = await fetch("http://127.0.0.1:12780/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proxyPayload)
        });
      } else {
        // Browser → remote PHP endpoint → NCZ RPC (server-side)
        const proxyPayload = {
          method,
          params
        };

        res = await fetch(REMOTE_PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proxyPayload)
        });
      }

      if (!res.ok) {
        throw new Error("Proxy HTTP " + res.status);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || "RPC error");
      }
      return data.result;
    }

    // ----- Age formatter -----
    function formatAge(sec) {
      if (sec < 0) sec = 0;
      if (sec < 60) return sec + "s";
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (m < 60) return m + "m" + (s ? " " + s + "s" : "");
      const h = Math.floor(m / 60);
      const rm = m % 60;
      if (h < 24) return h + "h" + (rm ? " " + rm + "m" : "");
      const d = Math.floor(h / 24);
      const rh = h % 24;
      return d + "d" + (rh ? " " + rh + "h" : "");
    }

    // ----- Render function (uses last known state) -----
    function renderBox() {
      if (!rpcOk) {
        return;
      }

      const balText = lastBalanceStr || "loading…";
      const blkText = (lastBlockHeight == null) ? "loading…" : String(lastBlockHeight);

      let ageText = "unknown";
      if (lastBlockTimeMs) {
        const diffSec = Math.floor((Date.now() - lastBlockTimeMs) / 1000);
        ageText = formatAge(diffSec) + " ago";
      }

      // 3-line layout: line1 full width, line2+3 shifted
      statsDiv.innerHTML =
        '<div class="ncz-line1">NCZ: ' + balText + '</div>' +
        '<div class="ncz-line23">Blocks: ' + blkText + '</div>' +
        '<div class="ncz-line23">Last block: ' + ageText + '</div>';

      layoutStatsLines();
    }

    // ----- Fetch stats from RPC -----
    async function fetchStats() {
      try {
        let blockCount;

        if (useLocalRpc) {
          // LOCAL: get balance + blockcount (original behavior)
          const [balance, bc] = await Promise.all([
            rpcCall("getbalance", []),
            rpcCall("getblockcount", [])
          ]);

          lastBalance = balance;
          if (typeof balance === "number") {
            lastBalanceStr = balance.toFixed(2);
          } else {
            lastBalanceStr = String(balance);
          }

          blockCount = bc;
        } else {
          // REMOTE: only getblockcount; NO BALANCE
          const bc = await rpcCall("getblockcount", []);
          lastBalance = null;
          lastBalanceStr = "connect locally to get balance";
          blockCount = bc;
        }

        lastBlockHeight = blockCount;

        try {
          const block = await rpcCall("getblockbynumber", [blockCount, false]);
          let blockTimeSec = null;

          if (block && typeof block.time === "number") {
            blockTimeSec = block.time;
          } else if (block && typeof block.time === "string") {
            const parsed = parseInt(block.time, 10);
            if (!isNaN(parsed)) blockTimeSec = parsed;
          }

          if (blockTimeSec != null) {
            lastBlockTimeMs = blockTimeSec * 1000;
          }
        } catch (e) {
          console.warn("[ncz-infobox] getblockbynumber failed:", e);
          lastBlockTimeMs = null;
        }

        rpcOk = true;
        box.style.opacity = "1";
        box.style.color   = "#0f0";
        box.style.borderColor = "#0f0";
        renderBox();
      } catch (err) {
        console.error("[ncz-infobox] RPC error via proxy:", err);
        rpcOk = false;
        box.style.opacity = "0.9";
        box.style.color   = "#f66";
        box.style.borderColor = "#f66";

        // same words "RPC Offline or Download NCZ", split to 3 lines
        statsDiv.innerHTML =
          '<div class="ncz-line1">' +
            '<a href="#" id="nczRpcHelpLink" ' +
            'style="color:#f66; text-decoration:underline;">RPC Offline</a>' +
          '</div>' +
          '<div class="ncz-line23">or</div>' +
          '<div class="ncz-line23">' +
            '<a href="https://info.nanocheeze.com" target="_blank" rel="noopener" ' +
            'style="color:#0af; text-decoration:underline;">Download NCZ</a>' +
          '</div>';

        layoutStatsLines();

        const helpLink = statsDiv.querySelector("#nczRpcHelpLink");
        if (helpLink) {
          helpLink.addEventListener("click", function (e) {
            e.preventDefault();
            overlay.style.display = "flex";
          });
        }
      }
    }

    // initial fetch (REMOTE by default)
    fetchStats();

    // poll RPC every 30s
    setInterval(fetchStats, 30 * 1000);

    // update "X ago" every second based on lastBlockTimeMs
    setInterval(() => {
      if (!rpcOk) return;
      if (!lastBlockTimeMs) return;
      renderBox();
    }, 1000);

    // ----- Change RPC click (POPUP ONLY, used when LOCAL) -----
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        rpcConfig.url  = (urlInput.value  || "").trim() || "http://127.0.0.1";
        rpcConfig.port = (portInput.value || "").trim() || "12782";
        rpcConfig.user = (userInput.value || "").trim();
        rpcConfig.pass = (passInput.value || "").trim();

        saveRpcConfig();

        // update URL example line
        if (urlExample) {
          urlExample.textContent = buildRpcUrl();
        }

        // reset state and re-fetch with new settings (only matters when in local mode)
        rpcOk = false;
        statsDiv.textContent = "NCZ: reconnecting…";
        fetchStats();
      });
    }

    // ----- NEW: toggle between remote and local connection -----
    modeBtn.addEventListener("click", () => {
      useLocalRpc = !useLocalRpc;

      if (useLocalRpc) {
        modeBtn.innerHTML = "Connect<br>remotely";
        lastBalanceStr = "loading…";
      } else {
        modeBtn.innerHTML = "Connect<br>local";
        lastBalanceStr = "connect locally to get balance";
      }

      rpcOk = false;
      statsDiv.textContent = "NCZ: reconnecting…";
      fetchStats();
    });

    // ---------- Mandelbrot visibility sync: hide corner box when Mandelbrot is open ----------
    function isMandelOpen() {
      const canvas = document.getElementById("mandelCanvas");
      if (!canvas) return false;
      const style = getComputedStyle(canvas);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return false;
      return true;
    }

    function syncBoxWithMandel() {
      if (isMandelOpen()) {
        box.style.display = "none";
      } else {
        box.style.display = "";
      }
    }

    // run once and then keep in sync
    syncBoxWithMandel();
    setInterval(syncBoxWithMandel, 500);
  }
})();
