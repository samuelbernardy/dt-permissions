import React, { useMemo, useState } from "react";

import {
  Accordion,
  Chip,
  MessageContainer,
  ProgressCircle,
} from "@dynatrace/strato-components/content";
import { TextArea, TextInput } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { SimpleTable } from "@dynatrace/strato-components/tables";
import {
  Heading,
  Paragraph,
  Text,
} from "@dynatrace/strato-components/typography";
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import { GroupItems } from "../components/GroupCard";
import { download, toCsv } from "../lib/export";
import { deriveGroup } from "../lib/derive";
import type { GroupInfo } from "../lib/model";
import { groupHeader, groupSection, sectionTitle } from "../lib/theme";

type ListedGroup = Pick<
  GroupInfo,
  "uuid" | "name" | "owner" | "description" | "federatedAttributeValues"
>;

/** Loads one group's roles and policies when its section is opened. */
const GroupAccess = ({ uuid }: { uuid: string }) => {
  const { data, error, isLoading } = useAppFunction({
    name: "lookup-group",
    data: { uuid },
  });
  const result = data as { groups: GroupInfo[]; warnings: string[] } | undefined;
  if (isLoading) return <ProgressCircle />;
  if (error) return <Paragraph>Error: {error.message}</Paragraph>;
  const group = result?.groups[0];
  if (!group) return <Paragraph>No data returned.</Paragraph>;
  return (
    <Flex flexDirection="column" gap={8}>
      {result.warnings.length > 0 && (
        <MessageContainer variant="warning">
          <MessageContainer.Description>
            {result.warnings.join(" · ")}
          </MessageContainer.Description>
        </MessageContainer>
      )}
      <GroupItems view={deriveGroup(group)} />
    </Flex>
  );
};

const norm = (s: string) => s.trim().toLowerCase();

export const AdMapping = () => {
  const { data, error, isLoading } = useAppFunction({
    name: "list-groups",
    data: {},
  });
  const groups = (data as { groups: ListedGroup[] } | undefined)?.groups;
  const [filter, setFilter] = useState("");
  const [onlyMapped, setOnlyMapped] = useState(false);
  const [pasted, setPasted] = useState("");

  const visible = useMemo(() => {
    const q = norm(filter);
    return (groups ?? []).filter(
      (g) =>
        (!onlyMapped || g.federatedAttributeValues.length > 0) &&
        (!q ||
          norm(g.name).includes(q) ||
          g.federatedAttributeValues.some((c) => norm(c).includes(q))),
    );
  }, [groups, filter, onlyMapped]);

  // Pasted AD group names: match SAML claim values, or SCIM group names.
  const checked = useMemo(() => {
    const lines = [
      ...new Set(
        pasted
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    ];
    return lines.map((claim) => {
      const hits = (groups ?? []).filter(
        (g) =>
          g.federatedAttributeValues.some((c) => norm(c) === norm(claim)) ||
          (g.owner === "SCIM" && norm(g.name) === norm(claim)),
      );
      return {
        claim,
        status: hits.length > 0 ? "Mapped" : "Not mapped",
        groups: hits.map((h) => `${h.name} (${h.owner})`).join(", ") || "—",
      };
    });
  }, [pasted, groups]);

  return (
    <Flex flexDirection="column" padding={32} gap={16}>
      <Heading level={1}>AD group mapping</Heading>
      <Paragraph>
        How AD group claims (SAML attribute values) map to Dynatrace groups,
        and what each group grants.
      </Paragraph>

      {isLoading && <ProgressCircle />}
      {error && (
        <MessageContainer variant="critical">
          <MessageContainer.Title>Could not load groups</MessageContainer.Title>
          <MessageContainer.Description>
            {error.message}
          </MessageContainer.Description>
        </MessageContainer>
      )}

      {groups && (
        <>
          <div style={sectionTitle}>
            <Heading level={4}>Check AD group names</Heading>
          </div>
          <Text>
            Paste AD group names (one per line) to see which Dynatrace groups
            they map to.
          </Text>
          <TextArea
            value={pasted}
            onChange={(v) => setPasted(v ?? "")}
            placeholder={"DT-Monitoring-Admins\nDT-Deployment-Admins"}
          />
          {checked.length > 0 && (
            <SimpleTable
              data={checked}
              columns={[
                { id: "claim", header: "AD group", accessor: "claim" },
                { id: "status", header: "Status", accessor: "status" },
                { id: "groups", header: "Dynatrace group(s)", accessor: "groups" },
              ]}
            />
          )}

          <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
            <div style={sectionTitle}>
              <Heading level={4}>
                Groups ({visible.length} of {groups.length})
              </Heading>
            </div>
            <Flex gap={8} alignItems="center">
              <TextInput
                value={filter}
                onChange={(v) => setFilter(v ?? "")}
                placeholder="Filter by group or claim"
              />
              <Button
                onClick={() =>
                  download(
                    "ad-group-mapping.csv",
                    toCsv(
                      visible.map((g) => ({
                        group: g.name,
                        owner: g.owner,
                        samlClaims: g.federatedAttributeValues.join("; "),
                        description: g.description ?? "",
                      })),
                      ["group", "owner", "samlClaims", "description"],
                    ),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                Export CSV
              </Button>
              <Chip
                color={onlyMapped ? "primary" : "neutral"}
                onClick={() => setOnlyMapped((v) => !v)}
              >
                {onlyMapped ? "Showing mapped only" : "Mapped only"}
              </Chip>
            </Flex>
          </Flex>

          <Accordion multiple>
            {visible.map((g) => (
              <Accordion.Section id={g.uuid} key={g.uuid} style={groupSection}>
                <Accordion.SectionLabel style={groupHeader}>
                  <Flex alignItems="center" gap={8} flexWrap="wrap">
                    <Heading level={4}>{g.name}</Heading>
                    <Chip size="condensed">{g.owner}</Chip>
                    {g.federatedAttributeValues.length === 0 ? (
                      <Text style={{ opacity: 0.6 }}>no SAML claim</Text>
                    ) : (
                      g.federatedAttributeValues.map((c) => (
                        <Chip key={c} size="condensed" color="success">
                          SAML claim: {c}
                        </Chip>
                      ))
                    )}
                  </Flex>
                </Accordion.SectionLabel>
                <Accordion.SectionContent style={{ padding: 0 }}>
                  <GroupAccess uuid={g.uuid} />
                </Accordion.SectionContent>
              </Accordion.Section>
            ))}
          </Accordion>
        </>
      )}
    </Flex>
  );
};
