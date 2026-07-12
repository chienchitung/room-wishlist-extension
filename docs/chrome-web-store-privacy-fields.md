# Chrome Web Store 隱私權欄位填寫稿

這份文字供 Chrome Web Store Developer Dashboard 的「Privacy practices」頁面使用。上架前須確認內容與當時版本的實際行為一致。

## Single purpose

將支援電商網站上的家居商品加入只儲存在瀏覽器本機的清單，並依空間整理預算、列印或由使用者自行透過 Email 分享。

## Permission justification

### storage

用於在使用者目前的 Chrome 瀏覽器設定檔中保存採購清單、空間分類、清單名稱、預設收件 Email、啟用狀態與隱私同意紀錄。資料不會同步或傳送至 RoomList 開發者伺服器。

### Site access / content script match patterns

RoomList 只在 Manifest 明列的支援電商網站執行。網站存取用於顯示 RoomList 清單介面，以及在使用者同意後讀取其要加入清單的商品名稱、圖片、價格、貨號、來源網站與網址。RoomList 不讀取登入憑證、Cookie、付款資料或完整瀏覽紀錄。

## Remote code

選擇：`No, I am not using remote code.`

所有可執行的 JavaScript 均包含在擴充功能 ZIP 中；不下載、不載入也不執行遠端程式碼。

## Data usage disclosures

依目前功能，保守揭露下列類型：

- Personally identifiable information：使用者選填並儲存在本機的預設收件 Email。
- Web history / browsing activity：加入清單之商品頁來源網域與網址；只為使用者可見的清單功能處理。
- Website content：商品名稱、圖片、價格、貨號與來源網站。
- User-generated content：清單名稱、空間分類、商品數量與使用者編輯的清單內容。

不收集或處理：健康資料、驗證資訊、私人通訊內容、位置資訊、使用者行為分析、付款或金融帳戶資料。

## Data-use certifications

在實際行為維持目前設計的前提下，可確認：

- 資料不販售給第三方。
- 資料不用於與單一用途無關的用途。
- 資料不用於信用評估、借貸或個人化廣告。
- RoomList 沒有開發者後端，不會讓開發者或第三方人工閱讀資料。

## Privacy policy URL

推送至公開 GitHub repository 後，可先使用：

`https://github.com/chienchitung/room-wishlist-extension/blob/main/docs/privacy-policy.md`

送審前請用無痕視窗確認不需登入即可讀取。若 repository 不是公開的，應改放到公開 HTTPS 網站或 GitHub Pages，不能使用私人網址。
