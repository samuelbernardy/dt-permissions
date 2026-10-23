import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";

export interface ConnectionConfig {
  accountUuid: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  apiBaseUrl: string;
}

const REQUIRED = ["accountUuid", "clientId", "clientSecret"] as const;

/**
 * Reads the connection settings object. Secret fields are only returned in
 * plain text when this runs inside the app's own serverless function.
 */
export async function loadConnectionConfig(): Promise<ConnectionConfig> {
  const res = await appSettingsObjectsClient.getEffectiveAppSettingsValues({
    schemaId: "connection",
  });
  const value = res.items?.[0]?.value as Partial<ConnectionConfig> | undefined;
  const missing = REQUIRED.filter((k) => !value?.[k]);
  if (!value || missing.length > 0) {
    throw new Error(
      `Connection settings incomplete (missing: ${missing.join(", ") || "all"}). Fill in the "Account Management API connection" settings object.`,
    );
  }
  return {
    // Accept either the bare UUID or the full urn:dtaccount:<uuid> form.
    accountUuid: value.accountUuid!.trim().replace(/^urn:dtaccount:/i, ""),
    clientId: value.clientId!,
    clientSecret: value.clientSecret!,
    tokenUrl: value.tokenUrl || "https://sso.dynatrace.com/sso/oauth2/token",
    apiBaseUrl: value.apiBaseUrl || "https://api.dynatrace.com",
  };
}
