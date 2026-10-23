import React, { useMemo } from "react";
import { Accordion } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { SimpleTable } from "@dynatrace/strato-components/tables";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import type { AccessItem } from "../lib/derive";
import { analyse, conditionText } from "../lib/schemaAccess";

const flatColumns = [
  { id: "schema", header: "Schema", accessor: "schema" },
  { id: "access", header: "Access", accessor: "access" },
  { id: "effect", header: "Effect", accessor: "effect" },
];
const conditionColumns = [
  { id: "name", header: "Condition", accessor: "name" },
  { id: "operator", header: "Operator", accessor: "operator" },
  { id: "values", header: "Value(s)", accessor: "values" },
];
const otherColumns = [
  { id: "permission", header: "Permission", accessor: "permission" },
  { id: "effect", header: "Effect", accessor: "effect" },
  { id: "conditions", header: "Conditions", accessor: "conditions" },
];

/** What a policy or role grants: settings by schema, then everything else. */
export const PolicyDetails = ({ item }: { item: AccessItem }) => {
  const { schemas, other } = useMemo(
    () => analyse(item.statements),
    [item.statements],
  );
  const plain = schemas
    .filter((r) => r.extra.length === 0)
    .map((r) => ({
      schema: r.schema,
      access: r.access.join(", "),
      effect: r.effect,
    }));
  const withConditions = schemas.filter((r) => r.extra.length > 0);

  return (
    <Flex flexDirection="column" gap={16}>
      {item.boundaries.length > 0 && (
        <Text>
          Boundaries applied: {item.boundaries.length} (limit where this policy
          applies).
        </Text>
      )}

      {schemas.length > 0 && (
        <Flex flexDirection="column" gap={8}>
          <Heading level={6}>Settings schema access ({schemas.length})</Heading>
          {plain.length > 0 && (
            <SimpleTable data={plain} columns={flatColumns} />
          )}
          {withConditions.length > 0 && (
            <Accordion multiple>
              {withConditions.map((r, i) => (
                <Accordion.Section id={`${r.schema}-${i}`} key={`${r.schema}-${i}`}>
                  <Accordion.SectionLabel>
                    {r.schema} · {r.access.join(", ")} · {r.effect} (with
                    conditions)
                  </Accordion.SectionLabel>
                  <Accordion.SectionContent>
                    <SimpleTable
                      data={r.extra.map((c) => ({
                        name: c.name,
                        operator: c.operator,
                        values: c.values.join(", "),
                      }))}
                      columns={conditionColumns}
                    />
                  </Accordion.SectionContent>
                </Accordion.Section>
              ))}
            </Accordion>
          )}
        </Flex>
      )}

      {other.length > 0 && (
        <Flex flexDirection="column" gap={8}>
          <Heading level={6}>Other permissions ({other.length})</Heading>
          <SimpleTable
            data={other.map((o) => ({
              permission: o.permission,
              effect: o.effect,
              conditions: o.conditions.map(conditionText).join("; ") || "—",
            }))}
            columns={otherColumns}
          />
        </Flex>
      )}

      {schemas.length === 0 && other.length === 0 && (
        <Text>No statements were returned for this policy.</Text>
      )}
    </Flex>
  );
};
