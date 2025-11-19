// meq-room-chat.js
// Segment-based room chat that appears in the main AI output area.
// Uses chat.php on your server and does NOT modify meq-chat.js.

(function () {
  const ROOM_API_URL = "https://xtdevelopment.net/chat-proxy/chat.php";

  let currentRoomId      = null;  // UUID from server for this segment address
  let lastSegmentAddress = null;  // raw address string from #segmentLog
  let lastPollIndex      = 0;     // index for incremental polling
  let pollTimerId        = null;

  // DOM refs
  let headerEl        = null;
  let usernameInputEl = null;
  let messageInputEl  = null;
  let sendBtnEl       = null;

  // --- NEW: cooldown state for anti-spam ------------------------------------
  const SEND_COOLDOWN_SECONDS = 60;
  let sendCooldownActive      = false;
  let sendCooldownRemaining   = 0;
  let sendCooldownTimerId     = null;
  const SEND_BTN_DEFAULT_LABEL = "Send to Segment Room";

  // ---------------------------------------------------------------------------
  // UTIL: append to main chat using existing formatter
  // ---------------------------------------------------------------------------
  function appendToMainChat(sender, text) {
    if (typeof window.appendAIMessage === "function") {
      // meq-chat.js will classify this: "System" stays visible, any other name
      // becomes .msg-user and is controlled by "Hide User Chat".
      window.appendAIMessage(sender, text);
    } else {
      console.log(sender + ":", text);
    }
  }

  // ---------------------------------------------------------------------------
  // SEGMENT ADDRESS → SINGLE STRING
  // ---------------------------------------------------------------------------
  function getSegmentAddress() {
    const segLog = document.getElementById("segmentLog");
    if (!segLog) {
      return ""; // no segments / base
    }

    const raw = segLog.textContent || "";
    const trimmed = raw.replace(/\s+/g, " ").trim();

    // If nothing useful, treat as base
    return trimmed;
  }

  // ---------------------------------------------------------------------------
  // HEADER TEXT: show current UUID
  // ---------------------------------------------------------------------------
  function updateSegmentRoomHeader() {
    if (!headerEl) return;

    if (currentRoomId) {
      headerEl.textContent = "Segment Room Chat " + currentRoomId;
    } else {
      headerEl.textContent = "Segment Room Chat (base)";
    }
  }

  // ---------------------------------------------------------------------------
  // ROOM MAPPING: segment address → room UUID (handled by chat.php)
  // ---------------------------------------------------------------------------
  async function ensureRoomMapping() {
    const segAddress = getSegmentAddress();

    // If no address, we’re effectively in base / lobby
    if (!segAddress) {
      if (currentRoomId !== null) {
        currentRoomId = null;
        lastPollIndex = 0;
        updateSegmentRoomHeader();
      }
      lastSegmentAddress = "";
      return;
    }

    // If address unchanged and we already have a room, nothing to do
    if (segAddress === lastSegmentAddress && currentRoomId) {
      return;
    }

    // Address changed or first time
    lastSegmentAddress = segAddress;
    currentRoomId      = null;
    lastPollIndex      = 0;
    updateSegmentRoomHeader();

    try {
      const res = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "map_segment",
          segment_address: segAddress
        })
      });

      if (!res.ok) {
        console.error("map_segment HTTP error", res.status);
        appendToMainChat("System", "Segment room mapping failed (" + res.status + ").");
        return;
      }

      const data = await res.json();
      currentRoomId = data.room_id || null;

      if (!currentRoomId) {
        appendToMainChat("System", "Segment room mapping returned no room_id.");
      }

      if (typeof data.next_index === "number") {
        lastPollIndex = data.next_index;
      } else {
        lastPollIndex = 0;
      }

      updateSegmentRoomHeader();
    } catch (err) {
      console.error("map_segment exception", err);
      appendToMainChat("System", "Error mapping segment room: " + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // NEW: SEND BUTTON COOLDOWN LOGIC
  // ---------------------------------------------------------------------------
  function startSendCooldown() {
    if (!sendBtnEl) return;

    sendCooldownActive    = true;
    sendCooldownRemaining = SEND_COOLDOWN_SECONDS;

    // Disable button and start countdown
    sendBtnEl.disabled    = true;
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

    // Make sure we’re mapped to the correct current segment
    await ensureRoomMapping();

    if (!currentRoomId) {
      appendToMainChat("System", "No active segment room; message not sent.");
      return;
    }

    // Echo locally to main chat
    appendToMainChat(username, text);

    // Clear textbox
    messageInputEl.value = "";

    // Persist username
    try {
      window.localStorage.setItem("meqSegmentChatUsername", username);
    } catch (_e) {}

    // Send to server
    try {
      const res = await fetch(ROOM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:  "post_message",
          room_id: currentRoomId,
          username: username,
          text:    text
        })
      });

      if (!res.ok) {
        console.error("post_message HTTP error", res.status);
        appendToMainChat("System", "Segment room send failed (" + res.status + ").");
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
      appendToMainChat("System", "Error sending to segment room: " + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // POLLING: GET NEW MESSAGES
  // ---------------------------------------------------------------------------
  async function pollRoomMessages() {
    pollTimerId = null;

    // Re-check which segment we’re in each poll (so it updates when you change segments)
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
  // UI: ADD SEGMENT ROOM BLOCK INSIDE #chatInfoPanel
  // ---------------------------------------------------------------------------
  function createSegmentRoomUI(chatInfoPanel) {
    const chatInfoContent =
      chatInfoPanel.querySelector("#chatInfoContent") || chatInfoPanel;

    const block = document.createElement("div");
    block.id = "segmentRoomChatBlock";
    block.style.marginTop = "8px";
    block.style.borderTop = "1px solid #222";
    block.style.paddingTop = "6px";
    block.style.fontSize = "10px";

    block.innerHTML = ''
      + '<h3 id="segmentRoomHeader"'
      + '    style="margin:0 0 4px 0;font-size:11px;color:#0ff;">'
      + '  Segment Room Chat (base)'
      + '</h3>'
      + '<label style="font-size:10px;display:block;margin-top:4px;">'
      + '  Username:'
      + '  <input type="text" id="segmentRoomUsername"'
      + '         style="width:100%;box-sizing:border-box;font-size:10px;'
      + '                background:#050505;border:1px solid #0ff;color:#0ff;'
      + '                border-radius:3px;padding:2px 4px;">'
      + '</label>'
      + '<textarea id="segmentRoomInput"'
      + '          style="width:100%;height:60px;box-sizing:border-box;margin-top:4px;'
      + '                 background:#050505;border:1px solid #0ff;color:#0ff;'
      + '                 font-family:monospace;font-size:10px;border-radius:3px;'
      + '                 padding:2px 4px;"></textarea>'
      + '<button id="segmentRoomSendBtn"'
      + '        style="margin-top:4px;width:100%;padding:4px;font-size:10px;'
      + '               background:#111;border:1px solid #0ff;color:#0ff;'
      + '               border-radius:3px;cursor:pointer;">'
      + '  ' + SEND_BTN_DEFAULT_LABEL +
      '</button>';

    chatInfoContent.appendChild(block);

    headerEl        = block.querySelector("#segmentRoomHeader");
    usernameInputEl = block.querySelector("#segmentRoomUsername");
    messageInputEl  = block.querySelector("#segmentRoomInput");
    sendBtnEl       = block.querySelector("#segmentRoomSendBtn");

    // Restore saved username if present
    try {
      const stored = window.localStorage.getItem("meqSegmentChatUsername");
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

    updateSegmentRoomHeader();
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

    createSegmentRoomUI(panel);

    // Initial mapping + start polling
    ensureRoomMapping().then(function () {
      if (!pollTimerId) {
        scheduleNextPoll();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWhenReady);
  } else {
    initWhenReady();
  }

  // Debug handle if you want it in console
  window.MeqSegmentChat = {
    getCurrentRoomId: function () { return currentRoomId; },
    getSegmentAddress: getSegmentAddress,
    forceRemap: ensureRoomMapping
  };
})();
