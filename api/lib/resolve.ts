import {
  ApiError,
  mapLimit,
  type AccountClient,
} from "./accountApi";
import type {
  BindingInfo,
  Condition,
  DiagEntry,
  GroupInfo,
  Level,
  RolePermission,
  Statement,
} from "./model";

export const CONCURRENCY = 6;

export interface RawGroup {
  uuid: string;
  groupName: string;
  owner: string;
  description: string | null;
  accountName?: string;
}
interface RawAccountGroup {
  uuid: string;
  federatedAttributeValues?: string[] | null;
}
interface RawGroupPermissions {
  permissions?: {
    permissionName: string;
    scope?: string;
    scopeType?: string;
  }[];
}
interface RawBindingEntry {
  policyUuid: string;
  boundaries?: string[];
  parameters?: Record<string, unknown>;
}
interface RawPolicy {
  uuid: string;
  name: string;
  statementQuery?: string;
  statements?: {
    effect: string;
    permissions: string[];
    conditions?:
      | { name: string; operator: string; values?: string[] }[]
      | null;
  }[];
}

interface EnvListing {
  envs: Level[];
  /** management zone id -> display name */
  zones: Map<string, string>;
}

/**
 * Environment names. v2 returns { data: [...] }; v1 returns
 * { tenantResources: [...], managementZoneResources: [...] }.
 */
async function loadEnvironments(
  api: AccountClient,
  warnings: string[],
): Promise<EnvListing> {
  const acct = encodeURIComponent(api.accountUuid);
  const tried: string[] = [];
  for (const version of ["v2", "v1"]) {
    try {
      const res = await api.get<unknown>(
        `/env/${version}/accounts/${acct}/environments`,
      );
      const r = (Array.isArray(res) ? { data: res } : (res ?? {})) as {
        data?: { id: string; name?: string }[];
        tenantResources?: { id: string; name?: string }[];
        managementZoneResources?: { id: string; name?: string }[];
      };
      const list = r.data ?? r.tenantResources ?? [];
      if (list.length === 0) {
        tried.push(`${version}: empty`);
        continue;
      }
      return {
        envs: list.map((e) => ({
          type: "environment" as const,
          id: e.id,
          name: e.name ?? e.id,
        })),
        zones: new Map(
          (r.managementZoneResources ?? []).map((z) => [
            z.id,
            z.name ?? z.id,
          ]),
        ),
      };
    } catch (e) {
      tried.push(`${version}: ${(e as Error).message}`);
    }
  }
  warnings.push(
    `Could not read environment names (${tried.join("; ")}); showing environment IDs instead.`,
  );
  return { envs: [], zones: new Map() };
}

/** Accepts the several shapes the bindings endpoint can return. */
function normaliseBindings(raw: unknown): {
  entries: RawBindingEntry[];
  recognised: boolean;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const asEntry = (x: unknown): RawBindingEntry | undefined => {
    if (typeof x === "string") return { policyUuid: x };
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const id = (o.policyUuid ?? o.uuid ?? o.policyId ?? o.id) as
        | string
        | undefined;
      if (id) {
        return {
          policyUuid: id,
          boundaries: o.boundaries as string[] | undefined,
          parameters: o.parameters as Record<string, unknown> | undefined,
        };
      }
    }
    return undefined;
  };
  for (const key of ["policyBindings", "policyUuids", "policies", "bindings"]) {
    if (Array.isArray(r[key])) {
      return {
        entries: (r[key] as unknown[])
          .map(asEntry)
          .filter((e): e is RawBindingEntry => !!e),
        recognised: true,
      };
    }
  }
  if (Array.isArray(raw)) {
    return {
      entries: (raw as unknown[])
        .map(asEntry)
        .filter((e): e is RawBindingEntry => !!e),
      recognised: true,
    };
  }
  return { entries: [], recognised: false };
}

function toStatements(p: RawPolicy): Statement[] {
  return (p.statements ?? []).map((s) => ({
    effect: s.effect,
    permissions: s.permissions,
    conditions: (s.conditions ?? []).map(
      (c): Condition => ({
        name: c.name,
        operator: c.operator,
        values: c.values ?? [],
      }),
    ),
  }));
}

export interface Resolved {
  groups: GroupInfo[];
  levels: Level[];
  warnings: string[];
  diagnostics: DiagEntry[];
}

/** Enrich groups with SAML claims, role permissions and policy bindings. */
export async function resolveGroups(
  api: AccountClient,
  rawGroups: RawGroup[],
): Promise<Resolved> {
  const warnings: string[] = [];
  const diagnostics: DiagEntry[] = [];
  const acct = encodeURIComponent(api.accountUuid);
  const { envs, zones } = await loadEnvironments(api, warnings);
  const accountName =
    rawGroups.find((g) => g.accountName)?.accountName ?? "Account";
  // The user record omits SAML claim mappings; the account group list has them.
  const claims = new Map<string, string[]>();
  try {
    const res = await api.get<
      { items?: RawAccountGroup[] } | RawAccountGroup[]
    >(`/iam/v1/accounts/${acct}/groups`);
    const list = Array.isArray(res) ? res : (res.items ?? []);
    for (const g of list) {
      claims.set(g.uuid, g.federatedAttributeValues ?? []);
    }
  } catch (e) {
    warnings.push(
      `Could not read SAML group mappings (${(e as Error).message}).`,
    );
  }

  const groups = new Map<string, GroupInfo>(
    rawGroups.map((g) => [
      g.uuid,
      {
        uuid: g.uuid,
        name: g.groupName,
        owner: g.owner,
        description: g.description,
        federatedAttributeValues: claims.get(g.uuid) ?? [],
        bindings: [],
        rolePermissions: [],
      },
    ]),
  );

  // Role-style permissions (account-viewer, tenant-viewer, ...) first: their
  // scopes also reveal environment IDs even if the environment list failed.
  await mapLimit(rawGroups, CONCURRENCY, async (g) => {
    try {
      const res = await api.get<RawGroupPermissions>(
        `/iam/v1/accounts/${acct}/groups/${encodeURIComponent(g.uuid)}/permissions`,
      );
      groups.get(g.uuid)!.rolePermissions = (res.permissions ?? []).map(
        (p): RolePermission => ({
          permission: p.permissionName,
          scopeType: p.scopeType ?? "",
          scope: p.scope ?? "",
          scopeName: p.scope ?? "",
        }),
      );
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        warnings.push(
          `Role permissions for "${g.groupName}" failed: ${(e as Error).message}`,
        );
      }
    }
  });

  const levels: Level[] = [
    { type: "global", id: "global", name: "Global" },
    { type: "account", id: api.accountUuid, name: accountName },
    ...envs,
  ];
  for (const g of groups.values()) {
    for (const r of g.rolePermissions) {
      if (r.scopeType.toLowerCase() === "account") continue;
      const envId = r.scope.split(":")[0];
      if (envId && !levels.some((l) => l.id === envId)) {
        levels.push({ type: "environment", id: envId, name: envId });
      }
    }
  }
  const levelName = new Map(levels.map((l) => [l.id, l.name]));
  for (const g of groups.values()) {
    for (const r of g.rolePermissions) {
      if (r.scopeType.toLowerCase() === "account") {
        r.scopeName = accountName;
        continue;
      }
      const [envId, ...zone] = r.scope.split(":");
      r.scopeName = levelName.get(envId) ?? r.scope;
      if (zone.length > 0) {
        const zoneId = zone.join(":");
        r.zoneName = zones.get(zoneId) ?? zoneId;
      }
    }
  }

  // Policies are looked up by UUID; cache them across groups and levels.
  const policyCache = new Map<string, Promise<RawPolicy | undefined>>();
  const fetchPolicy = (uuid: string, bindingLevel: Level) => {
    let p = policyCache.get(uuid);
    if (!p) {
      const candidates: Level[] = [
        { type: "global", id: "global", name: "Global" },
        { type: "account", id: api.accountUuid, name: accountName },
        bindingLevel,
      ];
      p = (async () => {
        for (const l of candidates) {
          try {
            return await api.get<RawPolicy>(
              `/iam/v1/repo/${l.type}/${encodeURIComponent(l.id)}/policies/${encodeURIComponent(uuid)}`,
            );
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 404)) throw e;
          }
        }
        return undefined;
      })();
      policyCache.set(uuid, p);
    }
    return p;
  };

  const bindingPath = (l: Level, groupUuid: string) =>
    `/iam/v1/repo/${l.type}/${encodeURIComponent(l.id)}/bindings/groups/${encodeURIComponent(groupUuid)}`;

  // group × level binding lookups, tolerant of response shape and errors
  const jobs = rawGroups.flatMap((g) => levels.map((level) => ({ g, level })));
  const found = await mapLimit(jobs, CONCURRENCY, async ({ g, level }) => {
    const diag = (outcome: string, detail = "") =>
      diagnostics.push({
        group: g.groupName,
        level: `${level.type}:${level.name}`,
        outcome,
        detail,
      });
    for (const query of ["?details=true", ""]) {
      try {
        const raw = await api.get<unknown>(bindingPath(level, g.uuid) + query);
        const { entries, recognised } = normaliseBindings(raw);
        if (entries.length > 0) {
          diag("bindings", `${entries.length} policy binding(s)${query ? " (details)" : ""}`);
          return { g, level, entries };
        }
        if (recognised) {
          diag("none", "no policies bound");
          return { g, level, entries: [] as RawBindingEntry[] };
        }
        // Unrecognised shape: report its keys, then retry without details.
        diag(
          "unrecognised",
          `keys: ${Object.keys((raw ?? {})).join(", ") || "(none)"}${query ? " (details)" : ""}`,
        );
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 404) {
          diag("not-found", "404");
          return { g, level, entries: [] as RawBindingEntry[] };
        }
        diag("error", `${(e as Error).message}${query ? " (details)" : ""}`);
      }
    }
    warnings.push(
      `Bindings for "${g.groupName}" at ${level.name} could not be read.`,
    );
    return { g, level, entries: [] as RawBindingEntry[] };
  });

  // Prefetch each distinct policy once, in parallel, before assembling.
  const distinct = new Map<string, Level>();
  for (const f of found) {
    for (const entry of f.entries) {
      if (!distinct.has(entry.policyUuid)) {
        distinct.set(entry.policyUuid, f.level);
      }
    }
  }
  await mapLimit([...distinct], CONCURRENCY, ([uuid, level]) =>
    fetchPolicy(uuid, level),
  );

  for (const f of found) {
    for (const entry of f.entries) {
      const policy = await fetchPolicy(entry.policyUuid, f.level);
      if (!policy) {
        warnings.push(`Policy ${entry.policyUuid} could not be read.`);
      }
      const binding: BindingInfo = {
        level: f.level,
        policyUuid: entry.policyUuid,
        policyName: policy?.name ?? entry.policyUuid,
        statementQuery: policy?.statementQuery,
        statements: policy ? toStatements(policy) : [],
        boundaries: entry.boundaries ?? [],
        parameters: entry.parameters ?? {},
      };
      groups.get(f.g.uuid)!.bindings.push(binding);
    }
  }

  return {
    groups: [...groups.values()],
    levels,
    warnings: [...new Set(warnings)],
    diagnostics: diagnostics.filter((d) => d.outcome !== "none"),
  };
}
