/**
 * background/service-worker.js
 *
 * 點擊工具列圖示 -> 通知目前分頁的 content script 切換面板開關。
 *
 * 原本這裡還有「背景依序開分頁、自動點擊加入購物車」的一鍵加入購物車功能，
 * 但實測後會被官網導到別的商品頁、無法可靠完成，使用者確認後決定直接移除，
 * 不要留一個看起來能用、實際上不可靠的功能。清單匯出（PDF／Email）維持保留。
 */

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => {
    /* 該分頁可能不是支援的購物網站，沒有 content script 可回應 */
  });
});
