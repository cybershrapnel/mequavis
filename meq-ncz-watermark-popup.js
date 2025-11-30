// meq-ncz-watermark-panel.js
// Popup watermark tool embedded directly in the main DOM (NO IFRAME)
// - Adds MEQ-style overlay/panel with full NCZ watermark UI
// - Uses its own IDs (wm_*) to avoid collisions
// - Hooks into meq-ncz-menu.js and ONLY overrides when the button text
//   is exactly "NanoCheeZe Certifications" on the second click.

(function () {
  if (window._meqNczWatermarkPanelPatched) return;
  window._meqNczWatermarkPanelPatched = true;

  const PROXY_URL = "https://xtdevelopment.net/certifications/cert-proxy.php";
  const STATIC_MESSAGE = "Test message for signing";


  // --- NCZ → Gasket chat bridge (uses MeqSegmentChat.postSystemMessage) ---
  // --- NCZ → System chat bridge (uses MeqSystemChat.postMessage) ---
  function wm_postGasketEvent(op, payload) {
    // Keep the old name so we don't have to touch all callsites.
    if (
      !window.MeqSystemChat ||
      typeof window.MeqSystemChat.postMessage !== "function"
    ) {
      return;
    }

    let gp = null;
    try {
      if (window.MeqSegmentChat && typeof window.MeqSegmentChat.getGasketPower === "function") {
        gp = window.MeqSegmentChat.getGasketPower();
      }
    } catch (_) {}

    const body = {
      op,

      ...payload
    };
console.log(gp);

    try {
      const text = "[NCZ EVENT] " + op + "\n" + JSON.stringify(body, null, 2);
      window.MeqSystemChat.postMessage(text, "NCZ-Chain");
    } catch (e) {
      console.error("[wm] wm_postGasketEvent (system) error:", e);
    }
  }




  // ---------- helpers: DOM ready & accent ----------

  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  function readCssVar(styleObj, name) {
    try {
      const v = styleObj.getPropertyValue(name);
      return v ? v.trim() : "";
    } catch {
      return "";
    }
  }

  function getUIAccent() {
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);

      const candidates = [
        "--ui-accent",
        "--ui-color",
        "--meq-ui-accent",
        "--meq-ui-color",
        "--meq-accent",
        "--accent-color",
        "--primary-color",
        "--theme-accent",
        "--picker-color",
        "--picker-accent"
      ];

      for (const v of candidates) {
        const a = readCssVar(rootStyle, v) || readCssVar(bodyStyle, v);
        if (a) return a;
      }

      if (typeof window._meqUIColor === "string" && window._meqUIColor.trim()) {
        return window._meqUIColor.trim();
      }
      if (typeof window._meqUIAccent === "string" && window._meqUIAccent.trim()) {
        return window._meqUIAccent.trim();
      }
      if (typeof window.uiAccent === "string" && window.uiAccent.trim()) {
        return window.uiAccent.trim();
      }

      const storageKeys = [
        "uiAccent",
        "uiColor",
        "meqUIColor",
        "meq-ui-accent",
        "accentColor",
        "themeAccent",
        "pickerColor",
        "pickerAccent"
      ];
      for (const k of storageKeys) {
        const val = localStorage.getItem(k);
        if (val && val.trim()) return val.trim();
      }

      const probes = ["#segmentLog", "#rightPanel", "#layoutBtn", ".action-btn", "#aiInput", "#aiSend"];
      for (const sel of probes) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const cs = getComputedStyle(el);
        const borders = [
          cs.borderTopColor,
          cs.borderRightColor,
          cs.borderBottomColor,
          cs.borderLeftColor,
          cs.borderColor
        ].filter(Boolean);

        for (const bc of borders) {
          if (bc && bc !== "transparent" && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(bc)) {
            return bc;
          }
        }
        if (cs.color && cs.color !== "transparent") return cs.color;
      }
    } catch {}

    return "#0ff";
  }

  function getSoftHoverBg() {
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const soft =
        readCssVar(rootStyle, "--soft-border") ||
        readCssVar(bodyStyle, "--soft-border");
      if (soft) return soft;
    } catch {}
    return "#033";
  }

  // ---------- API helper via cert-proxy.php ----------

  async function apiFetch(path, options = {}) {
    const url = `${PROXY_URL}?path=${encodeURIComponent(path)}`;
    return fetch(url, options);
  }

  // ---------- CORE CRYPTO / CERT LOGIC (adapted to wm_* IDs) ----------

  let wm_privateKey = null;
  let wm_certId = null;

  function wm_showSection(sectionId) {
  // hide all tab sections
  const sections = document.querySelectorAll(".wm-section");
  sections.forEach(sec => {
    sec.style.display = "none";
  });

  // home instructions block
  const homeInstructions = document.getElementById("wm_instructions");
  if (!sectionId || sectionId === "home") {
    if (homeInstructions) homeInstructions.style.display = "block";
  } else {
    if (homeInstructions) homeInstructions.style.display = "none";
    const el = document.getElementById(sectionId);
    if (el) el.style.display = "block";
  }

  // nav button active state
  const buttons = document.querySelectorAll(".wm-nav-buttons button");
  buttons.forEach(btn => btn.classList.remove("active"));

  const targetSelector =
    !sectionId || sectionId === "home"
      ? '.wm-nav-buttons button[data-section="home"]'
      : `.wm-nav-buttons button[data-section="${sectionId}"]`;

  const activeBtn = document.querySelector(targetSelector);
  if (activeBtn) activeBtn.classList.add("active");
}


  async function wm_generateCert() {
    const usernameInput = document.getElementById("wm_username");
    const out = document.getElementById("wm_cert_output");
    if (!usernameInput || !out) return;

    const username = usernameInput.value.trim();
    if (!username) {
      alert("Please enter a username");
      return;
    }

    try {
      const response = await apiFetch("/create_cert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Error creating certificate");
      }

      const result = await response.json();
      wm_certId = result.cert_id;
      out.innerText = `Certificate generated with cert_id: ${wm_certId}`;
      await wm_generateKeyPair(); // continues flow
    } catch (e) {
      console.error("[wm] create_cert error:", e);
      alert("Failed to create certificate: " + e.message);
    }
  }

  function wm_convertArrayBufferToPem(arrayBuffer, label) {
    const binary = String.fromCharCode.apply(null, new Uint8Array(arrayBuffer));
    const base64 = window.btoa(binary);
    const formattedBase64 = base64.match(/.{1,64}/g).join("\n");
    return `-----BEGIN ${label}-----\n${formattedBase64}\n-----END ${label}-----`;
  }

  async function wm_generateKeyPair() {
    const certOut = document.getElementById("wm_cert_output");
    const privOut = document.getElementById("wm_private_key_output");
    const usernameInput = document.getElementById("wm_username");
    if (!certOut || !privOut || !usernameInput) return;

    try {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      );

      wm_privateKey = keyPair.privateKey;

      const privateKeyExported = await window.crypto.subtle.exportKey(
        "pkcs8",
        wm_privateKey
      );
      const privateKeyPem = wm_convertArrayBufferToPem(privateKeyExported, "PRIVATE KEY");

      const publicKeyExported = await window.crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey
      );
      const publicKeyPem = wm_convertArrayBufferToPem(publicKeyExported, "PUBLIC KEY");

      const username = usernameInput.value.trim();
      const currentTimeUTC = new Date().toISOString() + " UTC";

      const registerResponse = await apiFetch("/register_public_key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cert_id: wm_certId, public_key: publicKeyPem })
      });

      if (!registerResponse.ok) {
        const err = await registerResponse.json();
        throw new Error(err.detail || "Error registering public key");
      }

      const registerResult = await registerResponse.json();
      const txid = registerResult.txid;

      certOut.innerText += `\nPublic key registered successfully. Transaction ID: ${txid}`;
      certOut.innerText += `\nPublic Key:\n${publicKeyPem}`;
      privOut.innerText = `Private Key:\n${privateKeyPem}`;

      // NCZ → Gasket chat: certificate created
      wm_postGasketEvent("CERT_CREATED", {
        cert_id: wm_certId,
        username,
        public_key: publicKeyPem,
        txid,
        generated_at: currentTimeUTC
      });


      const downloadBtn = document.createElement("button");
      downloadBtn.innerText = "Download Keys";
      downloadBtn.onclick = function () {
        const content =
          `txid: ${txid}\nCertID: ${wm_certId}\nUsername: ${username}\nGenerated At: ${currentTimeUTC}\n\n` +
          `Public Key:\n${publicKeyPem}\n\nPrivate Key:\n${privateKeyPem}`;
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${username}_${wm_certId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      privOut.appendChild(document.createElement("br"));
      privOut.appendChild(downloadBtn);

      const explorerLink = document.createElement("a");
      explorerLink.href = `https://xtdevelopment.net/blocks/tx/${txid}`;
      explorerLink.target = "_blank";
      explorerLink.innerText = "View Transaction on Block Explorer";
      explorerLink.style.display = "block";
      explorerLink.style.marginTop = "10px";
      privOut.appendChild(explorerLink);
    } catch (e) {
      console.error("[wm] generate/register key error:", e);
      alert("Failed to generate or register key pair: " + e.message);
    }
  }

  async function wm_importPrivateKey(pemKey) {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = pemKey
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\n/g, "")
      .replace(/\r/g, "");
    const binaryDer = window.atob(pemContents);
    const binaryDerArray = new Uint8Array(
      [...binaryDer].map(c => c.charCodeAt(0))
    );

    return window.crypto.subtle.importKey(
      "pkcs8",
      binaryDerArray.buffer,
      {
        name: "ECDSA",
        namedCurve: "P-256"
      },
      true,
      ["sign"]
    );
  }

  function wm_removeLeadingZeros(arr) {
    let i = 0;
    while (i < arr.length - 1 && arr[i] === 0) i++;
    return arr.slice(i);
  }

  function wm_encodeInteger(arr) {
    const needPadding = arr[0] & 0x80;
    const length = arr.length + (needPadding ? 1 : 0);
    const encoded = new Uint8Array(2 + length);
    encoded[0] = 0x02; // INTEGER
    encoded[1] = length;
    let offset = 2;
    if (needPadding) {
      encoded[offset++] = 0x00;
    }
    encoded.set(arr, offset);
    return encoded;
  }

  function wm_convertRawSignatureToDER(rawSignature) {
    const signature = new Uint8Array(rawSignature);
    const half = signature.length / 2;
    const r = signature.slice(0, half);
    const s = signature.slice(half);
    const rStripped = wm_removeLeadingZeros(r);
    const sStripped = wm_removeLeadingZeros(s);
    const rEncoded = wm_encodeInteger(rStripped);
    const sEncoded = wm_encodeInteger(sStripped);
    const totalLength = rEncoded.length + sEncoded.length;
    const der = new Uint8Array(2 + totalLength);
    der[0] = 0x30; // SEQUENCE
    der[1] = totalLength;
    der.set(rEncoded, 2);
    der.set(sEncoded, 2 + rEncoded.length);
    return der;
  }

  async function wm_signMessageWithPrivateKey() {
    const certInput = document.getElementById("wm_cert_id_input");
    const privInput = document.getElementById("wm_private_key_input");
    const sigOut = document.getElementById("wm_signature_output");
    const verifyOut = document.getElementById("wm_verification_output");
    if (!certInput || !privInput || !sigOut || !verifyOut) return;

    const certId = certInput.value.trim();
    const pem = privInput.value.trim();

    if (!certId || !pem) {
      alert("Please enter your cert ID and private key");
      return;
    }

    try {
      const key = await wm_importPrivateKey(pem);
      const encoder = new TextEncoder();
      const data = encoder.encode(STATIC_MESSAGE);

      const rawSig = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        key,
        data
      );

      const derSig = wm_convertRawSignatureToDER(rawSig);
      const sigHex = Array.from(new Uint8Array(derSig))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      sigOut.innerText = `Signature: ${sigHex}`;

      const verifyResponse = await apiFetch("/verify_signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cert_id: certId,
          signature: sigHex
        })
      });

      const result = await verifyResponse.json();
      if (verifyResponse.ok) {
        verifyOut.innerText = "Signature verified successfully!";
      } else {
        verifyOut.innerText = `Verification failed: ${result.detail || "unknown error"}`;
      }
    } catch (e) {
      console.error("[wm] sign/verify error:", e);
      alert("Error: " + e.message);
    }
  }

  function wm_dataURLtoBlob(dataurl) {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
  }

  async function wm_embedWatermarkIntoImage(file, watermark, certId, originalFileHashHex, txid) {
    const outDiv = document.getElementById("wm_watermark_output");
    if (!outDiv) return;

    try {
      const reader = new FileReader();
      reader.onload = function (e) {
        const originalDataURL = e.target.result;
        const img = new Image();
        img.onload = async function () {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const jpegDataURL = canvas.toDataURL("image/jpeg", 1.0);
          let strippedDataURL = piexif.remove(jpegDataURL);

          // fetch username
          const usernameResp = await apiFetch(`/get_username/${certId}`);
          const usernameJson = await usernameResp.json();
          if (!usernameResp.ok) {
            alert("Failed to retrieve username");
            return;
          }
          const username = usernameJson.username;

          const zeroth = {};
          zeroth[piexif.ImageIFD.Artist] = username;
          zeroth[piexif.ImageIFD.ImageDescription] = `${watermark}, txid: ${txid}`;

          const exifObj = { "0th": zeroth };
          const exifBytes = piexif.dump(exifObj);
          const newDataURL = piexif.insert(exifBytes, strippedDataURL);
          const newBlob = wm_dataURLtoBlob(newDataURL);

          const newBuf = await newBlob.arrayBuffer();
          const newHashBuf = await crypto.subtle.digest("SHA-256", newBuf);
          const newHashHex = Array.from(new Uint8Array(newHashBuf))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
          const newSize = newBlob.size;

          const finalizeData = {
            cert_id: certId,
            final_file_hash: newHashHex,
            final_file_size: newSize,
            original_file_hash: originalFileHashHex,
            txid: txid
          };

          const finalizeResp = await apiFetch("/finalize_watermark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(finalizeData)
          });

          if (!finalizeResp.ok) {
            const err = await finalizeResp.json();
            alert(`Failed to finalize watermark: ${err.detail || "unknown error"}`);
            return;
          }

          const finalizeResult = await finalizeResp.json();

          outDiv.innerHTML = "";

          const dlLink = document.createElement("a");
          dlLink.href = URL.createObjectURL(newBlob);
          dlLink.download = `watermarked_${file.name}.jpg`;
          dlLink.innerText = `Download Watermarked Image (${newSize} bytes)`;
          outDiv.appendChild(dlLink);
          outDiv.appendChild(document.createElement("br"));

          const txidLink = document.createElement("a");
          txidLink.href = `https://xtdevelopment.net/blocks/tx/${finalizeResult.txid}`;
          txidLink.target = "_blank";
          txidLink.innerText = "View Unsigned File Transaction (txid) on the NCZ Block Explorer";

          const finalOpLink = document.createElement("a");
          finalOpLink.href = `https://xtdevelopment.net/blocks/tx/${finalizeResult.final_op_txid}`;
          finalOpLink.target = "_blank";
          finalOpLink.innerText = "View Signed File Transaction (txid) on the NCZ Block Explorer";

          outDiv.appendChild(document.createElement("br"));
          outDiv.appendChild(txidLink);
          outDiv.appendChild(document.createElement("br"));
          outDiv.appendChild(finalOpLink);
        };
        img.src = originalDataURL;
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error("[wm] embed image error:", e);
      alert("Error embedding watermark into image: " + e.message);
    }
  }

  async function wm_embedWatermarkIntoMp3(file, signedHash, certId, username, originalFileHashHex, txid) {
    const outDiv = document.getElementById("wm_watermark_output");
    if (!outDiv) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
      const mp3Data = e.target.result;
      const writer = new ID3Writer(mp3Data);

      const watermarkString = signedHash + `, txid: ${txid}`;

      writer.setFrame("COMM", {
        description: "Watermark",
        text: watermarkString + ", " + username
      });
      writer.addTag();

      const signedBlob = writer.getBlob();
      const newBuf = await signedBlob.arrayBuffer();
      const newHashBuf = await crypto.subtle.digest("SHA-256", newBuf);
      const newHashHex = Array.from(new Uint8Array(newHashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      const newSize = signedBlob.size;

      const finalizeData = {
        cert_id: certId,
        final_file_hash: newHashHex,
        final_file_size: newSize,
        original_file_hash: originalFileHashHex,
        txid: txid
      };

      const finalizeResp = await apiFetch("/finalize_watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalizeData)
      });

      if (!finalizeResp.ok) {
        const err = await finalizeResp.json();
        alert(`Failed to finalize watermark: ${err.detail || "unknown error"}`);
        return;
      }

      const finalizeResult = await finalizeResp.json();

      outDiv.innerHTML = "";

      const url = URL.createObjectURL(signedBlob);
      const dlLink = document.createElement("a");
      dlLink.href = url;
      dlLink.download = `watermarked_${file.name}`;
      dlLink.innerText = `Download Watermarked MP3 (${newSize} bytes)`;
      outDiv.appendChild(dlLink);
      outDiv.appendChild(document.createElement("br"));

      const txidLink = document.createElement("a");
      txidLink.href = `https://xtdevelopment.net/blocks/tx/${finalizeResult.txid}`;
      txidLink.target = "_blank";
      txidLink.innerText = "View Unsigned File Transaction (txid) on the NCZ Block Explorer";

      const finalOpLink = document.createElement("a");
      finalOpLink.href = `https://xtdevelopment.net/blocks/tx/${finalizeResult.final_op_txid}`;
      finalOpLink.target = "_blank";
      finalOpLink.innerText = "View Signed File Transaction (txid) on the NCZ Block Explorer";

      outDiv.appendChild(document.createElement("br"));
      outDiv.appendChild(txidLink);
      outDiv.appendChild(document.createElement("br"));
      outDiv.appendChild(finalOpLink);
    };
    reader.readAsArrayBuffer(file);
  }

  async function wm_signFile() {
    const certInput = document.getElementById("wm_file_cert_id_input");
    const privInput = document.getElementById("wm_file_private_key_input");
    const fileInput = document.getElementById("wm_file_input");
    const sigOut = document.getElementById("wm_file_signature_output");
    const verifyOut = document.getElementById("wm_file_verification_output");

    if (!certInput || !privInput || !fileInput || !sigOut || !verifyOut) return;

    const certId = certInput.value.trim();
    const pem = privInput.value.trim();
    const file = fileInput.files[0];

    if (!certId || !pem || !file) {
      alert("Please enter your cert ID, private key, and select a file");
      return;
    }

    try {
      const key = await wm_importPrivateKey(pem);
      const fileBuf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", fileBuf);
      const fileHashHex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      const originalFileHashHex = fileHashHex;

      const rawSig = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        key,
        hashBuf
      );
      const derSig = wm_convertRawSignatureToDER(rawSig);
      const sigHex = Array.from(new Uint8Array(derSig))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      sigOut.innerText = `Signature: ${sigHex}`;

      const requestData = {
        cert_id: certId,
        signature: sigHex,
        file_hash: fileHashHex,
        original_file_size: file.size,
        file_name: file.name
      };

      const verifyResp = await apiFetch("/verify_watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData)
      });

      const verifyResult = await verifyResp.json();
      if (!verifyResp.ok) {
        verifyOut.innerText = `Verification failed: ${verifyResult.detail || "unknown error"}`;
        return;
      }

      verifyOut.innerText = "File signature verified successfully!";

      const finalizeRequest = {
        cert_id: certId,
        final_file_hash: fileHashHex,
        final_file_size: file.size,
        original_file_hash: originalFileHashHex
      };

      const finalizeResp = await apiFetch("/finalize_watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalizeRequest)
      });

      const finalizeResult = await finalizeResp.json();
      if (!finalizeResp.ok) {
        alert("Failed to finalize watermark: " + (finalizeResult.detail || "unknown error"));
        return;
      }

      const txid = finalizeResult.txid;

      if (file.type.startsWith("image/")) {
        await wm_embedWatermarkIntoImage(
          file,
          verifyResult.watermark,
          certId,
          originalFileHashHex,
          txid
        );
      } else if (
        file.type === "audio/mpeg" ||
        file.type === "audio/mp3"
      ) {
        const usernameResp = await apiFetch(`/get_username/${certId}`);
        const usernameJson = await usernameResp.json();
        if (!usernameResp.ok) {
          alert("Failed to retrieve username");
          return;
        }
        const username = usernameJson.username;
        await wm_embedWatermarkIntoMp3(
          file,
          verifyResult.watermark,
          certId,
          username,
          originalFileHashHex,
          txid
        );
      }
    } catch (e) {
      console.error("[wm] signFile error:", e);
      alert("Error signing file: " + e.message);
    }
  }

  function wm_toggleUnsignedFile() {
    const cb = document.getElementById("wm_unsigned_checkbox");
    const metaInput = document.getElementById("wm_metadata_file_input");
    const metaLabel = document.getElementById("wm_metadata_label");
    if (!cb || !metaInput || !metaLabel) return;

    if (cb.checked) {
      metaInput.style.display = "block";
      metaLabel.style.display = "block";
    } else {
      metaInput.style.display = "none";
      metaLabel.style.display = "none";
    }
  }

  async function wm_importDataForVerification() {
    const certInput = document.getElementById("wm_cert_id_input");
    const privInput = document.getElementById("wm_private_key_input");
    if (!certInput || !privInput) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const data = evt.target.result;
        const certMatch = data.match(/CertID: (.*)/);
        const pkMatch = data.match(/Private Key:\n([\s\S]*)/);
        if (certMatch && pkMatch) {
          certInput.value = certMatch[1].trim();
          privInput.value = pkMatch[1].trim();
        } else {
          alert("Invalid file format.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function wm_importDataForWatermark() {
    const certInput = document.getElementById("wm_file_cert_id_input");
    const privInput = document.getElementById("wm_file_private_key_input");
    if (!certInput || !privInput) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const data = evt.target.result;
        const certMatch = data.match(/CertID: (.*)/);
        const pkMatch = data.match(/Private Key:\n([\s\S]*)/);
        if (certMatch && pkMatch) {
          certInput.value = certMatch[1].trim();
          privInput.value = pkMatch[1].trim();
        } else {
          alert("Invalid file format.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function wm_restoreCertFromFile() {
    const out = document.getElementById("wm_restore_cert_output");
    if (!out) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();

        // These match the format of the downloaded keys file:
        // txid: ...
        // CertID: ...
        // Username: ...
        // ...
        // Public Key:
        // -----BEGIN PUBLIC KEY-----
        // ...
        // -----END PUBLIC KEY-----
        // 
        // Private Key:
        // ...

        const certIdMatch = text.match(/CertID:\s*(.+)/);
        const usernameMatch = text.match(/Username:\s*(.+)/);
        const pubKeyMatch = text.match(/Public Key:\s*([\s\S]*?)\n\nPrivate Key:/);
        const txidMatch = text.match(/txid:\s*(.+)/i); // keep flexible in case it's not strict hex

        if (!certIdMatch || !usernameMatch || !pubKeyMatch) {
          out.textContent = "Could not parse CertID / Username / Public Key from file.";
          return;
        }

        const payload = {
          cert_id: certIdMatch[1].trim(),
          username: usernameMatch[1].trim(),
          public_key: pubKeyMatch[1].trim(),
          txid: txidMatch ? txidMatch[1].trim() : null
        };

        out.textContent = "Uploading certificate…";

        const resp = await apiFetch("/restore_cert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        let data = {};
        try {
          data = await resp.json();
        } catch {
          // backend might not return JSON if misconfigured
        }

        if (!resp.ok) {
          out.textContent =
            "Restore failed: " + (data.detail || (resp.status + " " + resp.statusText));
          return;
        }

        out.textContent = data.message || "Certificate restored into server JSON.";
      } catch (err) {
        console.error("[wm] restore cert error:", err);
        out.textContent = "Error reading or uploading cert file: " + err.message;
      }
    };

    input.click();
  }



  function wm_extractCertTxid(watermark) {
    const match = watermark && watermark.match(/Cert_txID:\s([a-fA-F0-9]{64})/);
    return match && match[1] ? match[1] : null;
  }

  async function wm_findSignedTxid(unsignedTxid, certTxid) {
    const resultDiv = document.getElementById("wm_verification_result");
    const verifyOut = document.getElementById("wm_verify_output");
    if (!verifyOut) return;

    try {
      const txidMatch = unsignedTxid.match(/tx\/([a-fA-F0-9]{64})/);
      if (!txidMatch || !txidMatch[1]) throw new Error("Unable to extract txid");
      const extractedTxid = txidMatch[1];

      const resp = await apiFetch(`/find_signed_txid/${extractedTxid}`);
      if (!resp.ok) throw new Error("Failed to fetch signed txid");
      const data = await resp.json();
      const signedTxid = data.signed_txid;

      const signedCertLink = document.createElement("a");
      signedCertLink.href = `https://xtdevelopment.net/blocks/tx/${certTxid}`;
      signedCertLink.target = "_blank";
      signedCertLink.innerText = `View Creator's Cert Transaction (txid) on the NCZ Block Explorer`;

      const strongText = document.createElement("strong");
      strongText.innerHTML = "Signed File NCZ txID: ";

      const txidLink = document.createElement("a");
      txidLink.href = `https://xtdevelopment.net/blocks/tx/${signedTxid}`;
      txidLink.target = "_blank";
      txidLink.innerText = signedTxid;

      verifyOut.appendChild(document.createElement("br"));
      verifyOut.appendChild(strongText);
      verifyOut.appendChild(txidLink);
      verifyOut.appendChild(document.createElement("br"));
      verifyOut.appendChild(document.createElement("br"));
      verifyOut.appendChild(signedCertLink);
      verifyOut.appendChild(document.createElement("br"));

      if (resultDiv) {
        resultDiv.innerHTML =
          '<p style="color: green; font-size: 18px;">Successfully found the signed txid on the blockchain!</p>';
      }
    } catch (e) {
      console.error("[wm] findSignedTxid error:", e);
      if (resultDiv) {
        resultDiv.innerHTML =
          '<p style="color: red; font-size: 18px;">The block hasn\'t been written yet. Please try again in a moment.</p>';
      }
    }
  }

  async function wm_verifyFile() {
    const resultDiv = document.getElementById("wm_verification_result");
    const out = document.getElementById("wm_verify_output");
    const fileInput = document.getElementById("wm_verify_file_input");
    const metaInput = document.getElementById("wm_metadata_file_input");
    const unsignedCb = document.getElementById("wm_unsigned_checkbox");

    if (!out || !fileInput || !unsignedCb) return;
    if (resultDiv) resultDiv.innerHTML = "";
    out.innerHTML = "";

    const file = fileInput.files[0];
    if (!file) {
      alert("Please select a file to verify");
      return;
    }

    if (unsignedCb.checked) {
      if (!metaInput) return;
      const metaFile = metaInput.files[0];
      if (!metaFile) {
        alert("Please upload the metadata file for unsigned verification");
        return;
      }

      const fileBuf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", fileBuf);
      const fileHashHex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      const metaText = await metaFile.text();
      const hashMatch = metaText.match(/Unsigned File Hash:\s([a-fA-F0-9]{64})/);
      if (!hashMatch || !hashMatch[1]) {
        alert("Invalid metadata file format. Hash not found.");
        return;
      }

      const originalHash = hashMatch[1];
      if (fileHashHex === originalHash) {
        if (resultDiv) {
          resultDiv.innerHTML =
            '<p style="color: green; font-size: 18px;">File hash matches the metadata! Verification successful.</p>';
        }
      } else {
        if (resultDiv) {
          resultDiv.innerHTML =
            '<p style="color: red; font-size: 18px;">File hash does not match the metadata. Verification failed.</p>';
        }
      }
      return;
    }

    const fileBuf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", fileBuf);
    const fileHashHex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    const fileType = file.type;
    if (fileType.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = async function (e) {
        const dataURL = e.target.result;
        const exifObj = piexif.load(dataURL);
        const zeroth = exifObj["0th"] || {};
        const watermark = zeroth[piexif.ImageIFD.ImageDescription];
        const username = zeroth[piexif.ImageIFD.Artist];

        if (!watermark || !username) {
          out.innerText = "No watermark or username found in image metadata.";
          return;
        }

        const requestData = {
          username,
          file_hash: fileHashHex,
          file_size: file.size
        };

        const verifyResp = await apiFetch("/verify_image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData)
        });

        const verifyResult = await verifyResp.json();
        const img = new Image();
        img.src = dataURL;
        img.onload = function () {
          const maxWidth = 500;
          const maxHeight = 500;
          let w = img.width;
          let h = img.height;
          if (w > h && w > maxWidth) {
            h *= maxWidth / w;
            w = maxWidth;
          } else if (h >= w && h > maxHeight) {
            w *= maxHeight / h;
            h = maxHeight;
          }
          img.width = w;
          img.height = h;
        };

        out.appendChild(img);

        const cleanedWatermark = String(watermark).replace("Watermark: ", "");
        const metaDiv = document.createElement("div");
        metaDiv.innerHTML = `
          <strong>Certified Creator:</strong> ${username}<br>
          <strong>Watermark:</strong> ${cleanedWatermark}<br>
          <strong>Unsigned File Hash:</strong> ${verifyResult.original_file_hash || "Not available"}<br>
          <strong>Unsigned File Size:</strong> ${verifyResult.original_file_size || "Not available"} bytes<br>
          <strong>Original Filename:</strong> ${verifyResult.original_file_name || "Not available"}<br>
          <strong>Signed File Hash:</strong> ${fileHashHex}<br>
          <strong>Signed File Size:</strong> ${file.size} bytes<br>
          <strong>Unsigned File NCZ txID:</strong> ${verifyResult.txid || "Not available"}
        `;
        const msgDiv = document.createElement("div");
        msgDiv.innerHTML =
          "<br><strong>Verification Result:</strong> " +
          (verifyResult.message || "Unknown");

        out.appendChild(metaDiv);
        out.appendChild(msgDiv);

        const certTxid = wm_extractCertTxid(watermark);
        if (certTxid) {
          await wm_findSignedTxid(verifyResult.txid, certTxid);
        }
      };
      reader.readAsDataURL(file);
    } else if (fileType === "audio/mpeg" || fileType === "audio/mp3") {
      jsmediatags.read(file, {
        onSuccess: async function (tag) {
          const tags = tag.tags || {};
          let watermark = tags.comment ? tags.comment.text : null;
          if (!watermark && tags.COMM && tags.COMM.data && tags.COMM.data.text) {
            watermark = tags.COMM.data.text;
          }
          if (!watermark) {
            out.innerText = "No watermark found in MP3 metadata.";
            return;
          }

          const username =
            watermark.substring(watermark.lastIndexOf(", ") + 2) || "Unknown";

          const requestData = {
            username,
            file_hash: fileHashHex,
            file_size: file.size
          };

          const verifyResp = await apiFetch("/verify_audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestData)
          });

          const verifyResult = await verifyResp.json();
          const cleanedWatermark = String(watermark).replace("Watermark: ", "");
          const metaDiv = document.createElement("div");
          metaDiv.innerHTML = `
            <strong>Certified Creator:</strong> ${username}<br>
            <strong>Watermark:</strong> ${cleanedWatermark}<br>
            <strong>Unsigned File Hash:</strong> ${verifyResult.original_file_hash || "Not available"}<br>
            <strong>Unsigned File Size:</strong> ${verifyResult.original_file_size || "Not available"} bytes<br>
            <strong>Original Filename:</strong> ${verifyResult.original_file_name || "Not available"}<br>
            <strong>Signed File Hash:</strong> ${fileHashHex}<br>
            <strong>Signed File Size:</strong> ${file.size} bytes<br>
            <strong>Unsigned File NCZ txID:</strong> ${verifyResult.txid || "Not available"}
          `;
          const msgDiv = document.createElement("div");
          msgDiv.innerHTML =
            "<br><strong>Verification Result:</strong> " +
            (verifyResult.message || "Verification failed");

          out.appendChild(metaDiv);
          out.appendChild(msgDiv);

          const certTxid = wm_extractCertTxid(watermark);
          if (certTxid) {
            await wm_findSignedTxid(verifyResult.txid, certTxid);
          }
        },
        onError: function (error) {
          console.error("[wm] jsmediatags error:", error);
          out.innerText = "Error reading MP3 metadata";
        }
      });
    } else {
      alert("Unsupported file type. Please select a JPEG image or an MP3 file.");
    }
  }

  // ---------- BUILD POPUP UI & HOOK BUTTON ----------

  onReady(function () {
    const overlay = document.createElement("div");
    overlay.id = "wm_overlay";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(0,0,0,0.8)",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "z-index:99999"
    ].join(";");

    const panel = document.createElement("div");
    panel.id = "wm_panel";
    panel.style.cssText = [
      "background:#0d1a2b",
      "border:1px solid #0ff",
      "max-width:1200px",
      "width:95%",
      "max-height:90vh",
      "height:90vh",
      "display:flex",
      "flex-direction:column",
      "box-sizing:border-box",
      "box-shadow:0 0 16px rgba(0,0,0,0.9)",
      "font-family:Arial, sans-serif",
      "color:#fff"
    ].join(";");

    panel.innerHTML = `
      <div id="wm_header" style="
        flex:0 0 auto;
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:4px 8px;
        border-bottom:1px solid #0ff;
        background:#050505;
        box-sizing:border-box;
        font-family:monospace;
        font-size:12px;
      ">
        <span id="wm_title">NanoCheeZe AI Certification Watermarking Tool</span>
        <button id="wm_close" type="button" style="
          background:#111;
          color:#0ff;
          border:1px solid #0ff;
          font-family:monospace;
          font-size:11px;
          padding:2px 8px;
          cursor:pointer;
        ">CLOSE</button>
      </div>
      <div id="wm_content" style="
        flex:1 1 auto;
        overflow:auto;
        padding:10px;
        box-sizing:border-box;
      ">
        <div id="wm_root">
          <h1 style="text-align:center;color:white;margin-top:4px;">
            NanoCheeZe AI Certification Watermarking Tool
          </h1>

          <div class="wm-nav-buttons" style="
            display:flex;
            justify-content:center;
            margin-bottom:20px;
            gap:10px;
          ">
            <button data-section="home">Home</button>
            <button data-section="wm_create_cert_section">Create Certificate</button>
            <button data-section="wm_verify_key_section">Verify Private Key</button>
            <button data-section="wm_sign_file_section">Sign File</button>
            <button data-section="wm_verify_file_section">Verify File</button>
          </div>

<div id="wm_instructions" style="
  max-width: 900px;
  margin: 0 auto;
  text-align: left;
  font-size: 14px;
  line-height: 1.6;
  color: #ddd;
  display: block;
">
  <h2 style="text-align:center; margin-bottom: 12px;">
    How to Use the NanoCheeZe AI Certification Watermarking Tool
  </h2>

  <p>
    This tool lets you:
  </p>
  <ul>
    <li>Create an on-chain <strong>Certificate ID (CertID)</strong> tied to a public key.</li>
    <li>Generate a local <strong>private key</strong> that only you control.</li>
    <li>Sign images / MP3s and embed a <strong>verifiable watermark</strong> into their metadata.</li>
    <li>Prove later that a given file really came from you by checking it against the blockchain.</li>
  </ul>

  <hr style="border-color:#2a3e55; margin: 12px 0;" />

  <h3>Step 1 – Create Your Certificate</h3>
  <ol>
    <li>Click <strong>“Create Certificate”</strong> in the navigation bar above.</li>
    <li>Enter a <strong>username</strong> (this will be displayed as the certified creator).</li>
    <li>Click <strong>“Generate Certificate”</strong>.</li>
    <li>
      The system will:
      <ul>
        <li>Create a new <strong>CertID</strong> on the backend.</li>
        <li>Generate an <strong>ECDSA P-256 keypair</strong> locally in your browser.</li>
        <li>Send your <strong>public key</strong> to the server to be written on-chain.</li>
      </ul>
    </li>
    <li>
      You’ll see:
      <ul>
        <li>A printed <strong>CertID</strong> and blockchain <strong>txid</strong>.</li>
        <li>Your <strong>public key</strong>.</li>
        <li>Your <strong>private key</strong> (in red) and a <strong>Download Keys</strong> button.</li>
      </ul>
    </li>
  </ol>

  <p style="color:#ff7777;">
    ⚠ IMPORTANT: Your private key is generated locally and never stored by the server.
    If you lose it, it cannot be recovered. Download the key file and back it up safely.
  </p>

  <hr style="border-color:#2a3e55; margin: 12px 0;" />

  <h3>Step 2 – Verify Your Private Key (Optional Sanity Check)</h3>
  <ol>
    <li>Click <strong>“Verify Private Key”</strong> in the navigation bar.</li>
    <li>
      Either:
      <ul>
        <li>Click <strong>“Import Data”</strong> and load the key text file you downloaded, or</li>
        <li>Paste your <strong>CertID</strong> and <strong>private key</strong> manually.</li>
      </ul>
    </li>
    <li>Click <strong>“Verify Key”</strong>.</li>
    <li>
      The tool signs a fixed message with your private key and asks the server to
      verify it against your on-chain public key.
    </li>
  </ol>
  <p>
    If verification succeeds, you know your private key matches the registered CertID
    and the certificate is valid.
  </p>

  <hr style="border-color:#2a3e55; margin: 12px 0;" />

  <h3>Step 3 – Sign a File and Embed a Watermark</h3>
  <ol>
    <li>Click <strong>“Sign File”</strong> in the navigation bar.</li>
    <li>
      Load your keys:
      <ul>
        <li>Use <strong>“Import Data”</strong> to load the downloaded key file, or</li>
        <li>Paste your <strong>CertID</strong> and <strong>private key</strong> manually.</li>
      </ul>
    </li>
    <li>
      Choose a file in <strong>JPEG / JPG / PNG / GIF / WEBP / MP3</strong> format using the file picker.
    </li>
    <li>Click <strong>“Sign File and Embed Watermark”</strong>.</li>
  </ol>
  <p>
    Under the hood:
  </p>
  <ul>
    <li>The file is hashed with <strong>SHA-256</strong> locally.</li>
    <li>The hash is signed with your private key.</li>
    <li>
      The tool sends the signature + metadata to the server, which:
      <ul>
        <li>Verifies the signature using your on-chain public key.</li>
        <li>Stores a record of this watermark on the NanoCheeZe chain.</li>
      </ul>
    </li>
    <li>
      The watermark string (including txids) is embedded into:
      <ul>
        <li><strong>Image EXIF</strong> (Artist + ImageDescription) for images, or</li>
        <li><strong>ID3 COMM tag</strong> for MP3s.</li>
      </ul>
    </li>
  </ul>
  <p>
    You’ll get:
  </p>
  <ul>
    <li>A <strong>watermarked file</strong> to download.</li>
    <li>A <strong>metadata .txt file</strong> containing hashes, sizes, and txids.</li>
    <li>Links to the <strong>unsigned</strong> and <strong>signed</strong> transactions on the NCZ block explorer.</li>
  </ul>

  <hr style="border-color:#2a3e55; margin: 12px 0;" />

  <h3>Step 4 – Verify a File Later</h3>
  <ol>
    <li>Click <strong>“Verify File”</strong> in the navigation bar.</li>
    <li>
      Decide what you’re verifying:
      <ul>
        <li>
          <strong>Signed file</strong> (with embedded watermark)<br />
          – Leave <em>“Unsigned File”</em> unchecked and pick your signed image/MP3.
        </li>
        <li>
          <strong>Unsigned original file</strong> against metadata<br />
          – Check <em>“Unsigned File”</em>, select the original file and the
          <code>metadata_… .txt</code> you downloaded when you signed it.
        </li>
      </ul>
    </li>
    <li>Click <strong>“Verify File”</strong>.</li>
  </ol>

  <p>
    For <strong>signed files</strong>:
  </p>
  <ul>
    <li>The tool reads the embedded watermark + creator info from EXIF / ID3.</li>
    <li>It re-hashes the file and sends the data to the server.</li>
    <li>
      The backend looks up the cert and stored record on the blockchain and returns:
      <ul>
        <li>Certified creator username</li>
        <li>Original file hash, size, and name</li>
        <li>Signed file hash and size</li>
        <li>Unsigned and signed NCZ txids</li>
        <li>A verification result message (pass / fail)</li>
      </ul>
    </li>
    <li>The UI shows all of this plus links to view the txids on the explorer.</li>
  </ul>

  <p>
    For <strong>unsigned originals</strong> using the metadata file:
  </p>
  <ul>
    <li>The tool hashes the file locally.</li>
    <li>It reads the stored hash from your metadata <code>.txt</code> file.</li>
    <li>If the hashes match, the file is confirmed to be the same original that was certified.</li>
  </ul>

  <hr style="border-color:#2a3e55; margin: 12px 0;" />

  

  <p style="margin-top: 12px; font-size: 13px; color:#aaa;">
    Once you understand these steps, just use the buttons at the top:
    <strong>Create Certificate</strong> → <strong>Sign File</strong> → <strong>Verify File</strong>.
  </p><br />
<hr /><br />
  <h3>Restoring a Certificate from a Backup File</h3>
  <p style="font-size: 14px; color:#ddd;">
    If the NanoCheeZe cert database on the server is ever lost or rebuilt, you can
    restore your certificate entry using the <strong>key file</strong> you downloaded.
  </p>
  <ol>
    <li>Go to <strong>Create Certificate</strong> in the navigation bar.</li>
    <li>Scroll down to <strong>“Restore an Existing Certificate”</strong>.</li>
    <li>Click <strong>“Restore Cert from Backup File”</strong> and select your saved key file.</li>
    <li>
      The tool will read:
      <ul>
        <li><strong>CertID</strong></li>
        <li><strong>Username</strong></li>
        <li><strong>Public key</strong></li>
        <li>(Optional) the original <strong>txid</strong></li>
      </ul>
      and push that data back into the server’s certificate store so verification and watermarking
      can work again.
    </li>
  </ol>
  <p style="font-size: 13px; color:#ffbbbb;">
    Restoring a cert does <strong>not</strong> recreate your private key on the server — it only
    re-registers the public side and metadata. You still need your downloaded key file to sign files.
  </p>

  <hr style="border-color:#2a3e55; margin: 12px 0;" />

  <h3>Privacy, Security & Anti-Abuse Limits</h3>
  <ul>
    <li>Your private key is generated <strong>in your browser</strong> and is never sent to the server.</li>
    <li>
      The blockchain only stores:
      <ul>
        <li>Your public key</li>
        <li>Your CertID</li>
        <li>File hashes and related metadata for verification</li>
      </ul>
    </li>
    <li>
      Image / audio watermarking is done locally; the server only sees hashes and signing data,
      not the raw media content.
    </li>
    <li>
      <strong>Do not lose your private key file.</strong> There is no recovery if it’s lost. The
      restore feature can bring your certificate record back to the server, but it cannot recreate
      your private key.
    </li>
    <li>
      To prevent abuse and automated spam, there is a hard limit of
      <strong>7 successful certificates per IP address</strong>, total:
      <ul>
        <li>Each successful <strong>Create Certificate</strong> counts as <em>one</em>.</li>
        <li>Each successful <strong>Restore Cert from Backup File</strong> also counts as <em>one</em>.</li>
      </ul>
      If you hit this limit, the proxy will refuse new create/restore requests and return a
      <strong>“Too many certificates created/restored from this IP address”</strong> message.
    </li>
  </ul>

  <p style="margin-top: 12px; font-size: 13px; color:#aaa;">

    Only use <strong>Restore Cert from Backup File</strong> if the server-side cert data ever needs to be rebuilt (It was rebuilt on 11/30/2025).
  </p>

</div>


<div id="wm_create_cert_section" class="wm-section" style="display:none;">
  <h2>Create a New Certificate</h2>
  <label for="wm_username">Username:</label>
  <input type="text" id="wm_username" placeholder="Enter username">
  <button type="button" id="wm_btn_generate_cert">Generate Certificate</button>
  <pre id="wm_cert_output"></pre>

  <h3>Your Private Key (DO NOT SHARE THIS):</h3>
  <pre id="wm_private_key_output" style="color:red;"></pre>

  <hr style="margin-top:16px;margin-bottom:8px;border-color:#2a3e55;">
  <h3>Restore an Existing Certificate</h3>
  <p style="font-size:13px;color:#ccc;">
    Use this if you have a previously downloaded NanoCheeZe key file and the server-side
    cert DB was lost. This will re-add the cert to the JSON store as long as the
    <strong>CertID</strong> and <strong>Username</strong> are not already in use.
  </p>
  <button type="button" id="wm_btn_restore_cert">Restore Cert from Backup File</button>
  <pre id="wm_restore_cert_output"></pre>
</div>


          <div id="wm_verify_key_section" class="wm-section" style="display:none;">
            <h2>Verify Your Private Key</h2>
            <button type="button" id="wm_btn_import_verify">Import Data</button>
            <br><br>
            <label for="wm_cert_id_input">Cert ID:</label>
            <input type="text" id="wm_cert_id_input" placeholder="Enter your cert ID"><br><br>
            <textarea id="wm_private_key_input" rows="2" cols="70" placeholder="Enter your private key"></textarea><br>
            <button type="button" id="wm_btn_verify_key">Verify Key</button>
            <pre id="wm_signature_output"></pre>
            <pre id="wm_verification_output"></pre>
          </div>

          <div id="wm_sign_file_section" class="wm-section" style="display:none;">
            <h2>Sign a File and Embed Watermark</h2>
            <button type="button" id="wm_btn_import_watermark">Import Data</button><br><br>
            <label for="wm_file_cert_id_input">Cert ID:</label>
            <input type="text" id="wm_file_cert_id_input" placeholder="Enter your cert ID"><br><br>
            <textarea id="wm_file_private_key_input" rows="2" cols="70" placeholder="Enter your private key"></textarea><br><br>
            <input type="file" id="wm_file_input" accept=".jpeg,.jpg,.mp3,.png,.gif,.webp"><br><br>
            <button type="button" id="wm_btn_sign_file">Sign File and Embed Watermark</button>
            <pre id="wm_file_signature_output"></pre>
            <pre id="wm_file_verification_output"></pre>
            <div id="wm_watermark_output"></div>
          </div>

                    <div id="wm_verify_file_section" class="wm-section" style="display:none;">
            <h2>Verify a File</h2>
            <label>
              <input type="checkbox" id="wm_unsigned_checkbox">
              Unsigned File
            </label>
            <br><br>
            <input type="file" id="wm_verify_file_input" accept="image/jpeg,audio/mp3"><br><br>
            <label id="wm_metadata_label" style="display:none;">Metadata Upload:</label>
            <input type="file" id="wm_metadata_file_input" accept=".txt" style="display:none;"><br><br>
            <button type="button" id="wm_btn_verify_file">Verify File</button>
            <pre id="wm_verify_output"></pre>
            <div id="wm_verification_result"></div>
          </div>

          <!-- BEGIN ORIGINAL FOOTER CONTENT -->
          <br /><br /><br /><br />
          <div>
            <center>
              No data is sent to the verification blockchain except for your signed message and your public key which is used to verify that your private key was authentic.<br />
              All Data is processed and downloaded locally from your machine using a blob. Meta data is injected into the EXIF data of images and into the comment section of mp3 files. Video Support soon.<br />
              Do not lose your private keys. They can not be retrieved or recovered.<br />
             If you don't have them backedup up then nobody does. We do not have your private keys as your machine generated them.<br /><br />
© <span id="ncz_year"></span> NanoCheeZe
              <br /><br />
              <a href="https://github.com/cybershrapnel" target="_blank">
                <img id="logofooter" src="https://www.xtdevelopment.net/music/logo.png" alt="Logo">
              </a>

              <div id="visitor-counter" style="text-align:center; color: lightgray; margin-top: 20px;">
                <!-- Visitor count will be populated here -->
              </div>

              <!-- Operation Counters (Certs, Watermarks, Verifications) -->
              <div id="operation-counter" style="text-align:center; color: lightgray; margin-top: 20px;">
                <!-- Cert, watermarking, and verify count will be populated here -->
              </div>

              <div>
                <p>Total Coin Supply: <span id="total_supply"></span></p>
                <p>Current Block: <span id="block_count"></span></p>
                <a id="block_explorer_link" href="#" target="_blank">View the Block Explorer</a>
              </div>

              <!-- Help & Support Us Section -->
              <div id="support_section">
                <h2>Help Support Us</h2>
                <p>We appreciate your support! You can donate using the following cryptocurrency addresses:</p>

                <div>
                  <p><strong>Bitcoin Address:</strong> <span id="btc_address" onclick="toggleQRCode('btc_qr', 'btc_link')">1FBN84Rbw612pLpnyFn8orH5JdjaqhUr18</span></p>
                  <a id="btc_link" href="#" target="_blank" style="display:none;">
                    <img id="btc_qr" alt="BTC QR Code" style="display:none;">
                  </a>
                </div>

                <div>
                  <p><strong>Litecoin Address:</strong> <span id="ltc_address" onclick="toggleQRCode('ltc_qr', 'ltc_link')">LeWKV2SwbSr1YotCSD99pnTSTA53xcQk2Z</span></p>
                  <a id="ltc_link" href="#" target="_blank" style="display:none;">
                    <img id="ltc_qr" alt="LTC QR Code" style="display:none;">
                  </a>
                </div>

                <div>
                  <p><strong>Dogecoin Address:</strong> <span id="doge_address" onclick="toggleQRCode('doge_qr', 'doge_link')">DNJA2vr7Jo7T7PKUGmASxULm8hXN4TLHRt</span></p>
                  <a id="doge_link" href="#" target="_blank" style="display:none;">
                    <img id="doge_qr" alt="DOGE QR Code" style="display:none;">
                  </a>
                </div>

                <div>
                  <p><strong>Ethereum Address:</strong> <span id="eth_address" onclick="toggleQRCode('eth_qr', 'eth_link')">0x8265a4611258fDA6B5040cF9dB50FF5702B208E1</span></p>
                  <a id="eth_link" href="#" target="_blank" style="display:none;">
                    <img id="eth_qr" alt="ETH QR Code" style="display:none;">
                  </a>
                </div>
              </div>



              <!-- Section to display the address and QR code dynamically -->
              <div id="crypto_info" style="display:none; margin-top: 10px;"></div>

   

              <!-- New Div to Display Total NCZ Spent -->
              <div id="ncz-counter" style="text-align:center; color: lightgray; margin-top: 20px;">
                <!-- Total NCZ spent will be populated here -->
              </div>
            </center>
          </div>
          <!-- END ORIGINAL FOOTER CONTENT -->
        </div>
      </div>

    </div> <!-- end of #wm_root -->


  


    `;

  


  // ---------- FOOTER / STATS VIA PROXY (same endpoints as old page) ----------

  async function wm_fetchVisitorCount() {
    const box = document.getElementById("visitor-counter");
    if (!box) return;

    try {
      const resp = await apiFetch("/count_visits");
      if (!resp.ok) {
        console.error("[wm] count_visits error:", resp.status, resp.statusText);
        return;
      }
      const data = await resp.json();
      const totalVisits = data.total_visits;
      const uniqueVisitors = data.unique_visitors;

      box.innerHTML =
        `Total Visits: ${totalVisits} | Unique Visitors: ${uniqueVisitors}`;
    } catch (e) {
      console.error("[wm] fetchVisitorCount error:", e);
    }
  }

  async function wm_fetchCounters() {
    const opBox = document.getElementById("operation-counter");
    const nczBox = document.getElementById("ncz-counter");
    if (!opBox && !nczBox) return;

    try {
      const resp = await apiFetch("/get_counters");
      if (!resp.ok) {
        console.error("[wm] get_counters error:", resp.status, resp.statusText);
        return;
      }
      const data = await resp.json();

      const certsCreated = data.certs_created ?? 0;
      const filesWatermarked = data.files_watermarked ?? 0;
      const filesVerified = data.files_verified ?? 0;

      if (opBox) {
        opBox.innerHTML =
          `Certs Created On-Chain: ${certsCreated} | ` +
          `Files Watermarked: ${filesWatermarked} | ` +
          `Files Verified: ${filesVerified}`;
      }

      // Same NCZ math as the old page
      const nczSpent = (certsCreated * 0.001) + (filesWatermarked * 0.002);
      if (nczBox) {
        nczBox.innerHTML =
          `Total NCZ Spent on Certification: ${nczSpent.toFixed(3)} NCZ`;
      }
    } catch (e) {
      console.error("[wm] fetchCounters error:", e);
    }
  }

  async function wm_fetchChainInfo() {
document.getElementById("ncz_year").textContent = new Date().getFullYear();
    const supplyEl = document.getElementById("total_supply");
    const blockEl = document.getElementById("block_count");
    const explorerEl = document.getElementById("block_explorer_link");

    // If footer isn’t present, bail quietly
    if (!supplyEl && !blockEl && !explorerEl) return;

    try {
      const resp = await apiFetch("/chain_info");
      if (!resp.ok) {
        console.error("[wm] chain_info error:", resp.status, resp.statusText);
        return;
      }
      const data = await resp.json();

      // Old file used total_coin_supply / block_count / block_hash
      if (blockEl && data.block_count != null) {
        blockEl.innerText = data.block_count;
      }
      if (supplyEl && data.total_coin_supply != null) {
        supplyEl.innerText = data.total_coin_supply;
      }

      if (explorerEl) {
        if (data.block_hash) {
          explorerEl.href = `https://xtdevelopment.net/blocks/block/${data.block_hash}`;
        } else {
          // Fallback if block_hash isn’t returned
          explorerEl.href = "https://explorer.nanocheeze.comr";
        }
      }
    } catch (e) {
      console.error("[wm] fetchChainInfo error:", e);
    }
  }

  // ---------- DONATION QR HELPERS (used by inline onclick in footer) ----------

  // Expose to inline onclick="toggleQRCode(...)" in the HTML
  window.toggleQRCode = function (qrId, linkId) {
    const qr = document.getElementById(qrId);
    const link = document.getElementById(linkId);
    if (!qr || !link) return;

    const isHidden = qr.style.display === "none" || !qr.style.display;
    qr.style.display = isHidden ? "block" : "none";
    link.style.display = isHidden ? "block" : "none";
  };

  window.generateQRCodeURL = function (address) {
    return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
      address
    )}&size=200x200`;
  };

  function wm_initDonationQRCodes() {
    const btcAddrEl = document.getElementById("btc_address");
    const ltcAddrEl = document.getElementById("ltc_address");
    const dogeAddrEl = document.getElementById("doge_address");
    const ethAddrEl = document.getElementById("eth_address");

    const btcQr = document.getElementById("btc_qr");
    const ltcQr = document.getElementById("ltc_qr");
    const dogeQr = document.getElementById("doge_qr");
    const ethQr = document.getElementById("eth_qr");

    const btcLink = document.getElementById("btc_link");
    const ltcLink = document.getElementById("ltc_link");
    const dogeLink = document.getElementById("doge_link");
    const ethLink = document.getElementById("eth_link");

    if (btcAddrEl && btcQr && btcLink) {
      const addr = btcAddrEl.innerText.trim();
      btcQr.src = window.generateQRCodeURL(addr);
      btcLink.href = `https://www.blockchain.com/btc/address/${addr}`;
    }
    if (ltcAddrEl && ltcQr && ltcLink) {
      const addr = ltcAddrEl.innerText.trim();
      ltcQr.src = window.generateQRCodeURL(addr);
      ltcLink.href = `https://blockchair.com/litecoin/address/${addr}`;
    }
    if (dogeAddrEl && dogeQr && dogeLink) {
      const addr = dogeAddrEl.innerText.trim();
      dogeQr.src = window.generateQRCodeURL(addr);
      dogeLink.href = `https://dogechain.info/address/${addr}`;
    }
    if (ethAddrEl && ethQr && ethLink) {
      const addr = ethAddrEl.innerText.trim();
      ethQr.src = window.generateQRCodeURL(addr);
      ethLink.href = `https://etherscan.io/address/${addr}`;
    }
  }


// --- scoped styles to mimic original watermark page ---
const wmStyle = document.createElement("style");
wmStyle.textContent = `
  /* main content in popup */
  #wm_content {
    background-color: #0d1a2b;
    color: white;
    font-family: Arial, sans-serif;
  }

  #wm_content h1 {
    text-align: center;
    color: white;
  }

  #wm_logo {
    display: block;
    margin: 0 auto;
    width: 800px;
    max-width: 70%;
  }

  .wm-section {
    display: none;
    background-color: #1b2a3c;
    padding: 20px;
    border-radius: 10px;
    margin-top: 10px;
  }

  .wm-nav-buttons {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
  }

  .wm-nav-buttons button {
    margin: 0 10px;
    padding: 10px 20px;
    font-size: 16px;
    background-color: red;
    color: white;
    border: none;
    cursor: pointer;
    transition: background-color 0.3s ease;
    border-radius: 5px;
    font-family: Arial, sans-serif;
  }

  .wm-nav-buttons button:hover {
    background-color: blue;
  }

  .wm-nav-buttons button.active {
    background-color: green;
  }

  #wm_content pre {
    background-color: #2a3e55;
    color: #e6e6e6;
    padding: 10px;
    border-radius: 5px;
    overflow-x: auto;
  }

  #wm_content a {
    color: darkgray;
    font-size: 18px;
    text-decoration: underline;
    font-weight: bold;
  }

  #wm_content a:hover {
    color: lightgray;
  }
  /* ...everything you already have... */

  /* Generic buttons inside the watermark popup */
  #wm_content button {
    background-color: #222;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-family: Arial, sans-serif;
    font-size: 14px;
  }

  #wm_content button:hover {
    background-color: #333;
  }
  /* inputs & textareas inside popup */
  #wm_content input[type="text"],
  #wm_content input[type="file"],
  #wm_content textarea {
    background-color: #111;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 4px 6px;
    font-family: Arial,sans-serif;
    font-size: 14px;
  }

  #wm_content input[type="text"]::placeholder,
  #wm_content textarea::placeholder {
    color: #888;
  }

`;
panel.prepend(wmStyle);



    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const header = document.getElementById("wm_header");
    const closeBtn = document.getElementById("wm_close");

    function openOverlay() {
      overlay.style.display = "flex";
      wm_showSection("home");
    }

    function closeOverlay() {
      overlay.style.display = "none";
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeOverlay);
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeOverlay();
      }
    });

    // Wire nav buttons
    document.querySelectorAll(".wm-nav-buttons button").forEach(btn => {
      btn.addEventListener("click", () => {
        wm_showSection(btn.dataset.section);
      });
    });

    // Wire core actions
    const btnGen = document.getElementById("wm_btn_generate_cert");
    const btnImpVerify = document.getElementById("wm_btn_import_verify");
    const btnVerifyKey = document.getElementById("wm_btn_verify_key");
    const btnImpWater = document.getElementById("wm_btn_import_watermark");
    const btnSignFile = document.getElementById("wm_btn_sign_file");
    const btnVerifyFile = document.getElementById("wm_btn_verify_file");
    const unsignedCb = document.getElementById("wm_unsigned_checkbox");
    const btnRestoreCert = document.getElementById("wm_btn_restore_cert");
    if (btnGen) btnGen.addEventListener("click", wm_generateCert);
    if (btnImpVerify) btnImpVerify.addEventListener("click", wm_importDataForVerification);
    if (btnVerifyKey) btnVerifyKey.addEventListener("click", wm_signMessageWithPrivateKey);
    if (btnImpWater) btnImpWater.addEventListener("click", wm_importDataForWatermark);
    if (btnSignFile) btnSignFile.addEventListener("click", wm_signFile);
    if (btnVerifyFile) btnVerifyFile.addEventListener("click", wm_verifyFile);
    if (unsignedCb) unsignedCb.addEventListener("change", wm_toggleUnsignedFile);
if (btnRestoreCert) btnRestoreCert.addEventListener("click", wm_restoreCertFromFile);

    // Accent styling
    let lastAccent = null;
    function applyAccent() {
      const accent = getUIAccent();
      if (!accent || accent === lastAccent) return;
      lastAccent = accent;
      const hoverBg = getSoftHoverBg();

      panel.style.borderColor = accent;
      if (header) {
        header.style.borderBottomColor = accent;
        header.style.color = accent;
      }
      if (closeBtn) {
        closeBtn.style.background = "#111";
        closeBtn.style.color = accent;
        closeBtn.style.border = `1px solid ${accent}`;
        if (!closeBtn._wmHover) {
          closeBtn._wmHover = true;
          closeBtn.addEventListener("mouseenter", () => (closeBtn.style.background = hoverBg));
          closeBtn.addEventListener("mouseleave", () => (closeBtn.style.background = "#111"));
        }
      }
      document.querySelectorAll(".wm-nav-buttons button").forEach(btn => {
        btn.style.background = "#111";
        btn.style.color = accent;
        btn.style.border = `1px solid ${accent}`;
        btn.style.borderRadius = "5px";
        btn.style.padding = "6px 12px";
        btn.style.cursor = "pointer";
        if (!btn._wmHover) {
          btn._wmHover = true;
          btn.addEventListener("mouseenter", () => (btn.style.background = hoverBg));
          btn.addEventListener("mouseleave", () => (btn.style.background = "#111"));
        }
      });
    }
    applyAccent();
    setInterval(applyAccent, 500);

    // Hook into NanoCheeZe Certifications button WITHOUT breaking meq-ncz-menu.js
    function wireNanoCheezeButton() {
      const nczToggleBtn = document.querySelector('[data-action="ncz-toggle"]');
      if (!nczToggleBtn) {
        setTimeout(wireNanoCheezeButton, 400);
        return;
      }

      nczToggleBtn.addEventListener("click", function () {
        const label =
          nczToggleBtn.tagName === "INPUT"
            ? (nczToggleBtn.value || "").trim()
            : (nczToggleBtn.textContent || "").trim();

        if (label !== "NanoCheeZe Certifications") {
          return;
        }

        const nczPanel = document.getElementById("nczPanel");
        if (!nczPanel) return;

        const isPanelVisible = window.getComputedStyle(nczPanel).display !== "none";
        if (!isPanelVisible) {
          // First click (just expanding dropdown) -> do nothing.
          return;
        }

        // Second click: panel was just opened by your script -> override it
        nczPanel.style.display = "none";
        openOverlay();
      });
    }

    wireNanoCheezeButton();
    // Stats + chain info via proxy
    wm_fetchVisitorCount();
    wm_fetchCounters();
    wm_fetchChainInfo();

    // Set QR codes + explorer links for donation addresses
    wm_initDonationQRCodes();


  });
})();
