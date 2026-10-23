import { loadConnectionConfig, type ConnectionConfig } from "./config";

const SCOPES = [
  "account-idm-read",
  "account-env-read",
  "iam-policies-management",
];

export class ApiError extends Error {
  constructor(
    public status: number,
    path: string,
  ) {
    super(`Account API ${status} for ${path}`);
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cached: CachedToken | undefined;

async function getToken(cfg: ConnectionConfig): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 30_000) return cached.token;
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: SCOPES.join(" "),
      resource: `urn:dtaccount:${cfg.accountUuid}`,
    }).toString(),
  });
  if (!res.ok) {
    // Never include the request body: it contains the client secret.
    throw new Error(`Token request failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cached.token;
}

export interface AccountClient {
  accountUuid: string;
  /** GET an absolute API path (starting with /). 404 throws ApiError(404). */
  get<T>(path: string): Promise<T>;
}

/** Loads config + token once per invocation; retries 429 with backoff. */
export async function createAccountClient(): Promise<AccountClient> {
  const cfg = await loadConnectionConfig();
  const token = await getToken(cfg);
  return {
    accountUuid: cfg.accountUuid,
    async get<T>(path: string): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        if (!res.ok) throw new ApiError(res.status, path);
        return (await res.json()) as T;
      }
    },
  };
}

/** Run async work over items with a concurrency cap. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}
