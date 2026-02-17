/**
 * Splatoon 3 Rotation Tracker - Background Service Worker
 * Handles data fetching, storage and notifications
 */

importScripts('utils.js', 'salmonRun.js');

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Splatoon Tracker extension installed/updated:', details.reason);

  // Only set default settings on fresh install, not on update
  if (details.reason === 'install') {
    // Check if settings already exist (shouldn't on fresh install, but be safe)
    const existing = await chrome.storage.sync.get(['enableNotifications']);
    if (existing.enableNotifications === undefined) {
      console.log('Setting default notification settings (fresh install)');
      await chrome.storage.sync.set({
        'enableNotifications': false,
        'notifyRegular': false,
        'notifyAnarchy': false,
        'notifyXbattle': false,
        'notifySalmon': false
      });
    }
  }

  // Initial data fetch with a small delay to ensure everything is loaded
  setTimeout(fetchAllData, 2000);
});

// Listen for alarm - handles both smart refresh and fallback periodic refresh
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshRotations' || alarm.name === 'smartRefresh') {
    console.log(`Alarm triggered: ${alarm.name}`);
    fetchAllData();
  }
});

/**
 * Schedule the next smart refresh based on rotation end times
 * @param {Object} rotationData The current rotation data
 */
function scheduleNextRefresh(rotationData) {
  const now = Date.now();
  let nextRefreshTime = null;

  // Find the earliest end time among all current rotations
  const modes = ['regular', 'anarchy', 'xbattle', 'challenge', 'salmon'];

  for (const mode of modes) {
    const current = rotationData?.[mode]?.current;
    if (current?.endTime) {
      const endTime = new Date(current.endTime).getTime();
      // Schedule refresh 1 minute after rotation ends
      const refreshTime = endTime + (1 * 60 * 1000);

      if (refreshTime > now && (!nextRefreshTime || refreshTime < nextRefreshTime)) {
        nextRefreshTime = refreshTime;
      }
    }
  }

  // Clear any existing smart refresh alarm
  chrome.alarms.clear('smartRefresh');

  if (nextRefreshTime) {
    const delayMinutes = (nextRefreshTime - now) / (60 * 1000);
    console.log(`Scheduling smart refresh in ${delayMinutes.toFixed(1)} minutes (at ${new Date(nextRefreshTime).toLocaleTimeString()})`);
    chrome.alarms.create('smartRefresh', { when: nextRefreshTime });
  } else {
    // Fallback: if we can't determine the next refresh time, use periodic refresh
    console.log('No valid end time found, falling back to periodic refresh');
    chrome.alarms.create('refreshRotations', { delayInMinutes: Utils.API.REFRESH_INTERVAL });
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchRotations') {
    fetchAllData()
      .then(success => sendResponse({ success }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicates async response
  }
});

/**
 * Fetch the shared API data once and process both battle and Salmon Run data
 * @returns {Promise<boolean>} Success status
 */
async function fetchAllData() {
  console.log('--- Starting data fetch cycle ---');
  try {
    // Get the state of data *before* the fetch cycle.
    const result = await chrome.storage.local.get(['rotationData', 'lastUpdated']);
    const oldRotationData = result.rotationData || null;

    // Single API fetch - shared by all processors
    const response = await fetch(Utils.API.SCHEDULES);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const apiData = await response.json();

    // Process both from the same response - no duplicate network requests
    const battleData = processRotationData(apiData) || createTestData();
    const salmonData = SalmonRun.processSalmonRunData(apiData) || SalmonRun.createSalmonRunTestData();

    // Merge the results into a single, new data object.
    const newRotationData = {
      ...battleData, // Contains regular, anarchy, xbattle
      salmon: salmonData  // Contains current, next for salmon
    };

    // Perform a single write to storage.
    await chrome.storage.local.set({
      'rotationData': newRotationData,
      'lastUpdated': new Date().toISOString(),
      'isOffline': false
    });
    console.log('All rotation data updated successfully in a single operation.');

    // Schedule the next smart refresh based on rotation end times
    scheduleNextRefresh(newRotationData);

    // Now, compare the old and new data for notifications.
    if (newRotationData) {
      await sendRotationNotifications(newRotationData, oldRotationData);
    }

    return true;
  } catch (error) {
    console.error("Error in fetchAllData cycle:", error);

    // Stale-while-revalidate: Check if we have valid cached data
    const cached = await chrome.storage.local.get(['rotationData', 'lastUpdated']);
    if (cached.rotationData && isDataStillValid(cached.rotationData)) {
      console.log('Network failed, using cached data (stale-while-revalidate)');
      await chrome.storage.local.set({ 'isOffline': true });
      // Schedule a retry in 5 minutes
      chrome.alarms.create('refreshRotations', { delayInMinutes: 5 });
      return true; // Data is still usable
    }

    return false;
  }
}

/**
 * Check if cached data is still valid (hasn't fully expired)
 * @param {Object} rotationData The cached rotation data
 * @returns {boolean} Whether the data is still valid
 */
function isDataStillValid(rotationData) {
  const now = Date.now();

  // Check if any current rotation hasn't ended yet
  const modes = ['regular', 'anarchy', 'xbattle', 'salmon'];
  for (const mode of modes) {
    const current = rotationData?.[mode]?.current;
    if (current?.endTime) {
      const endTime = new Date(current.endTime).getTime();
      if (endTime > now) {
        return true; // At least one rotation is still valid
      }
    }
  }

  // Also check "next" rotations - if they exist and haven't started yet, data is useful
  for (const mode of modes) {
    const next = rotationData?.[mode]?.next;
    if (next?.startTime) {
      return true; // We have upcoming rotation data
    }
  }

  return false;
}

/**
 * Validate that the API response has the expected structure
 * @param {Object} data Raw API data
 * @returns {boolean} Whether the data structure is valid
 */
function validateApiResponse(data) {
  if (!data?.data) {
    console.error('API validation failed: missing data root');
    return false;
  }

  const d = data.data;
  const scheduleKeys = ['regularSchedules', 'bankaraSchedules', 'xSchedules'];
  for (const key of scheduleKeys) {
    if (d[key] && !Array.isArray(d[key].nodes)) {
      console.error(`API validation failed: ${key}.nodes is not an array`);
      return false;
    }
  }

  if (d.coopGroupingSchedule) {
    const coopKeys = ['regularSchedules', 'bigRunSchedules'];
    for (const key of coopKeys) {
      if (d.coopGroupingSchedule[key] && !Array.isArray(d.coopGroupingSchedule[key].nodes)) {
        console.error(`API validation failed: coopGroupingSchedule.${key}.nodes is not an array`);
        return false;
      }
    }
  }

  return true;
}

/**
 * Process raw API data into structured rotation information
 * @param {Object} data Raw API data
 * @returns {Object|null} Processed rotation data or null on error
 */
function processRotationData(data) {
  if (!validateApiResponse(data)) return null;

  const now = new Date();
  const result = {
    regular: { current: null, next: null },
    anarchy: { current: null, next: null },
    xbattle: { current: null, next: null },
    challenge: { current: null, next: null },
    splatfest: null
  };

  try {
    if (data.data.regularSchedules?.nodes) {
      result.regular = findCurrentAndNext(data.data.regularSchedules.nodes, now, 'regular');
    }

    if (data.data.bankaraSchedules?.nodes) {
      result.anarchy = findCurrentAndNextAnarchy(data.data.bankaraSchedules.nodes, now);
    }

    if (data.data.xSchedules?.nodes) {
      result.xbattle = findCurrentAndNext(data.data.xSchedules.nodes, now, 'xbattle');
    }

    // Process Challenge/Event schedules
    if (data.data.eventSchedules?.nodes) {
      result.challenge = processEventSchedules(data.data.eventSchedules.nodes, now);
    }

    // Process Splatfest data
    result.splatfest = processSplatfestData(data.data);

    return result;
  } catch (error) {
    console.error('Error processing rotation data:', error);
    return null;
  }
}

/**
 * Find current and next rotation from a list of rotation nodes
 * @param {Array} nodes List of rotation nodes from API
 * @param {Date} now Current time
 * @param {string} mode Game mode (regular, anarchy, xbattle)
 * @returns {Object} Object with current and next rotation
 */
function findCurrentAndNext(nodes, now, mode) {
  let current = null;
  let next = null;
  
  if (!nodes?.length) return { current, next };
  
  // Sort by start time to simplify the logic
  const sortedNodes = [...nodes].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  
  const nowMs = now.getTime();
  
  for (const node of sortedNodes) {
    try {
      if (!node.startTime || !node.endTime) continue;
      
      const startTime = new Date(node.startTime);
      const endTime = new Date(node.endTime);
      const startMs = startTime.getTime();
      const endMs = endTime.getTime();
      
      // Extract rule and stages based on the mode
      let rule = { name: 'Unknown Mode' };
      let stages = [];

      if (mode === 'regular' && node.regularMatchSetting) {
        rule = node.regularMatchSetting.vsRule || rule;
        stages = (node.regularMatchSetting.vsStages || []).map(stage => ({
          name: stage.name,
          image: stage.image?.url || null
        }));
      } else if (mode === 'xbattle' && node.xMatchSetting) {
        rule = node.xMatchSetting.vsRule || rule;
        stages = (node.xMatchSetting.vsStages || []).map(stage => ({
          name: stage.name,
          image: stage.image?.url || null
        }));
      }
      
      const processedNode = {
        startTime: node.startTime,
        endTime: node.endTime,
        rule: rule,
        stages: stages
      };
      
      // Current rotation is the one that spans the current time
      if (startMs <= nowMs && endMs > nowMs) {
        current = processedNode;
      } 
      // Next rotation is the earliest one that starts after now
      else if (startMs > nowMs && (!next || startMs < new Date(next.startTime).getTime())) {
        next = processedNode;
      }
    } catch (error) {
      console.error(`Error processing ${mode} node:`, error);
    }
  }
  
  return { current, next };
}

/**
 * Extract stages from a bankara match setting
 * @param {Object} setting Match setting object
 * @returns {Object} Extracted rule and stages
 */
function extractAnarchyMode(setting) {
  if (!setting) return null;
  return {
    rule: setting.vsRule || { name: 'Unknown Mode' },
    stages: (setting.vsStages || []).map(stage => ({
      name: stage.name,
      image: stage.image?.url || null
    }))
  };
}

/**
 * Find current and next Anarchy rotations with both Series and Open modes
 * @param {Array} nodes List of rotation nodes from API
 * @param {Date} now Current time
 * @returns {Object} Object with current and next rotation (each containing series and open)
 */
function findCurrentAndNextAnarchy(nodes, now) {
  let current = null;
  let next = null;

  if (!nodes?.length) return { current, next };

  const sortedNodes = [...nodes].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const nowMs = now.getTime();

  for (const node of sortedNodes) {
    try {
      if (!node.startTime || !node.endTime) continue;

      const startMs = new Date(node.startTime).getTime();
      const endMs = new Date(node.endTime).getTime();

      const series = extractAnarchyMode(node.bankaraMatchSettings?.[0]);
      const open = extractAnarchyMode(node.bankaraMatchSettings?.[1]);

      const processedNode = {
        startTime: node.startTime,
        endTime: node.endTime,
        // Primary display uses Series data
        rule: series?.rule || open?.rule || { name: 'Unknown Mode' },
        stages: series?.stages || open?.stages || [],
        // Both sub-modes available
        series: series,
        open: open
      };

      if (startMs <= nowMs && endMs > nowMs) {
        current = processedNode;
      } else if (startMs > nowMs && (!next || startMs < new Date(next.startTime).getTime())) {
        next = processedNode;
      }
    } catch (error) {
      console.error('Error processing anarchy node:', error);
    }
  }

  return { current, next };
}

/**
 * Process event/challenge schedule data
 * @param {Array} nodes Event schedule nodes from API
 * @param {Date} now Current time
 * @returns {Object} Current and next challenge events
 */
function processEventSchedules(nodes, now) {
  let current = null;
  let next = null;
  const nowMs = now.getTime();

  for (const event of nodes) {
    const setting = event.leagueMatchSetting;
    if (!setting?.leagueMatchEvent) continue;

    const eventInfo = setting.leagueMatchEvent;
    const timePeriods = event.timePeriods || [];

    const rule = setting.vsRule || { name: 'Unknown Mode' };
    const stages = (setting.vsStages || []).map(s => ({
      name: s.name,
      image: s.image?.url || null
    }));

    for (const period of timePeriods) {
      if (!period.startTime || !period.endTime) continue;

      const startMs = new Date(period.startTime).getTime();
      const endMs = new Date(period.endTime).getTime();

      const processedEvent = {
        startTime: period.startTime,
        endTime: period.endTime,
        eventName: eventInfo.name || 'Unknown Event',
        eventDesc: eventInfo.desc || '',
        regulation: eventInfo.regulation || '',
        rule: rule,
        stages: stages
      };

      if (startMs <= nowMs && endMs > nowMs && !current) {
        current = processedEvent;
      } else if (startMs > nowMs && (!next || startMs < new Date(next.startTime).getTime())) {
        next = processedEvent;
      }
    }
  }

  return { current, next };
}

/**
 * Process Splatfest data from API response
 * @param {Object} apiDataRoot The data.data object from the API
 * @returns {Object|null} Splatfest info or null if none active/upcoming
 */
function processSplatfestData(apiDataRoot) {
  // Check for currently active Splatfest
  const currentFest = apiDataRoot.currentFest;
  if (currentFest) {
    return {
      title: currentFest.title || 'Splatfest',
      state: currentFest.state || 'ACTIVE',
      startTime: currentFest.startTime,
      endTime: currentFest.endTime,
      teams: (currentFest.teams || []).map(t => ({
        teamName: t.teamName,
        color: t.color ? `rgba(${Math.round(t.color.r * 255)}, ${Math.round(t.color.g * 255)}, ${Math.round(t.color.b * 255)}, ${t.color.a})` : null,
        image: t.image?.url || null
      }))
    };
  }

  // Check festSchedules for upcoming Splatfest periods with active settings
  const festNodes = apiDataRoot.festSchedules?.nodes || [];
  for (const node of festNodes) {
    if (node.festMatchSettings && new Date(node.startTime).getTime() > Date.now()) {
      return {
        title: 'Upcoming Splatfest',
        state: 'SCHEDULED',
        startTime: node.startTime,
        endTime: node.endTime,
        teams: []
      };
    }
  }

  return null;
}

/**
 * Create test data as fallback if API fails
 * @returns {Object} Generated rotation data
 */
function createTestData() {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  
  return {
    regular: {
      current: {
        startTime: now.toISOString(),
        endTime: twoHoursLater.toISOString(),
        rule: { name: "Turf War" },
        stages: [{ name: "Scorch Gorge" }, { name: "Mahi-Mahi Resort" }]
      },
      next: {
        startTime: twoHoursLater.toISOString(),
        endTime: fourHoursLater.toISOString(),
        rule: { name: "Turf War" },
        stages: [{ name: "Hagglefish Market" }, { name: "MakoMart" }]
      }
    },
    anarchy: {
      current: {
        startTime: now.toISOString(),
        endTime: twoHoursLater.toISOString(),
        rule: { name: "Splat Zones" },
        stages: [{ name: "Mincemeat Metalworks" }, { name: "Undertow Spillway" }]
      },
      next: {
        startTime: twoHoursLater.toISOString(),
        endTime: fourHoursLater.toISOString(),
        rule: { name: "Tower Control" },
        stages: [{ name: "Hammerhead Bridge" }, { name: "Museum d'Alfonsino" }]
      }
    },
    xbattle: {
      current: {
        startTime: now.toISOString(),
        endTime: twoHoursLater.toISOString(),
        rule: { name: "Clam Blitz" },
        stages: [{ name: "Inkblot Art Academy" }, { name: "Sturgeon Shipyard" }]
      },
      next: {
        startTime: twoHoursLater.toISOString(),
        endTime: fourHoursLater.toISOString(),
        rule: { name: "Rainmaker" },
        stages: [{ name: "Eeltail Alley" }, { name: "Wahoo World" }]
      }
    }
  };
}

/**
 * Compares new and old rotation data and sends notifications for changes.
 * @param {Object} newRotations The latest, complete rotation data.
 * @param {Object|null} oldRotations The data from before the fetch cycle began.
 */
async function sendRotationNotifications(newRotations, oldRotations) {
  const settings = await chrome.storage.sync.get([
    'enableNotifications', 'notifyRegular', 'notifyAnarchy', 'notifyXbattle', 'notifySalmon'
  ]);

  if (!settings.enableNotifications) {
    console.log("Notifications are disabled globally.");
    return;
  }

  const modes = [
    { key: 'regular', name: 'Regular', setting: 'notifyRegular' },
    { key: 'anarchy', name: 'Anarchy', setting: 'notifyAnarchy' },
    { key: 'xbattle', name: 'X Battle', setting: 'notifyXbattle' },
    { key: 'salmon', name: 'Salmon Run', setting: 'notifySalmon' }
  ];

  const isNewRotation = (newCurrent, oldCurrent) => {
    if (!newCurrent) return false;
    if (!oldCurrent) return true;
    return newCurrent.startTime !== oldCurrent.startTime;
  };

  for (const modeInfo of modes) {
    const newCurrent = newRotations[modeInfo.key]?.current;
    const oldCurrent = oldRotations?.[modeInfo.key]?.current;

    if (settings[modeInfo.setting] && isNewRotation(newCurrent, oldCurrent)) {
      let title = `New ${modeInfo.name} Rotation!`;
      let message;

      if (modeInfo.key === 'salmon') {
        message = `Stage: ${newCurrent.stage?.name || 'N/A'}`;
        if (newCurrent.isBigRun) title = `BIG RUN IS HERE!`;
      } else {
        message = `Mode: ${newCurrent.rule?.name || 'N/A'}\nStages: ${newCurrent.stages?.map(s => s.name).join(', ') || 'N/A'}`;
      }

      const notificationId = `rotation-${modeInfo.key}-${newCurrent.startTime}`;

      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: title,
        message: message,
        priority: 1
      });
      console.log(`Notification sent for ${modeInfo.name}`);
    }
  }
}