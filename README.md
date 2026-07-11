![RoomList](icons/logo-lockup.svg)

# RoomList 空間採購清單

RoomList 是一款跨電商 Chrome 擴充功能。使用者可從商品頁將家居商品加入本機清單，並依客廳、臥室、書房等空間整理預算。

RoomList 為獨立開發工具，與 IKEA、PChome、momo、蝦皮、酷澎、宜得利、特力屋、淘寶、天貓、HOIHOME、MR.LIVING 或其他電商品牌無隸屬、合作或授權關係。商品名稱、圖片、價格與商標均屬原網站權利人。

## 支援網站

商品頁（單一商品）跟商品列表／分類頁（多張卡片）用的是不同的收藏按鈕、不同的 DOM 結構，兩邊分開列，比較看得出哪裡還沒驗證。

| 網站 | 商品頁 | 商品列表／分類頁 |
| --- | --- | --- |
| IKEA 台灣、香港 | 高（長期驗證） | 高（`.itemBlock` 卡片，實測驗證） |
| PChome 24h | 高（實測 HTML 驗證） | 高（賣場頁 `.c-prodInfoV2` 卡片，實測驗證） |
| momo 購物網 | 高（實測 HTML 驗證） | 高（分類頁與商品頁是不同前端，已個別驗證） |
| 宜得利家居台灣 | 高（實測 HTML 驗證） | 高（分類頁與輪播卡片共用，已個別驗證） |
| 特力屋線上購物 | 高（實測 HTML 驗證） | 高（分類頁卡片，實測驗證） |
| MR.LIVING 居家先生 | 高（JSON-LD 驗證） | 高（分類頁 `.product-item-info` 卡片，實測驗證） |
| 好好生活 HOIHOME | 高（實測 HTML 驗證） | 高（分類頁是不同前端 React 版型，已個別驗證） |
| 淘寶網、天貓 Tmall | 中（`#collectBtn`，登入/地區限制無法自動化重測） | 不適用（搜尋／分類頁在 `s.taobao.com`／`list.tmall.com` 等不同網域，本擴充功能未涵蓋，只支援單一商品頁） |
| 蝦皮購物 | 中（雜湊 class 較多，前端會擋自動化擷取，只能靠使用者提供的真實 HTML 驗證過） | 未驗證（搜尋頁是純前端渲染，自動化擷取被擋下，未能重新測試；若無法加入請回報並附上該頁 HTML） |
| 酷澎台灣 | 中（雜湊 class 較多，前端有機器人防護，只能靠使用者提供的真實 HTML 驗證過） | 官網本身沒有提供——搜尋／分類頁的商品卡片只有圖片/名稱/價格/星等，沒有收藏愛心，只能到商品頁本身收藏 |

「信心程度」是指選擇器有沒有拿真實頁面 HTML／DOM 驗證過，不代表功能好壞——即使選擇器失效，商品頁仍會顯示 RoomList 自有的保底加入按鈕（見下方說明）。各電商前端持續改版，這份表格會隨時間過時，上線前仍應實機驗證。

淘寶網、天貓是跨境購物（人民幣計價），RoomList 會優先讀取頁面上「跨境到台灣大約多少新台幣」的估價文字；找不到時才退回用人民幣原價乘上一個寫死的粗略匯率，不會即時反映匯率變動。

## 操作方式

1. 在 `chrome://extensions` 開啟開發人員模式。
2. 選擇「載入未封裝項目」，載入本專案資料夾。
3. 前往支援的商品頁。
4. 點原網站的追蹤／收藏按鈕，或點頁面右下角的「加入採購清單」。
5. 選擇空間後，商品會加入跨網站共用清單。

原生收藏按鈕會由站點 adapter 嘗試辨識；即使網站改版導致選擇器失效，商品頁仍會顯示 RoomList 自有的加入按鈕作為保底。

## 架構

```text
room-wishlist-extension/
├── manifest.json
├── background/service-worker.js
├── content/
│   ├── site-adapter.js
│   ├── storage.js
│   ├── panel.js
│   └── content-script.js
└── icons/
```

- `site-adapter.js`：站點規則、JSON-LD、Open Graph 與 DOM 三層商品解析。
- `storage.js`：跨網站共用的本機商品與空間資料。
- `panel.js`：RoomList 品牌介面、清單管理、PDF 與 Email 分享。
- `content-script.js`：攔截可辨識的原生收藏按鈕並提供自有保底按鈕。

## 已知限制

- 酷澎搜尋／分類頁的商品卡片沒有收藏愛心（官網本身就沒提供），只能在單一商品頁收藏；這不是選擇器沒抓到，是那個頁面真的沒有這顆按鈕。
- 淘寶網、天貓的搜尋／分類頁在別的網域（例如 `s.taobao.com`、`list.tmall.com`），不在 `manifest.json` 的涵蓋範圍內，這兩站只支援單一商品頁加入收藏。
- 蝦皮、酷澎、淘寶網、天貓的頁面對自動化擷取（無頭瀏覽器）有防護，這幾站沒辦法像其他站一樣定期重新抓真實 HTML 驗證，只能靠使用者實際使用時回報並附上頁面 HTML 才能重新確認/修正選擇器。
- IKEA 分類頁裡少數推薦／輪播卡片（例如首頁的個人化推薦區塊）目前抓不到價格（名稱與收藏功能正常），懷疑是那類卡片本身不含常規的價格區塊；加入清單後價格會先顯示 0，可在面板裡點金額手動輸入。
- IKEA Planner（`planner.ikea.com.tw`／`.hk`，設計組合頁）沒有一般商品頁那種商品資料可以自動擷取，只能抓到設計代碼與品項數量，名稱／價格需要使用者自己在彈出的表單裡確認或填寫。

## 驗證

```bash
python3 -m json.tool manifest.json > /dev/null
node --check background/service-worker.js
node --check content/content-script.js
node --check content/panel.js
node --check content/site-adapter.js
node --check content/storage.js
```

各電商前端會持續改版；上線前仍應在已登入與未登入狀態各做一次實機點擊驗證。
