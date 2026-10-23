// Mirrors api/lib/model.ts (the function's response shape).
export interface Level {
  type: "global" | "account" | "environment";
  id: string;
  name: string;
}
export interface Condition {
  name: string;
  operator: string;
  values: string[];
}
export interface Statement {
  effect: string;
  permissions: string[];
  conditions: Condition[];
}
export interface BindingInfo {
  level: Level;
  policyUuid: string;
  policyName: string;
  statementQuery?: string;
  statements: Statement[];
  boundaries: string[];
  parameters: Record<string, unknown>;
}
/** Role-style permission (e.g. tenant-viewer) from the group permissions API. */
export interface RolePermission {
  permission: string;
  scopeType: string;
  scope: string;
  /** Environment/account name when the scope could be resolved. */
  scopeName: string;
  /** Management zone display name, when the scope is a zone. */
  zoneName?: string;
}

export interface GroupInfo {
  uuid: string;
  name: string;
  owner: string;
  description: string | null;
  /** SAML claim values (e.g. AD group names) mapped to this group. */
  federatedAttributeValues: string[];
  bindings: BindingInfo[];
  rolePermissions: RolePermission[];
}
/** What one group × level binding lookup returned (for troubleshooting). */
export interface DiagEntry {
  group: string;
  level: string;
  outcome: string;
  detail: string;
}

export interface UserPermissions {
  user: {
    uid: string;
    email: string;
    name: string;
    surname: string;
    status: string;
    lastLogin: string | null;
  };
  groups: GroupInfo[];
  levels: Level[];
  warnings: string[];
  diagnostics: DiagEntry[];
}
