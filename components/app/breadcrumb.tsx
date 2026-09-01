import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type Crumb = { href?: string; label: string };

/**
 * Shown whenever a page sits below a top-level destination, so “where am I and
 * how do I get back” never depends on the browser's back button.
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="路徑" className="crumbs">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !isLast ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
              {isLast ? null : <ChevronRight aria-hidden="true" size={13} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
