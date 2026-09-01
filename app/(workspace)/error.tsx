"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="state-page" role="alert">
      <h1>這一頁暫時無法顯示</h1>
      <p>
        載入資料時發生問題，通常是與資料庫的連線暫時中斷。你的資料沒有受到影響，再試一次通常就會恢復。
      </p>
      <button className="btn btn-primary" onClick={reset} type="button">
        重新載入這一頁
      </button>
    </section>
  );
}
