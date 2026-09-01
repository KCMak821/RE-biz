"use client";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="state-page" role="alert">
      <h1>暫時無法載入平台資料</h1>
      <p>通常是與資料庫的連線暫時中斷。請確認連線後再試一次；平台資料沒有受到影響。</p>
      <button className="btn btn-primary" onClick={reset} type="button">
        再試一次
      </button>
    </section>
  );
}
