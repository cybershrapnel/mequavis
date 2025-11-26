// meq-skybox-embed-frame.js
// Drop-in helper to:
//  - Add "EMBED FRAME" button next to CLOSE in #skyboxPanel header
//  - Turn the skybox iframe into a full-page background when embedded
//  - Make the main MEQ canvas background transparent so the iframe shows behind it
//  - Push #layoutBtn under the iframe by giving it an even lower z-index
//  - Reset everything when the Digital Skybox is hidden/closed

(function () {
  function findMapButton() {
    // Same logic as original file: prefer data-action, fall back to text
    const byAction = document.querySelector('.action-btn[data-action="map-ui"]');
    if (byAction) return byAction;

    const candidates = Array.from(
      document.querySelectorAll(
        'button, .action-btn, input[type="button"], input[type="submit"]'
      )
    );
    for (const el of candidates) {
      const txt = (el.textContent || el.value || '').trim().toUpperCase();
      if (
        txt === 'SHOW MAP UI' ||
        txt === 'SHOW DIGITAL SKYBOX' ||
        txt === 'HIDE DIGITAL SKYBOX'
      ) {
        return el;
      }
    }
    return null;
  }

  function setupWhenReady() {
    const panel = document.getElementById('skyboxPanel');
    const headerEl = panel && panel.querySelector('#skyboxHeader');
    const closeBtn = panel && panel.querySelector('#skyboxPanelClose');
    const iframe = panel && panel.querySelector('#skyboxFrame');
    const canvas = document.getElementById('mequavis');
    const layoutBtn = document.getElementById('layoutBtn');

    if (!panel || !headerEl || !iframe) return false;

    const mapBtn = findMapButton();

    // Avoid double-init
    if (panel._meqEmbedInitialized) return true;
    panel._meqEmbedInitialized = true;

    // --- Snapshot original styles so we can restore them later ---
    const original = {
      panel: {
        left: panel.style.left,
        right: panel.style.right,
        top: panel.style.top,
        bottom: panel.style.bottom,
        border: panel.style.border,
        padding: panel.style.padding,
        zIndex: panel.style.zIndex,
        background: panel.style.background
      },
      headerDisplay: headerEl.style.display,
      iframe: {
        position: iframe.style.position,
        top: iframe.style.top,
        right: iframe.style.right,
        bottom: iframe.style.bottom,
        left: iframe.style.left,
        width: iframe.style.width,
        height: iframe.style.height,
        flex: iframe.style.flex
      },
      canvasBg: canvas ? canvas.style.backgroundColor : null,
      layoutBtnPosition: layoutBtn ? layoutBtn.style.position : null,
      layoutBtnZIndex: layoutBtn ? layoutBtn.style.zIndex : null
    };

    let embedActive = false;

    function activateEmbed() {
      if (embedActive) return;
      embedActive = true;

      // Full-page panel, behind everything (but above layoutBtn which we'll push lower)
      panel.style.left = '0';
      panel.style.right = '0';
      panel.style.top = '0';
      panel.style.bottom = '0';
      panel.style.border = 'none';
      panel.style.padding = '0';
      panel.style.background = 'transparent';
      panel.style.zIndex = '-10'; // "real low" so it sits behind other UI

      // Hide header (so only iframe remains)
      headerEl.style.display = 'none';

      // Let iframe fill entire panel
      iframe.style.position = 'absolute';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.flex = 'none';

      // Make MEQ main canvas background transparent
      if (canvas) {
        canvas.style.backgroundColor = 'transparent';
      }

      // Push the layout button *beneath* the iframe (and panel)
      if (layoutBtn) {
        // z-index only works on positioned elements, so ensure it has a position.
        if (!layoutBtn.style.position) {
          layoutBtn.style.position = 'relative';
        }
        // Panel is -10, so go even lower so it's behind the iframe/panel combo
        layoutBtn.style.zIndex = '-20';
      }
    }

    function resetEmbed() {
      if (!embedActive) return;
      embedActive = false;

      // Restore panel styles
      panel.style.left = original.panel.left;
      panel.style.right = original.panel.right;
      panel.style.top = original.panel.top;
      panel.style.bottom = original.panel.bottom;
      panel.style.border = original.panel.border;
      panel.style.padding = original.panel.padding;
      panel.style.zIndex = original.panel.zIndex;
      panel.style.background = original.panel.background;

      // Restore header visibility
      headerEl.style.display = original.headerDisplay;

      // Restore iframe layout
      iframe.style.position = original.iframe.position;
      iframe.style.top = original.iframe.top;
      iframe.style.right = original.iframe.right;
      iframe.style.bottom = original.iframe.bottom;
      iframe.style.left = original.iframe.left;
      iframe.style.width = original.iframe.width;
      iframe.style.height = original.iframe.height;
      iframe.style.flex = original.iframe.flex;

      // Restore canvas background
      if (canvas && original.canvasBg !== null) {
        canvas.style.backgroundColor = original.canvasBg;
      }

      // Restore layout button position/z-index
      if (layoutBtn) {
        layoutBtn.style.position = original.layoutBtnPosition;
        layoutBtn.style.zIndex = original.layoutBtnZIndex;
      }
    }

    // --- Create EMBED FRAME button next to CLOSE ---
    const embedBtn = document.createElement('button');
    embedBtn.id = 'skyboxEmbedFrameBtn';
    embedBtn.textContent = 'EMBED FRAME';

    // Style it roughly like the CLOSE button (if present)
    if (closeBtn) {
      embedBtn.style.background = closeBtn.style.background || '#111';
      embedBtn.style.color = closeBtn.style.color || '#0ff';
      embedBtn.style.border = closeBtn.style.border || '1px solid #0ff';
      embedBtn.style.fontFamily = closeBtn.style.fontFamily || 'monospace';
      embedBtn.style.fontSize = closeBtn.style.fontSize || '11px';
      embedBtn.style.padding = closeBtn.style.padding || '2px 8px';
      embedBtn.style.cursor = 'pointer';
      embedBtn.style.marginRight = '4px';
    } else {
      // Fallback style
      embedBtn.style.background = '#111';
      embedBtn.style.color = '#0ff';
      embedBtn.style.border = '1px solid #0ff';
      embedBtn.style.fontFamily = 'monospace';
      embedBtn.style.fontSize = '11px';
      embedBtn.style.padding = '2px 8px';
      embedBtn.style.cursor = 'pointer';
      embedBtn.style.marginRight = '4px';
    }

    headerEl.insertBefore(embedBtn, closeBtn || headerEl.lastChild);

    // Toggle embed on click
    embedBtn.addEventListener('click', () => {
      if (embedActive) {
        resetEmbed();
      } else {
        activateEmbed();
      }
    });

    // If user clicks the main map button (Show/Hide Digital Skybox),
    // always reset so next open is back to default.
    if (mapBtn) {
      mapBtn.addEventListener('click', () => {
        if (embedActive) {
          resetEmbed();
        }
      });
    }

    // Also reset if they use the CLOSE button in the header
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (embedActive) {
          resetEmbed();
        }
      });
    }

    return true;
  }

  // Wait for DOM + skyboxPanel to exist
  function init() {
    if (setupWhenReady()) return;

    let attempts = 0;
    const maxAttempts = 40; // ~10 seconds @ 250ms
    const timer = setInterval(() => {
      attempts++;
      if (setupWhenReady() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
