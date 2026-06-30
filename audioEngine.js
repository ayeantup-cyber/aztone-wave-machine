/* ═══════════════════════════════════════════════════════════════
   AZ-TØNE WAVE MACHINE — audioEngine.js               v0.1.0

   Web Audio API scheduler using the standard "lookahead" pattern
   (the same approach behind most browser-based sequencers).

   Why not setInterval/setTimeout directly on each step?
   JS timers drift under load (UI repaint, GC pauses, tab
   throttling). Instead we run a cheap setInterval "ticker" that
   wakes up frequently and schedules any notes that fall within
   the next lookahead window using the AudioContext's own clock
   (audioCtx.currentTime), which IS sample-accurate. The actual
   sound trigger (source.start(time)) is handed off to the audio
   thread, so timing stays tight even if the UI hiccups.

   Public API:
     AudioEngine.init()
     AudioEngine.loadBuffer(file) -> Promise<AudioBuffer>
     AudioEngine.setBPM(bpm)
     AudioEngine.setSteps(stepsPerBeat)        // default 4 (16th notes)
     AudioEngine.start(pattern, onStep)
     AudioEngine.stop()
     AudioEngine.previewBuffer(buffer)         // one-shot, for library preview
     AudioEngine.isRunning

   `pattern` shape expected from Channel Rack:
     [
       { buffer: AudioBuffer|null, steps: [bool x16], gain: 1.0, muted: false },
       ...
     ]
═══════════════════════════════════════════════════════════════ */

const AudioEngine = (() => {

  let ctx = null;
  let bpm = 126;
  let stepsPerBar = 16;
  let lookaheadMs = 25;        // how often the ticker wakes up
  let scheduleAheadTime = 0.1; // how far ahead (seconds) we schedule audio

  let currentStep = 0;
  let nextStepTime = 0.0;
  let timerId = null;
  let running = false;

  let patternRef = null;
  let onStepCallback = null;

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function getContext() {
    if (!ctx) init();
    // iOS/Safari suspend the context until a user gesture resumes it
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ── Decode a File/Blob into an AudioBuffer ──────────────────────
  async function loadBuffer(file) {
    const context = getContext();
    const arrayBuffer = await file.arrayBuffer();
    // decodeAudioData is promise-based in modern browsers
    return await context.decodeAudioData(arrayBuffer);
  }

  // ── One-shot preview (used by the sample library) ───────────────
  let previewSource = null;
  function previewBuffer(buffer, onEnded) {
    stopPreview();
    const context = getContext();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (previewSource === source) previewSource = null;
      if (onEnded) onEnded();
    };
    source.start();
    previewSource = source;
    return source;
  }

  function stopPreview() {
    if (previewSource) {
      try { previewSource.stop(); } catch (e) { /* already stopped */ }
      previewSource = null;
    }
  }

  // ── Trigger a single step's sample at a precise time ─────────────
  function playStepSound(buffer, time, gain = 1.0) {
    if (!buffer) return;
    const context = getContext();
    const source = context.createBufferSource();
    const gainNode = context.createGain();
    gainNode.gain.value = gain;
    source.buffer = buffer;
    source.connect(gainNode).connect(context.destination);
    source.start(time);
  }

  // ── Scheduler core ───────────────────────────────────────────────
  function secondsPerStep() {
    // 16 steps per bar, 4 beats per bar -> 4 steps per beat (16th notes)
    const secondsPerBeat = 60.0 / bpm;
    return secondsPerBeat / (stepsPerBar / 4);
  }

  function scheduler() {
    const context = getContext();
    while (nextStepTime < context.currentTime + scheduleAheadTime) {
      scheduleStep(currentStep, nextStepTime);
      nextStepTime += secondsPerStep();
      currentStep = (currentStep + 1) % stepsPerBar;
    }
    timerId = setTimeout(scheduler, lookaheadMs);
  }

  function scheduleStep(stepIndex, time) {
    if (patternRef) {
      patternRef.forEach(track => {
        if (!track.muted && track.steps[stepIndex] && track.buffer) {
          playStepSound(track.buffer, time, track.gain ?? 1.0);
        }
      });
    }
    // Tell the UI to highlight this step. We use a small setTimeout
    // offset so the visual update lines up with when the sound
    // actually plays (audio time != wall clock time).
    if (onStepCallback) {
      const context = getContext();
      const delay = Math.max(0, (time - context.currentTime) * 1000);
      setTimeout(() => onStepCallback(stepIndex), delay);
    }
  }

  // ── Transport controls ───────────────────────────────────────────
  function start(pattern, onStep) {
    if (running) return;
    const context = getContext();
    patternRef = pattern;
    onStepCallback = onStep || null;
    currentStep = 0;
    nextStepTime = context.currentTime + 0.05;
    running = true;
    scheduler();
  }

  function stop() {
    running = false;
    clearTimeout(timerId);
    timerId = null;
    currentStep = 0;
  }

  function setBPM(newBPM) {
    bpm = Math.max(40, Math.min(300, newBPM));
  }

  function setSteps(n) {
    stepsPerBar = n;
  }

  return {
    init,
    getContext,
    loadBuffer,
    previewBuffer,
    stopPreview,
    start,
    stop,
    setBPM,
    setSteps,
    get isRunning() { return running; },
    get bpm() { return bpm; },
  };
})();
