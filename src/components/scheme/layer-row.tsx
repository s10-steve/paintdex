"use client";

import {
  ROLES,
  ROLE_KEYS,
  roleOf,
  weightOf,
  type SchemePaint,
  type SchemeRole,
} from "@/lib/scheme/types";
import type { HoverHandlers } from "../scheme-bars";
import { IconBtn } from "./icon-btn";
import { RoleTag } from "./role-tag";

/** One paint within an element: swatch, name/meta, role + weight, row actions. */
export function LayerRow({
  paint,
  index,
  count,
  hot,
  hover,
  onMove,
  onRemove,
  onSetRole,
  onSetWeight,
}: {
  paint: SchemePaint;
  index: number;
  count: number;
  hot: boolean;
  hover: HoverHandlers;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSetRole: (role: SchemeRole) => void;
  onSetWeight: (weight: number) => void;
}) {
  const role = roleOf(paint);
  const meta =
    paint.custom && (!paint.brand || paint.brand === "custom")
      ? "Custom colour"
      : paint.brand + (paint.range && paint.range !== "custom" ? ` · ${paint.range}` : "");
  const showCustom = paint.custom && paint.brand && paint.brand !== "custom";

  return (
    <li
      className={`group grid grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${hot ? "bg-muted" : "hover:bg-muted"}`}
      onPointerEnter={() => hover.mark(paint.id)}
      onPointerLeave={hover.unmark}
    >
      <span
        className="mt-0.5 h-[26px] w-[26px] flex-none rounded-md ring-1 ring-inset ring-black/15"
        style={{ background: paint.hex }}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium">
          <span className="min-w-0 truncate">{paint.name}</span>
          <RoleTag role={role} />
        </div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {meta}{" "}
          <span className="font-mono tabular-nums text-muted-foreground/80">
            {paint.hex.toUpperCase()}
          </span>
          {showCustom && <span className="text-muted-foreground/70"> · custom</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={paint.role}
            onChange={(e) => onSetRole(e.target.value as SchemeRole)}
            aria-label="Layer role"
            className="rounded-md border border-input bg-muted px-1 py-0.5 text-[11px] text-muted-foreground"
          >
            {ROLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {ROLES[k].label}
              </option>
            ))}
          </select>
          <div className="flex min-w-0 max-w-[150px] flex-1 items-center gap-1.5">
            <span className="whitespace-nowrap text-[10px] tracking-wide text-muted-foreground">
              {role.solid ? "weight" : "amount"}
            </span>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.05}
              value={weightOf(paint)}
              onChange={(e) => onSetWeight(parseFloat(e.target.value))}
              aria-label="Layer weight"
              className="sv-weight w-full"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-none gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconBtn label="Move up (towards base)" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </IconBtn>
        <IconBtn
          label="Move down (towards highlight)"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </IconBtn>
        <IconBtn label="Remove paint" danger onClick={onRemove}>
          ✕
        </IconBtn>
      </div>
    </li>
  );
}
