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
- `npm run db:grant-super-admin -- <email>`：授予平台管理者權限（需要 `MONGODB_URI`）

## 平台管理後台（/admin）

`/admin` 是跨公司的平台管理後台，只有 `platformRole` 為 `SUPER_ADMIN` 的帳號能進入。
這個權限與公司內的成員角色（owner／admin／operator／viewer）完全分開：公司的 owner
**不會**因此取得後台權限。

阻擋在伺服器端完成——`app/admin/layout.tsx` 這個 server component 會將非管理者導回首頁，
每一支 `/api/admin/*` 也各自檢查並回傳 403，因此直接輸入網址無法繞過。

### 授予第一個平台管理者

全新的資料庫沒有任何 `SUPER_ADMIN`，因此 `/admin` 一開始對所有人都會導回首頁。
先註冊一個一般帳號，再授予權限。這些指令碼不會讀取 `.env.local`，所以要自己帶入
`MONGODB_URI`（`npm run db:migrate` 也一樣）：

```
MONGODB_URI=mongodb://127.0.0.1:27018 npm run db:grant-super-admin -- you@example.com
```

該帳號需要重新登入，側邊欄「設定」下才會出現「平台管理」入口。

`.env.example` 裡的 `SUPER_ADMIN_EMAILS` 只在 `npm run db:migrate` **第一次**執行時生效；
migration 一旦記錄在 `schemaMigrations` 就不會再跑，之後請改用上面的指令。

## 部署

請部署到支援 Node.js 的主機，例如 Render、Railway、Fly.io、Vercel 的 Node runtime，或自己的伺服器。設定 `MONGODB_URI` 與可選的 `MONGODB_DB` 為主機端環境變數；不可將連線字串設定為 `NEXT_PUBLIC_` 變數。

MongoDB 使用可重用的 `MongoClient` 連線池，並由伺服器端 Route Handlers 讀寫。詳見 [MongoDB 的 Next.js 整合指南](https://www.mongodb.com/docs/drivers/node-frameworks/next-integration/)。
