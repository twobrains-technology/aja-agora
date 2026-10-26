// CLIQUE → CARD NA TELA, num turno de verdade.
//
// Os testes de `directives.test.ts` fecham metade do caminho (clique → diretiva
// com a tool e o tipo certos) e o montador fecha a outra (diretiva → card
// emitível). Faltava o trecho do meio, que é justamente onde o funil morreu: o
// MODELO recebe a diretiva, chama `mostrar_card` e o card sai no stream. Sem
// provedor de verdade isso não se prova — então aqui o "modelo" é o servidor
// roteirizado (`testing/servidor-roteirizado.ts`) fazendo o que a diretiva
// manda.
//
// P139/P275 (ver cenários) e P143/P112/P161/P179/P181 (contratar): o card sai do
// turno com os números da CARTA REAL, não do que o modelo escreveu.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import {
	buildAdvanceToContractDirective,
	buildViewScenariosDirective,
} from "@/lib/agent/orchestrator/directives";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	for (const id of criadas.splice(0)) {
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function novaConversa(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

/** A carta que o cliente viu no card da busca — é dela que o turno tira os
 * números, e é o que `mostrar_card` recebe quando o clique chega. */
const CARTA: GroupSummary = {
	id: "grp-canopus-1",
	administradora: "Canopus",
	category: "auto",
	creditValue: 80_000,
	monthlyPayment: 700,
	adminFeePercent: 18,
	termMonths: 120,
	totalParticipants: 900,
	availableSlots: 5,
};

/** O artifact que ficou gravado na conversa quando a busca mostrou as cartas. */
const ARTEFATO_DA_BUSCA = {
	type: "comparison_table",
	payload: {
		groups: [
			{
				id: CARTA.id,
				administradora: CARTA.administradora,
				category: CARTA.category,
				creditValue: CARTA.creditValue,
				monthlyPayment: CARTA.monthlyPayment,
				termMonths: CARTA.termMonths,
				contempladosMes: CARTA.availableSlots,
			},
		],
	},
};

/** O turno de DIRECTIVE, como o handler o dispara: a instrução é o que vai no
 * lugar da fala do cliente, e quem não é usuário não gasta turno. */
async function rodarDiretiva(args: {
	conversationId: string;
	diretiva: string;
	beats: Parameters<typeof subirServidorRoteirizado>[0];
}): Promise<TurnEvent[]> {
	const servidor = await subirServidorRoteirizado(args.beats);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
		lerCartas: async () => [ARTEFATO_DA_BUSCA],
	});
	const eventos: TurnEvent[] = [];
	try {
		for await (const ev of run({
			channel: "web",
			conversationId: args.conversationId,
			userText: args.diretiva,
			isUserTurn: false,
			contactName: null,
		}))
			eventos.push(ev);
	} finally {
		await servidor.fechar();
	}
	return eventos;
}

function cardDoTurno(eventos: TurnEvent[], tipo: string) {
	return eventos.find(
		(e): e is Extract<TurnEvent, { type: "artifact" }> =>
			e.type === "artifact" && e.artifactType === tipo,
	);
}

describe("P139/P275 — 'Ver cenários' chega ao card `scenarios`", () => {
	it("o clique vira diretiva, o modelo mostra o card e ele sai no stream", async () => {
		const conversationId = await novaConversa();
		const diretiva = buildViewScenariosDirective({
			administradora: CARTA.administradora,
			groupId: CARTA.id,
		});
		// A diretiva dá ao modelo o id da carta — sem ele o card não teria de onde
		// tirar número (o modelo não inventa oferta).
		expect(diretiva).toContain(CARTA.id);

		const eventos = await rodarDiretiva({
			conversationId,
			diretiva,
			beats: [
				{
					toolCalls: [
						{ name: "mostrar_card", args: { tipo: "scenarios", payload: { groupId: CARTA.id } } },
					],
				},
				{ text: "São três caminhos: conservador, provável e acelerado." },
			],
		});

		const card = cardDoTurno(eventos, "scenarios");
		expect(card).toBeDefined();
		const payload = card?.payload as {
			groupId?: string;
			administradora?: string;
			creditValue?: number;
			scenarios?: Record<string, { lancePercent: number; expectedTermMonths: number }>;
		};
		// Os números são os da CARTA, não os do modelo.
		expect(payload.groupId).toBe(CARTA.id);
		expect(payload.administradora).toBe(CARTA.administradora);
		expect(payload.creditValue).toBe(CARTA.creditValue);
		expect(Object.keys(payload.scenarios ?? {})).toEqual(["conservador", "provavel", "acelerado"]);
	});
});

describe("P143 — 'contratar' chega ao card `contract_form`", () => {
	it("o clique vira diretiva, o modelo mostra o formulário e ele sai no stream", async () => {
		const conversationId = await novaConversa();
		const diretiva = buildAdvanceToContractDirective({
			administradora: CARTA.administradora,
			groupId: CARTA.id,
		});
		expect(diretiva).toContain(CARTA.id);

		const eventos = await rodarDiretiva({
			conversationId,
			diretiva,
			beats: [
				{
					toolCalls: [
						{
							name: "mostrar_card",
							args: { tipo: "contract_form", payload: { groupId: CARTA.id } },
						},
					],
				},
				{ text: "Preenche aqui que eu já gero sua proposta." },
			],
		});

		const card = cardDoTurno(eventos, "contract_form");
		expect(card).toBeDefined();
		const payload = card?.payload as { conversationId?: string; administradora?: string };
		// O `groupId` da diretiva é o que faz o formulário sair com a
		// administradora certa; a marca de despacho é o que autoriza a proposta.
		expect(payload.conversationId).toBe(conversationId);
		expect(payload.administradora).toBe(CARTA.administradora);
		expect(eventos.some((e) => e.type === "tool-call" && e.toolName === "mostrar_card")).toBe(true);
	});
});
