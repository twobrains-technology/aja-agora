import type { Artifact } from "@/lib/chat/types";
import { GroupCard } from "./artifacts/group-card";
import { ComparisonTable } from "./artifacts/comparison-table";
import { SimulationResult } from "./artifacts/simulation-result";
import { RecommendationCard } from "./artifacts/recommendation-card";
import { LeadForm } from "./artifacts/lead-form";
import { ValuePicker } from "./artifacts/value-picker";
import type { ComponentType } from "react";

const ARTIFACT_COMPONENTS: Record<
  string,
  ComponentType<{ payload: unknown }>
> = {
  group_card: GroupCard as ComponentType<{ payload: unknown }>,
  comparison_table: ComparisonTable as ComponentType<{ payload: unknown }>,
  simulation_result: SimulationResult as ComponentType<{ payload: unknown }>,
  recommendation_card: RecommendationCard as ComponentType<{ payload: unknown }>,
  lead_form: LeadForm as ComponentType<{ payload: unknown }>,
  value_picker: ValuePicker as ComponentType<{ payload: unknown }>,
};

export function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  const Component = ARTIFACT_COMPONENTS[artifact.type];
  if (!Component) {
    console.warn(`Unknown artifact type: ${artifact.type}`);
    return null;
  }
  return <Component payload={artifact.payload} />;
}
