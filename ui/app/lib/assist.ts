import {
  publicClient,
  type ConversationRequest,
} from "@dynatrace-sdk/client-davis-copilot";
import { deriveGroup, levelLabel } from "./derive";
import type { UserPermissions } from "./model";

export type ConversationState = ConversationRequest["state"];

const INSTRUCTION =
  "You are the Permission Explorer assistant for Dynatrace IAM. Explain which " +
  "permissions, roles and policies are required for specific actions in " +
  "Dynatrace. Name exact permission strings (for example settings:objects:write) " +
  "and mention conditions such as settings:schemaId where they apply. If " +
  "user access data is supplied, say whether that user appears to hold the " +
  "permissions; if the data does not show it, say you cannot confirm. Never " +
  "invent permission names; say when you are unsure. Be concise and use " +
  "bullet points.";

const MAX_GROUNDING = 7000;
const MAX_PERMS_PER_POLICY = 40;

/**
 * Compact summary of one user's access, used as chat context. The API does not
 * anonymise this field, so it carries only role/policy/permission names: no
 * emails or personal names.
 */
export function buildGrounding(result: UserPermissions): string {
  const views = result.groups.map(deriveGroup);
  const lines: string[] = [
    "Access of the user being examined (from Dynatrace account IAM):",
  ];

  for (const v of views) {
    lines.push(`Group "${v.group.name}" (${v.group.owner}):`);
    for (const i of v.items) {
      lines.push(
        `- ${i.kind} ${i.name}${i.kind === "ROLE" ? ` (${i.id})` : ""} @ ${i.levels.map(levelLabel).join(", ")}`,
      );
    }
  }

  const seen = new Set<string>();
  const policyLines: string[] = [];
  for (const v of views) {
    for (const i of v.items) {
      if (i.kind !== "POLICY" || seen.has(i.id)) continue;
      seen.add(i.id);
      const perms = i.permissions.slice(0, MAX_PERMS_PER_POLICY);
      const more = i.permissions.length - perms.length;
      const conds = i.statements
        .filter((s) => s.conditions.length > 0)
        .slice(0, 5)
        .map(
          (s) =>
            `${s.effect} ${s.permissions.slice(0, 3).join(",")} WHERE ` +
            s.conditions
              .map((c) => `${c.name} ${c.operator} ${c.values.slice(0, 5).join("|")}`)
              .join(" AND "),
        );
      policyLines.push(
        `Policy "${i.name}": ${perms.join(", ")}${more > 0 ? ` (+${more} more)` : ""}` +
          (conds.length ? `; conditions: ${conds.join(" ; ")}` : ""),
      );
    }
  }
  if (policyLines.length) lines.push("Policy contents:", ...policyLines);

  const text = lines.join("\n");
  return text.length > MAX_GROUNDING
    ? `${text.slice(0, MAX_GROUNDING)}\n[truncated]`
    : text;
}

export type PermissionStatus = "granted" | "conditional" | "denied" | "none";

export interface PermissionCheck {
  permission: string;
  status: PermissionStatus;
  via: string[];
}

/** permission -> where the examined user gets it (policy statements only). */
function indexPermissions(result: UserPermissions) {
  const index = new Map<
    string,
    { via: Set<string>; conditional: boolean; denied: boolean }
  >();
  for (const g of result.groups) {
    for (const b of g.bindings) {
      for (const s of b.statements) {
        for (const p of s.permissions) {
          const e = index.get(p) ?? {
            via: new Set<string>(),
            conditional: false,
            denied: false,
          };
          e.via.add(`${g.name} › ${b.policyName}`);
          if (s.effect === "DENY") e.denied = true;
          else if (s.conditions.length > 0 || b.boundaries.length > 0) {
            e.conditional = true;
          }
          index.set(p, e);
        }
      }
    }
  }
  return index;
}

// e.g. storage:logs:read, settings:objects:write, app-engine:apps:run
const PERMISSION_RE = /\b[a-z][a-z0-9-]*(?::[a-z0-9-]+){2,}\b/g;

/**
 * Deterministic check of permission names mentioned in an answer against the
 * examined user's policies, so "you have X" never relies on the model.
 */
export function checkMentioned(
  answer: string,
  result: UserPermissions | undefined,
): PermissionCheck[] {
  if (!result) return [];
  const index = indexPermissions(result);
  const mentioned = [...new Set(answer.match(PERMISSION_RE) ?? [])];
  return mentioned.map((permission) => {
    const e = index.get(permission);
    const status: PermissionStatus = !e
      ? "none"
      : e.denied
        ? "denied"
        : e.conditional
          ? "conditional"
          : "granted";
    return { permission, status, via: e ? [...e.via] : [] };
  });
}

export interface AssistReply {
  text: string;
  state: ConversationState;
}

/** One chat turn against the Davis CoPilot recommender (non-streaming). */
export async function ask(
  text: string,
  state: ConversationState | undefined,
  result: UserPermissions | undefined,
): Promise<AssistReply> {
  const context: NonNullable<ConversationRequest["context"]> = [
    { type: "document-retrieval", value: "dynatrace" },
    { type: "instruction", value: INSTRUCTION },
  ];
  if (result) {
    context.push({ type: "supplementary", value: buildGrounding(result) });
  }

  const res = await publicClient.recommenderConversation({
    body: { text, state, context },
  });

  if (Array.isArray(res)) {
    // Streaming-style event list: take the final answer from the end event.
    const end = res.find((e) => e.event === "end");
    const data = end?.data as
      | { answer?: string; state?: ConversationState }
      | undefined;
    if (!data?.answer) throw new Error("Assist returned no answer.");
    return { text: data.answer, state: data.state };
  }
  if (res.status === "FAILED") throw new Error("Assist could not answer.");
  return { text: res.text, state: res.state };
}
