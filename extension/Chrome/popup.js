// Movix Extension - Popup Logic

document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleText = document.getElementById('toggleText');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleHint = document.getElementById('toggleHint');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const versionEl = document.getElementById('version');
  const statsCard = document.getElementById('statsCard');

  // Get manifest version
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;

  // Load current state
  let isEnabled = true;
  try {
    const result = await chrome.storage.local.get('extensionEnabled');
    isEnabled = result.extensionEnabled !== false; // default to true
  } catch (e) {
    isEnabled = true;
  }

  // Load stats
  loadStats();

  // Load extraction prefs
  loadExtractionPrefs();

  // Update UI
  updateUI(isEnabled);

  // Toggle handler
  toggleBtn.addEventListener('click', async () => {
    isEnabled = !isEnabled;
    
    // Save state
    await chrome.storage.local.set({ extensionEnabled: isEnabled });
    
    // Notify background script
    try {
      await chrome.runtime.sendMessage({ 
        action: 'TOGGLE_EXTENSION', 
        payload: { enabled: isEnabled } 
      });
    } catch (e) {
      console.log('Background message error:', e);
    }

    // Animate button
    toggleBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
      toggleBtn.style.transform = '';
    }, 150);

    updateUI(isEnabled);
  });

  function updateUI(enabled) {
    if (enabled) {
      // Extension is ON → show "Désactiver" button
      toggleBtn.className = 'toggle-btn enabled';
      toggleText.textContent = 'Désactiver l\'extension';
      toggleIcon.innerHTML = `
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
        <line x1="12" y1="2" x2="12" y2="12"/>
      `;
      toggleHint.textContent = 'L\'extension intercepte les requêtes et extrait les flux vidéo';

      statusBadge.className = 'status-badge active';
      statusText.textContent = 'Extension active';

      // Remove disabled overlay
      statsCard.classList.remove('is-disabled');
    } else {
      // Extension is OFF → show "Activer" button
      toggleBtn.className = 'toggle-btn disabled';
      toggleText.textContent = 'Activer l\'extension';
      toggleIcon.innerHTML = `
        <path d="M5 12h14"/>
        <path d="M12 5v14"/>
      `;
      toggleHint.textContent = 'L\'extension est en pause — les flux protégés ne seront pas disponibles';

      statusBadge.className = 'status-badge inactive';
      statusText.textContent = 'Extension désactivée';

      // Add disabled overlay
      statsCard.classList.add('is-disabled');
    }
  }

  async function loadStats() {
    try {
      const result = await chrome.storage.local.get(['stats']);
      const stats = result.stats || { extractions: 0, corsFixed: 0, cached: 0 };

      document.getElementById('extractionCount').textContent = stats.extractions || 0;
      document.getElementById('corsCount').textContent = stats.corsFixed || 0;
      document.getElementById('cacheCount').textContent = stats.cached || 0;
    } catch (e) {
      // Defaults are already 0
    }
  }

  async function loadExtractionPrefs() {
    try {
      const prefs = await chrome.runtime.sendMessage({ action: 'GET_EXTRACTION_PREFS' });
      if (!prefs || !prefs.m3u8) return;
      const m3u8Keys = Object.keys(prefs.m3u8);
      const m3u8On = m3u8Keys.filter((k) => prefs.m3u8[k]).length;
      const liveKeys = Object.keys(prefs.livetv || {});
      const liveOn = liveKeys.filter((k) => prefs.livetv[k]).length;
      const m3u8El = document.getElementById('m3u8EnabledCount');
      const liveEl = document.getElementById('livetvEnabledCount');
      if (m3u8El) m3u8El.textContent = `${m3u8On}/${m3u8Keys.length}`;
      if (liveEl) liveEl.textContent = `${liveOn}/${liveKeys.length}`;
    } catch (e) {
      console.log('Could not load extraction prefs:', e);
    }
  }
});
