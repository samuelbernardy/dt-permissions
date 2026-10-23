import type { CSSProperties } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";

// Design tokens are CSS variables, so these follow light/dark themes.
const radius = Borders.Radius.Container.Default;
const line = `${Borders.Width.Default} solid ${Colors.Border.Neutral.Default}`;

/** User header: primary tint with an accent bar on the left. */
export const userCard: CSSProperties = {
  background: Colors.Background.Container.Primary.Default,
  border: line,
  borderLeft: `6px solid ${Colors.Background.Container.Primary.Accent}`,
  borderRadius: radius,
  padding: 16,
};

/** Conditional-access tile: warning tint. */
export const conditionalCard: CSSProperties = {
  background: Colors.Background.Container.Warning.Default,
  border: `${Borders.Width.Default} solid ${Colors.Background.Container.Warning.Accent}`,
  borderRadius: radius,
  padding: 16,
};

/** One group: bordered, rounded, header band, striped body. */
export const groupSection: CSSProperties = {
  border: line,
  borderRadius: radius,
  overflow: "hidden",
  marginBottom: 12,
  background: Colors.Background.Surface.Default,
};

export const groupHeader: CSSProperties = {
  background: Colors.Background.Container.Primary.Emphasized,
  borderBottom: line,
  padding: "10px 16px",
  width: "100%",
};

export const groupBody: CSSProperties = { padding: 0 };

/** Alternating row backgrounds for permission lists. */
export function stripe(index: number): CSSProperties {
  return {
    background:
      index % 2 === 0
        ? Colors.Background.Container.Neutral.Subdued
        : Colors.Background.Container.Neutral.Default,
    padding: "6px 16px",
  };
}

export const sectionTitle: CSSProperties = {
  borderBottom: `${Borders.Width.Emphasized} solid ${Colors.Background.Container.Primary.Accent}`,
  paddingBottom: 4,
};
