import { createAccountClient } from "./lib/accountApi";
import { resolveGroups, type RawGroup } from "./lib/resolve";
import type { UserPermissions } from "./lib/model";

const EMAIL = /^[^\s@/?#\\]+@[^\s@/?#\\]+\.[^\s@/?#\\]+$/;

interface RawUser {
  uid: string;
  email: string;
  name: string;
  surname: string;
  userStatus: string;
  userLoginMetadata?: { lastSuccessfulLogin?: string | null };
  groups?: RawGroup[];
}

/** Resolve one user by email into groups → roles + policy bindings → statements. */
export default async function (
  payload: { email?: string } = {},
): Promise<UserPermissions> {
  const email = payload.email?.trim();
  if (!email || !EMAIL.test(email) || email.length > 320) {
    throw new Error("A valid email address is required.");
  }

  const api = await createAccountClient();
  const rawUser = await api.get<RawUser>(
    `/iam/v1/accounts/${encodeURIComponent(api.accountUuid)}/users/${encodeURIComponent(email)}`,
  );
  const resolved = await resolveGroups(api, rawUser.groups ?? []);

  return {
    user: {
      uid: rawUser.uid,
      email: rawUser.email,
      name: rawUser.name,
      surname: rawUser.surname,
      status: rawUser.userStatus,
      lastLogin: rawUser.userLoginMetadata?.lastSuccessfulLogin ?? null,
    },
    ...resolved,
  };
}
