import { SCHEMA_CONDITION } from "./derive";
import type { Condition, Statement } from "./model";

export interface SchemaRow {
  schema: string;
  effect: string;
  access: string[];
  /** Conditions other than the schema ID itself (e.g. settings:scope). */
  extra: Condition[];
}

export interface OtherRow {
  permission: string;
  effect: string;
  conditions: Condition[];
}

export const ALL_SCHEMAS = "All schemas";

const conditionText = (c: Condition) =>
  `${c.name} ${c.operator} ${c.values.join(", ")}`;
export { conditionText };

/** Split a policy's statements into per-schema settings access and the rest. */
export function analyse(statements: Statement[]): {
  schemas: SchemaRow[];
  other: OtherRow[];
} {
  const schemas = new Map<string, SchemaRow>();
  const other = new Map<string, OtherRow>();

  for (const s of statements) {
    const settings = s.permissions.filter((p) => p.startsWith("settings:"));
    const rest = s.permissions.filter((p) => !p.startsWith("settings:"));
    const schemaCond = s.conditions.find((c) => c.name === SCHEMA_CONDITION);
    const extra = s.conditions.filter((c) => c.name !== SCHEMA_CONDITION);

    if (settings.length > 0) {
      const ids = !schemaCond
        ? [ALL_SCHEMAS]
        : ["=", "IN", "in", "=="].includes(schemaCond.operator)
          ? schemaCond.values
          : [`${schemaCond.operator} ${schemaCond.values.join(", ")}`];
      for (const schema of ids) {
        const key = `${schema}|${s.effect}|${JSON.stringify(extra)}`;
        let row = schemas.get(key);
        if (!row) {
          row = { schema, effect: s.effect, access: [], extra };
          schemas.set(key, row);
        }
        for (const p of settings) {
          const short = p.replace("settings:", "");
          if (!row.access.includes(short)) row.access.push(short);
        }
      }
    }
    for (const permission of rest) {
      const key = `${permission}|${s.effect}|${JSON.stringify(s.conditions)}`;
      if (!other.has(key)) {
        other.set(key, { permission, effect: s.effect, conditions: s.conditions });
      }
    }
  }

  const bySchema = (a: SchemaRow, b: SchemaRow) =>
    a.schema.localeCompare(b.schema);
  return {
    schemas: [...schemas.values()].sort(bySchema),
    other: [...other.values()].sort((a, b) =>
      a.permission.localeCompare(b.permission),
    ),
  };
}
