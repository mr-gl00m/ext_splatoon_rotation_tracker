/**
 * Splatoon 3 Rotation Tracker - Popup UI Handler
 */

document.addEventListener('DOMContentLoaded', function() {
  // Elements cache
  const elements = {
    container: document.querySelector('.container'),
    title: document.querySelector('.header h1'),
    currentRotation: document.getElementById('current-rotation'),
    nextRotation: document.getElementById('next-rotation'),
    lastUpdated: document.getElementById('last-updated'),
    refreshBtn: document.getElementById('refresh-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    footer: document.querySelector('.footer'),
    
    // Notification checkboxes
    notificationsCheckbox: document.getElementById('enable-notifications'),
    notifyRegularCheckbox: document.getElementById('notify-regular'),
    notifyAnarchyCheckbox: document.getElementById('notify-anarchy'),
    notifyXbattleCheckbox: document.getElementById('notify-xbattle'),
    notifySalmonCheckbox: document.getElementById('notify-salmon'),

    // Splatfest banner
    splatfestBanner: document.getElementById('splatfest-banner')
  };
  
  // Current selected game mode
  let currentMode = 'regular';
  let isFirstLoad = true;
  let countdownTimeout = null;
  let refreshCooldownInterval = null;
  let hasTriggeredAutoRefresh = false;
  let isRefreshing = false;
  
  // Add decorative elements
  addDecorativeElements();
  
  // Add link to title
  if (elements.title) {
    elements.title.style.cursor = 'pointer';
    elements.title.title = 'Visit splatoon3.ink';
    elements.title.addEventListener('click', function() {
      chrome.tabs.create({ url: 'https://splatoon3.ink' });
    });
  }
  
  // Add icon to footer
  const iconImg = document.createElement('img');
  iconImg.src = 'images/icon16.png';
  iconImg.style.width = '16px';
  iconImg.style.height = '16px';
  iconImg.style.verticalAlign = 'middle';
  iconImg.style.marginRight = '5px';
  iconImg.title = 'Splatoon 3 Rotation Tracker';
  if (elements.footer) {
    elements.footer.querySelector('p').prepend(iconImg);
  }
  
  // Initialize - restore last tab, load settings, then display data
  (async () => {
    await restoreLastTab();
    await loadSettings();
    displayRotationData();
  })();
  
  // Event listeners
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', refreshData);
  }
  
  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener('click', function() {
      if (elements.settingsPanel) {
        elements.settingsPanel.classList.add('visible');
      }
    });
  }
  
  if (elements.closeSettingsBtn) {
    elements.closeSettingsBtn.addEventListener('click', function() {
      if (elements.settingsPanel) {
        elements.settingsPanel.classList.remove('visible');
      }
    });
  }
  

  
  // Handle tab buttons
  elements.tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      currentMode = this.dataset.mode;

      // Update active state
      elements.tabButtons.forEach(btn => btn.classList.remove('active'));
      this.classList.add('active');

      // Update background with ink transition
      if (elements.container) {
        const splash = document.createElement('div');
        splash.className = 'ink-splash';
        elements.container.appendChild(splash);
        splash.addEventListener('animationend', () => splash.remove());
      }
      updateBackgroundForMode(currentMode);

      // Persist tab selection
      chrome.storage.local.set({ lastTab: currentMode });

      // Re-display data for the new mode
      displayRotationData();
    });
  });
  
  // Notification settings listeners
  if (elements.notificationsCheckbox) {
    elements.notificationsCheckbox.addEventListener('change', function() {
      const checked = this.checked;
      setModeTogglesDisabled(!checked);
      saveNotificationSettings();
    });
  }
  
  const notifyCheckboxes = [
    elements.notifyRegularCheckbox,
    elements.notifyAnarchyCheckbox,
    elements.notifyXbattleCheckbox,
    elements.notifySalmonCheckbox
  ];
  
  notifyCheckboxes.forEach(checkbox => {
    if (checkbox) {
      checkbox.addEventListener('change', saveNotificationSettings);
    }
  });
  
  /**
   * Add decorative elements to the popup
   */
  function addDecorativeElements() {
    // Create ink splatter effects
    const inkSplat1 = document.createElement('div');
    inkSplat1.className = 'ink-splat ink-splat-1';
    
    const inkSplat2 = document.createElement('div');
    inkSplat2.className = 'ink-splat ink-splat-2';
    
    // Add squids
    const squid1 = document.createElement('div');
    squid1.className = 'squid squid-1';
    
    const squid2 = document.createElement('div');
    squid2.className = 'squid squid-2';
    
    // Add all decorative elements to container
    if (elements.container) {
      elements.container.appendChild(inkSplat1);
      elements.container.appendChild(inkSplat2);
      elements.container.appendChild(squid1);
      elements.container.appendChild(squid2);
    }
  }
  
  /**
   * Safely set a message inside a container using DOM methods (no innerHTML)
   * @param {HTMLElement} container The container element
   * @param {string} text The message text
   * @param {string} className CSS class for the message div
   */
  function setMessage(container, text, className) {
    container.textContent = '';
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    container.appendChild(div);
  }

  // Where each mode's stage images live on disk. CSP gates remote loads.
  // The battle modes draw from one identical stage pool, so they all point at
  // shared/; only Salmon Run has a distinct set of stages.
  const STAGE_DIR_BY_MODE = {
    regular: 'shared',
    anarchy: 'shared',
    xbattle: 'shared',
    salmon: 'salmon',
    challenge: 'shared'
  };

  /**
   * Reject API-supplied URLs that aren't HTTPS splatoon3.ink before they
   * touch the DOM. CSP blocks the load anyway; this is defense in depth.
   */
  function safeRemoteUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && parsed.hostname.endsWith('splatoon3.ink')) {
        return parsed.toString();
      }
    } catch { /* malformed URL */ }
    return '';
  }

  /**
   * Build a single stage tile (image + name) for any mode.
   * @param {Object} stageData {name, image} from the rotation
   * @param {string} mode The logical mode (regular/anarchy/xbattle/salmon/challenge)
   */
  function createStageElement(stageData, mode) {
    const stageEl = document.createElement('div');
    stageEl.className = 'stage';

    const stageName = stageData?.name || 'Unknown Stage';
    const stageId = Utils.getStageId(stageName);
    const dir = STAGE_DIR_BY_MODE[mode] || 'shared';

    const imgContainer = document.createElement('div');
    imgContainer.className = 'stage-img-container';

    const img = new Image();
    img.className = 'stage-img';
    img.dataset.stage = stageId;
    img.dataset.mode = mode;
    img.dataset.remoteUrl = safeRemoteUrl(stageData?.image);
    img.alt = stageName;
    img.src = `images/stages/${dir}/${stageId}.jpg`;
    imgContainer.appendChild(img);
    stageEl.appendChild(imgContainer);

    const nameEl = document.createElement('div');
    nameEl.className = 'stage-name';
    nameEl.textContent = stageName;
    stageEl.appendChild(nameEl);

    return stageEl;
  }

  /**
   * Restore the last-selected tab from storage
   */
  async function restoreLastTab() {
    try {
      const data = await chrome.storage.local.get(['lastTab']);
      const validModes = ['regular', 'anarchy', 'xbattle', 'challenge', 'salmon'];
      if (data.lastTab && validModes.includes(data.lastTab)) {
        currentMode = data.lastTab;
        elements.tabButtons.forEach(btn => btn.classList.remove('active'));
        const targetBtn = document.querySelector(`[data-mode="${currentMode}"]`);
        if (targetBtn) targetBtn.classList.add('active');
        updateBackgroundForMode(currentMode);
        isFirstLoad = false;
      }
    } catch (error) {
      console.error('Failed to restore last tab:', error);
    }
  }

  /**
   * Update the Splatfest banner display
   * @param {Object|null} splatfest Splatfest data or null
   */
  function updateSplatfestBanner(splatfest) {
    if (!elements.splatfestBanner) return;

    if (!splatfest) {
      elements.splatfestBanner.style.display = 'none';
      return;
    }

    elements.splatfestBanner.style.display = 'block';
    elements.splatfestBanner.textContent = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'splatfest-title';
    titleEl.textContent = splatfest.title || 'Splatfest';
    elements.splatfestBanner.appendChild(titleEl);

    if (splatfest.teams && splatfest.teams.length > 0) {
      const teamsEl = document.createElement('div');
      teamsEl.className = 'splatfest-teams';
      teamsEl.textContent = splatfest.teams.map(t => t.teamName).join(' vs ');
      elements.splatfestBanner.appendChild(teamsEl);
    }

    if (splatfest.state === 'SCHEDULED' && splatfest.startTime) {
      const timeEl = document.createElement('div');
      timeEl.className = 'splatfest-time';
      timeEl.textContent = `Starts: ${Utils.formatTime(new Date(splatfest.startTime))}`;
      timeEl.style.fontSize = '0.75rem';
      timeEl.style.opacity = '0.8';
      timeEl.style.marginTop = '4px';
      elements.splatfestBanner.appendChild(timeEl);
    }
  }

  /**
   * Update background color based on selected mode
   * @param {string} mode The game mode
   */
  function updateBackgroundForMode(mode) {
    if (!elements.container) return;

    // Remove all mode classes
    elements.container.classList.remove(
      'mode-regular',
      'mode-anarchy',
      'mode-xbattle',
      'mode-salmon',
      'mode-challenge'
    );

    // Add current mode class
    elements.container.classList.add(`mode-${mode}`);
    
    // Transition background
    document.documentElement.style.setProperty(
      '--mode-color', 
      getComputedStyle(document.documentElement).getPropertyValue(`--${mode}-color`)
    );
  }
  
  /**
   * Load notification settings from storage
   */
  async function loadSettings() {
    try {
      // Don't provide defaults - read exactly what's in storage
      const settings = await chrome.storage.sync.get([
        'enableNotifications',
        'notifyRegular',
        'notifyAnarchy',
        'notifyXbattle',
        'notifySalmon'
      ]);

      // Only set checkbox if value exists in storage, otherwise leave unchecked
      if (elements.notificationsCheckbox) {
        elements.notificationsCheckbox.checked = settings.enableNotifications === true;
      }
      if (elements.notifyRegularCheckbox) {
        elements.notifyRegularCheckbox.checked = settings.notifyRegular === true;
      }
      if (elements.notifyAnarchyCheckbox) {
        elements.notifyAnarchyCheckbox.checked = settings.notifyAnarchy === true;
      }
      if (elements.notifyXbattleCheckbox) {
        elements.notifyXbattleCheckbox.checked = settings.notifyXbattle === true;
      }
      if (elements.notifySalmonCheckbox) {
        elements.notifySalmonCheckbox.checked = settings.notifySalmon === true;
      }

      setModeTogglesDisabled(settings.enableNotifications !== true);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }
  
  /**
   * Set disabled state for mode-specific notification toggles
   * @param {boolean} disabled Whether to disable the toggles
   */
  function setModeTogglesDisabled(disabled) {
    [
      elements.notifyRegularCheckbox,
      elements.notifyAnarchyCheckbox,
      elements.notifyXbattleCheckbox,
      elements.notifySalmonCheckbox
    ].forEach(checkbox => {
      if (checkbox) checkbox.disabled = disabled;
    });
  }
  
  /**
   * Save notification settings to storage
   */
  async function saveNotificationSettings() {
    const settings = {
      enableNotifications: elements.notificationsCheckbox?.checked || false,
      notifyRegular: elements.notifyRegularCheckbox?.checked || false,
      notifyAnarchy: elements.notifyAnarchyCheckbox?.checked || false,
      notifyXbattle: elements.notifyXbattleCheckbox?.checked || false,
      notifySalmon: elements.notifySalmonCheckbox?.checked || false
    };
    
    try {
      await chrome.storage.sync.set(settings);
      console.log('Notification settings saved');
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    }
  }
  
  /**
   * Display rotation data for the current mode
   */
  async function displayRotationData() {
    try {
      const data = await chrome.storage.local.get(['rotationData', 'lastUpdated', 'isOffline']);

      // Update last updated time with offline indicator
      if (data.lastUpdated) {
        const timeText = Utils.formatTime(new Date(data.lastUpdated));
        if (data.isOffline) {
          elements.lastUpdated.textContent = '';
          const span = document.createElement('span');
          span.className = 'offline-indicator';
          span.textContent = '⚠ Offline ';
          elements.lastUpdated.appendChild(span);
          elements.lastUpdated.appendChild(document.createTextNode(timeText));
        } else {
          elements.lastUpdated.textContent = timeText;
        }
      } else {
        elements.lastUpdated.textContent = 'Never';
      }

      // Display Splatfest banner if applicable
      updateSplatfestBanner(data.rotationData?.splatfest || null);

      // Display rotation data
      if (data.rotationData) {
        updateRotationDisplay(data.rotationData);
      } else {
        showLoadingState();
      }
    } catch (error) {
      console.error('Failed to display rotation data:', error);
      showLoadingState();
    }
  }
  
  /**
   * Show skeleton loading state in the UI
   */
  function showLoadingState() {
    [elements.currentRotation, elements.nextRotation].forEach(container => {
      container.textContent = '';

      const textShort = document.createElement('div');
      textShort.className = 'skeleton skeleton-text skeleton-text-short';
      container.appendChild(textShort);

      const textMedium = document.createElement('div');
      textMedium.className = 'skeleton skeleton-text skeleton-text-medium';
      container.appendChild(textMedium);

      const stagesEl = document.createElement('div');
      stagesEl.className = 'stages';
      stagesEl.style.display = 'flex';
      stagesEl.style.gap = '10px';

      for (let i = 0; i < 2; i++) {
        const stageEl = document.createElement('div');
        stageEl.className = 'stage';
        stageEl.style.flex = '1';

        const skelImage = document.createElement('div');
        skelImage.className = 'skeleton skeleton-image';
        stageEl.appendChild(skelImage);

        const skelText = document.createElement('div');
        skelText.className = 'skeleton skeleton-text';
        skelText.style.marginTop = '5px';
        stageEl.appendChild(skelText);

        stagesEl.appendChild(stageEl);
      }

      container.appendChild(stagesEl);
    });
  }
  
  /**
   * Refresh data from the API with rate limiting
   */
  async function refreshData(bypassCooldown = false) {
    // Prevent spamming - button is already disabled during cooldown
    // Auto-refresh (rotation end) bypasses cooldown to ensure timely updates
    if (!bypassCooldown && elements.refreshBtn.disabled) return;

    isRefreshing = true;
    showLoadingState();
    elements.refreshBtn.disabled = true;
    elements.refreshBtn.textContent = 'Refreshing...';

    try {
      const response = await chrome.runtime.sendMessage({ action: 'fetchRotations' });
      if (response?.success) {
        hasTriggeredAutoRefresh = false;
        await displayRotationData();
        startRefreshCooldown(30);
      } else {
        throw new Error(response?.error || 'Unknown error during refresh.');
      }
    } catch (error) {
      console.error("Failed to refresh data:", error);
      isRefreshing = false;
      setMessage(elements.currentRotation, 'Failed to refresh data', 'error');
      setMessage(elements.nextRotation, 'Please try again later', 'error');
      elements.refreshBtn.disabled = false;
      elements.refreshBtn.textContent = 'Refresh Now';
    }
  }

  /**
   * Start a cooldown period on the refresh button
   * @param {number} seconds Cooldown duration in seconds
   */
  function startRefreshCooldown(seconds) {
    let remaining = seconds;
    elements.refreshBtn.disabled = true;
    elements.refreshBtn.textContent = `Refresh (${remaining}s)`;

    if (refreshCooldownInterval) clearInterval(refreshCooldownInterval);

    refreshCooldownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(refreshCooldownInterval);
        refreshCooldownInterval = null;
        elements.refreshBtn.disabled = false;
        elements.refreshBtn.textContent = 'Refresh Now';
      } else {
        elements.refreshBtn.textContent = `Refresh (${remaining}s)`;
      }
    }, 1000);
  }
  
  /**
   * Update rotation display with data
   * @param {Object} data Rotation data
   */
  function updateRotationDisplay(data) {
    const modeData = data[currentMode];
    
    if (!modeData) {
      setMessage(elements.currentRotation, 'No data available', 'error');
      setMessage(elements.nextRotation, 'No data available', 'error');
      return;
    }
    
    // Update the background on first load
    if (isFirstLoad) {
      updateBackgroundForMode(currentMode);
      isFirstLoad = false;
    }
    
    // Clear previous content
    elements.currentRotation.textContent = '';
    elements.nextRotation.textContent = '';
    
    // Show current rotation
    if (modeData.current) {
      const rotationElement = createRotationElement(modeData.current, currentMode, true);
      elements.currentRotation.appendChild(rotationElement);
    } else {
      setMessage(elements.currentRotation, 'No current rotation found', 'no-data');
    }

    // Show next rotation
    if (modeData.next) {
      const rotationElement = createRotationElement(modeData.next, currentMode, false);
      elements.nextRotation.appendChild(rotationElement);
    } else {
      setMessage(elements.nextRotation, 'No upcoming rotation found', 'no-data');
    }

    // Load stage images with remote fallback (rule icons are emitted inline)
    loadStageImages();

    // Flash effect only on actual data refresh, not tab switches
    if (isRefreshing) {
      isRefreshing = false;
      [elements.currentRotation, elements.nextRotation].forEach(el => {
        el.classList.add('refresh-flash');
        setTimeout(() => el.classList.remove('refresh-flash'), 600);
      });
    }

    // Start countdown timer
    startCountdownTimer();
  }
  
  /**
   * Creates and returns a DOM element for a single rotation.
   * @param {Object} rotation - The rotation data.
   * @param {string} mode - The current game mode.
   * @param {boolean} isCurrent - Whether this is the current rotation (for countdown).
   * @returns {DocumentFragment} - A fragment containing the rotation's DOM nodes.
   */
  function createRotationElement(rotation, mode, isCurrent = false) {
    const fragment = document.createDocumentFragment();

    // Time range with countdown
    const timeRangeEl = document.createElement('div');
    timeRangeEl.className = 'time-range';

    const timeTextEl = document.createElement('span');
    timeTextEl.textContent = Utils.formatTimeRange(rotation.startTime, rotation.endTime);
    timeRangeEl.appendChild(timeTextEl);

    // Add countdown
    const countdownEl = document.createElement('span');
    countdownEl.className = 'countdown';
    if (isCurrent) {
      countdownEl.dataset.endTime = rotation.endTime;
    } else {
      countdownEl.dataset.startTime = rotation.startTime;
    }
    timeRangeEl.appendChild(countdownEl);

    fragment.appendChild(timeRangeEl);

    if (mode === 'challenge') {
      // Challenge/Event mode
      if (rotation.eventName) {
        const eventNameEl = document.createElement('div');
        eventNameEl.className = 'event-name';
        eventNameEl.textContent = rotation.eventName;
        fragment.appendChild(eventNameEl);
      }

      if (rotation.eventDesc) {
        const eventDescEl = document.createElement('div');
        eventDescEl.className = 'event-desc';
        eventDescEl.textContent = rotation.eventDesc;
        fragment.appendChild(eventDescEl);
      }

      fragment.appendChild(createRuleNameElement(rotation.rule?.name || 'Unknown Mode'));

      const stagesEl = document.createElement('div');
      stagesEl.className = 'stages';
      (rotation.stages || []).forEach(stageData => {
        stagesEl.appendChild(createStageElement(stageData, 'challenge'));
      });
      fragment.appendChild(stagesEl);
    } else if (mode === 'salmon') {
      // Salmon Run: single stage, plus weapons + king salmonid
      const modeInfoEl = document.createElement('div');
      modeInfoEl.className = 'mode-info';

      if (rotation.isBigRun) {
        const bigRunBadge = document.createElement('div');
        bigRunBadge.className = 'big-run-badge';
        bigRunBadge.textContent = 'Big Run';
        modeInfoEl.appendChild(bigRunBadge);
      }

      modeInfoEl.appendChild(createRuleNameElement('Salmon Run'));
      fragment.appendChild(modeInfoEl);

      fragment.appendChild(createStageElement(rotation.stage, 'salmon'));

      // Create weapons section with images
      const weaponsEl = document.createElement('div');
      weaponsEl.className = 'salmon-weapons';

      const weapons = rotation.weapons || [];
      if (weapons.length > 0) {
        weapons.forEach(weapon => {
          const weaponName = (typeof weapon === 'object' && weapon !== null) ? weapon.name : weapon;
          const weaponImage = (typeof weapon === 'object' && weapon !== null) ? weapon.image : null;

          const weaponEl = document.createElement('div');
          weaponEl.className = 'weapon';

          if (weaponImage) {
            const weaponImg = new Image();
            weaponImg.className = 'weapon-img';
            weaponImg.src = weaponImage;
            weaponImg.alt = weaponName || 'Weapon';
            weaponImg.onerror = function() {
              // Hide image on error, show text only
              this.style.display = 'none';
            };
            weaponEl.appendChild(weaponImg);
          }

          const weaponNameEl = document.createElement('span');
          weaponNameEl.className = 'weapon-name';
          weaponNameEl.textContent = weaponName || 'Unknown';
          weaponEl.appendChild(weaponNameEl);

          weaponsEl.appendChild(weaponEl);
        });
      } else {
        const noWeaponEl = document.createElement('div');
        noWeaponEl.className = 'weapon';
        noWeaponEl.textContent = 'No weapon data';
        weaponsEl.appendChild(noWeaponEl);
      }

      fragment.appendChild(weaponsEl);

      // Add King Salmonid (Boss) display if available
      if (rotation.boss) {
        const bossEl = document.createElement('div');
        bossEl.className = 'salmon-boss';

        const bossLabel = document.createElement('span');
        bossLabel.className = 'boss-label';
        bossLabel.textContent = 'King Salmonid: ';
        bossEl.appendChild(bossLabel);

        if (rotation.bossImage) {
          const bossImg = new Image();
          bossImg.className = 'boss-img';
          bossImg.src = rotation.bossImage;
          bossImg.alt = rotation.boss;
          bossImg.onerror = function() {
            this.style.display = 'none';
          };
          bossEl.appendChild(bossImg);
        }

        const bossName = document.createElement('span');
        bossName.className = 'boss-name';
        bossName.textContent = rotation.boss;
        bossEl.appendChild(bossName);

        fragment.appendChild(bossEl);
      }
    } else if (mode === 'anarchy' && (rotation.series || rotation.open)) {
      // Anarchy mode - show both Series and Open
      const subModes = [];
      if (rotation.series) subModes.push({ label: 'Series', data: rotation.series });
      if (rotation.open) subModes.push({ label: 'Open', data: rotation.open });

      subModes.forEach(sub => {
        const subSection = document.createElement('div');
        subSection.className = 'anarchy-sub-mode';

        const subLabel = document.createElement('div');
        subLabel.className = 'anarchy-sub-label';
        subLabel.textContent = sub.label;
        subSection.appendChild(subLabel);

        subSection.appendChild(createRuleNameElement(sub.data.rule?.name || 'Unknown Mode'));

        const stagesEl = document.createElement('div');
        stagesEl.className = 'stages';
        (sub.data.stages || []).forEach(stageData => {
          stagesEl.appendChild(createStageElement(stageData, 'anarchy'));
        });
        subSection.appendChild(stagesEl);
        fragment.appendChild(subSection);
      });
    } else {
      // Battle modes (regular, xbattle)
      fragment.appendChild(createRuleNameElement(rotation.rule?.name || 'Unknown Mode'));

      const stagesEl = document.createElement('div');
      stagesEl.className = 'stages';
      (rotation.stages || []).forEach(stageData => {
        stagesEl.appendChild(createStageElement(stageData, mode));
      });
      fragment.appendChild(stagesEl);
    }

    return fragment;
  }
  
  const RULE_ICON_MAP = {
    'turf war':      { cls: 'rule-icon-tw', label: 'TW' },
    'splat zones':   { cls: 'rule-icon-sz', label: 'SZ' },
    'tower control': { cls: 'rule-icon-tc', label: 'TC' },
    'rainmaker':     { cls: 'rule-icon-rm', label: 'RM' },
    'clam blitz':    { cls: 'rule-icon-cb', label: 'CB' }
  };

  /**
   * Build a .rule-name div with the matching rule-type icon prepended.
   */
  function createRuleNameElement(ruleName) {
    const el = document.createElement('div');
    el.className = 'rule-name';
    const iconInfo = RULE_ICON_MAP[ruleName.toLowerCase().trim()];
    if (iconInfo) {
      const icon = document.createElement('span');
      icon.className = `rule-icon ${iconInfo.cls}`;
      icon.textContent = iconInfo.label;
      el.appendChild(icon);
    }
    el.appendChild(document.createTextNode(ruleName));
    return el;
  }

  // Last-resort 1×1 transparent-ish PNG so a broken image never shows the
  // browser's default broken-image glyph.
  const PLACEHOLDER_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABmJLR0QA/wD/AP+gvaeTAAAA30lEQVR4nO3bQQqDMBRAwcbsev9+F92UgimBTCD2zVk8/CJCGgYAAAAAAAD+x3P2AwDSKCRMIWEKCVNImELCFBKmkDCFhCkkTCFhCglTSJhCwhQSppAwhYQpJEwhYQoJU0iYQsIUEqaQMIWEDTP3LnUfbY6/Y+bH6pn7XdvufS9WFPJHrtqfQsIUEqaQMIWEKSRMIWEKCVNImELCFBKmkDCFhO0e+/ed9XPb1b8gCglTSJhCwhQSppAwhYQpJEwhYQoJU0iYQsIUEqaQMIWEKSRMIWEKCVNImELCFBKmEAAAAAAA4GQvNlEPdQq58VQAAAAASUVORK5CYII=';

  /**
   * Walk an ordered fallback chain on each .stage-img: shared dir → validated
   * remote URL → bundled placeholder → inline data URI.
   */
  function loadStageImages() {
    document.querySelectorAll('.stage-img').forEach(img => {
      const stageId = img.dataset.stage;
      const remoteUrl = img.dataset.remoteUrl; // already origin-validated

      const candidates = [];
      // The initial src already targets mode-specific (or shared, for challenge).
      // Only add /shared/ as a fallback if we didn't start there.
      if (!img.src.includes('/shared/')) {
        candidates.push(`images/stages/shared/${stageId}.jpg`);
      }
      if (remoteUrl) candidates.push(remoteUrl);
      candidates.push('images/stages/placeholder.jpg');
      candidates.push(PLACEHOLDER_DATA_URI);

      let idx = 0;
      img.onerror = function() {
        if (idx >= candidates.length) {
          console.warn(`All image fallbacks failed for stage: ${stageId}`);
          this.title = `Image not available for ${stageId}`;
          this.onerror = null;
          return;
        }
        this.src = candidates[idx++];
      };
    });
  }

  /**
   * Start/restart the countdown timer. Self-reschedules: per-second when the
   * shortest visible countdown is under an hour (so "Xm Ys" stays smooth),
   * once per minute otherwise (h+m display has nothing finer to update).
   */
  function startCountdownTimer() {
    if (countdownTimeout) {
      clearTimeout(countdownTimeout);
      countdownTimeout = null;
    }

    updateCountdowns();

    let minRemaining = Infinity;
    document.querySelectorAll('.countdown').forEach(el => {
      const target = el.dataset.endTime || el.dataset.startTime;
      if (!target) return;
      const r = new Date(target).getTime() - Date.now();
      if (r > 0 && r < minRemaining) minRemaining = r;
    });

    if (minRemaining === Infinity) return;

    const delay = minRemaining < 60 * 60 * 1000 ? 1000 : 60 * 1000;
    countdownTimeout = setTimeout(startCountdownTimer, delay);
  }

  /**
   * Update all countdown elements, auto-refresh when rotation ends
   */
  function updateCountdowns() {
    const now = Date.now();
    let anyEnded = false;

    document.querySelectorAll('.countdown').forEach(el => {
      const endTime = el.dataset.endTime;
      const startTime = el.dataset.startTime;

      if (endTime) {
        // Current rotation - show "Ends in X"
        const remaining = new Date(endTime).getTime() - now;
        if (remaining > 0) {
          el.textContent = ` (${formatCountdown(remaining)} left)`;
          el.classList.remove('countdown-soon', 'countdown-ended');
          // Add warning class if less than 15 minutes
          if (remaining < 15 * 60 * 1000) {
            el.classList.add('countdown-soon');
          }
        } else {
          el.textContent = ' (Updating...)';
          el.classList.add('countdown-ended');
          anyEnded = true;
        }
      } else if (startTime) {
        // Next rotation - show "Starts in X"
        const remaining = new Date(startTime).getTime() - now;
        if (remaining > 0) {
          el.textContent = ` (in ${formatCountdown(remaining)})`;
        } else {
          el.textContent = ' (Starting now)';
          anyEnded = true;
        }
      }
    });

    // Auto-refresh when a rotation ends (debounced - only fires once)
    if (anyEnded && !hasTriggeredAutoRefresh) {
      hasTriggeredAutoRefresh = true;
      console.log('Rotation ended, auto-refreshing data...');
      refreshData(true);
    }
  }

  // Clean up timers when popup closes
  window.addEventListener('beforeunload', () => {
    if (countdownTimeout) clearTimeout(countdownTimeout);
    if (refreshCooldownInterval) clearInterval(refreshCooldownInterval);
  });

  /**
   * Format a countdown duration into human-readable string
   * @param {number} ms Milliseconds remaining
   * @returns {string} Formatted string like "1h 23m" or "45m 30s"
   */
  function formatCountdown(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
});