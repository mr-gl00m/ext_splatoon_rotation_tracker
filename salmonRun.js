/**
 * Splatoon 3 Salmon Run Data Handler
 * This module processes Salmon Run data from the shared API response.
 */

// Ensure utils are available
if (typeof Utils === 'undefined') {
  try {
    importScripts('utils.js');
  } catch (e) {
    // In popup context, this will be loaded by popup.html
    console.log('Utils will be loaded by popup.html');
  }
}

/**
 * Process the raw API data to extract Salmon Run schedules
 * @param {Object} data Raw API data
 * @returns {Object} Object containing current and next salmon run rotations
 */
function processSalmonRunData(data) {
  if (!data?.data?.coopGroupingSchedule) {
    console.error("Invalid Salmon Run data format: coopGroupingSchedule missing");
    return null;
  }

  const now = new Date();
  console.log("Processing Salmon Run data with current time:", now.toISOString());

  let allSchedules = [];

  // +++ REFACTOR: Combine all schedule types into one list first for easier processing.
  
  // 1. Add Big Run schedules
  const bigRunNodes = data.data.coopGroupingSchedule.bigRunSchedules?.nodes || [];
  for (const schedule of bigRunNodes) {
    if (!schedule?.startTime || !schedule?.endTime) continue;

    const setting = schedule.setting;
    allSchedules.push({
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      stage: {
        name: setting?.coopStage?.name || "Unknown Stage",
        image: setting?.coopStage?.image?.url || null
      },
      weapons: (setting?.weapons || []).map(w => ({
        name: w?.name || "Unknown Weapon",
        image: w?.image?.url || null
      })),
      boss: setting?.boss?.name || null,
      bossImage: setting?.boss?.image?.url || null,
      isBigRun: true
    });
  }

  // 2. Add regular schedules
  const regularNodes = data.data.coopGroupingSchedule.regularSchedules?.nodes || [];
  for (const schedule of regularNodes) {
    if (!schedule?.startTime || !schedule?.endTime) continue;

    const setting = schedule.setting;
    allSchedules.push({
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      stage: {
        name: setting?.coopStage?.name || "Unknown Stage",
        image: setting?.coopStage?.image?.url || null
      },
      weapons: (setting?.weapons || []).map(w => ({
        name: w?.name || "Unknown Weapon",
        image: w?.image?.url || null
      })),
      boss: setting?.boss?.name || null,
      bossImage: setting?.boss?.image?.url || null,
      isBigRun: false
    });
  }

  // 3. Sort all schedules by start time
  allSchedules.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  let current = null;
  let next = null;
  const nowMs = now.getTime();

  // 4. Find current and next from the unified list
  for (const schedule of allSchedules) {
    const startMs = new Date(schedule.startTime).getTime();
    const endMs = new Date(schedule.endTime).getTime();

    if (startMs <= nowMs && endMs > nowMs) {
      current = schedule;
    } else if (startMs > nowMs) {
      // The first one we find that starts in the future is our "next"
      if (!next) {
        next = schedule;
      }
      // Since the list is sorted, we can break after finding the next one.
      else { 
        break; 
      }
    }
  }

  // Either may be null — that's a legitimate state (no current or no upcoming).
  // The popup renders an empty state from null.
  return { current, next };
}

// Export the module
const SalmonRun = {
  processSalmonRunData
};

// Make SalmonRun available in different contexts
if (typeof window !== 'undefined') {
  window.SalmonRun = SalmonRun;
} else if (typeof self !== 'undefined') {
  self.SalmonRun = SalmonRun;
}