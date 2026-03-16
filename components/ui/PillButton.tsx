import Link from "next/link";
import type { ReactNode } from "react";

type PillButtonProps = {
  href: string;
  children: ReactNode;
  active?: boolean;
  className?: string;
};

export default function PillButton({
  href,
  children,
  active = false,
  className = "",
}: PillButtonProps) {
  return (
    <Link
      href={href}
      className={`ui-pill-button ${active ? "ui-pill-button-active" : ""} ${className}`.trim()}
    >
      {children}
    </Link>
  );
}
