chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('pollJobsAlarm', { periodInMinutes: 0.1 });
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
    if (!data.isConnected || !data.shopId) return;
    const server = data.serverUrl || 'http://localhost:3000';
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
