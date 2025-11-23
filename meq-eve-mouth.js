// meq-eve-mouth.js (ES module)
// Eve mouth + TTS helper.
// - Press "t" to toggle speaking the current text in a female-ish voice
//   with a very pronounced mouth/head movement.
// - Press "y" to skip forward ~5 seconds (approx chars) in the current speech.
// - Press "r" to skip backward ~5 seconds (approx chars) in the current speech.

// Default speech text if no global override is set
const DEFAULT_SPEECH_TEXT = "hello I am eve";

// ----- MOUTH TUNING -----
const MOUTH_MAX_ANGLE = 1.0;       // radians for jaw/head open (BIG)
const MOUTH_SPEED = 16;            // speed multiplier for mouth animation
const MOUTH_MORPH_INTENSITY = 1.5; // exaggerate morph target strength (clamped)

// Optional: force a specific bone by name (case-insensitive).
// e.g. in your HTML before scripts: window.EVE_MOUTH_BONE_NAME = "Jaw";
const FORCED_MOUTH_BONE_NAME = window.EVE_MOUTH_BONE_NAME || null;

// Approx chars per second of speech at rate=1.0
const CHARS_PER_SECOND = 15;       // tweak if you want tighter feel
const SKIP_SECONDS = 5;            // y/r skip chunk size

// Max chars per speech chunk (to avoid browser limits)
const MAX_CHARS_PER_CHUNK = 4000;

// -------------------------
// AUTO-SPEAK UI + STATE
// -------------------------
const AUTO_SPEAK_STORAGE_KEY = "meq_eve_auto_speak_enabled";
let autoSpeakEnabled = false;

function loadAutoSpeakPref() {
  try {
    autoSpeakEnabled = (localStorage.getItem(AUTO_SPEAK_STORAGE_KEY) === "true");
  } catch (e) {
    autoSpeakEnabled = false;
  }
  return autoSpeakEnabled;
}

function setAutoSpeakEnabled(v) {
  autoSpeakEnabled = !!v;
  try {
    localStorage.setItem(AUTO_SPEAK_STORAGE_KEY, autoSpeakEnabled ? "true" : "false");
  } catch (e) {}
  // expose for debugging if you want
  window.meqEveOverlay = window.meqEveOverlay || {};
  window.meqEveOverlay.autoSpeakEnabled = autoSpeakEnabled;
}

// inject checkbox under the filters in the chat session panel
function injectAutoSpeakCheckbox() {
  const panel = document.getElementById("chatSessionPanel");
  if (!panel) return false;

  const filtersEl = panel.querySelector("#sessionFilters");
  if (!filtersEl) return false;

  // already injected?
  if (filtersEl.querySelector("#eveAutoSpeakCb")) return true;

  const label = document.createElement("label");
  label.style.display = "block";
  label.style.marginTop = "6px";
  label.style.cursor = "pointer";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = "eveAutoSpeakCb";
  cb.checked = autoSpeakEnabled;
  cb.style.marginRight = "4px";

  cb.addEventListener("change", () => {
    setAutoSpeakEnabled(cb.checked);
  });

  label.appendChild(cb);
  label.appendChild(document.createTextNode(" Auto speak responses"));

  // Put it at the bottom of the checkbox list, before the search box
  const searchWrap = filtersEl.querySelector("#sessionSearchWrap");
  if (searchWrap) {
    filtersEl.insertBefore(label, searchWrap);
  } else {
    filtersEl.appendChild(label);
  }

  return true;
}

function startAutoSpeakInjectionPoll() {
  // try now
  if (injectAutoSpeakCheckbox()) return;

  // poll a bit until chat panel exists
  let tries = 0;
  const interval = setInterval(() => {
    tries++;
    if (injectAutoSpeakCheckbox() || tries > 80) {
      clearInterval(interval);
    }
  }, 250); // ~20s max
}


let eveRoot = null;
let mixer = null;

let mouthBone = null;
let mouthMorphTargets = []; // { mesh, index }

let isSpeaking = false;
let speakStartTime = 0;
let skeletonLogged = false;

// --- Speech tracking for skipping / chunking ---
let currentSpeechText = "";        // full normalized text
let currentUtterance = null;       // active utterance
let currentCharIndex = 0;          // absolute char index in full text
let speechChunks = [];             // [{ start, end, text }]

// ------------- Helpers -------------

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName ? target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea") return true;
  if (target.isContentEditable) return true;
  return false;
}

// Normalize text before speaking:
// - strip markdown emphasis wrappers: **bold** and *italic*
// - THEN remove any remaining leading "*" at start of a line (bullet-style)
// - but do NOT touch asterisks used as math operators (3*5) or inline a*b
function normalizeSpeechText(text) {
  if (typeof text !== "string") return "";
  let out = text;

  // **bold**
  const boldRe =
    /(^|[\s([{<"'`])\*\*(?=\S)([\s\S]*?\S)\*\*(?=(?:[\s\]),.?!:;"'`>)}]|$))/g;
  out = out.replace(boldRe, "$1$2");

  // *italic*
  const italicRe =
    /(^|[\s([{<"'`])\*(?=\S)([^*\n]*?\S)\*(?=(?:[\s\]),.?!:;"'`>)}]|$))/g;
  out = out.replace(italicRe, "$1$2");

  // LAST PASS: remove asterisk bullets at the start of a line:
  // "* item" or "   * item"  -> "item"
  // only if the * is followed by whitespace
  out = out.replace(/^[ \t]*\*[ \t]+/gm, "");

  return out;
}


// Build speechChunks from the full text, each up to MAX_CHARS_PER_CHUNK
function buildSpeechChunks(fullText) {
  speechChunks = [];
  const len = fullText.length;
  let i = 0;
  while (i < len) {
    const start = i;
    const end = Math.min(i + MAX_CHARS_PER_CHUNK, len);
    const text = fullText.slice(start, end);
    speechChunks.push({ start, end, text });
    i = end;
  }
}

// Ensure we have normalized full text and chunk array
function ensureSpeechTextAndChunks() {
  if (!currentSpeechText || !currentSpeechText.length) {
    currentSpeechText = normalizeSpeechText(getCurrentSpeechText() || "");
  }
  if (!Array.isArray(speechChunks) || !speechChunks.length) {
    buildSpeechChunks(currentSpeechText);
  }
}

function logSkeleton(root) {
  if (!root || skeletonLogged) return;
  skeletonLogged = true;

  console.groupCollapsed("meq-eve-mouth.js: Eve skeleton bones");
  root.traverse((obj) => {
    if (obj.isBone) {
      console.log("Bone:", obj.name);
    }
  });
  console.groupEnd();
}

function findMouthControls(root) {
  logSkeleton(root);

  const candidateHeadBones = [];
  const lowerForcedName = FORCED_MOUTH_BONE_NAME
    ? FORCED_MOUTH_BONE_NAME.toLowerCase()
    : null;

  root.traverse((obj) => {
    if (obj.isBone && obj.name) {
      const n = obj.name.toLowerCase();

      // If user specified a bone name, prefer that exactly
      if (lowerForcedName && n.includes(lowerForcedName)) {
        if (!mouthBone) {
          mouthBone = obj;
          mouthBone.userData.baseRotation = mouthBone.rotation.clone();
        }
      }

      // Collect potential head bones as fallback
      if (n.includes("head") || n.includes("skull")) {
        candidateHeadBones.push(obj);
      }

      // Auto-detect typical mouth/jaw bones
      if (
        !mouthBone &&
        (n.includes("jaw") || n.includes("mouth") || n.includes("chin"))
      ) {
        mouthBone = obj;
        mouthBone.userData.baseRotation = mouthBone.rotation.clone();
      }
    }

    // Morph targets that look mouth-related
    if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
      const dict = obj.morphTargetDictionary;
      Object.keys(dict).forEach((mtName) => {
        const lower = mtName.toLowerCase();
        if (
          lower.includes("mouth") ||
          lower.includes("jaw") ||
          lower.includes("open") ||
          lower.includes("aa") ||
          lower.includes("ah")
        ) {
          const index = dict[mtName];
          mouthMorphTargets.push({ mesh: obj, index });
        }
      });
    }
  });

  // Fallback: if no mouth bone found, use a head bone, if any
  if (!mouthBone && candidateHeadBones.length > 0) {
    mouthBone = candidateHeadBones[0];
    mouthBone.userData.baseRotation = mouthBone.rotation.clone();
    console.warn(
      "meq-eve-mouth.js: No jaw/mouth bone found; using head bone instead:",
      mouthBone.name
    );
  }

  console.log("meq-eve-mouth.js: mouth controls detected:", {
    mouthBone: mouthBone ? mouthBone.name : null,
    morphTargets: mouthMorphTargets.map(m => ({
      mesh: m.mesh.name,
      index: m.index
    }))
  });
}

function resetMouth() {
  if (mouthBone) {
    const base = mouthBone.userData && mouthBone.userData.baseRotation;
    if (base) {
      mouthBone.rotation.copy(base);
    } else {
      mouthBone.rotation.set(0, 0, 0);
    }
  }
  mouthMorphTargets.forEach(({ mesh, index }) => {
    mesh.morphTargetInfluences[index] = 0;
  });
}

function animateMouth(now) {
  if (!isSpeaking || !eveRoot) return;

  const t = (now - speakStartTime) / 1000;

  // Base oscillation 0..1
  let phase = Math.abs(Math.sin(t * MOUTH_SPEED));
  // Exaggeration curve (more time open)
  phase = Math.sqrt(phase);

  const angle = phase * MOUTH_MAX_ANGLE;

  if (mouthBone) {
    const base = mouthBone.userData && mouthBone.userData.baseRotation;
    if (base) {
      mouthBone.rotation.copy(base);
    }
    // Open down on X; if it's a head bone, it'll bob dramatically.
    mouthBone.rotateX(-angle);
  }

  const morphValue = Math.min(1, phase * MOUTH_MORPH_INTENSITY);
  mouthMorphTargets.forEach(({ mesh, index }) => {
    mesh.morphTargetInfluences[index] = morphValue;
  });
}

// ------------- Speech (female voice) -------------

function pickFemaleVoice() {
  if (!("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (!voices || !voices.length) return null;

  // 1) Prefer explicit female indicators
  let v =
    voices.find(v => /female/i.test(v.name + " " + v.voiceURI)) ||
    voices.find(v => /woman|girl|lady/i.test(v.name + " " + v.voiceURI));

  // 2) Fallback: an English voice
  if (!v) {
    v = voices.find(v => v.lang && v.lang.toLowerCase().startsWith("en"));
  }

  // 3) Fallback: first voice
  return v || voices[0];
}

// Get current speech text from global, with default + normalization
function getCurrentSpeechText() {
  const g = window.EVE_SPEECH_TEXT;
  if (typeof g === "string") {
    const normalized = normalizeSpeechText(g);
    const trimmed = normalized.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return normalizeSpeechText(DEFAULT_SPEECH_TEXT);
}

// Stop current speech + reset mouth
function stopEveSpeech() {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;

  isSpeaking = false;
  currentCharIndex = 0;

  // Clear reference so onend from the old utterance is ignored
  currentUtterance = null;
  synth.cancel();

  resetMouth();
}

function setupUtteranceEvents(utter, chunkEndGlobal) {
  utter.onstart = () => {
    // If this utterance became stale before starting, ignore
    if (utter !== currentUtterance) return;
    isSpeaking = true;
    speakStartTime = performance.now();
  };

  utter.onend = () => {
    // Ignore if this utterance is no longer the active one
    if (utter !== currentUtterance) return;

    // Advance our logical index to the end of this chunk segment
    currentCharIndex = chunkEndGlobal;

    const fullLen = currentSpeechText ? currentSpeechText.length : 0;
    if (currentCharIndex >= fullLen) {
      // All done
      isSpeaking = false;
      currentUtterance = null;
      resetMouth();
      return;
    }

    // Auto-advance to next chunk starting from currentCharIndex
    speakFromCharIndex(currentCharIndex);
  };

  utter.onerror = () => {
    if (utter !== currentUtterance) return;
    isSpeaking = false;
    currentUtterance = null;
    resetMouth();
  };
}

// Speak from a given absolute char index in the full text
function speakFromCharIndex(charIndex) {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;

  ensureSpeechTextAndChunks();

  const text = currentSpeechText;
  const len = text.length;
  const startIdx = Math.max(0, Math.min(len, charIndex | 0));
  if (startIdx >= len) {
    // nothing to speak
    stopEveSpeech();
    return;
  }

  // Cancel any previous utterance and mark it stale
  if (currentUtterance) {
    currentUtterance = null;
    synth.cancel();
  } else {
    synth.cancel();
  }

  // Find which chunk this charIndex falls into
  let chunkIndex = -1;
  for (let i = 0; i < speechChunks.length; i++) {
    const c = speechChunks[i];
    if (startIdx >= c.start && startIdx < c.end) {
      chunkIndex = i;
      break;
    }
  }
  if (chunkIndex === -1) {
    stopEveSpeech();
    return;
  }

  const chunk = speechChunks[chunkIndex];
  const localOffset = Math.max(0, startIdx - chunk.start);
  const subText = chunk.text.slice(localOffset);
  const utter = new SpeechSynthesisUtterance(subText);

  const voice = pickFemaleVoice();
  if (voice) {
    utter.voice = voice;
  }
  utter.pitch = 1.15; // slightly higher
  utter.rate = 1.0;

  currentCharIndex = startIdx;
  currentUtterance = utter;

  const chunkEndGlobal = chunk.end;
  setupUtteranceEvents(utter, chunkEndGlobal);

  synth.speak(utter);
}

function speakEveLine() {
  if (!("speechSynthesis" in window)) {
    console.warn("meq-eve-mouth.js: speechSynthesis not supported in this browser.");
    return;
  }

  const text = getCurrentSpeechText();
  currentSpeechText = normalizeSpeechText(text || "");
  currentCharIndex = 0;
  buildSpeechChunks(currentSpeechText);

  if (!currentSpeechText.trim()) return;

  speakFromCharIndex(0);
}

// Skip forward/backward by secondsDelta (approx chars-based),
function skipEveSpeech(secondsDelta) {
  if (!("speechSynthesis" in window)) return;
  if (!isSpeaking) return;

  ensureSpeechTextAndChunks();
  if (!currentSpeechText.length) return;

  const len = currentSpeechText.length;

  const deltaChars = Math.round(secondsDelta * CHARS_PER_SECOND);
  let targetCharIndex = currentCharIndex + deltaChars;

  if (targetCharIndex < 0) targetCharIndex = 0;
  if (targetCharIndex >= len) {
    stopEveSpeech();
    return;
  }

  speakFromCharIndex(targetCharIndex);
}

// ------------- Keyboard -------------

function handleKeyDown(e) {
  const key = e.key;
  const t = e.target || document.activeElement;

  if (isEditableTarget(t)) return;

  if (key === "t" || key === "T") {
    e.preventDefault();
    if (isSpeaking) {
      stopEveSpeech();
    } else {
      speakEveLine();
    }
  } else if (key === "y" || key === "Y") {
    e.preventDefault();
    skipEveSpeech(SKIP_SECONDS);
  } else if (key === "r" || key === "R") {
    e.preventDefault();
    skipEveSpeech(-SKIP_SECONDS);
  }
}

// ------------- Integration with mixer -------------

function patchMixerForMouth(m) {
  if (!m || (m.userData && m.userData.mouthPatched)) return;

  const originalUpdate = m.update.bind(m);
  m.update = function patchedUpdate(delta) {
    originalUpdate(delta);
    animateMouth(performance.now());
  };

  m.userData = m.userData || {};
  m.userData.mouthPatched = true;

  console.log("meq-eve-mouth.js: patched mixer.update for mouth animation");
}

// ------------- Fallback RAF loop -------------

function rafLoop(now) {
  if (!mixer) {
    animateMouth(now);
  }
  requestAnimationFrame(rafLoop);
}

// ------------- Initialization -------------

function tryHookIntoEve() {
  if (window.meqEveOverlay && window.meqEveOverlay.eveRoot) {
    eveRoot = window.meqEveOverlay.eveRoot;
    mixer = window.meqEveOverlay.mixer || null;

    findMouthControls(eveRoot);

    if (mixer) {
      patchMixerForMouth(mixer);
    }
    return true;
  }
  return false;
}

function init() {
  // Load auto-speak pref before we expose API/UI
  loadAutoSpeakPref();
  setAutoSpeakEnabled(autoSpeakEnabled);
  startAutoSpeakInjectionPoll();

  // Expose a small helper API for other scripts
  window.meqEveOverlay = window.meqEveOverlay || {};

  window.meqEveOverlay.setSpeechText = function (text) {
    const normalized = normalizeSpeechText(String(text));
    window.EVE_SPEECH_TEXT = normalized;
    currentSpeechText = normalized;
    currentCharIndex = 0;
    buildSpeechChunks(currentSpeechText);

    // ✅ AUTO SPEAK: if enabled, play immediately (no key/button)
    if (autoSpeakEnabled) {
      stopEveSpeech();   // kill any current line cleanly
      speakEveLine();    // speak new text
    }
  };

  window.meqEveOverlay.stopSpeech = stopEveSpeech;
  window.meqEveOverlay.speak = function () {
    speakEveLine();
  };
  window.meqEveOverlay.skipForward = function (sec) {
    skipEveSpeech(Math.abs(sec || SKIP_SECONDS));
  };
  window.meqEveOverlay.skipBackward = function (sec) {
    skipEveSpeech(-Math.abs(sec || SKIP_SECONDS));
  };
  Object.defineProperty(window.meqEveOverlay, "isSpeaking", {
    get() {
      return isSpeaking;
    }
  });

  if (!tryHookIntoEve()) {
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      if (tryHookIntoEve() || tries > 60) {
        clearInterval(interval);
      }
    }, 250);
  }

  window.addEventListener("keydown", handleKeyDown);
  requestAnimationFrame(rafLoop);

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }
}

init();
