/**
 * storage.js
 *
 * 以 chrome.storage.local 存放收藏清單與設定，完全不需要登入 IKEA 帳號，
 * 只跟這個瀏覽器 profile 綁定。資料結構：
 *   items:    [{ id, name, price, qty, room, articleNo, url, image, addedAt }]
 *   settings: { defaultEmail, rooms: string[], extensionEnabled: boolean, privacyAcceptedAt: string }
 * 所有支援網站共用一份 roomList_items 清單。
 */
(function (global) {
  "use strict";

  const SETTINGS_KEY = "roomList_settings";
  const LEGACY_ITEMS_KEY = "ikeaWishlist_items"; // 分市場之前的舊 key，只用來做一次性搬移
  const MIGRATED_FLAG_KEY = "ikeaWishlist_migratedToMarketKeys";

  const DEFAULT_ROOMS = ["客廳", "臥室", "書房", "浴室", "陽台", "廚房", "餐廳", "玄關"];

  function currentMarket() {
    return "TW";
  }

  function itemsKey() {
    return "roomList_items";
  }

  function uid() {
    return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * 分市場儲存上線前，所有測試資料都存在單一共用的 LEGACY_ITEMS_KEY 裡，而且都是在
   * TW 加的。只搬一次：把舊資料原封不動搬進 TW 的新 key，搬完做記號，之後不會再搬
   * （不然使用者在 TW 清空清單後，舊資料又會被誤判成「還沒搬」而重新冒出來）。
   */
  async function migrateLegacyItemsOnce() {
    const flagResult = await chrome.storage.local.get(MIGRATED_FLAG_KEY);
    if (flagResult[MIGRATED_FLAG_KEY]) return;

    const legacyResult = await chrome.storage.local.get(LEGACY_ITEMS_KEY);
    const legacyItems = legacyResult[LEGACY_ITEMS_KEY];
    if (Array.isArray(legacyItems) && legacyItems.length) {
      const nextKey = "roomList_items";
      const nextResult = await chrome.storage.local.get(nextKey);
      if (!Array.isArray(nextResult[nextKey]) || nextResult[nextKey].length === 0) {
        await chrome.storage.local.set({ [nextKey]: legacyItems });
      }
    }
    await chrome.storage.local.set({ [MIGRATED_FLAG_KEY]: true });
    await chrome.storage.local.remove(LEGACY_ITEMS_KEY);
  }
  // 不在 content script 載入時立刻讀取舊清單。首次使用者先看完隱私揭露並同意，
  // 真正需要清單資料時才執行遷移與讀取。
  let migrationDone;
  function ensureMigration() {
    if (!migrationDone) migrationDone = migrateLegacyItemsOnce();
    return migrationDone;
  }

  async function getItems() {
    await ensureMigration();
    const key = itemsKey();
    const r = await chrome.storage.local.get(key);
    return r[key] || [];
  }

  async function setItems(items) {
    await ensureMigration();
    return chrome.storage.local.set({ [itemsKey()]: items });
  }

  const DEFAULT_LIST_NAME = "我的採購清單";

  function getSettings() {
    return chrome.storage.local.get(SETTINGS_KEY).then((r) => {
      const s = r[SETTINGS_KEY] || {};
      return {
        defaultEmail: s.defaultEmail || "",
        rooms: Array.isArray(s.rooms) && s.rooms.length ? s.rooms : DEFAULT_ROOMS.slice(),
        extensionEnabled: s.extensionEnabled !== false,
        listName: s.listName || DEFAULT_LIST_NAME,
        privacyAcceptedAt: typeof s.privacyAcceptedAt === "string" ? s.privacyAcceptedAt : "",
        privacyDecision: s.privacyDecision === "declined" ? "declined" : ""
      };
    });
  }

  function setSettings(patch) {
    return getSettings().then((current) => {
      const next = Object.assign({}, current, patch);
      return chrome.storage.local.set({ [SETTINGS_KEY]: next }).then(() => next);
    });
  }

  async function addItem(product, room) {
    const items = await getItems();
    const existing = items.find((i) => i.name === product.name && i.room === room);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({
        id: uid(),
        name: product.name,
        price: product.price || 0,
        qty: 1,
        room: room,
        articleNo: product.articleNo || "",
        url: product.url || "",
        image: product.image || "",
        addedAt: Date.now()
      });
    }
    await setItems(items);
    return items;
  }

  async function removeItem(id) {
    const items = (await getItems()).filter((i) => i.id !== id);
    await setItems(items);
    return items;
  }

  /** 批次刪除，一次讀寫而不是逐筆呼叫 removeItem，供「刪除已選取」使用 */
  async function removeItems(ids) {
    const idSet = new Set(ids);
    const items = (await getItems()).filter((i) => !idSet.has(i.id));
    await setItems(items);
    return items;
  }

  async function updateItem(id, patch) {
    const items = await getItems();
    const item = items.find((i) => i.id === id);
    if (item) Object.assign(item, patch);
    await setItems(items);
    return items;
  }

  /**
   * 兩邊都有貨號的話，用貨號判斷是不是同一件商品最準——名稱是從頁面文字組出來的，
   * 同一件商品在商品頁 vs. 卡片/輪播抓到的字串可能不完全一樣（例如英文字大小寫、
   * 描述文字有沒有重複接上），純比對名稱字串會誤判成兩件不同商品重複加入清單。
   * 沒有貨號可比（例如卡片抓不到、或還沒判斷出來）才退回用名稱比對。
   */
  function sameProduct(item, product) {
    if (item.articleNo && product.articleNo) return item.articleNo === product.articleNo;
    return item.name === product.name;
  }

  /**
   * 搬移到新空間時先移除舊項目、保留原本數量，避免同一商品在兩個空間各出現一筆。
   */
  async function setProductRoom(product, room) {
    const items = await getItems();
    const existingIdx = items.findIndex((i) => sameProduct(i, product));
    const prevQty = existingIdx >= 0 ? items[existingIdx].qty : 1;
    if (existingIdx >= 0) items.splice(existingIdx, 1);
    items.push({
      id: uid(),
      name: product.name,
      price: product.price || 0,
      qty: prevQty,
      room: room,
      articleNo: product.articleNo || "",
      url: product.url || "",
      image: product.image || "",
      source: product.source || "",
      addedAt: Date.now()
    });
    await setItems(items);
    return items;
  }

  async function findRoomByName(name) {
    const items = await getItems();
    const found = items.find((i) => i.name === name);
    return found ? found.room : null;
  }

  async function hasProduct(name) {
    const items = await getItems();
    return items.some((i) => i.name === name);
  }

  async function removeProduct(product) {
    const items = (await getItems()).filter((i) => !sameProduct(i, product));
    await setItems(items);
    return items;
  }

  /**
   * 批次匯入（從備份還原用）：不管匯入項目原本帶什麼 id，一律指派新的，避免跟
   * 現有清單裡的項目 id 撞在一起；一次寫入，不逐筆呼叫 addItem。
   */
  async function importItems(itemsToImport) {
    const items = await getItems();
    itemsToImport.forEach((imp) => {
      items.push({
        id: uid(),
        name: imp.name,
        price: imp.price || 0,
        qty: imp.qty || 1,
        room: imp.room || DEFAULT_ROOMS[DEFAULT_ROOMS.length - 1],
        articleNo: imp.articleNo || "",
        url: imp.url || "",
        image: imp.image || "",
        addedAt: Date.now()
      });
    });
    await setItems(items);
    return items;
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[itemsKey()] || changes[SETTINGS_KEY]) callback();
    });
  }

  global.__roomlistStorage = {
    DEFAULT_ROOMS,
    DEFAULT_LIST_NAME,
    currentMarket,
    getItems,
    setItems,
    getSettings,
    setSettings,
    addItem,
    removeItem,
    removeItems,
    updateItem,
    setProductRoom,
    findRoomByName,
    hasProduct,
    removeProduct,
    sameProduct,
    importItems,
    onChange
  };
})(window);
