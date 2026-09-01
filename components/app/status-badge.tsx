import { status, type StatusDomain, type Tone } from "@/lib/status";

export function StatusBadge({
  domain,
  value,
  withHint,
}: {
  domain: StatusDomain;
  value: string | undefined | null;
  /** Shows the meaning of the state next to the badge, for detail pages. */
  withHint?: boolean;
}) {
  const descriptor = status(domain, value);
  return (
    <span className="badge-group">
      <span className={`badge badge-${descriptor.tone}`}>{descriptor.label}</span>
      {withHint && descriptor.hint ? <span className="badge-hint">{descriptor.hint}</span> : null}
    </span>
  );
}

/** For counts and labels that are not a record state — e.g. “最近 20 筆”. */
export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
