/* ═══════════════════════════════════════════════════════════════
   AZ-TØNE WAVE MACHINE — script.js                     v0.2.0
   Orchestrator: page nav, sample library, sample editor,
   channel rack, pads, transport
═══════════════════════════════════════════════════════════════ */

// ── DOM refs: Sampler page ────────────────────────────────────────
const folderButton    = document.getElementById('folderButton');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const statusText      = document.getElementById('statusText');
const landingSection  = document.getElementById('landingSection');
const browserSection  = document.getElementById('browserSection');
const sampleGrid      = document.getElementById('sampleGrid');
const sampleCount     = document.getElementById('sampleCount');
const searchInput     = document.getElementById('searchInput');
const searchClear     = document.getElementById('searchClear');
const emptyState      = document.getElementById('emptyState');

// DOM refs: Sample Editor
const editorSection = document.getElementById('editorSection');
const editorName     = document.getElementById('editorName');
const editorCloseBtn = document.getElementById('editorCloseBtn');
const editorCanvas   = document.getElementById('editorCanvas');
const editorLoading  = document.getElementById('editorLoading');
const editorPlayBtn  = document.getElementById('editorPlayBtn');
const editorLoadBtn  = document.getElementById('editorLoadBtn');

// Bottom player refs
const bottomPlayer       = document.getElementById('bottomPlayer');
const playerName         = document.getElementById('playerName');
const playerStopBtn      = document.getElementById('playerStopBtn');
const playerProgressFill = document.getElementById('playerProgressFill');
const playerCurrentTime  = document.getElementById('playerCurrentTime');
const playerDuration     = document.getElementById('playerDuration');

// Nav + transport
const navTabs       = document.querySelectorAll('.nav-tab');
const playBtn       = document.getElementById('playBtn');
const stopBtn        = document.getElementById('stopBtn');
const bpmInput       = document.getElementById('bpmInput');
const rackContainer  = document.getElementById('rackContainer');
const padsGrid       = document.getElementById('padsGrid');

// ── State ────────────────────────────────────────────────────────
let allSamples   = [];   // [{ name, file }]
let currentAudio = null; // <audio> element used for library preview
let currentCard  = null;
let rafId        = null;

const NUM_TRACKS = 8;
const NUM_STEPS  = 16;

// Channel Rack track state
const tracks = Array.from({ length: NUM_TRACKS }, (_, i) => ({
  name: null,
  file: null,
  buffer: null,
  steps: Array(NUM_STEPS).fill(false),
  muted: false,
  label: `TRACK ${i + 1}`,
}));

// Cache of decoded AudioBuffers, keyed by sample name, so opening the
// same sample in the editor twice doesn't re-decode from disk.
const bufferCache = new Map();

// Sample Editor active state
let editorSample = null;       // { name, file }
let editorBuffer = null;       // AudioBuffer
let editorSourceNode = null;   // currently playing source, or null

// ── Helpers ──────────────────────────────────────────────────────
const fmt = secs => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/kick|bd/.test(n))             return 'Kick';
  if (/snare|snr|clap/.test(n))      return 'Snare';
  if (/hat|hh|hihat|hi-hat/.test(n)) return 'Hat';
  if (/808|bass/.test(n))            return '808';
  if (/perc|rim|tom/.test(n))        return 'Perc';
  if (/pad|atm|amb/.test(n))         return 'Pad';
  if (/lead|synth/.test(n))          return 'Synth';
  if (/vocal|vox/.test(n))           return 'Vocal';
  if (/fx|sfx/.test(n))              return 'FX';
  return '';
}

/* ══════════════════════════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════════════════════════ */
function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(p => { p.hidden = true; });
  document.getElementById(`page-${pageId}`).hidden = false;

  navTabs.forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.page === pageId);
  });
}

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.disabled) return;
    switchPage(tab.dataset.page);
  });
});

/* ══════════════════════════════════════════════════════════════
   SAMPLER — folder picker + library
══════════════════════════════════════════════════════════════ */
async function pickFolder() {
  if (!window.showDirectoryPicker) {
    statusText.textContent = '⚠ Folder access not supported in this browser. Use Chrome or Edge.';
    return;
  }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'read' });
    statusText.textContent = `📁 ${dir.name}`;
    await loadSamples(dir);
  } catch (err) {
    if (err.name !== 'AbortError') {
      statusText.textContent = '⚠ Could not read folder.';
      console.error('[pickFolder]', err);
    }
  }
}

async function loadSamples(dir) {
  stopPreviewPlayback();
  closeEditor();
  allSamples = [];
  bufferCache.clear();
  sampleGrid.innerHTML = '';

  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && /\.(wav|mp3|ogg|flac|aiff?)$/i.test(entry.name)) {
      const file = await entry.getFile();
      allSamples.push({ name: entry.name, file });
    }
  }

  allSamples.sort((a, b) => a.name.localeCompare(b.name));

  landingSection.hidden = true;
  browserSection.hidden = false;

  renderGrid(allSamples);
}

function renderGrid(samples) {
  sampleGrid.innerHTML = '';
  sampleCount.textContent = `${samples.length} sample${samples.length !== 1 ? 's' : ''}`;

  if (samples.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  samples.forEach(({ name, file }) => {
    const card = document.createElement('div');
    card.className = 'sample-card';
    card.setAttribute('role', 'listitem');

    const tag = guessCategory(name);
    const isLoadedSomewhere = tracks.some(t => t.name === name);
    if (isLoadedSomewhere) card.classList.add('is-loaded-track');

    card.innerHTML = `
      <div class="card-top">
        <span class="card-icon" aria-hidden="true">🎵</span>
        <span class="card-name" title="${name}">${name}</span>
        ${tag ? `<span class="card-category">${tag}</span>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn-preview">▶ Preview</button>
        <button class="btn-load" title="Load into next empty Channel Rack track">+ Load</button>
      </div>
    `;

    const previewBtn = card.querySelector('.btn-preview');
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePreview(card, name, file);
    });

    const loadBtn = card.querySelector('.btn-load');
    loadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadIntoTrack(name, file, card);
    });

    // Tapping anywhere else on the card opens the Sample Editor
    card.addEventListener('click', () => openEditor(name, file));

    sampleGrid.appendChild(card);
  });
}

/* ── Preview playback (library) — uses <audio>, separate from the
   sequencer's Web Audio engine since it's simpler for one-shots
   with a progress bar / scrubber UI ─────────────────────────────── */
function togglePreview(card, name, file) {
  if (currentCard === card && currentAudio && !currentAudio.paused) {
    stopPreviewPlayback();
    return;
  }
  stopPreviewPlayback();

  const url = URL.createObjectURL(file);
  const audio = new Audio(url);
  currentAudio = audio;
  currentCard  = card;

  card.classList.add('is-loading');
  const btn = card.querySelector('.btn-preview');
  btn.textContent = '… Loading';

  audio.addEventListener('canplay', () => {
    card.classList.remove('is-loading');
    card.classList.add('is-playing');
    btn.textContent = '■ Stop';

    playerName.textContent = name;
    playerDuration.textContent = fmt(audio.duration || 0);
    showPlayer();

    audio.play();
    trackProgress(audio);
  }, { once: true });

  audio.addEventListener('ended', () => stopPreviewPlayback(), { once: true });
  audio.addEventListener('error', () => {
    stopPreviewPlayback();
    statusText.textContent = '⚠ Could not play this file.';
  }, { once: true });
}

function stopPreviewPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  if (currentCard) {
    currentCard.classList.remove('is-playing', 'is-loading');
    const btn = currentCard.querySelector('.btn-preview');
    if (btn) btn.textContent = '▶ Preview';
    currentCard = null;
  }
  cancelAnimationFrame(rafId);
  hidePlayer();
}

function trackProgress(audio) {
  const tick = () => {
    if (!audio || audio.paused) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    playerProgressFill.style.width = `${pct}%`;
    playerCurrentTime.textContent = fmt(audio.currentTime);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function showPlayer() {
  bottomPlayer.hidden = false;
  bottomPlayer.offsetHeight; // force reflow for transition
  bottomPlayer.classList.add('is-visible');
}

function hidePlayer() {
  bottomPlayer.classList.remove('is-visible');
  playerProgressFill.style.width = '0%';
  playerCurrentTime.textContent = '0:00';
  playerDuration.textContent = '0:00';
  playerName.textContent = '—';
  setTimeout(() => { bottomPlayer.hidden = true; }, 300);
}

/* ── Search ─────────────────────────────────────────────────────── */
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  searchClear.hidden = q.length === 0;
  const filtered = q
    ? allSamples.filter(s => s.name.toLowerCase().includes(q))
    : allSamples;
  renderGrid(filtered);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  renderGrid(allSamples);
  searchInput.focus();
});

folderButton.addEventListener('click', pickFolder);
changeFolderBtn.addEventListener('click', () => {
  stopPreviewPlayback();
  closeEditor();
  browserSection.hidden = true;
  landingSection.hidden = false;
  statusText.textContent = 'No folder selected.';
  allSamples = [];
});
playerStopBtn.addEventListener('click', stopPreviewPlayback);

/* ══════════════════════════════════════════════════════════════
   SAMPLE EDITOR — waveform view, play/stop, load to rack
══════════════════════════════════════════════════════════════ */
async function openEditor(name, file) {
  stopPreviewPlayback();
  stopEditorPlayback();

  editorSample = { name, file };
  editorSection.hidden = false;
  editorName.textContent = name;
  editorPlayBtn.textContent = '▶ Play';
  editorPlayBtn.classList.remove('is-playing');

  // Scroll the editor into view so it's obvious something opened
  editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const cached = bufferCache.get(name);
  if (cached) {
    editorBuffer = cached;
    drawWaveform(editorBuffer);
    return;
  }

  editorLoading.hidden = false;
  clearCanvas();

  try {
    const buffer = await AudioEngine.loadBuffer(file);
    bufferCache.set(name, buffer);

    // Guard: user may have opened a different sample while this decoded
    if (!editorSample || editorSample.name !== name) return;

    editorBuffer = buffer;
    editorLoading.hidden = true;
    drawWaveform(editorBuffer);
  } catch (err) {
    editorLoading.hidden = true;
    editorLoading.hidden = false;
    editorLoading.textContent = '⚠ Could not decode this sample.';
    console.error('[openEditor]', err);
  }
}

function closeEditor() {
  stopEditorPlayback();
  editorSection.hidden = true;
  editorSample = null;
  editorBuffer = null;
}

editorCloseBtn.addEventListener('click', closeEditor);

function clearCanvas() {
  const ctx = editorCanvas.getContext('2d');
  const { width, height } = resizeCanvasToDisplaySize(editorCanvas);
  ctx.clearRect(0, 0, width, height);
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function drawWaveform(buffer) {
  const canvas = editorCanvas;
  const ctx = canvas.getContext('2d');
  const { width, height } = resizeCanvasToDisplaySize(canvas);

  ctx.clearRect(0, 0, width, height);

  const data = buffer.getChannelData(0); // left channel / mono
  const step = Math.ceil(data.length / width);
  const mid = height / 2;

  ctx.beginPath();
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x++) {
    let min = 1.0;
    let max = -1.0;
    const start = x * step;
    const end = Math.min(start + step, data.length);
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMin = mid + min * mid * 0.9;
    const yMax = mid + max * mid * 0.9;
    ctx.moveTo(x, yMin);
    ctx.lineTo(x, yMax);
  }

  ctx.stroke();
}

function stopEditorPlayback() {
  if (editorSourceNode) {
    try { editorSourceNode.stop(); } catch (e) { /* already stopped */ }
    editorSourceNode = null;
  }
  editorPlayBtn.textContent = '▶ Play';
  editorPlayBtn.classList.remove('is-playing');
}

editorPlayBtn.addEventListener('click', () => {
  if (!editorBuffer) return;

  if (editorSourceNode) {
    stopEditorPlayback();
    return;
  }

  AudioEngine.init();
  const source = AudioEngine.previewBuffer(editorBuffer, () => {
    // Playback finished naturally
    editorSourceNode = null;
    editorPlayBtn.textContent = '▶ Play';
    editorPlayBtn.classList.remove('is-playing');
  });
  editorSourceNode = source;
  editorPlayBtn.textContent = '■ Stop';
  editorPlayBtn.classList.add('is-playing');
});

editorLoadBtn.addEventListener('click', () => {
  if (!editorSample) return;
  const card = findCardByName(editorSample.name);
  loadIntoTrack(editorSample.name, editorSample.file, card);
});

function findCardByName(name) {
  const cards = sampleGrid.querySelectorAll('.sample-card');
  for (const card of cards) {
    const nameEl = card.querySelector('.card-name');
    if (nameEl && nameEl.getAttribute('title') === name) return card;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   CHANNEL RACK
══════════════════════════════════════════════════════════════ */
function renderRack() {
  rackContainer.innerHTML = '';

  tracks.forEach((track, trackIndex) => {
    const row = document.createElement('div');
    row.className = 'rack-row' + (track.name ? ' has-sample' : '');
    row.dataset.trackIndex = trackIndex;

    row.innerHTML = `
      <div class="rack-track-name">
        <span class="rack-track-label">${track.label}</span>
        <span class="rack-track-sample ${track.name ? '' : 'is-empty'}">
          ${track.name ? track.name : 'Empty — load a sample'}
        </span>
      </div>
      <div class="step-grid" data-track="${trackIndex}"></div>
      <div class="rack-row-controls">
        <button class="rack-mini-btn mute-btn" title="Mute">M</button>
      </div>
    `;

    const stepGrid = row.querySelector('.step-grid');
    track.steps.forEach((isActive, stepIndex) => {
      const stepBtn = document.createElement('button');
      stepBtn.className = 'step' + (isActive ? ' is-active' : '');
      stepBtn.dataset.step = stepIndex;
      stepBtn.addEventListener('click', () => {
        track.steps[stepIndex] = !track.steps[stepIndex];
        stepBtn.classList.toggle('is-active', track.steps[stepIndex]);
      });
      stepGrid.appendChild(stepBtn);
    });

    const muteBtn = row.querySelector('.mute-btn');
    muteBtn.addEventListener('click', () => {
      track.muted = !track.muted;
      muteBtn.classList.toggle('is-active-mute', track.muted);
      renderPads(); // keep pad dimming in sync with mute state
    });

    rackContainer.appendChild(row);
  });
}

async function loadIntoTrack(name, file, card) {
  // Find next empty track
  const emptyTrack = tracks.find(t => !t.name);
  if (!emptyTrack) {
    statusText.textContent = '⚠ All 8 tracks are full. Clear one in Channel Rack first.';
    return;
  }

  const loadBtn = card ? card.querySelector('.btn-load') : null;
  if (loadBtn) {
    loadBtn.disabled = true;
    loadBtn.textContent = '…';
  }

  try {
    // Reuse a cached buffer if the editor already decoded this sample
    const buffer = bufferCache.get(name) || await AudioEngine.loadBuffer(file);
    bufferCache.set(name, buffer);

    emptyTrack.name = name;
    emptyTrack.file = file;
    emptyTrack.buffer = buffer;

    if (card) card.classList.add('is-loaded-track');
    if (loadBtn) {
      loadBtn.textContent = '✓ Loaded';
      setTimeout(() => {
        loadBtn.disabled = false;
        loadBtn.textContent = '+ Load';
      }, 1200);
    }

    renderRack();
    renderPads();
  } catch (err) {
    if (loadBtn) {
      loadBtn.disabled = false;
      loadBtn.textContent = '+ Load';
    }
    statusText.textContent = '⚠ Could not decode this sample.';
    console.error('[loadIntoTrack]', err);
  }
}

/* ══════════════════════════════════════════════════════════════
   TRANSPORT — wired to AudioEngine scheduler
══════════════════════════════════════════════════════════════ */
function highlightPlayhead(stepIndex) {
  document.querySelectorAll('.step-grid').forEach(grid => {
    grid.querySelectorAll('.step').forEach(s => s.classList.remove('is-playhead'));
    const stepEl = grid.querySelector(`.step[data-step="${stepIndex}"]`);
    if (stepEl) stepEl.classList.add('is-playhead');
  });
}

function clearPlayhead() {
  document.querySelectorAll('.step.is-playhead').forEach(s => s.classList.remove('is-playhead'));
}

playBtn.addEventListener('click', () => {
  if (AudioEngine.isRunning) {
    AudioEngine.stop();
    playBtn.classList.remove('is-playing');
    clearPlayhead();
    return;
  }
  AudioEngine.init();
  AudioEngine.setBPM(parseInt(bpmInput.value, 10) || 126);
  AudioEngine.start(tracks, highlightPlayhead);
  playBtn.classList.add('is-playing');
});

stopBtn.addEventListener('click', () => {
  AudioEngine.stop();
  playBtn.classList.remove('is-playing');
  clearPlayhead();
});

bpmInput.addEventListener('change', () => {
  const val = parseInt(bpmInput.value, 10);
  if (val) AudioEngine.setBPM(val);
});

/* ══════════════════════════════════════════════════════════════
   PADS
══════════════════════════════════════════════════════════════ */
function renderPads() {
  padsGrid.innerHTML = '';

  tracks.forEach((track, i) => {
    const pad = document.createElement('div');
    const cat = track.name ? guessCategory(track.name) : '';

    pad.className = [
      'pad',
      !track.name  ? 'is-empty' : '',
      track.muted  ? 'is-muted' : '',
    ].filter(Boolean).join(' ');

    if (cat) pad.dataset.category = cat;

    const displayName = track.name
      ? track.name.replace(/\.[^.]+$/, '').slice(0, 22)
      : 'Empty';

    pad.innerHTML = `
      <span class="pad-number">PAD ${i + 1}</span>
      <span class="pad-name">${displayName}</span>
      <span class="pad-accent"></span>
    `;

    if (track.buffer && !track.muted) {
      pad.addEventListener('pointerdown', e => {
        e.preventDefault();
        firePad(pad, track);
      });
    }

    padsGrid.appendChild(pad);
  });
}

let fireClearTimers = [];

function firePad(pad, track) {
  AudioEngine.init();
  AudioEngine.triggerBuffer(track.buffer);

  pad.classList.add('is-firing');
  const t = setTimeout(() => pad.classList.remove('is-firing'), 200);
  fireClearTimers.push(t);
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
renderRack();
renderPads();
