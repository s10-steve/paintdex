import type { CSSProperties } from "react";
import type { RoleMeta } from "@/lib/scheme/types";

/**
 * The small colour-mixed role pill ("Base", "Wash", …). Shared by the editor's
 * `LayerRow` and the read-only `scheme-view`, which both need the same
 * `--role-c` custom-property wiring that `.sv-role-tag` in `globals.css` reads.
 *
 * Takes a resolved `RoleMeta` (i.e. `roleOf(paint)`) rather than a `SchemeRole`
 * key, so an unrecognised role falls back with the rest of the app instead of
 * indexing `ROLES` for a colour that isn't there.
 */
export function RoleTag({ role }: { role: RoleMeta }) {
  return (
    <span
      className="sv-role-tag inline-flex flex-none items-center rounded-full px-1.5 text-[9.5px] font-bold uppercase leading-normal tracking-wide"
      style={{ ["--role-c" as string]: role.cssVar } as CSSProperties}
    >
      {role.label}
    </span>
  );
}
