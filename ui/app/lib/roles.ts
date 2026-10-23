// Display names for role-style permissions, as the Dynatrace UI shows them.
// Unknown IDs fall back to the raw ID.
const ROLE_LABELS: Record<string, string> = {
  "account-company-info": "View and manage account and billing information",
  "account-viewer": "View account",
  "account-user-management": "View and manage users and groups",
  "account-saml-flexible-federation": "Manage SAML federation",
  "tenant-viewer": "View environment",
  "tenant-view-sensitive-request-data": "View sensitive request data",
  "tenant-configure-request-capture-data":
    "Manage capturing of sensitive request data",
  "tenant-manage-settings": "Manage monitoring settings",
  "tenant-agent-install": "Install OneAgent",
  "tenant-manage-support-tickets": "Manage support tickets",
  "tenant-replay-sessions-with-masking": "Replay sessions with masking",
  "tenant-replay-sessions-without-masking":
    "Replay sessions without masking",
  "tenant-manage-security-problems": "Manage security problems",
  "tenant-log-viewer": "View logs",
  "tenant-manage-log-ingest": "Manage log ingest",
};

export function roleLabel(id: string): string {
  return ROLE_LABELS[id] ?? id;
}
