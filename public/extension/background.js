chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create('pollJobsAlarm', { periodInMinutes: 0.1 });
  try {
    const res = await fetch(chrome.runtime.getURL('config.json'));
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.shopId) {
        chrome.storage.local.set({ shopId: cfg.shopId, serverUrl: cfg.serverUrl || 'http://localhost:3000', isConnected: true });
      }
    }
  } catch (e) {}
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollJobsAlarm') {
    checkAndPrintJobs();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'startPolling') {
    checkAndPrintJobs();
  }
});

async function checkAndPrintJobs() {
  chrome.storage.local.get(['shopId', 'serverUrl', 'isConnected'], async (data) => {
    let shopId = data.shopId;
    let server = data.serverUrl || 'http://localhost:3000';
    if (!shopId) {
      try {
        const res = await fetch(chrome.runtime.getURL('config.json'));
        if (res.ok) {
          const cfg = await res.json();
          shopId = cfg.shopId;
          server = cfg.serverUrl || server;
          if (shopId) {
            chrome.storage.local.set({ shopId, serverUrl: server, isConnected: true });
          }
        }
      } catch (e) {}
    }
    if (!shopId) return;
    try {
      const res = await fetch(`${server}/api/agent/jobs/${data.shopId}`);
      if (!res.ok) return;
      const json = await res.json();
      const jobs = json.jobs || [];
      for (const job of jobs) {
        // Trigger automatic silent print tab
        const printUrl = `${server}/uploads/${job.fileName}`;
        chrome.tabs.create({ url: printUrl, active: false }, (tab) => {
          setTimeout(() => {
            if (tab && tab.id) {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => { window.print(); }
              }).catch(() => {});
              setTimeout(() => { chrome.tabs.remove(tab.id); }, 3000);
            }
          }, 1000);
        });
        // Mark job as done on server
        await fetch(`${server}/api/agent/done/${job._id}`, { method: 'POST' });
      }
    } catch (e) {}
  });
}
