# RoomList 跨網站發布驗收報告

驗收日期：2026 年 7 月 12 日

## 結論

- Manifest、隱私同意門檻、權限、站點規則對應及商店素材自動檢查：通過。
- 14 個 Manifest 網站範圍均有對應的站點規則或 IKEA Planner 專用流程。
- 14 個網域皆能建立 HTTPS 連線；12 個首頁回傳 HTTP 200，兩個 Planner 根網址回傳 404，必須使用實際設計工具深層網址。
- 現有 MP4 操作錄影可證明 IKEA 台灣、PChome 24h、momo 與宜得利的加入、分類、總額與 PDF 流程。
- 本次工作階段沒有可用的瀏覽器控制分頁，因此未重新執行 14 站的擴充功能互動回歸；未重跑的網站不列為本次實測通過。

## 驗收狀態定義

- `錄影通過`：有本專案的真實瀏覽器操作錄影，可看到商品加入 RoomList 與後續清單流程。
- `開發驗證`：站點規則旁保存了真實頁面／headless Chrome 驗證所得的 DOM 結構與修正紀錄，但本次未重跑。
- `待瀏覽器回歸`：規則與 HTTPS 可達性存在，但本次沒有足夠證據標成互動通過。

## 14 個網站範圍

| # | 網站範圍 | HTTPS | 既有證據 | 本次發布判定 |
|---|---|---:|---|---|
| 1 | `www.ikea.com.tw` | 200 | MP4 真實加入流程；商品頁及列表規則 | 錄影通過 |
| 2 | `www.ikea.com.hk` | 200 | 商品頁及列表頁 headless DOM 驗證紀錄 | 開發驗證 |
| 3 | `planner.ikea.com.tw` | 根網址 404 | 專用設計編號與 hash 解析流程 | 待瀏覽器回歸 |
| 4 | `planner.ikea.com.hk` | 根網址 404 | 專用設計編號與 hash 解析流程 | 待瀏覽器回歸 |
| 5 | `24h.pchome.com.tw` | 200 | MP4 真實加入流程；PDP／列表 DOM 驗證 | 錄影通過 |
| 6 | `www.momoshop.com.tw` | 200 | MP4 真實加入流程；PDP／列表 DOM 驗證 | 錄影通過 |
| 7 | `shopee.tw` | 200 | 使用者提供的實際 PDP HTML 規則 | 待瀏覽器回歸 |
| 8 | `www.tw.coupang.com` | 200 | 實際 PDP HTML 與搜尋／分類頁驗證 | 開發驗證 |
| 9 | `www.nitori-net.tw` | 200 | MP4 真實加入流程；PDP／列表 DOM 驗證 | 錄影通過 |
| 10 | `www.trplus.com.tw` | 200 | PDP／分類列表 headless DOM 驗證 | 開發驗證 |
| 11 | `detail.tmall.com` | 200 | 商品頁規則已建立；先前受登入／地區限制 | 待瀏覽器回歸 |
| 12 | `item.taobao.com` | 200 | 商品頁規則已建立；先前受登入／地區限制 | 待瀏覽器回歸 |
| 13 | `www.hoihome.tw` | 200 | PDP／列表 headless DOM 驗證 | 開發驗證 |
| 14 | `www.mrliving.com.tw` | 200 | PDP／列表及 JSON-LD 驗證 | 開發驗證 |

## 已驗證的共用功能

- Manifest V3 可解析，核心權限只有 `storage`。
- 無重複 `host_permissions`。
- 未同意隱私揭露前不攔截收藏按鈕、不擷取商品、不讀取或遷移舊清單。
- 使用者可同意、拒絕，拒絕後可由工具列重新開啟同意畫面。
- 商品、設定與同意紀錄使用 `chrome.storage.local`。
- 沒有 `eval`、`new Function`、`importScripts` 或遠端 script。
- 5 張商店截圖皆為 1280×800；宣傳圖為 440×280。
- 現有操作錄影包含跨站加入、空間分類、總額、PDF 與 Email 入口。

## 重跑指令

靜態發布驗證：

```bash
node scripts/validate-release.mjs
```

重新產生真實操作錄影：

```bash
python3 scripts/record-demo.py
```

錄影腳本已配合首次隱私同意流程更新。完整公開上架前，仍應在可控制的 Chrome 工作階段重跑所有 `待瀏覽器回歸` 網站；這些項目目前不能誠實標成已通過。
