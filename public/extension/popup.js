document.addEventListener('DOMContentLoaded', () => {
  const shopIdInput = document.getElementById('shopId');
  const serverUrlInput = document.getElementById('serverUrl');
  const btnSave = document.getElementById('btnSave');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  chrome.storage.local.get(['shopId', 'serverUrl', 'isConnected'], (res) => {
    if (res.shopId) shopIdInput.value = res.shopId;
    if (res.serverUrl) serverUrlInput.value = res.serverUrl;
    if (res.isConnected && res.shopId) {
      statusDot.classList.add('active');
      statusText.innerText = 'Connected & Auto-Printing';
    } else if (res.shopId) {
      // Auto activate
      chrome.storage.local.set({ isConnected: true }, () => {
        statusDot.classList.add('active');
        statusText.innerText = 'Connected & Auto-Printing';
        chrome.runtime.sendMessage({ action: 'startPolling' });
      });
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
      chrome.runtime.sendMessage({ action: 'startPolling' });
      alert('✅ Extension connected! Auto-print is now active.');
    });
  });
});
