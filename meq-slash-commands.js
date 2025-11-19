// meq-slash-commands.js
// Discord-style /command popup bound to #aiInput
// - Only shows when textarea contains exactly "/" (ignoring whitespace)
// - Commands:
//   /eve, /help, /auto
//   — separator —
//   /video, /audio, /image, /music

(function () {
  // NEW: endpoint for slash commands
  const SLASH_ENDPOINT =
    "https://xtdevelopment.net/chat-proxy/slash-proxy.php";

  const textarea = document.getElementById("aiInput");
  if (!textarea) return;

  const PRIMARY_COMMANDS = [
    { name: "eve",   label: "/eve",   desc: "Talk to eve persona" },
    { name: "help",  label: "/help",  desc: "Show help / tips" },
    { name: "auto",  label: "/auto",  desc: "Toggle auto mode" }
  ];

  const EXTRA_COMMANDS = [
    { name: "video", label: "/video", desc: "Video-related command" },
    { name: "audio", label: "/audio", desc: "Audio-related command" },
    { name: "image", label: "/image", desc: "Image-related command" },
    { name: "music", label: "/music", desc: "Music-related command" }
  ];

  // Create dropdown element
  const menu = document.createElement("div");
  menu.id = "slashCommandMenu";
  menu.style.cssText = `
    position: fixed;
    display: none;
    background:#050505;
    border:1px solid #0ff;
    color:#0ff;
    font-family:monospace;
    font-size:11px;
    z-index:2000;
    max-height:160px;
    overflow-y:auto;
    border-radius:4px;
    box-shadow:0 0 10px rgba(0,255,255,0.3);
  `;
  document.body.appendChild(menu);

  let visible = false;
  let selectedIndex = 0;
  let ignoreBlur = false;

  function getTotalCommandCount() {
    return PRIMARY_COMMANDS.length + EXTRA_COMMANDS.length;
  }

  function getCommandByIndex(idx) {
    const primaryCount = PRIMARY_COMMANDS.length;
    if (idx < 0 || idx >= getTotalCommandCount()) return null;
    if (idx < primaryCount) return PRIMARY_COMMANDS[idx];
    return EXTRA_COMMANDS[idx - primaryCount];
  }

  function renderMenu() {
    menu.innerHTML = "";
    const total = getTotalCommandCount();

    if (!total) {
      const empty = document.createElement("div");
      empty.textContent = "No commands";
      empty.style.padding = "4px 8px";
      empty.style.opacity = "0.6";
      menu.appendChild(empty);
      return;
    }

    let indexCounter = 0;

    function addItemForCommand(cmd) {
      const item = document.createElement("div");
      item.className = "slash-item";
      item.dataset.cmdIndex = String(indexCounter);
      item.style.cssText = `
        padding:4px 8px;
        cursor:pointer;
        display:flex;
        justify-content:space-between;
        gap:8px;
        white-space:nowrap;
      `;
      if (indexCounter === selectedIndex) {
        item.style.background = "#033";
      }

      const label = document.createElement("span");
      label.textContent = cmd.label;

      const desc = document.createElement("span");
      desc.textContent = cmd.desc;
      desc.style.opacity = "0.7";

      item.appendChild(label);
      item.appendChild(desc);

      item.addEventListener("mouseenter", () => {
        selectedIndex = Number(item.dataset.cmdIndex || 0);
        highlightSelection();
      });

      item.addEventListener("mousedown", (e) => {
        // Prevent textarea blur from killing the menu before selection
        e.preventDefault();
        ignoreBlur = true;
        applySelection();
      });

      menu.appendChild(item);
      indexCounter++;
    }

    // Primary commands
    PRIMARY_COMMANDS.forEach(addItemForCommand);

    // Separator (visual line break) before extra commands
    if (EXTRA_COMMANDS.length) {
      const sep = document.createElement("div");
      sep.style.cssText = `
        margin:2px 0;
        border-top:1px solid #222;
      `;
      menu.appendChild(sep);
    }

    // Extra commands
    EXTRA_COMMANDS.forEach(addItemForCommand);
  }

  function highlightSelection() {
    const items = menu.querySelectorAll(".slash-item");
    items.forEach((el) => {
      const idx = Number(el.dataset.cmdIndex || 0);
      el.style.background = (idx === selectedIndex) ? "#033" : "transparent";
    });
  }

  function positionMenu() {
    const rect = textarea.getBoundingClientRect();
    const width = rect.width;

    // Show temporarily to measure height
    menu.style.visibility = "hidden";
    menu.style.display = "block";
    menu.style.width = width + "px";

    const menuHeight = menu.offsetHeight || 80;
    let top = rect.top - menuHeight - 4;
    if (top < 0) top = 4;

    menu.style.top = top + "px";
    menu.style.left = rect.left + "px";

    menu.style.visibility = "visible";
  }

  function showMenu() {
    if (visible) return;
    visible = true;
    selectedIndex = 0;
    renderMenu();
    positionMenu();
    menu.style.display = "block";
  }

  function hideMenu() {
    visible = false;
    menu.style.display = "none";
  }

  // Only show menu when textarea is exactly "/" (ignoring whitespace)
  function updateMenuVisibility() {
    const value = textarea.value || "";
    const trimmed = value.trim();

    if (trimmed === "/" && getTotalCommandCount() > 0) {
      showMenu();
      highlightSelection();
      positionMenu();
    } else {
      hideMenu();
    }
  }

  function applySelection() {
    const cmd = getCommandByIndex(selectedIndex);
    if (!cmd) {
      hideMenu();
      return;
    }

    // Replace the "/" with the selected command + space
    textarea.value = cmd.label + " ";
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

    hideMenu();
  }

  // Handle typing in the textarea
  textarea.addEventListener("input", () => {
    updateMenuVisibility();
  });

  // IMPORTANT: use capture=true so Enter doesn't fall through
  textarea.addEventListener(
    "keydown",
    (e) => {
      if (!visible) return;

      const total = getTotalCommandCount();
      if (!total) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          selectedIndex = (selectedIndex + 1) % total;
          highlightSelection();
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          selectedIndex = (selectedIndex - 1 + total) % total;
          highlightSelection();
          break;
        case "Enter":
          // Use command instead of sending chat
          e.preventDefault();
          e.stopPropagation();
          applySelection();
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          hideMenu();
          break;
        default:
          // Normal typing; visibility handled by input listener
          break;
      }
    },
    true // <-- capture phase so we intercept before the normal send handler
  );

  // Hide menu when clicking elsewhere
  document.addEventListener("click", (e) => {
    if (!visible) return;
    if (e.target === textarea || menu.contains(e.target)) return;
    hideMenu();
  });

  // Handle blur on textarea (but allow click on menu)
  textarea.addEventListener("blur", () => {
    setTimeout(() => {
      if (ignoreBlur) {
        ignoreBlur = false;
        return;
      }
      hideMenu();
    }, 0);
  });

  // Reposition on resize
  window.addEventListener("resize", () => {
    if (visible) positionMenu();
  });

  // ---------------------------------------------------------------------------
  // SLASH COMMAND HANDLER + MeqChat.send PATCH
  // ---------------------------------------------------------------------------

  async function handleSlashCommand(fullText) {
  const trimmed = (fullText || "").trim();
  if (!trimmed.startsWith("/")) return null;

  const withoutSlash = trimmed.slice(1);
  const parts = withoutSlash.split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const argsText = parts.slice(1).join(" ");

  // 🔹 NEW: pull the active session from MeqChat if available
  let sessionId = null;
  if (window.MeqChat && typeof window.MeqChat.getCurrentSessionId === "function") {
    sessionId = window.MeqChat.getCurrentSessionId();
  }

      let reply = "";
    let meta  = null;

    try {
      const currentSessionId =
        window.MeqChat && typeof window.MeqChat.getCurrentSessionId === "function"
          ? window.MeqChat.getCurrentSessionId()
          : null;

      const res = await fetch(SLASH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmd,
          text: argsText,
          raw: trimmed,
          session_id: currentSessionId || ""
        })
      });

      if (!res.ok) {
        const txt = await res.text();
        reply = `[Slash error ${res.status}]: ${txt}`;
      } else {
        const data = await res.json().catch(() => ({}));
        meta  = data || {};
        reply = meta.reply || "[Slash command returned empty reply]";
      }
    } catch (err) {
      reply = "[Slash network error: " + err.message + "]";
    }

    // Update frontend session state if slash-proxy returned a session_id
    if (
      meta &&
      meta.session_id &&
      window.MeqChat &&
      typeof window.MeqChat.adoptSessionFromSlash === "function"
    ) {
      window.MeqChat.adoptSessionFromSlash(meta);
    }

    // Show it in the main log using your existing appendAIMessage hook
    if (typeof window.appendAIMessage === "function") {
      const senderLabel = cmd === "eve" ? "eve" : "System";
      window.appendAIMessage(senderLabel, reply);
    }

    return reply;

}


  function patchMeqChatSend() {
    if (!window.MeqChat || typeof window.MeqChat.send !== "function") {
      return;
    }

    const originalSend = window.MeqChat.send;

    window.MeqChat.send = async function (userText) {
      const text = typeof userText === "string" ? userText : "";
      if (text.trim().startsWith("/")) {
        // Route through slash endpoint instead of normal AI proxy
        return handleSlashCommand(text);
      }
      // Normal chat path
      return originalSend.call(window.MeqChat, userText);
    };
  }

  // Wait until everything is loaded so MeqChat exists
  window.addEventListener("load", patchMeqChatSend);
})();
