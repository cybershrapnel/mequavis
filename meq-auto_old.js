
// meq-auto.js
// Auto-followup loop driven by /auto & prompts.txt
// - Requires Eve's "Auto speak responses" checkbox to be ON.
// - Usage:
//     /auto <base prompt>
//   1) Sends <base prompt> as a normal chat message (current model) using the
//      user API key (if provided via popup).
//   2) After Eve finishes reading that reply out loud:
//        -> sends an Eve-style reply using the same function /eve uses
//           (internally via "/eve <random prompt>" to MeqChat.send).
//   3) After THAT reply is read out loud:
//        -> sends a plain `<random prompt>` as a normal chat message.
//   4) Steps 2 and 3 then ALTERNATE: Eve prompt, normal prompt, Eve prompt, normal prompt...
//   5) Sending /auto again toggles auto mode OFF.

(function () {
  "use strict";

  const PROMPT_FILE_URL = "prompts.txt";

  let promptList = null;
  let promptsLoading = false;

  let autoModeActive = false;
  let awaitingNextCycle = false;
  let lastSpeakingState = false;

  // true => next auto prompt goes to Eve (via /eve)
  // false => next auto prompt goes to normal AI
  let nextIsEve = true;

  // ---------------------------------------------------------------------------
  // API KEY SUPPORT (per-page only, no localStorage/global reuse)
  // ---------------------------------------------------------------------------

  let userApiKey = ""; // in-page only

  function logDebug(...args) {
    const DEBUG = false; // set true for console logging if you want
    if (DEBUG) console.log("[meq-auto]", ...args);
  }

  function getStoredApiKey() {
    return (userApiKey || "").trim();
  }

  function setStoredApiKey(value) {
    userApiKey = (value || "").trim();

    // Expose to rest of page so other code can read if desired
    if (typeof window !== "undefined") {
      window.userapikey = userApiKey;
      // console.log("[meq-auto] window.userapikey set to:", window.userapikey);
    }
  }

function clearStoredApiKey() {
  userApiKey = "";
  if (typeof window !== "undefined") {
    window.userapikey = "";
  }
}



  function createApiKeyModalIfNeeded() {
    if (document.getElementById("meq-api-key-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "meq-api-key-modal";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.display = "none";
    overlay.style.zIndex = "9999";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const box = document.createElement("div");
    box.style.background = "#222";
    box.style.color = "#fff";
    box.style.padding = "16px";
    box.style.borderRadius = "8px";
    box.style.maxWidth = "420px";
    box.style.width = "90%";
    box.style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
    box.style.fontFamily = "system-ui, sans-serif";

    box.innerHTML = `
      <h2 style="margin-top:0;margin-bottom:8px;font-size:18px;">API key required for /auto</h2>
      <p style="margin-top:0;margin-bottom:12px;font-size:13px;line-height:1.4;">
        Enter a Google Flash 2.0 API key for this page to use.<br /><br />
It will be used for /auto traffic and all gemini/eve responses until page reload.<br /><br />
Your key is never stored and only passed to google via our proxy.<br /><br />
You can get a google api key here <a href="https://aistudio.google.com/app/u/2/api-keys">https://aistudio.google.com/app/u/2/api-keys</a><br /><br />(Note: THEY ARE FREE AND FREE API USAGE)<br />
***If you use a paid API key and /auto mode I am not responsible for the bill.<br />
      </p>
      <input id="meq-api-key-input" type="password"
             autocomplete="off"
             style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:6px 8px;border-radius:4px;border:1px solid #555;background:#111;color:#fff;" />
      <div style="text-align:right;">
        <button type="button" id="meq-api-key-cancel"
                style="margin-right:8px;padding:6px 10px;border-radius:4px;border:0;background:#444;color:#eee;cursor:pointer;">
          Cancel
        </button>
        <button type="button" id="meq-api-key-save"
                style="padding:6px 10px;border-radius:4px;border:0;background:#4caf50;color:#fff;cursor:pointer;">
          Save
        </button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function ensureApiKey() {
    const existing = getStoredApiKey();
    if (existing) {
      return Promise.resolve(existing);
    }

    createApiKeyModalIfNeeded();

    const overlay   = document.getElementById("meq-api-key-modal");
    const input     = document.getElementById("meq-api-key-input");
    const saveBtn   = document.getElementById("meq-api-key-save");
    const cancelBtn = document.getElementById("meq-api-key-cancel");

    if (!overlay || !input || !saveBtn || !cancelBtn) {
      return Promise.reject(new Error("API key modal not available"));
    }

    overlay.style.display = "flex";
    input.value = "";
    input.focus();

    return new Promise((resolve, reject) => {
      function cleanup() {
        saveBtn.removeEventListener("click", onSave);
        cancelBtn.removeEventListener("click", onCancel);
        input.removeEventListener("keydown", onKeyDown);
      }

      function onSave() {
        const val = input.value.trim();
        if (!val) {
          input.focus();
          return;
        }
        setStoredApiKey(val);
        overlay.style.display = "none";
        cleanup();
        resolve(val);
      }

      function onCancel() {
        overlay.style.display = "none";
        cleanup();
        reject(new Error("API key entry cancelled"));
      }

      function onKeyDown(ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          onSave();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          onCancel();
        }
      }

      saveBtn.addEventListener("click", onSave);
      cancelBtn.addEventListener("click", onCancel);
      input.addEventListener("keydown", onKeyDown);
    });
  }
  // Make the API-key helper available to other scripts (e.g., /api command)
  if (typeof window !== "undefined") {
    window.meqEnsureApiKey = ensureApiKey;
  }
  // ---------------------------------------------------------------------------
  // UTIL
  // ---------------------------------------------------------------------------

  function isAutoRespondEnabled() {
    // Tied to meq-eve-mouth.js auto-speak checkbox
    return !!(
      window.meqEveOverlay &&
      Object.prototype.hasOwnProperty.call(window.meqEveOverlay, "autoSpeakEnabled") &&
      window.meqEveOverlay.autoSpeakEnabled
    );
  }

  async function loadPromptFile() {
    if (promptList && promptList.length) return promptList;
    if (promptsLoading) return promptList || [];

    promptsLoading = true;
    try {
      const res = await fetch(PROMPT_FILE_URL, { cache: "no-cache" });
      if (!res.ok) {
        console.warn(
          "meq-auto.js: failed to load prompts.txt:",
          res.status,
          await res.text().catch(() => "")
        );
        promptList = [];
      } else {
        const text = await res.text();
        promptList = (text || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      }
    } catch (err) {
      console.warn("meq-auto.js: error loading prompts.txt:", err);
      promptList = [];
    } finally {
      promptsLoading = false;
    }
    return promptList;
  }

  async function getRandomPrompt() {
    const prompts = await loadPromptFile();
    if (!prompts || !prompts.length) return null;
    const idx = Math.floor(Math.random() * prompts.length);
    return prompts[idx];
  }

  function pushSystemMessage(text) {
    if (typeof window.appendAIMessage === "function") {
      window.appendAIMessage("System", String(text));
    } else {
      console.log("[System]", text);
    }
  }

  // ---------------------------------------------------------------------------
  // AUTO LOOP CORE
  // ---------------------------------------------------------------------------

  async function queueAutoPrompt(useEve, baseSend) {
    if (!autoModeActive) return;

    // Double-check that auto respond is still enabled; if not, bail.
    if (!isAutoRespondEnabled()) {
      pushSystemMessage(
        'Auto mode stopped because "Auto speak responses" was turned off.'
      );
      autoModeActive = false;
      awaitingNextCycle = false;
      return;
    }

    const prompt = await getRandomPrompt();
    if (!prompt) {
      pushSystemMessage(
        "Auto mode stopped: no usable prompts found in prompts.txt."
      );
      autoModeActive = false;
      awaitingNextCycle = false;
      return;
    }

    // If useEve === true, send as "/eve ..." so it flows through the same path as /eve
    const textToSend = useEve ? "/eve " + prompt : prompt;

    logDebug("Queueing auto prompt:", { useEve, textToSend });

    // Mark that we're now waiting for the NEXT full dictation cycle to end
    awaitingNextCycle = true;

    try {
      const apiKey = getStoredApiKey();
      if (apiKey) {
        await baseSend.call(window.MeqChat, textToSend, { userapikey: apiKey });
      } else {
        await baseSend.call(window.MeqChat, textToSend);
      }
    } catch (err) {
      console.warn("meq-auto.js: error sending auto prompt:", err);
      pushSystemMessage("Auto mode encountered an error and has been stopped.");
      autoModeActive = false;
      awaitingNextCycle = false;
    }
  }

  function onSpeechCycleComplete(baseSend) {
    if (!autoModeActive) return;

    // Alternate: Eve -> normal -> Eve -> normal ...
    queueAutoPrompt(nextIsEve, baseSend);
    nextIsEve = !nextIsEve;
  }

  function pollAutoLoop(baseSend) {
    const overlay = window.meqEveOverlay || null;
    const speaking = !!(overlay && overlay.isSpeaking);

    if (!autoModeActive) {
      lastSpeakingState = speaking;
      return;
    }

    // If auto-speak gets turned off mid-loop, kill auto mode
    if (!isAutoRespondEnabled()) {
      if (autoModeActive) {
        pushSystemMessage(
          'Auto mode stopped because "Auto speak responses" is disabled.'
        );
      }
      autoModeActive = false;
      awaitingNextCycle = false;
      lastSpeakingState = speaking;
      return;
    }

    // Detect transition: speaking -> not speaking
    if (awaitingNextCycle && lastSpeakingState && !speaking) {
      awaitingNextCycle = false;
      onSpeechCycleComplete(baseSend);
    }

    lastSpeakingState = speaking;
  }

  // ---------------------------------------------------------------------------
  // INTEGRATION WITH MeqChat.send
  // ---------------------------------------------------------------------------

  function installAutoHandler() {
    if (!window.MeqChat || typeof window.MeqChat.send !== "function") {
      return false;
    }

    // baseSend is the slash-aware version once meq-slash-commands has patched it
    const baseSend = window.MeqChat.send;

    // Avoid double-patching: if we've already wrapped, don't wrap again.
    if (baseSend && baseSend.__meqAutoWrapped) {
      return true;
    }

    async function patchedSend(userText, extra) {
      const text = typeof userText === "string" ? userText : "";
      const trimmed = text.trim();

      if (/^\/auto(?:\s|$)/i.test(trimmed)) {
        // Extract everything after "/auto"
        const argsText = trimmed.replace(/^\/auto\s*/i, "");

        const autoRespondOn = isAutoRespondEnabled();

        if (!autoRespondOn) {
          pushSystemMessage(
            'To use /auto, please enable "Auto speak responses" first.'
          );
        } else {
          // Toggle auto mode
          if (!autoModeActive) {
            // Enabling /auto for the first time in this page: require API key.
            try {
              await ensureApiKey();
            } catch (err) {
              pushSystemMessage(
                "Auto mode not started: API key is required for /auto."
              );
              // Still send base prompt (if any) using whatever extra was passed in
              if (argsText) {
                const maybeKey = getStoredApiKey();
                const extraPayload = maybeKey ? { userapikey: maybeKey } : (extra || undefined);
                return baseSend.call(window.MeqChat, argsText, extraPayload);
              }
              return null;
            }

            autoModeActive = true;
            awaitingNextCycle = !!argsText; // only if we're about to send base
            nextIsEve = true; // first auto followup goes to Eve
            pushSystemMessage("Auto mode enabled.");
          } else {
            autoModeActive = false;
            awaitingNextCycle = false;
            pushSystemMessage("Auto mode disabled.");
          }
        }

        // For both enable and disable, if there is a base prompt, send it like normal
        if (argsText) {
          const maybeKey = getStoredApiKey();
          const extraPayload = maybeKey ? { userapikey: maybeKey } : (extra || undefined);
          return baseSend.call(window.MeqChat, argsText, extraPayload);
        }

        // If no args, this was just a toggle. Nothing to send.
        return null;
      }

      // Non-/auto messages follow existing logic (/eve, /help, etc.), just pass through.
      return baseSend.call(window.MeqChat, userText, extra);
    }

    // mark to avoid double-wrapping later
    patchedSend.__meqAutoWrapped = true;

    window.MeqChat.send = patchedSend;

    // Start polling for Eve speech completion
    setInterval(() => pollAutoLoop(patchedSend), 400);

    logDebug("meq-auto.js: auto handler installed.");
    return true;
  }

  function init() {
    // We want to run AFTER slash-commands patches MeqChat.send,
    // so we hook on window 'load' instead of DOMContentLoaded.
    function tryInstall() {
      if (installAutoHandler()) return;

      let tries = 0;
      const maxTries = 60; // ~15s @ 250ms
      const interval = setInterval(() => {
        tries++;
        if (installAutoHandler() || tries > maxTries) {
          clearInterval(interval);
        }
      }, 250);
    }

    if (document.readyState === "complete") {
      // load already fired; just try now
      tryInstall();
    } else {
      window.addEventListener("load", tryInstall);
    }
  }

  init();

  // expose to other scripts (slash commands, etc.)
  window.meqEnsureApiKey = ensureApiKey;
  window.meqClearApiKey  = clearStoredApiKey;
})();
