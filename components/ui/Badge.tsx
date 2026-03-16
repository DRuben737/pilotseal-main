import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "caution" | "warning";
  className?: string;
};

export default function Badge({
  children,
  tone = "neutral",
  className = "",
}: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge-${tone} ${className}`.trim()}>{children}</span>
  );
}
