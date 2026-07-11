![RoomList](icons/logo-lockup.svg)

# RoomList 空間採購清單

RoomList 是一款跨電商 Chrome 擴充功能。使用者可從商品頁將家居商品加入本機清單，並依客廳、臥室、書房等空間整理預算。

RoomList 為獨立開發工具，與 IKEA、PChome、momo、蝦皮、酷澎、宜得利、特力屋、淘寶、天貓或其他電商品牌無隸屬、合作或授權關係。商品名稱、圖片、價格與商標均屬原網站權利人。

## 支援網站

| 網站 | 收藏按鈕辨識方式 | 信心程度 |
| --- | --- | --- |
| IKEA 台灣、香港 | class／a11y-label | 高（長期驗證） |
| PChome 24h | `data-regression` 屬性 | 高（實測 HTML 驗證） |
| momo 購物網 | `aria-label` | 高（實測 HTML 驗證） |
| 宜得利家居台灣 | `aria-label`（固定字串） | 高（實測 HTML 驗證） |
| 特力屋線上購物 | BEM class | 高（實測 HTML 驗證） |
| 淘寶網、天貓 Tmall | `#collectBtn`（穩定 id） | 高（實測 HTML 驗證） |
| 蝦皮購物 | 愛心圖示 SVG path | 中（雜湊 class 較多，改版風險較高） |
| 酷澎台灣 | 語意化 wrapper class | 中（雜湊 class 較多，改版風險較高） |

「信心程度」是指原生收藏按鈕選擇器有沒有拿真實頁面 HTML 驗證過，不代表功能好壞——即使選擇器失效，商品頁仍會顯示 RoomList 自有的保底加入按鈕（見下方說明）。各電商前端持續改版，這份表格會隨時間過時，上線前仍應實機驗證。

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

- IKEA Planner（`planner.ikea.com.tw`／`.hk`，設計組合頁）目前無法自動偵測設計編號／品項數，浮動的「加入採購清單」按鈕不會出現。`site-adapter.js` 裡的 `extractPlannerDesign()`／`countPlannerParts()` 是還沒補回來的 stub，完整實作還留在 git 歷史裡（`git show HEAD:content/site-adapter.js`）。
- 蝦皮、酷澎的原生收藏按鈕選擇器用的是雜湊 class／SVG 圖示，比其他站的 `aria-label`／`id` 脆弱，兩站改版後可能需要重新抓選擇器。

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
