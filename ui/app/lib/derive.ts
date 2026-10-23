import type { Condition, GroupInfo, Level, Statement } from "./model";
import { roleLabel } from "./roles";

export const SCHEMA_CONDITION = "settings:schemaId";

/** One role or policy a group holds, with everything it applies to. */
export interface AccessItem {
  kind: "ROLE" | "POLICY";
  id: string;
  name: string;
  levels: Level[];
  statements: Statement[];
  boundaries: string[];
  conditional: boolean;
  /** Permission names covered (policy statements, or the role ID). */
  permissions: string[];
}

export interface GroupView {
  group: GroupInfo;
  items: AccessItem[];
}

export function levelLabel(l: Level): string {
  if (l.type === "environment") return l.name;
  if (l.type === "global") return "Global";
  return l.name && l.name !== "Account" ? `${l.name} (Account)` : "Account";
}

const levelKey = (l: Level) => `${l.type}:${l.id}`;

function addLevel(levels: Level[], l: Level) {
  if (!levels.some((x) => levelKey(x) === levelKey(l))) levels.push(l);
}

/** Merge a group's roles and policy bindings into one item per role/policy. */
export function deriveGroup(group: GroupInfo): GroupView {
  const items = new Map<string, AccessItem>();

  for (const r of group.rolePermissions) {
    const accountScope = r.scopeType.toLowerCase() === "account";
    const zone = r.scopeType.toLowerCase().includes("management");
    const level: Level = accountScope
      ? { type: "account", id: r.scope, name: r.scopeName || "Account" }
      : { type: "environment", id: r.scope.split(":")[0], name: r.scopeName };
    const key = `role:${r.permission}`;
    let item = items.get(key);
    if (!item) {
      item = {
        kind: "ROLE",
        id: r.permission,
        name: roleLabel(r.permission),
        levels: [],
        statements: [],
        boundaries: [],
        conditional: false,
        permissions: [r.permission],
      };
      items.set(key, item);
    }
    addLevel(item.levels, level);
    if (zone) {
      item.conditional = true;
      item.statements.push({
        effect: "ALLOW",
        permissions: [r.permission],
        conditions: [
          {
            name: "management-zone",
            operator: "=",
            values: [r.zoneName ?? r.scope.split(":").slice(1).join(":")],
          },
        ],
      });
    }
  }

  for (const b of group.bindings) {
    const key = `policy:${b.policyUuid}`;
    let item = items.get(key);
    if (!item) {
      item = {
        kind: "POLICY",
        id: b.policyUuid,
        name: b.policyName,
        levels: [],
        statements: b.statements,
        boundaries: [],
        conditional: false,
        permissions: [
          ...new Set(b.statements.flatMap((s) => s.permissions)),
        ],
      };
      items.set(key, item);
    }
    addLevel(item.levels, b.level);
    for (const bd of b.boundaries) {
      if (!item.boundaries.includes(bd)) item.boundaries.push(bd);
    }
    if (
      b.boundaries.length > 0 ||
      b.statements.some((s) => s.conditions.length > 0)
    ) {
      item.conditional = true;
    }
  }

  return {
    group,
    items: [...items.values()].sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "ROLE" ? -1 : 1) ||
        a.name.localeCompare(b.name),
    ),
  };
}

export function matches(item: AccessItem, q: string): boolean {
  if (!q) return true;
  return (
    item.name.toLowerCase().includes(q) ||
    item.id.toLowerCase().includes(q) ||
    item.permissions.some((p) => p.toLowerCase().includes(q)) ||
    item.statements.some((s) =>
      s.conditions.some(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.values.some((v) => v.toLowerCase().includes(q)),
      ),
    )
  );
}

export function summarise(views: GroupView[]) {
  const roles = new Set<string>();
  const policies = new Set<string>();
  const conditional = new Set<string>();
  const permissions = new Set<string>();
  for (const v of views) {
    for (const i of v.items) {
      (i.kind === "ROLE" ? roles : policies).add(i.id);
      if (i.conditional) conditional.add(`${i.kind}:${i.id}`);
      i.permissions.forEach((p) => permissions.add(p));
    }
  }
  return {
    groups: views.length,
    roles: roles.size,
    policies: policies.size,
    permissions: permissions.size,
    conditional: conditional.size,
  };
}

export type { Condition };
