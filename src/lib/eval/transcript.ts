export type TranscriptMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: Date;
	personaId?: string | null;
};

export type TranscriptArtifact = {
	messageId: string;
	type: string;
	payload: Record<string, unknown>;
};

export type TranscriptInput = {
	status: "active" | "handed_off" | "closed";
	channel: "web" | "whatsapp";
	currentPersona?: string | null;
	currentCategory?: string | null;
	messages: TranscriptMessage[];
	artifacts: TranscriptArtifact[];
};

const MAX_TURNS_BEFORE_WINDOW = 40;
const HEAD_WINDOW = 5;
const TAIL_WINDOW = 35;
const MAX_ARTIFACT_PAYLOAD_BYTES = 1024;

export function buildTranscript(input: TranscriptInput): string {
	const conversational = input.messages.filter((m) => m.role !== "system");
	const totalTurns = conversational.length;

	const artifactsByMessageId = groupArtifactsByMessage(input.artifacts);

	const sections: string[] = [];
	sections.push(buildHeader(input, totalTurns));

	let lastAssistantPersona: string | null = null;
	const emit = (turn: number, msg: TranscriptMessage): void => {
		if (msg.role === "assistant" && msg.personaId) {
			if (lastAssistantPersona && lastAssistantPersona !== msg.personaId) {
				sections.push(
					`[--- Transição: persona muda de ${lastAssistantPersona} para ${msg.personaId} a partir do Turn ${turn} ---]`,
				);
			}
			lastAssistantPersona = msg.personaId;
		}
		sections.push(formatTurn(turn, msg, artifactsByMessageId.get(msg.id)));
	};

	if (totalTurns <= MAX_TURNS_BEFORE_WINDOW) {
		for (const [index, msg] of conversational.entries()) emit(index + 1, msg);
	} else {
		const headSlice = conversational.slice(0, HEAD_WINDOW);
		const tailStart = totalTurns - TAIL_WINDOW;
		const tailSlice = conversational.slice(tailStart);

		for (const [index, msg] of headSlice.entries()) emit(index + 1, msg);
		const omitted = totalTurns - HEAD_WINDOW - TAIL_WINDOW;
		sections.push(`[--- ${omitted} turnos omitidos pra caber na janela do juiz ---]`);
		// Janela quebra a continuidade — força reset pra que a próxima persona seja anunciada.
		lastAssistantPersona = null;
		for (const [i, msg] of tailSlice.entries()) emit(tailStart + i + 1, msg);
	}

	if (input.status === "handed_off" || input.status === "closed") {
		sections.push(
			`[--- ATENÇÃO: status final desta conversa é "${input.status}". Os últimos turnos podem ` +
				`ser de atendente humano, não do agente IA. Avalie apenas as decisões do agente. ---]`,
		);
	}

	return sections.join("\n\n");
}

function buildHeader(input: TranscriptInput, totalTurns: number): string {
	const lines = [
		"=== CONVERSA ===",
		`Canal: ${input.channel}`,
		`Persona ativa: ${input.currentPersona ?? "(não definida)"}`,
		`Categoria: ${input.currentCategory ?? "(não definida)"}`,
		`Status: ${input.status}`,
		`Total de turnos: ${totalTurns}`,
	];
	return lines.join("\n");
}

function groupArtifactsByMessage(
	artifacts: TranscriptArtifact[],
): Map<string, TranscriptArtifact[]> {
	const map = new Map<string, TranscriptArtifact[]>();
	for (const a of artifacts) {
		const list = map.get(a.messageId);
		if (list) list.push(a);
		else map.set(a.messageId, [a]);
	}
	return map;
}

function formatTurn(
	turn: number,
	msg: TranscriptMessage,
	artifacts: TranscriptArtifact[] | undefined,
): string {
	const ts = formatTimestamp(msg.createdAt);
	const role = msg.role.toUpperCase();
	const blocks = [`[Turn ${turn} · ${role} · ${ts}]`, msg.content.trim() || "(mensagem vazia)"];

	if (artifacts && artifacts.length > 0) {
		for (const a of artifacts) {
			blocks.push("");
			blocks.push(`[Turn ${turn} · ARTIFACT · ${a.type}]`);
			blocks.push(formatPayload(a.payload));
		}
	}

	return blocks.join("\n");
}

function formatTimestamp(d: Date): string {
	return d.toISOString().replace("T", " ").slice(0, 19);
}

function formatPayload(payload: Record<string, unknown>): string {
	const json = JSON.stringify(payload, null, 2);
	if (json.length <= MAX_ARTIFACT_PAYLOAD_BYTES) return json;
	return `${json.slice(0, MAX_ARTIFACT_PAYLOAD_BYTES)}\n... (truncado em ${MAX_ARTIFACT_PAYLOAD_BYTES} bytes)`;
}
