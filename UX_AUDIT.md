# RE-Biz UX Audit

日期：2026-09-01
稽核範圍：整個前端（app router、頁面、導覽、表單、列表、狀態回饋、responsive、平台管理後台）
稽核方式：完整讀過所有 page / component / API route，並以本機 dev server 實際註冊＋登入，用「第一次使用者」的視角走過每一條流程。

---

## 0. 現況盤點（Inventory）

### Routes（實際存在的）

| Route | 型態 | 內容 |
| --- | --- | --- |
| `/` | client component，1207 行 | **整個使用者端系統**：登入、註冊、改密碼、工作區停用、總覽、收支記帳、收據中心、新增收據、報價單、請款單、成員、收據樣式 |
| `/admin` | server component | 平台總覽 |
| `/admin/workspaces`、`/admin/workspaces/[id]`、`/admin/users`、`/admin/usage`、`/admin/audit-logs` | server components | 平台管理 |
| `/api/**` | 25 個 route handler | 後端（本次不改） |

**關鍵事實：使用者端只有一個 route。** 所有畫面切換都是 `useState<AppView>` 與 `useState<Screen>`，網址永遠是 `/`。

### 畫面（實際的 view / screen 數量）

`app/page.tsx` 的 `AppView`：`dashboard | receipts | ledger | create | members | appearance | quotes | invoices`（8）
`quotation-workspace.tsx` 的 `Screen`：`list | editor | detail | customers | items | company`（6）
`invoice-workspace.tsx` 的 `Screen`：`list | editor | detail`（3）
另有 4 個全螢幕 gate：`AuthScreen`、`RegistrationScreen`、`ChangePasswordScreen`、`WorkspaceSuspendedScreen`

= **21 個實質畫面共用 1 個 URL。**

### 共用 component 現況

- `components/ui/**`：**66 個 shadcn/ui component 全部存在，但整個 app 完全沒有 import 任何一個。**（`grep` 結果為 0）真正在用的「design system」是 `app/globals.css` 裡 410 個手寫 class。
- `components/page-guidance.tsx`：`FirstUseGuide`、`FieldHelp`（唯二的共用 UX component，各 6 行）
- 其餘全部是各 module 自己寫的：3 套 `Field`（page.tsx、quotation-workspace、invoice-workspace 各一套，行為不同）、3 套 `money()/formatAmount()`、3 套 list/table 標記、4 套 badge 樣式、0 套 toast、0 套 dialog。
- `sonner`、`radix-ui`、`cmdk`、`next-themes` 已安裝但未使用。

### 資料模型（可用來做 UX 的真實資料）

| 實體 | 狀態欄位 | 可查詢 |
| --- | --- | --- |
| Receipt | `paymentStatus: pending \| paid`（舊資料無此欄＝視為 paid） | 最近 20 筆、`descriptionSuggestions` |
| LedgerEntry | `type: IN \| OUT`、`source: manual \| receipt` | 最近 100 筆 + summary（income/expense/balance） |
| Quote | `draft \| sent \| accepted \| rejected \| expired`(推導) | 關鍵字＋狀態篩選、`total` |
| Invoice | `draft \| unpaid \| overdue \| partially_paid \| paid \| void`(推導) | 關鍵字＋狀態篩選、`total` |
| Customer | `active \| archived` | 關鍵字＋狀態篩選 |
| Item | `isActive` | 全部 |
| Workspace feature flag | `receipts / accounting / quotations / invoices` | **只有後端知道，session 不回傳** |

---

## 1. Current UX Problems

### CRITICAL

**C-1. 四個功能的儲存永遠失敗（實際 bug，已逐一用 API 驗證）**

前端把整個 state 物件直接 `JSON.stringify` 送出，但這些 API 的 zod schema 都是 `.strict()`，多一個 key 就整包退回。實測結果：

| 操作 | 送出的多餘欄位 | 實測結果 |
| --- | --- | --- |
| 設定 → 公司資料 → 儲存 | `id` `currency` `role` `status` `hasLogo` `hasSealImage` `receiptTemplate` `timeZone` | `400 公司資料格式不正確。` |
| 報價單 → 客戶主檔 → 新增客戶 | `id`（`blankCustomer()` 帶 `id: ""`）、`status` | `400 客戶資料格式不正確。` |
| 報價單 → 客戶主檔 → 編輯客戶 | `id` `status` `createdAt` `updatedAt` | `400 客戶資料格式不正確。` |
| 報價單 → 常用品項 → 新增／編輯品項 | `id`（`blankItem()` 帶 `id: ""`） | `400 品項資料格式不正確。` |
| 請款單 → 編輯草稿 → 儲存 | 品項的 `subtotal`（`quoteLineSchema` 為 `.strict()`） | `400 請款單資料格式不正確。` |

也就是說：**「客戶主檔」與「常用品項」這兩個功能透過 UI 完全無法使用**，公司抬頭改不了，請款單草稿存不回去。API 本身是正確的（整合測試送正確 payload 會 201），錯在前端 payload。

使用者看到的只有「客戶資料格式不正確。」——沒有指出哪個欄位，而他其實什麼都沒填錯。這正是「功能雖然存在，但不好用」最極端的形式。

**C-2. 沒有 URL、沒有上一頁、沒有可分享的位置**
21 個畫面共用 `/`。後果：
- 瀏覽器「上一頁」會直接離開整個系統（或跳回登入前狀態），不是回到列表。
- 無法把一張報價單的連結傳給同事。
- 重新整理一定回到「總覽」，正在看的東西消失。
- 完全無法做 breadcrumb（沒有階層可言）。
- 分頁標題永遠是「RE-Biz｜商務與帳務管理」，切到哪都一樣。

**C-3. 主資料被藏在報價單的篩選列裡**
`客戶主檔`、`常用品項`、`公司資料` 是三個 11px 的 outline 小按鈕，位置在「報價單」頁的搜尋框右邊、和「狀態」下拉並排。它們長得像篩選器，實際上是導覽入口。
第一次使用者要新增客戶，必須先猜到要點「報價單」，再在篩選列裡找到「客戶主檔」。**客戶與商品是全系統共用的主資料，卻沒有自己的導覽入口。**

**C-4. 「儲存後發生了什麼」大多沒有回答**
全系統 0 個 toast。所有回饋都是 inline `<p>`：
- `saveMessage`（綠字）、`validation-message`（紅字）、`member-message`、`localMessage`、`admin-action-message` —— 5 種不同機制。
- 位置不一致：報價單存檔後訊息出現在**下一個畫面的中段**；客戶存檔後訊息出現在**表單下方、清單上方**；收據存檔後在按鈕下方。
- 報價單狀態變更、複製、轉請款單全部靠同一個 `message` state 覆蓋，前一個訊息會被無聲蓋掉。
- 客戶存檔、品項存檔、報價單狀態變更**沒有 disabled/pending 狀態** → 可以連點兩次。

**C-5. 收據與記帳列表沒有 loading state，直接顯示空狀態**
`ReceiptsView` / `LedgerView` 在 fetch 完成前 `receipts.length === 0`，所以第一次進入會先看到「目前還沒有建立任何收據」再閃成有資料。使用者第一眼得到的是錯誤資訊。

### HIGH

**H-1. 每頁的 Primary Action 不唯一、也不一致**
- 報價單詳情頁頂部有 4 個同樣權重的 `text-button`：`返回列表` `列印／輸出 PDF` `複製` `編輯草稿`；下方另有一排 `secondary-action`：`標示為已發送`；再另有 `primary-action`：`轉為請款單`。使用者看不出「現在該做什麼」。
- 「返回列表」被做成和「列印 PDF」同權重的按鈕——導覽混在動作裡。
- 列表頁主按鈕用 `.page-primary-action`，表單頁用 `.primary-action`（100% 寬、49px 高），主資料頁又用 `.page-primary-action` 當 submit。三種主按鈕。
- `收支記帳`、`客戶主檔`、`常用品項` 三個列表頁**沒有頁面級主按鈕**。

**H-2. Sidebar 把「動作」和「目的地」混在一起，分類不反映工作流程**
```
工作區
  總覽 / 收支記帳 / 收據中心 / 報價單 / 請款單 / ＋新增收據   ← 最後一項是動作
設定
  成員與權限 / 收據樣式                                   ← 公司資料不在這裡
平台
  Platform Admin                                        ← 英文，且是另一個 app
```
`收據中心`（Center）、`收支記帳`、`報價單`、`請款單` 平鋪，看不出 報價→請款→收款→記帳 的關係。

**H-3. 表單只在 submit 時驗證，而且只給一句籠統的話**
- 報價單：`請填妥客戶、日期與每個品項的名稱、數量及金額。`——8 個客戶欄位＋N 列品項，不知道哪一格錯。
- 收據：`請先填妥所有標示 * 的欄位。`
- 記帳：`請填妥日期、說明與大於 0 的金額。`
- `InvoiceEditor` 的 `Field` 用 `required={label === "品項"}` 判斷必填（字串比對），其他欄位完全沒有必填標示，也沒有任何錯誤訊息。
- 必填標記有 3 種寫法：`<b aria-hidden> *</b>`、`<b> *</b>`、`required` 屬性但無視覺標記。

**H-4. 沒有「未儲存變更」保護**
報價單編輯器可以填 20 個欄位＋10 列品項，點側邊欄任一項就全部消失，沒有任何提示。`beforeunload` 也沒有。

**H-5. 破壞性／不可逆操作全部用 `window.confirm`**
6 處：確認收款、停用成員、封存客戶、刪除品項、報價單狀態變更、請款單作廢／發送。原生對話框無法呈現層級，也和系統視覺完全脫節。其中「標示為已發送」是不可逆的（之後不能再編輯），卻和「刪除品項」用同一種灰色原生對話框。

**H-6. 後端已存在的功能沒有入口**
`POST /api/quotes/[id]/receipt`（由已接受的報價單建立收據草稿）已完整實作、有防重複、會回寫 `quote.receiptId`——**UI 沒有任何按鈕會呼叫它**。報價單詳情頁只在收據「已經存在」時顯示連結，所以這條路只有從資料庫直接建立才走得到。

**H-7. Feature flag 對前端不可見**
平台管理者可以關掉某個 workspace 的 報價單／請款單／收據／記帳。前端不知道，側邊欄照樣顯示，使用者點進去才拿到紅字 403「此工作區目前無法使用報價單功能。」——看起來像系統壞了。

**H-8. Detail page 沒有一致 pattern，資訊一次全上**
報價單詳情＝標題 + 一行「狀態：… 有效至 …」+ 4 顆按鈕 + 一排工作流按鈕 + **整張 A4 報價單直接鋪在頁面上**。沒有摘要區（客戶／金額／日期），要看金額得往下捲到表格的 tfoot。請款單詳情同構但欄位順序不同。

**H-9. 狀態系統有 4 套實作、其中一套語意錯誤**
| 來源 | class | 狀態 |
| --- | --- | --- |
| 報價單／請款單 | `.quote-status.draft/.sent/.accepted/.rejected/.expired` | 5 色 pill |
| 收據 | `.receipt-paid` / `.receipt-pending` | 純色文字，非 pill |
| 成員 | `.member-active` / `.member-suspended` | 純色文字 |
| 平台後台 | `.admin-status.active/.suspended/.disabled` | 另一套 pill、另一組色票 |

而且 `ItemManager` 用 `<em className="quote-status rejected">已停用</em>` —— 把「品項停用」染成「報價被拒絕」的紅色。
術語上「停用」同時表示：成員停權、品項下架、workspace 停用、平台帳號停用（4 件事）。

**H-10. Mobile 只做到「不爆版」**
- Sidebar 在 ≤980px 變成一條**橫向捲動的 8 顆按鈕**，看不到分組，也看不到自己在哪。
- 所有列表都是固定欄寬的 `display:grid`，加 `min-width: 560~800px`，在手機上一律**強制橫向捲動**。收據列表 `min-width: 760px`。
- 報價單品項編輯器在手機上是 6 個輸入框直排，沒有卡片邊界，第 3 列和第 4 列分不出來。
- 沒有任何 mobile 專屬的操作收納（更多 ⋯）。

### MEDIUM

**M-1. 裝飾性英文 eyebrow 佔據每一個標題的最上方**
`OVERVIEW` `RECEIPT CENTER` `QUOTATION CENTER` `INVOICE CENTER` `CASH FLOW` `LIVE PREVIEW` `NEW ENTRY` `RECENT ENTRIES` `GET STARTED` `TEAM ACCESS` `CUSTOMER DIRECTORY` `COMMON ITEMS` `COMPANY PROFILE` `RECEIPT APPEARANCE` `BATCH RECEIPTS` `STEP 1 OF 2` `ACCOUNT` `SECURITY CHECK` `WORKSPACE STATUS`。
對中文使用者是純噪音，而且多數只是把下面的 h2 用英文再講一次。`RE-BIZ · BUSINESS OPERATIONS` 出現在每一個 auth 畫面的 logo 旁。

**M-2. 總覽（Dashboard）不回答任何一個真問題**
現況 3 張卡：`最近收據 0`、`最近收款總額 HKD 0.00`、`你的權限 擁有者`（權限不是指標）。加一個「最近儲存的收據」清單，和一段**寫死、不可點**的 `ol`：確認公司收款方資料 / 建立第一張收據 / 需要協作時新增成員。
資料庫其實有：待收款收據、已發送待回覆的報價單、即將到期的報價單、已接受但未轉請款的報價單、未付款／逾期請款單——**一件都沒顯示**。

**M-3. 空狀態有 4 種實作、部分沒有下一步**
`.empty-receipts`（有 icon + CTA）、`.empty-quotes`（無 icon）、`.empty-ledger`（有 icon 無 CTA）、客戶／品項借用 `.empty-receipts` 但無 icon 無 CTA。

**M-4. 「使用說明」目前是 `FirstUseGuide`，但只在「完全沒有資料」時出現**
`{!items.length && <FirstUseGuide .../>}`。一旦建了第一筆資料，說明永久消失——而使用者通常是在建了第一筆之後才開始有疑問（「標示為已發送之後呢？」「什麼時候能轉請款單？」）。而且收據中心、總覽、請款單詳情、報價單詳情完全沒有說明。

**M-5. 批量收據頁是一整面說明文字**
`貼上批量資料` 區塊有 5 段連續說明（欄位順序、支援格式、付款方式可填什麼、日期可留空、匯入只會帶入內容…），共約 200 字，全部同時顯示，沒有分層。

**M-6. 客戶／品項頁面是「表單永遠展開在清單上方」**
新增和編輯共用同一個表單，切換到編輯模式時**只有按鈕文字從「新增客戶」變成「更新客戶」**，表單本身沒有任何變化，也不會捲動或聚焦。「清除」按鈕在編輯模式下實際意思是「取消編輯」。

**M-7. 收據中心把品項明細藏在 `<details>` 裡，而唯一的「列印收據」按鈕在 `<details>` 內部**
沒有品項明細的收據（手動建立的普通收據）在列表上**完全沒有列印按鈕**——已存的收據無法重新輸出 PDF。

**M-8. 報價單編輯器的客戶區塊要求 8 個欄位、且選了既有客戶後仍全部展開**
選了「帶入既有客戶」之後，8 個欄位被填滿並仍然可編輯，任何一次修改都會把 `customerId` 清成 `""`（變成手動客戶），沒有任何提示告訴使用者「你已經脫離主檔了」。

**M-9. 收據列表只有最近 20 筆，但畫面沒說**
`/api/receipts` 硬編 `.limit(20)`，UI 標題寫「收據中心」，metric 小字寫「目前顯示最近 20 筆」在**另一個頁面（總覽）**。收據中心本身沒有筆數、沒有分頁、沒有搜尋、沒有篩選。

**M-10. 平台後台是視覺上完全不同的第二個產品**
深藍 `#101827` topbar + `#172033` sidebar + `#2856c7` 藍色按鈕，和主系統的 cream/forest 完全無關。回主系統只有一個 13px 的 `← 返回工作區`。

### LOW

- L-1 `app/page.tsx` 有 footer「先把收據開對，再談自動化。」——品牌標語佔據每一頁底部。
- L-2 `status-pill` 顯示「尚未儲存」，但那是預覽區的裝飾，不是真的狀態機。
- L-3 `收據預覽金額` 是一個唯讀 `<output>` 欄位，和上面的「收款金額」重複顯示同一個數字。
- L-4 `付款方式` 的 `不顯示於收據` 用 sentinel 字串 `__hidden__`，且相容舊值 `"不顯示"`；批量匯入說明要使用者填中文「不顯示」，兩者不一致。
- L-5 `WorkspaceSuspendedScreen` 內文是英文（`This workspace has been suspended.`），全系統唯一。
- L-6 沒有 `not-found.tsx`、沒有使用者端 `error.tsx`。
- L-7 `.field input` 的 `border-radius: 2px`，`.metric-grid article` 沒有 radius，`.admin-stat` 是 10px — radius 不成系統。
- L-8 `lucide-react` icon size 混用 14/15/17/18/20/27/28。

---

## 2. Proposed Information Architecture

導覽依「使用者在做的事」分組，不依資料表分組。文件生命週期（報價 → 請款 → 收款 → 記帳）在群組順序上可見。

```
總覽                          /dashboard

收款與帳務
  收據                        /receipts
    開立收據                  /receipts/new
  收支記帳                    /ledger

銷售文件
  報價單                      /quotes
    建立報價單                /quotes/new
    報價單詳情                /quotes/[id]
    編輯報價單                /quotes/[id]/edit
  請款單                      /invoices
    建立請款單                /invoices/new
    請款單詳情                /invoices/[id]
    編輯請款單                /invoices/[id]/edit

基本資料
  客戶                        /customers
    客戶詳情                  /customers/[id]
  商品與服務                   /items

設定                          （owner / admin 可見）
  公司資料                    /settings/company
  收據樣式                    /settings/receipt-template
  成員與權限                   /settings/members
  我的帳號                    /settings/account      （全角色可見）
  平台管理 ↗                  /admin                （super admin 可見）

帳號（未登入）
  登入                        /login
  建立公司帳號                 /register
  首次登入設定密碼              /change-password
```

決策說明：

1. **「收據中心」→「收據」。** 「中心」不帶任何資訊；同層的其他項目也沒有叫「中心」。
2. **客戶／商品升到頂層。** 它們是報價單、請款單共用的主資料，不屬於報價單。
3. **「公司資料」搬進「設定」。** 它原本在報價單頁的篩選列裡，和「收據樣式」（在側邊欄設定區）是同一類東西。
4. **「＋新增收據」離開側邊欄。** 側邊欄只放目的地；建立動作放在「收據」頁的 Primary Action 與總覽的快速開始。
5. **`/dashboard` 而非 `/`。** `/` 依 session 轉向 `/dashboard` 或 `/login`，兩者都有各自的網址。
6. **平台管理維持獨立 route，但視覺併回主系統**（同色票、同 component、頂部明確標示「平台管理」）。

Breadcrumb 規則：深度 ≥2 才顯示。`收據 / 開立收據`、`報價單 / Q20260001`、`報價單 / Q20260001 / 編輯`、`客戶 / ABC Trading`、`設定 / 公司資料`。

---

## 3. UX Improvements

### Navigation
- 全部改成真實 Next.js route（21 畫面 → 21 網址），可分享、可重新整理、可用上一頁。
- Session gate 移到 server layout（`getCurrentUser()`）：不再有「先閃登入畫面再進系統」，未登入直接 `redirect("/login")`。
- 側邊欄依上述 IA 分 5 組，`aria-current="page"` + 視覺 active 態由網址決定（不再是 state）。
- Mobile：topbar 顯示 `☰ + 當前頁名`，抽屜（drawer）內是完整分組導覽。取消橫向捲動列。
- Breadcrumb 元件，深度 ≥2 顯示。
- 每頁設定 `<title>`（`document.title` 由 `PageHeader` 統一設定）。
- 側邊欄導覽在有未儲存變更時先確認。
- 平台管理沿用同一套 shell 與 component。

### Dashboard
改為回答四個問題，全部用既有 API 的真實資料：
1. **今天要處理什麼** —「待處理」清單：待收款收據 / 已發送待客戶回覆的報價單 / 7 天內到期的報價單 / 已接受但未轉請款單 / 未付款或已逾期的請款單。每一列都是可點的連結，並帶到已套好篩選的列表。沒有待辦時顯示明確的「目前沒有待處理事項」。
2. **最近發生什麼** —「最近活動」：合併收據 / 報價單 / 請款單 / 記帳的最新紀錄，依時間排序，每列可點進該筆。
3. **有什麼異常** — 已逾期請款單、已失效報價單以 danger tone 置頂。
4. **常用功能在哪** —「快速開始」4 顆：開立收據 / 建立報價單 / 建立請款單 / 記一筆收支（依角色與 feature 顯示）。
另保留 累計收入 / 累計支出 / 目前餘額 三個數字，但標籤改成準確的「累計」（原本寫「最近」但其實是全部）。
移除「你的權限」數字卡（改放在側邊欄底部的身分區）。

### Forms
- 一套 `Field` / `TextareaField` / `SelectField`：`label` + `必填` 標記 + `hint` + `error`，`id`/`aria-describedby`/`aria-invalid` 自動接好。
- 驗證：blur 後即時驗證單一欄位；submit 時驗證全部並**聚焦第一個錯誤欄位**；錯誤訊息寫在欄位下方且說明怎麼修（`請輸入客戶名稱` 而非 `Invalid input`）。
- 送出中 disabled + 按鈕文字改為進行式，防連點。
- Progressive disclosure：報價單／請款單的「備註與條款」、收據的「收款方資料」（已由公司帶入）、客戶的「地址與商業登記」收進「更多設定 ▾」。
- 預設值：報價單有效期＝+30 天、請款單到期日＝+30 天（沿用現有邏輯，改成畫面上明示）。
- 報價單選了既有客戶時，客戶區塊**收合成一張唯讀摘要卡** + 「改用手動輸入」；只有手動模式才展開 8 個欄位。改動既有客戶時明確提示「這張報價單會使用你修改後的資料，客戶主檔不變」。
- 客戶／品項：清單頁為主，新增／編輯放進 dialog，標題明確寫「新增客戶」/「編輯 ABC Trading」。
- 修好 C-1：只送 schema 允許的 7 個欄位。

### Tables
所有列表統一：`PageHeader → Toolbar(搜尋/篩選/筆數) → List → 說明`。
- 桌機：table，最後一欄是 `查看 · 編輯 · 更多 ⋯`。
- 手機：同一份資料改渲染為卡片（主識別 + 金額 + 狀態 badge + 次要資訊 + 動作），**不再橫向捲動**。
- 收據、記帳新增前端搜尋與篩選（記帳加「全部／收入／支出」）。
- 每個列表標明範圍（「最近 20 筆」「最近 100 筆」），不再讓使用者猜。
- 收據列表把「下載 PDF」提到列動作，不再藏在 `<details>` 內（修 M-7）。

### Detail Pages
統一 pattern：
```
[breadcrumb]
H1 單號                                   [狀態 badge]
摘要列：客戶 · 開立日期 · 有效期／到期日 · 總金額
[Primary（依狀態唯一）] [次要：下載 PDF] [次要：編輯] [更多 ⋯]
關聯文件：報價單 / 請款單 / 收據（互相可點）
下一步提示：一句話說明現在能做什麼
────────────────
文件內容（A4 paper）
```
- Primary action 依狀態唯一：草稿→`標示為已發送`；已發送→`客戶已接受`；已接受→`轉為請款單`；已轉→`開啟請款單`。
- 破壞性動作（客戶已拒絕、作廢、複製）收進「更多 ⋯」。
- 新增 H-6 的入口：已接受的報價單可「建立收據草稿」。
- 「返回列表」由 breadcrumb 承擔，不再當按鈕。

### Empty States
一套 `EmptyState`：icon + 「發生了什麼」+「這個功能能做什麼」+ 主要 CTA。
區分三種空：**從未建立**（給 CTA 與說明）、**篩選無結果**（給「清除篩選」）、**無權限／功能已停用**（說明原因與該找誰）。

### Feedback
- `sonner` toast 作為所有「動作完成」的統一回饋，文案與按鈕同動詞（按「儲存報價單」→「報價單已儲存」）。
- 表單級錯誤留在表單內（inline），系統級錯誤用 toast。
- `useConfirm()` 取代 6 處 `window.confirm`：標題說明要做什麼、說明列出後果、按鈕用具體動詞（`封存客戶` 而非 `確定`）、破壞性用 danger tone。
- Loading：列表用 skeleton row，按鈕用 pending 文字，頁面切換用 `loading.tsx`。
- 未儲存變更：`beforeunload` + 側邊欄／取消按鈕攔截確認。
- 所有 mutation 加 pending 鎖（修 C-4 的連點）。
- feature 403 專屬畫面（修 H-7）。

### Help
每個主要功能頁的 `PageHeader` 帶：
1. 一句 description（「這裡管理…，建立後可以…」）
2. 「如何使用？」disclosure，展開後三段：**這個功能可以做什麼** / **基本操作流程**（編號步驟） / **常見注意事項**。
內容永久可用（不像 `FirstUseGuide` 只在無資料時出現），預設收合，不佔版面。
`FirstUseGuide` 保留給「完全沒有資料」時的第一次引導。

### Mobile
- 抽屜式導覽 + topbar 顯示當前頁名。
- 列表 → 卡片。
- 所有主要 CTA ≥44px 觸控目標；表單單欄。
- 報價單品項在手機上是有邊界、有序號的卡片，動作（上移／下移／刪除）收在卡片右上的「⋯」。
- Detail page 的動作列在手機上變成 sticky bottom bar（Primary 常駐）。

---

## 4. Pages Impacted

| # | 新 route | 取代 | 主要改動 |
| --- | --- | --- | --- |
| 1 | `/` | `app/page.tsx` 的 auth gate | 改成 server redirect |
| 2 | `/login` | `AuthScreen` | 獨立頁、pending 狀態、錯誤文案 |
| 3 | `/register` | `RegistrationScreen` | 獨立頁、步驟指示改中文、欄位分組 |
| 4 | `/change-password` | `ChangePasswordScreen` | 獨立頁 |
| 5 | `/workspace-suspended` | `WorkspaceSuspendedScreen` | 獨立頁、中文化 |
| 6 | `/dashboard` | `DashboardView` | 全新：待處理 / 快速開始 / 最近活動 / 累計數字 |
| 7 | `/receipts` | `ReceiptsView` | 搜尋、篩選、列動作、下載 PDF、卡片式 mobile |
| 8 | `/receipts/new` | `appView==="create"` | 單張／批量分頁、progressive disclosure、成功後的下一步面板 |
| 9 | `/ledger` | `LedgerView` | 主按鈕開 dialog、類型篩選、搜尋 |
| 10 | `/quotes` | `QuotationWorkspace` list | 統一列表 pattern |
| 11 | `/quotes/new` | `QuoteEditor` | 客戶區塊收合、欄位級驗證、未儲存保護 |
| 12 | `/quotes/[id]` | `QuoteDetail` | 統一 detail pattern、單一 primary、更多⋯、建立收據草稿入口 |
| 13 | `/quotes/[id]/edit` | `QuoteEditor` | 同 11 |
| 14 | `/invoices` | `InvoiceWorkspace` list | 統一列表 pattern |
| 15 | `/invoices/new` | `InvoiceEditor` | 加必填標示與欄位驗證（原本幾乎沒有） |
| 16 | `/invoices/[id]` | `InvoiceDetail` | 統一 detail pattern |
| 17 | `/invoices/[id]/edit` | `InvoiceEditor` | 同 15 |
| 18 | `/customers` | `CustomerManager` | 升為頂層；表單移入 dialog |
| 19 | `/customers/[id]` | `CustomerManager` 的 `detail` state | 摘要 + 關聯報價單 |
| 20 | `/items` | `ItemManager` | 升為頂層；表單移入 dialog；修正 badge 語意 |
| 21 | `/settings/company` | `CompanyEditor` | **修 C-1 儲存 bug** |
| 22 | `/settings/receipt-template` | `ReceiptAppearanceSettings` | 分區 + 即時預覽保留 |
| 23 | `/settings/members` | `MemberManagement` | 新增成員移入 dialog、暫用密碼交付說明 |
| 24 | `/settings/account` | 無（原本只在強制改密碼時出現） | 新增：自助改密碼 |
| 25 | `/admin/**`（5 頁） | 同名 | 視覺併回主系統、統一 badge/table/empty |
| 26 | `not-found` / `error` | 無 | 新增 |

## 5. Components Impacted

### Reuse（沿用，不動）
- `lib/receipt-template.ts`、`lib/quotation.ts`、`lib/invoice.ts`、`lib/money.ts` 等所有 lib
- 全部 `app/api/**` route handler
- `globals.css` 的文件排版層：`.receipt-paper` 及其後代、`.company-seal` 全套、`.quote-paper` 及其後代、A4 print 規則（原樣保留，只調整外層容器）
- `components/page-guidance.tsx` 的 `FirstUseGuide`（改為使用新的視覺，API 不變）
- `sonner`（已安裝未用 → 啟用）
- `hooks/use-mobile.ts`

### Create
`components/app/`
- `session.tsx` — `WorkspaceProvider` / `useWorkspace()`（user、organization、權限判斷）
- `app-shell.tsx` — topbar + sidebar + mobile drawer + content
- `navigation.ts` — IA 的單一來源（群組、標籤、icon、權限、breadcrumb 對照）
- `nav-link.tsx` — active 態 + 未儲存變更攔截
- `page-header.tsx` — breadcrumb + title + description + 「如何使用？」+ actions + `document.title`
- `how-to-use.tsx` — 說明 disclosure（能做什麼／流程／注意事項）
- `breadcrumb.tsx`
- `empty-state.tsx` — 三種空狀態
- `status-badge.tsx` — 全系統唯一 badge
- `data-table.tsx` — 桌機 table / 手機卡片
- `list-toolbar.tsx` — 搜尋 + 篩選 + 筆數 + 清除
- `row-actions.tsx` — 「更多 ⋯」dropdown
- `confirm-dialog.tsx` — `ConfirmProvider` + `useConfirm()`
- `dialog.tsx` — 以原生 `<dialog>` 為基礎的 modal（新增／編輯表單用）
- `form.tsx` — `Form` / `FormSection` / `Field` / `TextareaField` / `SelectField` / `FieldError` / `FormActions` / `Disclosure`
- `buttons.tsx` — `Button`（primary / secondary / ghost / danger、size、pending）
- `feedback.tsx` — `SkeletonRows` / `InlineError` / `FeatureDisabled` / `notify`
- `summary-list.tsx` — detail page 摘要列
- `toast-host.tsx` — sonner Toaster
- `dirty-guard.tsx` — 未儲存變更 context
- `lib/format.ts` — 單一 `money()` / `formatDate()` / `formatDateTime()`
- `lib/status.ts` — 所有狀態的 label + tone（報價單／請款單／收據／客戶／品項／成員／workspace／平台帳號）
- `lib/help-content.ts` — 各頁說明文案
- `lib/api.ts` — 單一 `request()`（現在有 3 份）+ 401/403 統一處理

`components/features/**` — 由 `page.tsx`（1207 行）、`quotation-workspace.tsx`（2037 行）、`invoice-workspace.tsx`（39 行極長行）拆出的 module component。

### Modify
- `app/layout.tsx` — metadata、`ToastHost`、`lang`
- `app/globals.css` — 重整為分層結構（tokens / shell / page / list / form / feedback / document / print），刪掉隨舊 markup 一起消失的 selector，文件排版層原樣保留
- `app/admin/admin.css` — 改為引用主系統 token，只留佈局差異
- `components/admin/*` — 改用共用 `Button` / `StatusBadge` / `useConfirm`
- `components/page-guidance.tsx` — 視覺對齊新系統

### Delete
- `app/page.tsx` 的 21 畫面單體結構（內容拆分後保留邏輯）
- `components/quotation-workspace.tsx`、`components/invoice-workspace.tsx`（拆分後移除）
- `globals.css` 中隨舊 markup 消失的 selector（`.mode-switch`、`.workspace`、`.editor-panel`、`.preview-column`、`.saved-receipts`、`.master-list`、`.quotation-tools`、`.database-note`…）
- `components/ui/**` 中 66 個從未使用的 shadcn component：**保留不動**（不在本次範圍，刪除屬於清理工作，且可能是刻意預留）

---

## 6. 不做的事（依指示）

- 不改任何 `app/api/**`、`lib/*-store.ts`、zod schema、MongoDB collection 或索引
- 不改 database schema
- 不改業務規則（報價單狀態機、收據派號、ledger 收入來源、權限判斷、feature flag 判斷）
- 不新增沒有資料來源的功能（Dashboard 的每一個數字都來自現有 API）
- 不換品牌視覺方向（維持 cream `#f7f4ed` / forest `#1e4c45` / Georgia 標題）
- 不加裝飾性動畫、漸層、玻璃態

唯一的例外是兩類**前端修復**，因為不修的話對應功能根本無法完成：
1. C-1 的五個 payload（公司資料、客戶新增、客戶編輯、品項新增／編輯、請款單草稿編輯）改為只送 schema 允許的欄位
2. H-6 為既有但無入口的 `POST /api/quotes/[id]/receipt` 補上按鈕

這兩類都只改前端送出的資料與畫面，沒有動任何 route handler、schema 或 collection。

---

## 7. Implementation Priority

**P0** — 導覽與階層（真實 route + shell + breadcrumb）、每頁單一 Primary Action、表單可用性（欄位驗證／必填／未儲存保護）、關鍵流程（C-1 公司資料、C-5 loading、C-4 回饋、H-6 缺失入口）
**P1** — 空狀態、loading、成功／錯誤、使用說明、mobile 卡片化與抽屜導覽、狀態系統統一
**P2** — micro interaction、視覺細節（radius / icon size / 間距節奏）、平台後台視覺併回
