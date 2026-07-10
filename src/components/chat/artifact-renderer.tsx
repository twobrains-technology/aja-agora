import type { Artifact } from "@/lib/chat/types";
import { ComparisonTable } from "./artifacts/comparison-table";
import { ContemplationDial } from "./artifacts/contemplation-dial";
import { ContractForm } from "./artifacts/contract-form";
import { DecisionPrompt } from "./artifacts/decision-prompt";
import { DocumentUpload } from "./artifacts/document-upload";
import { EmbeddedBid } from "./artifacts/embedded-bid";
import { FinancingComparison } from "./artifacts/financing-comparison";
import { GroupCard } from "./artifacts/group-card";
import { LeadForm } from "./artifacts/lead-form";
import { RealOffer } from "./artifacts/real-offer";
import { RecommendationCard } from "./artifacts/recommendation-card";
import { Scenarios } from "./artifacts/scenarios";
import { SignatureHandoff } from "./artifacts/signature-handoff";
import { SimulationResult } from "./artifacts/simulation-result";
import { TopicPicker } from "./artifacts/topic-picker";
import { ValuePicker } from "./artifacts/value-picker";
import { WhatsappOptin } from "./artifacts/whatsapp-optin";

export function ArtifactRenderer({
	artifact,
	active = true,
}: {
	artifact: Artifact;
	active?: boolean;
}) {
	const inner = renderArtifact(artifact);
	// FIX-49: só o turno ATIVO é interativo. Card do histórico (mensagem antiga ou
	// hidratada da retomada) fica selado: pointer-events-none + aria-disabled +
	// inert (read-only de verdade) e levemente esmaecido. Preserva o histórico
	// visível, mas re-clicar não re-dispara a ação (vetor de duplicação, cruza
	// com FIX-48). quick_reply renderiza null → nada pra selar.
	if (active || inner === null) return inner;
	return (
		<div
			data-sealed="true"
			aria-disabled="true"
			// React 19: `inert` é boolean prop; string vazia vira `false` e o atributo
			// some (selo furado p/ teclado/SR). Tem que ser `inert={true}`.
			inert={true}
			className="pointer-events-none select-none opacity-60"
		>
			{inner}
		</div>
	);
}

function renderArtifact(artifact: Artifact) {
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
		case "topic_picker":
			return <TopicPicker payload={artifact.payload} />;
		case "scenarios":
			return <Scenarios payload={artifact.payload} />;
		case "financing_comparison":
			return <FinancingComparison payload={artifact.payload} />;
		case "whatsapp_optin":
			return <WhatsappOptin payload={artifact.payload} />;
		case "decision_prompt":
			return <DecisionPrompt payload={artifact.payload} />;
		case "contract_form":
			return <ContractForm payload={artifact.payload} />;
		case "real_offer":
			return <RealOffer payload={artifact.payload} />;
		case "signature_handoff":
			return <SignatureHandoff payload={artifact.payload} />;
		case "document_upload":
			return <DocumentUpload payload={artifact.payload} />;
		case "contemplation_dial":
			return <ContemplationDial payload={artifact.payload} />;
		case "embedded_bid":
			return <EmbeddedBid payload={artifact.payload} />;
		case "quick_reply":
			return null;
	}
}
