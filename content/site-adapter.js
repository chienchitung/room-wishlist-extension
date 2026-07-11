/**
 * site-adapter.js
 *
 * 這支檔案集中管理「如何從 ikea.com.tw／ikea.com.hk 頁面讀資料 / 操作按鈕」的邏輯。
 * 下面的選擇器是實際下載／使用者回報的原始碼比對出來的，可信度標註在註解中：
 *   [實測] 有從真實 HTML 找到對應的 class／元素
 *   [推論] 只從 CSS／JS bundle 內容反推使用位置，沒看過實際頁面即時渲染結果，建議用 DevTools 再核對一次
 *
 * 重要背景：官網目前同時存在「兩套」前端元件系統，選擇器分兩組並列，firstMatch() 兩組都會試：
 *   1. 舊系統：jQuery + 自訂 Vue 元件（bbVue），class 像 .itemBlock／.card-favorites／.itemName
 *   2. 新系統：IKEA 官方的 Skapa 設計系統 Web Component（<skapa-button>／<skapa-price>／
 *      <skapa-image> 這類自訂元素），class 像 .product-carousel__item／.wish-list-button__container
 * 從使用者回報＋實際 HTML 來看，例如「其他相關產品」這類推薦商品區塊已經改用新系統，
 * 但「最常搭配購買的商品」（Dynamic Yield 輪播）還是舊系統 —— 同一個頁面上兩套並存。
 * 收藏功能沒登入會被導去登入頁（原始碼裡 redirectToLogin('add_to_favorite') 是寫死的，
 * 新系統的 <skapa-button a11y-label="accessibility.wishlist-remove"> 推測行為一致）。
 * 這支擴充功能用「攔截」而非「額外加按鈕」：在原生愛心按鈕上攔截點擊事件，阻止它導去登入頁，
 * 改叫我們自己不需要登入的空間選擇彈窗，使用者永遠只看到「一顆」愛心。
 *
 * TW／HK 兩地共用：卡片模板（.itemBlock／.itemName／.itemFacts／.itemOfferPrice／
 * .itemNormalPrice）跟品號網址格式（-art-/-spr- + 8碼數字）兩地實測完全一樣，是同一套
 * webroot 平台。但「收藏」按鈕本身兩地不同元件：TW 卡片用 .card-favorites，HK 用一個
 * 獨立套件（@bitbox/hongkong/wish-list-global，比 TW 多了「可建立多個清單」的功能）
 * 叫 <wish-list-button>。這支元件最後會渲染成什麼 class 沒辦法用 curl 看到（要等
 * client-side JS 執行完），但把它的 JS bundle 抓下來看裡面的字串，確認它跟 TW 一樣是用
 * Skapa 元件蓋的（bundle 裡找得到一樣的 'sk-icon' class 名稱、一樣的
 * accessibility.wishlist-add/remove 標籤字串），所以額外加了 [a11y-label*='wishlist']
 * 這個「語意化」選擇器 —— 不管兩地各自包了什麼樣的外層 class，只要底層都是同一顆
 * Skapa 按鈕、帶著同樣的無障礙標籤，這個屬性選擇器就抓得到。.inFavList 則是兩地都在原始碼
 * 裡看過的收藏鈕狀態 class（TW 在 buttons.css、HK 在 PDP 主收藏鈕的即時模板）。
 */
(function (global) {
  "use strict";

  const DOM_SELECTORS = {
    // ---- 商品清單卡片：舊系統（.itemBlock）+ 新系統（Skapa Web Component）並列 ----
    // 找不到卡片容器時（例如又是另一種沒見過的版型），findCardContainer() 會往上层層比對。
    cardRoot: [".card.itemBlock", ".itemBlock", ".product.product-carousel__item", ".product-carousel__item"], // [實測]
    // [a11y-label*='wishlist'] 是跨 TW/HK 通用的語意化選擇器（見檔頭說明）；.inFavList
    // 是兩地原始碼都出現過的收藏鈕狀態 class；wish-list-button 是 HK 專屬的 Vue 元件標籤本身，
    // 保底用（元件最終渲染結果不明，直接抓元件標籤至少能定位到按鈕大概位置）。
    cardFavoriteButton: [".card-favorites", ".wish-list-button__container", "[a11y-label*='wishlist']", ".inFavList", "wish-list-button"], // [.card-favorites/.wish-list-button__container 實測(TW)，其餘見上方說明]
    cardName: [".itemName h6", ".itemName", ".name__container h2"], // [實測]
    cardNameFallback: ["[class*='itemName']", "[class*='item-name']", "[class*='productName']", "[class*='product-name']", "h6", "h3", "h5"], // [推論]
    // 卡片上「GLOSTAD」（品牌詞）跟「雙人座沙發，Knisa 藍色」（中文描述）是兩個分開的
    // 元素，中文描述在這裡（舊系統 .itemFacts / 新系統 .facts），擷取時會接在品牌詞後面。
    cardFacts: [".itemDetails .itemFacts", ".itemFacts", ".product__description .facts", ".typography-label-m.typography-regular.facts", "[class*='facts']"], // [實測]
    cardLink: ["a.itemName", "a.d-block.w-100", ".name__container a.link", "a.product-image__container"], // [實測]
    cardImage: ["img"], // [實測；舊系統圖片可能用 lazySizes 延遲載入，見 imageUrlOf()]
    // 價格選擇器刻意不用 [class*='itemPrice'] 這種寬鬆寫法 —— 實測發現它會連
    // .itemPriceBox 這個「外層容器」都選到，裡面同時包著現在價、單位（例如「/44公尺」）
    // 跟劃線的舊價格，三組數字的文字被一起讀出來，再交給 parsePriceNumber 就串成一個
    // 完全錯誤的天文數字（例如 $69/44公尺、之前價格$79 被讀成 694479）。新系統同理，
    // <skapa-price> 也可能同時有現價跟劃線舊價，所以特別限定在 .unit-price__container
    // 裡面那個 <skapa-price>，不要抓到 .price-addons 裡的劃線舊價。
    cardOfferPrice: [".itemOfferPrice", ".itemLowerPrice", ".unit-price__container skapa-price"], // [實測]
    cardNormalPrice: [".itemNormalPrice"], // [實測]
    cardPriceFallback: ["[class*='OfferPrice']", "[class*='LowerPrice']", "[class*='NormalPrice']", "skapa-price"], // [推論]

    // ---- 單一商品頁（PDP）----
    // .addFavorites 現在確認是真的：使用者回報「缺貨商品抓不到名稱/貨號」時貼出的實際 PDP
    // 原始碼裡看到了完整結構 <button class="addFavorites inFavList" data-action="favorites"
    // data-item="29618209" data-name="RISBYN/HAVSDJUP" data-price="739" ...>，不只 class
    // 得到驗證，還發現按鈕本身直接帶著 data-item／data-name／data-price 這三個屬性 ——
    // 這組資料不管商品缺不缺貨都在，比猜「這是不是商品頁」再去湊 JSON-LD/OG/DOM 可靠很多，
    // 見下面的 extractProductFromButtonData()。.wish-list-button__container 是從「其他相關
    // 產品」卡片上實測到的新系統收藏鈕，PDP 主要的收藏鈕很可能是同一套元件，一併加進來。
    pdpFavoriteButton: [".addFavorites", ".removeFavorites", ".wish-list-button__container", "[a11y-label*='wishlist']", ".inFavList", "wish-list-button"], // [.addFavorites/.removeFavorites 實測，.wish-list-button__container 實測（來自卡片，PDP本身未直接驗證），其餘見檔頭 TW/HK 共用選擇器說明]
    productTitle: ["h1[data-testid='product-title']", "h1.product-title", "h1"], // [推論，PDP 未實測]
    // 商品名稱在頁面上常常只有品牌詞本身（例如「GULLVALLA」），完整描述（例如「三人座沙發，
    // Silkeryd 灰綠色」）是另一個獨立的元素 —— 借用卡片版型上實測到的 .itemFacts / .facts
    // class 猜測 PDP 用的也是同一套，抓到的話會接在品牌詞後面組成完整名稱，見 extractProduct()。
    productFacts: [".itemDetails .itemFacts", ".itemFacts", ".typography-label-m.typography-regular.facts", "[class*='facts']"], // [推論，PDP 未實測]
    price: ["[data-testid='product-price']", ".itemOfferPrice", ".itemLowerPrice", ".itemNormalPrice", ".unit-price__container skapa-price", "skapa-price"],
    articleNumber: ["[data-testid='product-article-number']", ".product-article-number", "[data-article-number]"],
    productImage: ["[data-testid='product-image'] img", ".product-image img"],

    // 只用來判斷「這是不是單一商品頁」，不會被拿去自動點擊（一鍵加入購物車功能已移除，
    // 詳見 README「已移除的功能」）
    addToCartTrigger: ["#add-to-cart-button-pill", ".addToCartText:not(.d-none)", ".shopping-cart-icon.addToCartText"] // [實測]
  };

  function firstMatch(selectors, root) {
    root = root || document;
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (e) {
        /* 忽略無效選擇器 */
      }
    }
    return null;
  }

  function textOf(el) {
    return el ? el.textContent.trim().replace(/\s+/g, " ") : "";
  }

  /**
   * 只取文字裡「第一組」數字（例如 "$69 / 44 公尺" 取 69，忽略後面的單位數字），
   * 不要把整段文字裡所有數字全部串在一起 —— 之前就是把 69、44（單位）、79（劃線
   * 舊價）三個數字併成 694479 的錯誤金額。
   */
  function parsePriceNumber(str) {
    if (!str) return null;
    const match = String(str).match(/\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    const n = parseFloat(match[0].replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }

  /** lazySizes 延遲載入圖片時，真正的圖片網址在 data-src，src 只是佔位圖 */
  function imageUrlOf(imgEl) {
    if (!imgEl) return "";
    return imgEl.getAttribute("data-src") || imgEl.getAttribute("data-srcset") || imgEl.getAttribute("src") || "";
  }

  /**
   * 貨號其實就藏在商品網址結尾：.../brimnes-art-90337700、.../saltsjobaden-spr-09627460
   * 這種 "-art-{8碼數字}" 或 "-spr-{8碼數字}" 的格式，不管是舊系統還是新系統的卡片、
   * 甚至完全找不到任何「貨號」DOM 元素時都能用，比在頁面上找特定 class 穩定很多。
   * 官網貨號視覺上是 3-3-2 分組加句點（例如 606.227.94），這裡照這個格式組回去。
   */
  function formatArticleNo(digits) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 8)}`;
  }

  function extractArticleNoFromUrl(url) {
    if (!url) return "";
    const match = url.match(/-(?:art|spr)-(\d{8})(?:[/?#]|$)/);
    if (!match) return "";
    return formatArticleNo(match[1]);
  }

  /**
   * og:title／JSON-LD 的名稱常常是整頁 <title> 那種 SEO 格式：「商品名稱 | IKEA 線上購物」
   * （TW）、「商品名稱 | IKEA 香港及澳門」（HK）。商品名稱本身不會真的含有直線符號「|」，
   * 抓到這個模式（直線後面接 IKEA 開頭的文字）就整段砍掉 —— 不用管兩地字樣不一樣，也不用
   * 猜以後會不會冒出第三種市場字樣，反正规则是「| IKEA ...」就一律視為網站字樣，不是商品名稱
   * 的一部分。沒有這個模式的名稱（多數卡片擷取到的名稱）原封不動，不會被誤砍。
   */
  function stripSiteTitleSuffix(name) {
    if (!name) return name;
    return name.replace(/\s*\|\s*IKEA[^|]*$/i, "").trim();
  }

  // ---------------------------------------------------------------------
  // 商品清單卡片（PLP / 首頁輪播 / 搜尋結果）
  // ---------------------------------------------------------------------

  /**
   * 先試實測過的 .card.itemBlock／.itemBlock；找不到時（例如搜尋結果頁、「常搭配購買」
   * 這類推薦商品輪播，可能用了不同的 Vue 元件、不同的 class 名稱，甚至巢狀層數更深），
   * 改成從愛心按鈕往上逐層找，找到第一個「同時包含商品名稱與價格」的共同祖先容器。
   * 層數上限拉到 20 層，因為輪播元件常常比一般卡片多包好幾層 slide/track 容器。
   */
  function findCardContainer(favoriteButtonEl) {
    const known = favoriteButtonEl.closest(DOM_SELECTORS.cardRoot.join(","));
    if (known) return known;

    let el = favoriteButtonEl.parentElement;
    for (let i = 0; i < 20 && el && el !== document.body; i++) {
      const hasName = firstMatch(DOM_SELECTORS.cardName, el) || firstMatch(DOM_SELECTORS.cardNameFallback, el);
      const hasPrice =
        firstMatch(DOM_SELECTORS.cardOfferPrice, el) ||
        firstMatch(DOM_SELECTORS.cardNormalPrice, el) ||
        firstMatch(DOM_SELECTORS.cardPriceFallback, el);
      if (hasName && hasPrice) return el;
      el = el.parentElement;
    }
    return null;
  }

  function extractCardProduct(favoriteButtonEl) {
    const card = findCardContainer(favoriteButtonEl);
    if (!card) {
      // 除錯用：在 DevTools Console 裡這行會印出一個可以展開/檢查的真實 DOM 節點，
      // 遇到抓不到的版型時，把這個節點展開、右鍵「Copy > Copy outerHTML」回報，
      // 比純文字描述更快定位問題。
      console.warn("[IKEA 採購清單] 往上找了 20 層都找不到同時包含名稱與價格的容器，按鈕元素：", favoriteButtonEl);
      return null;
    }
    const nameEl = firstMatch(DOM_SELECTORS.cardName, card) || firstMatch(DOM_SELECTORS.cardNameFallback, card);
    const linkEl = firstMatch(DOM_SELECTORS.cardLink, card) || nameEl?.closest?.("a") || card.querySelector("a[href]");
    const imgEl = firstMatch(DOM_SELECTORS.cardImage, card);
    const offerEl = firstMatch(DOM_SELECTORS.cardOfferPrice, card) || firstMatch(DOM_SELECTORS.cardPriceFallback, card);
    const normalEl = firstMatch(DOM_SELECTORS.cardNormalPrice, card);
    let name = stripSiteTitleSuffix(textOf(nameEl));
    if (!name) {
      console.warn("[IKEA 採購清單] 找到容器了，但抓不到商品名稱文字，容器節點：", card);
      return null;
    }
    // 品牌詞（GLOSTAD）跟中文描述（雙人座沙發，Knisa 藍色）在卡片上是兩個分開的元素，
    // 只存品牌詞的話清單裡會看不出是什麼商品 —— 找得到描述就接在後面組成完整名稱。
    const facts = textOf(firstMatch(DOM_SELECTORS.cardFacts, card));
    // 「已經包含」的比對要不分大小寫：官網自己的名稱字串跟卡片上獨立的 facts 元素，
    // 同一段描述有時候大小寫會不一樣（例如 "LED" vs "Led"），純字串 includes() 判斷
    // 不出來，會把同一段描述重複接兩次（STOFTMOLN 這個商品就是這樣被使用者抓到的）。
    if (facts && !name.toLowerCase().includes(facts.toLowerCase())) name = `${name}，${facts}`;

    const price = parsePriceNumber(textOf(offerEl)) || parsePriceNumber(textOf(normalEl)) || 0;
    // 缺貨商品的卡片，官網有時候不會渲染一顆正常的 <a href> 連結（點卡片本身沒有可點的
    // 商品頁連結），這種情況下 linkEl 會是 null，也找不到 -art-/-spr- 網址可以解析貨號。
    // 除了正常的 <a href>，也試著找常見的「非 <a> 但用 data 屬性存連結」的寫法（JS 路由
    // 卡片常見的做法），儘量多一個機會拿到貨號。
    let url = linkEl ? linkEl.getAttribute("href") || "" : "";
    if (!url) {
      const dataLinkEl = card.querySelector("[data-href],[data-url],[data-link],[data-product-url]");
      if (dataLinkEl) {
        url =
          dataLinkEl.getAttribute("data-href") ||
          dataLinkEl.getAttribute("data-url") ||
          dataLinkEl.getAttribute("data-link") ||
          dataLinkEl.getAttribute("data-product-url") ||
          "";
      }
    }
    if (url && !/^https?:\/\//.test(url)) url = new URL(url, location.origin).href;
    const finalUrl = url || location.href;
    // 商品清單／輪播卡片上不會顯示貨號文字，但網址裡藏著，見 extractArticleNoFromUrl()
    const articleNo = extractArticleNoFromUrl(finalUrl);
    if (!articleNo) {
      // 除錯用：貨號抓不到最常見的原因是這張卡片根本沒有可用的商品連結（例如缺貨商品），
      // 印出卡片節點方便直接在 DevTools 展開檢查，比純文字描述更快定位問題。
      console.warn("[IKEA 採購清單] 抓到名稱/價格，但這張卡片沒有找到含貨號格式的連結，貨號會是空的。卡片節點：", card, "目前找到的網址：", finalUrl);
    }
    return { name, price, image: imageUrlOf(imgEl), articleNo, url: finalUrl };
  }

  // ---------------------------------------------------------------------
  // 單一商品頁（PDP）：JSON-LD -> Open Graph -> DOM 三層備援
  // ---------------------------------------------------------------------

  function readJsonLdProduct() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const candidates = Array.isArray(data) ? data : [data, ...(data["@graph"] || [])];
        for (const node of candidates) {
          if (!node) continue;
          const type = node["@type"];
          const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
          if (!isProduct) continue;
          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          return {
            name: node.name || null,
            image: Array.isArray(node.image) ? node.image[0] : node.image || null,
            price: offers ? parsePriceNumber(offers.price) : null,
            articleNo: node.sku || node.mpn || null
          };
        }
      } catch (e) {
        /* 忽略解析失敗的 JSON-LD 區塊 */
      }
    }
    return null;
  }

  function readOpenGraphProduct() {
    const get = (name) => {
      const el = document.querySelector(`meta[property='${name}']`) || document.querySelector(`meta[name='${name}']`);
      return el ? el.getAttribute("content") : null;
    };
    const title = get("og:title");
    const image = get("og:image");
    const price = get("product:price:amount") || get("og:price:amount");
    if (!title && !image && !price) return null;
    return { name: title, image, price: parsePriceNumber(price), articleNo: null };
  }

  function readDomProduct() {
    const nameEl = firstMatch(DOM_SELECTORS.productTitle);
    const priceEl = firstMatch(DOM_SELECTORS.price);
    const articleEl = firstMatch(DOM_SELECTORS.articleNumber);
    const imgEl = firstMatch(DOM_SELECTORS.productImage);
    return {
      name: textOf(nameEl) || null,
      image: imgEl ? imageUrlOf(imgEl) : null,
      price: parsePriceNumber(textOf(priceEl)),
      articleNo: textOf(articleEl) || null
    };
  }

  /**
   * 缺貨商品的 PDP 有兩個地方會失效：(1) JSON-LD 的 Product/價格資訊常常缺貨時就不生成，
   * (2) isProductPage() 原本用「有沒有加入購物車按鈕」判斷是不是商品頁，缺貨時加入購物車
   * 按鈕會整個被換成「到貨通知我」（.notifyStock），導致 isProductPage() 誤判成「不是
   * 商品頁」，連 extractProduct() 都不會被呼叫，直接掉進卡片擷取邏輯（找不到卡片容器，
   * 整個抓取失敗）。但 .addFavorites 收藏按鈕本身──不管缺不缺貨都在──直接帶著
   * data-item（貨號數字，未格式化）／data-name（品牌詞，例如 "RISBYN/HAVSDJUP"）／
   * data-price（純數字價格）這三個屬性，缺貨時 data-price 可能是最後一次還在賣時的價格
   * （非即時），但貨號和名稱不受影響。這條路徑直接讀被點擊的按鈕本身，完全不需要猜「這是
   * 不是商品頁」，也不管缺不缺貨，比原本 JSON-LD/OG/DOM 三層擷取更可靠，優先試這個。
   */
  function extractProductFromButtonData(btn) {
    const itemId = btn.getAttribute("data-item");
    if (!itemId) return null;
    let name = stripSiteTitleSuffix(btn.getAttribute("data-name") || "");
    if (!name) return null;
    const facts = textOf(firstMatch(DOM_SELECTORS.productFacts));
    if (facts && !name.toLowerCase().includes(facts.toLowerCase())) name = `${name}，${facts}`;
    const price = parsePriceNumber(btn.getAttribute("data-price")) || 0;
    const articleNo = /^\d{8}$/.test(itemId) ? formatArticleNo(itemId) : "";
    const imgEl = firstMatch(DOM_SELECTORS.productImage);
    return { name, image: imgEl ? imageUrlOf(imgEl) : "", price, articleNo, url: location.href.split("?")[0] };
  }

  function extractProduct() {
    const sources = [readJsonLdProduct(), readOpenGraphProduct(), readDomProduct()].filter(Boolean);
    const merged = { name: null, image: null, price: null, articleNo: null };
    for (const key of Object.keys(merged)) {
      for (const src of sources) {
        if (src[key] !== null && src[key] !== undefined && src[key] !== "") {
          merged[key] = src[key];
          break;
        }
      }
    }
    if (!merged.name) return null;

    // og:title／JSON-LD 名稱常常帶「| IKEA 線上購物」「| IKEA 香港及澳門」這種網站字樣，
    // 先砍掉再做後面的描述合併判斷，不然合併判斷可能會被那段字樣干擾。
    let name = stripSiteTitleSuffix(merged.name);

    // 不管名稱是從哪個來源抓到的，如果頁面上另外找得到描述文字（例如「三人座沙發，
    // Silkeryd 灰綠色」），就接在後面組成完整名稱，避免清單裡只顯示光禿禿的品牌詞。
    const facts = textOf(firstMatch(DOM_SELECTORS.productFacts));
    // 同一段描述文字在 og:title/JSON-LD 名稱裡跟獨立的 facts 元素裡，大小寫可能不一致
    // （例如 "LED" vs "Led"），比對要不分大小寫，不然會誤判成「還沒包含」重複接兩次。
    if (facts && !name.toLowerCase().includes(facts.toLowerCase())) name = `${name}，${facts}`;

    const pageUrl = location.href.split("?")[0];
    // JSON-LD 的 sku／頁面上的貨號元素都可能抓不到或改版失效，網址裡的 -art-/-spr- 編號
    // 是最後一道防線，見 extractArticleNoFromUrl()
    return {
      name,
      image: merged.image || "",
      price: merged.price || 0,
      articleNo: merged.articleNo || extractArticleNoFromUrl(pageUrl),
      url: pageUrl
    };
  }

  function isProductPage() {
    if (readJsonLdProduct()) return true;
    if (firstMatch(DOM_SELECTORS.addToCartTrigger)) return true;
    return false;
  }

  // ---------------------------------------------------------------------
  // IKEA Planner（planner.ikea.com.tw／.hk，設計組合，例如 BILLY 系統櫃規劃）
  // ---------------------------------------------------------------------
  //
  // 這是完全不同的重量級 3D 應用（下載主程式檔案確認是用 Babylon.js WebGL 引擎蓋的），
  // 跟主站不是同一套系統，畫面主要靠 WebGL 畫，不是一般 DOM，也沒有找到可靠的原生
  // 「加入收藏」按鈕可以攔截。反查過它的 JS bundle：
  //   - 找到一個內部的 dexf API，可以用設計代碼換回完整零件清單（品號＋數量），
  //     但那組 API 需要一組寫死在程式碼裡的私有 API key，沒有真實瀏覽器可以驗證
  //     呼叫方式會不會被擋、金鑰會不會過期，所以沒有直接串接。
  //   - 確認 document.title 會被這個 app 動態更新（用類似 react-helmet 的機制），
  //     比亂猜 DOM 選擇器可靠，所以名稱優先用它。
  // 金額沒辦法自動抓，固定回傳 0，讓使用者加入清單後自己點金額手動輸入
  // （面板的金額欄位支援點擊編輯）。

  function isPlannerPage() {
    return location.hostname.includes("planner.ikea.com");
  }

  /**
   * 從實際拿到的 Planner 頁面 HTML 才發現：畫面上方 header（`[data-testid="header-total-price"]`）
   * 和「設計總覽」摘要畫面（`[data-testid="summary-page"]`）都帶著一個 data-shoppingitems／
   * data-summary-shoppingitems attribute，內容是這個設計目前包含的品項 JSON，例如：
   * `[{"id":"00477356","type":"ART","quantity":2},{"id":"80477338","type":"ART","quantity":1}]`。
   * 這兩顆 div 本身是一般的 React 渲染 light DOM（不是包在 Web Component 的 shadow root
   * 裡面），可以直接 querySelector 讀到，不需要理解 Babylon.js 場景或呼叫任何 API。
   * 用來把品項數量算進去，讓加入清單的名稱看得出這個設計包含幾件商品，不是只顯示一顆
   * 沒有內容的「設計組合」。單一品項的價格/名稱仍然拿不到，這裡只算得出總件數。
   */
  function countPlannerParts() {
    const el = document.querySelector("[data-shoppingitems], [data-summary-shoppingitems]");
    if (!el) return null;
    const raw = el.getAttribute("data-shoppingitems") || el.getAttribute("data-summary-shoppingitems");
    if (!raw) return null;
    try {
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) return null;
      return items.reduce((sum, it) => sum + (Number(it && it.quantity) || 1), 0);
    } catch (e) {
      return null;
    }
  }

  /**
   * 設計代碼在網址 hash 裡：.../?vpcSource=clipboard#/vpc/32GQ6TK → 32GQ6TK。
   * 存起來的 url 就是目前完整網址（含 hash），清單裡點名稱會直接導覽回這個設計。
   *
   * 實測發現「設計總覽」畫面的 hash 是 `#/summary`，完全沒有 `/vpc/{代碼}`（用 email
   * 連結直接開啟設計總覽時尤其明顯，從頭到尾都不會經過帶 vpc 代碼的 3D 編輯畫面）——
   * 這種情況不再直接放棄，改成只要畫面上還找得到 data-shoppingitems（見
   * countPlannerParts()）就當作「有效」，貨號欄位留空（不是編造一個假代碼，避免不同
   * 設計互相被誤判成同一件商品）。已知限制：這種情況下商品連結只會連回這個總覽頁，
   * 不是特定設計的深連結。只有網址跟畫面上都完全找不到任何線索時才真的判定放棄。
   */
  function extractPlannerDesign() {
    const match = location.hash.match(/\/vpc\/([A-Z0-9]+)/i);
    const vpcCode = match ? match[1].toUpperCase() : "";
    const partsCount = countPlannerParts();
    if (!vpcCode && !partsCount) return null;

    let name = stripSiteTitleSuffix(document.title || "");
    // document.title 剛載入時可能還是預設的 app 名稱，還沒被換成跟這個設計相關的標題，
    // 這種情況退回用網址路徑裡的產品線代號（例如 /addon-app/storageone/billy/ 裡的
    // billy）組一個看得出來是哪個設計的名稱。
    const looksGeneric = !name || /planner|storageone|addon-app/i.test(name);
    if (looksGeneric) {
      const productLineMatch = location.pathname.match(/\/addon-app\/[^/]+\/([^/]+)\//i);
      const productLine = productLineMatch ? productLineMatch[1].toUpperCase() : "IKEA";
      name = `${productLine} 設計組合`;
    }
    if (partsCount) name += `（共 ${partsCount} 件商品）`;

    return { name, price: 0, image: "", articleNo: vpcCode, url: location.href };
  }

  global.__ikeaAdapter = {
    extractProduct,
    extractProductFromButtonData,
    extractCardProduct,
    isProductPage,
    isPlannerPage,
    extractPlannerDesign,
    countPlannerParts,
    DOM_SELECTORS
  };
})(window);
