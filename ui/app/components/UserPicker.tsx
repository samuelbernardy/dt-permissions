import React, { useMemo, useState } from "react";
import {
  Chip,
  MessageContainer,
  ProgressCircle,
} from "@dynatrace/strato-components/content";
import { TextInput } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import Borders from "@dynatrace/strato-design-tokens/borders";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { stripe } from "../lib/theme";

interface ListedUser {
  uid: string;
  email: string;
  name: string;
  surname: string;
  status: string;
}

const MAX_RESULTS = 8;
const EMAIL = /^[^\s@/?#\\]+@[^\s@/?#\\]+\.[^\s@/?#\\]+$/;

const norm = (s: string) => s.trim().toLowerCase();

/** Search the account's users by name or email; picking one runs the lookup. */
export const UserPicker = ({
  onSelect,
}: {
  onSelect: (email: string) => void;
}) => {
  const { data, error, isLoading } = useAppFunction({
    name: "list-users",
    data: {},
  });
  const users = (data as { users: ListedUser[] } | undefined)?.users;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(false);

  const matches = useMemo(() => {
    const q = norm(query);
    if (!users || q.length < 2) return [];
    const scored = users
      .map((u) => {
        const full = norm(`${u.name} ${u.surname}`);
        const reversed = norm(`${u.surname} ${u.name}`);
        const email = norm(u.email);
        const rank =
          email.startsWith(q) || full.startsWith(q) || reversed.startsWith(q)
            ? 0
            : full.includes(q) || reversed.includes(q) || email.includes(q)
              ? 1
              : 2;
        return { u, rank };
      })
      .filter((x) => x.rank < 2)
      .sort((a, b) => a.rank - b.rank);
    return scored.slice(0, MAX_RESULTS).map((x) => x.u);
  }, [users, query]);

  const choose = (email: string, label: string) => {
    setQuery(label);
    setPicked(true);
    onSelect(email);
  };

  const typedEmail = EMAIL.test(query.trim()) ? query.trim() : undefined;

  return (
    <Flex flexDirection="column" gap={8} style={{ maxWidth: 560 }}>
      <TextInput
        value={query}
        onChange={(v) => {
          setQuery(v ?? "");
          setPicked(false);
        }}
        placeholder={
          users
            ? `Search ${users.length} users by name or email`
            : "Search users by name or email"
        }
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (matches[0]) {
            choose(matches[0].email, matches[0].email);
          } else if (typedEmail) {
            choose(typedEmail, typedEmail);
          }
        }}
      />
      {isLoading && (
        <Flex alignItems="center" gap={8}>
          <ProgressCircle size="small" />
          <Text>Loading users…</Text>
        </Flex>
      )}
      {error && (
        <MessageContainer variant="warning">
          <MessageContainer.Title>User list unavailable</MessageContainer.Title>
          <MessageContainer.Description>
            {error.message} You can still type a full email address and press
            Enter.
          </MessageContainer.Description>
        </MessageContainer>
      )}
      {!picked && matches.length > 0 && (
        <div
          role="listbox"
          style={{
            border: `${Borders.Width.Default} solid ${Colors.Border.Neutral.Default}`,
            borderRadius: Borders.Radius.Container.Default,
            overflow: "hidden",
          }}
        >
          {matches.map((u, i) => (
            <button
              key={u.uid}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => choose(u.email, u.email)}
              style={{
                ...stripe(i),
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                border: "none",
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
              }}
            >
              <span>
                <strong>
                  {u.name} {u.surname}
                </strong>
                <br />
                <span style={{ opacity: 0.7 }}>{u.email}</span>
              </span>
              {u.status && u.status !== "ACTIVE" && (
                <Chip size="condensed" color="warning">
                  {u.status}
                </Chip>
              )}
            </button>
          ))}
        </div>
      )}
      {!picked && users && query.trim().length >= 2 && matches.length === 0 && (
        <Text style={{ opacity: 0.7 }}>
          No matching users.
          {typedEmail ? " Press Enter to look up this email anyway." : ""}
        </Text>
      )}
    </Flex>
  );
};
