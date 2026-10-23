import React, { useRef, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import {
  Chip,
  Markdown,
  MessageContainer,
  ProgressCircle,
} from "@dynatrace/strato-components/content";
import { TextArea } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Text } from "@dynatrace/strato-components/typography";
import {
  ask,
  checkMentioned,
  type ConversationState,
  type PermissionCheck,
} from "../lib/assist";
import type { UserPermissions } from "../lib/model";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";

// Chips ellipsize long text, so prompts use wrapping elements instead.
const wrap: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  textAlign: "left",
};

const suggestionStyle: React.CSSProperties = {
  ...wrap,
  width: "100%",
  padding: "8px 12px",
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
  background: Colors.Background.Container.Primary.Default,
  border: `${Borders.Width.Default} solid ${Colors.Border.Primary.Default}`,
  borderRadius: Borders.Radius.Container.Default,
};

const userBubble: React.CSSProperties = {
  ...wrap,
  padding: "8px 12px",
  background: Colors.Background.Container.Primary.Emphasized,
  border: `${Borders.Width.Default} solid ${Colors.Border.Primary.Default}`,
  borderRadius: Borders.Radius.Container.Default,
};

interface Message {
  role: "user" | "assistant";
  text: string;
  checks?: PermissionCheck[];
}

const SUGGESTIONS = [
  "What permissions do I need to edit alerting profiles?",
  "Which permissions allow creating and running workflows?",
  "What is needed to read logs from a specific bucket?",
  "What's the difference between the AppEngine - User and Admin policies?",
];

const CHECK_LABEL: Record<PermissionCheck["status"], string> = {
  granted: "✓ has",
  conditional: "~ conditional",
  denied: "✗ denied",
  none: "✗ not found",
};
const CHECK_COLOR: Record<
  PermissionCheck["status"],
  "success" | "warning" | "critical" | "neutral"
> = {
  granted: "success",
  conditional: "warning",
  denied: "critical",
  none: "neutral",
};

export const AssistChat = ({
  show,
  onDismiss,
  result,
}: {
  show: boolean;
  onDismiss: () => void;
  result?: UserPermissions;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const state = useRef<ConversationState>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setError(undefined);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const reply = await ask(q, state.current, result);
      state.current = reply.state;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: reply.text,
          checks: checkMentioned(reply.text, result),
        },
      ]);
    } catch (e) {
      setError((e as Error).message || "Assist request failed.");
    } finally {
      setBusy(false);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const reset = () => {
    state.current = undefined;
    setMessages([]);
    setError(undefined);
  };

  return (
    <Sheet
      show={show}
      onDismiss={onDismiss}
      title="Permission Assist"
      actions={
        <Flex gap={8}>
          <Button onClick={reset} disabled={busy || messages.length === 0}>
            New chat
          </Button>
          <Button onClick={onDismiss}>Close</Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={12} style={{ height: "100%" }}>
        <Text style={{ opacity: 0.7 }}>
          {result
            ? `Answers use the access of ${result.user.name} ${result.user.surname} (names and policy contents are shared with Davis CoPilot; emails are not).`
            : "Look up a user to include their access in answers."}{" "}
          AI answers can be wrong; verify against the Dynatrace documentation.
        </Text>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <Flex flexDirection="column" gap={12}>
            {messages.length === 0 && (
              <Flex flexDirection="column" gap={8}>
                <Text>Ask which permissions an action needs, for example:</Text>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    style={suggestionStyle}
                    onClick={() => void send(s)}
                  >
                    {s}
                  </button>
                ))}
              </Flex>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                }}
              >
                {m.role === "user" ? (
                  <div style={userBubble}>{m.text}</div>
                ) : (
                  <Flex flexDirection="column" gap={8}>
                    <Markdown>{m.text}</Markdown>
                    {m.checks && m.checks.length > 0 && (
                      <Flex flexDirection="column" gap={4}>
                        <Text style={{ opacity: 0.7 }}>
                          Checked against this user&apos;s policies (role-based
                          tenant-* access is not included):
                        </Text>
                        <Flex gap={4} flexWrap="wrap">
                          {m.checks.map((c) => (
                            <Chip
                              key={c.permission}
                              size="condensed"
                              color={CHECK_COLOR[c.status]}
                              title={c.via.join("\n")}
                            >
                              {CHECK_LABEL[c.status]} {c.permission}
                            </Chip>
                          ))}
                        </Flex>
                      </Flex>
                    )}
                  </Flex>
                )}
              </div>
            ))}
            {busy && <ProgressCircle />}
            {error && (
              <MessageContainer variant="critical">
                <MessageContainer.Title>Assist unavailable</MessageContainer.Title>
                <MessageContainer.Description>
                  {error} If this is a permissions error, your account needs
                  Davis CoPilot access (davis-copilot:conversations:execute).
                </MessageContainer.Description>
              </MessageContainer>
            )}
            <div ref={bottom} />
          </Flex>
        </div>

        <Flex gap={8} alignItems="flex-end">
          <div style={{ flex: 1 }}>
            <TextArea
              width="full"
              rows={4}
              resize="vertical"
              value={input}
              onChange={(v) => setInput(v ?? "")}
              placeholder="Ask about a permission or action…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
          </div>
          <Button
            variant="emphasized"
            disabled={busy || !input.trim()}
            onClick={() => void send(input)}
          >
            Send
          </Button>
        </Flex>
      </Flex>
    </Sheet>
  );
};
