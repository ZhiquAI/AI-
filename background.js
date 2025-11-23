// background.js

// 点击图标打开侧边栏
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 监听 Tab 更新，仅在特定阅卷网站启用
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  // 示例：仅在智学网或好分数启用
  if (url.origin.includes('zhixue.com') || url.origin.includes('haofenshu.com')) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'index.html',
      enabled: true
    });
  }
});