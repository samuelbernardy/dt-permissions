import { SCHEMA_CONDITION, deriveGroup, levelLabel } from "./derive";
import type { UserPermissions } from "./model";

export interface ExportRow extends Record<string, string> {
  user: string;
  group: string;
  groupOwner: string;
  samlClaims: string;
  type: string;
  name: string;
  id: string;
  scope: string;
  effect: string;
  permission: string;
  schema: string;
  conditions: string;
}

const COLUMNS: (keyof ExportRow & string)[] = [
  "user",
  "group",
  "groupOwner",
  "samlClaims",
  "type",
  "name",
  "id",
  "scope",
  "effect",
  "permission",
  "schema",
  "conditions",
];

/** One row per role/policy × scope × permission × schema. */
export function buildRows(result: UserPermissions): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const group of result.groups) {
    const view = deriveGroup(group);
    const base = {
      user: result.user.email,
      group: group.name,
      groupOwner: group.owner,
      samlClaims: group.federatedAttributeValues.join("; "),
    };
    for (const item of view.items) {
      const statements =
        item.statements.length > 0
          ? item.statements
          : [{ effect: "ALLOW", permissions: item.permissions, conditions: [] }];
      for (const level of item.levels) {
        for (const s of statements) {
          const schemaCond = s.conditions.find(
            (c) => c.name === SCHEMA_CONDITION,
          );
          const others = s.conditions
            .filter((c) => c.name !== SCHEMA_CONDITION)
            .map((c) => `${c.name} ${c.operator} ${c.values.join(", ")}`)
            .join("; ");
          for (const permission of s.permissions) {
            const isSettings = permission.startsWith("settings:");
            const schemas =
              isSettings && schemaCond ? schemaCond.values : [""];
            for (const schema of schemas) {
              rows.push({
                ...base,
                type: item.kind,
                name: item.name,
                id: item.id,
                scope: levelLabel(level),
                effect: s.effect,
                permission,
                schema,
                conditions: others,
              });
            }
          }
        }
      }
    }
  }
  return rows;
}

// Cells starting with = + - @ can run as formulas when opened in Excel.
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv<T extends Record<string, string>>(
  rows: T[],
  columns: (keyof T & string)[],
): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => csvCell(r[c])).join(","));
  }
  return lines.join("\r\n");
}

export function permissionsCsv(result: UserPermissions): string {
  return toCsv(buildRows(result), COLUMNS);
}

export function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
