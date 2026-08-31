"use client";

export default function Error({ reset }: { reset: () => void }) {
  return <section className="admin-state admin-error" role="alert">
    <h1>暫時無法載入平台資料</h1>
    <p>請確認資料庫連線後再試一次。</p>
    <button type="button" onClick={reset}>重新整理</button>
  </section>;
}
