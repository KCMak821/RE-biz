import { SkeletonBlock, SkeletonRows } from "@/components/app/feedback";

export default function Loading() {
  return (
    <div className="page">
      <SkeletonBlock height={72} />
      <div style={{ marginTop: 20 }}>
        <SkeletonRows label="正在載入平台資料" rows={6} />
      </div>
    </div>
  );
}
