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
  if (!name) return 'unknown_stage';

  return name
    .toLowerCase()
    .trim()
    .replace(/[''\u2019]/g, '')        // Remove apostrophes (including smart quotes)
    .replace(/&/g, 'and')              // Replace & with 'and'
    .replace(/[.,:;!?]/g, '')          // Remove punctuation
    .replace(/[-–—]/g, '_')            // Replace dashes with underscores
    .replace(/\s+/g, '_')              // Replace spaces with underscores
    .replace(/_+/g, '_')               // Collapse multiple underscores
    .replace(/^_|_$/g, '');            // Remove leading/trailing underscores
}

// Explicit overrides for stages that don't follow the normalization pattern
// Only needed for edge cases - most stages work with normalizeStageId()
const stageIdOverrides = {
  // Special cases where the normalized name doesn't match the expected file
  "umami_ruins": "um_ami_ruins",
  "um_ami_ruins": "um_ami_ruins",
  "salmonid_smokeyard": "salmonid_smokeyar",
  "salmonid_smokeyar": "salmonid_smokeyar"
};

// Legacy mapping (kept for backwards compatibility during transition)
const stageIdMapping = {
  // Regular/Anarchy/X Battle stages
  "scorch gorge": "scorch_gorge",
  "eeltail alley": "eeltail_alley",
  "hagglefish market": "hagglefish_market",
  "undertow spillway": "undertow_spillway",
  "um'ami ruins": "um_ami_ruins",
  "mincemeat metalworks": "mincemeat_metalworks",
  "brinewater springs": "brinewater_springs",
  "barnacle & dime": "barnacle_and_dime",
  "flounder heights": "flounder_heights",
  "hammerhead bridge": "hammerhead_bridge",
  "museum d'alfonsino": "museum_dalfonsino",
  "mahi-mahi resort": "mahi_mahi_resort",
  "inkblot art academy": "inkblot_art_academy",
  "sturgeon shipyard": "sturgeon_shipyard",
  "makomart": "makomart",
  "wahoo world": "wahoo_world",
  "humpback pump track": "humpback_pump_track",
  "manta maria": "manta_maria",
  "crableg capital": "crableg_capital",
  "shipshape cargo co.": "shipshape_cargo_co",
  "robo rom-en": "robo_rom_en",
  "bluefin depot": "bluefin_depot",
  "marlin airport": "marlin_airport",
  "lemuria hub": "lemuria_hub",

  // Alternative spellings and API variations
  "umami ruins": "um_ami_ruins",
  "um ami ruins": "um_ami_ruins",
  "mako mart": "makomart",
  "museum dalfonsino": "museum_dalfonsino",
  "barnacle and dime": "barnacle_and_dime",

  // Salmon Run stages
  "sockeye station": "sockeye_station",
  "gone fission hydroplant": "gone_fission_hydroplant",
  "spawning grounds": "spawning_grounds",
  "marooner's bay": "marooners_bay",
  "marooners bay": "marooners_bay",
  "jammin' salmon junction": "jammin_salmon_junction",
  "jammin salmon junction": "jammin_salmon_junction",
  "salmonid smokeyard": "salmonid_smokeyar",
  "salmonid smokeyar": "salmonid_smokeyar",
  "bonerattle arena": "bonerattle_arena",

  // Additional variations and potential new stages
  "grand splatlands bowl": "grand_splatlands_bowl",
  "splatlands bowl": "grand_splatlands_bowl"
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
 * Get stage image ID from stage name with enhanced error handling
 * Uses automatic normalization for new stages, with legacy mapping fallback
 * @param {string} stageName The stage name to convert
 * @returns {string} The stage ID for use in image paths
 */
function getStageId(stageName) {
  if (!stageName) {
    console.warn('getStageId called with empty/null stage name');
    return 'unknown_stage';
  }

  const lowerName = stageName.toLowerCase().trim();

  // 1. Check legacy mapping first (for exact matches)
  if (stageIdMapping[lowerName]) {
    return stageIdMapping[lowerName];
  }

  // 2. Use automatic normalizer
  const normalizedId = normalizeStageId(stageName);

  // 3. Check for override (edge cases)
  if (stageIdOverrides[normalizedId]) {
    return stageIdOverrides[normalizedId];
  }

  // 4. Try legacy mapping with common variations (fallback)
  const variations = [
    lowerName.replace(/'/g, ''),
    lowerName.replace(/'/g, ''),
    lowerName.replace(/-/g, ' '),
    lowerName.replace(/\s+/g, ' '),
    lowerName.replace(/&/g, 'and'),
  ];

  for (const variation of variations) {
    if (stageIdMapping[variation]) {
      console.log(`Stage "${stageName}" matched via variation: "${variation}"`);
      return stageIdMapping[variation];
    }
  }

  // 5. Return normalized ID (works for most new stages automatically!)
  console.log(`Stage "${stageName}" auto-normalized to: "${normalizedId}"`);
  return normalizedId;
}

// Export utilities
const Utils = {
  API,
  stageIdMapping,
  stageIdOverrides,
  normalizeStageId,
  formatTime,
  formatTimeRange,
  getStageId
};

// Make utils available in different contexts
if (typeof window !== 'undefined') {
  window.Utils = Utils;
} else if (typeof self !== 'undefined') {
  self.Utils = Utils;
} 