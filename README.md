# RE-Biz

以 Next.js 和 MongoDB 建置的香港普通收據工具。可產生單張或批量收據、列印為 PDF，並在登入後保存與查看最近的收據。

## 技術架構

- Next.js 16：Node.js 伺服器與 Route Handlers
- MongoDB Node.js Driver：僅由伺服器端連接資料庫
- MongoDB：使用者、工作階段與收據資料
- HTTP-only session cookie：保護每位使用者的資料

## 本機設定

1. 安裝 Node.js 22.13 或以上版本與 Docker Desktop；也可改用 MongoDB Atlas。
2. 本機開發可執行 `npm run db:up`，它只會在 `127.0.0.1:27018` 啟動 MongoDB，避免與常見的本機預設埠衝突。
3. 複製 `.env.example` 為 `.env.local`，填入 `MONGODB_URI`；可選擇設定 `MONGODB_DB`。使用 Atlas 時，以 Atlas 連線字串取代預設本機 URI。
4. 執行 `npm install`，再使用 `npm run dev` 啟動。
5. 初次開啟網站時註冊帳號，或使用既有帳號登入。每位使用者的收據資料會彼此隔離。

## 指令

- `npm run dev`：啟動開發環境
- `npm run build`：建立 Node.js 部署產物
- `npm run start`：啟動正式環境
- `npm run lint`：執行程式碼檢查
- `npm run db:up`：啟動本機 MongoDB
- `npm run db:down`：停止本機 MongoDB（保留資料）
- `npm run db:migrate`：套用資料庫 migration
- `npm run admin:create -- <email> "<名字>"`：建立平台管理者

## 平台管理後台（/admin）

`/admin` 是經營 RE-Biz 的人用的後台，跟客戶使用的產品**完全分開**：

- **不同身分**：管理者存在 `platformAdmins`，不是 `users`。管理者不隸屬任何公司，
  不會出現在 `/admin/users` 的客戶清單，也不計入平台統計。客戶帳號無論什麼角色，
  都不可能取得後台權限。
- **不同登入與 cookie**：客戶用 `/login`（`receipt_session`，30 天）；管理者用
  `/admin/login`（`rebiz_admin_session`，8 小時）。產品端就算外洩 session，
  也開不了後台；反之管理者的 cookie 也存取不了任何客戶資料。

阻擋在伺服器端完成——`app/admin/(console)/layout.tsx` 這個 server component 會把
未登入者導向 `/admin/login`，每一支 `/api/admin/*` 也各自檢查並回傳 403，
因此直接輸入網址無法繞過。

### 建立第一個平台管理者

全新的資料庫沒有任何管理者，所以 `/admin` 一開始對所有人關閉。這些指令碼會自己讀
`.env.local`，不需要設定環境變數：

```
npm run admin:create -- you@example.com "你的名字"
```

密碼在終端機輸入時不會顯示，也不會進入指令列或 shell history。建立後到
`/admin/login` 登入。

## 部署

請部署到支援 Node.js 的主機，例如 Render、Railway、Fly.io、Vercel 的 Node runtime，或自己的伺服器。設定 `MONGODB_URI` 與可選的 `MONGODB_DB` 為主機端環境變數；不可將連線字串設定為 `NEXT_PUBLIC_` 變數。

MongoDB 使用可重用的 `MongoClient` 連線池，並由伺服器端 Route Handlers 讀寫。詳見 [MongoDB 的 Next.js 整合指南](https://www.mongodb.com/docs/drivers/node-frameworks/next-integration/)。
