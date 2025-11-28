// meq-mobile-fullchat.js
// Phone mode:
// - Detect phone


// meq-mobile-rightpanel-fullscreen.js
// Mobile: make #rightPanel the only visible panel (after triggering full chat)


function anchorThreePanelsToTop() {
  const leftPanel = document.getElementById("chatSessionPanel"); // left
  const chatPanel = document.getElementById("rightPanel");       // main chat
  const infoPanel = document.getElementById("chatInfoPanel");    // info

  [leftPanel, chatPanel, infoPanel].forEach(panel => {
    if (!panel) return;

    // If any of them are positioned, push them to the top
    panel.style.top = "0";
    panel.style.marginTop = "0";
  });
}



(function () {
  // ---------- 1) Mobile detection ----------
  function isPhoneDevice() {
    const ua = (navigator.userAgent || navigator.vendor || "").toLowerCase();

    const uaLooksMobile =
      /(iphone|ipod)/.test(ua) ||
      (/android/.test(ua) && /mobile/.test(ua)) ||
      /mobi/.test(ua);

    const hasTouch =
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

    const smallestScreenSide = Math.min(screen.width, screen.height);
    const isSmallScreen = smallestScreenSide <= 500;

//add code here
  const isnotDesktopMode = window.innerWidth <= 800; // adjust 800 to taste

    return (isnotDesktopMode) && (hasTouch && isSmallScreen);
  }


console.log("pre meq loop test.");

if (!isPhoneDevice()) {
console.log("not a phone!");
  return; // only run this on phones
} else {
  // ---------- 2) DOM ready ----------
  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  onReady(function () {
    goPhone();
addThreePanelButtonsAll_v3()
  anchorThreePanelsToTop();   // ← add this line

console.log("post meq loop test.");
  });
}





function goPhone() {
  console.log("goPhone() EXECUTING");
  console.trace();
    // ---------- 3) Trigger the FULL CHAT button first ----------
    // 🔧 TODO: change this selector to match your real full-chat button
    const fullChatButton =
      document.getElementById("fullChatButton") ||
      document.getElementById("fullChatBtn") ||
      document.querySelector("[data-fullchat-toggle]");

    if (fullChatButton) {
      try {
        fullChatButton.click();
        console.log("[meq-mobile-rightpanel] Clicked full chat button.");
      } catch (e) {
        console.warn("[meq-mobile-rightpanel] Failed to click full chat button:", e);
      }
    } else {
      console.warn("[meq-mobile-rightpanel] Full chat button not found. Update selector in script.");
    }

    // Give layout a moment to react to the full chat button
  setTimeout(makeRightPanelFullscreen, 300);
}






  // ---------- 4) Make #rightPanel full-screen & hide other panels ----------
  function makeRightPanelFullscreen() {
    const rightPanel = document.getElementById("rightPanel");
    if (!rightPanel) {
      console.warn("[meq-mobile-rightpanel] #rightPanel not found.");
      return;
    }

    // Make rightPanel fill the viewport
    rightPanel.style.position = "fixed";
    rightPanel.style.top = "50";
    rightPanel.style.left = "0";
    rightPanel.style.right = "0";
    rightPanel.style.bottom = "0";
    rightPanel.style.margin = "0";
    rightPanel.style.width = "100vw";
    rightPanel.style.height = "92vh";
    rightPanel.style.boxSizing = "border-box";
    rightPanel.style.zIndex = "9999";

    // Hide everything that is NOT on the ancestor chain leading to #rightPanel
    try {
      function prune(node) {
        if (!node || !node.children) return;
        const children = Array.from(node.children);

        for (const child of children) {
          const tag = child.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") continue;

          if (child === rightPanel) {
            // This *is* the main chat panel -> keep entire subtree, don't recurse
            continue;
          }

          if (child.contains(rightPanel)) {
            // This is an ancestor container -> keep it, but clean its other branches
            prune(child);
          } else {
            // This branch does not contain rightPanel -> hide it
            child.style.display = "none";
          }
        }
      }
const collapseBtn = document.querySelector('button.action-btn[data-action="full-chat"]');
if (collapseBtn) {
  collapseBtn.style.display = "none";
}

fixRightMiddleMobile();

      prune(document.body);
      console.log("[meq-mobile-rightpanel] Right panel is now full-screen; other panels hidden.");
    } catch (e) {
      console.warn("[meq-mobile-rightpanel] Error while pruning non-chat elements:", e);
    }
initTriPanelToggle();
  }
})();

//


function fixRightMiddleMobile() {
  const ta = document.getElementById("rightMiddle");
  if (ta && ta.parentElement) {
    const parent = ta.parentElement;

    parent.style.display = "flex";
    parent.style.flexDirection = "column";

    ta.style.flex = "1 1 auto";
    ta.style.height = "100%";
    ta.style.boxSizing = "border-box";
  }
}


function addThreePanelButtonsAll_v3() {
  const leftPanel = document.getElementById("chatSessionPanel"); // left
  const chatPanel = document.getElementById("rightPanel");       // main chat
  const infoPanel = document.getElementById("chatInfoPanel");    // info

  if (!leftPanel && !chatPanel && !infoPanel) {
    console.warn("No panels found (chatSessionPanel/rightPanel/chatInfoPanel).");
    return;
  }


  function hideAllPanels() {
    if (leftPanel)  leftPanel.style.display = "none";
    if (chatPanel)  chatPanel.style.display = "none";
    if (infoPanel)  infoPanel.style.display = "none";
  }

  function setPanelState(panel, active, isRightPanel) {
    if (!panel) return;

    if (active) {
      panel.style.display = "block";

      // only force 100vw on NON-rightPanel
      if (!isRightPanel) {
        panel.style.width = "90vw";
        panel.style.margin = "0";
        panel.style.boxSizing = "border-box";
      }
    } else {
      panel.style.display = "none";

      if (!isRightPanel) {
        panel.style.width = "";
      }
    }
  }

  function showOnly(which) {
    setPanelState(leftPanel, which === "left", false);
    setPanelState(chatPanel, which === "chat", true);   // ✅ rightPanel width untouched
    setPanelState(infoPanel, which === "info", false);

    document.querySelectorAll(".tri-panel-toolbar button[data-mode]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === which);
    });
  // 🔹 Re-apply mobile layout fix whenever we come back to CHAT
  if (which === "chat") {
    fixRightMiddleMobile();
  }
  }

  function createBar() {
    const bar = document.createElement("div");
    bar.className = "tri-panel-toolbar";
    bar.style.display = "flex";
    bar.style.gap = "4px";
    bar.style.margin = "4px 0";

    function makeBtn(label, mode) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.mode = mode;
      b.style.flex = "1 1 0";
      b.style.whiteSpace = "nowrap";
      b.addEventListener("click", () => showOnly(mode));
      return b;
    }

    bar.appendChild(makeBtn("LEFT", "left"));
    bar.appendChild(makeBtn("CHAT", "chat"));
    bar.appendChild(makeBtn("INFO", "info"));

    return bar;
  }

  if (leftPanel) {
    leftPanel.insertBefore(createBar(), leftPanel.firstChild || null);
  }
  if (chatPanel) {
    const bar = createBar();

    // 🔹 Add CLOSE button only on main chat panel
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "CLOSE";
    closeBtn.style.flex = "1 1 0";
    closeBtn.style.whiteSpace = "nowrap";
    closeBtn.addEventListener("click", hideAllPanels);

    bar.appendChild(closeBtn);

    chatPanel.insertBefore(bar, chatPanel.firstChild || null);
  }
  if (infoPanel) {
    infoPanel.insertBefore(createBar(), infoPanel.firstChild || null);
  }

  // start in CHAT mode by default, rightPanel width unchanged
  showOnly("chat");

  console.log("Three-button bars added; non-right panels use 100vw, rightPanel width untouched.");
}




//

(function () {
  // ---------- phone detection ----------
  function isPhoneDevice() {
    const ua = navigator.userAgent || "";
    const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 1000;
    const uaMatch = /Mobi|Android|iPhone|iPod/i.test(ua);
    return uaMatch || smallViewport;
  }

  if (!isPhoneDevice()) {
    fixChatLayoutExact();
    return; // desktop / tablet: do nothing
  }

  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }




  }

if (isPhoneDevice()) {
  const rightPanel = document.getElementById("rightPanel");
  if (rightPanel) {
    rightPanel.style.height = ""; // remove inline height so CSS/auto can take over
    rightPanel.style.display = "flex";
    rightPanel.style.flexDirection = "column-reverse";
  }
  // (keeping your structure as-is)
  const mainChat =
    document.getElementById("fullChatPanel") ||
    document.getElementById("mainPanel") ||
    document.getElementById("chatPanel") ||
    document.getElementById("centerPanel");

  if (mainChat) {
    mainChat.style.position = "fixed";
    mainChat.style.top = "0";
    mainChat.style.left = "0";
    mainChat.style.right = "0";
    mainChat.style.bottom = "0";
    mainChat.style.margin = "0";
    mainChat.style.width = "100vw";
    //mainChat.style.height = "100vh";
    mainChat.style.zIndex = "10";
    mainChat.style.boxSizing = "border-box";
  } else {
    console.warn("[mobile-fullchat] No main chat panel found (fullChatPanel/mainPanel/chatPanel/centerPanel).");
  }
}


  // ✅ NEW: clear any explicit height on rightPanelcolumn-reverse


})();





// layout helper you already had
function fixChatLayoutExact() {
  const panel  = document.getElementById("rightPanel");
  const top    = document.getElementById("rightTop");
  const middle = document.getElementById("rightMiddle");
  const bottom = document.getElementById("rightBottom");

  if (!panel || !middle || !top || !bottom) {
    console.error("Missing one of #rightPanel, #rightTop, #rightMiddle, #rightBottom");
    return;
  }

  panel.style.display = "";
  panel.style.flexDirection = "";
  panel.style.height = "";

  top.style.flex = "";
  middle.style.flex = "";
  middle.style.height = "";
  middle.style.minHeight = "";
  middle.style.overflow = "";
  bottom.style.flex = "";

  panel.style.display = "flex";
  panel.style.flexDirection = "column";

  top.style.flex = "0 0 auto";
  bottom.style.flex = "0 0 auto";
  middle.style.flex = "1 1 auto";
  middle.style.minHeight = "0";
  middle.style.overflow = "auto";

  setTimeout(() => {
    const panelRect  = panel.getBoundingClientRect();
    const overflow   = panelRect.bottom - window.innerHeight;

    if (overflow > 0) {
      const middleRect = middle.getBoundingClientRect();
      const newHeight  = middleRect.height - overflow;

      if (newHeight > 0) {
        middle.style.flex = "0 0 auto";
        middle.style.height = newHeight + "px";
        middle.style.overflow = "auto";
        console.log("✅ Adjusted #rightMiddle height to fit viewport exactly.");
      } else {
        console.warn("Not enough room to shrink #rightMiddle safely.");
      }
    } else {
      console.log("✅ No overflow detected; layout already fits.");
    }
  }, 0);
}
