// meq-auto.js
// Auto-followup loop driven by /auto & prompts.txt
// - Requires Eve's "Auto speak responses" checkbox to be ON.
// - Usage:
//     /auto <base prompt>
//   1) Sends <base prompt> as a normal chat message.
//   2) After TTS finishes reading that reply:
//        -> sends "/eve <random prompt>".
//   3) After THAT is read:
//        -> sends a normal "<random prompt>".
//   4) Alternates Eve/normal forever until /auto toggled off.
//   5) Manual typing while auto is on pauses auto for 30s, then resumes after speech ends.

(function () {
  "use strict";

  const PROMPT_FILE_URL = "prompts.txt";

  // -------- knobs ----------
  const MANUAL_COOLDOWN_MS = 30000;     // pause auto this long after ANY manual send (covers slow streaming)
  const NO_SPEECH_TIMEOUT_MS = 60000;   // if speech never starts, don't deadlock forever
  const IDLE_KICK_MS = 6000;            // if auto is on and we've been idle this long, kick next auto
  const POLL_MS = 400;

  // internal flag so auto-sends don't trigger manual cooldown logic
  const AUTO_INTERNAL_FLAG = "__meqAutoInternal";

  let promptList = null;
  let promptsLoading = false;

  let autoModeActive = false;

  // "awaiting a speech cycle": we sent something and want to wait for speaking->done
  let awaitingNextCycle = false;
  let awaitingSeenSpeaking = false;
  let awaitingSetAtMs = 0;

  // if speech ended while paused, run once pause ends
  let pendingSpeechCompletion = false;

  // speaking edge detect
  let lastSpeakingState = false;

  // alternation
  let nextIsEve = true;

  // concurrency guard
  let autoSendInFlight = false;

  // manual pause window
  let manualPauseUntilMs = 0;

  // idle tracking
  let notSpeakingSinceMs = 0;

  // -------------------------------
  // API KEY SUPPORT (per-page only)
  // -------------------------------
  let userApiKey = "";

  function getStoredApiKey() {
    return (userApiKey || "").trim();
  }

  function setStoredApiKey(value) {
    userApiKey = (value || "").trim();
    if (typeof window !== "undefined") window.userapikey = userApiKey;
  }

  function clearStoredApiKey() {
    userApiKey = "";
    if (typeof window !== "undefined") window.userapikey = "";
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
        You can get a google api key here
        <a href="https://aistudio.google.com/app/u/2/api-keys">https://aistudio.google.com/app/u/2/api-keys</a><br /><br />
        (Note: THEY ARE FREE AND FREE API USAGE)<br />
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
    if (existing) return Promise.resolve(existing);

    createApiKeyModalIfNeeded();

    const overlay = document.getElementById("meq-api-key-modal");
    const input = document.getElementById("meq-api-key-input");
    const saveBtn = document.getElementById("meq-api-key-save");
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

  if (typeof window !== "undefined") {
    window.meqEnsureApiKey = ensureApiKey;
    window.meqClearApiKey = clearStoredApiKey;
  }

  // -------------------------------
  // UTIL
  // -------------------------------
  function pushSystemMessage(text) {
    if (typeof window.appendAIMessage === "function") {
      window.appendAIMessage("System", String(text));
    } else {
      console.log("[System]", text);
    }
  }

  function isAutoRespondEnabled() {
    return !!(
      window.meqEveOverlay &&
      Object.prototype.hasOwnProperty.call(window.meqEveOverlay, "autoSpeakEnabled") &&
      window.meqEveOverlay.autoSpeakEnabled
    );
  }

  function getSpeakingState() {
    const overlay = window.meqEveOverlay || null;
    return !!(overlay && overlay.isSpeaking);
  }

  function bumpManualPause(ms = MANUAL_COOLDOWN_MS) {
    manualPauseUntilMs = Math.max(manualPauseUntilMs, Date.now() + ms);
  }

  function armAwaitSpeechCompletion() {
    awaitingNextCycle = true;
    awaitingSeenSpeaking = false;
    awaitingSetAtMs = Date.now();
  }

  function clearAwaitState() {
    awaitingNextCycle = false;
    awaitingSeenSpeaking = false;
    awaitingSetAtMs = 0;
    pendingSpeechCompletion = false;
  }

  async function loadPromptFile() {
    if (promptList && promptList.length) return promptList;
    if (promptsLoading) return promptList || [];

    promptsLoading = true;
    try {
      const res = await fetch(PROMPT_FILE_URL, { cache: "no-cache" });
      if (!res.ok) {
        promptList = [];
      } else {
        const text = await res.text();
        promptList = (text || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      }
    } catch (err) {
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

  function stripInternalExtra(extra) {
    if (!extra || typeof extra !== "object") return extra;
    if (!Object.prototype.hasOwnProperty.call(extra, AUTO_INTERNAL_FLAG)) return extra;

    const copy = {};
    for (const k in extra) {
      if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
      if (k === AUTO_INTERNAL_FLAG) continue;
      copy[k] = extra[k];
    }
    return copy;
  }

  // -------------------------------
  // AUTO CORE
  // -------------------------------
  function canKickAutoNow() {
    if (!autoModeActive) return false;
    if (!isAutoRespondEnabled()) return false;
    if (Date.now() < manualPauseUntilMs) return false;
    if (autoSendInFlight) return false;
    return true;
  }

  async function queueAutoPrompt(useEve, sendFn) {
    if (!canKickAutoNow()) return;
    autoSendInFlight = true;

    try {
      const prompt = await getRandomPrompt();
      if (!prompt) {
        pushSystemMessage("Auto mode stopped: no usable prompts found in prompts.txt.");
        autoModeActive = false;
        clearAwaitState();
        return;
      }

      const textToSend = useEve ? "/eve " + prompt : prompt;

      // wait for the next speech cycle
      armAwaitSpeechCompletion();

      const apiKey = getStoredApiKey();
      const extra = apiKey
        ? { userapikey: apiKey, [AUTO_INTERNAL_FLAG]: true }
        : { [AUTO_INTERNAL_FLAG]: true };

      // IMPORTANT: send through the *current* send pipeline (sendFn),
      // not a captured old baseSend (that broke TTS).
      await sendFn.call(window.MeqChat, textToSend, extra);
    } catch (err) {
      console.warn("meq-auto.js: error sending auto prompt:", err);
      pushSystemMessage("Auto mode encountered an error and has been stopped.");
      autoModeActive = false;
      clearAwaitState();
    } finally {
      autoSendInFlight = false;
    }
  }

  function kickNextAuto(sendFn) {
    if (!canKickAutoNow()) return;
    const useEve = nextIsEve;
    nextIsEve = !nextIsEve;
    queueAutoPrompt(useEve, sendFn);
  }

  function pollAutoLoop(sendFn) {
    const now = Date.now();
    const speaking = getSpeakingState();
    const paused = now < manualPauseUntilMs;

    // idle tracking
    if (speaking) {
      notSpeakingSinceMs = 0;
    } else {
      if (notSpeakingSinceMs === 0) notSpeakingSinceMs = now;
    }

    if (!autoModeActive) {
      lastSpeakingState = speaking;
      return;
    }

    if (!isAutoRespondEnabled()) {
      pushSystemMessage('Auto mode stopped because "Auto speak responses" is disabled.');
      autoModeActive = false;
      clearAwaitState();
      lastSpeakingState = speaking;
      return;
    }

    // speech started for awaited cycle
    if (awaitingNextCycle && speaking) {
      awaitingSeenSpeaking = true;
    }

    // speaking -> not speaking (only if we actually saw speaking)
    if (awaitingNextCycle && awaitingSeenSpeaking && lastSpeakingState && !speaking) {
      awaitingNextCycle = false;
      awaitingSeenSpeaking = false;

      if (paused) pendingSpeechCompletion = true;
      else {
        pendingSpeechCompletion = false;
        kickNextAuto(sendFn);
      }
    }

    // pause ended, speech already completed
    if (!paused && pendingSpeechCompletion && !speaking) {
      pendingSpeechCompletion = false;
      kickNextAuto(sendFn);
    }

    // safety: if we were waiting but speech never begins, don't deadlock
    if (!paused && awaitingNextCycle && !awaitingSeenSpeaking && !speaking) {
      if (awaitingSetAtMs > 0 && (now - awaitingSetAtMs) > NO_SPEECH_TIMEOUT_MS) {
        awaitingNextCycle = false;
        awaitingSeenSpeaking = false;
        pendingSpeechCompletion = false;
        kickNextAuto(sendFn);
      }
    }

    // idle watchdog: if nothing is happening for a bit, force the next auto prompt
    if (!paused && !speaking && !awaitingNextCycle && !autoSendInFlight) {
      if (notSpeakingSinceMs && (now - notSpeakingSinceMs) >= IDLE_KICK_MS) {
        notSpeakingSinceMs = now; // prevent spamming kicks
        kickNextAuto(sendFn);
      }
    }

    lastSpeakingState = speaking;
  }

  // -------------------------------
  // INTEGRATION WITH MeqChat.send
  // -------------------------------
  function installAutoHandler() {
    if (!window.MeqChat || typeof window.MeqChat.send !== "function") return false;

    const existing = window.MeqChat.send;
    if (existing && existing.__meqAutoWrapped) return true;

    const prevSend = existing;

    async function patchedSend(userText, extra) {
      // If this is an internal auto send, DO NOT apply manual cooldown logic or /auto parsing.
      if (extra && typeof extra === "object" && extra[AUTO_INTERNAL_FLAG]) {
        return prevSend.call(window.MeqChat, userText, stripInternalExtra(extra));
      }

      const text = typeof userText === "string" ? userText : "";
      const trimmed = text.trim();

      // /auto command
      if (/^\/auto(?:\s|$)/i.test(trimmed)) {
        const argsText = trimmed.replace(/^\/auto\s*/i, "");

        if (!isAutoRespondEnabled()) {
          pushSystemMessage('To use /auto, please enable "Auto speak responses" first.');
          // still send base prompt if present
          if (argsText) {
            const maybeKey = getStoredApiKey();
            const payload = maybeKey ? { userapikey: maybeKey } : (extra || undefined);
            return prevSend.call(window.MeqChat, argsText, payload);
          }
          return null;
        }

        if (!autoModeActive) {
          try {
            await ensureApiKey();
          } catch (err) {
            pushSystemMessage("Auto mode not started: API key is required for /auto.");
            if (argsText) {
              const maybeKey = getStoredApiKey();
              const payload = maybeKey ? { userapikey: maybeKey } : (extra || undefined);
              return prevSend.call(window.MeqChat, argsText, payload);
            }
            return null;
          }

          autoModeActive = true;
          nextIsEve = true;
          pendingSpeechCompletion = false;

          // if you provided a base prompt, we want to resume after its speech cycle
          if (argsText) armAwaitSpeechCompletion();
          else clearAwaitState();

          pushSystemMessage("Auto mode enabled.");
        } else {
          autoModeActive = false;
          clearAwaitState();
          pushSystemMessage("Auto mode disabled.");
        }

        // send base prompt (if any) normally
        if (argsText) {
          const maybeKey = getStoredApiKey();
          const payload = maybeKey ? { userapikey: maybeKey } : (extra || undefined);
          return prevSend.call(window.MeqChat, argsText, payload);
        }

        return null;
      }

      // manual message while auto is ON => pause auto for 30s and ensure resume after speech
      if (autoModeActive) {
        bumpManualPause(MANUAL_COOLDOWN_MS);
        armAwaitSpeechCompletion();
        pendingSpeechCompletion = false;
      }

      return prevSend.call(window.MeqChat, userText, extra);
    }

    patchedSend.__meqAutoWrapped = true;
    window.MeqChat.send = patchedSend;

    // Poll using CURRENT send pipeline (patchedSend) so we never bypass TTS hooks.
    setInterval(() => pollAutoLoop(window.MeqChat.send), POLL_MS);

    return true;
  }

  function init() {
    function tryInstall() {
      if (installAutoHandler()) return;

      let tries = 0;
      const maxTries = 60;
      const interval = setInterval(() => {
        tries++;
        if (installAutoHandler() || tries > maxTries) clearInterval(interval);
      }, 250);
    }

    if (document.readyState === "complete") tryInstall();
    else window.addEventListener("load", tryInstall);
  }

  init();

  window.meqEnsureApiKey = ensureApiKey;
  window.meqClearApiKey = clearStoredApiKey;
})();
