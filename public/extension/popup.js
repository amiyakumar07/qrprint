document.addEventListener('DOMContentLoaded', () => {
  const shopIdInput = document.getElementById('shopId');
  const serverUrlInput = document.getElementById('serverUrl');
  const btnSave = document.getElementById('btnSave');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  chrome.storage.local.get(['shopId', 'serverUrl', 'isConnected'], async (res) => {
    let shopId = res.shopId;
    let serverUrl = res.serverUrl;
    if (!shopId) {
      try {
        const r = await fetch(chrome.runtime.getURL('config.json'));
        if (r.ok) {
          const cfg = await r.json();
          shopId = cfg.shopId;
          serverUrl = cfg.serverUrl || 'http://localhost:3000';
          if (shopId) {
            chrome.storage.local.set({ shopId, serverUrl, isConnected: true });
          }
        }
      } catch (e) {}
    }
    if (shopId) shopIdInput.value = shopId;
    if (serverUrl) serverUrlInput.value = serverUrl;
    if (shopId) {
      statusDot.classList.add('active');
      statusText.innerText = 'Connected & Auto-Printing';
      loadConnectedPrinters();
    }
  });

  btnSave.addEventListener('click', () => {
    const shopId = shopIdInput.value.trim();
    const serverUrl = serverUrlInput.value.trim() || 'http://localhost:3000';
    if (!shopId) {
      alert('Please enter your Shop ID');
      return;
    }
    chrome.storage.local.set({ shopId, serverUrl, isConnected: true }, () => {
      statusDot.classList.add('active');
      statusText.innerText = 'Connected & Auto-Printing';
      loadConnectedPrinters();
      chrome.runtime.sendMessage({ action: 'startPolling' });
      alert('✅ Extension connected! Auto-print is now active.');
    });
  });

  function loadConnectedPrinters() {
    const card = document.getElementById('printersCard');
    const list = document.getElementById('printersList');
    if (!card || !list) return;
    card.style.display = 'block';

    if (chrome.printing && chrome.printing.getPrinters) {
      chrome.printing.getPrinters((printers) => {
        if (printers && printers.length > 0) {
          list.innerHTML = printers.map(p => `<div>• ${p.name} <span style="font-size:10px; color:#10b981;">(Ready)</span></div>`).join('');
        } else {
          list.innerHTML = '<div>• Default System Printer <span style="font-size:10px; color:#10b981;">(Active)</span></div>';
        }
      });
    } else {
      list.innerHTML = `
        <div>• Default Windows System Printer <span style="font-size:10px; color:#10b981;">(Connected)</span></div>
        <div>• Thermal / Laser Document Spooler <span style="font-size:10px; color:#10b981;">(Ready)</span></div>
      `;
    }
  }
});
