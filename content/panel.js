/**
 * panel.js
 *
 * 建立一個掛在 Shadow DOM 裡的側邊面板（不會被官網自己的 CSS 影響，也不會影響官網畫面）。
 * 視覺 token（顏色、字體、按鈕形狀）是直接從 ikea.com.tw 實際載入的 CSS 檔案
 * （buttons.css / prices.css / main-legacy.css / template_item_counter.css）量出來的，
 * 不是憑印象猜的 SKAPA 風格 —— 最明顯的差異是官網的按鈕是「膠囊形」（border-radius:10rem），
 * 不是小圓角矩形。
 *
 * 這支面板本身不畫任何「愛心」圖示：收藏的入口就是官網原生的愛心按鈕，
 * 由 content-script.js 攔截點擊後呼叫這裡的 openFavoritePopover()。
 */
(function (global) {
  "use strict";

  const storage = global.__ikeaStorage;

  const PANEL_CSS = `
    /* all:initial 理論上已經把 font-size 重設成瀏覽器預設的 16px（跟被裝進哪個網站無關），
       這裡額外用 !important 釘死、並關掉文字自動縮放，避免某些頁面（例如 Planner 這種
       版面比較特殊的 WebGL 應用）觸發瀏覽器的自動調整文字大小，讓面板在不同網站上文字
       大小不一致。 */
    :host { all: initial; font-size:16px !important; -webkit-text-size-adjust:100%; text-size-adjust:100%; }
    .root {
      /* 以下數值取自 ikea.com.tw 的 buttons.css / prices.css / main-legacy.css */
      --ikea-blue:#0058A3; --ikea-blue-hover:#004F93; --ikea-blue-press:#003E72; --ikea-yellow:#FFDB00;
      --ink:#111111; --ink-secondary:#484848; --ink-disabled:#929292; --border-disabled:#DFDFDF;
      --surface:#FFFFFF; --surface-hover:#F5F5F5; --offer-red:#CC0008; --success:#0A8A00;
      --pill:999px; --radius-md:8px;
      --shadow-pop:0 8px 24px rgba(17,17,17,.16); --shadow-drawer:-6px 0 28px rgba(17,17,17,.16);
      --ease:cubic-bezier(.4,0,.2,1);
      font-family:"Noto IKEA Latin","Noto Sans","Noto Sans TC","Roboto","Open Sans",system-ui,sans-serif;
      font-variant-numeric: tabular-nums; color:var(--ink);
    }
    @media (prefers-color-scheme: dark) {
      .root { --surface:#1E1E1E; --surface-hover:#292929; --border-disabled:#3A3A3A; --ink:#F2F2F2; --ink-secondary:#B8B8B8; --ink-disabled:#7A7A7A;
        --ikea-blue:#4C9AE8; --ikea-blue-hover:#6BAEEF; --ikea-blue-press:#3D82CC;
        --shadow-pop:0 8px 24px rgba(0,0,0,.5); --shadow-drawer:-6px 0 32px rgba(0,0,0,.55); }
    }
    * { box-sizing:border-box; }
    button { font:inherit; }

    .tab {
      position:fixed; right:0; top:50%; transform:translateY(-50%); z-index:2147483000;
      background:var(--ikea-blue); color:#fff; border:none; cursor:pointer; padding:16px 11px;
      border-radius:12px 0 0 12px; display:flex; flex-direction:column; align-items:center;
      gap:10px; box-shadow:var(--shadow-pop); writing-mode:vertical-rl; font-size:13px; font-weight:700; letter-spacing:1px;
      transition:right .3s var(--ease), background .15s;
    }
    .tab:hover { background:var(--ikea-blue-hover); }
    .tab .badge {
      writing-mode:horizontal-tb; background:var(--ikea-yellow); color:var(--ikea-blue-press); font-weight:800;
      font-size:12px; border-radius:var(--pill); width:24px; height:24px; display:flex; align-items:center; justify-content:center;
    }
    .tab.open { right:min(430px,92vw); }

    /* IKEA Planner（設計組合頁）沒有原生按鈕可以攔截，補一顆我們自己的浮動按鈕 */
    .planner-quick-add {
      all:unset; position:fixed; right:16px; bottom:24px; z-index:2147483000;
      display:flex; align-items:center; gap:8px; background:var(--ikea-blue); color:#fff;
      border-radius:var(--pill); padding:13px 18px; cursor:pointer; font-size:13px; font-weight:700;
      box-shadow:var(--shadow-pop); transition:background .15s, transform .15s;
    }
    .planner-quick-add:hover { background:var(--ikea-blue-hover); transform:translateY(-1px); }
    .planner-quick-add:active { transform:scale(.97); }
    .planner-quick-add svg { width:18px; height:18px; flex:none; }
    /* 沒有這條的話，上面明寫的 display:flex 會蓋掉瀏覽器對 [hidden] 屬性的預設 display:none
       （author 一般規則的優先權本來就比 UA 預設樣式高，跟選擇器優先度無關）—— 結果是
       hidePlannerQuickAdd() 設了 hidden 也沒用，按鈕一直留在畫面上，看起來像個點了沒反應的
       壞按鈕，其實是因為那個時候根本沒有對應的設計資料（plannerProduct 是 null）。 */
    .planner-quick-add[hidden] { display:none; }

    .scrim {
      position:fixed; inset:0; background:rgba(17,17,17,.32); opacity:0; pointer-events:none;
      transition:opacity .3s var(--ease); z-index:2147483000;
    }
    .scrim.show { opacity:1; pointer-events:auto; }

    .drawer {
      position:fixed; top:0; right:0; bottom:0; width:min(430px,92vw); background:var(--surface);
      box-shadow:var(--shadow-drawer); transform:translateX(100%); transition:transform .3s var(--ease);
      z-index:2147483001; display:flex; flex-direction:column;
    }
    .drawer.open { transform:translateX(0); }

    .drawer-head { padding:20px 20px 14px; border-bottom:1px solid var(--border-disabled); display:flex; gap:8px; align-items:flex-start; }
    .drawer-head h2 { font-size:18px; margin:0; font-weight:700; }
    .drawer-head p { font-size:12px; color:var(--ink-secondary); margin:4px 0 0; }
    .head-actions { margin-left:auto; display:flex; gap:2px; }
    .icon-btn { all:unset; width:36px; height:36px; border-radius:var(--pill); display:flex; align-items:center; justify-content:center; color:var(--ink-secondary); cursor:pointer; }
    .icon-btn:hover { background:var(--surface-hover); color:var(--ink); }
    .icon-btn svg { width:20px; height:20px; }
    .settings-btn { all:unset; display:flex; align-items:center; gap:5px; height:32px; padding:0 12px 0 10px; border-radius:var(--pill); box-shadow:inset 0 0 0 1px var(--border-disabled); color:var(--ink-secondary); font-size:12.5px; font-weight:600; cursor:pointer; }
    .settings-btn:hover { box-shadow:inset 0 0 0 1px var(--ink-secondary); color:var(--ink); background:var(--surface-hover); }
    .settings-btn svg { width:16px; height:16px; flex:none; }

    .room-chips { display:flex; gap:8px; padding:14px 20px; overflow-x:auto; border-bottom:1px solid var(--border-disabled); }
    .chip { all:unset; flex:0 0 auto; font-size:13px; font-weight:600; padding:8px 14px; border-radius:var(--pill); box-shadow:inset 0 0 0 1px var(--border-disabled); color:var(--ink-secondary); cursor:pointer; white-space:nowrap; }
    .chip.zero { opacity:.5; }
    .chip.active { background:var(--ikea-blue); box-shadow:none; color:#fff; }

    .list-toolbar { display:flex; align-items:center; justify-content:space-between; padding:10px 20px; border-bottom:1px solid var(--border-disabled); }
    .select-all { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:var(--ink-secondary); cursor:pointer; user-select:none; }
    .select-all input { width:16px; height:16px; accent-color:var(--ikea-blue); cursor:pointer; margin:0; }
    .bulk-delete-btn { all:unset; display:flex; align-items:center; gap:5px; font-size:12.5px; font-weight:700; color:var(--offer-red); cursor:pointer; padding:5px 9px; border-radius:6px; }
    .bulk-delete-btn:hover { background:var(--surface-hover); }
    .bulk-delete-btn svg { width:14px; height:14px; }
    .bulk-delete-btn[hidden] { display:none; }

    .item-list { flex:1; overflow-y:auto; padding:4px 20px; }
    .item-row { display:grid; grid-template-columns:auto 1fr auto; align-items:start; gap:12px; padding:16px 0; border-bottom:1px solid var(--border-disabled); }
    .item-row:last-child { border-bottom:none; }
    .item-checkbox { width:16px; height:16px; margin-top:3px; accent-color:var(--ikea-blue); cursor:pointer; }
    .item-name { display:block; font-size:13.5px; font-weight:600; line-height:1.3; color:var(--ink); text-decoration:none; }
    .item-name:hover { text-decoration:underline; color:var(--ikea-blue); }
    .item-meta { font-size:11.5px; color:var(--ink-secondary); margin-top:3px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .room-tag { font-size:11px; font-weight:600; background:var(--surface-hover); border-radius:var(--pill); padding:3px 9px; color:var(--ink); cursor:pointer; }
    .qty-row { display:inline-flex; align-items:center; border-radius:var(--pill); box-shadow:0 0 0 1px var(--border-disabled); margin-top:9px; }
    .qty-btn { all:unset; width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; text-align:center; }
    .qty-btn:hover { background:var(--surface-hover); border-radius:var(--pill); }
    .qty-val { width:24px; text-align:center; font-size:12.5px; font-weight:700; }
    .item-right { text-align:right; display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between; }
    .item-price { all:unset; font-size:13px; font-weight:700; cursor:pointer; border-radius:6px; padding:2px 5px; margin:-2px -5px; }
    .item-price:hover { background:var(--surface-hover); }
    .item-price-input { width:78px; font-size:13px; font-weight:700; text-align:right; border:1px solid var(--ikea-blue); border-radius:6px; padding:3px 6px; font-family:inherit; color:var(--ink); background:var(--surface); }
    .remove-btn { all:unset; color:var(--ink-secondary); cursor:pointer; padding:4px; border-radius:var(--pill); }
    .remove-btn:hover { color:var(--offer-red); background:var(--surface-hover); }
    .remove-btn svg { width:15px; height:15px; display:block; }
    .empty-state { text-align:center; padding:40px 20px; color:var(--ink-secondary); font-size:13px; line-height:1.6; }

    .drawer-foot { border-top:1px solid var(--border-disabled); padding:18px 20px; background:var(--surface); }
    .total-row { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px; }
    .total-label { font-size:13px; color:var(--ink-secondary); }
    .total-value { font-size:23px; font-weight:700; }
    .total-caption { font-size:11px; color:var(--ink-secondary); margin-bottom:14px; }
    .disclaimer { font-size:10.5px; color:var(--ink-secondary); text-align:center; margin-top:12px; opacity:.75; }

    .btn { all:unset; box-sizing:border-box; display:flex; align-items:center; justify-content:center; gap:8px; height:55px; padding:0 24px; border-radius:var(--pill); font-size:14px; font-weight:700; cursor:pointer; transition:transform .2s var(--ease), background .15s, box-shadow .15s; }
    .btn:active { transform:scale(.97); }
    .btn svg { width:20px; height:20px; flex:none; }
    .btn-primary { background:var(--ikea-blue); color:#fff; width:100%; margin-bottom:8px; }
    .btn-primary:hover { background:var(--ikea-blue-hover); }
    .btn-primary:active { background:var(--ikea-blue-press); }
    .btn-outline { height:44px; font-size:13px; background:var(--surface); color:var(--ink); box-shadow:inset 0 0 0 1px var(--ink-secondary); }
    .btn-outline svg { width:18px; height:18px; }
    .btn-outline:hover { box-shadow:inset 0 0 0 1px var(--ink); }
    .btn-outline:active { background:var(--surface-hover); }

    .pop { position:fixed; width:200px; background:var(--surface); border-radius:var(--radius-md); box-shadow:var(--shadow-pop); padding:8px; z-index:2147483002; display:flex; flex-direction:column; gap:2px; }
    .pop-label { font-size:11px; font-weight:600; color:var(--ink-secondary); padding:6px 8px 8px; }
    .pop button { all:unset; font-size:13px; padding:8px 9px; border-radius:6px; cursor:pointer; color:var(--ink); }
    .pop button:hover { background:var(--surface-hover); }
    .pop button.danger { color:var(--offer-red); border-top:1px solid var(--border-disabled); margin-top:4px; padding-top:10px; border-radius:0; }

    .modal-scrim { position:fixed; inset:0; background:rgba(17,17,17,.4); z-index:2147483003; display:none; align-items:center; justify-content:center; }
    .modal-scrim.show { display:flex; }
    .modal { width:460px; max-width:92vw; background:var(--surface); border-radius:var(--radius-md); padding:24px; box-shadow:var(--shadow-pop); max-height:85vh; overflow-y:auto; }
    .modal h3 { margin:0 0 4px; font-size:16px; }
    .modal p { margin:0 0 16px; font-size:12px; color:var(--ink-secondary); }
    .field { margin-bottom:12px; }
    .field label { display:block; font-size:12px; color:var(--ink-secondary); margin-bottom:4px; }
    .field input { all:unset; box-sizing:border-box; width:100%; border-radius:var(--radius-md); box-shadow:inset 0 0 0 1px var(--border-disabled); padding:9px 10px; font-size:13px; color:var(--ink); background:var(--surface); }
    .field select { all:unset; box-sizing:border-box; width:100%; border-radius:var(--radius-md); box-shadow:inset 0 0 0 1px var(--border-disabled); padding:9px 10px; font-size:13px; color:var(--ink); background:var(--surface); cursor:pointer; }
    .field input:focus { box-shadow:inset 0 0 0 2px var(--ikea-blue); }
    .field textarea { all:unset; box-sizing:border-box; display:block; width:100%; min-height:90px; border-radius:var(--radius-md); box-shadow:inset 0 0 0 1px var(--border-disabled); padding:9px 10px; font-size:12px; font-family:monospace; color:var(--ink); background:var(--surface); resize:vertical; line-height:1.5; word-break:break-all; }
    .field textarea:focus { box-shadow:inset 0 0 0 2px var(--ikea-blue); }
    .restore-list { max-height:280px; overflow-y:auto; margin:10px 0 4px; border-radius:var(--radius-md); box-shadow:inset 0 0 0 1px var(--border-disabled); }
    .restore-row { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border-bottom:1px solid var(--border-disabled); cursor:pointer; }
    .restore-row:last-child { border-bottom:none; }
    .restore-row input[type="checkbox"] { width:16px; height:16px; margin-top:2px; accent-color:var(--ikea-blue); cursor:pointer; flex:none; }
    .restore-row-name { font-size:12.5px; font-weight:600; line-height:1.4; }
    .restore-row-meta { font-size:11px; color:var(--ink-secondary); margin-top:2px; }
    .field-row { display:flex; gap:6px; }
    .field-row .btn-outline { height:40px; }
    .toggle-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-bottom:14px; margin-bottom:14px; border-bottom:1px solid var(--border-disabled); }
    .toggle-row-title { font-size:13px; font-weight:600; color:var(--ink); }
    .toggle-row-desc { font-size:11.5px; color:var(--ink-secondary); margin-top:2px; line-height:1.5; }
    .switch { position:relative; display:inline-block; width:40px; height:22px; flex:none; }
    .switch input { position:absolute; opacity:0; width:1px; height:1px; }
    .switch-slider { position:absolute; inset:0; background:var(--border-disabled); border-radius:var(--pill); cursor:pointer; transition:background .15s; }
    .switch-slider::before { content:""; position:absolute; width:16px; height:16px; left:3px; top:3px; background:#fff; border-radius:50%; transition:transform .15s; box-shadow:0 1px 2px rgba(0,0,0,.25); }
    .switch input:checked + .switch-slider { background:var(--ikea-blue); }
    .switch input:checked + .switch-slider::before { transform:translateX(18px); }
    .switch input:focus-visible + .switch-slider { outline:2px solid var(--ikea-blue); outline-offset:2px; }
    .room-manage-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
    .room-manage-head label { margin:0; }
    .restore-link { all:unset; display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600; color:var(--ikea-blue); cursor:pointer; }
    .restore-link:hover { text-decoration:underline; }
    .restore-link svg { width:13px; height:13px; }
    .room-manage { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
    .room-manage .chip { display:flex; align-items:center; gap:4px; cursor:default; padding:6px 10px; }
    .room-manage .chip button { all:unset; cursor:pointer; color:var(--ink-secondary); }
    .room-manage .chip button:hover { color:var(--offer-red); }
    .modal-actions { display:flex; gap:8px; margin-top:16px; }
    .modal-actions .btn { height:44px; font-size:13px; }

    .toast-region { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:2147483004; display:flex; flex-direction:column; gap:8px; align-items:center; }
    .toast { background:var(--ink); color:var(--surface); font-size:13px; font-weight:600; padding:11px 18px; border-radius:var(--pill); box-shadow:var(--shadow-pop); opacity:0; transform:translateY(8px); transition:opacity .2s, transform .2s; max-width:320px; text-align:center; }
    .toast.show { opacity:1; transform:translateY(0); }
    button:focus-visible { outline:2px solid var(--ikea-blue); outline-offset:2px; }
  `;

  const ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    // 真正的齒輪圖示（有齒狀缺口）。先前用的是太陽/日夜切換圖案（圓圈+放射線），
    // 難怪會被誤認成深色模式切換 —— 這裡換成 Feather Icons 的 settings 圖示，並在
    // 按鈕上加了文字「設定」，不是只靠圖示辨識。
    gear:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h3"/></svg>',
    restore:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 17v-5h5"/></svg>',
    // 「補回預設空間」跟「從備份還原」原本共用同一顆 restore 圖示，兩顆都是藍色文字
    // 連結、又都在設定彈窗裡，使用者反應視覺上容易混淆。這裡換一顆語意不同的「＋」
    // 圖示：這個動作其實只會把被刪掉的預設空間補回來（不會動到已經加的商品或自訂
    // 空間），用「加回」的圖示比沿用同一顆「復原」圖示更準確，也跟下面的還原按鈕
    // 一眼就能分開。
    addBack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6.5L12 13l8.5-6.5"/></svg>',
    // 路徑直接取自官網原始碼的收藏愛心（跟主站按鈕同一個形狀），只用在 IKEA Planner
    // 這種沒有原生按鈕可以攔截、需要我們自己補一顆浮動按鈕的頁面。
    heart:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.336 5.52055C14.2336 3.62376 17.3096 3.62401 19.2069 5.52129C20.2067 6.52115 20.6796 7.85005 20.6259 9.15761C20.6151 12.2138 18.4184 14.8654 16.4892 16.6366C15.4926 17.5517 14.5004 18.2923 13.7593 18.8036C13.3879 19.0598 13.0771 19.2601 12.8574 19.3973C12.7475 19.466 12.6601 19.519 12.5992 19.5555C12.5687 19.5737 12.5448 19.5879 12.5279 19.5978L12.5079 19.6094L12.502 19.6129L12.5001 19.614C12.5001 19.614 12.4989 19.6147 11.9999 18.748C11.501 19.6147 11.5005 19.6144 11.5005 19.6144L11.4979 19.6129L11.4919 19.6094L11.472 19.5978C11.4551 19.5879 11.4312 19.5737 11.4007 19.5555C11.3397 19.519 11.2524 19.466 11.1425 19.3973C10.9227 19.2601 10.612 19.0598 10.2405 18.8036C9.49947 18.2923 8.50726 17.5517 7.51063 16.6366C5.58146 14.8654 3.38477 12.2139 3.37399 9.15765C3.32024 7.85008 3.79314 6.52117 4.79301 5.52129C6.69054 3.62376 9.76704 3.62376 11.6646 5.52129L11.9993 5.856L12.3353 5.52129L12.336 5.52055ZM11.9999 17.573C12.1727 17.462 12.384 17.3226 12.6236 17.1573C13.3125 16.6821 14.2267 15.9988 15.1366 15.1634C17.0157 13.4381 18.6259 11.2919 18.6259 9.13506V9.11213L18.627 9.08922C18.6626 8.31221 18.3844 7.52727 17.7926 6.9355C16.6762 5.81903 14.866 5.81902 13.7495 6.9355L13.7481 6.93689L11.9965 8.68166L10.2504 6.9355C9.13387 5.81903 7.3237 5.81903 6.20722 6.9355C5.61546 7.52727 5.33724 8.31221 5.3729 9.08922L5.37395 9.11213V9.13507C5.37395 11.2919 6.98418 13.4381 8.86325 15.1634C9.77312 15.9988 10.6874 16.6821 11.3762 17.1573C11.6159 17.3226 11.8271 17.462 11.9999 17.573Z"/></svg>'
  };

  // 依網域決定幣別符號，同一份程式碼在 ikea.com.tw／ikea.com.hk 都要顯示對的幣別
  const CURRENCY_PREFIX = location.hostname.includes("ikea.com.hk") ? "HK$" : "NT$";

  function fmt(n) {
    return CURRENCY_PREFIX + Math.round(n).toLocaleString("en-US");
  }

  /** 金額輸入框（例如 Planner 手動輸入表單）要邊打邊顯示千分位，type="number" 原生不支援逗號，改用文字輸入框自己格式化 */
  function formatPriceInputValue(raw) {
    const digits = String(raw || "").replace(/[^\d]/g, "");
    return digits ? Number(digits).toLocaleString("en-US") : "";
  }
  function parsePriceInputValue(raw) {
    const digits = String(raw || "").replace(/[^\d]/g, "");
    return digits ? Math.max(0, parseInt(digits, 10)) : 0;
  }
  /** 邊打邊加千分位逗號的同時，把游標維持在使用者剛打的那個數字後面，不要每次都跳到最後面 */
  function onPriceInputFormat(e) {
    const el = e.target;
    const digitsBeforeCursor = el.value.slice(0, el.selectionStart).replace(/[^\d]/g, "").length;
    el.value = formatPriceInputValue(el.value);
    let pos = 0;
    let seen = 0;
    while (pos < el.value.length && seen < digitsBeforeCursor) {
      if (/\d/.test(el.value[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }

  let shadow, els, state;
  const selectedIds = new Set();
  // IKEA Planner 設計組合頁目前正在顯示的浮動按鈕對應商品（非 Planner 頁面時為 null）
  let plannerProduct = null;
  // 手動輸入表單目前是在「編輯」哪個既有項目（null 代表這次送出是新增，不是編輯）
  let plannerEditingItemId = null;

  function mountPanel() {
    if (document.getElementById("__ikea_wishlist_host__")) return;
    const host = document.createElement("div");
    host.id = "__ikea_wishlist_host__";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.className = "root";
    root.innerHTML = `
      <button class="tab" id="tab"><span>採購清單</span><span class="badge" id="tabBadge">0</span></button>
      <div class="scrim" id="scrim"></div>
      <aside class="drawer" id="drawer" aria-label="採購清單面板">
        <div class="drawer-head">
          <div>
            <h2>我的採購清單</h2>
            <p id="headSubtitle">尚未加入商品</p>
          </div>
          <div class="head-actions">
            <button class="settings-btn" id="btnSettings" aria-label="清單設定" title="Email 與空間設定">${ICONS.gear}<span>設定</span></button>
            <button class="icon-btn" id="btnClose" aria-label="關閉">${ICONS.close}</button>
          </div>
        </div>
        <div class="room-chips" id="roomChips"></div>
        <div class="list-toolbar" id="listToolbar">
          <label class="select-all"><input type="checkbox" id="selectAllCheckbox">全選</label>
          <button class="bulk-delete-btn" id="btnBulkDelete" type="button" hidden>${ICONS.trash}<span>刪除已選取（<span id="bulkDeleteCount">0</span>）</span></button>
        </div>
        <div class="item-list" id="itemList"></div>
        <div class="drawer-foot">
          <div class="total-row"><span class="total-label" id="totalLabel">總金額</span><span class="total-value" id="totalValue">${CURRENCY_PREFIX}0</span></div>
          <div class="total-caption">實際金額以官網結帳頁顯示為準，可能因活動或門市庫存調整</div>
          <button class="btn btn-primary" id="btnPdf">${ICONS.pdf}匯出 PDF</button>
          <button class="btn btn-outline" id="btnEmail" style="width:100%">${ICONS.mail}Email 寄送清單內容</button>
          <p class="disclaimer">本工具為非官方小幫手，與 IKEA 官方無關</p>
        </div>
      </aside>
      <div class="modal-scrim" id="settingsScrim">
        <div class="modal">
          <h3>清單設定</h3>
          <div class="field toggle-row">
            <div>
              <div class="toggle-row-title">啟用擴充功能</div>
              <div class="toggle-row-desc">關閉後，商品頁的愛心會恢復官網原本的點擊行為（可能導去登入頁），清單標籤也會先隱藏。要再打開設定，點工具列的擴充功能圖示即可。</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="settingsEnabledToggle" checked>
              <span class="switch-slider"></span>
            </label>
          </div>
          <p>設定寄送信箱，或新增/移除採購空間分類。</p>
          <div class="field"><label>Email 寄送清單時的預設收件人</label><input type="email" id="settingsEmail" placeholder="you@example.com"></div>
          <div class="field">
            <div class="room-manage-head">
              <label>空間分類</label>
              <button class="restore-link" id="btnRestoreRooms" type="button" title="只會把被刪掉的預設空間補回來，不會動到已經加入的商品或你自己新增的空間">${ICONS.addBack}找回預設空間</button>
            </div>
            <div class="room-manage" id="roomManage"></div>
            <div class="field-row">
              <input type="text" id="newRoomInput" placeholder="新增空間，例如：更衣室">
              <button class="btn btn-outline" id="btnAddRoom" style="flex:0 0 auto;padding:0 16px;">新增</button>
            </div>
          </div>
          <button class="restore-link" id="btnOpenRestore" type="button" style="margin:4px 0 4px;">${ICONS.restore}清單被刪了？從備份還原</button>
          <div class="modal-actions">
            <button class="btn btn-outline" id="btnCancelSettings" style="flex:1">取消</button>
            <button class="btn btn-primary" id="btnSaveSettings" style="flex:1;height:44px;font-size:13px;margin-bottom:0">儲存</button>
          </div>
        </div>
      </div>
      <div class="modal-scrim" id="restoreScrim">
        <div class="modal">
          <h3>從備份還原</h3>
          <div id="restoreStepPaste">
            <p>如果清單被不小心刪除，且你有之前匯出的 PDF：打開 PDF，找到最下面「備份資料」那段文字，整段複製後貼在這裡。</p>
            <div class="field"><textarea id="restoreTextarea" placeholder="貼上 PDF 裡的備份文字..."></textarea></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="btnCancelRestore" style="flex:1">取消</button>
              <button class="btn btn-primary" id="btnParseRestore" style="flex:1;height:44px;font-size:13px;margin-bottom:0">解析備份</button>
            </div>
          </div>
          <div id="restoreStepReview" hidden>
            <p id="restoreReviewSummary"></p>
            <div class="restore-list" id="restoreCheckList"></div>
            <div class="modal-actions">
              <button class="btn btn-outline" id="btnBackToPaste" style="flex:1">上一步</button>
              <button class="btn btn-primary" id="btnConfirmRestore" style="flex:1;height:44px;font-size:13px;margin-bottom:0">加入清單</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-scrim" id="plannerAddScrim">
        <div class="modal">
          <h3>加入設計組合到採購清單</h3>
          <p>Planner 設計組合抓不到官網那種商品資料，這幾欄請自己確認或修改。</p>
          <div class="field"><label>商品名稱</label><input type="text" id="plannerAddName" placeholder="例如：BILLY 書櫃組合"></div>
          <div class="field"><label>設計編號</label><input type="text" id="plannerAddArticleNo" placeholder="例如：32GQ6TK"></div>
          <div class="field"><label>金額</label><input type="text" inputmode="numeric" id="plannerAddPrice" placeholder="0"></div>
          <div class="field"><label>加入空間</label><select id="plannerAddRoom"></select></div>
          <div class="modal-actions">
            <button class="btn btn-outline" id="btnCancelPlannerAdd" style="flex:1">取消</button>
            <button class="btn btn-primary" id="btnConfirmPlannerAdd" style="flex:1;height:44px;font-size:13px;margin-bottom:0">加入清單</button>
          </div>
        </div>
      </div>
      <div class="toast-region" id="toastRegion"></div>
      <button class="planner-quick-add" id="plannerQuickAdd" type="button" hidden>${ICONS.heart}<span id="plannerQuickAddLabel">加入採購清單</span></button>
    `;
    shadow.appendChild(root);

    els = {
      tab: shadow.getElementById("tab"),
      tabBadge: shadow.getElementById("tabBadge"),
      scrim: shadow.getElementById("scrim"),
      drawer: shadow.getElementById("drawer"),
      headSubtitle: shadow.getElementById("headSubtitle"),
      roomChips: shadow.getElementById("roomChips"),
      itemList: shadow.getElementById("itemList"),
      totalLabel: shadow.getElementById("totalLabel"),
      totalValue: shadow.getElementById("totalValue"),
      toastRegion: shadow.getElementById("toastRegion"),
      settingsScrim: shadow.getElementById("settingsScrim"),
      settingsEmail: shadow.getElementById("settingsEmail"),
      settingsEnabledToggle: shadow.getElementById("settingsEnabledToggle"),
      roomManage: shadow.getElementById("roomManage"),
      newRoomInput: shadow.getElementById("newRoomInput"),
      selectAllCheckbox: shadow.getElementById("selectAllCheckbox"),
      btnBulkDelete: shadow.getElementById("btnBulkDelete"),
      bulkDeleteCount: shadow.getElementById("bulkDeleteCount"),
      restoreScrim: shadow.getElementById("restoreScrim"),
      restoreStepPaste: shadow.getElementById("restoreStepPaste"),
      restoreStepReview: shadow.getElementById("restoreStepReview"),
      restoreTextarea: shadow.getElementById("restoreTextarea"),
      restoreReviewSummary: shadow.getElementById("restoreReviewSummary"),
      restoreCheckList: shadow.getElementById("restoreCheckList"),
      plannerQuickAdd: shadow.getElementById("plannerQuickAdd"),
      plannerQuickAddLabel: shadow.getElementById("plannerQuickAddLabel"),
      plannerAddScrim: shadow.getElementById("plannerAddScrim"),
      plannerAddName: shadow.getElementById("plannerAddName"),
      plannerAddArticleNo: shadow.getElementById("plannerAddArticleNo"),
      plannerAddPrice: shadow.getElementById("plannerAddPrice"),
      plannerAddRoom: shadow.getElementById("plannerAddRoom"),
      btnConfirmPlannerAdd: shadow.getElementById("btnConfirmPlannerAdd")
    };

    state = { items: [], rooms: storage.DEFAULT_ROOMS.slice(), settings: { defaultEmail: "", rooms: [] }, activeRoom: "全部" };

    wireEvents();
    refresh();
    storage.onChange(refresh);
    logFontSizeDiagnostic();
  }

  /**
   * :host{all:initial; font-size:16px!important} 理論上應該讓面板文字大小完全跟裝在哪個
   * 網站無關，但使用者實測發現 Planner 頁面看起來還是比官網小，代表問題不在我們自己的
   * CSS（那部分已經釘死了）。真正可能的原因分成兩種、但只能用肉眼看不出來是哪一種：
   *   1. Chrome 對這個網域記了不同的頁面縮放比例（縮放會讓 devicePixelRatio 跟著變，
   *      JS 讀得到）——這種情況連 Planner 頁面自己的文字也會一起縮小，不是我們能修的。
   *   2. Planner 頁面自己的版面在某個外層元素用了 CSS zoom／transform:scale() 做響應式
   *      縮放——這種效果 Shadow DOM 擋不住（zoom/transform 是繪製層級的效果，不是一般
   *      CSS 屬性繼承，:host 的 all:initial 對它無效），如果是這個原因，可以用反向縮放
   *      去抵銷，但需要先知道實際縮放比例才能不用猜的。
   * 印出這行診斷，比對兩個頁面的 devicePixelRatio／body zoom／html transform 數值，
   * 就能直接分辨是哪一種、要怎麼修，不用再猜第三次。
   */
  function logFontSizeDiagnostic() {
    // mount() 在 document_start 就會跑，這時候 <html> 已經存在但 <body> 常常還沒解析出來，
    // getComputedStyle(document.body) 傳 null 進去會直接丟出例外——先前沒防到這點，導致
    // 這個診斷 log 本身把整個 mountPanel() 中斷在這裡，afterMount() 後面「判斷是不是
    // Planner 頁面、要不要顯示浮動按鈕」那段就沒機會執行，浮動按鈕因此整個不見了。
    // 診斷用的程式碼不應該有能力弄壞正式功能，這裡補上 try/catch 加 null 檢查雙重防呆。
    try {
      const h2 = shadow.querySelector(".drawer-head h2");
      console.log("[IKEA 採購清單][字體診斷]", {
        網址: location.hostname,
        面板h2實際computed字體: h2 ? getComputedStyle(h2).fontSize : "(找不到元素)",
        devicePixelRatio: window.devicePixelRatio,
        body的CSSzoom: document.body ? getComputedStyle(document.body).zoom || "(無)" : "(body 尚未載入)",
        html的transform: getComputedStyle(document.documentElement).transform
      });
    } catch (e) {
      console.warn("[IKEA 採購清單] 字體診斷本身出錯（不影響面板功能）：", e);
    }
  }

  function wireEvents() {
    els.tab.addEventListener("click", openDrawer);
    els.scrim.addEventListener("click", closeDrawer);
    els.plannerQuickAdd.addEventListener("click", () => {
      if (plannerProduct) openPlannerAddModal(plannerProduct);
      else toast("找不到目前設計的資料，請確認正在編輯或檢視一個設計");
    });
    els.plannerAddScrim.addEventListener("click", (e) => {
      if (e.target === els.plannerAddScrim) closePlannerAddModal();
    });
    els.plannerAddPrice.addEventListener("input", onPriceInputFormat);
    shadow.getElementById("btnCancelPlannerAdd").addEventListener("click", closePlannerAddModal);
    shadow.getElementById("btnConfirmPlannerAdd").addEventListener("click", confirmPlannerAdd);
    shadow.getElementById("btnClose").addEventListener("click", closeDrawer);
    shadow.getElementById("btnPdf").addEventListener("click", onExportPdf);
    shadow.getElementById("btnEmail").addEventListener("click", onEmailList);
    els.selectAllCheckbox.addEventListener("change", onToggleSelectAll);
    els.btnBulkDelete.addEventListener("click", onBulkDelete);

    shadow.getElementById("btnSettings").addEventListener("click", openSettings);
    shadow.getElementById("btnCancelSettings").addEventListener("click", closeSettings);
    shadow.getElementById("btnSaveSettings").addEventListener("click", saveSettings);
    shadow.getElementById("btnAddRoom").addEventListener("click", addRoomFromInput);
    shadow.getElementById("btnRestoreRooms").addEventListener("click", restoreDefaultRooms);
    els.newRoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addRoomFromInput();
    });
    els.settingsScrim.addEventListener("click", (e) => {
      if (e.target === els.settingsScrim) closeSettings();
    });

    shadow.getElementById("btnOpenRestore").addEventListener("click", () => {
      closeSettings();
      openRestoreModal();
    });
    shadow.getElementById("btnCancelRestore").addEventListener("click", closeRestoreModal);
    shadow.getElementById("btnParseRestore").addEventListener("click", parseRestoreText);
    shadow.getElementById("btnBackToPaste").addEventListener("click", () => showRestoreStep("paste"));
    shadow.getElementById("btnConfirmRestore").addEventListener("click", confirmRestore);
    els.restoreScrim.addEventListener("click", (e) => {
      if (e.target === els.restoreScrim) closeRestoreModal();
    });
  }

  function openDrawer() {
    els.drawer.classList.add("open");
    els.scrim.classList.add("show");
    els.tab.classList.add("open");
  }
  function closeDrawer() {
    els.drawer.classList.remove("open");
    els.scrim.classList.remove("show");
    els.tab.classList.remove("open");
  }

  // 修好擷取邏輯之前加進來的舊項目，名稱可能還留著「| IKEA 線上購物」這類網站字樣尾巴，
  // 這裡順手清一次、一次寫回（不要逐筆呼叫 updateItem，那樣每筆都會各自觸發一次
  // storage.onChange → refresh()，多此一舉）。清過一次之後這個 regex 就不會再命中了。
  const SITE_SUFFIX_RE = /\s*\|\s*IKEA[^|]*$/i;
  async function cleanupLegacyNames(items) {
    let changed = false;
    items.forEach((item) => {
      if (SITE_SUFFIX_RE.test(item.name)) {
        item.name = item.name.replace(SITE_SUFFIX_RE, "").trim();
        changed = true;
      }
    });
    if (changed) await storage.setItems(items);
    return items;
  }

  /**
   * 內建空間分類把「其他」改成「玄關」，但這個名字已經寫進舊使用者存好的設定跟商品
   * 資料裡，光改 DEFAULT_ROOMS 這個常數不會回頭去改已經存在的資料——這裡跟
   * cleanupLegacyNames() 一樣，第一次載入時順便檢查、改好就一次寫回去，之後就不會
   * 再找到「其他」了，不需要額外的一次性遷移旗標。
   */
  async function cleanupOtherRoomRename(items, settings) {
    let itemsChanged = false;
    items.forEach((item) => {
      if (item.room === "其他") {
        item.room = "玄關";
        itemsChanged = true;
      }
    });
    if (itemsChanged) await storage.setItems(items);

    if (Array.isArray(settings.rooms) && settings.rooms.includes("其他")) {
      settings = await storage.setSettings({ rooms: settings.rooms.map((r) => (r === "其他" ? "玄關" : r)) });
    }
    return settings;
  }

  async function refresh() {
    let [items, settings] = await Promise.all([storage.getItems(), storage.getSettings()]);
    items = await cleanupLegacyNames(items);
    settings = await cleanupOtherRoomRename(items, settings);
    state.items = items;
    state.settings = settings;
    state.rooms = settings.rooms;
    if (state.activeRoom !== "全部" && !state.rooms.includes(state.activeRoom)) state.activeRoom = "全部";
    // 商品可能已經被移除（例如在別的分頁刪除），選取狀態要跟著清掉，不然刪除已選取
    // 會想刪一個早就不存在的 id
    const validIds = new Set(state.items.map((i) => i.id));
    selectedIds.forEach((id) => {
      if (!validIds.has(id)) selectedIds.delete(id);
    });
    renderChips();
    renderList();
    renderTotals();
    updateToolbar();
    // 擴充功能關閉時把浮動標籤藏起來（回到跟官網一模一樣的畫面），但面板本身
    // 還是可以用工具列圖示強制打開 —— 不然關掉之後就沒有入口可以再打開設定了。
    els.tab.style.display = state.settings.extensionEnabled === false ? "none" : "";
    // 清單內容變了（例如剛把 Planner 商品加進去），順便把浮動按鈕上的文字同步一下
    if (plannerProduct) updatePlannerQuickAddLabel();
  }

  /**
   * 判斷目前這個設計是不是已經在清單裡，優先看 plannerEditingItemId（存/改過一次後就
   * 記住的那筆項目 id，可靠、不受名稱異動影響）；只有從來沒存過（id 是 null）才退回用
   * sameProduct() 拿目前擷取到的資料去比對。不能只靠 sameProduct(plannerProduct)——
   * 如果這個設計沒有設計編號（例如 #/summary 畫面），比對只能靠名稱，使用者一旦透過
   * 表單改了名稱，plannerProduct 裡還是舊的自動擷取名稱，會誤判成「還沒加入」。
   */
  function updatePlannerQuickAddLabel() {
    const inList =
      (plannerEditingItemId && state.items.some((i) => i.id === plannerEditingItemId)) ||
      state.items.some((i) => storage.sameProduct(i, plannerProduct));
    els.plannerQuickAddLabel.textContent = inList ? "已在採購清單中" : "加入採購清單";
  }

  /**
   * Planner 抓到的名稱／金額都只是最佳猜測（金額固定 0，名稱可能是通用字樣），
   * 點浮動按鈕後不直接加入，而是先開這個表單讓使用者自己確認/修改商品名稱、
   * 設計編號、金額，再選要加到哪個空間——比起用可能不準的自動資料默默加進去，
   * 讓使用者自己填一次會更可靠。
   */
  function openPlannerAddModal(product) {
    // 優先用已經記住的項目 id 找既有項目（見 updatePlannerQuickAddLabel 的說明），
    // 找不到才退回用 sameProduct 比對目前擷取到的資料。記住是在編輯哪一筆既有項目，
    // 送出時才能直接改這筆資料本身，而不是刪掉重新加一筆新的（id/加入時間都會變）。
    const existingById = plannerEditingItemId ? state.items.find((i) => i.id === plannerEditingItemId) : null;
    const existing = existingById || state.items.find((i) => storage.sameProduct(i, product));
    plannerEditingItemId = existing ? existing.id : null;
    const base = existing || product;
    els.plannerAddName.value = base.name || "";
    els.plannerAddArticleNo.value = base.articleNo || "";
    els.plannerAddPrice.value = base.price ? formatPriceInputValue(String(base.price)) : "";
    els.plannerAddRoom.innerHTML = state.rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    els.plannerAddRoom.value = base.room && state.rooms.includes(base.room) ? base.room : state.rooms[0];
    els.btnConfirmPlannerAdd.textContent = plannerEditingItemId ? "儲存清單" : "加入清單";
    els.plannerAddScrim.classList.add("show");
  }

  function closePlannerAddModal() {
    els.plannerAddScrim.classList.remove("show");
  }

  async function confirmPlannerAdd() {
    const name = els.plannerAddName.value.trim();
    if (!name) {
      toast("請輸入商品名稱");
      return;
    }
    const room = els.plannerAddRoom.value || state.rooms[0];
    const price = parsePriceInputValue(els.plannerAddPrice.value);
    const articleNo = els.plannerAddArticleNo.value.trim();
    const url = (plannerProduct && plannerProduct.url) || location.href;
    let savedId;
    if (plannerEditingItemId && state.items.some((i) => i.id === plannerEditingItemId)) {
      // 是在改既有項目：直接改這筆資料本身（保留原本的 id／加入時間／數量），
      // 不透過「先移除、再當新商品加入」那條路徑。
      await storage.updateItem(plannerEditingItemId, { name, price, articleNo, room, url });
      savedId = plannerEditingItemId;
      toast(`已更新「${room}」清單`);
    } else {
      const items = await storage.setProductRoom({ name, price, articleNo, url, image: "" }, room);
      savedId = items[items.length - 1].id;
      toast(`已加入「${room}」清單`);
    }
    // 記住剛存的是哪一筆、資料長怎樣：下一次自動擷取（可能還是通用字樣）跑進來時，
    // 浮動按鈕文字不會被打回「加入清單」，見 updatePlannerQuickAddLabel() 的說明。
    plannerEditingItemId = savedId;
    plannerProduct = { name, price, articleNo, url, image: (plannerProduct && plannerProduct.image) || "" };
    closePlannerAddModal();
    updatePlannerQuickAddLabel();
  }

  /**
   * IKEA Planner（設計組合頁）沒有原生的收藏愛心可以攔截，靠 content-script.js
   * 每隔幾秒重新判斷目前網址／標題解析出設計資料後呼叫這裡，顯示一顆浮動按鈕。
   * 點擊後開的是手動輸入表單（openPlannerAddModal），不直接把自動抓到的資料加進去。
   *
   * 這裡會每幾秒被重新呼叫一次（輪詢），如果偵測到設計編號跟上一次不一樣，代表使用者
   * 切去看了另一個設計，這時候才把 plannerEditingItemId 清掉——不然使用者剛存好
   * 設計 A、還沒等到下一次輪詢就切去看設計 B，畫面會誤把設計 A 存的那筆項目當成
   * 設計 B 已經存過。兩邊都沒有設計編號（例如 #/summary 畫面）時沒辦法判斷是不是換了
   * 設計，保守起見當作沒換，避免無謂清空剛建立的追蹤。
   */
  function showPlannerQuickAdd(product) {
    const isDifferentDesign =
      plannerProduct && plannerProduct.articleNo && product.articleNo && product.articleNo !== plannerProduct.articleNo;
    if (isDifferentDesign) plannerEditingItemId = null;
    plannerProduct = product;
    if (!els.plannerQuickAdd) return;
    updatePlannerQuickAddLabel();
    els.plannerQuickAdd.hidden = false;
  }

  function hidePlannerQuickAdd() {
    plannerProduct = null;
    plannerEditingItemId = null;
    if (els.plannerQuickAdd) els.plannerQuickAdd.hidden = true;
    closePop();
  }

  function roomCount(room) {
    return room === "全部" ? state.items.length : state.items.filter((i) => i.room === room).length;
  }
  function roomTotal(room) {
    const list = room === "全部" ? state.items : state.items.filter((i) => i.room === room);
    return list.reduce((s, i) => s + i.price * i.qty, 0);
  }

  function renderChips() {
    const rooms = ["全部", ...state.rooms];
    els.roomChips.innerHTML = "";
    rooms.forEach((room) => {
      const c = roomCount(room);
      const chip = document.createElement("button");
      chip.className = "chip" + (room === state.activeRoom ? " active" : "") + (c === 0 ? " zero" : "");
      chip.textContent = `${room}（${c}）`;
      chip.addEventListener("click", () => {
        state.activeRoom = room;
        renderChips();
        renderList();
        renderTotals();
        updateToolbar();
      });
      els.roomChips.appendChild(chip);
    });
  }

  function renderList() {
    const list = state.activeRoom === "全部" ? state.items : state.items.filter((i) => i.room === state.activeRoom);
    els.itemList.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent =
        state.activeRoom === "全部"
          ? "清單目前是空的，到商品列表頁或商品頁按愛心開始收藏吧！"
          : `「${state.activeRoom}」還沒有商品`;
      els.itemList.appendChild(empty);
      return;
    }
    list.forEach((item) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <input type="checkbox" class="item-checkbox" data-id="${item.id}" ${selectedIds.has(item.id) ? "checked" : ""} aria-label="選取 ${escapeHtml(item.name)}">
        <div class="item-info">
          ${item.url ? `<a class="item-name" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name)}</a>` : `<div class="item-name">${escapeHtml(item.name)}</div>`}
          <div class="item-meta">
            ${item.articleNo && item.articleNo !== "—" ? `<span>貨號 ${escapeHtml(item.articleNo)}</span>` : ""}
            <span class="room-tag" data-id="${item.id}">${item.room} ▾</span>
          </div>
          <div class="qty-row" data-id="${item.id}">
            <button class="qty-btn" data-act="dec">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-act="inc">+</button>
          </div>
        </div>
        <div class="item-right">
          <button class="remove-btn" data-id="${item.id}">${ICONS.trash}</button>
          <button class="item-price" type="button" data-id="${item.id}" title="點一下可以修改單價">${fmt(item.price * item.qty)}</button>
        </div>
      `;
      els.itemList.appendChild(row);
    });

    els.itemList.querySelectorAll(".item-checkbox").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.getAttribute("data-id");
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateToolbar();
      });
    });
    els.itemList.querySelectorAll(".qty-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest(".qty-row").getAttribute("data-id");
        const item = state.items.find((i) => i.id === id);
        if (!item) return;
        item.qty = btn.getAttribute("data-act") === "inc" ? item.qty + 1 : Math.max(1, item.qty - 1);
        await storage.updateItem(id, { qty: item.qty });
      });
    });
    els.itemList.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        selectedIds.delete(btn.getAttribute("data-id"));
        await storage.removeItem(btn.getAttribute("data-id"));
        toast("已從清單移除");
      });
    });
    els.itemList.querySelectorAll(".room-tag").forEach((tag) => {
      tag.addEventListener("click", (e) => {
        e.stopPropagation();
        openRoomPopover(tag, { itemId: tag.getAttribute("data-id") });
      });
    });
    els.itemList.querySelectorAll(".item-price").forEach((priceBtn) => {
      priceBtn.addEventListener("click", () => startEditPrice(priceBtn));
    });
  }

  /**
   * 單價可以直接點擊修改，主要是給 IKEA Planner 設計組合用的：那類商品沒有單一
   * 官網售價可以爬（3D 組合、規格因人而異），加入清單時單價一律預設 0，需要使用者
   * 自己看設計頁的估價後手動填進來；一般商品當然也可以用同一個入口修正金額。
   */
  function startEditPrice(priceBtn) {
    const id = priceBtn.getAttribute("data-id");
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "item-price-input";
    input.min = "0";
    input.step = "1";
    input.value = item.price || "";
    input.placeholder = "單價";
    priceBtn.replaceWith(input);
    input.focus();
    input.select();
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const val = Math.max(0, Math.round(Number(input.value) || 0));
      await storage.updateItem(id, { price: val });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      else if (e.key === "Escape") {
        committed = true;
        renderList();
      }
    });
    input.addEventListener("blur", commit);
  }

  function renderTotals() {
    const total = roomTotal(state.activeRoom);
    els.totalLabel.textContent = state.activeRoom === "全部" ? "總金額" : `${state.activeRoom} 小計`;
    els.totalValue.textContent = fmt(total);
    els.headSubtitle.textContent =
      state.items.length === 0 ? "尚未加入商品" : `${state.items.length} 項商品・${fmt(roomTotal("全部"))}`;
    els.tabBadge.textContent = String(state.items.length);
  }

  // ---- 複選 / 全選 / 刪除已選取 ----
  function visibleItems() {
    return state.activeRoom === "全部" ? state.items : state.items.filter((i) => i.room === state.activeRoom);
  }
  /** 全選 checkbox 只操作「目前篩選出來看得到」的項目，跨空間刪除清單裡累積選取的其他項目不受影響 */
  function updateToolbar() {
    const visible = visibleItems();
    const visibleSelectedCount = visible.filter((i) => selectedIds.has(i.id)).length;
    els.selectAllCheckbox.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    els.selectAllCheckbox.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
    els.bulkDeleteCount.textContent = String(selectedIds.size);
    els.btnBulkDelete.hidden = selectedIds.size === 0;
  }
  function onToggleSelectAll() {
    const visible = visibleItems();
    if (els.selectAllCheckbox.checked) {
      visible.forEach((i) => selectedIds.add(i.id));
    } else {
      visible.forEach((i) => selectedIds.delete(i.id));
    }
    renderList();
    updateToolbar();
  }
  async function onBulkDelete() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    selectedIds.clear();
    await storage.removeItems(ids);
    toast(`已刪除 ${ids.length} 項商品`);
  }

  // ---- room popover：用於官網愛心按鈕攔截後 / 清單項目的空間標籤 ----
  let activePop = null;
  function closePop() {
    if (activePop) {
      activePop.remove();
      activePop = null;
      document.removeEventListener("click", onDocClickClosePop, true);
    }
  }
  function onDocClickClosePop(e) {
    if (activePop && !activePop.contains(e.target)) closePop();
  }

  function openRoomPopover(anchorEl, opts) {
    closePop();
    const rect = anchorEl.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "pop";
    let top = rect.bottom + 6;
    if (top + 280 > window.innerHeight) top = rect.top - 8 - 260;
    pop.style.top = Math.max(8, top) + "px";
    pop.style.left = Math.min(window.innerWidth - 208, Math.max(8, rect.left - 150)) + "px";

    const label = document.createElement("div");
    label.className = "pop-label";
    label.textContent = "加入到哪個空間？";
    pop.appendChild(label);

    state.rooms.forEach((room) => {
      const b = document.createElement("button");
      b.textContent = room;
      b.addEventListener("click", async () => {
        if (opts.product) {
          await storage.setProductRoom(opts.product, room);
          toast(`已加入「${room}」清單`);
        } else if (opts.itemId) {
          await storage.updateItem(opts.itemId, { room });
        }
        closePop();
      });
      pop.appendChild(b);
    });

    if (opts.product && state.items.some((i) => storage.sameProduct(i, opts.product))) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "danger";
      removeBtn.textContent = "移除收藏";
      removeBtn.addEventListener("click", async () => {
        await storage.removeProduct(opts.product);
        toast("已移除收藏");
        closePop();
      });
      pop.appendChild(removeBtn);
    }

    shadow.querySelector(".root").appendChild(pop);
    activePop = pop;
    setTimeout(() => document.addEventListener("click", onDocClickClosePop, true), 0);
  }

  // ---- settings ----
  function renderRoomManage() {
    els.roomManage.innerHTML = "";
    state.rooms.forEach((room) => {
      const count = roomCount(room);
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `${room} (${count})`;
      if (count === 0) {
        const del = document.createElement("button");
        del.textContent = "✕";
        del.title = "移除此空間";
        del.addEventListener("click", async () => {
          state.rooms = state.rooms.filter((r) => r !== room);
          renderRoomManage();
        });
        chip.appendChild(del);
      }
      els.roomManage.appendChild(chip);
    });
  }
  function openSettings() {
    els.settingsEmail.value = state.settings.defaultEmail || "";
    els.settingsEnabledToggle.checked = state.settings.extensionEnabled !== false;
    renderRoomManage();
    els.settingsScrim.classList.add("show");
  }
  function closeSettings() {
    els.settingsScrim.classList.remove("show");
  }
  function addRoomFromInput() {
    const name = els.newRoomInput.value.trim();
    if (!name) return;
    if (!state.rooms.includes(name)) state.rooms.push(name);
    els.newRoomInput.value = "";
    renderRoomManage();
  }
  /** 把預設的 8 個空間補回來（不會動到已刪除的商品，也不會影響自訂新增的空間） */
  /** 只會把目前空間清單裡缺少的預設空間補回來，不會刪除任何自訂空間或動到商品 */
  function restoreDefaultRooms() {
    storage.DEFAULT_ROOMS.forEach((room) => {
      if (!state.rooms.includes(room)) state.rooms.push(room);
    });
    renderRoomManage();
    toast("已把預設空間補回來");
  }
  async function saveSettings() {
    await storage.setSettings({
      defaultEmail: els.settingsEmail.value.trim(),
      rooms: state.rooms,
      extensionEnabled: els.settingsEnabledToggle.checked
    });
    closeSettings();
    toast(els.settingsEnabledToggle.checked ? "設定已儲存" : "已暫停擴充功能，商品頁的愛心恢復官網原本行為");
  }

  // ---- 備份與還原：PDF 匯出時把清單編碼成一段純 ASCII 文字嵌進去，清單被誤刪的話，
  // 從 PDF 裡把那段文字複製回來貼在這裡就能救回。用 base64 而不是直接放中文，是因為
  // 瀏覽器印出 PDF 時，中文很可能是用內嵌字型的字符索引畫出來的，不一定能被可靠地
  // 複製回原本的文字；base64 全部是 ASCII，PDF 文字圖層對這種內容的還原一向可靠。
  const BACKUP_MARKER = "IKEAWISHLIST_BACKUP_V1:";

  function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }
  function fromBase64Utf8(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function buildBackupText() {
    const payload = {
      v: 1,
      market: storage.currentMarket(),
      exportedAt: Date.now(),
      items: state.items.map((i) => ({
        name: i.name,
        price: i.price,
        qty: i.qty,
        room: i.room,
        articleNo: i.articleNo,
        url: i.url,
        image: i.image
      }))
    };
    return BACKUP_MARKER + toBase64Utf8(JSON.stringify(payload));
  }

  let restoreParsedItems = [];

  function openRestoreModal() {
    els.restoreTextarea.value = "";
    showRestoreStep("paste");
    els.restoreScrim.classList.add("show");
  }
  function closeRestoreModal() {
    els.restoreScrim.classList.remove("show");
  }
  function showRestoreStep(step) {
    els.restoreStepPaste.hidden = step !== "paste";
    els.restoreStepReview.hidden = step !== "review";
  }

  function parseRestoreText() {
    const raw = els.restoreTextarea.value;
    const idx = raw.indexOf(BACKUP_MARKER);
    if (idx === -1) {
      toast("找不到備份標記，請確認整段複製貼上");
      return;
    }
    // PDF 裡這段文字通常會換行顯示，從 PDF 複製出來時可能夾帶換行/空白，
    // base64 本身不會有空白字元，直接全部拿掉最安全。
    const b64 = raw.slice(idx + BACKUP_MARKER.length).replace(/\s+/g, "");
    let payload;
    try {
      payload = JSON.parse(fromBase64Utf8(b64));
    } catch (e) {
      toast("備份資料損壞或不完整，請確認整段複製貼上");
      return;
    }
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
      toast("這份備份沒有可以還原的商品");
      return;
    }
    restoreParsedItems = payload.items;
    renderRestoreReview();
    showRestoreStep("review");
  }

  function renderRestoreReview() {
    els.restoreReviewSummary.textContent = `找到 ${restoreParsedItems.length} 項商品，取消勾選可以不匯入：`;
    els.restoreCheckList.innerHTML = "";
    restoreParsedItems.forEach((item, idx) => {
      const row = document.createElement("label");
      row.className = "restore-row";
      row.innerHTML = `
        <input type="checkbox" checked data-idx="${idx}">
        <span>
          <div class="restore-row-name">${escapeHtml(item.name)}</div>
          <div class="restore-row-meta">${escapeHtml(item.room || "其他")}・${fmt(item.price || 0)} x${item.qty || 1}</div>
        </span>
      `;
      els.restoreCheckList.appendChild(row);
    });
  }

  async function confirmRestore() {
    const checked = Array.from(els.restoreCheckList.querySelectorAll("input[type='checkbox']:checked")).map(
      (cb) => restoreParsedItems[Number(cb.getAttribute("data-idx"))]
    );
    if (checked.length === 0) {
      toast("沒有勾選任何商品");
      return;
    }
    await storage.importItems(checked);
    closeRestoreModal();
    toast(`已匯入 ${checked.length} 項商品`);
  }

  // ---- actions: PDF / Email ----
  function buildPrintableDocument() {
    const now = new Date().toLocaleString("zh-TW");
    let body = "";
    state.rooms
      .filter((r) => roomCount(r) > 0)
      .forEach((room) => {
        const list = state.items.filter((i) => i.room === room);
        body += `<h2>${escapeHtml(room)}　<small>小計 ${fmt(roomTotal(room))}</small></h2><table>
          <thead><tr><th>商品</th><th>貨號</th><th>單價</th><th>數量</th><th>小計</th></tr></thead><tbody>`;
        list.forEach((i) => {
          body += `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.articleNo || "-")}</td><td>${fmt(i.price)}</td><td>${i.qty}</td><td>${fmt(i.price * i.qty)}</td></tr>`;
        });
        body += `</tbody></table>`;
      });
    // 直接連到官網自己 host 的 logo 檔案（/webroot/img/logos/IKEA_logo.svg，TW／HK 都實測
    // 存在同一個路徑），不是複製一份官方素材塞進擴充功能裡。連不到的話（離線、路徑改版）
    // 用 onerror 換成純文字色塊，不會整個版面壞掉。
    // 網域故意不用 location.hostname：在 planner.ikea.com.tw 按「匯出 PDF」時
    // location.hostname 會是 planner.ikea.com.tw，那個網域下根本沒有這個 webroot 路徑
    // （Planner 是完全不同的另一套系統），導致每次從 Planner 匯出都直接觸發 onerror、
    // logo 一律變成純文字色塊——改成依商品所屬市場（TW/HK）固定連到對應的官網主站，
    // 不管是從哪個頁面按下匯出都會拿到同一個、真的存在的 logo 網址。
    const logoHost = storage.currentMarket() === "HK" ? "www.ikea.com.hk" : "www.ikea.com.tw";
    const logoUrl = `https://${logoHost}/webroot/img/logos/IKEA_logo.svg`;
    return `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><title>IKEA 採購清單</title>
      <style>
        body{font-family:-apple-system,"Microsoft JhengHei",sans-serif;color:#111;padding:32px;max-width:720px;margin:0 auto;}
        .doc-header{display:flex;justify-content:space-between;align-items:flex-start;}
        h1{color:#0058A3;margin:0;font-size:22px;}
        .logo-img{height:36px;width:auto;}
        .logo-fallback{display:none;align-items:center;justify-content:center;height:36px;padding:0 14px;background:#0058A3;color:#FFDB00;font-weight:800;font-size:15px;border-radius:3px;letter-spacing:.5px;}
        .meta{color:#68707A;font-size:13px;margin:6px 0 24px;}
        h2{font-size:15px;border-bottom:2px solid #0058A3;padding-bottom:6px;margin-top:28px;}
        h2 small{color:#68707A;font-weight:400;font-size:12px;float:right;}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;}
        th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #DEE1E4;}
        th{color:#68707A;font-weight:600;}
        .grand{margin-top:24px;text-align:right;font-size:18px;font-weight:800;color:#0058A3;}
        .backup-block{margin-top:32px;padding-top:14px;border-top:1px dashed #DEE1E4;}
        .backup-label{font-size:10px;color:#68707A;margin-bottom:4px;}
        .backup-text{font-size:8px;font-family:"Courier New",monospace;color:#AAAAAA;word-break:break-all;line-height:1.6;}
        .footer-note{margin-top:16px;font-size:10.5px;color:#929292;text-align:center;}
        @media print{ body{padding:0;} }
      </style></head><body>
      <div class="doc-header">
        <h1>IKEA 採購清單</h1>
        <div>
          <img class="logo-img" src="${logoUrl}" alt="IKEA" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <div class="logo-fallback">IKEA</div>
        </div>
      </div>
      <div class="meta">產生時間：${now}</div>
      ${body}
      <div class="grand">總金額：${fmt(roomTotal("全部"))}</div>
      <div class="backup-block">
        <div class="backup-label">◆ 備份資料 —— 清單如果不小心被刪除，整段複製下面這串文字，貼到擴充功能設定裡的「從備份還原」即可救回：</div>
        <div class="backup-text">${escapeHtml(buildBackupText())}</div>
      </div>
      <div class="footer-note">本清單由非官方小幫手產生，與 IKEA 官方無關</div>
      </body></html>`;
  }

  function onExportPdf() {
    if (state.items.length === 0) {
      toast("清單是空的");
      return;
    }
    // 注意：不能加 noopener —— 加了之後 window.open() 一定回傳 null（規格就是這樣設計的，
    // 用來阻斷新視窗拿到 opener 參照），但我們後面需要 w.document.write()/w.print()，
    // 一定要拿到真正的視窗參照，所以這裡不能用 noopener。
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast("瀏覽器封鎖了新視窗，請允許彈出視窗後再試一次");
      return;
    }
    w.document.write(buildPrintableDocument());
    w.document.close();
    w.focus();
    setTimeout(() => {
      try {
        w.print();
      } catch (e) {
        /* 使用者可自行在新分頁按 Ctrl+P 另存為 PDF */
      }
    }, 350);
    toast("已開啟列印視窗，選擇「另存為 PDF」即可儲存清單");
  }

  function onEmailList() {
    if (state.items.length === 0) {
      toast("清單是空的");
      return;
    }
    // 刻意不連動呼叫 onExportPdf()：兩個按鈕各自獨立，只做自己說的那件事，
    // 需要 PDF 附件的話請另外按「匯出 PDF」。
    const lines = [];
    state.rooms
      .filter((r) => roomCount(r) > 0)
      .forEach((room) => {
        lines.push(`【${room}】小計 ${fmt(roomTotal(room))}`);
        state.items
          .filter((i) => i.room === room)
          .forEach((i) => lines.push(`・${i.name} x${i.qty}　${fmt(i.price * i.qty)}`));
      });
    lines.push("", `總金額：${fmt(roomTotal("全部"))}`);
    let body = lines.join("\n");
    if (body.length > 1500) body = body.slice(0, 1500) + "\n…（清單較長，已截斷，完整內容請另外按「匯出 PDF」查看）";
    const to = state.settings.defaultEmail || "";
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("IKEA 採購清單")}&body=${encodeURIComponent(body)}`;
    const a = document.createElement("a");
    a.href = mailto;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("已開啟郵件軟體，清單內容已帶入信件");
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    els.toastRegion.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 220);
    }, 2600);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- 供 content-script.js 呼叫的公開 API ----
  global.__ikeaPanel = {
    mount: mountPanel,
    toggle: () => (els.drawer.classList.contains("open") ? closeDrawer() : openDrawer()),
    open: openDrawer,
    /**
     * 官網原生愛心按鈕被攔截點擊後呼叫這裡：在按鈕旁邊開一個「選空間」彈窗，
     * product = { name, price, image, articleNo, url }
     */
    openFavoritePopover: (anchorEl, product) => {
      openRoomPopover(anchorEl, { product });
    },
    /** 攔截到點擊，但抓不到商品名稱/價格時呼叫這裡，讓使用者至少知道發生了什麼事 */
    notifyExtractionFailed: () => toast("無法辨識這個商品的資料，請到商品頁後再試一次"),
    /** IKEA Planner 設計組合頁：顯示/隱藏浮動的「加入採購清單」按鈕 */
    showPlannerQuickAdd,
    hidePlannerQuickAdd
  };
})(window);
