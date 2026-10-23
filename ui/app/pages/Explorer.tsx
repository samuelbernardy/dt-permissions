import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@dynatrace/strato-components/buttons";
import {
  Accordion,
  Chip,
  MessageContainer,
  ProgressCircle,
} from "@dynatrace/strato-components/content";
import { TextInput } from "@dynatrace/strato-components/forms";
import { SimpleTable } from "@dynatrace/strato-components/tables";
import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Text,
} from "@dynatrace/strato-components/typography";
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import { conditionalCard, sectionTitle, userCard } from "../lib/theme";
import { AssistChat } from "../components/AssistChat";
import { UserPicker } from "../components/UserPicker";
import { GroupCard } from "../components/GroupCard";
import { download, permissionsCsv, safeName } from "../lib/export";
import { deriveGroup, matches, summarise } from "../lib/derive";
import type { UserPermissions } from "../lib/model";

const Results = ({
  email,
  filter,
  onlyConditional,
  onToggleConditional,
  onResult,
}: {
  email: string;
  filter: string;
  onlyConditional: boolean;
  onToggleConditional: () => void;
  onResult: (r: UserPermissions | undefined) => void;
}) => {
  const { data, error, isLoading } = useAppFunction({
    name: "lookup-user",
    data: { email },
  });
  const result = data as UserPermissions | undefined;
  useEffect(() => onResult(result), [result, onResult]);
  // undefined = every group open (the default); otherwise the user's choice.
  const [expanded, setExpanded] = useState<(string | number)[]>();

  const views = useMemo(() => {
    if (!result) return [];
    const q = filter.trim().toLowerCase();
    return result.groups.map(deriveGroup).map((v) => ({
      ...v,
      items: v.items.filter(
        (i) => matches(i, q) && (!onlyConditional || i.conditional),
      ),
    }));
  }, [result, filter, onlyConditional]);

  const summary = useMemo(
    () => (result ? summarise(result.groups.map(deriveGroup)) : undefined),
    [result],
  );

  if (isLoading) return <ProgressCircle />;
  if (error) {
    return (
      <MessageContainer variant="critical">
        <MessageContainer.Title>Lookup failed</MessageContainer.Title>
        <MessageContainer.Description>
          {error.message}
        </MessageContainer.Description>
      </MessageContainer>
    );
  }
  if (!result || !summary) return null;

  return (
    <Flex flexDirection="column" gap={16}>
      <div style={userCard}>
        <Flex flexDirection="column" gap={4}>
          <Heading level={3}>
            {result.user.name} {result.user.surname}
          </Heading>
          <Text>{result.user.email}</Text>
          <Text>
            {summary.groups} groups · {summary.roles} roles ·{" "}
            {summary.policies} policies · status {result.user.status}
          </Text>
        </Flex>
      </div>

      <div style={conditionalCard}>
        <Flex justifyContent="space-between" alignItems="center">
          <Flex flexDirection="column">
            <Heading level={5}>Conditional access</Heading>
            <Text>
              {summary.conditional} role(s)/policy(ies) are limited by WHERE
              conditions, management zones or boundaries.
            </Text>
          </Flex>
          <Chip
            color={onlyConditional ? "primary" : "neutral"}
            onClick={onToggleConditional}
          >
            {onlyConditional ? "Showing conditional only" : "Show only these"}
          </Chip>
        </Flex>
      </div>

      {result.warnings.length > 0 && (
        <MessageContainer variant="warning">
          <MessageContainer.Title>Incomplete results</MessageContainer.Title>
          <MessageContainer.Description>
            {result.warnings.join(" · ")}
          </MessageContainer.Description>
        </MessageContainer>
      )}

      <Flex gap={8}>
        <Button
          onClick={() =>
            download(
              `permissions-${safeName(result.user.email)}.csv`,
              permissionsCsv(result),
              "text/csv;charset=utf-8",
            )
          }
        >
          Export CSV
        </Button>
        <Button
          onClick={() =>
            download(
              `permissions-${safeName(result.user.email)}.json`,
              JSON.stringify(
                {
                  user: result.user,
                  groups: result.groups,
                  levels: result.levels,
                  exportedAt: new Date().toISOString(),
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          Export JSON
        </Button>
      </Flex>

      <Flex justifyContent="space-between" alignItems="center">
        <div style={sectionTitle}>
          <Heading level={4}>Groups ({views.length})</Heading>
        </div>
        <Flex gap={8}>
        <Button onClick={() => setExpanded(views.map((v) => v.group.uuid))}>
          Expand all
        </Button>
        <Button onClick={() => setExpanded([])}>Collapse all</Button>
        </Flex>
      </Flex>
      <Accordion
        multiple
        expanded={expanded ?? views.map((v) => v.group.uuid)}
        onExpandChange={setExpanded}
      >
        {views.map((v) => (
          <GroupCard key={v.group.uuid} view={v} />
        ))}
      </Accordion>

      <Accordion>
        <Accordion.Section id="diagnostics">
          <Accordion.SectionLabel>
            Diagnostics ({result.diagnostics.length} lookups reported,{" "}
            {result.levels.length} levels checked)
          </Accordion.SectionLabel>
          <Accordion.SectionContent>
            <Flex flexDirection="column" gap={8}>
              <Text>
                Levels checked:{" "}
                {result.levels.map((l) => `${l.type}:${l.name}`).join(", ")}
              </Text>
              {result.diagnostics.length > 0 && (
                <SimpleTable
                  data={result.diagnostics}
                  columns={[
                    { id: "group", header: "Group", accessor: "group" },
                    { id: "level", header: "Level", accessor: "level" },
                    { id: "outcome", header: "Outcome", accessor: "outcome" },
                    { id: "detail", header: "Detail", accessor: "detail" },
                  ]}
                />
              )}
            </Flex>
          </Accordion.SectionContent>
        </Accordion.Section>
      </Accordion>
    </Flex>
  );
};

export const Explorer = () => {
  const [submitted, setSubmitted] = useState<{ email: string; n: number }>();
  const [filter, setFilter] = useState("");
  const [onlyConditional, setOnlyConditional] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [current, setCurrent] = useState<UserPermissions>();

  return (
    <Flex flexDirection="column" padding={32} gap={16}>
      <Heading level={1}>User Permission Explorer</Heading>
      <Paragraph>
        Explore detailed user permissions using the Account Management API.
      </Paragraph>
      <UserPicker
        onSelect={(email) =>
          setSubmitted({ email, n: (submitted?.n ?? 0) + 1 })
        }
      />
      <Flex gap={16} alignItems="flex-end" flexWrap="wrap">
        <TextInput
          value={filter}
          onChange={(v) => setFilter(v ?? "")}
          placeholder="Filter roles, policies, permissions, schemas"
        />
        <Button onClick={() => setAssistOpen(true)}>Ask Assist</Button>
      </Flex>
      {submitted && (
        <Results
          key={submitted.n}
          email={submitted.email}
          filter={filter}
          onlyConditional={onlyConditional}
          onToggleConditional={() => setOnlyConditional((v) => !v)}
          onResult={setCurrent}
        />
      )}
      <AssistChat
        key={current?.user.email ?? "none"}
        show={assistOpen}
        onDismiss={() => setAssistOpen(false)}
        result={current}
      />
    </Flex>
  );
};
