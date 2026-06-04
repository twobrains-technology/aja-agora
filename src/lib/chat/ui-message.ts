import type { UIMessage } from "ai";
import type { ArtifactByType } from "./types";

export type ArtifactPartData = ArtifactByType;

export type GatePartOption = {
	value: string;
	label: string;
	desc?: string;
};

export type SliderField = {
	id: string;
	label: string;
	min: number;
	max: number;
	step: number;
	default: number;
	format: "currency" | "months";
};

export type GatePartData =
	| {
			kind: "chips";
			gate: "experience" | "consent" | "lance" | "lance-value" | "lance-embutido" | "timeframe";
			options: GatePartOption[];
	  }
	| {
			kind: "slider";
			gate: "credit";
			category?: "imovel" | "auto" | "moto" | "servicos";
			fields: SliderField[];
	  }
	| {
			// Gate "identify" (D1, docs/jornada/CONTEXT.md) — form CPF + celular +
			// aceite LGPD ao fim do passo 2. A Bevi exige identidade antes de simular.
			kind: "identity";
			gate: "identify";
			prefilledPhone?: string | null;
	  };

export type TransitionPartData = {
	toPersona: string;
	toPersonaName: string;
	toCategory: "imovel" | "auto" | "moto" | "servicos";
	bridgeText: string;
};

export type WelcomePartData = {
	options: GatePartOption[];
};

export type HandoffPartData = {
	reason: string;
};

export type ToolStatusPartData = {
	tool: string;
};

export type AjaDataParts = {
	artifact: ArtifactPartData;
	gate: GatePartData;
	transition: TransitionPartData;
	welcome: WelcomePartData;
	handoff: HandoffPartData;
	tool: ToolStatusPartData;
};

export type AjaUIMessage = UIMessage<unknown, AjaDataParts>;
