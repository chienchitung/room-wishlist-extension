(function (global) {
  "use strict";

  const SITE_RULES = {
    "www.ikea.com.tw": {
      name: "IKEA 台灣",
      buttons: [".addFavorites", ".removeFavorites", ".card-favorites", ".wish-list-button__container", "[a11y-label*='wishlist' i]"],
      roots: [".itemBlock", ".product-carousel__item", "main"],
      title: ["h1", ".itemName", ".name__container"],
      price: [".itemOfferPrice", ".itemLowerPrice", ".itemNormalPrice", "skapa-price"]
    },
    "www.ikea.com.hk": {
      name: "IKEA 香港",
      buttons: [".addFavorites", ".removeFavorites", "wish-list-button", ".wish-list-button__container", "[a11y-label*='wishlist' i]"],
      roots: [".itemBlock", ".product-carousel__item", "main"],
      title: ["h1", ".itemName", ".name__container"],
      price: [".itemOfferPrice", ".itemLowerPrice", ".itemNormalPrice", "skapa-price"]
    },
    // PChome 商品頁的加入追蹤按鈕實際結構是
    // <div class="c-compoundBtnTool c-compoundBtnTool--track" role="button"><button class="btn ..."><span class="btn__noFrame ...">
    //   <i data-regression="prod_icon_add2Wish">/i><span data-regression="prod_txt_add2Wish">追蹤</span></span></button></div>
    // 按鈕文字是「追蹤」不是「收藏」；data-regression 是 PChome 內部迴歸測試用的錨點，
    // 比 class（會隨改版變動）穩定，外層 .c-compoundBtnTool--track 則涵蓋整個可點擊熱區。
    //
    // 賣場列表頁（/store/<賣場代碼>）是不同版型（V2 卡片），實測（headless Chrome 渲染）
    // 找到每張卡片的結構：<div class="c-prodInfoV2 c-prodInfoV2--gridCard">
    //   <a class="c-prodInfoV2__link" href="/prod/<商品代碼>?...">(圖片/名稱 h3[data-regression=
    //   store_prodName]/價格 div[data-regression=store_prodPrice])</a>
    //   <div class="c-prodInfoV2__otherFunctions">(收藏鈕 data-regression=store_addToWish／
    //   購物車鈕)</div>
    // </div>
    // 收藏鈕跟名稱/價格/連結不在同一個 <a> 底下（是手足關係），roots 要用外層
    // .c-prodInfoV2 才能同時涵蓋兩邊；[class*='product'] 在這裡不會命中（PChome 這裡的
    // class 都是 "c-prodInfoV2" 這種縮寫 "prod"，不含完整 "product" 字樣），拿掉沒有影響。
    "24h.pchome.com.tw": {
      name: "PChome 24h",
      buttons: [".c-compoundBtnTool--track", "[data-regression='prod_icon_add2Wish']", "[data-regression='prod_txt_add2Wish']", "[data-regression='store_addToWish']"],
      roots: [".c-prodInfoV2", "main"],
      title: ["h1", "[data-regression='store_prodName']"],
      price: ["[data-regression='store_prodPrice']", "[class*='price']"]
    },
    // momo 商品頁的按鈕文字／aria-label 是「加入追蹤」不是「收藏」，緊鄰在「放入購物車」
    // 按鈕右邊：<button aria-label="加入追蹤">...</button>。aria-label 直接掛在按鈕本身，
    // 點擊時不管落在圖示或文字上，往上找都能命中同一顆按鈕。
    //
    // 分類列表頁是完全不同的新版前端（Tailwind 風格的 "mu-" 前綴 class，跟 PDP 不通用），
    // 收藏鈕 aria-label 也不一樣，是「追蹤商品」。每張卡片沒有穩定的外層 class，但卡片
    // 本身帶一個內部覆蓋連結 <a data-testid="goods-card-overlay" href=".../GoodsDetail.jsp
    // ?i_code=<商品id>">，用 :has() 選出「有這顆覆蓋連結當直接子元素」的 div 當卡片邊界。
    // 名稱在 [data-testid="title"]。價格比較特殊：[data-testid="market-price"] 實測是
    // 「原價」（劃線價），不是實際售價——真正售價是它前一個手足元素（沒有 class 可選，
    // 只能在 cardOverrides 用 previousElementSibling 抓），這裡 rule.price 的
    // [class*='price'] 純粹是 PDP 用的備援，列表卡片不會用到。
    "www.momoshop.com.tw": {
      name: "momo 購物網",
      buttons: ["button[aria-label='加入追蹤']", "button[aria-label*='追蹤']", "button[aria-label='追蹤商品']"],
      roots: ["div:has(>[data-testid='goods-card-overlay'])", "main", "#productForm"],
      title: ["h1", ".prdName", "[data-testid='title']"],
      price: [".price", "[class*='price']"]
    },
    // 使用者提供的實際 PDP HTML 找到的結構（在商品圖片下方、分享按鈕旁邊）：
    // <button class="w2JMKY"><svg><path d="M19.469 1.262c-5.284-1.53-7.47..." stroke="#FF424F".../></svg>
    //   <div class="rhG6k7">喜歡 (3)</div></button>
    // 按鈕文字是「喜歡」不是「收藏」，且沒有 aria-label。class（w2JMKY／rhG6k7）看起來是
    // CSS Modules 自動產生的雜湊值——rhG6k7 甚至同時用在旁邊「分享:」文字上，代表是共用的
    // 文字樣式、不是這顆按鈕專屬的標記，蝦皮重新建置前端時很可能整批換掉。改用愛心圖示
    // 本身的 SVG path 前綴當主要辨識依據，圖示美術稿改版頻率遠低於建置雜湊。
    // 價格實測結構：<div class="IZPeQz B67UQ0">$45,900</div>，class 不含 "price" 字樣，
    // 泛用的 [class*='price'] 選不到，這是先前金額一律顯示 0 元的原因（沒有 JSON-LD／
    // og:price 可退回時完全抓不到價格）。IZPeQz 一樣是雜湊 class，蝦皮重新建置前端後
    // 可能失效，但目前沒有更穩定的錨點可用。
    "shopee.tw": {
      name: "蝦皮購物",
      buttons: ["button:has(svg path[d^='M19.469 1.262'])"],
      roots: ["main", "[class*='product']"], title: ["h1"], price: [".IZPeQz", "[class*='price']"]
    },
    // 使用者提供的實際 PDP HTML 找到的結構：
    // <div class="wish twc-flex ... wish-and-share"><button class="twc-relative twc-flex ...">
    //   <svg><path fill="#454F5B" d="M12.174 4.43124..."/></svg></button></div>
    // 按鈕本身只有 Tailwind 版面 class（沒有語意），但外層 wrapper 有 .wish / .wish-and-share，
    // 全頁掃過沒有其他地方重複使用，比按鈕自己的 class 穩定，用它來 closest() 比較不會失效。
    // 價格實測結構（同一段使用者提供的 HTML）：外層 <div class="price-container ...">
    // 裡先是一個「86折」折扣徽章，之後才是 <div translate="no" class="...">$1,155</div>
    // 這個真正售價。原本的 [class*='price'] 會選到最外層的 .price-container（它自己
    // 的 class 就帶 "price"），textContent 會把「86折」跟「$1,155」全部串在一起，
    // priceNumber() 從頭掃到的第一組數字會是「86」（折扣百分比），不是實際售價——
    // 這是隱藏很深的抓錯價格風險，換成 translate="no"（酷澎用來標記不要被瀏覽器自動
    // 翻譯的數字/金額內容，售價元素排在折扣徽章之後、單位價與劃線價之前，是頁面上第一個
    // 符合這個屬性的元素）比較準。
    // 這次多站測試實測酷澎搜尋／分類列表頁（真的抓到頁面，不是被擋）發現卡片本身完全
    // 沒有收藏愛心可以點——每張卡片只有圖片/名稱/價格/星等，`.wish-and-share` 這顆按鈕
    // 只存在單一商品頁，官網自己就沒有在列表頁提供「加入收藏」的入口，不是我們選擇器沒
    // 抓到。列表頁沒有卡片層級的按鈕可攔截，roots 也就不需要任何「列表卡片」專用的選擇器；
    // 拿掉 [class*='product'] 只影響單一商品頁，且只有風險沒有好處（同一類「命中不相干的
    // wrapper」問題這次在其他四站都各自出現過一次），保守起見拿掉。
    "www.tw.coupang.com": {
      name: "酷澎",
      buttons: [".wish-and-share", ".wish-and-share button"],
      roots: ["main"],
      title: ["h1"],
      price: ["[translate='no']", "[class*='price']"]
    },
    // 宜得利商品頁、相關商品輪播卡片、跟分類列表頁都共用同一顆按鈕：
    // <button aria-label="toggleProductFavorite" class="btn-general"><img alt="加入收藏"></button>
    // aria-label 是固定字串（非本地化文字），比對 class 或圖片 alt 更穩定。
    // roots 多加 ".item"：分類列表頁／輪播卡片每張都是 <div class="item">，本身沒有 h1，
    // 只有 ".heading" 放名稱，沒加的話點收藏會誤抓到整頁主商品的標題。
    //
    // 這裡不放 [class*='product']：實測單一商品頁（headless Chrome 渲染）發現按鈕往上
    // 數第 10 層祖先剛好是 <div class="product-page">——這只是「這是一個商品詳情頁」的
    // 版面外層標記，不是任何一張卡片，但 [class*='product'] 照樣會命中它的 class 帶
    // "product" 字樣，導致 findRoot() 誤判成「找到一個特定卡片」，extractCardProduct()
    // 因此不會用 isPageLevelRoot() 那條退回 extractProduct()（JSON-LD 優先）的路徑，改用
    // metaProduct(那層 div) 硬掃 DOM——跟同一頁另一條路徑（懸浮按鈕輪詢用的
    // extractProduct()，一樣是 JSON-LD 優先）挑出來的名稱/貨號不一致，導致
    // sameProduct() 比對失敗：使用者在商品頁用官網原生愛心加入清單後，懸浮的「加入採購
    // 清單」按鈕文字沒有跟著變成「已在採購清單中」，因為兩條路徑各自認得不同的貨號。
    // 拿掉 [class*='product'] 後，商品頁的 main／.item 都不存在，findRoot() 會退回
    // document，isPageLevelRoot() 判斷為真，兩條路徑統一都走 extractProduct()（JSON-LD
    // 優先），貨號才會一致。分類列表頁不受影響：.item 本身就是離按鈕最近、也是唯一會命中
    // 的選擇器，不需要 [class*='product'] 這個退回層。
    //
    // price 改成 .sale-price 優先：實測分類列表頁的 .price 容器結構是
    // <div class="price"><div class="sale-price">$449</div><div class="original-price">
    // 499</div></div>，兩個數字中間沒有分隔字元，原本抓整個 .price 的 textContent 會
    // 變成「$449499」，priceNumber() 解析成 449499（使用者截圖回報清單裡金額顯示成
    // 「NT$449,499」就是這樣來的）。.sale-price 是目前顯示的售價（不管是不是真的在打折，
    // 每個商品都有這個 class），直接選它本身可以避免跟 .original-price 的文字黏在一起。
    "www.nitori-net.tw": {
      name: "宜得利家居",
      buttons: ["button[aria-label='toggleProductFavorite']"],
      roots: ["main", ".item"],
      title: ["h1", ".heading"],
      price: [".sale-price", "[class*='price']"]
    },
    // 特力屋商品頁的收藏（愛心）按鈕：<button class="... product__action__like ...">，
    // 純圖示、沒有文字或 aria-label，BEM 風格的 class 名稱是目前可用的最穩定錨點。
    //
    // 分類列表頁（實測 headless Chrome 渲染）發現一個很隱蔽的問題：roots 裡原本的
    // [class*='product'] 會直接命中按鈕自己（按鈕自己的 class 就帶 "product__action__like"，
    // closest() 會先檢查元素自己再往上找祖先），導致 findRoot() 永遠直接回傳按鈕本身，
    // 完全沒機會往上找到真正的卡片——這跟 mrliving／hoihome 那次「[class*='product'] 搶先
    // 命中太近的 wrapper」是同一類問題的另一種變形（這次是命中「自己」而不是「太近的祖先」）。
    // 列表卡片整張是一顆 <a data-id-id="prodlist" data-id-item="<商品代碼>"
    // href="https://www.trplus.com.tw/p/<商品代碼>?...">，用 [data-id-id='prodlist']
    // （按鈕自己的 data-id-id 是 "addToWishlist"，值不同，不會跟卡片本身搞混）當卡片邊界。
    // 名稱是 <p class="tlw-txt-zh-head-7 ...">商品名稱</p>，價格 class 帶 "tlw-txt-price-2"
    // （[class*='price'] 抓得到，不用另外加）。
    "www.trplus.com.tw": {
      name: "特力屋",
      buttons: [".product__action__like"],
      roots: ["[data-id-id='prodlist']", "main"],
      title: ["h1", "p.tlw-txt-zh-head-7"],
      price: ["[class*='price']"]
    },
    // 淘寶／天貓 2025 年後共用同一套前端（2025SSR，id="SkuPanel_tbpcDetail_ssr2025"），
    // 收藏按鈕結構兩站完全一樣：
    // <div id="collectBtn"><i class="... icon-taobaoshoucang ..."></i><span class="text--BANTyNLW">收藏</span></div>
    // #collectBtn 是少見的穩定 id（不是雜湊 class），兩站可以共用同一組規則。
    // 標題／價格目前只看得到 body（沒看過 <head> 有沒有 JSON-LD/og 標籤可用），先退回用
    // 觀察到的雜湊 class 前綴（[class*='xxx--']，不管後面接的雜湊字串是什麼），一樣
    // 提醒：這類 class 改版後可能要重抓。
    //
    // roots 拿掉 [class*='product']：manifest.json 的 host_permissions／content_scripts
    // 只涵蓋 detail.tmall.com／item.taobao.com 這兩個「單一商品頁」網域，淘寶天貓真正的
    // 搜尋／分類列表頁在完全不同的網域（s.taobao.com、list.tmall.com 等），擴充功能根本
    // 不會在那些頁面執行，所以這裡不需要、也不會用到任何「列表卡片」層級的 root。留著
    // [class*='product'] 這個通用退回選擇器只有風險沒有好處——這次多站測試已經在
    // trplus（命中按鈕自己）、mrliving／hoihome／momo（命中太近的 wrapper）、nitori
    // （命中一個純版面標記的 .product-page，不是任何卡片）各發現一種變形的同類問題，
    // 這兩站的登入/地區限制讓我們這次沒辦法抓到真實頁面驗證，保守起見直接拿掉，只留
    // main／document 這條會強制走 isPageLevelRoot() → extractProduct()（JSON-LD 優先）
    // 的路徑，不要冒同一種錯誤再發生一次的風險。
    "detail.tmall.com": {
      name: "天貓 Tmall",
      buttons: ["#collectBtn"],
      roots: ["main"],
      title: ["h1", "[class*='mainTitle--']"],
      price: ["[class*='highlightPrice--'] [class*='text--']", "[class*='price']"]
    },
    "item.taobao.com": {
      name: "淘寶網",
      buttons: ["#collectBtn"],
      roots: ["main"],
      title: ["h1", "[class*='mainTitle--']"],
      price: ["[class*='highlightPrice--'] [class*='text--']", "[class*='price']"]
    },
    // hoihome.tw 是 91APP 電商 SaaS 平台。單一商品頁（SalePage/Index/<id>）是舊版
    // AngularJS（SalePageIndexCtrl 是平台本身的 controller 名稱，非這個商店自訂）：
    // <a data-qe-id="body-add-to-wishlist-icon" class="fav-btn" ng-click="SalePageIndexCtrl.ToggleFav($event)">
    // data-qe-id 是 91APP 自己 QA 測試用的錨點，跟 PChome 的 data-regression 同一種思路，
    // 比 class 穩定；JSON-LD 商品資料完整（name/price/sku 都有，價格已經是 TWD）。
    //
    // 商品列表頁（v2/official/SalePageCategory/...）是完全不同的新版前端（React +
    // styled-components），跟上面的 PDP 選擇器不通用，實測（headless Chrome 渲染後）
    // 找到每張卡片的結構：
    // <a href="/SalePage/Index/10717802" class="... product-card__vertical ...">
    //   <div class="... product-card__vertical__wrapper">
    //     <div data-qe-id="body-meta-field-text">商品名稱</div>
    //     <div data-qe-id="body-suggest-price-text">NT$45,000</div>（原價，不要用這個）
    //     <div data-qe-id="body-price-text">NT$37,100</div>（實際售價）
    //     <span data-qe-id="product-card-favor-btn"><i class="ico ico-heart"></i></span>
    //   </div>
    // </a>
    // product-card__vertical 是唯一同時命中整張卡片、且涵蓋名稱/價格/按鈕的 class——
    // styled-components 那些 "sc-xxxxx" 雜湊 class 每次建置都會換，這個才是主題自訂、
    // 看起來穩定的語意 class。roots 不放 [class*='product']：卡片內層 wrapper div 的
    // class 也帶 "product-card__vertical__wrapper"，比外層 <a> 更近，會被
    // [class*='product'] 搶先命中，但那層 div 不是 <a>、沒有 href，讀不到網址／貨號
    // （見下方 cardOverrides，跟 mrliving 那次遇到的問題是同一種）。
    "www.hoihome.tw": {
      name: "好好生活 HOIHOME",
      buttons: ["[data-qe-id='body-add-to-wishlist-icon']", ".fav-btn", "[data-qe-id='product-card-favor-btn']"],
      roots: [".product-card__vertical", "main"],
      title: ["h1", "[data-qe-id='body-meta-field-text']"],
      price: ["[data-qe-id='body-price-text']", "[class*='price']"]
    },
    // mrliving.com.tw 是 Magento 2 電商平台。使用者給的網址其實是分類列表頁
    // （/furniture/bedroom/bedroom-bed.html），不是單一商品頁，從列表頁裡的
    // .product-item-link 找到實際商品頁再驗證。實測 HTML 找到：
    // <a href="#" class="action towishlist" data-post='{"action":"...\/wishlist\/index\/add\/",...}' data-action="add-to-wishlist">
    // data-action="add-to-wishlist" 是 Magento 核心慣例用的屬性名稱，比自訂主題可能覆蓋的
    // class 更穩定。JSON-LD 商品資料完整（name/offers.price/sku/mpn 都有）。
    // Magento 的商品頁跟分類頁網址都是任意深度 + .html 結尾，沒有像其他站那樣的固定
    // 路徑片段可以判斷「這是不是商品頁」，isProductPage() 完全靠 JSON-LD 偵測，見下方。
    // roots 多加 ".product-item-info"：分類列表頁每張卡片實測結構是
    // <div class="product-item-info" data-mrlsku="10-0396-0-26-v2"><a class="product-item-link">
    // 商品名稱</a>...<div class="price-box">...</div>...</div>，沒加的話（find之前只有
    // "main"／通用 [class*='product']）點卡片上的收藏會抓到整頁分類名稱，不是這張卡片
    // 自己的商品名稱。
    // roots 不放 [class*='product'] 這個泛用退回選擇器：Magento 卡片內部本身就用
    // "product-item-details"／"product-item-inner"／"product-item-actions" 這類
    // 一路都帶 "product" 字樣的 wrapper class 把按鈕包起來，[class*='product'] 反而會在
    // 比 .product-item-info 更近的地方先命中（例如 product-item-actions），導致
    // 抓到的容器裡沒有名稱連結／價格／data-mrlsku（那些是這層的手足節點，不是子孫）。
    // .product-item-info 本身已經是實測驗證過、涵蓋名稱+價格+貨號的卡片容器，不需要
    // 這個退回層。
    "www.mrliving.com.tw": {
      name: "MR.LIVING 居家先生",
      buttons: ["[data-action='add-to-wishlist']", ".towishlist"],
      roots: [".product-item-info", "main"],
      title: ["h1", ".product-item-link"],
      price: [".price-wrapper .price", "[class*='price']"]
    }
  };

  const rule = SITE_RULES[location.hostname] || null;
  const DOM_SELECTORS = {
    cardRoot: rule ? rule.roots : ["main"],
    cardFavoriteButton: rule ? rule.buttons : [],
    pdpFavoriteButton: rule ? rule.buttons : []
  };

  const text = (el) => (el?.textContent || "").trim().replace(/\s+/g, " ");
  const first = (selectors, root = document) => {
    for (const selector of selectors || []) {
      try { const found = root.querySelector(selector); if (found) return found; } catch (_) {}
    }
    return null;
  };
  const priceNumber = (value) => {
    const match = String(value || "").match(/(?:NT\$|HK\$|\$)?\s*([\d,]+(?:\.\d+)?)/i);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
  };

  function jsonLdProduct() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const raw = JSON.parse(script.textContent);
        const queue = Array.isArray(raw) ? raw : [raw, ...(raw["@graph"] || [])];
        const node = queue.find((item) => item && (item["@type"] === "Product" || item["@type"]?.includes?.("Product")));
        if (!node) continue;
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        return {
          name: node.name || "",
          price: priceNumber(offer?.price || offer?.lowPrice),
          image: Array.isArray(node.image) ? node.image[0] : (node.image?.url || node.image || ""),
          articleNo: node.sku || node.mpn || node.productID || "",
          url: node.url ? new URL(node.url, location.href).href : location.href,
          source: rule?.name || location.hostname
        };
      } catch (_) {}
    }
    return null;
  }

  function metaProduct(root = document) {
    const get = (key) => root.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content || "";
    const name = get("og:title") || text(first(rule?.title || ["h1"], root)) || document.title;
    if (!name) return null;
    return {
      name: name.replace(/\s*[|｜].*$/, "").trim(),
      price: priceNumber(get("product:price:amount") || get("og:price:amount") || text(first(rule?.price || [], root))),
      image: get("og:image") || first(["img"], root)?.currentSrc || "",
      articleNo: get("product:retailer_item_id") || location.pathname.split("/").filter(Boolean).pop() || "",
      url: get("og:url") || location.href,
      source: rule?.name || location.hostname
    };
  }

  // 之前這裡是「一個一個試」：陣列裡排在前面的選擇器只要有任何一層祖先符合，就直接
  // 傳回那一層，完全不管它是不是離按鈕最近的那一層。幾乎每一站的 roots 都把
  // "main"（通常整頁最外層就有）排在較前面，導致真正該用的、離按鈕最近的卡片容器
  // （例如 mrliving 的 .product-item-info、宜得利的 .item）根本沒機會被用到——
  // 因為只要 "main" 這個很寬鬆的祖先存在，迴圈第一輪就直接回傳整頁的 <main>，
  // 後面更精確的選擇器連試都沒試。改成把所有選擇器合併成一組逗號分隔的字串，一次呼叫
  // closest()：瀏覽器原生就會從按鈕本身往上一層一層比對，遇到第一個符合「任何一個」
  // 選擇器的祖先就停下來，天生就是照實際 DOM 距離決定，不會被陣列順序誤導。
  function findRoot(button) {
    const selectors = (rule?.roots || []).filter(Boolean);
    if (!selectors.length) return document;
    try {
      const found = button.closest(selectors.join(","));
      if (found) return found;
    } catch (_) {}
    return document;
  }

  // 蝦皮／酷澎的貨號改成直接從網址規則抓，不要依賴 JSON-LD 的 sku/mpn 或猜 DOM——
  // 蝦皮的 JSON-LD 沒有穩定對應的貨號欄位；酷澎同一個商品頁常常有多個 vendorItemId
  // （不同賣家/規格），JSON-LD 裡的 sku 不一定是使用者當下實際選到的那一個，網址上的
  // itemId 查詢參數才是當下這個瀏覽狀態真正對應的商品。
  //   蝦皮：/任意名稱-i.<店家id>.<商品id> → 只取商品 id 本身，例如 "25579454125"
  //   （原本連店家 id 一起取成 "i.50662979.25579454125"，但這一整段是 Shopee 內部組
  //   網址/API 用的識別碼，不是拿來查詢的公開型號，使用者拿去查會查不到；商品 id
  //   單獨拿出來還能組成 https://shopee.tw/product/店家id/商品id 這種可直接開啟的網址）
  //   酷澎：?itemId=<商品id>（可能還有 vendorItemId） → 只取數字本身，例如 "478781420568588"
  function articleNoFromUrl() {
    if (location.hostname === "shopee.tw") {
      const m = location.pathname.match(/i\.\d+\.(\d+)/);
      return m ? m[1] : "";
    }
    if (location.hostname === "www.tw.coupang.com") {
      return new URLSearchParams(location.search).get("itemId") || "";
    }
    // 淘寶／天貓的商品頁網址是 /item.htm?id=<商品id>，貨號不在路徑裡、在查詢參數裡，
    // 跟直接抓 location.pathname 最後一段（會抓到 "item.htm"，沒有意義）不一樣。
    if (location.hostname === "detail.tmall.com" || location.hostname === "item.taobao.com") {
      return new URLSearchParams(location.search).get("id") || "";
    }
    return "";
  }

  // 淘寶／天貓的商品原始標價是人民幣，但清單裡其他站全部都是新台幣，直接把人民幣數字
  // 塞進去、貼著 NT$ 顯示是錯的（使用者實測回報：頁面顯示「¥211.15」，清單卻顯示成
  // 「NT$211」，幣別根本不同，不是隨便換算一下就能用）。
  //
  // 這兩站的商品頁通常會自己算好「跨境送到台灣大約多少新台幣」的估價文字，例如
  // 「券后约 TWD 1009起」——這才是真的 TWD 金額，不需要我們自己再抓匯率換算一次。
  // 用掃整頁文字找「TWD 數字」這個模式，而不是靠 class 名稱去選那段文字：這頁的 class
  // 幾乎都是建置雜湊（改版就換），但「TWD」這個貨幣代碼字樣穩定得多——上一版只靠
  // rule.price 那組 class 選擇器，遇到頁面版型/選中的規格不同、選擇器剛好選不到的情況
  // 就會整個 fallback 失敗、悄悄留著沒轉換的人民幣數字，這正是使用者這次回報「金額還是
  // 不對」的原因。
  //
  // 少數不支援跨境直送台灣的商品才會完全沒有這段 TWD 估價文字，這時候真的沒有更好的
  // 資料來源，只能退回用人民幣原價乘上一個寫死的粗略匯率——這個倍率不會自動跟著市場
  // 匯率變動，只是「總比完全不換算好」的最後手段，不保證即時準確。
  const CNY_TO_TWD_FALLBACK_RATE = 4.5;
  function domPriceOverride() {
    if (location.hostname !== "detail.tmall.com" && location.hostname !== "item.taobao.com") return 0;
    const twdMatch = (document.body.innerText || "").match(/TWD\s*([\d,]+(?:\.\d+)?)/i);
    if (twdMatch) return Number(twdMatch[1].replace(/,/g, ""));
    const cnyPrice = priceNumber(text(first(rule?.price || [], document)));
    return cnyPrice ? Math.round(cnyPrice * CNY_TO_TWD_FALLBACK_RATE) : 0;
  }

  // 套在 extractProduct()／extractCardProduct() 兩個對外入口的共用收尾：articleNoFromUrl()
  // 只有蝦皮／酷澎／淘寶／天貓這幾站的網址會解析出東西，domPriceOverride() 只有淘寶／天貓
  // 會解析出東西，其他站兩個都回傳空值、不會覆蓋任何東西，對其他站或這幾站的輪播卡片都
  // 不影響——這幾站目前也還沒替輪播卡片設定專屬的 root 容器（不像宜得利那樣有 .item），
  // 所以現況下不會有「覆蓋到別張卡片資料」的疑慮。
  function withSiteOverrides(product) {
    if (!product) return product;
    const urlArticleNo = articleNoFromUrl();
    if (urlArticleNo) product.articleNo = urlArticleNo;
    const domPrice = domPriceOverride();
    if (domPrice) product.price = domPrice;
    return product;
  }

  // 有些商品頁的 JSON-LD 是 ProductGroup（例如 momo）或單純沒填 offers，這種情況下
  // jsonLdProduct() 抓得到名稱／圖片但價格會是 0；用 Open Graph／product meta 的價格
  // 補上，避免明明頁面上有價格、清單裡卻顯示 0 元。貨號同理——PChome 的 JSON-LD Product
  // 沒有填 sku/mpn/productID 任何一個欄位，之前只補了 price/image，articleNo 落空，
  // 導致浮動按鈕表單開起來「商品貨號」欄位是空的；這裡改成三個欄位都補。
  function extractProduct() {
    const ld = jsonLdProduct();
    const product = ld || metaProduct();
    if (!product) return product;
    if (ld && (!ld.price || !ld.image || !ld.articleNo)) {
      const meta = metaProduct();
      if (!ld.price && meta?.price) ld.price = meta.price;
      if (!ld.image && meta?.image) ld.image = meta.image;
      if (!ld.articleNo && meta?.articleNo) ld.articleNo = meta.articleNo;
    }
    return withSiteOverrides(product);
  }
  // 原本這裡只有 metaProduct(findRoot(button)) || extractProduct()：蝦皮／酷澎的
  // cardRoot 設定裡有 "main"，而 <main> 幾乎一定是收藏按鈕的祖先節點，導致
  // content-script.js 裡的 inKnownCard 判斷幾乎永遠是 true，主商品頁本身點收藏也會被
  // 當成「卡片」處理、一路只走 metaProduct() 那條路徑、永遠碰不到 extractProduct() 裡
  // 处理過的網址貨號覆蓋——這正是先前貨號還是顯示成整串網址編碼字串的原因。統一在這裡
  // 補一次 withSiteOverrides()，不管走哪條路徑，這幾站最後都會套用同一套覆蓋規則。
  // metaProduct() 的 articleNo／url 沒有更好的資料來源時會退回猜 location.pathname／
  // location.href——那是「目前這個頁面」的網址。點的若是分類列表頁裡某一張商品卡片
  // （不是單一商品頁本身），猜出來的網址／貨號其實是這個列表頁自己的，不是被點的那張
  // 卡片對應的商品。mrliving 的卡片容器（.product-item-info）自己就帶著 data-mrlsku
  // 屬性、商品名稱連結（.product-item-link）也帶著這張卡片真正的網址，找得到的話直接
  // 讀出來蓋掉猜的值，比猜頁面網址準。
  function cardOverrides(cardRoot, product) {
    if (location.hostname === "www.mrliving.com.tw" && cardRoot?.querySelector) {
      const sku = cardRoot.getAttribute?.("data-mrlsku");
      if (sku) product.articleNo = sku;
      const link = cardRoot.querySelector(".product-item-link");
      if (link?.href) product.url = link.href;
    }
    // hoihome 列表卡片本身就是一顆 <a href="/SalePage/Index/<商品id>">，卡片內沒有
    // meta 標籤可讀，metaProduct() 的 articleNo/url 會退回猜 location.href——那是整個
    // 列表頁自己的網址，不是這張卡片對應的商品頁。直接讀這顆 <a> 的 href 更準，商品 id
    // 也跟 isProductPage() 判斷單一商品頁用的 /SalePage/Index/ 是同一種網址格式。
    if (location.hostname === "www.hoihome.tw" && cardRoot?.tagName === "A") {
      const m = (cardRoot.getAttribute("href") || "").match(/\/SalePage\/Index\/(\d+)/i);
      if (m) product.articleNo = m[1];
      if (cardRoot.href) product.url = cardRoot.href;
    }
    // PChome 賣場列表頁卡片的收藏鈕跟商品連結是手足關係，不在同一個 <a> 底下（見上面
    // roots 註解），metaProduct() 的 articleNo/url 沒有更好的來源時會退回猜
    // location.pathname——那永遠是賣場代碼本身（例如 "DQCE0N"），不是被點的那張商品卡片。
    // 直接讀卡片裡 .c-prodInfoV2__link 的 href（例如 /prod/DEDS0A-A900FMLAE?fq=...），
    // 跟商品頁本身網址格式一致，用同一組 /prod/<code> 規則取出真正的商品貨號。
    if (location.hostname === "24h.pchome.com.tw" && cardRoot?.querySelector) {
      const link = cardRoot.querySelector(".c-prodInfoV2__link");
      if (link?.href) {
        product.url = link.href;
        const m = link.href.match(/\/prod\/([^/?#]+)/i);
        if (m) product.articleNo = m[1];
      }
    }
    // momo 分類列表頁卡片裡的 [data-testid='market-price'] 實測是「原價」（劃線價），
    // 它前一個手足元素才是實際售價（兩個 <span>「$」+「3,280」組成，沒有 class 可選，
    // 只能用 previousElementSibling 抓，見上面 roots 註解）。articleNo/url 則從卡片的
    // 覆蓋連結（data-testid='goods-card-overlay' 或 'goods-image-container'）讀 href，
    // 網址裡的 i_code 查詢參數就是商品 id。
    if (location.hostname === "www.momoshop.com.tw" && cardRoot?.querySelector) {
      const priceEl = cardRoot.querySelector("[data-testid='market-price']")?.previousElementSibling;
      const p = priceNumber(text(priceEl));
      if (p) product.price = p;
      const link = cardRoot.querySelector("[data-testid='goods-card-overlay'],[data-testid='goods-image-container']");
      if (link?.href) {
        product.url = link.href;
        const m = link.href.match(/i_code=(\d+)/i);
        if (m) product.articleNo = m[1];
      }
    }
    // 宜得利分類列表頁／輪播卡片（.item）裡的名稱／價格 metaProduct() 已經抓得到（見上面
    // roots 註解），只有 articleNo/url 沒有更好的來源，會退回猜 location.pathname
    // （分類頁自己的網址）。直接讀卡片裡 .heading a 或 .img a 的 href（兩個連結一樣，
    // 都是 /product/<商品代碼>），跟商品頁本身網址格式一致。
    if (location.hostname === "www.nitori-net.tw" && cardRoot?.querySelector) {
      const link = cardRoot.querySelector(".heading a, .img a");
      if (link?.href) {
        product.url = link.href;
        const m = link.href.match(/\/product\/([^/?#]+)/i);
        if (m) product.articleNo = m[1];
      }
    }
    // 特力屋列表卡片本身就是一顆 <a data-id-item="<商品代碼>" href="https://www.trplus.
    // com.tw/p/<商品代碼>?...">（見上面 roots 註解），data-id-item 在 JS 裡對應
    // dataset.idItem（不是 dataset.item，屬性名稱是 "data-id-item" 不是 "data-item"），
    // 直接讀出來比從 href 用正規表達式解析更直接、也更不會受網址上其他查詢參數影響。
    if (location.hostname === "www.trplus.com.tw" && cardRoot?.tagName === "A") {
      if (cardRoot.dataset.idItem) product.articleNo = cardRoot.dataset.idItem;
      if (cardRoot.href) product.url = cardRoot.href;
    }
    return product;
  }
  // findRoot() 找不到比「main／document」更精確的卡片容器時，代表這次點擊根本不是
  // 落在某張列表卡片上——很可能就是單一商品頁自己的收藏鈕（例如 mrliving：roots 裡
  // 一定有 "main"，商品頁本身也一定在 <main> 底下，但商品頁上不會有 .product-item-info
  // 這種只在列表卡片才有的 class，findRoot() 只好退到整個 <main>）。這種情況下改用
  // extractProduct()（會先試 jsonLdProduct()，拿到平台自己的 sku／mpn 真正貨號），
  // 不要硬用 metaProduct(整個 main) —— 之前這裡不分青紅皂白一律先掃 metaProduct(cardRoot)，
  // 只要 root 底下剛好找得到 h1（幾乎每個商品頁都有），就會回傳「有抓到」，永遠不會走到
  // 後面 jsonLdProduct() 那條路，商品頁自己點收藏時貨號只能退回猜 location.pathname
  // （網址 slug，不是真正的 SKU）。
  function isPageLevelRoot(root) {
    return !root || root === document || root.tagName === "MAIN";
  }
  // extractProduct() 內部已經呼叫過一次 withSiteOverrides()，這裡用 cardProduct 分開
  // 判斷、只在真的走 metaProduct(findRoot(button)) 這條路徑時才自己補呼叫一次，避免
  // 走 extractProduct() 那條路徑時被重複呼叫兩次（雖然兩次結果一樣，只是白白多算一次）。
  function extractCardProduct(button) {
    const cardRoot = findRoot(button);
    if (isPageLevelRoot(cardRoot)) return extractProduct();
    const cardProduct = metaProduct(cardRoot);
    return cardProduct ? withSiteOverrides(cardOverrides(cardRoot, cardProduct)) : extractProduct();
  }
  function extractProductFromButtonData(button) {
    const name = button.dataset.name || button.dataset.productName;
    if (!name) return null;
    return { name, price: priceNumber(button.dataset.price), image: button.dataset.image || "", articleNo: button.dataset.item || button.dataset.sku || "", url: location.href, source: rule?.name || location.hostname };
  }
  // 各站商品頁網址規則不一：pchome 是 /prod/、momo 與宜得利是 /product/、酷澎是
  // /products/（複數）、特力屋是 /p/、蝦皮則是 /任意名稱-i.<商店id>.<商品id> 沒有固定的路徑片段、
  // 淘寶/天貓則是固定的 /item.htm（商品id 放在查詢參數 ?id= 裡，不在路徑上）、
  // hoihome（91APP）是 /SalePage/Index/<商品id>。
  // mrliving（Magento）沒有加規則：商品頁跟分類頁網址都是任意深度 + .html 結尾，
  // 兩者無法用路徑判斷區分，只能靠下面的 jsonLdProduct() 偵測（這個平台的商品頁固定
  // 有完整 JSON-LD，實測過可以直接吃到，不需要路徑規則兜底）。
  function isProductPage() {
    if (!rule) return false;
    if (jsonLdProduct()) return true;
    if (/\/prod(?:ucts?)?\//i.test(location.pathname)) return true;
    if (/\/p\//i.test(location.pathname)) return true;
    if (/-i\.\d+\.\d+(?:[/?#]|$)/.test(location.pathname)) return true;
    if (/\/item\.htm/i.test(location.pathname)) return true;
    if (/\/SalePage\/Index\//i.test(location.pathname)) return true;
    return false;
  }
  // Planner（設計組合頁）跟一般商品頁是不同網域：planner.ikea.com.tw／planner.ikea.com.hk，
  // 不在 SITE_RULES 裡（rule 會是 null），單純看 hostname 就能判斷，不需要靠規則表。
  // 用 includes 而不是精確比對兩個網域字串，任何 planner.ikea.com.* 的地區變體都涵蓋到。
  function isPlannerPage() {
    return location.hostname.includes("planner.ikea.com");
  }

  // document.title 剛載入時可能還是 "IKEA Planner" 這類預設 app 名稱，或帶著
  // " | IKEA 香港" 這種站台後綴，兩者都不是設計本身的名字，取名字之前先把這段濾掉。
  function stripSiteTitleSuffix(name) {
    if (!name) return name;
    return name.replace(/\s*\|\s*IKEA[^|]*$/i, "").trim();
  }

  /**
   * Planner 是完全不同的重量級 3D 應用（Babylon.js WebGL 引擎），不是一般 DOM 頁面，
   * 沒有原生「加入收藏」按鈕可以攔截，商品資料也没辦法從 JSON-LD/meta 抓。
   * 從實際頁面 HTML 找到：畫面上方 header（[data-testid="header-total-price"]）跟
   * 「設計總覽」摘要畫面（[data-testid="summary-page"]）都帶著 data-shoppingitems／
   * data-summary-shoppingitems attribute，內容是這個設計目前的品項 JSON，例如
   * `[{"id":"00477356","type":"ART","quantity":2}]`。這兩顆 div 是一般 React light DOM
   * （沒有包在 shadow root 裡），可以直接 querySelector 讀到。用來把品項數量算進去，
   * 讓加入清單的名稱看得出這個設計包含幾件商品；單一品項的價格/名稱仍然拿不到，
   * 這裡只算得出總件數。
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
   *
   * 實測發現「設計總覽」畫面的 hash 是 #/summary，完全沒有 /vpc/{代碼}（例如
   * https://planner.ikea.com.hk/addon-app/storageone/besta/web/latest/hk/zh/?...#/summary
   * 這種從 email/分享連結直接開啟總覽頁的情況，從頭到尾都不會經過帶 vpc 代碼的 3D
   * 編輯畫面）——這種情況不直接放棄，只要畫面上還找得到 data-shoppingitems（見
   * countPlannerParts()）就當作「有效」，貨號欄位留空（不編造假代碼，避免不同設計被
   * 誤判成同一件商品）。已知限制：這種情況下商品連結只會連回這個總覽頁，不是特定設計
   * 的深連結。只有網址跟畫面上都完全找不到任何線索時才真的判定放棄（回傳 null）。
   */
  function extractPlannerDesign() {
    const match = location.hash.match(/\/vpc\/([A-Z0-9]+)/i);
    const vpcCode = match ? match[1].toUpperCase() : "";
    const partsCount = countPlannerParts();
    if (!vpcCode && !partsCount) return null;

    let name = stripSiteTitleSuffix(document.title || "");
    // document.title 剛載入時可能還是預設的 app 名稱，還沒被換成跟這個設計相關的標題，
    // 這種情況退回用網址路徑裡的產品線代號（例如 /addon-app/storageone/besta/ 裡的
    // besta）組一個看得出來是哪個設計的名稱。
    const looksGeneric = !name || /planner|storageone|addon-app/i.test(name);
    if (looksGeneric) {
      const productLineMatch = location.pathname.match(/\/addon-app\/[^/]+\/([^/]+)\//i);
      const productLine = productLineMatch ? productLineMatch[1].toUpperCase() : "IKEA";
      name = `${productLine} 設計組合`;
    }
    if (partsCount) name += `（共 ${partsCount} 件商品）`;

    return { name, price: 0, image: "", articleNo: vpcCode, url: location.href, source: "IKEA Planner" };
  }

  global.__roomlistAdapter = { SITE_RULES, DOM_SELECTORS, extractProduct, extractCardProduct, extractProductFromButtonData, isProductPage, isPlannerPage, extractPlannerDesign, countPlannerParts };
})(window);
