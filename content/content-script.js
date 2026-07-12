/**
 * content-script.js
 *
 * 在每個 ikea.com.tw 頁面執行：攔截官網原生收藏愛心按鈕的點擊事件，並掛載側邊面板。
 *
 * 為什麼用攔截而不是另外加一顆按鈕：官網本身就有收藏功能，位置就在每張商品卡片
 * 右上角、以及單一商品頁的加入購物車按鈕旁邊；但沒登入的話點下去官網會直接
 * 導去登入頁（原始碼裡是寫死的 redirectToLogin）。用捕獲階段（capture phase）
 * 監聽可以在事件到達官網自己的 Vue 點擊處理常式「之前」把它攔下來，改成打開
 * 我們自己不需要登入的空間選擇彈窗。
 *
 * 攔截時序很重要：manifest.json 把這支 content script 設成 "document_start"，
 * 而且下面這行監聽器是整支檔案「第一件事」就同步註冊（不等 DOM、不等其他初始化）。
 * Chrome 保證 document_start 的 content script 會在頁面自己的任何 <script>
 * 執行之前先跑，這樣不管官網（或已登入時額外載入的元件/追蹤程式碼）在 document
 * 上註冊了什麼點擊監聽器，我們一定排在最前面 —— 這也是先前「登入後會被官網原生
 * 點擊搶先觸發」的根因：先前用的是 document_idle，官網自己的監聽器極可能已經
 * 比我們先註冊在 document 上，捕獲階段的執行順序在同一個節點上是照註冊先後跑的。
 */
(function () {
  "use strict";

  const adapter = window.__roomlistAdapter;
  // Planner（設計組合頁）是完全不同的 Babylon.js WebGL SPA，沒有官網那種可以攔截
  // 的收藏愛心按鈕，商品卡片的 class 也都不存在，所以這裡整段用 isPlannerPage()
  // 分流：一般商品頁走原本的攔截邏輯，Planner 頁改走 setupPlannerPage()。
  const onPlannerPage = adapter.isPlannerPage();

  // site-adapter.js 在 manifest 的 js 陣列裡排在這支檔案前面，兩者都在 document_start
  // 同步執行，所以這裡一定拿得到 window.__roomlistAdapter，可以先算好選擇器字串，
  // 避免每次點擊（頁面上任何地方的點擊都會經過這個 capture listener）都重算一次。
  const FAVORITE_SELECTOR = onPlannerPage
    ? ""
    : [...adapter.DOM_SELECTORS.cardFavoriteButton, ...adapter.DOM_SELECTORS.pdpFavoriteButton].join(",");

  // 使用者可以在設定裡關掉整個擴充功能，關掉後點擊要完全放行、不能攔。讀取設定是
  // 非同步的，但點擊監聽器必須同步判斷要不要攔截，所以用模組變數快取目前的值。
  // 未完成隱私同意前保守預設不啟用，避免設定讀回來前先攔截或擷取頁面內容。
  let extensionEnabled = false;
  let privacyAccepted = false;
  function refreshEnabledFlag() {
    window.__roomlistStorage.getSettings().then((s) => {
      privacyAccepted = !!s.privacyAcceptedAt;
      extensionEnabled = privacyAccepted && s.extensionEnabled !== false;
    });
  }
  refreshEnabledFlag();
  window.__roomlistStorage.onChange(refreshEnabledFlag);

  if (!onPlannerPage) document.addEventListener("click", onCaptureClick, true);

  function onCaptureClick(e) {
    if (!privacyAccepted || !extensionEnabled) return; // 未同意或關閉時完全不攔截
    const btn = e.target.closest(FAVORITE_SELECTOR);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    handleFavoriteClick(btn);
  }

  function handleFavoriteClick(btn) {
    const panel = window.__roomlistPanel;

    // 先判斷這顆愛心是不是「落在已知的清單卡片容器裡」（.itemBlock / .product-carousel__item
    // 這類明確、只用在重複列表項目上的 class，不會用在頁面自己的獨有內容上）。
    //
    // - 如果「是」：一定是清單/輪播卡片上的收藏鈕，用 extractCardProduct() 讀那張卡片自己的資料，
    //   即使這個輪播剛好嵌在單一商品頁裡（例如「其他相關產品」），也不會誤用整頁的資料。
    // - 如果「不是」，但整頁本身就是單一商品頁：這代表點的是頁面自己主要的收藏鈕，
    //   優先用 extractProduct()（整頁 JSON-LD/Open Graph/DOM 三層擷取，資料比較完整、
    //   有品牌詞+描述文字組合、也有網址貨號備援）—— 先前這裡沒有分開處理，導致在單一
    //   商品頁點主收藏鈕時，也會先跑 extractCardProduct() 的「往上找容器」邏輯，抓到不完整
    //   的資料（只有品牌詞、沒有貨號）。
    // 缺貨的 PDP 主收藏鈕（.addFavorites）本身就帶著 data-item／data-name／data-price，
    // 不管缺不缺貨、不管 JSON-LD 或加入購物車按鈕在不在都能用，優先試這個最直接的來源。
    let product = adapter.extractProductFromButtonData(btn);
    const inKnownCard = !!btn.closest(adapter.DOM_SELECTORS.cardRoot.join(","));
    if (!product && !inKnownCard && adapter.isProductPage()) {
      product = adapter.extractProduct();
    }
    if (!product) {
      product = adapter.extractCardProduct(btn);
    }
    if (!product && adapter.isProductPage()) {
      product = adapter.extractProduct();
    }
    if (!product) {
      console.warn("[RoomList] 無法從這個收藏按鈕辨識商品資料，選擇器可能需要用 DevTools 更新", btn);
      panel.notifyExtractionFailed();
      return;
    }
    panel.openFavoritePopover(btn, product);
  }

  /**
   * IKEA Planner 沒有商品資料可以爬（3D 組合、沒有價格、沒有貨號），能可靠拿到的只有
   * 網址 hash 裡的設計編號（vpcCode）跟 document.title 這兩樣，詳見 site-adapter.js
   * 的 extractPlannerDesign() 註解。這裡只負責：算出目前的設計資料、決定要不要顯示
   * 浮動的「加入採購清單」按鈕，價格留給使用者自己在清單裡填。
   *
   * 標題和 hash 都是頁面的 WebGL 應用初始化完才會更新，不是一開始就有；而且使用者
   * 點「設計總覽」看到的那個彈窗畫面，內容是包在另一個元件的 shadow DOM 裡渲染的，
   * 沒辦法確定切換到那個畫面時會不會觸發 hashchange。與其賭一次性的延遲時機，改用
   * 每 3 秒重新檢查一次、只要頁面還開著就會一直跑，不管使用者切到哪個畫面、隔多久
   * 才切過去，最多 3 秒內一定會同步到正確狀態（純字串比對+一次 DOM 查詢，成本很低，
   * 跟同一頁面在跑的 Babylon.js 3D 引擎比起來可以忽略不計）。
   */
  function setupPlannerPage() {
    const panel = window.__roomlistPanel;
    // 只在「原因改變」時印出來，不然 3 秒一次的輪詢會一直洗版；在 DevTools Console
    // 打開就能直接看到按鈕現在為什麼是顯示/隱藏，不用再靠使用者口頭描述來回猜。
    let lastLoggedReason = "";
    function logReason(reason) {
      if (reason === lastLoggedReason) return;
      lastLoggedReason = reason;
      console.log("[RoomList][Planner]", reason);
    }

    function syncPlannerButton() {
      if (!privacyAccepted || !extensionEnabled) {
        logReason("擴充功能目前是暫停狀態（設定裡的開關關閉），按鈕不會顯示。點瀏覽器工具列上的擴充功能圖示可以強制打開面板去打開開關。");
        panel.hidePlannerQuickAdd();
        return;
      }
      const design = adapter.extractPlannerDesign();
      if (design) {
        logReason(`偵測到設計，顯示按鈕。設計編號：${design.articleNo || "(此畫面沒有代碼，見下方說明)"}，名稱：${design.name}`);
        panel.showPlannerQuickAdd(design);
      } else {
        const partsCount = adapter.countPlannerParts();
        logReason(
          `目前 hash（${location.hash || "(空)"}）沒有「/vpc/設計代碼」，畫面上也沒找到 data-shoppingitems（品項資料，目前值：${partsCount || "無"}），按鈕先隱藏。` +
            "如果現在明明在看一個有東西的設計卻看到這行，麻煩截圖這行訊息回報。"
        );
        panel.hidePlannerQuickAdd();
      }
    }

    syncPlannerButton();
    window.addEventListener("hashchange", syncPlannerButton);
    [800, 2000, 4000].forEach((ms) => setTimeout(syncPlannerButton, ms));
    setInterval(syncPlannerButton, 3000);
    window.__roomlistStorage.onChange(syncPlannerButton);
  }

  function mountWhenReady() {
    const panel = window.__roomlistPanel;
    function afterMount() {
      // panel.mount() 出過一次意外（面板本身早就蓋好了，但函式最後一段某個地方拋出例外），
      // 導致這裡整段中斷、下面判斷要不要顯示 Planner 浮動按鈕的邏輯完全沒機會執行到——
      // 這兩件事其實互不相關，不該因為 mount() 內部任何未來可能出現的小問題就整個牽連。
      try {
        panel.mount();
      } catch (e) {
        console.warn("[RoomList] panel.mount() 發生例外，面板可能沒有完整初始化：", e);
      }
      if (onPlannerPage) setupPlannerPage();
      else {
        const syncProductQuickAdd = () => {
          if (!privacyAccepted || !extensionEnabled) {
            panel.hidePlannerQuickAdd();
            return;
          }
          const product = adapter.extractProduct();
          if (product && adapter.isProductPage()) panel.showPlannerQuickAdd(product);
          else panel.hidePlannerQuickAdd();
        };
        syncProductQuickAdd();
        document.addEventListener("DOMContentLoaded", syncProductQuickAdd, { once: true });
        [600, 1600, 3200].forEach((ms) => setTimeout(syncProductQuickAdd, ms));
      }
    }
    if (document.documentElement) {
      afterMount();
    } else {
      document.addEventListener("DOMContentLoaded", afterMount, { once: true });
    }
  }
  mountWhenReady();

  chrome.runtime.onMessage.addListener((msg) => {
    const panel = window.__roomlistPanel;
    if (msg.type === "TOGGLE_PANEL") panel.toggle();
  });
})();
