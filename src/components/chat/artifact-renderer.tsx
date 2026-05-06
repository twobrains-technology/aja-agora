import type { Artifact } from "@/lib/chat/types";
import { ComparisonTable } from "./artifacts/comparison-table";
import { GroupCard } from "./artifacts/group-card";
import { LeadForm } from "./artifacts/lead-form";
import { RecommendationCard } from "./artifacts/recommendation-card";
import { SimulationResult } from "./artifacts/simulation-result";
import { ValuePicker } from "./artifacts/value-picker";

export function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
	switch (artifact.type) {
		case "group_card":
			return <GroupCard payload={artifact.payload} />;
		case "comparison_table":
			return <ComparisonTable payload={artifact.payload} />;
		case "simulation_result":
			return <SimulationResult payload={artifact.payload} />;
		case "recommendation_card":
			return <RecommendationCard payload={artifact.payload} />;
		case "lead_form":
			return <LeadForm payload={artifact.payload} />;
		case "value_picker":
			return <ValuePicker payload={artifact.payload} />;
		case "quick_reply":
			return null;
	}
}
