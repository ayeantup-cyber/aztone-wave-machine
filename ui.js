/**
 * ui.js
 * 
─────────────────────────────────────────────────────────────
 * Controls all UI state that isn't tied to a specific sample card.
 *
 * Responsibilities:
 *   - Show / hide the landing section vs. browser section
 *   - Update status text
 *   - Show / hide and update the bottom player bar
 *   - Progress bar animation
 *   - Search input handling
 *
 * NOT responsible for:
 *   - Audio playback
 *   - Sample card rendering (that's sample-browser.js)
 *   - Business logic
 *
 * FUTURE HOOKS (stubbed):
 *   - Favorites UI
 *   - Load-to-track UI
 *   - Waveform display in bottom player
 *   - Notification / toast system
 *   - Theme switching
 */

import { formatTime, debounce } from './utils.js';

// ── DOM refs 
──────────────────────────────────────────────────
const el = {
  landing:         () => document.getElementById('landingSection'),
  browser:         () => document.getElementById('browserSection'),
  status:          () => document.getElementById('statusText'),
  searchInput:     () => document.getElementById('searchInput'),
  searchClear:     () => document.getElementById('searchClear'),
  bottomPlayer:    () => document.getElementById('bottomPlayer'),
  playerName:      () => document.getElementById('playerName'),
  playerCurrentTime: () => document.getElementById('playerCurrentTime'),
  playerDuration:  () => document.getElementById('playerDuration'),
  playerStopBtn:   () => document.getElementById('playerStopBtn'),
  progressFill:    () => document.getElementById('playerProgressFill'),
};

// Lazy getter — creates the reference once then caches it.
const cache = {};
function dom(key) {
  return cache[key] ??= el[key]?.();
}

// ── Public API 
────────────────────────────────────────────────

const UI = {

  /**
   * Wire up UI event handlers.
   * Called once from script.js during startup.
   *
   * @param {{ onSearch: (q:string)=>void, onStop: ()=>void }} callbacks
   */
  init({ onSearch, onStop }) {

    // Search input — debounced so filtering doesn't fire on every keystroke
    const debouncedSearch = debounce((q) => onSearch(q), 100);

    dom('searchInput').addEventListener('input', (e) => {
      const q = e.target.value;
      dom('searchClear').hidden = q.length === 0;
      debouncedSearch(q);
    });

    // Clear button inside search box
    dom('searchClear').addEventListener('click', () => {
      dom('searchInput').value = '';
      dom('searchClear').hidden = true;
      onSearch('');
    });

    // Bottom player stop button
    dom('playerStopBtn').addEventListener('click', () => onStop());
  },

  // ── Section transitions 
──────────────────────────────────────

  /**
   * Switch from the landing view to the sample browser.
   * @param {string} folderName
   */
  showBrowser(folderName) {
    dom('landing').hidden  = true;
    dom('browser').hidden  = false;
    dom('searchInput').focus();
    this.setStatus(`📁 ${folderName}`);
  },

  /** Switch back to the landing view. */
  showLanding() {
    dom('landing').hidden  = false;
    dom('browser').hidden  = true;
    this.setStatus('No folder selected.');
    this.hidePlayer();
  },

  // ── Status text 
──────────────────────────────────────────────

  /** @param {string} text */
  setStatus(text) {
    const s = dom('status');
    if (s) s.textContent = text;
  },

  // ── Bottom Player 
────────────────────────────────────────────

  /**
   * Show the bottom player for a given sample.
   * @param {import('./sample-browser.js').Sample} sample
   */
  showPlayer(sample) {
    const player = dom('bottomPlayer');

    dom('playerName').textContent        = sample.name;
    dom('playerCurrentTime').textContent = '0:00';
    dom('playerDuration').textContent    = sample.duration ? formatTime(sample.duration) : '—';
    dom('progressFill').style.width      = '0%';

    player.hidden = false;

    // Trigger CSS slide-in (rAF ensures hidden→visible transition fires)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => player.classList.add('is-visible'));
    });
  },

  /** Hide and reset the bottom player. */
  hidePlayer() {
    const player = dom('bottomPlayer');
    player.classList.remove('is-visible');

    // Wait for the CSS transition, then hide with [hidden]
    player.addEventListener(
      'transitionend',
      () => { player.hidden = true; },
      { once: true }
    );

    dom('playerCurrentTime').textContent = '0:00';
    dom('playerDuration').textContent    = '0:00';
    dom('progressFill').style.width      = '0%';
    dom('playerName').textContent        = '—';
  },

  /**
   * Update the bottom player progress.
   * Called on every requestAnimationFrame tick from the player.
   *
   * @param {number} currentTime  seconds elapsed
   * @param {number} duration     total duration in seconds
   */
  updateProgress(currentTime, duration) {
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

    dom('progressFill').style.width          = `${pct.toFixed(2)}%`;
    dom('playerCurrentTime').textContent     = formatTime(currentTime);

    // Update duration if it wasn't known yet when player opened
    if (dom('playerDuration').textContent === '—' && duration > 0) {
      dom('playerDuration').textContent = formatTime(duration);
    }

    // Update progress bar ARIA value
    const bar = dom('bottomPlayer').querySelector('.player-progress-bar');
    if (bar) bar.setAttribute('aria-valuenow', Math.round(pct));
  },

  // ── Search helpers 
───────────────────────────────────────────

  /** Clear the search input programmatically (e.g. when folder changes). */
  clearSearch() {
    const inp = dom('searchInput');
    const clr = dom('searchClear');
    if (inp) inp.value = '';
    if (clr) clr.hidden = true;
  },

  // ── FUTURE stubs 
─────────────────────────────────────────────

  /**
   * FUTURE: showToast(message, type)
   * Lightweight notification for "Loaded to Track", "Saved to Favorites", etc.
   */
  // showToast(message, type = 'info') { ... }

  /**
   * FUTURE: setTheme(name)
   * Theme switching (dark-purple default, midnight-black, etc.)
   */
  // setTheme(name) { ... }

};

export default UI;

