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

## 部署

請部署到支援 Node.js 的主機，例如 Render、Railway、Fly.io、Vercel 的 Node runtime，或自己的伺服器。設定 `MONGODB_URI` 與可選的 `MONGODB_DB` 為主機端環境變數；不可將連線字串設定為 `NEXT_PUBLIC_` 變數。

MongoDB 使用可重用的 `MongoClient` 連線池，並由伺服器端 Route Handlers 讀寫。詳見 [MongoDB 的 Next.js 整合指南](https://www.mongodb.com/docs/drivers/node-frameworks/next-integration/)。
