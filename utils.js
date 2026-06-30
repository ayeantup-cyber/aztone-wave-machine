/**
 * utils.js
 * ─────────────────────────────────────────────────────────────
 * Pure utility functions shared across all AZ-TØNE modules.
 * No side-effects, no DOM access, no audio APIs here.
 *
 * FUTURE: tempo detection helpers, pitch helpers, ADSR math, etc.
 */

// ── Supported audio extensions ────────────────────────────────
// Add new types here — the rest of the app picks them up automatically.
export const SUPPORTED_EXTENSIONS = new Set([
  'wav',
  'mp3',
  'ogg',
  // FUTURE: 'flac', 'aiff', 'm4a', 'opus'
]);

/**
 * Returns true if the filename has a supported audio extension.
 * @param {string} filename
 * @returns {boolean}
 */
export function isSupportedAudio(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Derives a display-friendly name from a raw filename.
 * Strips extension, replaces underscores/hyphens with spaces,
 * and title-cases the result.
 *
 * "kick_drum_01.wav" → "Kick Drum 01"
 *
 * @param {string} filename
 * @returns {string}
 */
export function friendlyName(filename) {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Attempts to guess a category from the filename.
 * Returns a short uppercase string, or null if undetectable.
 *
 * FUTURE: replace with a proper tag system from the sample object.
 *
 * @param {string} filename
 * @returns {string|null}
 */
const CATEGORY_PATTERNS = [
  [/kick|bd\b|bass\s*drum/i,    'KICK'],
  [/snare|sn\b/i,               'SNARE'],
  [/hihat|hh\b|hat/i,           'HI-HAT'],
  [/crash|cymbal/i,             'CYMBAL'],
  [/clap/i,                     'CLAP'],
  [/perc|percussion/i,          'PERC'],
  [/bass/i,                     'BASS'],
  [/pad/i,                      'PAD'],
  [/lead/i,                     'LEAD'],
  [/chord|stab/i,               'CHORD'],
  [/atmo|ambient|texture/i,     'ATMO'],
  [/vocal|vox|voice/i,          'VOCAL'],
  [/fx|effect|riser|down/i,     'FX'],
  [/loop/i,                     'LOOP'],
];

export function detectCategory(filename) {
  for (const [pattern, label] of CATEGORY_PATTERNS) {
    if (pattern.test(filename)) return label;
  }
  return null;
}

/**
 * Formats a duration in seconds to mm:ss.
 * e.g. 63.4 → "1:03"
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generates a lightweight unique ID for sample objects.
 * Not cryptographically secure — just for internal object identity.
 *
 * @returns {string}
 */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Debounce — delays calling fn until after `wait` ms have elapsed
 * since the last invocation. Used for search filtering.
 *
 * @param {Function} fn
 * @param {number} wait  milliseconds
 * @returns {Function}
 */
export function debounce(fn, wait = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Clamps a number between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
