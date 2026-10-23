import { createAccountClient } from "./lib/accountApi";

interface RawUser {
  uid: string;
  email: string;
  name?: string;
  surname?: string;
  userStatus?: string;
  type?: string;
}
interface RawUserList {
  items?: RawUser[];
  nextPageKey?: string;
}

const MAX_PAGES = 20;

/** Slim roster of account users for the search picker (no groups, no logins). */
export default async function () {
  const api = await createAccountClient();
  const base = `/iam/v1/accounts/${encodeURIComponent(api.accountUuid)}/users`;

  const users: RawUser[] = [];
  let query = "";
  // The endpoint is not documented as paged; follow a page key if it appears.
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.get<RawUserList | RawUser[]>(base + query);
    const list = Array.isArray(res) ? res : (res.items ?? []);
    users.push(...list);
    const next = Array.isArray(res) ? undefined : res.nextPageKey;
    if (!next) break;
    query = `?page-key=${encodeURIComponent(next)}`;
  }

  return {
    users: users
      .filter((u) => u.email && u.type !== "SERVICE")
      .map((u) => ({
        uid: u.uid,
        email: u.email,
        name: u.name ?? "",
        surname: u.surname ?? "",
        status: u.userStatus ?? "",
      }))
      .sort((a, b) =>
        `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`),
      ),
  };
}
