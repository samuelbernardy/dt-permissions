# User Permission Explorer

A Dynatrace app (AppEngine) for viewing and exploring the permissions that
Dynatrace users and groups hold. It extends what the built-in Effective
Permissions viewer shows by combining **roles**, **IAM policies**, **WHERE
conditions**, **SAML/AD group claims** and an **AI assistant** in one place.

- App ID: `my.permissionexplorer`
- Current version: see `app.config.json`

## Purpose

Answer these questions without needing Account Management access:

- What roles and policies does this user hold, in which environments?
- Which of those permissions are limited by conditions (WHERE clauses,
  management zones, boundaries)?
- For settings permissions, which **schemas** can they read or write?
- Which Dynatrace group does an AD group (SAML claim) map to, and what does
  that group grant?
- What permissions does a particular action require, and does this user have
  them?

Everyone who can open the app can look up **any** user in the account (see
[Security notes](#security-notes)).

## How it works

```
Browser (React / Strato UI)
   │  useAppFunction()
   ▼
App functions (Dynatrace JS runtime)  ── reads ──►  Settings object "connection"
   │  OAuth client credentials                      (account UUID, client ID/secret)
   ▼
sso.dynatrace.com  (token)      api.dynatrace.com  (Account Management API)
```

The OAuth client secret is only ever read by the app's backend functions. The
browser never receives it. The Assist chat is the one exception to the
"everything goes through the OAuth client" rule: it calls Davis CoPilot
directly from the browser with the signed-in user's own token.

### Pages

| Page | Purpose |
|---|---|
| **User explorer** (`/`) | Search users by name or email (list is preloaded from the account). Selecting one shows a card per group with its **roles** and **policies**, scope chips (environment/account names), a conditional-access summary, filter box, CSV/JSON export, and the Assist chat. |
| **AD group mapping** (`/ad-mapping`) | All account groups with their SAML claim values, a "paste AD group names" checker, and per-group access on demand. CSV export. |

### What each group tile shows

- **ROLE** rows: role-style permissions (for example "View environment" =
  `tenant-viewer`) with their scope (account, environment, management zone).
- **POLICY** rows: IAM policies bound to the group, with the environments they
  apply to. Expand a policy to see:
  - **Settings schema access**: one row per schema with `objects:read` /
    `objects:write` / `schemas:read`. Schemas with extra conditions get their
    own collapsible condition table.
  - **Other permissions**: non-settings permissions with effect and conditions.
- `WHERE` chip = conditions, management zone or boundary apply. `DENY` chip =
  at least one DENY statement.
- Group owner chip (`LOCAL`, `SCIM`, `SAML`, `ALL_USERS`) and, where mapped,
  `SAML claim:` chips.
- A collapsed **Diagnostics** section lists the levels that were checked and any
  binding lookup that errored, returned an unexpected shape or found nothing
  unusual.

### Assist chat

Opened with **Ask Assist** on the explorer page. It sends the question to Davis
CoPilot together with:

- Dynatrace documentation search (CoPilot's `document-retrieval`),
- an instruction to explain required permissions and not invent names,
- a compact summary of the looked-up user's access (group, role, policy and
  permission names and conditions; **no emails or personal names**).

Permission names that appear in an answer (for example
`settings:objects:write`) are then checked **by the app, not the model**
against the user's policies and shown as ✓ has / ~ conditional / ✗ denied /
✗ not found. Role-based `tenant-*` access is not part of that check.

## Connection schema

The app registers one settings schema, `connection`
([settings/schemas/connection.schema.json](settings/schemas/connection.schema.json)),
a single object that holds the Account Management API connection. After
installing the app, open **Settings** in the tenant and fill in
**Account Management API connection**.

| Field | Type | Required | Description |
|---|---|---|---|
| `accountUuid` | text | yes | Dynatrace account UUID. The full `urn:dtaccount:<uuid>` form shown on the OAuth client is also accepted; the prefix is stripped. |
| `clientId` | text | yes | OAuth client ID (`dt0s02.XXXXXXXX`). |
| `clientSecret` | secret | yes | OAuth client secret. Stored write-only; only the app's backend functions can read it back. |
| `tokenUrl` | text | no | Defaults to `https://sso.dynatrace.com/sso/oauth2/token`. |
| `apiBaseUrl` | text | no | Defaults to `https://api.dynatrace.com`. |

**Pre-filling the values (optional).** You can type the account UUID, client ID
and secret into the three `default` fields of `connection.schema.json` so the
Settings object comes up pre-filled when the app is installed. A Git *clean
filter* keeps those values out of commits: it blanks the three credential
defaults whenever the file is staged, so the committed file is always complete
and blank, while your working copy keeps its values. Nobody else needs to
rebuild anything.

The filter is declared in `.gitattributes` (committed) but its command lives in
each clone's local Git config, so run this once per clone:

```bash
git config filter.pe-creds.clean "node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);for(const k of ['accountUuid','clientId','clientSecret'])j.properties[k].default='';process.stdout.write(JSON.stringify(j,null,2)+'\\\\n')})\""
```

Check it with `git add -n` / `git diff --cached`: the three defaults should be `""`.
Defaults still ship inside the **deployed app bundle**, so use a dedicated,
read-only OAuth client and rotate its secret if it is ever exposed. Leaving
the defaults blank and entering the values in Settings avoids that entirely.

If the object is incomplete, lookups fail with "Connection settings incomplete
(missing: …)".

## Scope requirements

### OAuth client (Account Management API)

Create an OAuth client in **Account Management → Identity & access management →
OAuth clients** with these permissions. The function requests exactly these
scopes when it asks for a token:

| Scope | Used for |
|---|---|
| `account-idm-read` | Users, groups, group role permissions, SAML claim values |
| `account-env-read` | Environment names (and management zone names) |
| `iam-policies-management` | Policy bindings per group/level and policy statements |

Per the API docs, `iam:bindings:read` and `iam:policies:read` can replace
`iam-policies-management` for read-only access, but the app currently requests
`iam-policies-management`, so the client must have that one.

Use a dedicated, read-only client. The app never writes to the account.

### App scopes (`app.config.json`)

| Scope | Why |
|---|---|
| `app-settings:objects:read` | Backend functions read the `connection` settings object. |
| `davis-copilot:conversations:execute` | The Assist chat calls Davis CoPilot. |

Users of the app need these to be allowed by their own IAM policies (in
particular CoPilot access for the chat). Without it the chat shows "Assist
unavailable" and everything else still works.

## Tenant prerequisites

- **Outbound connections:** allow `sso.dynatrace.com` and `api.dynatrace.com`
  in the tenant's external-requests / allowed outbound hosts settings. Without
  them every lookup fails at the token request.
- **Davis CoPilot** enabled on the tenant, if the chat is wanted.
- **SDK/service version match:** the CoPilot SDK declares the service API
  version it needs and the install is rejected if the tenant is older.
  `@dynatrace-sdk/client-davis-copilot` is pinned to `^1.0.0` (service API
  1.0.0) because 2.0.0 required 1.0.3 and one tenant offered 1.0.1. Re-check
  this on each new tenant.

## Setup and deployment

1. Create the OAuth client and note the account UUID (see above).
2. Set `environmentUrl` in `app.config.json` to the target tenant.
3. Bump the version (see below).
4. `npm install`, then `npm run deploy` (you will be asked to sign in).
5. In the tenant: **Settings → Account Management API connection** and enter
   `accountUuid`, `clientId`, `clientSecret`.
6. Allow the outbound hosts listed above.
7. Open the app from the Apps menu and look up a user.

### Versioning

Every deploy needs a new version in `app.config.json` (also `package.json` and
the two matching entries at the top of `package-lock.json`):

- new feature: bump the **minor** version,
- fix: bump the **patch** version.

### Local development

`npm run start` serves the UI locally, but the backend functions run on your
machine and cannot read the tenant's settings schema ("Schema 'connection' not
found for app version"). Test lookups in the **deployed** app.

`npm run lint` and `npm run build` must pass.

## Security notes

- **Open lookups.** There is no admin/non-admin split: anyone who can open the
  app can look up any user and browse the user list. Limit who can run the app
  with an IAM policy on its app ID.
- **One shared credential.** The OAuth client is shared by every user of the
  app. Keep it read-only and rotate its secret if it ever appears in a file,
  log or screenshot. Functions never return it and error messages do not
  include request bodies.
- **Assist data sharing.** CoPilot's `supplementary` context is not anonymised.
  The app sends role, policy and permission names and conditions only.
- **Exports.** CSV cells that begin with `=`, `+`, `-` or `@` are prefixed with
  a quote so spreadsheet programs do not run them as formulas.

## Known limitations

- Policy **boundaries** are shown as a count; their contents are not resolved.
- The role display-name table in `ui/app/lib/roles.ts` covers common role IDs;
  unknown IDs show the raw ID.
- The Assist permission check recognises names with three or more
  colon-separated parts (for example `storage:logs:read`).
- The user list is loaded into the browser in one request; very large accounts
  may need server-side search.
- Rows use CSS subgrid (Chrome/Edge 117+, Firefox 71+, Safari 16+).
- The CoPilot conversation endpoint is in preview.
- The Account Management API shapes for bindings and the user list are only
  partly documented; the code accepts several shapes and reports surprises in
  **Diagnostics**.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Connection settings incomplete" | The settings object is not filled in. |
| "Schema 'connection' not found for app version" | Running with `npm run start`, or the app was not installed. Use the deployed app. |
| "Token request failed: HTTP 4xx" | Wrong client ID/secret/account UUID, or the client lacks a requested scope. |
| Network / host not allowed | Outbound hosts not allowed on the tenant. |
| "Account API 403/404 for …" | Missing scope, or the user/group is not in this account. |
| Environments show as IDs | Environment list call failed; see the warning at the top of the page. |
| Group shows roles but no policies | Check **Diagnostics** for the binding lookups at each level. |
| "Assist unavailable" | CoPilot not enabled, user lacks `davis-copilot:conversations:execute`, or the CoPilot service version differs. |
| Install fails: "references a version that does not exist on your tenant" | SDK/service version mismatch (see prerequisites). |
| Install fails: "violates apps schema" | The settings schema is invalid, for example `summaryPattern` set on a single-object schema. |

## Project structure

```
app.config.json                 app metadata, scopes, environment URL, version
settings/schemas/               settings schema (connection)
api/                            backend functions
  lookup-user.function.ts       user → groups → roles + policies
  lookup-group.function.ts      one group → roles + policies + claims
  list-groups.function.ts       all groups with SAML claim values
  list-users.function.ts        slim user roster for the picker
  lib/accountApi.ts             token + GET wrapper (429 retry, concurrency cap)
  lib/config.ts                 reads the connection settings
  lib/resolve.ts                shared group enrichment
ui/app/
  pages/                        Explorer, AdMapping
  components/                   GroupCard, ConditionTable, UserPicker, AssistChat
  lib/                          derive, schemaAccess, export, assist, roles, theme
```
