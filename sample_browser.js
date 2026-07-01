/**
 * sample-player.js
 * ─────────────────────────────────────────────────────────────
 * The audio engine for AZ-TØNE WAVE MACHINE.
 *
 * Responsibilities:
 *   - Own and manage the single shared AudioContext.
 *   - Lazy-load audio: only fetch & decode when Preview is pressed.
 *   - Enforce one-at-a-time playback: starting a new preview
 *     automatically stops the previous one.                              *   - Provide a callback interface for the UI to respond to
 *     state changes without the player knowing about DOM nodes.
 *   - Release audio buffers and source nodes to free memory.
 *
 * NOT responsible for:
 *   - Rendering any DOM.
 *   - Knowing about sample cards.
 *   - The bottom player UI.                                              *
 * FUTURE HOOKS (stubbed):
 *   - generateWaveform(buffer)   → Float32Array of peak data
 *   - loopPlayback(sample)       → loop point support
 *   - applyADSR(source, adsr)    → envelope shaping
 *   - setPitch(source, semis)    → playbackRate for pitch shift
 *   - loadToTrack(sample, track) → route audio to a channel
 */

import { clamp } from './utils.js';

// ── AudioContext ──────────────────────────────────────────────
// Single context, created lazily on first user gesture.
// Re-used for every subsequent preview.
let ctx = null;

function getContext() {
  if (!ctx || ctx.state === 'closed') {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ── Active playback state ─────────────────────────────────────
// Only one sample may play at a time.
const active = {
  sample:      null,   // the Sample object currently playing
  sourceNode:  null,   // AudioBufferSourceNode
  startedAt:   0,      // ctx.currentTime when playback started
  offset:      0,      // seconds into the buffer when started
  rafId:       null,   // requestAnimationFrame handle for progress
};

// ── Callbacks ─────────────────────────────────────────────────
// External modules register these via SamplePlayer.on(event, fn).
const listeners = {
  play:     [],  // (sample) → void
  stop:     [],  // (sample) → void
  progress: [],  // (sample, currentTime, duration) → void
  loaded:   [],  // (sample) → void
  error:    [],  // (sample, error) → void
};

function emit(event, ...args) {
  for (const fn of listeners[event] ?? []) fn(...args);
}

// ── Progress loop ─────────────────────────────────────────────
function startProgressLoop(sample) {
  cancelProgressLoop();

  function tick() {
    if (!active.sourceNode || active.sample !== sample) return;
    const elapsed  = getContext().currentTime - active.startedAt + active.offset;
    const duration = sample.duration ?? 1;
    const current  = clamp(elapsed, 0, duration);
    emit('progress', sample, current, duration);
    if (current < duration) {
      active.rafId = requestAnimationFrame(tick);
    }
  }

  active.rafId = requestAnimationFrame(tick);
}

function cancelProgressLoop() {
  if (active.rafId != null) {
    cancelAnimationFrame(active.rafId);
    active.rafId = null;
  }
}

// ── Core API ──────────────────────────────────────────────────

const SamplePlayer = {

  /**
   * Register a listener for a player event.
   * @param {'play'|'stop'|'progress'|'loaded'|'error'} event
   * @param {Function} fn
   */
  on(event, fn) {
    if (listeners[event]) listeners[event].push(fn);
    return this; // chainable
  },

  /**
   * Preview a sample.
   *
   * Flow:
   *   1. Stop any currently playing sample.
   *   2. If the sample's buffer is already decoded, play it immediately.
   *   3. Otherwise, read the FileSystemFileHandle, decode the audio,
   *      cache the buffer on the sample object, then play.
   *
   * @param {import('./sample-browser.js').Sample} sample
   */
  async preview(sample) {
    // Stop whatever is playing first
    this.stop();

    const audioCtx = getContext();

    try {
      // ── Lazy decode ────────────────────────────────────────
      if (!sample.buffer) {
        sample.loaded = false;
        emit('loaded', sample); // triggers loading state in card

        const file       = await sample.handle.getFile();
        const arrayBuf   = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);

        // Cache decoded buffer on the sample object
        sample.buffer   = audioBuffer;
        sample.duration = audioBuffer.duration;
        sample.loaded   = true;

        emit('loaded', sample);

        // FUTURE HOOK: waveform generation
        // sample.waveform = await generateWaveform(audioBuffer);

        // It's possible the user pressed stop while we were loading
        if (active.sample !== null && active.sample !== sample) return;
      }

      // ── Create & connect source ────────────────────────────
      const source = audioCtx.createBufferSource();
      source.buffer = sample.buffer;
      source.connect(audioCtx.destination);

      // FUTURE HOOK: route through gain/effects nodes here
      // source.connect(effectsChain.input);

      source.start(0);

      // Track active state
      active.sample     = sample;
      active.sourceNode = source;
      active.startedAt  = audioCtx.currentTime;
      active.offset     = 0;
      sample.playing    = true;

      emit('play', sample);
      startProgressLoop(sample);

      // Auto-stop when buffer ends naturally
      source.onended = () => {
        // Only clean up if this source is still the active one
        if (active.sourceNode === source) {
          this._cleanup(sample);
          emit('stop', sample);
        }
      };

    } catch (err) {
      console.error('[SamplePlayer] Preview error:', err);
      sample.loaded  = false;
      sample.playing = false;
      emit('error', sample, err);
    }
  },

  /**
   * Stop any currently playing sample immediately.
   */
  stop() {
    if (!active.sourceNode) return;

    const stoppedSample = active.sample;

    try {
      active.sourceNode.onended = null; // prevent auto-stop callback
      active.sourceNode.stop();
    } catch (_) {
      // Already stopped — safe to ignore
    }

    this._cleanup(stoppedSample);
    emit('stop', stoppedSample);
  },

  /**
   * Internal cleanup — resets active state and releases the source node.
   * The AudioBuffer stays cached on the sample object for instant re-play.
   * @param {object} sample
   */
  _cleanup(sample) {
    cancelProgressLoop();
    if (sample) sample.playing = false;

    // Disconnect the source to release it from the graph
    try { active.sourceNode?.disconnect(); } catch (_) {}

    active.sample     = null;
    active.sourceNode = null;
    active.startedAt  = 0;
    active.offset     = 0;
  },

  /**
   * Returns the sample currently being previewed, or null.
   * @returns {object|null}
   */
  nowPlaying() {
    return active.sample;
  },

  /**
   * FUTURE: generateWaveform(audioBuffer) → Float32Array
   * Extracts peak amplitude data for a waveform thumbnail.
   * Stubbed here — will be implemented in waveform module.
   */
  // generateWaveform(buffer, points = 200) { ... }

  /**
   * FUTURE: loadToTrack(sample, trackIndex)
   * Routes a sample's buffer to a channel rack track slot.
   */
  // loadToTrack(sample, trackIndex) { ... }

};

export default SamplePlayer;


