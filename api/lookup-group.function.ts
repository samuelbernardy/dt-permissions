import { createAccountClient } from "./lib/accountApi";
import { resolveGroups } from "./lib/resolve";

const UUID = /^[0-9a-fA-F-]{8,64}$/;

interface RawAccountGroup {
  uuid: string;
  name?: string;
  groupName?: string;
  owner: string;
  description?: string | null;
}

/** Resolve one group's roles, policies and SAML claims by UUID. */
export default async function (payload: { uuid?: string } = {}) {
  const uuid = payload.uuid?.trim();
  if (!uuid || !UUID.test(uuid)) throw new Error("A group UUID is required.");

  const api = await createAccountClient();
  const res = await api.get<
    { items?: RawAccountGroup[] } | RawAccountGroup[]
  >(`/iam/v1/accounts/${encodeURIComponent(api.accountUuid)}/groups`);
  const list = Array.isArray(res) ? res : (res.items ?? []);
  const g = list.find((x) => x.uuid === uuid);
  if (!g) throw new Error("Group not found in this account.");

  return resolveGroups(api, [
    {
      uuid: g.uuid,
      groupName: g.name ?? g.groupName ?? g.uuid,
      owner: g.owner,
      description: g.description ?? null,
    },
  ]);
}
