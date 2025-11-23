# mequavis

<a href="https://mequavis.com">mequavis.com</a>

You’re right — that write-up was way too Whisper/TTS-centric. MEQUAVIS is the canvas + wheel system first, and voice/audio are just controls on top. Here’s a **project-wide usage/how-to** that matches what you actually built. Still no code, no troubleshooting, just what it does and how to drive it.

---

# MEQUAVIS — What it is and How to Use It

MEQUAVIS is an interactive **simulation-layer navigation canvas**.
You steer through layered states using **nofur wheels**, **layer controls**, and **chat/agents**. Eve, Whisper, and TTS are **interface features** that make the canvas hands-free and more alive — not the core.

Think of MEQUAVIS as:

* a **visual control board** for exploring / editing simulation layers,
* with a **chat + agent interface** wired directly into what the canvas is doing,
* plus optional voice/character helpers.

---

## 1. The Main Canvas (MEQUAVIS screen)

### What it shows

* A big central wheel-space with **nofurs** (nodes/wheels).
* A clear center anchor (your “current state”).
* Outer / side nofurs used for layer switching and fast jumps.
* Your UI is built so **clicking nofurs is the primary way to move through the system**.

### What a “nofur” is (in practice)

A nofur is a **selectable simulation node**.
Big ones are “major wheels.”
Small ones (0–9) are “layer slots.”

You don’t need to overthink it while using:

* **Big nofurs = workspaces / major context switches**
* **Small nofurs = layer shortcuts**

---

## 2. Big Nofurs (major wheels)

### What you do with them

* Click a big nofur to **focus/select** it.
* The system treats that as your active wheel — your work context.
* Many behaviors (drawing, layer stepping, chat meaning) hang off which big nofur is active.

### Typical flow

1. Pick a big nofur (example: **GAMMA**).
2. Work inside that context:

   * move around layers
   * run prompts
   * observe changes
3. Switch to another big nofur when you want a new context.

---

## 3. Small Nofurs 0–9 (layer slots)

These are the **fast “drop into layer” buttons.**

### Manual use

* Each small nofur is labeled **0–9**.
* Clicking one means:
  **“go down to that numbered layer slot.”**

Example:

* Click **3** → drop into layer slot 3.

You use these constantly for quick diving instead of stepping down one-by-one.

---

## 4. Layer Navigation (up/down rules)

### Manual controls

* **Layer Up button** on canvas = climb one layer higher.
* **Small nofur digit** = drop down into that digit’s layer slot.

So:

* **Layer Up** = *one step up*
* **Layer Down 7** = *jump down to slot 7*

This is the core movement mechanic of MEQUAVIS.

---

## 5. The Chat System (your control voice)

Your chat isn’t “separate” — it’s part of the MEQUAVIS loop.

### What it does

* Lets you inject instructions into the active context.
* Supports normal prompts and agent-direct prompts.
* Output can feed back into canvas state (depending on your other scripts).

### Using it normally

1. Click into the prompt box.
2. Type.
3. Send.

### Using it as agent control

If you want Eve-direct prompts, you send:
`/eve your text`

This makes Eve act like a targeted agent rather than a general reply.

---

## 6. Session / Left Column UI (your persistent behavior toggles)

This left column is the **control stack** for chat sessions and overlays.

### What you’ll find there

* Your session filters (search, toggles, whatever else you injected).
* **Auto-Speak Responses** checkbox.
* **Auto-Listen for wake words** (Whisper) checkbox.
* Any other chat-session tools you’ve added.

### What these toggles mean

* **Auto speak responses**

  * ON: Eve reads replies automatically.
  * OFF: Replies wait until you play them manually.

* **Auto listen for “prompt / ask eve”**

  * ON: Whisper is always waiting while idle.
  * OFF: Whisper only listens when you click the mic.

These are quality-of-life switches so you can run MEQUAVIS loud/hands-free or quiet/manual.

---

## 7. Eve Overlay (visual companion on the canvas)

### What she is

* A 3D overlay synced to the canvas and anchored near **GAMMA**.
* She walks/waves in scripted mode to show the system is alive.
* You can temporarily take control of her movement.

### How to control Eve (keyboard)

Outside of text fields:

* **Left Arrow / Right Arrow** → move Eve left/right
* **Up Arrow / Down Arrow** → change her facing direction
* **PageUp / PageDown** → move her vertically
* **Space** → jump
* **+ / -** → scale her up/down

If you stop controlling her for ~10 seconds, she returns home and resumes scripted motion.

Eve is not required to use MEQUAVIS, but she’s your live “pointer” to what context you’re in.

---

## 8. Whisper Voice Control (hands-free MEQUAVIS)

Whisper is a **wake-word + command listener** sitting on top of your normal UI.

### Wake words (start dictation)

* **“prompt”**

  * Clears the prompt box.
  * Starts dictation for a normal prompt.

* **“ask eve”**

  * Clears the prompt box.
  * Inserts `/eve ` first.
  * Starts dictation for an Eve-direct prompt.

### Dictation behavior

* Dictation only starts after wake word or mic click.
* It doesn’t finish early.
* It waits for real speech, then uses a 5-second quiet timer to close.

### Auto-send

When dictation ends:

* If prompt text is **≥ 50 characters**, Whisper auto-clicks Send.

---

## 9. Canvas Voice Commands (driving layers by speech)

When Whisper is idle (not dictating), you can steer layers by voice:

* **“layer up”**

  * presses the Layer Up canvas control.

* **“layer down 0–9”**

  * presses the small nofur labeled with that digit.

Examples:

* “layer down 1”
* “layer down seven”

That is direct canvas control without touching the mouse.

---

## 10. Audio Controls (feature, not the project)

These are *just controls* for managing replies while staying inside MEQUAVIS.

### Voice

* **“cancel”** → stop Eve speech
* **“play reply”** → replay last reply
* **“fast forward audio”** → skip ahead ~5s
* **“rewind audio”** → skip back ~5s

### Keyboard equivalents

* **T** → play/stop reply
* **Y** → skip forward
* **R** → skip backward

Again: not core. Just convenience.

---

## 11. Panels under the Send Button

### Ad / Support panel

* Rotating muted videos for the MEQUAVIS project.
* Closeable with X.
* Exists to keep support links visible.

### Help / Bindings panel

The second panel (same style as ads) is your **built-in cheat sheet.**
It lists:

* Canvas controls
* Layer commands
* Eve movement keys
* Whisper wake words
* Audio commands

So anyone can sit down and operate MEQUAVIS immediately.

---

## 12. The simplest way to use MEQUAVIS (real workflow)

### Manual run

1. Pick a big nofur (your context).
2. Navigate layers with Layer Up or small digits.
3. Type a prompt about what you’re doing.
4. Send.
5. Watch the canvas + Eve + system respond.
6. Repeat.

### Hands-free run

1. Say “prompt.”
2. Speak your prompt.
3. Stop talking.
4. It sends automatically if long enough.
5. Use “layer down X” / “layer up” to keep moving.

---

If you want this to be *even more accurate*, paste (or summarize) what your **main canvas mouse controls** currently are beyond clicking nofurs — like drag/rotate/zoom or any special buttons you added — and I’ll fold those into the usage doc too, same style, no code.
