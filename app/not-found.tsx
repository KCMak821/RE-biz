import Link from "next/link";

export default function NotFound() {
  return (
    <main className="state-page">
      <h1>找不到這一頁</h1>
      <p>這個網址不存在，或是你要找的資料已經被移除。從總覽開始，或用左側導覽找到需要的功能。</p>
      <Link className="btn btn-primary" href="/dashboard">
        回到總覽
      </Link>
    </main>
  );
}
