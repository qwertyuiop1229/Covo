// Optional feature: dependencies are live getters, never a snapshot of the selected account/channel.
export function installSettingsFeature(context) {
window.switchDiscordSettingsTab = function (tab) {
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.settings-content-section').forEach(s => s.classList.remove('active'));
  const navBtnId = tab === 'admin' ? 'openAdminModalButton' : 'snav-' + tab;
  const nb = document.getElementById(navBtnId);
  if (nb) nb.classList.add('active');
  const smap = {
    profile: 'profileSection',
    account: 'accountSection',
    privacy: 'privacySection',
    chatbackup: 'chatbackupSection',
    notif: 'notifSection',
    appearance: 'appearanceSection',
    desktop: 'desktopSection',
    migration: 'migrationSection',
    admin: 'adminNavSection',
    storage: 'storageSection',
    reports: 'reportsSection',
    cfstatus: 'cfstatusSection',
    appinfo: 'appinfoSection',
    admintools: 'admintoolsSection'
  };
  if (tab === 'appinfo') {
    const verEl = document.getElementById('appInfoVersion');
    if (verEl) {
      if (context._appVersion) {
        verEl.textContent = 'v' + context._appVersion;
      } else {
        verEl.textContent = '読込中…';
        fetch('/version.json', {
          cache: 'default'
        }).then(r => r.json()).then(d => {
          verEl.textContent = 'v' + (d.version || '—');
          context._appVersion = d.version;
        }).catch(() => {
          verEl.textContent = '—';
        });
      }
    }
    context.updateE2EEStatusUI();
    context.updateLayoutDebugUI();
    if (typeof context.updateForceOverrideUI === 'function') context.updateForceOverrideUI();
  }
  const sec = document.getElementById(smap[tab] || 'profileSection');
  if (sec) sec.classList.add('active');
  if (tab === 'admin') {
    const container = document.getElementById('pcAdminContainer');
    const shared = document.getElementById('adminPanelSharedContent');
    if (container && shared) {
      container.appendChild(shared);
      shared.classList.remove('hidden');
    }
  }
  if (tab === 'storage') {
    const container = document.getElementById('pcStorageContainer');
    const shared = document.getElementById('storageSharedContent');
    if (container && shared) {
      container.appendChild(shared);
      shared.classList.remove('hidden');
    }
    if (typeof context.loadStorageStats === 'function') context.loadStorageStats();
  }
  if (tab === 'reports') {
    const container = document.getElementById('pcReportsContainer');
    const shared = document.getElementById('reportsSharedContent');
    if (container && shared) {
      container.appendChild(shared);
      shared.classList.remove('hidden');
    }
    // サブタブがcfstatusだった場合は確実に再マウント
    if (context._currentReportSubTab === 'cfstatus') {
      const cfCont = document.getElementById('reportSubTabCfStatusContent');
      const cfShared = document.getElementById('cfStatusSharedContent');
      if (cfCont && cfShared && cfShared.parentElement !== cfCont) {
        cfCont.appendChild(cfShared);
        cfShared.classList.remove('hidden');
      }
      if (typeof window.loadCfServerStatus === 'function') window.loadCfServerStatus();
    } else {
      if (typeof window.loadErrorTelemetry === 'function') window.loadErrorTelemetry();
      if (typeof window.loadAdminFeedbacks === 'function') window.loadAdminFeedbacks();
    }
  }
  if (tab === 'cfstatus') {
    const container = document.getElementById('pcCfStatusContainer');
    const shared = document.getElementById('cfStatusSharedContent');
    if (container && shared) {
      container.appendChild(shared);
      shared.classList.remove('hidden');
    }
    if (typeof window.loadCfServerStatus === 'function') window.loadCfServerStatus();
  }
};

}
