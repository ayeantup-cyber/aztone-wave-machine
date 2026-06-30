/**
 * sample-browser.js
 * ─────────────────────────────────────────────────────────────
 * Owns the sample library: reads folders, builds Sample objects,
 * renders cards, and handles search filtering.
 *
 * A "Sample" is the canonical data model for this application.
 * Every audio file becomes a Sample. The rest of the app never
 * thinks in terms of filesystem entries.
 *
 * Sample object shape:
 * {
 *   id:           string,           // unique internal ID
 *   name:         string,           // display-friendly name
 *   filename:     string,           // original filename
 *   ext:          string,           // 'wav' | 'mp3' | 'ogg' etc.
 *   handle:       FileSystemFileHandle,
 *   duration:     number | null,    // seconds; set after decode
 *   playing:      boolean,
 *   loaded:       boolean,
 *   buffer:       AudioBuffer | null, // set after first decode
 *   category:     string | null,    // detected or null
 *   favorite:     boolean,          // FUTURE
 *   assignedTrack: number | null,   // FUTURE: channel rack slot
 *   waveform:     Float32Array | null, // FUTURE: waveform data
 *   tags:         string[],         // FUTURE: user tags
 * }
 *
 * FUTURE HOOKS:
 *   - Recursive subfolder scanning
 *   - Sort by name / type / duration / recent
 *   - Tag filtering
 *   - Favorites filtering
 *   - Drag-and-drop
 */

import { isSupportedAudio, friendlyName, detectCategory, formatTime, uid } from './utils.js';
import SamplePlayer from './sample-player.js';

// ── Internal state ────────────────────────────────────────────
let allSamples    = [];   // master list, never mutated after load
let filteredSamples = []; // current filtered view
let searchQuery   = '';

// ── DOM refs (set once during init) ──────────────────────────
let gridEl        = null;
let countEl       = null;
let emptyEl       = null;

// ── Card element map ──────────────────────────────────────────
// Maps sample.id → <div class="sample-card"> element.
// Allows O(1) lookups when updating card state from player events.
const cardMap = new Map();

// ── Public API ────────────────────────────────────────────────

const SampleBrowser = {

  /**
   * Initialise the browser with DOM references.
   * Called once from script.js during app startup.
   *
   * @param {{ grid: HTMLElement, count: HTMLElement, empty: HTMLElement }} refs
   */
  init({ grid, count, empty }) {
    gridEl    = grid;
    countEl   = count;
    emptyEl   = empty;
  },

  /**
   * Load samples from a FileSystem Directory Handle.
   * Replaces the current library.
   *
   * @param {FileSystemDirectoryHandle} dirHandle
   * @returns {Promise<number>} count of samples found
   */
  async loadFolder(dirHandle) {
    allSamples     = [];
    filteredSamples = [];
    cardMap.clear();
    gridEl.innerHTML = '';

    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue;
      if (!isSupportedAudio(entry.name)) continue;

      /** @type {Sample} */
      const sample = {
        id:            uid(),
        name:          friendlyName(entry.name),
        filename:      entry.name,
        ext:           entry.name.split('.').pop()?.toLowerCase() ?? '',
        handle:        entry,
        duration:      null,
        playing:       false,
        loaded:        false,
        buffer:        null,
        category:      detectCategory(entry.name),
        favorite:      false,        // FUTURE
        assignedTrack: null,         // FUTURE
        waveform:      null,         // FUTURE
        tags:          [],           // FUTURE
      };

      allSamples.push(sample);
    }

    // Sort alphabetically by display name
    allSamples.sort((a, b) => a.name.localeCompare(b.name));

    this.applyFilter(searchQuery);
    return allSamples.length;
  },

  /**
   * Filter the sample list by query string.
   * Matches against both display name and original filename.
   * Instant, case-insensitive.
   *
   * @param {string} query
   */
  applyFilter(query = '') {
    searchQuery = query.trim().toLowerCase();

    filteredSamples = searchQuery
      ? allSamples.filter(s =>
          s.name.toLowerCase().includes(searchQuery) ||
          s.filename.toLowerCase().includes(searchQuery) ||
          (s.category ?? '').toLowerCase().includes(searchQuery)
        )
      : [...allSamples];

    this._renderGrid();
  },

  /**
   * Update the visual state of a single card.
   * Called by the player event handlers in script.js.
   *
   * @param {string} sampleId
   * @param {'idle'|'loading'|'playing'} state
   * @param {{ duration?: number }} [meta]
   */
  setCardState(sampleId, state, meta = {}) {
    const card = cardMap.get(sampleId);
    if (!card) return;

    const previewBtn = card.querySelector('.btn-preview');
    const durationEl = card.querySelector('.card-duration');

    card.classList.remove('is-playing', 'is-loading');

    switch (state) {
      case 'playing':
        card.classList.add('is-playing');
        if (previewBtn) previewBtn.textContent = '■ Stop';
        break;

      case 'loading':
        card.classList.add('is-loading');
        if (previewBtn) previewBtn.textContent = '… Loading';
        break;

      case 'idle':
      default:
        if (previewBtn) previewBtn.textContent = '▶ Preview';
        break;
    }

    // Update duration badge once known
    if (meta.duration != null && durationEl) {
      durationEl.textContent = formatTime(meta.duration);
    }
  },

  /**
   * Reset all cards to idle state.
   * Called when playback stops globally.
   */
  resetAllCards() {
    for (const [id] of cardMap) {
      this.setCardState(id, 'idle');
    }
  },

  /** Returns the full unfiltered sample list. */
  getAllSamples() { return allSamples; },

  /** Returns the currently filtered sample list. */
  getFilteredSamples() { return filteredSamples; },

  // ── Private ─────────────────────────────────────────────────

  /**
   * Renders the filtered sample list into the grid.
   * Rebuilds card elements from scratch on each filter change.
   *
   * FUTURE: virtual scrolling for libraries with thousands of samples.
   */
  _renderGrid() {
    gridEl.innerHTML = '';
    cardMap.clear();

    const count = filteredSamples.length;

    // Update meta count
    if (countEl) {
      countEl.textContent = `${count} sample${count !== 1 ? 's' : ''}`;
    }

    // Show/hide empty state
    if (emptyEl) {
      emptyEl.hidden = count > 0;
    }

    for (const sample of filteredSamples) {
      const card = this._buildCard(sample);
      cardMap.set(sample.id, card);
      gridEl.appendChild(card);
    }
  },

  /**
   * Builds a single sample card DOM element.
   *
   * @param {Sample} sample
   * @returns {HTMLElement}
   */
  _buildCard(sample) {
    const card = document.createElement('div');
    card.className  = 'sample-card';
    card.role       = 'listitem';
    card.dataset.id = sample.id;

    // Extension → emoji icon
    const icon = extIcon(sample.ext);

    // Category badge HTML (only if category detected)
    const catHTML = sample.category
      ? `<span class="card-category">${sample.category}</span>`
      : '';

    card.innerHTML = `
      <div class="card-top">
        <span class="card-icon" aria-hidden="true">${icon}</span>
        <div style="flex:1;min-width:0">
          <div class="card-name" title="${escapeHtml(sample.filename)}">${escapeHtml(sample.name)}</div>
          <div class="card-duration">—</div>
        </div>
        ${catHTML}
      </div>
      <div class="card-actions">
        <button class="btn-preview" aria-label="Preview ${escapeHtml(sample.name)}">
          ▶ Preview
        </button>
        <!--
          FUTURE: Load to Track button
          <button class="btn-ghost btn-sm btn-load" disabled>Load</button>
        -->
      </div>
    `;

    // ── Wire up the Preview button ─────────────────────────
    const previewBtn = card.querySelector('.btn-preview');

    previewBtn.addEventListener('click', () => {
      const nowPlaying = SamplePlayer.nowPlaying();

      if (nowPlaying?.id === sample.id) {
        // Same card — acts as Stop
        SamplePlayer.stop();
      } else {
        // Start this sample (player will stop the previous one)
        SamplePlayer.preview(sample);
      }
    });

    return card;
  },

};

// ── Helpers ───────────────────────────────────────────────────

/** Returns a suitable emoji for a given audio extension. */
function extIcon(ext) {
  switch (ext) {
    case 'wav':  return '🔷';
    case 'mp3':  return '🎵';
    case 'ogg':  return '🔶';
    case 'flac': return '💎';
    case 'aiff': return '🎙️';
    default:     return '🎧';
  }
}

/** Minimal HTML escape to prevent XSS from filenames. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default SampleBrowser;

/**
 * @typedef {Object} Sample
 * @property {string}                    id
 * @property {string}                    name
 * @property {string}                    filename
 * @property {string}                    ext
 * @property {FileSystemFileHandle}      handle
 * @property {number|null}               duration
 * @property {boolean}                   playing
 * @property {boolean}                   loaded
 * @property {AudioBuffer|null}          buffer
 * @property {string|null}               category
 * @property {boolean}                   favorite
 * @property {number|null}               assignedTrack
 * @property {Float32Array|null}         waveform
 * @property {string[]}                  tags
 */
