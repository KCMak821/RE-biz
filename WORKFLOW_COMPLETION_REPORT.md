# RE-Biz Workflow Completion Report

Quote → Invoice → Payment → Receipt → Ledger → Dashboard，一條可以每天使用的營運閉環。

---

## 1. Current workflow audit

先看既有實作，再決定要補什麼。審計結果：**骨架已經在，缺的是收尾與把關**。

已經存在且正確：

| 能力 | 狀態 |
| --- | --- |
| Quote lifecycle `draft/sent/accepted/rejected` + server-side transition guard | ✅ |
| Quote → Invoice，含 snapshot 與 `sourceQuoteId` partial unique index | ✅ |
| Quote → Receipt（`pending` 草稿），含 `sourceQuoteId` unique index | ✅ |
| Invoice `stored status` + `paymentStatus` + derived `effectiveStatus`（含 overdue） | ✅ |
| Payment 是 array of records，不是 boolean；支援分次收款 | ✅ |
| 收入來源＝已收款收據；invoice payment 不另建 ledger entry | ✅ |
| Organization-wide 文件編號 counters（concurrency-safe） | ✅ |
| `organizationId` 為唯一 tenant boundary，`createdBy` 僅 audit | ✅ |
| Viewer 在所有 write endpoint 被 `canManageRecords` 擋下 | ✅ |

實際缺口（本次處理）：

1. **Invoice → Receipt 完全不存在** — 閉環在「已付款」就斷了。
2. **重複認列收入的真實風險** — 同一張 Quote 可以同時產生 quote-receipt 與 invoice；一旦補上 invoice→receipt，同一筆交易就會有兩張收據＝兩次收入。
3. **Overpayment race** — 併發防護 guard 在 `paymentStatus` 上，兩筆同時的部分付款可以一起超收。
4. **Accepted quote 會被日曆作廢** — `quoteEffectiveStatus` 對所有狀態套用 `validUntil`，已接受的報價單過期後就再也不能轉請款單。
5. Payment 的 `createdBy` 有存但沒有顯示；Dashboard 有重複 todo 與一段已經不成立的說明文字。

---

## 2. Domain rules implemented

```text
Quote:    draft → sent → accepted | rejected
          sent + validUntil 過期 → expired（只有 sent 會過期）
          任何回頭的 transition 一律 409

Invoice:  draft → sent → void
          paymentStatus 由 payments 加總推導，永不直接設定
          effectiveStatus = draft | unpaid | partially_paid | paid | overdue | void（derived）

Receipt:  收入認列點。每筆交易只能有一張。

Accepted quote 只能走一條路：
          A. Quote → Receipt（即場付款，pending → 確認收款）
          B. Quote → Invoice → Payment → Receipt（請款流程）
```

---

## 3. Quote lifecycle changes

- **`quoteEffectiveStatus` 只讓 `sent` 過期**（`lib/quotation.ts`）。已接受＝已決定，日曆不能推翻它；已拒絕也不會被改標成「已失效」。這修掉一個真實 bug：舊行為下，已接受但過了有效期的報價單再也不能轉請款單。
- 新增 `quoteValidityLapsed()`，並用它擋下 `draft → sent` 當有效期限已過：`有效期限已過，請先編輯有效期限再標示為已發送。`
- Draft 即使過了有效期仍可編輯 —— 那正是使用者需要做的修正。
- 列表 filter 對齊新語意：`status=expired` → `{ status: "sent", validUntil < today }`；`accepted` / `rejected` / `draft` 不再被有效期限過濾掉。

Transition table（`app/api/quotes/[quoteId]/route.ts`）：

```ts
accepted: []          rejected: []
draft:    ["sent"]    sent:     ["accepted", "rejected"]
```

## 4. Invoice lifecycle changes

模型維持原樣（stored status + paymentStatus + derived effective status），符合「最小修改」。變更：

- **`void` 在有收款紀錄後被禁止**：`已登記收款的請款單不可作廢，請先處理已收款項。` 作廢的意思是「不要再收這筆錢」，與已入帳的金額互相矛盾。
- Invoice detail `GET` 現在一併回傳它開出的收據，UI 才能顯示「查看收據」而不是再給一次「開立收據」。
- Quote → Invoice 的 `dueDate` 由 `quote.validUntil` 改為 `max(validUntil, issueDate)`，避免一張出生就逾期的請款單。

## 5. Payment handling

Payment record 沿用既有結構，只補上 audit：

```ts
{ _id, amount, paidAt, note, createdBy, createdByName, createdAt }
```

`createdByName` 是**寫入當下的 snapshot**，不是 join —— 成員改名或離開後，紀錄仍然說得出是誰登記的，讀一張請款單也不用再打一次 users collection。

Invoice detail 的收款紀錄每一列現在都顯示 `{誰} 登記於 {時間}`。

## 6. Partial payment handling

`paymentStatus` 一律由 payments 加總推導（`invoicePaymentStatusFor`），detail page 三個數字並列：請款總額 / 已收金額 / 尚未收款。

**Overpayment 防護（本次強化）** — 舊 guard 只鎖 `paymentStatus`，所以兩筆同時的「部分付款」（各自都合法）可以一起超收。改為鎖住讀取時的 payments 數量：

```ts
const recorded = (invoice.payments ?? []).length;
const unchanged = recorded === 0
  ? { $or: [{ payments: { $exists: false } }, { payments: { $size: 0 } }] }
  : { payments: { $size: recorded } };
collection.findOneAndUpdate({ ...inWorkspace, ...unchanged, status: invoice.status }, …)
```

`$size` 是精確比對，因此 overpayment 檢查所依據的快照與實際寫入的狀態必定一致，輸的一方拿到 409 而不是靜默超收。錯誤訊息也帶上金額：`收款金額不可高於尚欠金額 HKD 7,000.00。`

## 7. Quote → Invoice implementation

`POST /api/quotes/[quoteId]/invoice`。自動帶入 `customerId`、`customerSnapshot`、`companySnapshot`、`currency`、lines、discounts、totals、notes、terms，並寫入 `sourceQuoteId` / `sourceQuoteNumber`。使用者不需要重選客戶或重打品項。

三層防護：狀態檢查 → 既有 invoice 檢查 → **partial unique index**。第三層才是真正的保證：兩個同時送出的請求會撞 index，`11000` 被接住後回傳既有的請款單，資料庫裡永遠只有一張。

## 8. Invoice → Receipt implementation（新增）

`POST /api/invoices/[invoiceId]/receipt`，只在 `effectiveStatus === "paid"` 時可用。每個被拒絕的狀態都有自己的訊息（draft / void / partially_paid / unpaid），不是一句「操作失敗」。

收據帶入 organization、customer、金額、付款方式（由 payment notes 組出）、`sourceInvoiceId`、`sourceInvoiceNumber`，並**繼承 invoice 的 `sourceQuoteId`**。開立日期用最後一筆付款的 `paidAt`——收據應該記錄錢實際到齊的那天。狀態直接是 `paid`：錢已經在了，沒有東西要再確認。

## 9. Quote → Receipt behavior

兩條路徑都保留，但**互斥**，而且互斥是雙向強制的：

- 已有 invoice 的 quote → 直接開收據被擋：`此報價單已建立請款單 INV-xxxx，收據請在款項收妥後於請款單開立。`
- 已有 direct receipt 的 quote → 轉請款單被擋：`此報價單已直接建立收據 RC-xxxx，不需要再開請款單。`

## 10. Accounting source of truth

> **收據（Receipt）是唯一的收入認列點。**

沿用現有 architecture（`app/api/ledger/route.ts` 早已用 `receipts` union `ledgerEntries` 計算收入），這是最小修改也最符合既有 codebase 的選擇。

```text
income = Σ manual ledger IN
       + Σ receipts where paymentStatus != "pending"
```

Invoice payment **不會**產生任何 ledger entry。因此不需要新增 `invoice_payment` 這個 ledger source——在這個模型裡它不是收入事件。`source` 維持 `manual | receipt` 兩種，正確反映實際的認列來源。

被明確排除的認列點：quote accepted（不是收入）、invoice sent（不是收入）、payment recorded（是現金流，不是認列點）。

## 11. How duplicate income is prevented

一筆交易最多只能存在一張收據，由三個 partial unique index 保證，而不是靠 UI 或應用層檢查：

```text
invoices  { organizationId, sourceQuoteId }    unique  → 一張報價單只有一張請款單
receipts  { organizationId, sourceQuoteId }    unique  → 一張報價單只有一張收據
receipts  { organizationId, sourceInvoiceId }  unique  → 一張請款單只有一張收據
```

關鍵設計：**invoice 開出的收據同時寫入 `sourceInvoiceId` 與 `sourceQuoteId`**。因此 Quote → Invoice → Receipt 走完之後，那張 quote 的 `sourceQuoteId` 已被佔用，任何「再直接開一張收據」的嘗試都會撞上 index。兩條路徑的互斥性由資料庫保證，不是由前端按鈕的顯示與否保證。

`partialFilterExpression` 讓這些 index 只涵蓋有來源的文件，手開的收據與手建的請款單完全不受影響。

## 12. Database / index changes

| Collection | Index | 說明 |
| --- | --- | --- |
| `receipts` | `{ organizationId, sourceInvoiceId }` unique partial | **新增** |
| `receipts` | `{ organizationId, sourceQuoteId }` unique partial | 既有，migration 重新確認 |
| `invoices` | `{ organizationId, sourceQuoteId }` unique partial | 既有，migration 重新確認 |

新欄位：`receipts.sourceInvoiceId`、`receipts.sourceInvoiceNumber`、`invoices.payments[].createdByName`。全部 optional，舊文件不需要回填。

## 13. Migration details

`migrations/20260903_document-relationship-indexes.mjs`（已加入 `npm run db:migrate`）。

- **不寫入任何 business data**，只處理 index。
- 建立 unique index 前先掃描衝突，**一次列出全部**衝突文件的 `_id` 後 `exit 1`，不動任何東西。要保留哪一份是人的決定，不是 migration 的。
- Idempotent：已存在且形狀相同的 index 直接跳過；名稱相同但規格不同的才 drop 後重建。Fresh DB 與既有 DB 都可重跑。
- Advisory：偵測歷史上「同一張報價單同時有 direct receipt 和 invoice」的資料，列出並說明其收入仍只計一次，但新資料兩條路只能擇一。

實跑結果（開發資料庫，連跑兩次）：

```text
1 quote(s) have both a direct receipt and an invoice: RC-20260901-002.
Their income was still counted once (the receipt). New quotes may take only one of the two routes.
Relationship indexes ready. Created or rebuilt: receipts.receipt_source_invoice_unique.

# 第二次
Relationship indexes ready. Created or rebuilt: none (already current).
```

Advisory 抓到了真實資料，idempotency 也確認了。

## 14. Permission verification

所有新增與修改的 write endpoint 都經過 `canManageRecords(user)`，Viewer 一律 403。這是 backend enforcement，不是隱藏按鈕。

整合測試中直接驗證的 viewer 403：建立請款單、登記收款、由請款單開立收據、記帳。同時驗證 viewer **能**讀取 quote / invoice / payment history / receipt / ledger / dashboard，且讀到的公司總額與 owner 完全相同。

## 15. Cross-user workflow verification

`createdBy` 是 audit metadata，`organizationId` 是唯一邊界。整合測試 `any colleague may carry a quote forward` 走完：**owner 建 quote → operator 標示 accepted → admin 建 invoice**，全部 200/201。

E2E `workflow-uat.spec.ts` 用兩個真實 browser context 與真的登入/登出走完 owner → operator → owner。

## 16. Cross-tenant isolation verification

E2E `workspace-isolation.spec.ts`：先在 workspace A 建出完整的 quote/invoice/receipt 鏈，再用第二間公司的 owner 帶著**真實 id** 打 11 個 endpoint（GET / status / convert / duplicate / void / payment / receipt / 確認收款），全部 404；三個 detail page 也顯示「不存在」。最後回頭確認 workspace A 的請款單狀態、已收金額與收據完全沒有被動到。

## 17. Integration tests added

`test/integration/workflow.test.mjs` — 18 個新測試：

- Quote lifecycle：合法/非法 transition、expired 不可 accept、accepted 不受有效期限影響、列表 filter 與 detail 一致
- Quote → Invoice：draft/rejected/expired 皆 409、snapshot 帶入、duplicate 阻擋、**併發轉換只產生一張**、cross-user 成功、viewer 403、cross-workspace 404
- Invoice：draft 不可收款、overdue 為 derived（確認 DB 內仍是 `sent`）、void read-only、已收款不可作廢
- Payment：full / partial / 多次 partial、overpayment 阻擋（含金額訊息）、**併發超收阻擋**、已付款不可再收、`createdByName` 正確、viewer 403、cross-tenant 404
- Receipt：unpaid/partial/void 不可開立、**併發只產生一張**、source references 保留、cross-user 開立成功
- Ledger：**HKD 10,000 release gate**、partial payment 認列、quote→receipt 認列時點、確認收款 idempotent、manual 收支、跨 workspace 為 0

## 18. E2E tests added

- `e2e/workflow-uat.spec.ts`（新增）— §33 的完整 UAT
- `e2e/workspace-isolation.spec.ts`（新增）— §34 cross-tenant
- `e2e/receipt-to-ledger.spec.ts`（改寫）— 原本依賴 flow A 留下的 accepted quote，但那張現在已經有請款單、依新規則不再提供直接開收據。改為自建報價單，也讓它真正測到 Scenario A
- `e2e/global-setup.ts` — 新增第二間公司與其 owner

---

## Verification results

全部在本機實跑，MongoDB 8（`127.0.0.1:27018`）。

### 19. lint

```text
$ npm run lint
eslint . --ignore-pattern dist --ignore-pattern .next
exit=0（無 warning、無 error）
```

### 20. typecheck

```text
$ npm run typecheck
tsc --noEmit
exit=0
```

### 21. Integration test result

```text
$ npm test
ℹ tests 46   ℹ pass 46   ℹ fail 0   ℹ duration_ms 101761
```

其中新增的 18 個全部通過，既有 28 個無回歸。

### 22. E2E result

```text
$ npm run test:e2e
Running 12 tests using 1 worker
  ok  1 請款單登記部分收款後再收足，狀態依已收金額推導
  ok  2 報價單從草稿走到轉為請款單
  ok  3 收據列表的搜尋、篩選與分頁狀態保存在網址中
  ok  4 由報價單直接建立的收據，確認收款後成為收支記帳的收入
  ok  5-9 未儲存變更保護（5 項）
  ok 10 一筆交易由擁有者開始、操作員接手，收入只認列一次
  ok 11 另一間公司即使知道文件 id 也讀不到、改不了
  ok 12 同一公司的第二位成員看到相同的收入、收據與報價單
  12 passed (47.6s)
```

### 23. build

```text
$ npm run build
exit=0（30 條路由全部產出）
```

### db:migrate

```text
$ npm run db:migrate
exit=0（連跑兩次，第二次 "none (already current)"）
```

---

## The release gate

> 同一筆 HKD 10,000 的交易，無論經過 Invoice、Payment、Receipt，Dashboard 最終收入都只能是 HKD 10,000。

Integration test `HKD 10,000 billed, paid and receipted is HKD 10,000 of income` 逐步驗證每一個可能出錯的時點：

```text
quote accepted        → income 不變
invoice sent          → income 不變
payment 10,000 登記   → income 不變      ← 不是認列點
receipt 開立          → income + 10,000  ← 唯一認列點

再打一次 invoice→receipt   → 仍是 +10,000
再打一次 quote→receipt     → 仍是 +10,000
再打一次 quote→invoice     → 仍是 +10,000

ledger?q=RC-xxxx → 剛好 1 筆，10,000，source=receipt，type=IN
```

E2E 用真實 UI 再驗證一次：HKD 12,345 走完 owner→operator→owner，Dashboard「累計收入」增加**剛好** 12,345。

兩個測試都通過。**Release gate 成立。**

---

## 24. Remaining risks

1. **Dashboard 只讀每個 endpoint 的第一頁**（預設 20 筆）。文件量成長後，待處理計數會偏低。這是本次之前就存在的行為，修正需要專用的 summary endpoint，超出「不新增大型模組」的範圍。**建議下一階段處理。**
2. **金額以 HKD number 儲存**，計算才轉整數 cents。`lib/money.ts` 已經把所有算術限制在 cents，但 MongoDB `$sum` 聚合（ledger 總額）直接對 float 加總。目前金額量級下無影響；若日後要求絕對精確，需改為 cents 儲存＋migration。
3. **Void 後無法還原**，且已收款的請款單不能作廢。若實務上出現退款情境，需要一個明確的 refund / credit note 功能，本次刻意不做。
4. **歷史資料**：migration 發現 1 張報價單同時有 direct receipt 與 invoice（新規則之前建立）。收入仍只計一次，但這張報價單的 invoice 永遠無法開立收據（`sourceQuoteId` 已被佔用），會收到明確的 409 而非默默失敗。
5. **MongoDB 為 standalone 部署**，沒有 multi-document transaction。所有跨文件的一致性都靠 unique index ＋ atomic update 達成（已用併發測試驗證）；`invoice.invoiceId` 這類反向指標的更新若在 insert 之後失敗，指標會缺漏 —— 但每一個讀取路徑都會 fallback 到 `sourceQuoteId` 查詢，所以功能不受影響。
6. **文件編號 counter 在單據被刪除後不會回收**（既有行為，刻意保留：編號不應重複使用）。
