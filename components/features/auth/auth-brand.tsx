import Image from "next/image";

export function AuthBrand() {
  return (
    <div className="auth-brand">
      <Image alt="" height={34} priority src="/re-biz-mark.svg" width={34} />
      <strong>RE-Biz</strong>
    </div>
  );
}
