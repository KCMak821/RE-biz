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
