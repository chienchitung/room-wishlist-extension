![RoomList](icons/logo-lockup.svg)

# RoomList 空間採購清單

RoomList 是一款跨電商 Chrome 擴充功能。使用者可從商品頁將家居商品加入本機清單，依客廳、臥室、書房等空間整理預算，清單與匯出的 PDF 也會標示每件商品的來源網站，方便追蹤是從哪個電商加入的。

> RoomList 為獨立開發的工具，與本擴充功能支援的電商品牌皆無隸屬、合作、贊助或授權關係。頁面中顯示的商品名稱、圖片、價格及商標，其權利均屬原網站或相關權利人所有。

## 主要功能

- 從不同電商網站加入家居商品，集中保存在瀏覽器本機。
- 依客廳、臥室、書房等空間分類，快速整理採購需求。
- 自動計算各空間小計與清單總額，並保留商品來源連結。
- 匯出 PDF，或透過 Email 分享採購清單內容。

## 操作示範

以下示範將 PChome、momo、IKEA 與宜得利商品加入對應空間，集中查看預算並匯出 PDF 採購清單。

[![RoomList 跨電商採購清單操作示範](docs/assets/roomlist-multi-store-demo.gif)](docs/assets/roomlist-multi-store-demo.mp4)

[觀看 MP4 完整影片](docs/assets/roomlist-multi-store-demo.mp4)

## 支援網站

| 網站 | 商品頁 | 商品列表／分類頁 |
| --- | --- | --- |
| IKEA 台灣、香港 | 支援 | 支援 |
| PChome 24h | 支援 | 支援 |
| momo 購物網 | 支援 | 支援 |
| 宜得利家居台灣 | 支援 | 支援 |
| 特力屋線上購物 | 支援 | 支援 |
| MR.LIVING 居家先生 | 支援 | 支援 |
| 好好生活 HOIHOME | 支援 | 支援 |
| 淘寶網、天貓 Tmall | 支援 | 未支援 |
| 蝦皮購物 | 支援 | 未支援 |
| 酷澎台灣 | 支援 | 未支援 |

電商網站可能隨時調整頁面結構。若原網站的收藏按鈕無法使用，可改用商品頁右下角的「加入採購清單」按鈕。

## 操作方式

1. 在 `chrome://extensions` 開啟開發人員模式。
2. 選擇「載入未封裝項目」，載入本專案資料夾。
3. 前往支援的商品頁。
4. 點原網站的追蹤／收藏按鈕，或點頁面右下角的「加入採購清單」。
5. 選擇空間後，商品會加入跨網站共用清單。

若網站本身沒有收藏按鈕，或收藏按鈕暫時無法辨識，可使用 RoomList 顯示在商品頁右下角的「加入採購清單」按鈕。

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
├── icons/
├── scripts/
│   └── record-demo.py
└── docs/assets/
    ├── roomlist-multi-store-demo.mp4
    ├── roomlist-multi-store-demo.gif
    └── roomlist-multi-store-demo-poster.png
```

- `site-adapter.js`：站點規則、JSON-LD、Open Graph 與 DOM 三層商品解析。
- `storage.js`：跨網站共用的本機商品與空間資料。
- `panel.js`：RoomList 品牌介面、清單管理、PDF 與 Email 分享。
- `content-script.js`：攔截可辨識的原生收藏按鈕並提供自有保底按鈕。
- `record-demo.py`：使用 Playwright 錄製跨電商操作，並透過 FFmpeg 產生 MP4、GIF 與封面。

## 已知限制

- 淘寶、天貓與酷澎目前只支援從單一商品頁加入，搜尋或分類頁不在支援範圍內。
- 淘寶與天貓商品以人民幣計價；RoomList 會優先採用頁面提供的新台幣估價，無法取得時的換算金額僅供參考。
- IKEA Planner 只能自動取得部分設計資訊，加入清單前需要確認或補充名稱與價格。
- 電商活動價、即時折扣與庫存可能隨時變動，清單金額應以結帳頁顯示為準。
- 舊版清單中的商品可能沒有來源網站標籤；重新加入商品後即可保存來源資訊。

## 驗證

```bash
python3 -m json.tool manifest.json > /dev/null
node --check background/service-worker.js
node --check content/content-script.js
node --check content/panel.js
node --check content/site-adapter.js
node --check content/storage.js
python3 -m py_compile scripts/record-demo.py
```

各電商網站會持續改版，發布前應重新確認主要商品頁的加入流程。
