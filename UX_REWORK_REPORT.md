# RE-Biz UX Rework Report

日期：2026-09-01
範圍：前端 UX / 互動 / 資訊架構
稽核前記錄：[UX_AUDIT.md](UX_AUDIT.md)

驗證方式：本機 dev server 實際登入、逐一走完每個模組的完整流程（含列印輸出、手機版、檢視者權限、平台管理與功能開關），並執行 `npm run lint`、`npx tsc --noEmit`、`npm test`（17/17 通過）與 `npm run build`。

---

## 1. 原本的主要 UX 問題

按嚴重程度，稽核時實際確認的問題：

**四個功能的儲存永遠失敗（前端 payload 錯誤，已用 API 逐一驗證）**
前端把整個 state 物件送出，而這些 API 的 zod schema 都是 `.strict()`：

| 操作 | 多送的欄位 | 實測 |
| --- | --- | --- |
| 公司資料 → 儲存 | `id` `currency` `role` `status` `hasLogo` `hasSealImage` `receiptTemplate` `timeZone` | `400 公司資料格式不正確。` |
| 客戶主檔 → 新增 | `id`（`blankCustomer()` 帶 `id: ""`）、`status` | `400 客戶資料格式不正確。` |
| 客戶主檔 → 編輯 | `id` `status` `createdAt` `updatedAt` | `400` |
| 常用品項 → 新增／編輯 | `id` | `400 品項資料格式不正確。` |
| 請款單 → 編輯草稿 | 品項的 `subtotal` | `400 請款單資料格式不正確。` |

也就是說「客戶主檔」與「常用品項」透過 UI 完全不能用，公司抬頭改不了，請款單草稿存不回去。

**21 個畫面共用一個 URL**
使用者端只有 `/` 這一個 route，所有畫面切換都是 `useState`。後果：上一頁會離開整個系統、重新整理一定回到總覽、無法把一張報價單傳給同事、分頁標題永遠一樣、無法做 breadcrumb。

**主資料被藏在報價單的篩選列裡**
`客戶主檔`、`常用品項`、`公司資料` 是報價單頁搜尋框旁的三顆 11px 小按鈕，長得像篩選器。

**回饋不完整**
0 個 toast；5 種不同的 inline 訊息機制；訊息位置每頁不同；客戶／品項／狀態變更沒有 pending 鎖，可連點兩次；收據與記帳列表在載入完成前直接顯示「還沒有資料」。

**動作層級混亂**
報價單詳情頁有 4 顆同權重的 `text-button`（含把「返回列表」做成動作按鈕）＋一排 secondary ＋一顆 primary；三種不同的主按鈕樣式；三個列表頁完全沒有主按鈕。

**其他**
表單只在 submit 時給一句籠統錯誤、沒有未儲存保護、6 處 `window.confirm`、4 套狀態徽章（其中品項「已停用」誤用「報價被拒絕」的紅色）、手機版列表一律強制橫向捲動、後端已存在的「由報價單建立收據草稿」沒有任何入口、feature flag 關閉後只會噴紅字 403、19 處裝飾性英文 eyebrow。

---

## 2. 修改內容

### 修好讓功能無法完成的前端錯誤

- 公司資料、客戶、品項、請款單草稿一律只送 schema 允許的欄位。新增 `components/features/customers/customer-fields.ts` 與 `toLinePayload()` 把「可送出的欄位」變成型別，避免同類錯誤再發生。
- 為既有但無入口的 `POST /api/quotes/[id]/receipt` 補上「建立收據草稿」按鈕（在已接受報價單的「更多 ⋯」中）。
- 收據建立成功後鎖住主按鈕（改為「已建立」＋「再開一張」），避免同一張收據被派兩個號。

以上都只改前端送出的資料與畫面，沒有動任何 route handler、schema 或 collection。

### 建立共用 UX 層

新增 `components/app/`（19 個 component），全系統共用：

`AppShell` / `NavLink` / `navigation.ts`（IA 單一來源）/ `PageHeader` / `Breadcrumb` / `HowToUse` / `EmptyState`（含 `NoResults`、`FeatureDisabled`、`ReadOnlyNotice`）/ `DataTable`（桌機表格 ↔ 手機卡片）/ `ListToolbar` / `RowActions` / `StatusBadge` / `Button` / `form.tsx`（`Field` / `TextareaField` / `SelectField` / `ReadOnlyField` / `CheckboxField` / `FormSection` / `FormGrid` / `Disclosure` / `FormActions` / `FormError`）/ `Modal` / `ConfirmProvider` + `useConfirm()` / `DirtyGuardProvider` + `useUnsavedChanges()` / `ToastHost` + `notify` / `Card` / `Stat` / `SummaryList` / `RelatedDocuments` / `NextStep` / `SkeletonRows` / `LoadError` / `Callout` / `WorkspaceProvider`。

新增 `lib/`：`format.ts`（原本 3 份重複的金額／日期格式化）、`status.ts`（全系統狀態、角色與功能詞彙）、`api.ts`（原本 3 份重複的 fetch 包裝，含 401 自動導回登入、403 判斷）、`help-content.ts`（各頁使用說明）、`receipt-form.ts`、`organization-assets.ts`、`types/records.ts`。

### 拆掉單體

`app/page.tsx`（1207 行）、`components/quotation-workspace.tsx`（2037 行）、`components/invoice-workspace.tsx` 拆成 27 個 feature component 與 31 個 route。業務邏輯（狀態機、派號、快照、權限判斷）逐段搬移，沒有改變行為。

統計：新增 84 個程式檔（＋本文與 UX_AUDIT.md）、修改 16 個、刪除 3 個。
另新增 `.claude/launch.json`（`npm run dev` 的啟動設定，只用於開發，可自行決定是否納入版控）。

---

## 3. Navigation 改動

### 之前

```
/  ← 21 個畫面共用

側邊欄：
工作區   總覽 / 收支記帳 / 收據中心 / 報價單 / 請款單 / ＋新增收據   ← 動作混在目的地裡
設定     成員與權限 / 收據樣式                                    ← 公司資料不在這裡
平台     Platform Admin                                          ← 英文，另一個 app

客戶主檔 / 常用品項 / 公司資料 → 藏在報價單頁的篩選列
```

### 之後

```
總覽              /dashboard

收款與帳務
  收據            /receipts   ·   /receipts/new
  收支記帳         /ledger

銷售文件
  報價單          /quotes  ·  /quotes/new  ·  /quotes/[id]  ·  /quotes/[id]/edit
  請款單          /invoices  ·  /invoices/new  ·  /invoices/[id]  ·  /invoices/[id]/edit

基本資料
  客戶            /customers  ·  /customers/[id]
  商品與服務        /items

設定
  公司資料         /settings/company
  收據樣式         /settings/receipt-template
  成員與權限        /settings/members
  我的帳號         /settings/account
  平台管理 ↗       /admin                （僅平台管理者可見）

帳號
  /login  ·  /register  ·  /change-password  ·  /workspace-suspended
```

具體改動：

- **21 畫面 → 31 個真實 route**，可分享、可重新整理、上一頁行為正確、每頁有自己的 `<title>`。
- **Session gate 移到 server layout**（`app/(workspace)/layout.tsx` 用 `getCurrentUser()`）。不再有「先閃登入畫面再進系統」；`mustChangePassword` 與 workspace 停用改為 server redirect。
- **「收據中心」→「收據」**；「＋新增收據」離開側邊欄，改為收據頁的 Primary Action 與總覽的快速開始。
- **客戶、商品與服務升到頂層**；**公司資料搬進「設定」**，與「收據樣式」同組。
- **側邊欄依工作分 5 組**，active 態由網址決定（`aria-current="page"`）。
- **Breadcrumb**：深度 ≥2 才出現（`報價單 / QUO-202609-0001 / 編輯`、`設定 / 公司資料`）。
- **手機版**：橫向捲動列 → topbar `☰ ＋ 當前頁名` ＋ 抽屜（分組導覽 ＋ 公司／身分）。
- **側邊欄導覽有未儲存變更時先確認**（見下）。
- **平台管理併回同一套 shell 與 component**，加上「平台管理」標記與「返回我的工作區」。
- 新增 `not-found.tsx` 與工作區 `error.tsx`；`/settings` 依角色轉向。
- 深層連結：`/receipts?status=pending`、`/quotes?status=accepted`、`/invoices?status=overdue` 等，總覽的待處理清單直接帶你到已套好篩選的列表。

---

## 4. Workflow 改動

### 收據

之前：側邊欄「新增收據」→ 同一畫面同時是列表＋單張表單＋批量表單＋預覽 → 儲存 → 一行綠字。
之後：

```
收據列表（搜尋／狀態篩選／每列 下載 PDF ＋ 更多⋯）
  → 開立收據（單張 / 批量 分頁）
  → 欄位級驗證，錯誤聚焦第一個欄位
  → 儲存並輸出 PDF
  → toast「收據 RC-… 已建立」＋ 頁內成功面板：再開一張 / 重新開啟列印視窗 / 前往收據列表
```

- 收款方資料改為 progressive disclosure（已由公司帶入，只有要改這一張才展開）。
- 付款人地址與備註收進「加上付款人地址與備註」。
- 批量頁的 5 段說明文字改成：一段導語 ＋「欄位格式與可填寫的值」disclosure，主按鈕顯示實際筆數（「建立 2 張收據並輸出 PDF」）。
- 已存收據可從列表重新輸出 PDF（原本只有含品項明細的收據、且按鈕藏在 `<details>` 內）。
- 「確認收款」的確認對話框寫出後果：會列入收入、且不能改回待收款。

### 報價單 → 請款單 → 收據 → 記帳

實際走過的完整流程（本次驗證）：

```
建立報價單（選客戶 → 收合成唯讀摘要卡）
  → 加品項（可從常用品項帶入，小計即時計算）
  → 儲存為草稿  → toast「報價單 QUO-202609-0001 已建立」→ 轉到詳情頁
  → [草稿] Primary：標示為已發送     （確認框說明：之後不能再編輯）
  → [已發送] Primary：客戶已接受      更多⋯：客戶已拒絕
  → [已接受] Primary：轉為請款單      更多⋯：建立收據草稿 / 複製為新草稿
  → 已轉出後 Primary 變成「開啟請款單 INV-202609-0001」，並列出關聯文件
  → 收據草稿（待收款）→ 收據頁「確認已收款」→ 自動成為收支記帳的收入
```

- **每個狀態只有一個 Primary Action**，破壞性與少用動作收進「更多 ⋯」。
- **「返回列表」不再是按鈕**，由 breadcrumb 承擔。
- **關聯文件互相可點**：報價單 ↔ 請款單 ↔ 收據。
- **「下一步」一句話**寫在摘要下方，依狀態變化（例如「客戶已接受。可以轉為請款單，或在『更多』中建立待收款的收據草稿。」）。
- 已發送／已作廢的文件進入編輯頁時，顯示「已經不是草稿」的說明與替代做法（複製為新草稿），而不是讓 API 回一個 409。

### 客戶與商品

之前：表單永遠展開在清單上方，新增／編輯共用且只有按鈕文字不同，而且兩者都存不進去。
之後：清單為主 → 「新增客戶」開 dialog，標題明確寫「新增客戶」或「編輯 ABC Trading」→ 儲存後 toast ＋ 清單重新載入。客戶有自己的詳情頁（摘要 ＋ 地址 ＋ 內部備註 ＋ 相關報價單 ＋ 建立/更新時間）。

### 記帳

之前：左側常駐表單 ＋ 右側清單。
之後：三個統計數字 ＋ 工具列（搜尋、全部／只看收入／只看支出）＋ 清單；「新增收支紀錄」開 dialog。統計數字在載入完成前顯示「—」而不是 `0.00`。

---

## 5. Component 改動

### Reuse（沿用未改）
- 全部 `app/api/**` route handler、`lib/*-store.ts`、所有 zod schema、MongoDB collection 與索引
- `lib/receipt-template.ts`、`lib/quotation.ts`、`lib/invoice.ts`、`lib/money.ts`、`lib/auth.ts`、`lib/platform-admin.ts`
- `globals.css` 的文件排版層：`.receipt-paper` 全套、`.company-seal` 全套、`.quote-paper` 全套、A4 print 規則（原樣保留，列印輸出與之前一致）
- `sonner`（已安裝未用 → 啟用為全系統 toast）

### Create
`components/app/`（19 個共用 component）、`components/features/**`（27 個模組 component）、`lib/{format,status,api,help-content,receipt-form,organization-assets}.ts`、`types/records.ts`、`components/admin/admin-nav.tsx`。

### Modify
- `app/layout.tsx`：metadata、`ToastHost`
- `app/page.tsx`：1207 行單體 → 12 行 server redirect
- `app/globals.css`：重整為 10 層（tokens / base / shell / page / forms / lists / feedback / dashboard / documents / responsive+print）
- `app/admin/**`（7 個檔案）＋ `app/admin/admin.css`：改用主系統 token 與 component，admin.css 從 16 行密集單行 CSS 變成只保留佈局差異
- `components/admin/{presentation.ts,user-status-button.tsx,workspace-controls.tsx}`：狀態詞彙移到 `lib/status.ts`，改用 `Button` / `StatusBadge` / `useConfirm` / `notify`

### Delete
- `components/quotation-workspace.tsx`（2037 行）、`components/invoice-workspace.tsx`、`components/page-guidance.tsx`
- `globals.css` 中隨舊 markup 消失的 selector（`.mode-switch`、`.workspace`、`.editor-panel`、`.preview-column`、`.saved-receipts`、`.master-list`、`.quotation-tools`、`.database-note`…）
- `components/ui/**` 的 66 個 shadcn component **保留未動**（本次不在範圍；它們原本也完全沒有被使用）

### 狀態系統
4 套實作 → 1 套。`lib/status.ts` 一張表定義 10 個 domain（報價單／請款單／收據／客戶／品項／成員／工作區／平台帳號／收支／功能開關）的 label、tone 與說明；`<StatusBadge domain value withHint />` 是唯一的渲染方式。同時修掉「品項已停用」誤用紅色的語意錯誤，並把「停用」依對象拆成「已下架」（品項）、「已停權」（成員）、「已暫停」（工作區）、「已停用」（平台帳號）。

---

## 6. Responsive 改動

- **導覽**：≤900px 改為抽屜（`<dialog>`，原生 focus trap 與 Esc），topbar 顯示 `☰ ＋ 當前頁名`；不再是 8 顆按鈕的橫向捲動列。
- **列表**：`DataTable` 在 ≤900px 用同一份 column 定義改渲染卡片（主識別 ＋ 狀態 badge ＋ 金額 ＋ 次要欄位 ＋ 動作）。實測手機 375px 下 `document.scrollWidth === 375`，**沒有任何橫向捲動**（原本收據列表 `min-width: 760px`）。
- **表單**：`fgrid` 全部收成單欄，`field-span` 取消，主按鈕與 `factions` 撐滿寬度。
- **Detail page**：動作改為直排，Primary 用 `order: -1` 移到最上方。
- **報價單／請款單品項**：每列是有序號、有邊界、有自己小計的卡片，上移／下移／刪除為 30px 的 icon 按鈕組。
- **文件**：`.receipt-paper` / `.quote-paper` 在小螢幕縮小內距、標題區改直排，仍不橫向捲動。
- 平台管理的寬表格刻意保留表格形式，包在自己的 `overflow-x: auto` 容器內（它是參照用的寬表，不是任務清單）。

### 其他品質底線
- 全域 `:focus-visible` 輪廓；深色表面（active 導覽、primary/danger 按鈕）改用白色輪廓
- 「跳到主要內容」skip link
- `prefers-reduced-motion` 下停用 spinner、skeleton shimmer 與過場
- 表單欄位 `label`/`id`/`aria-describedby`/`aria-invalid`/`aria-required` 自動接好；錯誤訊息 `role="alert"`
- 載入區塊 `aria-busy` ＋ `aria-live="polite"` ＋ sr-only 說明

---

## 7. 尚未處理的 UX Debt

1. **沒有 i18n 架構。** 原本就沒有，本次也沒有引入（依指示不擅自加架構）。已把狀態／角色／功能詞彙集中到 `lib/status.ts`、使用說明集中到 `lib/help-content.ts`，是之後接 i18n 最省力的兩個切入點；頁面內文仍是 inline 字串。
2. **側邊欄仍會顯示已被平台管理者關閉的功能。** Session API 不回傳 workspace feature flags，前端無法預先知道。目前的處理是點進去看到「這個功能未開放給這個工作區」的說明狀態（已驗證），而不是紅字 403。要真正在側邊欄隱藏，需要在 `/api/auth/session` 的回應加上 features 欄位——屬於後端改動，本次未做。
3. **收據沒有分頁，也沒有伺服器端搜尋。** `/api/receipts` 硬編 `.limit(20)`。目前在畫面上明確標示「系統保留最近 20 張收據」，搜尋與篩選是前端在這 20 筆內進行。記帳同理（100 筆）。要支援長期資料需要後端加分頁參數。
4. **收據沒有詳情頁。** API 沒有「依 id 取單張收據」的 GET，所以「檢視收據內容」用 dialog 呈現列表已載入的資料，網址無法分享單張收據。
5. **未儲存保護不涵蓋瀏覽器上一頁。** 已涵蓋：關閉／重新整理分頁（`beforeunload`）、側邊欄／抽屜導覽、編輯器的「取消」。App Router 沒有可攔截的返回導覽事件，用瀏覽器上一頁離開編輯器仍會靜默丟棄輸入。
6. **`npm run typecheck` 會出現一個既有錯誤**（`.next/dev/types/app/api/items/route.ts`）。原因是 `app/api/items/route.ts` 除了 route handler 之外還 export 了 `itemsCollection`，Next 產生的型別檢查會拒絕；只要跑過 `next dev` 產生 dev types 就會出現。這與本次改動無關（該檔案未被修改），`npm run build` 的 TypeScript 檢查通過。修法是把 `itemsCollection` 搬到 `lib/item-store.ts`，但那是後端檔案，依指示未動。
7. **`components/ui/**` 的 66 個 shadcn component 仍完全未使用。** 是否刪除或改為採用，建議另案決定。
8. **README 仍只描述收據功能**，未涵蓋報價單、請款單、客戶與商品。
9. **沒有自動化的前端測試。** 本次以手動走完所有流程驗證；整合測試（17 個）只覆蓋 API。
10. **幣別與時區建立工作區後無法修改**（原本就是），公司資料頁已明說。

---

## 8. 建議下一階段改善項目

依投資報酬排序：

**1. Session 回傳 feature flags（小改動，解掉 Debt 2）**
在 `/api/auth/session` 與 `toAppUser()` 加上 `features`，側邊欄與總覽就能只顯示真正可用的功能。是目前唯一還需要「猜」的地方。

**2. 收據的分頁與伺服器端搜尋（解掉 Debt 3、4）**
`/api/receipts` 加 `q` / `status` / `page` 參數與 `GET /api/receipts/[id]`。之後收據就能和報價單、請款單一樣有完整的列表與詳情，並拿掉「最近 20 筆」的限制。

**3. 請款單的收款登記**
`paymentStatus` 已支援 `partially_paid` / `paid`，但沒有任何 API 或 UI 可以設定它，所以請款單永遠停在「未付款／已逾期」。加一個「登記收款」動作（含部分收款金額），付款追蹤才算閉環——這是目前資料模型已預留、但流程還斷掉的地方。

**4. 文件 PDF 直接下載**
現在靠 `window.print()` ＋「另存為 PDF」，說明文字必須教使用者關閉頁首頁尾。改為伺服器端生成 PDF 可以讓「下載 PDF」真的只是下載。

**5. 前端 i18n**
從 `lib/status.ts` 與 `lib/help-content.ts` 開始，兩個檔案就涵蓋了絕大部分的術語與說明。

**6. 報價單／請款單的 Email 發送**
目前「標示為已發送」是人工標記，使用者要自己另外寄信。串上寄送後，狀態才會反映事實。

**7. 總覽加上期間比較**
現在的數字是「累計」，已如實標示。加上 `createdAt` 範圍查詢後才能誠實地做「本月」與月比較。

**8. 前端回歸測試**
針對本次建立的共用 component（`DataTable` 的桌機／手機切換、`useConfirm`、`useUnsavedChanges`、狀態機的 Primary Action 對應）加測試，避免之後改動時 UX 一致性再次漂移。

---

## 9. Definition of Done 檢查

> 一個第一次使用 RE-Biz 的人，可以在沒有教學人員協助的情況下：找到功能 → 理解功能 → 完成操作 → 知道操作結果 → 知道下一步。

| 環節 | 現在的答案 |
| --- | --- |
| 找到功能 | 側邊欄依「收款與帳務 / 銷售文件 / 基本資料 / 設定」分組，客戶與商品不再藏在報價單裡；每頁有網址與 breadcrumb；手機有抽屜 ＋ 當前頁名 |
| 理解功能 | 每頁標題下一句 description；「如何使用？」永久可用，展開為「可以做什麼 / 操作流程 / 注意事項」；空狀態解釋這個功能能幹什麼 |
| 完成操作 | 每頁一個 Primary Action；必填／選填明確；欄位級錯誤訊息說明怎麼修並聚焦；進階欄位收在 disclosure；有未儲存保護；破壞性動作的確認框寫出後果 |
| 知道操作結果 | 全系統統一 toast，文案與按鈕同動詞；成功後有「接下來可以做什麼」的面板或提示；載入用 skeleton 而不是假的空狀態；送出中鎖住按鈕 |
| 知道下一步 | Detail page 的「下一步」一句話依狀態變化；總覽的「待處理」列出今天該處理的事並直接連到已套好篩選的列表；全新工作區看到三步驟的「開始使用 RE-Biz」 |

最後再問一次：**如果今天我第一次登入這個系統，我真的知道下一步要做什麼嗎？**

登入後看到的是「總覽」，上面寫著待處理事項（或在全新工作區寫著「確認公司資料 → 挑一個收據樣式 → 開立第一張收據」），右邊是四個帶說明的快速開始。答案是 Yes。

剩下唯一還需要猜的地方，是被平台管理者關閉的功能仍會出現在側邊欄——那需要後端在 session 回傳 feature flags，列在下一階段的第一項。

---

# Acceptance Fix Round

第一輪 UX Rework 的驗收發現六個 P0 與三個 P1 問題。這一輪只修這些問題，沒有重新設計介面、沒有動已經正常運作的流程。與第一輪不同的是，這一輪允許改後端，所以分頁、收款流程與 feature flag 都是真的做在 API 與資料層，不是前端假裝。

## 1. Fixed

### P0-1 收據列表沒有分頁，全部資料一次載入

- **問題**：`GET /api/receipts` 回傳工作區內全部收據，搜尋與篩選也在瀏覽器端做。資料一多，列表頁會卡住，而且「搜尋」只搜得到已經載入的那些。
- **修法**：查詢條件全部搬到 server。新增 `lib/query.ts` 統一四個列表 API 的分頁契約（`page` / `pageSize` 上限 100 / 頁碼超出範圍自動夾回最後一頁 / 關鍵字截斷 100 字並 escape regex 特殊字元）。`GET /api/receipts` 改為先 `countDocuments(filter)` 再 `.skip().limit()`，排序固定 `issueDate desc, createdAt desc, _id desc` 讓翻頁結果穩定。前端改用新的 `useListQuery`，狀態寫在網址上。
- **影響檔案**：`lib/query.ts`（新增）、`app/api/receipts/route.ts`、`components/features/receipts/receipt-list.tsx`、`components/app/use-list-query.ts`（新增）、`components/app/pagination.tsx`（新增）
- **驗證方式**：E2E `e2e/receipt-list-query.spec.ts` 建 25 張收據，斷言預設每頁 20 筆、翻頁寫入網址、重新載入回到同一頁、瀏覽器上一頁回到第 1 頁、搜尋跨全部資料且自動回第 1 頁、清除條件回到完整列表。另外以 API 直接驗過 `page=999` 夾回最後一頁、`pageSize=500` 被夾到 100、`status=xxx` 回 400。

### P0-2 收支記帳沒有分頁

- **問題**：`GET /api/ledger` 把手動分錄與收據轉入的收入全部撈出來，在 Node 端合併排序。
- **修法**：用 `$unionWith` 讓 MongoDB 做合併，先跑一次 `$count` 取得總數，再跑一次帶 `$skip`/`$limit` 的查詢，兩次都是有界的（第一版草稿用 `$facet` 加極大 `$limit`，等於還是把全部資料實體化，已捨棄）。**摘要（收入／支出／結餘）故意維持在全部資料上計算**，不隨分頁或篩選變動——一個「結餘」如果會因為翻頁而改變，那個數字就沒有意義。`type=OUT` 時不 union 收據，因為收據只會是收入。
- **影響檔案**：`app/api/ledger/route.ts`、`components/features/ledger/ledger-view.tsx`
- **驗證方式**：以 API 直接驗過翻頁不重複不遺漏、摘要在各種篩選下不變、`type=OUT` 不含收據列、以收據編號搜尋能命中 union 進來的列。

### P0-3 報價單與請款單列表沒有分頁

- **問題**：同上，兩個列表都是一次全撈。
- **修法**：兩個 API 都套 `lib/query.ts`。這裡有一個既有測試的語意衝突：原本 `total` 是「篩選前的總筆數」，但分頁需要「符合條件的筆數」才能算出頁數。作法是 `total` 一律代表符合條件的筆數，另外新增 `totalAll` 代表篩選前總數（前端用它區分「還沒建立過」與「這個條件找不到」），並把 `test/integration/invoices.test.mjs` 兩處斷言指向 `totalAll`，原本的測試意圖完整保留。
- **影響檔案**：`app/api/quotes/route.ts`、`app/api/invoices/route.ts`、`components/features/quotes/quote-list.tsx`、`components/features/invoices/invoice-list.tsx`、`test/integration/invoices.test.mjs`
- **驗證方式**：`npm test` 17/17 通過；另以 API 驗過 `total` 與 `totalAll` 在有／無篩選下的差異。

### P0-4 `/receipts/[id]` 不存在，點列表只能開列印視窗

- **問題**：收據是唯一沒有 detail page 的文件類型。使用者無法把某一張收據的網址傳給同事，也沒有地方看到它的完整內容與後續動作。
- **修法**：新增 `GET /api/receipts/[receiptId]`（無效 id 或不屬於自己的工作區一律 404，不透露存在與否）與 `/receipts/[receiptId]` 路由。列表與詳情共用的 `serializeReceipt` 提到 `lib/receipt-store.ts`，避免兩邊欄位不一致。
- **影響檔案**：`app/api/receipts/[receiptId]/route.ts`、`app/(workspace)/receipts/[receiptId]/page.tsx`（新增）、`components/features/receipts/receipt-detail.tsx`（新增）、`lib/receipt-store.ts`
- **驗證方式**：E2E `e2e/receipt-to-ledger.spec.ts` 從列表點進 detail page、在該頁確認收款、再確認它出現在收支記帳。另以 API 驗過跨工作區與無效 id 都是 404。

### P0-5 請款單沒有「登記收款」，狀態只能手動改

- **問題**：`paymentStatus` 是一個可以隨手改的欄位，沒有金額依據。部分收款無法表達。
- **修法**：改成由收款紀錄推導。請款單新增 `payments[]`（每筆有 `amount` / `paidAt` / `note` / `recordedBy` / `recordedAt`），`paymentStatus` 由 `sum(payments.amount)` 與請款總額比較得出：0 為 `unpaid`、未達總額為 `partially_paid`、達到或超過為 `paid`。金額比較全部用 `lib/money.ts` 的整數分計算，避免浮點誤差。新增 `POST /api/invoices/[invoiceId]/payments`：草稿／已作廢／已收足不能登記（409）、超收不能登記（409）、金額非正數 400、Viewer 403；寫入時用 `findOneAndUpdate` 帶上讀取時的 `status` 與 `paymentStatus` 作為樂觀鎖，兩個人同時登記不會互相覆蓋。
- **影響檔案**：`lib/invoice.ts`、`lib/invoice-store.ts`、`app/api/invoices/[invoiceId]/payments/route.ts`（新增）、`app/api/invoices/[invoiceId]/route.ts`、`components/features/invoices/record-payment-dialog.tsx`（新增）、`components/features/invoices/invoice-detail.tsx`、`types/records.ts`
- **驗證方式**：E2E `e2e/invoice-payments.spec.ts` 走完整條路：草稿（沒有「登記收款」按鈕）→ 標示為已發送 → 登記 4,000／10,000 → 部分付款 → 嘗試登記 99,999 被欄位級錯誤攔下 → 登記 6,000 → 已付款 → 按鈕消失 → 列表 `status=paid` 找得到、`status=unpaid` 找不到。

### P0-6 未儲存變更保護只擋得住部分出口

- **問題**：編輯器上有 `useDirtyGuard`，但側邊欄、Logo、breadcrumb、相關文件連結都是原生 `Link`，點下去直接走，輸入就沒了。
- **修法**：`dirty-guard.tsx` 新增 `useGuardedNavigation()`，統一提供 `isDirty()` / `confirmDiscard()` / `guardedNavigate()`；新增 `GuardedLink`，是 `next/link` 的替換品，只在真的有未儲存內容時才攔，且 Cmd/Ctrl/Shift/中鍵點擊（開新視窗）一律放行。所有應用內導覽出口改用它。確認框全系統只有一種文案：標題「要放棄未儲存的變更嗎？」、說明「這一頁有尚未儲存的內容。離開後這些輸入不會保留，已經儲存過的資料不受影響。」、按鈕「離開並放棄變更」。
- **影響檔案**：`components/app/dirty-guard.tsx`、`components/app/guarded-link.tsx`（新增）、`components/app/confirm.tsx`、`components/app/app-shell.tsx`、`components/app/nav-link.tsx`、`components/app/breadcrumb.tsx`、`components/app/button.tsx`、`components/features/quotes/quote-editor.tsx`、`components/features/invoices/invoice-editor.tsx`
- **驗證方式**：E2E `e2e/unsaved-changes.spec.ts` 對側邊欄／Logo／Breadcrumb／取消按鈕四個出口各跑一次，並驗證沒有變更時導覽不會被打斷。

### P1-7 總覽頁一個 API 失敗就整頁空白

- **問題**：`Promise.all` 一失敗全部沒有，而且錯誤訊息直接把 HTTP 狀態碼寫給使用者看。
- **修法**：每個區塊獨立載入（`ModuleResult<T>`）。403 顯示「這個功能目前未開放」，其他失敗顯示「資料暫時無法載入，請稍後再試。」並在頁面上方給一個帶「重新載入」的提示；能載入的區塊照常顯示。使用者看不到任何狀態碼或資料庫錯誤字樣。
- **影響檔案**：`components/features/dashboard/dashboard-view.tsx`
- **驗證方式**：手動讓個別 API 失敗，觀察其他區塊仍正常顯示；被關閉的模組顯示「未開放」而非錯誤。

### P1-8 被關閉的功能仍出現在側邊欄

- **問題**：feature flag 只存在後端，前端不知道，所以使用者會點進一個必然失敗的頁面。
- **修法**：session 帶上 `features`。新增 `lib/workspace-features.ts` 承載這個型別與計算（獨立成一個檔案是為了避開 `lib/auth.ts` 與 `lib/platform-admin.ts` 的循環 import），被停權的工作區一律全部 false。側邊欄與總覽的快速動作依 `features.*` 決定顯示。**後端的權限檢查一個都沒有拿掉**——前端只是不再帶使用者去撞牆。
- **影響檔案**：`lib/workspace-features.ts`（新增）、`lib/auth.ts`、`lib/platform-admin.ts`、`components/app/session.tsx`、`components/app/navigation.ts`、`components/features/dashboard/dashboard-view.tsx`
- **驗證方式**：`npm test` 中既有的 feature flag 整合測試（關閉→API 擋、重新開啟→放行）維持通過。

### P1-9 沒有任何前端回歸測試

- **問題**：所有 UX 行為都只能手測，改一次就要全部再走一遍。
- **修法**：加入 Playwright，跑在獨立的 port 3100 與獨立資料庫 `receipt_issuer_e2e`（`e2e/global-setup.ts` 每次先 drop 再 seed，並且拒絕非本機的 `MONGODB_URI`，避免有人不小心對正式資料庫跑測試）。開發資料庫完全不受影響。
- **影響檔案**：`playwright.config.ts`、`e2e/`（新增）、`package.json`、`.gitignore`
- **驗證方式**：`npm run test:e2e` → 9 passed。

### 附帶修掉的一個 lint error

`components/features/receipts/receipt-create.tsx` 的 `useMemo` 被寫在兩個 early return 之後，觸發 `react-hooks/rules-of-hooks`。這不是本輪任務產生的（來自批量列印功能），但它會讓 `npm run lint` 失敗、而 lint 通過是驗收條件，所以做了最小處理：把那一行 hook 移到 early return 之前，其他完全沒動。它依賴的 `batchText` 與 `draft` 在該位置都已經宣告，行為不變。

## 2. Pagination

四個列表共用同一套契約，行為一致。

| 列表 | API | 預設每頁 | Server-side 搜尋欄位 | Server-side 篩選 |
| --- | --- | --- | --- | --- |
| 收據 | `GET /api/receipts?page&pageSize&q&status` | 20 | 收據編號、付款人、項目說明 | 收款狀態（all / pending / paid） |
| 收支記帳 | `GET /api/ledger?page&pageSize&q&type&from&to` | 20 | 說明、收據編號＋付款人 | 類型（IN / OUT）、日期區間 |
| 報價單 | `GET /api/quotes?page&pageSize&q&status` | 20 | 報價單編號、客戶名稱 | 狀態 |
| 請款單 | `GET /api/invoices?page&pageSize&q&status` | 20 | 請款單編號、客戶名稱 | 狀態（含 partially_paid） |

共通規格：

- `pageSize` 上限 100，超過夾回 100；`page` 小於 1 或大於總頁數時夾回有效範圍，不會回一頁空白。
- 回應一律包含 `page` / `pageSize` / `total` / `totalPages`；報價單與請款單另有 `totalAll`。
- 排序都帶 `_id` 作為最後的 tie-breaker，所以翻頁不會出現同一筆資料在兩頁都看到。
- 關鍵字先 escape regex 特殊字元再組 `RegExp`，使用者輸入 `.` 或 `(` 不會變成通用符。
- 每個查詢的 `$match` 都保留原本的 `organizationId`（以及原本就有的 `createdBy`）條件，分頁只是加上 `skip`/`limit`，沒有放寬任何範圍。跨工作區隔離的整合測試維持通過。
- 前端狀態寫在網址（`?page=2&q=…&status=paid`），所以重新載入、上一頁、把連結傳給同事都會看到同一個畫面。關鍵字 debounce 300ms 且用 `replace`（不污染上一頁歷史），改條件時自動回到第 1 頁。
- `components/app/pagination.tsx` 是唯一的分頁 UI：只有一頁時整個元件不顯示，頁數多時中間收成 `…`，載入中時按鈕 disabled，手機上維持可點的觸控尺寸。

## 3. Invoice Payment Flow

狀態不再是手動欄位，而是收款紀錄的結果。

```
草稿 draft ──標示為已發送──▶ 未付款 unpaid
                              │
                              │ 登記收款（金額 < 尚未收款）
                              ▼
                        部分付款 partially_paid
                              │
                              │ 登記收款（收足）
                              ▼
                          已付款 paid
```

資料模型：請款單文件新增 `payments[]`，每筆 `{ amount, paidAt, note, recordedBy, recordedAt }`；`paymentStatus` 由已收總額推導；序列化時額外回傳 `paidAmount` 與 `outstandingAmount`，前端不自己算錢。既有請款單沒有 `payments` 欄位時視為空陣列，狀態與原本一致，不需要資料遷移。

UX：

- 「登記收款」只在 `status === "sent"` 且 `paymentStatus !== "paid"` 時出現，而且是該頁唯一的 Primary Action。草稿與已收足的請款單看不到它。
- 對話框預設帶入尚未收款的金額（最常見的情況是一次收足），收款日期預設今天，備註選填。
- 超收在送出前就以欄位級錯誤攔下並說明「不可超過尚未收款金額」；後端仍然會再擋一次（409），不依賴前端。
- 摘要區固定顯示請款總額／已收金額／尚未收款三個數字，收足後改顯示「已全數收妥」。
- 下方「收款紀錄」列出每一筆的日期、金額、備註與登記人，所以「為什麼是部分付款」永遠看得到原因。
- Viewer 完全看不到「登記收款」，而且即使直接打 API 也會被 403 擋下。

## 4. Unsaved Changes

現在會先詢問的出口：

| 出口 | 狀態 |
| --- | --- |
| 側邊欄導覽連結 | 已覆蓋 |
| 手機抽屜內的導覽連結 | 已覆蓋 |
| 左上角 Logo | 已覆蓋 |
| Breadcrumb 各層 | 已覆蓋 |
| `ButtonLink`（含「取消」、「回到列表」） | 已覆蓋 |
| Detail page 的「相關文件」連結 | 已覆蓋 |
| 表單內的取消按鈕 | 已覆蓋 |

誠實列出還沒覆蓋的：

- **瀏覽器的上一頁／下一頁**：App Router 目前沒有穩定的攔截點，`popstate` 只能在導覽已經發生之後才知道。硬做需要 history 特技，可靠性差且容易讓正常導覽壞掉，所以沒做。
- **重新整理與關閉分頁**：沒有掛 `beforeunload`。它的原生對話框無法自訂文案、在不同瀏覽器行為不一，而且會干擾正常操作；要不要加應該是一個獨立決定。
- **直接改網址列**：同上，前端攔不到。
- 三者的共同結果是編輯器內容都在 client state，離開後重進要重填——這是現況，不是這輪新增的問題，列在 UX Debt。

## 5. Tests

全部實跑，不是「理論上可以」。

| 檢查 | 指令 | 結果 |
| --- | --- | --- |
| Lint | `npm run lint` | 通過，0 error 0 warning |
| Typecheck | `npm run typecheck` | 通過，無錯誤 |
| 整合測試 | `npm test` | 17 pass / 0 fail |
| E2E | `npm run test:e2e` | 9 pass / 0 fail |
| Build | `npm run build` | Compiled successfully，`/receipts/[receiptId]` 已註冊 |

E2E 覆蓋的流程：

- **Flow A** `quote-to-invoice.spec.ts`：登入 → 建報價單 → 存草稿 → 標示已發送（已發送後不再提供編輯）→ 客戶已接受 → 轉為請款單。
- **Flow B** `invoice-payments.spec.ts`：建請款單 → 發送 → 部分收款 → 超收被攔 → 收足 → 列表篩選找得到。
- **Flow C** `receipt-to-ledger.spec.ts`：由報價單開收據 → 總覽出現待處理 → 從新的 detail page 確認收款 → 出現在收支記帳的收入。
- **Flow D** `unsaved-changes.spec.ts`：四個出口各自會先詢問；沒有變更時不打斷。
- **Flow E** `receipt-list-query.spec.ts`：搜尋、篩選、翻頁、重新載入、瀏覽器上一頁、清除條件。

兩個測試環境上的注意事項，寫下來避免下次重踩：

- Playwright 的 `getByLabel` 比對的是 `<label>` 的**文字內容**，不是 accessible name。原本「必填／選填」標記寫在 `<label>` 裡面，所以 `getByLabel("密碼", { exact: true })` 找不到欄位。修法是把標記移到 `<label>` 外面的 `.field-label-row`，`<label>` 只留欄位名稱——這本來就是比較正確的 markup，`aria-required` 已經承載了「必填」這個資訊，視覺標記加上 `aria-hidden` 後不再被讀第二次。
- Session cookie 在 `next start` 下帶 `Secure`，Playwright 的 `page.request` 不會在 http 上送出它（瀏覽器本身對 localhost 有例外）。所以測試裡要 seed 資料時是用 `page.evaluate` 內的 `fetch`，走瀏覽器自己的 cookie jar，也就是應用程式實際發出的那個請求。
