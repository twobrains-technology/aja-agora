import type { UIMessage } from "ai";
import type { PlanIntent } from "@/lib/agent/qualify-config";
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

/** Gate credit = componente "Planeje sua conquista". Re-UX guiada por intenção
 * (handoff componentes-aja): valor do bem + segmented "o que mais importa" +
 * prazo (slider) + controles condicionais; a parcela é RESULTADO calmo, não
 * input. Aderente à jornada canônica (valor → tempo/prioridade → lance). */
export type PlanGatePartData = {
	kind: "plan";
	gate: "credit";
	category: "imovel" | "auto" | "moto" | "servicos";
	credit: SliderField;
	/** Prazo do plano em meses (slider "Em quantos meses quer pagar"). */
	term: SliderField;
	/** Intenção pré-selecionada no segmented control. */
	intentDefault: PlanIntent;
	/** Mês-alvo inicial da contemplação (default 6 — condicional na intenção
	 * "receber rápido"; espelho do dial). */
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

/** FIX-49 — metadados por mensagem. `resumed` marca o que veio da HIDRATAÇÃO da
 * retomada (não chegou ao vivo neste turno): a UI usa pra ancorar o scroll,
 * mostrar a âncora "Você voltou" e SELAR artifacts/gates do histórico (read-only,
 * só o turno ativo é clicável — fecha o vetor de duplicação do funil, FIX-48). */
export type AjaMessageMetadata = {
	resumed?: boolean;
};

export type AjaUIMessage = UIMessage<AjaMessageMetadata, AjaDataParts>;
