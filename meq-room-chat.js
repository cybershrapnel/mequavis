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

  // Read current gasketPower from the global script.
  // Your inline script already has:
  //   let gasket = 1;
  //   let gasketPower = 1;
  function getGasketPower() {
    if (typeof gasketPower === "number" && isFinite(gasketPower) && gasketPower > 0) {
      return Math.floor(gasketPower);
    }
    // Fallback if something weird happens
    return 1;
  }

  // Logical room key for the current gasket power.
  // This is the ONLY thing we send to chat.php as "segment_address".
  function getGasketAddressKey() {
    const gp = getGasketPower();
    return "GASKET_POWER_" + gp;
  }

  // Human-readable header label
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

    // If gasket power key unchanged and we already have a room, nothing to do.
    if (gasketKey === lastGasketKey && currentRoomId) {
      updateGasketRoomHeader(); // keep header synced
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
          segment_address: gasketKey    // <-- ONLY this key now
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

    // Respect cooldown regardless of click vs Enter
    if (sendCooldownActive) {
      return;
    }

    const nameRaw  = (usernameInputEl && usernameInputEl.value) || "";
    const username = nameRaw.trim() || "Anon";

    const textRaw = messageInputEl.value || "";
    const text    = textRaw.trim();
    if (!text) return;

    // Start cooldown as soon as user actually sends something
    startSendCooldown();

    // Make sure we’re mapped to the correct current gasket power room
    await ensureRoomMapping();

    if (!currentRoomId) {
      appendToMainChat("System", "No active gasket power room; message not sent.");
      return;
    }

    // Echo locally to main chat
    appendToMainChat(username, text);

    // Clear textbox
    messageInputEl.value = "";

    // Persist username
    try {
      window.localStorage.setItem("meqGasketChatUsername", username);
    } catch (_e) {}

    // Send to server
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
  // MANUAL HISTORY LOAD
  // ---------------------------------------------------------------------------
  async function loadHistoryForCurrentRoom() {
    // Ensure mapped to correct gasket power
    await ensureRoomMapping();

    if (!currentRoomId) {
      appendToMainChat("System", "No active gasket power room; cannot load history.");
      return;
    }

    // How many messages back?
    let count = 50;
    if (historyCountInputEl) {
      const raw = historyCountInputEl.value;
      const n   = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) {
        count = n;
      }
    }

    try {
      // First: get total count cheaply by asking from a huge index
      const probeRes = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:     "poll_messages",
          room_id:    currentRoomId,
          from_index: 999999999   // PHP clamps to total
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

      // Keep polling aligned to end of log
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

    // Re-check which gasket power we’re in each poll
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
    pollTimerId = setTimeout(pollRoomMessages, 30000); // ~30 seconds
  }

  // ---------------------------------------------------------------------------
  // UI: ADD GASKET POWER ROOM BLOCK INSIDE #chatInfoPanel
  // ---------------------------------------------------------------------------
  function createGasketRoomUI(chatInfoPanel) {
    const chatInfoContent =
      chatInfoPanel.querySelector("#chatInfoContent") || chatInfoPanel;

    const block = document.createElement("div");
    block.id = "gasketRoomChatBlock";
    block.style.marginTop = "8px";
    block.style.borderTop = "1px solid #222";
    block.style.paddingTop = "6px";
    block.style.fontSize = "10px";

    block.innerHTML = ''
      // NEW: history row ABOVE the header
      + '<div id="gasketHistoryRow"'
      + '     style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">'
      + '  <button id="gasketHistoryBtn"'
      + '          style="flex:0 0 auto;padding:2px 6px;font-size:10px;'
      + '                 background:#111;border:1px solid #0ff;color:#0ff;'
      + '                 border-radius:3px;cursor:pointer;">'
      + '    Load History'
      + '  </button>'
      + '  <label style="flex:1 1 auto;font-size:10px;">'
      + '    Last'
      + '    <input type="number" id="gasketHistoryCount" value="50" min="1"'
      + '           style="width:60px;margin:0 4px;background:#050505;'
      + '                  border:1px solid #0ff;color:#0ff;border-radius:3px;'
      + '                  padding:1px 3px;font-size:10px;">'
      + '    msgs'
      + '  </label>'
      + '</div>'
      + '<h3 id="gasketRoomHeader"'
      + '    style="margin:0 0 4px 0;font-size:11px;color:#0ff;">'
      + '  Gasket Power Chat 1'
      + '</h3>'
      + '<label style="font-size:10px;display:block;margin-top:4px;">'
      + '  Username:'
      + '  <input type="text" id="gasketRoomUsername"'
      + '         style="width:100%;box-sizing:border-box;font-size:10px;'
      + '                background:#050505;border:1px solid #0ff;color:#0ff;'
      + '                border-radius:3px;padding:2px 4px;">'
      + '</label>'
      + '<textarea id="gasketRoomInput"'
      + '          style="width:100%;height:60px;box-sizing:border-box;margin-top:4px;'
      + '                 background:#050505;border:1px solid #0ff;color:#0ff;'
      + '                 font-family:monospace;font-size:10px;border-radius:3px;'
      + '                 padding:2px 4px;"></textarea>'
      + '<button id="gasketRoomSendBtn"'
      + '        style="margin-top:4px;width:100%;padding:4px;font-size:10px;'
      + '               background:#111;border:1px solid #0ff;color:#0ff;'
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

    // Restore saved username if present
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

    // Initial mapping + start polling
    ensureRoomMapping().then(function () {
      if (!pollTimerId) {
        scheduleNextPoll();
      }
    });

    // Heartbeat: if gasketPower changes in the main script, remap room + update header.
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

  // Debug handle if you want it in console
  window.MeqSegmentChat = {
    getCurrentRoomId: function () { return currentRoomId; },
    getGasketPower:   getGasketPower,
    getGasketKey:     getGasketAddressKey,
    forceRemap:       ensureRoomMapping
  };
})();
