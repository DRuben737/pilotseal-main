import type { HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export default function Panel({ children, className = "", ...props }: PanelProps) {
  return (
    <div className={`ui-panel ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
