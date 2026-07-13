/**
 * Shared utility functions for Splatoon 3 Rotation Tracker
 */

// API endpoints
const API = {
  SCHEDULES: 'https://splatoon3.ink/data/schedules.json',
  REFRESH_INTERVAL: 30 // minutes
};

/**
 * Normalize a stage name to a filesystem-safe ID
 * This automatically handles most new stages without manual mapping
 * @param {string} name The stage name to normalize
 * @returns {string} Normalized stage ID
 */
function normalizeStageId(name) {
  if (typeof name !== 'string') return 'unknown_stage';

  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'unknown_stage';
}

// Exceptions where normalizeStageId() doesn't produce the expected image filename.
// Keyed on the *normalized* form (output of normalizeStageId), so any input
// the normalizer maps to the same value gets caught here.
const stageIdOverrides = {
  // "Um'ami Ruins": apostrophe removal yields "umami_ruins"; the image keeps the split.
  "umami_ruins": "um_ami_ruins",
  // "Salmonid Smokeyard": the image filename is truncated ("smokeyar").
  "salmonid_smokeyard": "salmonid_smokeyar",
  // "Mako Mart" / "MakoMart": the API spaces it; the image file collapses it.
  "mako_mart": "makomart",
  // "Splatlands Bowl" is the short form of Grand Splatlands Bowl.
  "splatlands_bowl": "grand_splatlands_bowl"
};

/**
 * Format a date to a human-readable time
 * @param {Date|string} date The date to format
 * @returns {string} Formatted time string
 */
function formatTime(date) {
  if (!date) return 'Unknown';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return 'Invalid Date';
  
  const options = { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true
  };
  
  const timeString = dateObj.toLocaleTimeString(undefined, options);
  
  // Add date if it's not today
  const now = new Date();
  const isToday = now.toDateString() === dateObj.toDateString();
  
  if (isToday) {
    return timeString;
  } else {
    // Add date
    const dateOptions = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric'
    };
    
    return `${dateObj.toLocaleDateString(undefined, dateOptions)} ${timeString}`;
  }
}

/**
 * Format timespan between start and end
 * @param {string|Date} startTime Start time
 * @param {string|Date} endTime End time
 * @returns {string} Formatted timespan
 */
function formatTimeRange(startTime, endTime) {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
  
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Get stage image ID from stage name. Normalizes via normalizeStageId, then
 * applies any override from stageIdOverrides for cases where the image
 * filename doesn't match the normalized form.
 * @param {string} stageName The stage name to convert
 * @returns {string} The stage ID for use in image paths
 */
function getStageId(stageName) {
  if (!stageName) {
    console.warn('getStageId called with empty/null stage name');
    return 'unknown_stage';
  }
  const normalizedId = normalizeStageId(stageName);
  return Object.hasOwn(stageIdOverrides, normalizedId)
    ? stageIdOverrides[normalizedId]
    : normalizedId;
}

/**
 * Accept an HTTPS image URL hosted by splatoon3.ink or one of its subdomains.
 * @param {unknown} value Candidate URL
 * @returns {string} Normalized safe URL, or an empty string
 */
function safeSplatoonUrl(value) {
  if (typeof value !== 'string' || !value) return '';

  try {
    const parsed = new URL(value);
    const isAllowedHost = parsed.hostname === 'splatoon3.ink' ||
      parsed.hostname.endsWith('.splatoon3.ink');
    const hasCredentials = Boolean(parsed.username || parsed.password);

    if (parsed.protocol === 'https:' && isAllowedHost && !hasCredentials && !parsed.port) {
      return parsed.toString();
    }
  } catch {
    // Invalid URLs are rejected below.
  }

  return '';
}

// Export utilities
const Utils = {
  API,
  stageIdOverrides,
  normalizeStageId,
  formatTime,
  formatTimeRange,
  getStageId,
  safeSplatoonUrl
};

// Make utils available in different contexts
if (typeof window !== 'undefined') {
  window.Utils = Utils;
} else if (typeof self !== 'undefined') {
  self.Utils = Utils;
}
