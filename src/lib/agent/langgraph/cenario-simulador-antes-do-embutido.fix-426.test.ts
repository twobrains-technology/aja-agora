// FIX-426 — o simulador de contemplação passando na frente da educação do lance
// embutido.
//
// Reportado por Kairo (WhatsApp, 2026-07-30): "não faz sentido o simulador antes
// de mostrar a nova carta com lance embutido".
//
// O funil já prevê a ordem certa — `nextGate` manda `lance-embutido` ANTES de
// `simulator-offer` (qualify-state.ts) — mas a tool-policy libera
// `present_contemplation_dial` em todo o pós-reveal, e o modelo chamava quando
// queria. Resultado na tela: o cliente recebia "o lance fica em torno de 30%
// (R$ 60.000), você recebe R$ 140.000" sem nunca ter lido o que é lance
// embutido nem de onde sai esse dinheiro.
//
// É a MESMA família do FIX-425 (ninguém decide o embutido no escuro), agora pelo
// lado do simulador: número de lance é a coisa sobre a qual a pessoa decide —
// não pode chegar antes da explicação.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Pós-reveal, cliente quer antecipar e já disse o valor do lance — o gate
 * estrutural ativo é `lance-embutido` (nextGate), e a educação ainda não saiu. */
const ANTES_DA_EDUCACAO_DO_EMBUTIDO = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	qualifyAnswers: {
		creditMax: 200_000,
		desiredItem: "carro",
		hasLance: "yes" as const,
		lanceValue: 60_000,
		prazoMeses: 24,
	},
	recommendedAdministradora: "ANCORA",
	recommendedOffer: {
		administradora: "ANCORA",
		category: "auto" as const,
		creditValue: 200_000,
		termMonths: 116,
		monthlyPayment: 2_405,
		groupId: "g-ancora",
	},
};

const BEAT_COM_SIMULADOR = [
	{
		text: "Vou te mostrar em quanto tempo dá pra ser contemplado.",
		toolCalls: [
			{
				name: "present_contemplation_dial",
				args: {
					administradora: "ANCORA",
					category: "auto",
					creditValue: 200_000,
					termMonths: 116,
					monthlyPayment: 2_405,
					initialTargetMonth: 6,
				},
			},
		],
	},
];

describeIfDb("FIX-426 — o simulador não passa na frente da educação do embutido", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("cliente ainda não viu o que é lance embutido → o simulador espera", async () => {
		const r = await runScenario({
			channel: "whatsapp",
			metaInicial: ANTES_DA_EDUCACAO_DO_EMBUTIDO,
			turns: [{ user: "em quanto tempo eu sou contemplado?", beats: BEAT_COM_SIMULADOR }],
		});
		criadas.push(r.conversationId);

		expect(
			r.turns[0].artifacts,
			`número de lance antes da explicação — trilha: ${r.turns[0].trilha.join(" → ")}`,
		).not.toContain("contemplation_dial");
	});

	it("educação já entregue → o simulador roda normalmente", async () => {
		// A metade que impede isto de virar "o simulador nunca mais aparece".
		const r = await runScenario({
			channel: "whatsapp",
			metaInicial: {
				...ANTES_DA_EDUCACAO_DO_EMBUTIDO,
				qualifyAnswers: {
					...ANTES_DA_EDUCACAO_DO_EMBUTIDO.qualifyAnswers,
					embeddedBidDispatched: true,
					lanceEmbutido: false,
				},
			},
			turns: [{ user: "em quanto tempo eu sou contemplado?", beats: BEAT_COM_SIMULADOR }],
		});
		criadas.push(r.conversationId);

		expect(
			r.turns[0].artifacts,
			`o simulador foi engolido indevidamente — trilha: ${r.turns[0].trilha.join(" → ")}`,
		).toContain("contemplation_dial");
	});
});
