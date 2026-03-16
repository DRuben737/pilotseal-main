import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export default function Button({
  children,
  className = "",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button-${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
