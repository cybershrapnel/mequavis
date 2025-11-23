// meq-whisper.js
// Hybrid wake-word + dictation system that plugs into your EXISTING audio/TTS (meq-eve-mouth.js).
//
// Wake/command keywords (always-on when idle, unless disabled):
//   - "prompt"            -> clears prompt box, starts dictation
//   - "cancel"            -> stops Eve TTS playback
//   - "play reply"        -> replays last Eve reply (meqEveOverlay.speak())
//   - "fast forward audio"-> skip Eve speech forward ~5s
//   - "rewind audio"      -> skip Eve speech backward ~5s
//   - "layer up"          -> clicks canvas Layer Up button
//   - "layer down <n>"    -> clicks small nofur digit n (0-9)
//
// Dictation mode:
//   - Starts ONLY after wake word or mic click.
//   - 5s "finish timer" starts AFTER we detect real speech.
//   - Timer refreshes on any speech; when it expires -> stop dictation.
//   - If user says just "prompt" while dictating -> stop dictation immediately.
//   - Wake/command listener is DISABLED while dictating (no crossfire).
//   - Strips leading "prompt" from the first dictation chunk if SR leaks it.
//   - Auto-submits SEND if textarea has >= 50 chars after dictation ends.
//   - Auto-listen toggle checkbox inserted under your left-column checkboxes.
//
// No new audio system is created here. We only call window.meqEveOverlay.* if present.

(function () {
  "use strict";

  // -----------------------------
  // CONFIG (override via window.MEQ_WHISPER_CONFIG before this file loads)
  // -----------------------------
  const DEFAULT_CONFIG = {
    promptSelectors: [
      "#promptText",
      "#promptInput",
      "#userPrompt",
      "#userInput",
      "#chatInput",
      "#aiInput",
      "textarea[name='prompt']",
      "textarea",
      "input[type='text']"
    ],

    sendButtonSelectors: [
      "#aiSend",
      "#sendBtn",
      "button#send",
      "button[data-action='send']",
      "button.send",
      "input[type='submit']",
      "button[type='submit']"
    ],

    micButtonSelector: null, // if you already have a mic btn elsewhere

    // Position mic above prompt, right aligned
    micAboveOffsetPx: 6,
    micRightOffsetPx: 0,

    lang: (navigator.language || "en-US"),

    // Dictation SR opts
    interimResults: true,

    // Wake SR opts
    wakeContinuous: true,
    wakeInterimResults: true,

    // Hybrid finish timer
    finishDelayMs: 5000, // 5s after speech stops
    minCharsToAutosend: 50,

    // Wake/command words
    promptWord: "prompt",
    cancelWord: "cancel",
    playReplyPhrase: "play reply",
    ffPhrase: "fast forward audio",
    rwPhrase: "rewind audio",
    layerUpPhrase: "layer up",
    layerDownPhrase: "layer down",

    // Debugging
    debug: false
  };

  const CFG = Object.assign({}, DEFAULT_CONFIG, window.MEQ_WHISPER_CONFIG || {});
  const log = (...a) => CFG.debug && console.log("[MeqWhisper]", ...a);

  function logKeyword(word, snippet) {
    console.log(`[MeqWhisper] KEYWORD HEARD: ${word} | snippet="${snippet}"`);
  }

  // -----------------------------
  // ELEMENT RESOLUTION
  // -----------------------------
  function findPromptEl() {
    for (const sel of CFG.promptSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findSendBtn() {
    for (const sel of CFG.sendButtonSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  let promptEl = findPromptEl();
  if (!promptEl) {
    console.warn("[MeqWhisper] No prompt textarea/input found. Whisper disabled.");
    return;
  }

  // -----------------------------
  // SPEECH RECOGNITION SETUP
  // -----------------------------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn("[MeqWhisper] SpeechRecognition not supported in this browser.");
    try { promptEl.title = "Mic dictation not supported in this browser."; } catch (e) {}
    return;
  }

  // Two recognizers: wake + dictation
  const wakeRecog = new SR();
  wakeRecog.lang = CFG.lang;
  wakeRecog.continuous = !!CFG.wakeContinuous;
  wakeRecog.interimResults = !!CFG.wakeInterimResults;

  const dictRecog = new SR();
  dictRecog.lang = CFG.lang;
  dictRecog.continuous = true; // hybrid listening
  dictRecog.interimResults = !!CFG.interimResults;

  let autoListenEnabled = true; // toggled via left-column checkbox

  // Persist pref
  const AUTO_LISTEN_KEY = "meq_whisper_autolisten_enabled";
  try {
    const stored = localStorage.getItem(AUTO_LISTEN_KEY);
    if (stored === "false") autoListenEnabled = false;
  } catch (e) {}

  function setAutoListenEnabled(v) {
    autoListenEnabled = !!v;
    try {
      localStorage.setItem(AUTO_LISTEN_KEY, autoListenEnabled ? "true" : "false");
    } catch (e) {}
    if (autoListenEnabled) startWakeListening();
    else stopWakeListening();
  }

  // -----------------------------
  // BASIC CANVAS CLICK HELPERS
  // -----------------------------
  function getCanvasEl() {
    return document.getElementById("mequavis");
  }

  function dispatchCanvasClickAtCanvasXY(canvas, x, y) {
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = rect.left + x / scaleX;
    const clientY = rect.top  + y / scaleY;

    const evt = new MouseEvent("click", {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      view: window
    });

    canvas.dispatchEvent(evt);
    return true;
  }

  // Finds & clicks a small nofur with digit 0-9 (left/right small wheels)
  function clickSmallNofurDigit(digit) {
    const canvas = getCanvasEl();
    if (!canvas) return false;

    const list = Array.isArray(window.nofurs) ? window.nofurs : [];
    if (!list.length) return false;

    const digitStr = String(digit);

    // 1) Prefer small nofurs by baseDigit
    let target = list.find(n =>
      (n.flag === "left" || n.flag === "right") &&
      n.baseDigit != null &&
      String(n.baseDigit) === digitStr &&
      n.center
    );

    // 2) Fallback: match visible digit from label/address tail
    if (!target) {
      target = list.find(n =>
        (n.flag === "left" || n.flag === "right") &&
        n.center &&
        (
          (typeof n.label === "string"   && n.label.trim().endsWith(digitStr)) ||
          (typeof n.address === "string" && n.address.trim().endsWith(digitStr))
        )
      );
    }

    if (!target) return false;

    return dispatchCanvasClickAtCanvasXY(canvas, target.center.x, target.center.y);
  }

  // Clicks the red Layer Up button on canvas (your UI draws it right side lower control)
  function clickLayerUpButton() {
    const canvas = getCanvasEl();
    if (!canvas) return false;

    // These coordinates match your canvas "LAYER UP" box approx:
    // centerX - controlOffsetX, centerY + controlOffsetY
    // We'll approximate by using window.meqCanvas if present.
    const mc = window.meqCanvas;
    if (!mc || !mc.center) return false;

    const centerX = mc.center.x;
    const centerY = mc.center.y + 245;

    const controlOffsetX = 90;
    const controlOffsetY = 100;

    // The "LAYER UP" rectangle is left-bottom control:
    const clickX = centerX - controlOffsetX;
    const clickY = centerY + controlOffsetY + 10;

    return dispatchCanvasClickAtCanvasXY(canvas, clickX, clickY);
  }

  // -----------------------------
  // EXISTING EVE AUDIO HOOKS
  // -----------------------------
  function stopEveAudio() {
    if (window.meqEveOverlay && typeof window.meqEveOverlay.stopSpeech === "function") {
      window.meqEveOverlay.stopSpeech();
      return true;
    }
    return false;
  }

  function playEveReply() {
    if (window.meqEveOverlay && typeof window.meqEveOverlay.speak === "function") {
      window.meqEveOverlay.speak();
      return true;
    }
    return false;
  }

  function fastForwardEveAudio() {
    if (window.meqEveOverlay && typeof window.meqEveOverlay.skipForward === "function") {
      window.meqEveOverlay.skipForward(5);
      return true;
    }
    return false;
  }

  function rewindEveAudio() {
    if (window.meqEveOverlay && typeof window.meqEveOverlay.skipBackward === "function") {
      window.meqEveOverlay.skipBackward(5);
      return true;
    }
    return false;
  }

  // -----------------------------
  // MIC BUTTON UI (above prompt, right aligned)
  // -----------------------------
  function createMicButtonAbovePrompt() {
    if (CFG.micButtonSelector) {
      const existing = document.querySelector(CFG.micButtonSelector);
      if (existing) return existing;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "meqMicBtn";
    btn.textContent = "🎤";
    btn.title = "Dictate into prompt (toggle mic)";
    btn.style.cssText = `
      background: #111;
      color: #0f0;
      border: 1px solid var(--meq-accent, #0ff);
      border-radius: 6px;
      padding: 2px 6px;
      font-family: monospace;
      font-size: 12px;
      cursor: pointer;
      line-height: 1;
      display: inline-block;
      white-space: nowrap;
    `;

    // If prompt already wrapped, reuse it
    let wrap = promptEl.parentElement;
    if (!wrap || !wrap.classList || !wrap.classList.contains("meq-prompt-wrap")) {
      wrap = document.createElement("div");
      wrap.className = "meq-prompt-wrap";

      wrap.style.position = "relative";
      wrap.style.display = "block";
      wrap.style.width = "100%";
      wrap.style.boxSizing = "border-box";
      wrap.style.flex = "1 1 auto";
      wrap.style.minWidth = "0";

      const oldParent = promptEl.parentElement;
      oldParent.insertBefore(wrap, promptEl);
      wrap.appendChild(promptEl);

      promptEl.style.width = "100%";
      promptEl.style.boxSizing = "border-box";
      if (getComputedStyle(promptEl).display === "inline") {
        promptEl.style.display = "block";
      }
    }

    btn.style.position = "absolute";
    btn.style.right = `${CFG.micRightOffsetPx}px`;
    btn.style.bottom = `calc(100% + ${CFG.micAboveOffsetPx}px)`;
    btn.style.zIndex = "9999";

    wrap.appendChild(btn);
    return btn;
  }

  const micBtn = createMicButtonAbovePrompt();

  // CSS for mic-on state + interim preview
  const style = document.createElement("style");
  style.textContent = `
    .meq-has-interim {
      position: relative;
    }
    .meq-has-interim::after {
      content: attr(data-meq-interim);
      position: absolute;
      left: 8px;
      right: 8px;
      bottom: 6px;
      font-family: monospace;
      font-size: 10px;
      color: #888;
      pointer-events: none;
      white-space: pre-wrap;
      opacity: 0.7;
    }
    #meqMicBtn.listening {
      color: #f00 !important;
      border-color: #f00 !important;
      box-shadow: 0 0 6px #f00;
    }
  `;
  document.head.appendChild(style);

  // -----------------------------
  // INTERIM PREVIEW / INSERT
  // -----------------------------
  let interimBuffer = "";
  let suppressFirstWakeWord = false;

  function renderInterimPreview() {
    const el = promptEl;
    if (!el) return;
    try {
      if (interimBuffer) {
        el.dataset.meqInterim = interimBuffer;
        el.classList.add("meq-has-interim");
      } else {
        el.dataset.meqInterim = "";
        el.classList.remove("meq-has-interim");
      }
    } catch (e) {}
  }

  function insertText(text) {
    if (!text) return;

    let el = promptEl;
    if (!document.contains(el)) {
      promptEl = findPromptEl();
      el = promptEl;
      if (!el) return;
    }

    // Strip leading wake word once if SR leaks it
    if (suppressFirstWakeWord) {
      const lower = text.trim().toLowerCase();
      const wake = CFG.promptWord.toLowerCase();
      if (lower === wake) {
        suppressFirstWakeWord = false;
        return;
      }
      if (lower.startsWith(wake + " ")) {
        text = text.trim().slice(wake.length).trimStart();
      }
      suppressFirstWakeWord = false;
    }

    const chunk = text + (/\s$/.test(text) ? "" : " ");

    if (el.selectionStart == null) {
      el.value = (el.value || "") + chunk;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);

    el.value = before + chunk + after;
    const newPos = before.length + chunk.length;
    el.selectionStart = el.selectionEnd = newPos;

    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function clearPrompt() {
    if (!promptEl) return;
    promptEl.value = "";
    promptEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // -----------------------------
  // WAKE / COMMAND PARSING
  // -----------------------------
  function normalizeSpeech(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function snippetHasPhrase(snippet, phrase) {
    const n = normalizeSpeech(snippet);
    const p = normalizeSpeech(phrase);
    return n.includes(p);
  }

  function parseSpokenDigitFromLayerDown(snippet) {
    // "layer down 7" or "layer down seven"
    const n = normalizeSpeech(snippet);
    const base = normalizeSpeech(CFG.layerDownPhrase);
    const idx = n.indexOf(base);
    if (idx === -1) return null;

    const tail = n.slice(idx + base.length).trim();
    if (!tail) return null;

    const wordToDigit = {
      "zero":0,"one":1,"two":2,"three":3,"four":4,
      "five":5,"six":6,"seven":7,"eight":8,"nine":9
    };

    // First token after phrase
    const tok = tail.split(" ")[0];
    if (/^\d$/.test(tok)) return parseInt(tok, 10);
    if (wordToDigit.hasOwnProperty(tok)) return wordToDigit[tok];
    return null;
  }

  // Debounce so SR repeats don't multi-fire
  const CMD_DEBOUNCE_MS = 1200;
  const lastCmdTs = {
    prompt: 0,
    cancel: 0,
    playReply: 0,
    ff: 0,
    rw: 0,
    layerUp: 0,
    layerDown: 0
  };

  // -----------------------------
  // WAKE LISTENING STATE
  // -----------------------------
  let wakeListening = false;
  let dictListening = false;

  function startWakeListening() {
    if (!autoListenEnabled) return;
    if (dictListening) return;
    if (wakeListening) return;
    try {
      wakeRecog.start();
    } catch (e) {
      // "already started" etc.
    }
  }

  function stopWakeListening() {
    if (!wakeListening) return;
    try { wakeRecog.stop(); } catch (e) {}
  }

  // -----------------------------
  // DICTATION HYBRID FINISH TIMER
  // -----------------------------
  let finishTimer = null;
  let hasHeardSpeech = false;

  function clearFinishTimer() {
    if (finishTimer) {
      clearTimeout(finishTimer);
      finishTimer = null;
    }
  }

  function armFinishTimer() {
    if (!hasHeardSpeech) return; // WAIT until we hear real speech
    clearFinishTimer();
    finishTimer = setTimeout(() => {
      if (dictListening) stopDictation("finish-timer");
    }, CFG.finishDelayMs);
  }

  // -----------------------------
  // ACTION TRIGGERS (wake only)
  // -----------------------------
  function triggerPromptAction(snippet) {
    const now = Date.now();
    if (now - lastCmdTs.prompt < CMD_DEBOUNCE_MS) return;
    lastCmdTs.prompt = now;

    logKeyword(CFG.promptWord, snippet);
    clearPrompt();

    suppressFirstWakeWord = true;
    startDictation();
  }

  function triggerCancelAction(snippet) {
    const now = Date.now();
    if (now - lastCmdTs.cancel < CMD_DEBOUNCE_MS) return;
    lastCmdTs.cancel = now;

    logKeyword(CFG.cancelWord, snippet);
    stopEveAudio();
  }

  function triggerPlayReplyAction(snippet) {
    const now = Date.now();
    if (now - lastCmdTs.playReply < CMD_DEBOUNCE_MS) return;
    lastCmdTs.playReply = now;

    logKeyword(CFG.playReplyPhrase, snippet);
    playEveReply();
  }

  function triggerFastForwardAction(snippet) {
    const now = Date.now();
    if (now - lastCmdTs.ff < CMD_DEBOUNCE_MS) return;
    lastCmdTs.ff = now;

    logKeyword(CFG.ffPhrase, snippet);
    fastForwardEveAudio();
  }

  function triggerRewindAction(snippet) {
    const now = Date.now();
    if (now - lastCmdTs.rw < CMD_DEBOUNCE_MS) return;
    lastCmdTs.rw = now;

    logKeyword(CFG.rwPhrase, snippet);
    rewindEveAudio();
  }

  function triggerLayerUpAction(snippet) {
    const now = Date.now();
    if (now - lastCmdTs.layerUp < CMD_DEBOUNCE_MS) return;
    lastCmdTs.layerUp = now;

    logKeyword(CFG.layerUpPhrase, snippet);
    clickLayerUpButton();
  }

  function triggerLayerDownAction(snippet) {
    const now = Date.now();
    if (now - lastCmdTs.layerDown < CMD_DEBOUNCE_MS) return;
    lastCmdTs.layerDown = now;

    const digit = parseSpokenDigitFromLayerDown(snippet);
    logKeyword(CFG.layerDownPhrase, snippet);

    if (digit == null || digit < 0 || digit > 9) return;

    // retry up to 3 frames in case nofurs rebuild mid-frame
    const tryClick = (tries = 0) => {
      if (clickSmallNofurDigit(digit)) return;
      if (tries < 3) requestAnimationFrame(() => tryClick(tries + 1));
    };

    tryClick();
  }

  // -----------------------------
  // WAKE RECOG EVENTS
  // -----------------------------
  wakeRecog.onstart = () => {
    wakeListening = true;
    log("wakeRecog started");
  };

  wakeRecog.onend = () => {
    wakeListening = false;
    log("wakeRecog ended");
    // auto-restart if still enabled and idle
    if (autoListenEnabled && !dictListening) {
      setTimeout(startWakeListening, 200);
    }
  };

  wakeRecog.onerror = (e) => {
    console.warn("[MeqWhisper] wake error:", e && e.error);
    wakeListening = false;
    if (autoListenEnabled && !dictListening) {
      setTimeout(startWakeListening, 400);
    }
  };

  wakeRecog.onresult = (event) => {
    if (dictListening) return; // safety

    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const txt = res[0] && res[0].transcript ? res[0].transcript : "";
      transcript += txt + " ";
    }
    transcript = transcript.trim();
    if (!transcript) return;

    const norm = normalizeSpeech(transcript);

    // COMMAND ORDER (most specific first)
    if (snippetHasPhrase(norm, CFG.playReplyPhrase)) return triggerPlayReplyAction(transcript);
    if (snippetHasPhrase(norm, CFG.ffPhrase))       return triggerFastForwardAction(transcript);
    if (snippetHasPhrase(norm, CFG.rwPhrase))       return triggerRewindAction(transcript);
    if (snippetHasPhrase(norm, CFG.layerDownPhrase))return triggerLayerDownAction(transcript);
    if (snippetHasPhrase(norm, CFG.layerUpPhrase))  return triggerLayerUpAction(transcript);
    if (snippetHasPhrase(norm, CFG.cancelWord))     return triggerCancelAction(transcript);
    if (snippetHasPhrase(norm, CFG.promptWord))     return triggerPromptAction(transcript);
  };

  // -----------------------------
  // DICTATION RECOG EVENTS
  // -----------------------------
  dictRecog.onstart = () => {
    dictListening = true;
    hasHeardSpeech = false;
    clearFinishTimer();
    interimBuffer = "";
    renderInterimPreview();
    if (micBtn) micBtn.classList.add("listening");
    log("dictRecog started");
  };

  dictRecog.onend = () => {
    dictListening = false;
    clearFinishTimer();
    interimBuffer = "";
    renderInterimPreview();
    if (micBtn) micBtn.classList.remove("listening");
    log("dictRecog ended");

    // Auto-send if enough chars
    autoSubmitIfLongEnough();

    // Resume wake SR if enabled
    setTimeout(startWakeListening, 250);
  };

  dictRecog.onerror = (e) => {
    console.warn("[MeqWhisper] dict error:", e && e.error);
    dictListening = false;
    clearFinishTimer();
    interimBuffer = "";
    renderInterimPreview();
    if (micBtn) micBtn.classList.remove("listening");

    setTimeout(startWakeListening, 400);
  };

  dictRecog.onresult = (event) => {
    let interim = "";
    let finalText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const txt = res[0] && res[0].transcript ? res[0].transcript : "";
      if (res.isFinal) finalText += txt;
      else interim += txt;
    }

    const anyTxt = (finalText || interim).trim();
    if (anyTxt.length > 0) {
      if (!hasHeardSpeech) {
        hasHeardSpeech = true; // NOW we start hybrid timer
      }
      armFinishTimer();
    }

    // If user says JUST "prompt" while dictating -> stop dictation.
    // (Only if it's standalone, not inside a sentence.)
    if (finalText) {
      const just = normalizeSpeech(finalText);
      if (just === normalizeSpeech(CFG.promptWord)) {
        logKeyword(CFG.promptWord + " (dict-stop)", finalText);
        stopDictation("prompt-during-dict");
        return;
      }
    }

    if (finalText) {
      insertText(finalText);
      interimBuffer = "";
    } else {
      interimBuffer = interim;
    }

    renderInterimPreview();
  };

  // -----------------------------
  // START/STOP DICTATION
  // -----------------------------
  function startDictation() {
    if (dictListening) return;
    stopWakeListening(); // avoid SR crossfire

    try {
      dictRecog.start();
    } catch (e) {
      log("startDictation error", e);
    }
  }

  function stopDictation(reason) {
    if (!dictListening) return;
    log("stopDictation", reason);
    try { dictRecog.stop(); } catch (e) {}
  }

  function toggleDictation() {
    if (dictListening) stopDictation("mic-toggle");
    else {
      suppressFirstWakeWord = false;
      startDictation();
    }
  }

  micBtn.addEventListener("click", () => toggleDictation());

  // -----------------------------
  // AUTO SUBMIT SEND BUTTON
  // -----------------------------
  function autoSubmitIfLongEnough() {
    let el = promptEl;
    if (!document.contains(el)) {
      promptEl = findPromptEl();
      el = promptEl;
    }
    if (!el) return;

    const text = (el.value || "").trim();
    if (text.length < CFG.minCharsToAutosend) return;

    const sendBtn = findSendBtn();
    if (!sendBtn || sendBtn.disabled) return;

    log("autoSubmit sendBtn click; chars=", text.length);
    try { sendBtn.click(); } catch (e) {}
  }

  // -----------------------------
  // LEFT COLUMN AUTO-LISTEN CHECKBOX INJECTION
  // -----------------------------
  function injectAutoListenCheckbox() {
    const panel = document.getElementById("segmentLog");
    if (!panel) return false;

    // insert after your mute row if present
    const muteRow = panel.querySelector("#segmentMuteRow");
    const existing = panel.querySelector("#meqAutoListenRow");
    if (existing) return true;

    const row = document.createElement("div");
    row.id = "meqAutoListenRow";
    row.style.cssText = `
      margin-bottom: 6px;
      font-size: 10px;
      color: var(--meq-accent, #0ff);
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "meqAutoListenCb";
    cb.checked = autoListenEnabled;
    cb.style.cursor = "pointer";

    cb.addEventListener("change", () => {
      setAutoListenEnabled(cb.checked);
    });

    const label = document.createElement("label");
    label.htmlFor = "meqAutoListenCb";
    label.textContent = "Auto listen for 'prompt'";

    row.appendChild(cb);
    row.appendChild(label);

    if (muteRow) muteRow.insertAdjacentElement("afterend", row);
    else panel.insertBefore(row, panel.firstChild);

    return true;
  }

  function startAutoListenInjectionPoll() {
    if (injectAutoListenCheckbox()) return;
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      if (injectAutoListenCheckbox() || tries > 120) clearInterval(interval);
    }, 250);
  }

  startAutoListenInjectionPoll();

  // -----------------------------
  // INIT
  // -----------------------------
  if (autoListenEnabled) startWakeListening();

  window.MeqWhisper = {
    startDictation,
    stopDictation,
    toggleDictation,
    startWakeListening,
    stopWakeListening,
    isDictating: () => dictListening,
    isWakeListening: () => wakeListening,
    setLang: (l) => {
      dictRecog.lang = l;
      wakeRecog.lang = l;
    },
    setAutoListenEnabled
  };

  console.log("[MeqWhisper] Hybrid wake/prompt system ready.");
})();
