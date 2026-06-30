/**
 * script.js
 * ─────────────────────────────────────────────────────────────
 * AZ-TØNE WAVE MACHINE — Main entry point (ES Module).
 *
 * This file is intentionally thin. It:
 *   1. Imports all modules.
 *   2. Initialises each module with the DOM refs it needs.
 *   3. Wires player events → UI + browser card state.
 *   4. Handles the folder-picker flow.
 *   5. Does NOT contain business logic or audio code.
 *
 * Think of this as the conductor — not a musician.
 *
 * FUTURE: This is where you'll import and initialise:
 *   - KeyboardSampler
 *   - ChannelRack
 *   - Mixer
 *   - EffectsRack
 *   - PatternSequencer
 *   - ProjectManager (save/load)
 *   - ExportEngine
 */

import SamplePlayer  from './sample-player.js';
import SampleBrowser from './sample-browser.js';
import UI            from './ui.js';

// ── DOM refs ──────────────────────────────────────────────────
const folderButton    = document.getElementById('folderButton');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const sampleGrid      = document.getElementById('sampleGrid');
const sampleCount     = document.getElementById('sampleCount');
const emptyState      = document.getElementById('emptyState');

// ── Module initialisation ─────────────────────────────────────

SampleBrowser.init({
  grid:  sampleGrid,
  count: sampleCount,
  empty: emptyState,
});

UI.init({
  onSearch: (query) => SampleBrowser.applyFilter(query),
  onStop:   ()      => SamplePlayer.stop(),
});

// ── Player event → UI wiring ──────────────────────────────────
// The player emits events; we react here and update both the
// bottom player bar and the individual sample card.

SamplePlayer
  .on('play', (sample) => {
    // Mark the playing card
    SampleBrowser.setCardState(sample.id, 'playing');
    // Show bottom player
    UI.showPlayer(sample);
  })

  .on('stop', (sample) => {
    if (sample) SampleBrowser.setCardState(sample.id, 'idle');
    UI.hidePlayer();
  })

  .on('loaded', (sample) => {
    // Fired twice: once before decode (loading), once after (loaded).
    if (sample.loaded) {
      // Buffer is ready — card will flip to 'playing' on the 'play' event
      // Update duration badge now that we know it
      SampleBrowser.setCardState(sample.id, 'playing', { duration: sample.duration });
    } else {
      SampleBrowser.setCardState(sample.id, 'loading');
    }
  })

  .on('progress', (sample, currentTime, duration) => {
    UI.updateProgress(currentTime, duration);
  })

  .on('error', (sample, err) => {
    console.error('[App] Playback error for:', sample.name, err);
    SampleBrowser.setCardState(sample.id, 'idle');
    UI.hidePlayer();
    UI.setStatus(`⚠️ Could not decode "${sample.name}"`);
  });

// ── Folder selection flow ─────────────────────────────────────

async function openFolderPicker() {
  // Guard: File System Access API required
  if (!window.showDirectoryPicker) {
    UI.setStatus('⚠️ Folder access requires Chrome, Edge, or Opera.');
    return;
  }

  try {
    // Show the native folder picker
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });

    // Stop any active playback before switching libraries
    SamplePlayer.stop();

    // Update UI immediately so it feels responsive
    UI.setStatus('⏳ Scanning folder…');
    UI.clearSearch();
    UI.showBrowser(dirHandle.name);

    // Load samples from the selected directory
    const count = await SampleBrowser.loadFolder(dirHandle);

    if (count === 0) {
      UI.setStatus(`📂 "${dirHandle.name}" — no supported audio files found.`);
    } else {
      UI.setStatus(`📂 ${dirHandle.name}`);
    }

  } catch (err) {
    // User cancelled the picker — not an error worth surfacing
    if (err.name === 'AbortError') return;

    console.error('[App] Folder error:', err);
    UI.setStatus('⚠️ Could not open folder.');
  }
}

// Both buttons trigger the same flow
folderButton.addEventListener('click', openFolderPicker);
changeFolderBtn.addEventListener('click', openFolderPicker);

// ── FUTURE module hooks ───────────────────────────────────────
// Uncomment and import as features are built:
//
// import KeyboardSampler  from './keyboard-sampler.js';
// import ChannelRack      from './channel-rack.js';
// import Mixer            from './mixer.js';
// import EffectsRack      from './effects-rack.js';
// import PatternSequencer from './pattern-sequencer.js';
// import ProjectManager   from './project-manager.js';
// import ExportEngine     from './export-engine.js';
//
// KeyboardSampler.init({ player: SamplePlayer });
// ChannelRack.init({ player: SamplePlayer });
// etc.
