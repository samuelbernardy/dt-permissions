import React, { useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Accordion, Chip } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { PolicyDetails } from "./ConditionTable";
import { groupBody, groupHeader, groupSection, stripe } from "../lib/theme";
import { levelLabel, type AccessItem, type GroupView } from "../lib/derive";

// One shared grid per group keeps rows aligned: expander | type | name | scopes.
// The scopes track fits the widest chip list (capped, then it wraps), so no
// space is reserved beyond what the content needs.
const TABLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px 76px minmax(0, 1fr) fit-content(45%)",
  columnGap: 8,
};

// Each row spans the grid and reuses its column tracks (subgrid).
const ROW: CSSProperties = {
  display: "grid",
  gridColumn: "1 / -1",
  gridTemplateColumns: "subgrid",
  alignItems: "center",
};

const itemKey = (i: AccessItem) => `${i.kind}:${i.id}`;

const ItemRow = ({
  item,
  index,
  expandable,
  open,
  onToggle,
}: {
  item: AccessItem;
  index: number;
  expandable: boolean;
  open: boolean;
  onToggle: () => void;
}) => (
  <div style={{ ...ROW, ...stripe(index), padding: "6px 8px 6px 16px" }}>
    {/* Expander slot is always reserved, even when there is nothing to expand. */}
    <div style={{ display: "flex", justifyContent: "center" }}>
      {expandable && (
        <Button
          size="condensed"
          aria-label={open ? `Collapse ${item.name}` : `Expand ${item.name}`}
          aria-expanded={open}
          onClick={onToggle}
        >
          <Button.Prefix>
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </Button.Prefix>
        </Button>
      )}
    </div>
    <Chip size="condensed" color={item.kind === "ROLE" ? "neutral" : "primary"}>
      {item.kind}
    </Chip>
    <Flex gap={8} alignItems="center" flexWrap="wrap">
      <Text>{item.name}</Text>
      {item.kind === "ROLE" && item.name !== item.id && (
        <Text style={{ opacity: 0.6 }}>({item.id})</Text>
      )}
      {item.statements.some((s) => s.effect === "DENY") && (
        <Chip size="condensed" color="critical">
          DENY
        </Chip>
      )}
      {item.conditional && (
        <Chip size="condensed" color="warning">
          WHERE
        </Chip>
      )}
    </Flex>
    <Flex gap={4} flexWrap="wrap">
      {item.levels.map((l) => (
        <Chip key={`${l.type}:${l.id}`} size="condensed" color="success">
          {levelLabel(l)}
        </Chip>
      ))}
    </Flex>
    {expandable && open && (
      // Spans every column, indented to line up under the type column.
      <div style={{ gridColumn: "1 / -1", padding: "8px 0 8px 40px" }}>
        <PolicyDetails item={item} />
      </div>
    )}
  </div>
);

/** Roles and policies of one group (alternating rows, policies expandable). */
export const GroupItems = ({ view }: { view: GroupView }) => {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (view.items.length === 0) {
    return (
      <div style={stripe(0)}>
        <Text>No roles or policies are assigned to this group.</Text>
      </div>
    );
  }
  return (
    <div style={{ ...TABLE, rowGap: 0 }}>
      {view.items.map((item, i) => (
        <ItemRow
          key={itemKey(item)}
          item={item}
          index={i}
          expandable={!(item.kind === "ROLE" && item.statements.length === 0)}
          open={open.has(itemKey(item))}
          onToggle={() => toggle(itemKey(item))}
        />
      ))}
    </div>
  );
};

export const GroupCard = ({ view }: { view: GroupView }) => {
  const roles = view.items.filter((i) => i.kind === "ROLE").length;
  const policies = view.items.length - roles;
  const claims = view.group.federatedAttributeValues;

  return (
    <Accordion.Section id={view.group.uuid} style={groupSection}>
      <Accordion.SectionLabel style={groupHeader}>
        <Flex alignItems="center" gap={8} flexWrap="wrap">
          <Heading level={4}>{view.group.name}</Heading>
          <Chip size="condensed">{view.group.owner}</Chip>
          {claims.map((c) => (
            <Chip key={c} size="condensed" color="success">
              SAML claim: {c}
            </Chip>
          ))}
          <Text>
            {roles} roles · {policies} policies
          </Text>
        </Flex>
      </Accordion.SectionLabel>
      <Accordion.SectionContent style={groupBody}>
        <GroupItems view={view} />
      </Accordion.SectionContent>
    </Accordion.Section>
  );
};
