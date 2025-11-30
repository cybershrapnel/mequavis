// meq-room-chat.js
// Gasket Power–based room chat that appears in the main AI output area.
// Uses chat.php on your server and does NOT modify meq-chat.js.
//
// Behavior:
//  - We DO NOT look at #segmentLog at all.
//  - We DO NOT require any changes to the main script.
//  - We read the existing global "gasketPower" that your title logic already uses.
//  - Room key = "GASKET_POWER_<gasketPower>".
//  - Header text = "Gasket Power Chat <gasketPower>".

(function () {
  const ROOM_API_URL = "https://xtdevelopment.net/chat-proxy/chat.php";

  let currentRoomId     = null;  // UUID from server for this gasket power
  let lastGasketKey     = null;  // "GASKET_POWER_1", "GASKET_POWER_2", ...
  let lastPollIndex     = 0;     // index for incremental polling
  let pollTimerId       = null;
let lastLocalSent = null;
let lastSystemLocalSent = null; // optional, for NCZ system echo

  // Separate NCZ system room (global, not per gasket)
  const SYSTEM_SEGMENT_KEY = "GASKET_POWER_0";  // fixed segment address for system events

  let systemRoomId        = null;  // UUID from server for system room
  let systemLastPollIndex = 0;     // index for incremental polling (system)
  let systemPollTimerId   = null;


  // DOM refs
  let headerEl            = null;
  let usernameInputEl     = null;
  let messageInputEl      = null;
  let sendBtnEl           = null;
  let historyBtnEl        = null;
  let historyCountInputEl = null;

  // --- SEND cooldown state for anti-spam ------------------------------------
  const SEND_COOLDOWN_SECONDS   = 60;
  let sendCooldownActive        = false;
  let sendCooldownRemaining     = 0;
  let sendCooldownTimerId       = null;
  const SEND_BTN_DEFAULT_LABEL  = "Send to Gasket Power Chat";

  // ---------------------------------------------------------------------------
  // UTIL: append to main chat using existing formatter
  // ---------------------------------------------------------------------------
  function appendToMainChat(sender, text) {
    if (typeof window.appendAIMessage === "function") {
      window.appendAIMessage(sender, text);
    } else {
      console.log(sender + ":", text);
    }
  }

  // ---------------------------------------------------------------------------
  // GASKET POWER HELPERS
  // ---------------------------------------------------------------------------

function isNoCooldownRoom() {
  return getGasketPower() === 0;
}

function getGasketPower() {
  // Prefer the canvas-exposed window.gasketPower
  if (typeof window.gasketPower === "number" && isFinite(window.gasketPower)) {
    return Math.floor(window.gasketPower); // can be 0, 1, 2, ...
  }

  // optional: also check the "current" alias you set in drawTitle, just in case
  if (typeof window.gasketPowerCurrent === "number" && isFinite(window.gasketPowerCurrent)) {
    return Math.floor(window.gasketPowerCurrent);
  }

  // fallback
  return 1;
}



  function getGasketAddressKey() {
    const gp = getGasketPower();
    return "GASKET_POWER_" + gp;
  }

  function getGasketHeaderLabel() {
    const gp = getGasketPower();
    return "Gasket Power Chat " + gp;
  }

  // ---------------------------------------------------------------------------
  // HEADER TEXT
  // ---------------------------------------------------------------------------
  function updateGasketRoomHeader() {
    if (!headerEl) return;
    headerEl.textContent = getGasketHeaderLabel();
  }

  // ---------------------------------------------------------------------------
  // ROOM MAPPING: gasket power → room UUID (handled by chat.php)
  // ---------------------------------------------------------------------------
  async function ensureRoomMapping() {
    const gasketKey = getGasketAddressKey();

    if (gasketKey === lastGasketKey && currentRoomId) {
      updateGasketRoomHeader();
      return;
    }

    lastGasketKey = gasketKey;
    currentRoomId = null;
    lastPollIndex = 0;
    updateGasketRoomHeader();

    try {
      const res = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "map_segment",
          segment_address: gasketKey
        })
      });

      if (!res.ok) {
        console.error("map_segment HTTP error", res.status);
        appendToMainChat("System", "Gasket power room mapping failed (" + res.status + ").");
        return;
      }

      const data = await res.json();
      currentRoomId = data.room_id || null;

      if (!currentRoomId) {
        appendToMainChat("System", "Gasket power room mapping returned no room_id.");
      }

      if (typeof data.next_index === "number") {
        lastPollIndex = data.next_index;
      } else {
        lastPollIndex = 0;
      }

      updateGasketRoomHeader();
    } catch (err) {
      console.error("map_segment exception", err);
      appendToMainChat("System", "Error mapping gasket power room: " + err.message);
    }
  }


  // ---------------------------------------------------------------------------
  // SYSTEM ROOM MAPPING: fixed segment → room UUID (handled by chat.php)
  // ---------------------------------------------------------------------------
  async function ensureSystemRoomMapping() {
    if (systemRoomId) return;

    try {
      const res = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "map_segment",
          segment_address: SYSTEM_SEGMENT_KEY
        })
      });

      if (!res.ok) {
        console.error("system map_segment HTTP error", res.status);
        appendToMainChat("System", "System chat room mapping failed (" + res.status + ").");
        return;
      }

      const data = await res.json();
      systemRoomId = data.room_id || null;

      if (!systemRoomId) {
        appendToMainChat("System", "System chat mapping returned no room_id.");
      }

      if (typeof data.next_index === "number") {
        systemLastPollIndex = data.next_index;
      } else {
        systemLastPollIndex = 0;
      }
    } catch (err) {
      console.error("system map_segment exception", err);
      appendToMainChat("System", "Error mapping system chat room: " + err.message);
    }
  }


  // ---------------------------------------------------------------------------
  // SEND BUTTON COOLDOWN LOGIC
  // ---------------------------------------------------------------------------
  function startSendCooldown() {
    if (!sendBtnEl) return;

    sendCooldownActive    = true;
    sendCooldownRemaining = SEND_COOLDOWN_SECONDS;

    sendBtnEl.disabled      = true;
    sendBtnEl.style.opacity = "0.6";
    sendBtnEl.style.cursor  = "default";
    sendBtnEl.textContent   = "Send (" + sendCooldownRemaining + ")";

    if (sendCooldownTimerId) {
      clearInterval(sendCooldownTimerId);
      sendCooldownTimerId = null;
    }

    sendCooldownTimerId = setInterval(function () {
      sendCooldownRemaining--;

      if (sendCooldownRemaining <= 0) {
        clearInterval(sendCooldownTimerId);
        sendCooldownTimerId = null;
        sendCooldownActive  = false;

        sendBtnEl.disabled      = false;
        sendBtnEl.style.opacity = "";
        sendBtnEl.style.cursor  = "pointer";
        sendBtnEl.textContent   = SEND_BTN_DEFAULT_LABEL;
      } else {
        sendBtnEl.textContent = "Send (" + sendCooldownRemaining + ")";
      }
    }, 1000);
  }

  // ---------------------------------------------------------------------------
  // SEND CHAT MESSAGE TO ROOM
  // ---------------------------------------------------------------------------
  async function sendRoomMessage() {
  if (!messageInputEl) return;

  // ❌ block only if cooldown is active AND this is NOT gasket 0
  if (sendCooldownActive && !isNoCooldownRoom()) {
    return;
  }

  const nameRaw  = (usernameInputEl && usernameInputEl.value) || "";
  const username = nameRaw.trim() || "Anon";

  const textRaw = messageInputEl.value || "";
  const text    = textRaw.trim();
  if (!text) return;

  // ❌ don't start cooldown if gasket 0
  if (!isNoCooldownRoom()) {
    startSendCooldown();
  }

  await ensureRoomMapping();

  if (!currentRoomId) {
    appendToMainChat("System", "No active gasket power room; message not sent.");
    return;
  }

appendToMainChat(username, text);

lastLocalSent = {
  roomId: currentRoomId,
  username,
  text,
  ts: Date.now()
};

messageInputEl.value = "";

    try {
      window.localStorage.setItem("meqGasketChatUsername", username);
    } catch (_e) {}

    try {
      const res = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:   "post_message",
          room_id:  currentRoomId,
          username: username,
          text:     text
        })
      });

      if (!res.ok) {
        console.error("post_message HTTP error", res.status);
        appendToMainChat("System", "Gasket power room send failed (" + res.status + ").");
        return;
      }

      const data = await res.json();
      if (typeof data.next_index === "number") {
        lastPollIndex = data.next_index;
      } else if (typeof data.index === "number") {
        lastPollIndex = data.index + 1;
      }
    } catch (err) {
      console.error("post_message exception", err);
      appendToMainChat("System", "Error sending to gasket power room: " + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // PROGRAMMATIC POST TO SYSTEM ROOM (for NCZ chain / system events)
  // ---------------------------------------------------------------------------
 // SINGLE version only – the one that uses SYSTEM_SEGMENT_KEY / systemRoomId
// SINGLE version only – the one that uses SYSTEM_SEGMENT_KEY / systemRoomId
async function postSystemRoomMessage(text, username) {
  const uname = (username || "System").toString();
  const t     = (text || "").toString().trim();
  if (!t) return;

  // ✅ map to NCZ_SYSTEM, not a gasket power
  await ensureSystemRoomMapping();

  if (!systemRoomId) {
    console.warn("No active system room; system message not sent.");
    return;
  }

  // Show in main chat immediately
  appendToMainChat(uname, t);

  try {
    const res = await fetch(ROOM_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action:   "post_message",
        room_id:  systemRoomId,  // ✅ system room, NOT currentRoomId
        username: uname,
        text:     t
      })
    });

    if (!res.ok) {
      console.error("system post_message HTTP error", res.status);
      appendToMainChat("System", "Failed to broadcast system event (" + res.status + ").");
      return;
    }

    const data = await res.json();
    if (typeof data.next_index === "number") {
      systemLastPollIndex = data.next_index;
    } else if (typeof data.index === "number") {
      systemLastPollIndex = data.index + 1;
    }
  } catch (err) {
    console.error("system post_message exception", err);
    appendToMainChat("System", "Error broadcasting system event: " + err.message);
  }
}

// Global bridge used by the watermark panel
window.MeqSystemChat = {
  postMessage: function (text, username) {
    return postSystemRoomMessage(text, username);
  }
};




  // ---------------------------------------------------------------------------
  // MANUAL HISTORY LOAD
  // ---------------------------------------------------------------------------
  async function loadHistoryForCurrentRoom() {
    await ensureRoomMapping();

    if (!currentRoomId) {
      appendToMainChat("System", "No active gasket power room; cannot load history.");
      return;
    }

    let count = 50;
    if (historyCountInputEl) {
      const raw = historyCountInputEl.value;
      const n   = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) {
        count = n;
      }
    }

    try {
      const probeRes = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:     "poll_messages",
          room_id:    currentRoomId,
          from_index: 999999999
        })
      });

      if (!probeRes.ok) {
        console.error("history probe HTTP error", probeRes.status);
        appendToMainChat("System", "Failed to probe gasket history (" + probeRes.status + ").");
        return;
      }

      const probeData = await probeRes.json();
      const total     = typeof probeData.next_index === "number"
        ? probeData.next_index
        : 0;

      if (total <= 0) {
        appendToMainChat("System", "No history for this gasket power room.");
        return;
      }

      const startIndex = Math.max(0, total - count);

      const histRes = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:     "poll_messages",
          room_id:    currentRoomId,
          from_index: startIndex
        })
      });

      if (!histRes.ok) {
        console.error("history fetch HTTP error", histRes.status);
        appendToMainChat("System", "Failed to load gasket history (" + histRes.status + ").");
        return;
      }

      const histData = await histRes.json();
      const msgs     = Array.isArray(histData.messages) ? histData.messages : [];

      if (!msgs.length) {
        appendToMainChat("System", "No additional history messages.");
        return;
      }

      appendToMainChat(
        "System",
        `Loaded last ${Math.min(count, total)} message(s) for ${getGasketHeaderLabel()}.`
      );

      msgs.forEach(m => {
        const u = (m.username || "Anon").toString();
        const t = (m.text || "").toString();
        appendToMainChat(u, t);
      });

      if (typeof histData.next_index === "number") {
        if (histData.next_index > lastPollIndex) {
          lastPollIndex = histData.next_index;
        }
      } else if (total > lastPollIndex) {
        lastPollIndex = total;
      }
    } catch (err) {
      console.error("history fetch exception", err);
      appendToMainChat("System", "Error loading gasket history: " + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // POLLING: GET NEW MESSAGES
  // ---------------------------------------------------------------------------
  async function pollRoomMessages() {
    pollTimerId = null;

    await ensureRoomMapping();

    if (!currentRoomId) {
      scheduleNextPoll();
      return;
    }

    try {
      const res = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:     "poll_messages",
          room_id:    currentRoomId,
          from_index: lastPollIndex
        })
      });

      if (!res.ok) {
        console.error("poll_messages HTTP error", res.status);
        scheduleNextPoll();
        return;
      }

const data = await res.json();
const msgs = Array.isArray(data.messages) ? data.messages : [];

if (msgs.length > 0) {
  msgs.forEach(function (m) {
    const u = (m.username || "Anon").toString();
    const t = (m.text || "").toString();

    // 🔁 skip our own most recent message for ~10 seconds
    if (
      lastLocalSent &&
      lastLocalSent.roomId === currentRoomId &&
      lastLocalSent.username === u &&
      lastLocalSent.text === t &&
      Date.now() - lastLocalSent.ts < 10000
    ) {
      return;
    }

    appendToMainChat(u, t);
  });
}

      if (typeof data.next_index === "number") {
        lastPollIndex = data.next_index;
      } else {
        lastPollIndex += msgs.length;
      }
    } catch (err) {
      console.error("poll_messages exception", err);
    }

    scheduleNextPoll();
  }

  function scheduleNextPoll() {
    pollTimerId = setTimeout(pollRoomMessages, 30000);
  }

  // ---------------------------------------------------------------------------
  // POLLING: SYSTEM ROOM MESSAGES
  // ---------------------------------------------------------------------------
  async function pollSystemMessages() {
    systemPollTimerId = null;

    await ensureSystemRoomMapping();

    if (!systemRoomId) {
      scheduleSystemPoll();
      return;
    }

    try {
      const res = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:     "poll_messages",
          room_id:    systemRoomId,
          from_index: systemLastPollIndex
        })
      });

      if (!res.ok) {
        console.error("system poll_messages HTTP error", res.status);
        scheduleSystemPoll();
        return;
      }

      const data = await res.json();
      const msgs = Array.isArray(data.messages) ? data.messages : [];

      if (msgs.length > 0) {
        msgs.forEach(function (m) {
          const u = (m.username || "System").toString();
          const t = (m.text || "").toString();
          appendToMainChat(u, t);
        });
      }

      if (typeof data.next_index === "number") {
        systemLastPollIndex = data.next_index;
      } else {
        systemLastPollIndex += msgs.length;
      }
    } catch (err) {
      console.error("system poll_messages exception", err);
    }

    scheduleSystemPoll();
  }

  function scheduleSystemPoll() {
    systemPollTimerId = setTimeout(pollSystemMessages, 30000);
  }



  // ---------------------------------------------------------------------------
  // UI: ADD GASKET POWER ROOM BLOCK INSIDE #chatInfoPanel
  // ---------------------------------------------------------------------------
  function createGasketRoomUI(chatInfoPanel) {
    const chatInfoContent =
      chatInfoPanel.querySelector("#chatInfoContent") || chatInfoPanel;

    // Accent-following CSS for gasket UI + ad border candidates
    let accentStyle = document.getElementById("meqGasketAccentStyle");
    if (!accentStyle) {
      accentStyle = document.createElement("style");
      accentStyle.id = "meqGasketAccentStyle";
      accentStyle.textContent = `
        #gasketRoomChatBlock input,
        #gasketRoomChatBlock textarea {
          border-color: var(--meq-accent) !important;
          color: var(--meq-accent) !important;
        }
        #gasketRoomChatBlock button {
          border-color: var(--meq-accent) !important;
          color: var(--meq-accent) !important;
        }
        #gasketRoomHeader {
          color: var(--meq-accent) !important;
        }

        /* Ad area border follow accent (covers common ids/classes you use) */
        #meqAdArea, #meqAdPanel, #adArea, #adPanel,
        .meq-ad, .meq-ads, .meq-ad-wrap, .ad-area {
          border-color: var(--meq-accent) !important;
        }
      `;
      document.head.appendChild(accentStyle);
    }

    const block = document.createElement("div");
    block.id = "gasketRoomChatBlock";
    block.style.marginTop = "8px";
    block.style.borderTop = "1px solid #222";
    block.style.paddingTop = "6px";
    block.style.fontSize = "10px";

    block.innerHTML = ''
      + '<div id="gasketHistoryRow"'
      + '     style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">'
      + '  <button id="gasketHistoryBtn"'
      + '          style="flex:0 0 auto;padding:2px 6px;font-size:10px;'
      + '                 background:#111;'
      + '                 border:1px solid var(--meq-accent);'
      + '                 color:var(--meq-accent);'
      + '                 border-radius:3px;cursor:pointer;">'
      + '    Load History'
      + '  </button>'
      + '  <label style="flex:1 1 auto;font-size:10px;">'
      + '    Last'
      + '    <input type="number" id="gasketHistoryCount" value="50" min="1"'
      + '           style="width:60px;margin:0 4px;background:#050505;'
      + '                  border:1px solid var(--meq-accent);'
      + '                  color:var(--meq-accent);'
      + '                  border-radius:3px;'
      + '                  padding:1px 3px;font-size:10px;">'
      + '    msgs'
      + '  </label>'
      + '</div>'
      + '<h3 id="gasketRoomHeader"'
      + '    style="margin:0 0 4px 0;font-size:11px;'
      + '           color:var(--meq-accent);">'
      + '  Gasket Power Chat 1'
      + '</h3>'
      + '<label style="font-size:10px;display:block;margin-top:4px;">'
      + '  Username:'
      + '  <input type="text" id="gasketRoomUsername"'
      + '         style="width:100%;box-sizing:border-box;font-size:10px;'
      + '                background:#050505;'
      + '                border:1px solid var(--meq-accent);'
      + '                color:var(--meq-accent);'
      + '                border-radius:3px;padding:2px 4px;">'
      + '</label>'
      + '<textarea id="gasketRoomInput"'
      + '          style="width:100%;height:60px;box-sizing:border-box;margin-top:4px;'
      + '                 background:#050505;'
      + '                 border:1px solid var(--meq-accent);'
      + '                 color:var(--meq-accent);'
      + '                 font-family:monospace;font-size:10px;border-radius:3px;'
      + '                 padding:2px 4px;"></textarea>'
      + '<button id="gasketRoomSendBtn"'
      + '        style="margin-top:4px;width:100%;padding:4px;font-size:10px;'
      + '               background:#111;'
      + '               border:1px solid var(--meq-accent);'
      + '               color:var(--meq-accent);'
      + '               border-radius:3px;cursor:pointer;">'
      + '  ' + SEND_BTN_DEFAULT_LABEL +
      '</button>';

    chatInfoContent.appendChild(block);

    headerEl            = block.querySelector("#gasketRoomHeader");
    usernameInputEl     = block.querySelector("#gasketRoomUsername");
    messageInputEl      = block.querySelector("#gasketRoomInput");
    sendBtnEl           = block.querySelector("#gasketRoomSendBtn");
    historyBtnEl        = block.querySelector("#gasketHistoryBtn");
    historyCountInputEl = block.querySelector("#gasketHistoryCount");

    try {
      const stored = window.localStorage.getItem("meqGasketChatUsername");
      if (stored && usernameInputEl) {
        usernameInputEl.value = stored;
      }
    } catch (_e) {}

    if (sendBtnEl) {
      sendBtnEl.addEventListener("click", function () {
        sendRoomMessage();
      });
    }

    if (messageInputEl) {
      messageInputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendRoomMessage();
        }
      });
    }

    if (historyBtnEl) {
      historyBtnEl.addEventListener("click", function () {
        loadHistoryForCurrentRoom();
      });
    }

    updateGasketRoomHeader();
  }

  // ---------------------------------------------------------------------------
  // INIT: WAIT FOR #chatInfoPanel, THEN BUILD UI AND START POLLING
  // ---------------------------------------------------------------------------
  function initWhenReady() {
    const panel = document.getElementById("chatInfoPanel");
    if (!panel) {
      setTimeout(initWhenReady, 250);
      return;
    }

    createGasketRoomUI(panel);

    ensureRoomMapping().then(function () {
      if (!pollTimerId) {
        scheduleNextPoll();
      }
    });

    // Start system room polling in parallel
    ensureSystemRoomMapping().then(function () {
      if (!systemPollTimerId) {
        scheduleSystemPoll();
      }
    });


    let lastLabel = getGasketHeaderLabel();
    setInterval(() => {
      const lbl = getGasketHeaderLabel();
      if (lbl !== lastLabel) {
        lastLabel = lbl;
        ensureRoomMapping();
      } else {
        updateGasketRoomHeader();
      }
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWhenReady);
  } else {
    initWhenReady();
  }

  


  window.MeqSegmentChat = {
    getCurrentRoomId: function () { return currentRoomId; },
    getGasketPower:   getGasketPower,
    getGasketKey:     getGasketAddressKey,
    forceRemap:       ensureRoomMapping
    // you can keep any previous helpers here if you already added them
  };

  // New: global access to the system chat room for NCZ / internal events
  window.MeqSystemChat = {
    postMessage: function (text, username) {
      return postSystemRoomMessage(text, username);
    }
  };
})();

