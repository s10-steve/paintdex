"use client";

import type { ReactNode } from "react";

/** Small square action button (move up/down, remove) used across the editor. */
export function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent ${danger ? "hover:!text-red-600 dark:hover:!text-red-400" : ""}`}
    >
      {children}
    </button>
  );
}
