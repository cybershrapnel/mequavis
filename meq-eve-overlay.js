// meq-eve-overlay.js (ES module version)
// Eve stands by the big GAMMA wheel, faces left, walks between positions,
// and uses her walk animation + pause-facing-camera wave on turns.
// Now supports user-controlled movement via arrow keys + space jump,
// plus PageUp/PageDown for vertical movement and up/down arrows to change facing.

import * as THREE from "https://unpkg.com/three@0.163.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.163.0/examples/jsm/loaders/GLTFLoader.js";

// ---------------------------
// USER TWEAK ZONE
// ---------------------------
const EVE_MODEL_URL = window.EVE_MODEL_URL || "eve.glb";

const EVE_SCALE    = window.EVE_SCALE    || 80;
const EVE_OFFSET_X = window.EVE_OFFSET_X || 170;
const EVE_OFFSET_Y = window.EVE_OFFSET_Y || -175; // -190
const EVE_Z        = window.EVE_Z        || 200;

// Facing direction: rotate around Y so she looks "left" toward the wheel.
const EVE_FACE_Y = window.EVE_FACE_Y ?? (-Math.PI / 2);

// Forward-facing (toward camera) for turn pause
const EVE_FACE_CAMERA_Y = window.EVE_FACE_CAMERA_Y ?? 0;

// Arm "waving" motion
const EVE_WHEEL_SPEED     = window.EVE_WHEEL_SPEED     || 0.003;  // speed of waving motion
const EVE_WHEEL_ARM_SWING = window.EVE_WHEEL_ARM_SWING || 0.55;   // how far arms swing (radians)

// Which axis the arms should swing around for waving: "x", "y", or "z"
const EVE_ARM_AXIS = window.EVE_ARM_AXIS || "x"; // side waving axis

// For forward pose offset (rotate side-down arms to point forward)
const EVE_ARM_FORWARD_AXIS  = window.EVE_ARM_FORWARD_AXIS  || "z";
const EVE_ARM_FORWARD_ANGLE = window.EVE_ARM_FORWARD_ANGLE || (-Math.PI / 2); // 90° forward

// Time inside the walk clip to sample as the "arms down" base pose
const EVE_WALK_POSE_SAMPLE_TIME = window.EVE_WALK_POSE_SAMPLE_TIME || 0.3; // seconds

// Walk & wave timing / distance
const EVE_WALK_DISTANCE = window.EVE_WALK_DISTANCE || 930;    // pixels left/right
const EVE_WAVE_DURATION = window.EVE_WAVE_DURATION || 22500;  // ms to wave at each stop
const EVE_WALK_DURATION = window.EVE_WALK_DURATION || 4500;   // ms to walk between stops

// Pause duration when she faces camera and waves mid-turn
const EVE_TURN_WAVE_DURATION = window.EVE_TURN_WAVE_DURATION || 3000; // 3 seconds

// Optional: which animation clip index to use for walking
// (default = first clip in eve.glb)
const EVE_WALK_CLIP_INDEX = window.EVE_WALK_CLIP_INDEX ?? 0;

// --- PERFORMANCE TUNING ---
const EVE_TARGET_FPS  = window.EVE_TARGET_FPS  || 15;   // lower = less CPU/GPU
const EVE_PIXEL_RATIO = window.EVE_PIXEL_RATIO || 0.75; // 0.5–1.0 for speed

// --- USER CONTROL TUNING ---
const EVE_USER_IDLE_TIMEOUT_MS = window.EVE_USER_IDLE_TIMEOUT_MS || 10000; // 10s idle -> auto return
const EVE_MOVE_SPEED           = window.EVE_MOVE_SPEED           || 350;   // px/s for arrow/Page move
const EVE_JUMP_SPEED           = window.EVE_JUMP_SPEED           || 950;   // initial jump velocity
const EVE_JUMP_GRAVITY         = window.EVE_JUMP_GRAVITY         || -3000; // gravity (px/s^2)

const canvas = document.getElementById("mequavis");
if (!canvas) {
  console.warn("meq-eve-overlay.js: #mequavis not found.");
}

if (canvas) {
  // ---------------------------
  // Overlay DIV
  // ---------------------------
  const overlay = document.createElement("div");
  overlay.id = "eveOverlay";
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    width: ${canvas.width}px;
    height: ${canvas.height}px;
    transform-origin: center center;
    pointer-events: none;
    background: transparent;
    border: none;
    z-index: 95;
  `;
  document.body.appendChild(overlay);

  // ---------------------------
  // Three.js setup
  // ---------------------------
  const scene = new THREE.Scene();

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(300, 500, 800);
  keyLight.castShadow = false;
  scene.add(keyLight);

  let camera = makeCamera(canvas.width, canvas.height);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    powerPreference: "low-power"
  });
  renderer.setPixelRatio(EVE_PIXEL_RATIO);
  renderer.setSize(canvas.width, canvas.height);
  renderer.setClearColor(0x000000, 0);
  overlay.appendChild(renderer.domElement);

  let eveRoot = null;

  // Animation system
  let mixer = null;
  let walkAction = null;
  let isWalking = false;

  // Arm bones
  let leftArmBones = [];
  let rightArmBones = [];

  // For positioning relative to GAMMA
  let basePosX = 0;
  let basePosY = -100; // default before we find GAMMA

  // Actual Eve position (world/screen space in our ortho scene)
  let evePosX = 0;
  let evePosY = -100;
  let hasHomePosition = false;

  // Jump state
  let eveJumpOffset = 0;
  let isJumping = false;
  let jumpVelocity = 0;

  // Modes:
  // "script"    -> original scripted behavior (wave/walk/turn)
  // "user"      -> keyboard control via arrow keys + space
  // "returning" -> auto-walk back to home after idle in user mode
  let eveMode = "script";

  // Script state machine:
  let eveState = "waveHome";
  let stateStartTime = 0;

  // Auto-return state
  let returnStartTime = 0;
  let returnFromX = 0;
  let returnFromY = 0;
  let returnFaceY = EVE_FACE_Y;

  // Keyboard tracking
  const keysDown = {
    left: false,
    right: false,
    vertUp: false,   // PageUp
    vertDown: false  // PageDown
  };
  let lastUserInputTime = 0;

  // User-facing orientation in user mode
  let eveUserFacingY = EVE_FACE_Y;

  // FPS throttling
  const FRAME_DURATION = 1000 / EVE_TARGET_FPS;
  let lastFrameTime = 0;

  function makeCamera(W, H) {
    const cam = new THREE.OrthographicCamera(
      -W / 2, W / 2,
       H / 2, -H / 2,
      -2000, 2000
    );
    cam.position.set(0, 0, 1000);
    cam.lookAt(0, 0, 0);
    return cam;
  }

  function syncOverlayTransform() {
    overlay.style.transform =
      canvas.style.transform || "translate(-50%, -50%) scale(1)";
  }

  function toOverlayCoords(px, py) {
    const W = canvas.width;
    const H = canvas.height;
    return {
      x: px - W / 2,
      y: H / 2 - py
    };
  }

  function findGammaCenter() {
    try {
      if (typeof nofurs === "undefined") return null;
      const g = nofurs.find(
        (n) => n && n.label === "GAMMA" && !n.flag && n.center
      );
      return g || null;
    } catch (e) {
      console.warn("meq-eve-overlay.js: could not inspect nofurs:", e);
      return null;
    }
  }

  // ---------------------------
  // Load GLB model
  // ---------------------------
  const loader = new GLTFLoader();
  console.log("meq-eve-overlay.js: loading Eve model from", EVE_MODEL_URL);

  loader.load(
    EVE_MODEL_URL,
    (gltf) => {
      console.log("meq-eve-overlay.js: Eve GLB loaded:", gltf);
      eveRoot = gltf.scene;

      eveRoot.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          if (child.material) {
            child.material.transparent = false;
          }
        }
      });

      eveRoot.scale.setScalar(EVE_SCALE);
      eveRoot.position.set(0, -100, EVE_Z);

      // Face left (toward the wheel)
      eveRoot.rotation.set(0, EVE_FACE_Y, 0);

      scene.add(eveRoot);

      // --- Animation mixer & walk clip ---
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(eveRoot);
        const index = Math.min(
          Math.max(0, EVE_WALK_CLIP_INDEX | 0),
          gltf.animations.length - 1
        );
        const walkClip = gltf.animations[index];
        walkAction = mixer.clipAction(walkClip);
        walkAction.loop = THREE.LoopRepeat;
        walkAction.clampWhenFinished = false;
        walkAction.enabled = true;
        console.log("meq-eve-overlay.js: walk animation configured from clip index", index);
      } else {
        console.warn("meq-eve-overlay.js: no animations found in Eve GLB (walk animation unavailable).");
      }

      // Heuristic: find arm bones by name
      eveRoot.traverse((obj) => {
        if (!obj.isBone || !obj.name) return;
        const name = obj.name.toLowerCase();
        if (name.includes("left") && (name.includes("arm") || name.includes("shoulder"))) {
          leftArmBones.push(obj);
        }
        if (name.includes("right") && (name.includes("arm") || name.includes("shoulder"))) {
          rightArmBones.push(obj);
        }
      });

      if (leftArmBones.length > 1) {
        leftArmBones = [leftArmBones[0]];
      }
      if (rightArmBones.length > 1) {
        rightArmBones = [rightArmBones[0]];
      }

      // If we have a walk clip and arms, sample a "arms-at-side" pose from the walk animation
      if (mixer && walkAction && (leftArmBones.length || rightArmBones.length)) {
        // Temporarily play walk, jump to sample time, read quats
        walkAction.play();
        mixer.setTime(EVE_WALK_POSE_SAMPLE_TIME);

        const forwardAxisVec = (() => {
          switch (EVE_ARM_FORWARD_AXIS) {
            case "x": return new THREE.Vector3(1, 0, 0);
            case "y": return new THREE.Vector3(0, 1, 0);
            case "z":
            default:  return new THREE.Vector3(0, 0, 1);
          }
        })();
        const forwardOffsetQuat = new THREE.Quaternion().setFromAxisAngle(
          forwardAxisVec,
          EVE_ARM_FORWARD_ANGLE
        );

        leftArmBones.forEach((bone) => {
          // base: how the arm looks in mid-walk (natural at side)
          bone.userData.sideBaseQuat    = bone.quaternion.clone();
          bone.userData.forwardBaseQuat = bone.userData.sideBaseQuat
            .clone()
            .multiply(forwardOffsetQuat);
        });

        rightArmBones.forEach((bone) => {
          bone.userData.sideBaseQuat    = bone.quaternion.clone();
          bone.userData.forwardBaseQuat = bone.userData.sideBaseQuat
            .clone()
            .multiply(forwardOffsetQuat);
        });

        // Stop walk & reset mixer so normal playback starts fresh later
        walkAction.stop();
        mixer.setTime(0);
      }

      console.log("meq-eve-overlay.js: arm bones detected:", {
        leftArmBones: leftArmBones.map(b => b.name),
        rightArmBones: rightArmBones.map(b => b.name),
      });
    },
    (xhr) => {
      if (xhr.total) {
        const pct = (xhr.loaded / xhr.total) * 100;
        console.log(`meq-eve-overlay.js: Eve GLB loading ${pct.toFixed(1)}%`);
      } else {
        console.log(`meq-eve-overlay.js: Eve GLB loading ${xhr.loaded} bytes`);
      }
    },
    (err) => {
      console.error("meq-eve-overlay.js: Eve GLB load ERROR:", err);
    }
  );

  // ---------------------------
  // Arm helpers
  // ---------------------------
  const armAxisVec = (() => {
    switch (EVE_ARM_AXIS) {
      case "y": return new THREE.Vector3(0, 1, 0);
      case "z": return new THREE.Vector3(0, 0, 1);
      case "x":
      default:  return new THREE.Vector3(1, 0, 0);
    }
  })();

  function setArmsNeutral() {
    // Default neutral: arms at side (sampled from walk), if available
    leftArmBones.forEach((bone) => {
      if (bone.userData && bone.userData.sideBaseQuat) {
        bone.quaternion.copy(bone.userData.sideBaseQuat);
      }
    });
    rightArmBones.forEach((bone) => {
      if (bone.userData && bone.userData.sideBaseQuat) {
        bone.quaternion.copy(bone.userData.sideBaseQuat);
      }
    });
  }

  // Side-facing wave (home & away)
  function setArmsWaveSide(now) {
    const phase = now * EVE_WHEEL_SPEED;
    const leftAngle  = Math.sin(phase) * EVE_WHEEL_ARM_SWING;
    const rightAngle = Math.sin(phase + Math.PI) * EVE_WHEEL_ARM_SWING;

    const quatLeft  = new THREE.Quaternion().setFromAxisAngle(armAxisVec, leftAngle);
    const quatRight = new THREE.Quaternion().setFromAxisAngle(armAxisVec, rightAngle);

    leftArmBones.forEach((bone) => {
      if (bone.userData && bone.userData.sideBaseQuat) {
        bone.quaternion.copy(bone.userData.sideBaseQuat).multiply(quatLeft);
      }
    });

    rightArmBones.forEach((bone) => {
      if (bone.userData && bone.userData.sideBaseQuat) {
        bone.quaternion.copy(bone.userData.sideBaseQuat).multiply(quatRight);
      }
    });
  }

  // Forward-facing wave (for the 3-second turn pauses)
  function setArmsWaveForward(now) {
    const phase = now * EVE_WHEEL_SPEED;
    const leftAngle  = Math.sin(phase) * (EVE_WHEEL_ARM_SWING * 0.5);
    const rightAngle = Math.sin(phase + Math.PI) * (EVE_WHEEL_ARM_SWING * 0.5);

    const quatLeft  = new THREE.Quaternion().setFromAxisAngle(armAxisVec, leftAngle);
    const quatRight = new THREE.Quaternion().setFromAxisAngle(armAxisVec, rightAngle);

    leftArmBones.forEach((bone) => {
      if (bone.userData && bone.userData.forwardBaseQuat) {
        bone.quaternion.copy(bone.userData.forwardBaseQuat).multiply(quatLeft);
      }
    });

    rightArmBones.forEach((bone) => {
      if (bone.userData && bone.userData.forwardBaseQuat) {
        bone.quaternion.copy(bone.userData.forwardBaseQuat).multiply(quatRight);
      }
    });
  }

  // ---------------------------
  // Walk animation helper
  // ---------------------------
  function setWalking(on) {
    if (!walkAction) return;
    if (on) {
      if (!isWalking) {
        walkAction.reset();
        walkAction.play();
        isWalking = true;
      }
    } else {
      if (isWalking) {
        walkAction.stop();
        isWalking = false;
      }
    }
  }

  // ---------------------------
  // EDITABLE TARGET DETECTION
  // ---------------------------
  function isEditableTarget(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  // ---------------------------
  // USER INPUT HANDLERS
  // ---------------------------
  function markUserInput() {
    lastUserInputTime = performance.now();
    if (eveMode !== "user") {
      eveMode = "user";
      // when entering user mode, stop scripted waving/walk and go neutral
      setWalking(false);
      setArmsNeutral();
      // reset jump so she starts from ground
      eveJumpOffset = 0;
      isJumping = false;
      jumpVelocity = 0;
      // capture current facing as the base user facing
      if (eveRoot) {
        eveUserFacingY = eveRoot.rotation.y;
      }
    }
  }

  function handleKeyDown(e) {
    const key = e.key;

    // Don't interfere with typing in inputs, textareas, or contentEditable
    const t = e.target || document.activeElement;
    if (isEditableTarget(t)) {
      return;
    }

    // Only care about arrow keys + space + PageUp/PageDown outside of text inputs
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "PageUp", "PageDown"].includes(key) || e.code === "Space") {
      e.preventDefault();
    }

    if (!eveRoot) return;

    switch (key) {
      case "ArrowLeft":
        keysDown.left = true;
        eveUserFacingY = EVE_FACE_Y; // side left
        markUserInput();
        break;
      case "ArrowRight":
        keysDown.right = true;
        eveUserFacingY = EVE_FACE_Y + Math.PI; // side right
        markUserInput();
        break;

      // Up/Down: facing only (no movement)
      case "ArrowDown":
        // face forward toward camera
        eveUserFacingY = EVE_FACE_CAMERA_Y;
        markUserInput();
        break;
      case "ArrowUp":
        // face away from camera
        eveUserFacingY = EVE_FACE_CAMERA_Y + Math.PI;
        markUserInput();
        break;

      // Vertical movement keys
      case "PageUp":
        keysDown.vertUp = true;
        markUserInput();
        break;
      case "PageDown":
        keysDown.vertDown = true;
        markUserInput();
        break;

      case " ":
      case "Spacebar":
        markUserInput();
        if (!isJumping) {
          isJumping = true;
          eveJumpOffset = 0;
          jumpVelocity = EVE_JUMP_SPEED;
        }
        break;
    }
  }

  function handleKeyUp(e) {
    const key = e.key;

    const t = e.target || document.activeElement;
    if (isEditableTarget(t)) {
      return;
    }

    if (!eveRoot) return;

    switch (key) {
      case "ArrowLeft":
        keysDown.left = false;
        markUserInput();
        break;
      case "ArrowRight":
        keysDown.right = false;
        markUserInput();
        break;
      case "PageUp":
        keysDown.vertUp = false;
        markUserInput();
        break;
      case "PageDown":
        keysDown.vertDown = false;
        markUserInput();
        break;
      case " ":
      case "Spacebar":
        // don't need to mark here, but it's fine to extend idle a bit
        markUserInput();
        break;
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // ---------------------------
  // SCRIPTED STATE MACHINE
  // ---------------------------
  function runScripted(now) {
    if (!stateStartTime) stateStartTime = now;

    const stateTime = now - stateStartTime;
    let offsetX = 0;
    let rotationY = EVE_FACE_Y; // default left

    switch (eveState) {
      case "waveHome":
        // Original position, facing left, waving (arms at side)
        setWalking(false);
        rotationY = EVE_FACE_Y;
        offsetX = 0;
        setArmsWaveSide(now);
        if (stateTime > EVE_WAVE_DURATION) {
          eveState = "walkLeft";
          stateStartTime = now;
        }
        break;

      case "walkLeft": {
        // Walk left using Eve's walk animation
        setWalking(true);
        const t = Math.min(stateTime / EVE_WALK_DURATION, 1);
        offsetX = -EVE_WALK_DISTANCE * t;
        // Walk clip owns the arms here
        if (t >= 1) {
          eveState = "turnLeftToRight";
          stateStartTime = now;
        }
        rotationY = EVE_FACE_Y;
        break;
      }

      case "turnLeftToRight":
        // At left spot, face camera, arms forward + wave
        setWalking(false);
        offsetX = -EVE_WALK_DISTANCE;
        rotationY = EVE_FACE_CAMERA_Y;
        setArmsWaveForward(now);
        if (stateTime > EVE_TURN_WAVE_DURATION) {
          eveState = "waveAway";
          stateStartTime = now;
        }
        break;

      case "waveAway":
        // At left spot, turned around (facing right), side-wave
        setWalking(false);
        rotationY = EVE_FACE_Y + Math.PI;
        offsetX = -EVE_WALK_DISTANCE;
        setArmsWaveSide(now);
        if (stateTime > EVE_WAVE_DURATION) {
          eveState = "walkRight";
          stateStartTime = now;
        }
        break;

      case "walkRight": {
        // Walk back to original spot
        setWalking(true);
        const t = Math.min(stateTime / EVE_WALK_DURATION, 1);
        offsetX = -EVE_WALK_DISTANCE * (1 - t);
        rotationY = EVE_FACE_Y + Math.PI;
        if (t >= 1) {
          eveState = "turnRightToLeft";
          stateStartTime = now;
        }
        break;
      }

      case "turnRightToLeft":
        // At home spot, face camera, arms forward + wave
        setWalking(false);
        offsetX = 0;
        rotationY = EVE_FACE_CAMERA_Y;
        setArmsWaveForward(now);
        if (stateTime > EVE_TURN_WAVE_DURATION) {
          eveState = "waveHome";
          stateStartTime = now;
        }
        break;
    }

    eveJumpOffset = 0;
    isJumping = false;
    jumpVelocity = 0;

    evePosX = basePosX + offsetX;
    evePosY = basePosY;

    eveRoot.position.set(evePosX, evePosY, EVE_Z);
    eveRoot.rotation.y = rotationY;
  }

  // ---------------------------
  // USER CONTROLLED MOVEMENT
  // ---------------------------
  function runUserControl(now, deltaSec) {
    let movingHoriz = false;

    // Horizontal movement
    if (keysDown.left && !keysDown.right) {
      evePosX -= EVE_MOVE_SPEED * deltaSec;
      eveUserFacingY = EVE_FACE_Y; // side left
      movingHoriz = true;
    } else if (keysDown.right && !keysDown.left) {
      evePosX += EVE_MOVE_SPEED * deltaSec;
      eveUserFacingY = EVE_FACE_Y + Math.PI; // side right
      movingHoriz = true;
    }

    // Vertical movement with PageUp/PageDown
    if (keysDown.vertUp && !keysDown.vertDown) {
      evePosY += EVE_MOVE_SPEED * deltaSec;
    } else if (keysDown.vertDown && !keysDown.vertUp) {
      evePosY -= EVE_MOVE_SPEED * deltaSec;
    }

    // Constrain X to a band around base (same as scripted left limit, mirrored right)
    const minX = basePosX - EVE_WALK_DISTANCE;
    const maxX = basePosX + EVE_WALK_DISTANCE;
    evePosX = Math.max(minX, Math.min(maxX, evePosX));

    // Constrain Y to canvas bounds
    const minY = -canvas.height / 2;
    const maxY = canvas.height / 2;
    evePosY = Math.max(minY, Math.min(maxY, evePosY));

    // Walking anim when moving horizontally
    if (movingHoriz) {
      setWalking(true);
    } else {
      setWalking(false);
    }

    // Jump physics (relative to current evePosY "ground" in user mode)
    if (isJumping) {
      jumpVelocity += EVE_JUMP_GRAVITY * deltaSec;
      eveJumpOffset += jumpVelocity * deltaSec;
      if (eveJumpOffset <= 0) {
        eveJumpOffset = 0;
        isJumping = false;
        jumpVelocity = 0;
      }
    }

    const finalY = evePosY + eveJumpOffset;

    // If not walking or jumping, keep arms neutral so clip doesn't fight us
    if (!movingHoriz && !isJumping) {
      setArmsNeutral();
    }

    eveRoot.position.set(evePosX, finalY, EVE_Z);
    eveRoot.rotation.y = eveUserFacingY;
  }

  // ---------------------------
  // AUTO RETURN TO HOME
  // ---------------------------
  function startReturnHome(now) {
    eveMode = "returning";
    returnStartTime = now;
    returnFromX = evePosX;
    returnFromY = evePosY; // capture current vertical position too

    // Stop any jump
    eveJumpOffset = 0;
    isJumping = false;
    jumpVelocity = 0;

    const goingRight = basePosX > returnFromX;
    returnFaceY = goingRight ? (EVE_FACE_Y + Math.PI) : EVE_FACE_Y;

    setWalking(true);
    setArmsNeutral();
  }

  function runReturnHome(now) {
    if (!returnStartTime) {
      startReturnHome(now);
      return;
    }

    const t = Math.min((now - returnStartTime) / EVE_WALK_DURATION, 1);

    // Smooth diagonal walk back to base (no snapping)
    evePosX = returnFromX + (basePosX - returnFromX) * t;
    evePosY = returnFromY + (basePosY - returnFromY) * t;

    eveRoot.position.set(evePosX, evePosY, EVE_Z);
    eveRoot.rotation.y = returnFaceY;

    if (t >= 1) {
      // Arrived home: resume scripted behavior
      setWalking(false);
      eveMode = "script";
      eveState = "waveHome";
      stateStartTime = now;
      returnStartTime = 0;
      eveUserFacingY = EVE_FACE_Y;
    }
  }

  // ---------------------------
  // Animation loop
  // ---------------------------
  function animate(now) {
    requestAnimationFrame(animate);

    if (!lastFrameTime) lastFrameTime = now;
    const elapsed = now - lastFrameTime;
    if (elapsed < FRAME_DURATION) {
      return;
    }
    lastFrameTime = now;

    const deltaSec = elapsed / 1000;

    syncOverlayTransform();

    if (
      renderer.domElement.width !== canvas.width ||
      renderer.domElement.height !== canvas.height
    ) {
      renderer.setSize(canvas.width, canvas.height);
      camera = makeCamera(canvas.width, canvas.height);
    }

    if (mixer) {
      mixer.update(deltaSec);
    }

    if (eveRoot) {
      const gamma = findGammaCenter();
      if (gamma && gamma.center) {
        const p = toOverlayCoords(gamma.center.x, gamma.center.y);
        basePosX = p.x + EVE_OFFSET_X;
        basePosY = p.y + EVE_OFFSET_Y;
      }

      if (!hasHomePosition) {
        evePosX = basePosX;
        evePosY = basePosY;
        hasHomePosition = true;
        eveRoot.position.set(evePosX, evePosY, EVE_Z);
        eveRoot.rotation.y = EVE_FACE_Y;
        eveUserFacingY = EVE_FACE_Y;
      }

      if (eveMode === "user") {
        // If idle in user mode for too long, start auto-return
        if (now - lastUserInputTime > EVE_USER_IDLE_TIMEOUT_MS) {
          startReturnHome(now);
        } else {
          runUserControl(now, deltaSec);
        }
      } else if (eveMode === "returning") {
        runReturnHome(now);
      } else {
        // Normal scripted behavior
        runScripted(now);
      }
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}
