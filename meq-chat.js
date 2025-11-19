// meq-chat.js

window.MeqChat = (function () {
  const modelSelect   = document.getElementById("modelSelect");
  const fullChatBtn   = document.querySelector('.action-btn[data-action="full-chat"]');
  const rightMiddleEl = document.getElementById("rightMiddle");
  const aiOutputEl    = document.getElementById("aiOutput");

  let currentSessionId        = null;
  let currentSessionCreatedAt = null;
  let sessions                = []; // [{ id, created_at, owner, title, favorite }]

  let contextMenuEl           = null;
  let contextMenuSessionId    = null;

  const state = {
    messages: [] // { role: "user" | "assistant", content: string }
  };

  // ---------------------------------------------------------------------------
  // MODEL HANDLING
  // ---------------------------------------------------------------------------
  function getCurrentModel() {
    if (!modelSelect) {
      return { provider: "gemini", model: "gemini-2.0-flash" };
    }
    const raw = modelSelect.value || "gemini:gemini-2.0-flash";
    const parts = raw.split(":");
    return {
      provider: parts[0] || "gemini",
      model: parts[1] || "gemini-2.0-flash"
    };
  }

  // ---------------------------------------------------------------------------
  // PUBLIC SEND ENTRYPOINT
  // ---------------------------------------------------------------------------
  async function send(userText) {
    const { provider, model } = getCurrentModel();

    state.messages.push({ role: "user", content: userText });

    const reply = await callPhpProxy(provider, model, state.messages);

    state.messages.push({ role: "assistant", content: reply });

    let label;
    if (provider === "openai") {
      label = `OpenAI (${model})`;
    } else if (provider === "gemini") {
      label = `Gemini (${model})`;
    } else {
      label = provider.toUpperCase();
    }

    streamAIReply(label, reply);
  }

  // ---------------------------------------------------------------------------
  // CALL PHP BACKEND (CHAT + LOGGING)
  // ---------------------------------------------------------------------------
  async function callPhpProxy(provider, model, messages) {
    try {
      const res = await fetch("chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          provider,
          model,
          session_id: currentSessionId,
          messages
        })
      });

      if (!res.ok) {
        const txt = await res.text();
        return `[Proxy error ${res.status}]: ${txt}`;
      }

      const data = await res.json();

      if (data.session_id) {
        currentSessionId = data.session_id;
        currentSessionCreatedAt = data.created_at || currentSessionCreatedAt;
        const ownerFlag = !!data.owner;
        upsertSession(currentSessionId, currentSessionCreatedAt, ownerFlag);
        renderSessionList();
      }

      return data.reply || "[Empty reply from proxy]";
    } catch (err) {
      return "[Network error: " + err.message + "]";
    }
  }

  // ---------------------------------------------------------------------------
  // SMALL MARKDOWN-ISH FORMATTER
  // - escapes HTML
  // - preserves newlines
  // - renders `inline code` as <code>…</code>
  // ---------------------------------------------------------------------------
  function formatStreamText(text) {
    if (!text) return "";

    // Escape HTML
    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Backticked inline code → <code>...</code>
    // e.g. `exp(i S[φ] / ħ)`
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Newlines → <br>
    escaped = escaped.replace(/\r\n|\r|\n/g, "<br>");

    return escaped;
  }

  // ---------------------------------------------------------------------------
  // APPEND A FULLY-FORMATTED MESSAGE (USED FOR HISTORY + NON-STREAMED)
  // ---------------------------------------------------------------------------
  function appendFormattedMessage(sender, text) {
    if (!aiOutputEl) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = "msg";

    const senderSpan = document.createElement("span");
    senderSpan.className = "sender";
    senderSpan.textContent = sender + ": ";

    const contentSpan = document.createElement("span");
    contentSpan.className = "streamed-text";
    contentSpan.innerHTML = formatStreamText(text);

    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(contentSpan);
    aiOutputEl.appendChild(msgDiv);

    const scrollEl = rightMiddleEl || aiOutputEl.parentElement || aiOutputEl;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // STREAMING / CHUNKED OUTPUT (WORD/TOKEN-BASED) + AUTO-SCROLL
  // ---------------------------------------------------------------------------
  function streamAIReply(senderLabel, fullText) {
    if (!aiOutputEl) {
      if (typeof window.appendAIMessage === "function") {
        window.appendAIMessage(senderLabel, fullText);
      }
      return;
    }

    const msgDiv = document.createElement("div");
    msgDiv.className = "msg";

    const senderSpan = document.createElement("span");
    senderSpan.className = "sender";
    senderSpan.textContent = senderLabel + ": ";

    const contentSpan = document.createElement("span");
    contentSpan.className = "streamed-text";

    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(contentSpan);
    aiOutputEl.appendChild(msgDiv);

    const scrollEl = rightMiddleEl || aiOutputEl.parentElement || aiOutputEl;
    scrollEl.scrollTop = scrollEl.scrollHeight;

    const tokens = fullText.match(/(\s+|[^\s]+)/g) || [];
    let idx = 0;
    const delay = 40;
    let renderedSoFar = "";

    function step() {
      if (idx >= tokens.length) return;
      const nextToken = tokens[idx++];
      renderedSoFar += nextToken;

      // Re-render with formatting: newlines + `code`
      contentSpan.innerHTML = formatStreamText(renderedSoFar);

      scrollEl.scrollTop = scrollEl.scrollHeight;
      setTimeout(step, delay);
    }

    step();
  }

  // ---------------------------------------------------------------------------
  // CHAT SESSION PANEL (LEFT SIDE IN FULL CHAT MODE)
  // ---------------------------------------------------------------------------
  function createSessionPanel() {
    if (document.getElementById("chatSessionPanel")) return;

    const panel = document.createElement("div");
    panel.id = "chatSessionPanel";
    panel.innerHTML = `
      <h2>Chat Sessions</h2>
      <button id="newSessionBtn">NEW SESSION</button>
      <div id="sessionList"></div>
    `;
    document.body.appendChild(panel);

    const newBtn = panel.querySelector("#newSessionBtn");
    if (newBtn) {
      newBtn.addEventListener("click", startNewSession);
    }

    // Context menu
    contextMenuEl = document.createElement("div");
    contextMenuEl.id = "sessionContextMenu";
    contextMenuEl.innerHTML = `
      <div data-menu-action="rename">Rename Session</div>
    `;
    document.body.appendChild(contextMenuEl);

    contextMenuEl.addEventListener("click", onContextMenuClick);
    document.addEventListener("click", (e) => {
      if (!contextMenuEl) return;
      if (e.target === contextMenuEl || contextMenuEl.contains(e.target)) return;
      hideContextMenu();
    });
  }

  // ---------------------------------------------------------------------------
  // RIGHT INFO / ADS PANEL (RIGHT SIDE IN FULL CHAT MODE)
  // ---------------------------------------------------------------------------
  function createRightInfoPanel() {
    if (document.getElementById("chatInfoPanel")) return;

    const panel = document.createElement("div");
    panel.id = "chatInfoPanel";
    panel.innerHTML = `
      <h2>MEQUA Info Panel</h2>
      <div id="chatInfoContent">
        <div style="font-size:11px; color:#0ff;">
          <!-- Placeholder content; you can replace this later -->
          
          <p><img src="ncz.png"></p>
<p>MEQUA News:</p>
<p>Gemini 2.0 Flash model is active for use.</p>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  function startNewSession() {
    currentSessionId = null;
    currentSessionCreatedAt = null;
    state.messages = [];

    if (aiOutputEl) {
      aiOutputEl.innerHTML = "";
    }

    renderSessionList();
  }

  function upsertSession(id, createdAt, owner, title, favorite) {
    if (!id) return;
    const existing = sessions.find(s => s.id === id);
    if (existing) {
      if (createdAt && !existing.created_at) existing.created_at = createdAt;
      if (typeof owner === "boolean") existing.owner = owner;
      if (typeof title === "string") existing.title = title;
      if (typeof favorite === "boolean") existing.favorite = favorite;
    } else {
      sessions.push({
        id,
        created_at: createdAt || "",
        owner: !!owner,
        title: typeof title === "string" ? title : "",
        favorite: !!favorite
      });
    }
  }

  function renderSessionList() {
    const panel = document.getElementById("chatSessionPanel");
    if (!panel) return;

    const listEl = panel.querySelector("#sessionList");
    if (!listEl) return;

    if (!sessions.length) {
      listEl.innerHTML = `<div class="session-entry">No sessions yet</div>`;
      return;
    }

    listEl.innerHTML = "";
    sessions.forEach(s => {
      const entry = document.createElement("div");
      entry.className = "session-entry";
      if (s.id === currentSessionId) {
        entry.classList.add("current");
      }
      if (s.owner) {
        entry.classList.add("owned");
      }

      const labelSpan = document.createElement("span");
      labelSpan.className = "session-label";

      const base = s.title && s.title.trim()
        ? s.title.trim()
        : (s.created_at || s.id);

      const text = (s.id === currentSessionId)
        ? `Current: ${base}`
        : base;

      labelSpan.textContent = text;
      entry.appendChild(labelSpan);

      if (s.owner) {
        const favBtn = document.createElement("button");
        favBtn.className = "fav-btn " + (s.favorite ? "solid" : "hollow");
        favBtn.textContent = s.favorite ? "★" : "☆";
        favBtn.title = s.favorite ? "Unfavorite" : "Favorite";

        favBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleFavorite(s.id);
        });

        entry.appendChild(favBtn);
      }

      entry.dataset.sessionId = s.id;

      entry.addEventListener("click", () => {
        if (s.id === currentSessionId) return;
        loadSessionFromServer(s.id);
      });

      entry.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!s.owner) return; // only owner can rename
        showContextMenu(s.id, e.pageX, e.pageY);
      });

      listEl.appendChild(entry);
    });
  }

  async function loadSessionList() {
    try {
      const res = await fetch("chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_sessions" })
      });

      if (!res.ok) return;

      const data = await res.json();
      sessions = Array.isArray(data.sessions) ? data.sessions : [];
      renderSessionList();
    } catch (err) {
      console.error("Error loading session list:", err);
    }
  }

  async function loadSessionFromServer(sessionId) {
    try {
      const res = await fetch("chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "load_session",
          session_id: sessionId
        })
      });

      if (!res.ok) {
        console.error("Failed to load session", sessionId);
        return;
      }

      const data = await res.json();
      currentSessionId        = data.session_id || sessionId;
      currentSessionCreatedAt = data.created_at || null;
      const ownerFlag         = !!data.owner;
      const title             = typeof data.title === "string" ? data.title : "";
      const favorite          = !!data.favorite;

      const msgs = Array.isArray(data.messages) ? data.messages : [];
      state.messages = msgs;

      if (aiOutputEl) {
        aiOutputEl.innerHTML = "";
      }

      // Re-render history with formatting (line breaks + inline code)
      msgs.forEach(msg => {
        const role = msg.role || "";
        const content = msg.content || "";
        const sender = role === "user" ? "You" : "AI";
        appendFormattedMessage(sender, content);
      });

      upsertSession(currentSessionId, currentSessionCreatedAt, ownerFlag, title, favorite);
      renderSessionList();
    } catch (err) {
      console.error("Error loading session:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // FAVORITES + META UPDATE
  // ---------------------------------------------------------------------------
  async function toggleFavorite(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.owner) return;

    const newFav = !s.favorite;
    s.favorite = newFav;
    renderSessionList();

    try {
      await fetch("chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_session_meta",
          session_id: sessionId,
          favorite: newFav
        })
      });
    } catch (err) {
      console.error("Error updating favorite:", err);
    }
  }

  async function renameSession(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.owner) return;

    const currentLabel = s.title && s.title.trim()
      ? s.title.trim()
      : (s.created_at || s.id);

    const newName = window.prompt("Rename session:", currentLabel);
    if (newName === null) return;

    const trimmed = newName.trim();
    s.title = trimmed;
    renderSessionList();

    try {
      await fetch("chat-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_session_meta",
          session_id: sessionId,
          title: trimmed
        })
      });
    } catch (err) {
      console.error("Error renaming session:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // CONTEXT MENU (RENAME)
  // ---------------------------------------------------------------------------
  function showContextMenu(sessionId, x, y) {
    if (!contextMenuEl) return;
    contextMenuSessionId = sessionId;
    contextMenuEl.style.display = "block";
    contextMenuEl.style.left = x + "px";
    contextMenuEl.style.top = y + "px";
  }

  function hideContextMenu() {
    if (!contextMenuEl) return;
    contextMenuEl.style.display = "none";
    contextMenuSessionId = null;
  }

  function onContextMenuClick(e) {
    const action = e.target.getAttribute("data-menu-action");
    if (!action || !contextMenuSessionId) return;

    const sid = contextMenuSessionId;
    hideContextMenu();

    if (action === "rename") {
      renameSession(sid);
    }
  }

  // ---------------------------------------------------------------------------
  // FULL CHAT MODE (EXPAND PANEL & HIDE OTHER BUTTONS + SHOW SIDE COLUMNS)
  // ---------------------------------------------------------------------------
  function installFullChatButton() {
    if (!fullChatBtn) return;

    const style = document.createElement("style");
    style.textContent = `
      /* Chat session panel (left) */
      #chatSessionPanel {
        position: fixed;
        left: 10px;
        top: 60px;
        width: 260px;
        height: calc(100vh - 70px);
        background: #050505;
        border: 1px solid #0ff;
        padding: 8px;
        font-family: monospace;
        font-size: 11px;
        color: #0ff;
        overflow-y: auto;
        z-index: 998;
        display: none;
      }
      #chatSessionPanel h2 {
        font-size: 12px;
        margin-bottom: 4px;
        color: #0ff;
      }
      #chatSessionPanel #newSessionBtn {
        width: 100%;
        margin-bottom: 6px;
        padding: 4px;
        background: #111;
        color: #0ff;
        border: 1px solid #0ff;
        border-radius: 4px;
        cursor: pointer;
        font-family: monospace;
        font-size: 11px;
      }
      #chatSessionPanel #newSessionBtn:hover {
        background: #033;
      }
      #chatSessionPanel .session-entry {
        border-bottom: 1px solid #222;
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      #chatSessionPanel .session-entry:hover {
        background: #033;
      }
      #chatSessionPanel .session-entry.current {
        background: #022;
      }
      #chatSessionPanel .session-entry.owned {
        border-left: 2px solid #0f0;
      }
      #chatSessionPanel .session-label {
        flex: 1 1 auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #chatSessionPanel .fav-btn {
        flex: 0 0 auto;
        padding: 0 4px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 13px;
      }
      #chatSessionPanel .fav-btn.solid {
        color: #0f0;
      }
      #chatSessionPanel .fav-btn.hollow {
        color: #0f0;
        opacity: 0.4;
      }

      /* Right info/ads panel (right side) */
      #chatInfoPanel {
        position: fixed;
        right: 10px;
        top: 60px;
        width: 260px;
        height: calc(100vh - 70px);
        background: #050505;
        border: 1px solid #0ff;
        padding: 8px;
        font-family: monospace;
        font-size: 11px;
        color: #0ff;
        overflow-y: auto;
        z-index: 998;
        display: none;
      }
      #chatInfoPanel h2 {
        font-size: 12px;
        margin-bottom: 4px;
        color: #0ff;
      }

      /* Context menu */
      #sessionContextMenu {
        position: absolute;
        display: none;
        background: #111;
        border: 1px solid #0ff;
        font-family: monospace;
        font-size: 11px;
        color: #0ff;
        z-index: 2000;
        min-width: 140px;
      }
      #sessionContextMenu div {
        padding: 4px 8px;
        cursor: pointer;
      }
      #sessionContextMenu div:hover {
        background: #033;
      }

      /* Hide original left segment panel in full chat */
      body.chat-full-active #segmentLog {
        display: none !important;
      }

      /* Show chat side panels in full chat */
      body.chat-full-active #chatSessionPanel {
        display: block;
      }
      body.chat-full-active #chatInfoPanel {
        display: block;
      }

      /* Expand middle chat panel between left + right columns */
      body.chat-full-active #rightPanel {
        position: fixed;
        left: 280px;
        right: 280px;
        top: 70px;
        bottom: 20px;
        width: auto;
        height: auto;
        z-index: 999;
      }

      body.chat-full-active #rightTop {
        flex: 0 0 auto;
      }
      body.chat-full-active #rightTop .action-btn {
        display: none;
      }
      body.chat-full-active #rightTop .action-btn[data-action="full-chat"] {
        display: block;
      }

      /* Streamed text: preserve line breaks */
      #aiOutput .streamed-text {
        white-space: normal;
      }

      /* Inline code / formulas: subtle monospace, no big boxes */
      #aiOutput code {
        font-family: monospace;
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);

    fullChatBtn.addEventListener("click", () => {
      const body = document.body;
      const activating = !body.classList.contains("chat-full-active");

      if (activating) {
        body.classList.add("chat-full-active");
        fullChatBtn.textContent = "COLLAPSE CHAT";
      } else {
        body.classList.remove("chat-full-active");
        fullChatBtn.textContent = "FULL CHAT MODE";
      }

      if (typeof window.updateCanvasScale === "function") {
        window.updateCanvasScale();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------
  installFullChatButton();
  createSessionPanel();
  createRightInfoPanel();
  loadSessionList();

  // Override the global appendAIMessage so existing code uses the formatter too
  window.appendAIMessage = appendFormattedMessage;

  return {
    send
  };
})();
