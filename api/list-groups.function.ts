import { createAccountClient } from "./lib/accountApi";

interface RawAccountGroup {
  uuid: string;
  name?: string;
  groupName?: string;
  owner: string;
  description?: string | null;
  federatedAttributeValues?: string[] | null;
}

/** All account groups with their SAML claim values (AD group mappings). */
export default async function () {
  const api = await createAccountClient();
  const res = await api.get<
    { items?: RawAccountGroup[] } | RawAccountGroup[]
  >(`/iam/v1/accounts/${encodeURIComponent(api.accountUuid)}/groups`);
  const list = Array.isArray(res) ? res : (res.items ?? []);
  return {
    groups: list
      .map((g) => ({
        uuid: g.uuid,
        name: g.name ?? g.groupName ?? g.uuid,
        owner: g.owner,
        description: g.description ?? null,
        federatedAttributeValues: g.federatedAttributeValues ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
