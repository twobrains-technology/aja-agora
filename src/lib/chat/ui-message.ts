import type { UIMessage } from "ai";
import type { ArtifactType } from "./types";

export type ArtifactPartData = {
	type: ArtifactType;
	payload: Record<string, unknown>;
};

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
			gate: "experience" | "consent" | "lance" | "timeframe";
			options: GatePartOption[];
	  }
	| {
			kind: "slider";
			gate: "credit";
			category?: "imovel" | "auto" | "servicos";
			fields: SliderField[];
	  };

export type TransitionPartData = {
	toPersona: string;
	toPersonaName: string;
	toCategory: "imovel" | "auto" | "servicos";
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
