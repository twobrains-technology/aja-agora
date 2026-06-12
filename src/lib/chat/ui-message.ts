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

/** FIX-3 — gate credit como componente "Planeje sua conquista" (4 indicadores
 * interligados em estimativa de mercado; ver plan-estimate-picker.tsx). */
export type PlanGatePartData = {
	kind: "plan";
	gate: "credit";
	category: "imovel" | "auto" | "moto" | "servicos";
	credit: SliderField;
	monthly: SliderField;
	/** Mês-alvo inicial da contemplação (default 6 — espelho do dial). */
	targetMonthDefault: number;
};

/** FIX-17 — gate do nome ("Como posso te chamar?", passo 1 da jornada) em CARD
 * com input focado. Substitui a coleta texto-livre (única do funil); o autofocus
 * abre o teclado no lugar certo no mobile. Coexiste com o texto livre do chat —
 * os dois caminhos convergem na persistência do nome. WhatsApp degrada pra texto
 * (sem card). */
export type NameGatePartData = {
	kind: "name";
	gate: "name";
};

export type GatePartData =
	| PlanGatePartData
	| NameGatePartData
	| {
			kind: "chips";
			gate:
				| "experience"
				| "consent"
				| "lance"
				| "lance-value"
				| "lance-embutido"
				| "timeframe"
				| "simulator-offer";
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
