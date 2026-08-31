/**
 * O ÚLTIMO METRO: o cliente escolhe a cota e o formulário não aparece.
 *
 * Medido no app, jornada completa da vitrine, com o banco como testemunha:
 *
 *   👤 "gostei da do Itaú. sou a Mirella, como faço pra seguir?"
 *   🤖 "Perfeito, Mirella! … Agora o sistema abre o formulário de contratação
 *       com a Itaú, é só preencher os dados e a gente fecha seu consórcio."
 *   tela: NENHUM card.  metadata: pendingGate = "identify"
 *
 * O agente prometeu o formulário e a tela não cumpriu. A venda para no metro
 * final, com o cliente já decidido — e só volta se ELE escrever de novo.
 *
 * A causa é a ordem dos nós, e ela é consequência direta desta entrega. A rota
 * decide o gate ANTES do `converse`; a escolha da cota é gravada DENTRO do
 * `converse` (tool `escolher_cota`). Sondado com o metadata literal da conversa
 * `213b426b`:
 *
 *   nextGate(meta com a escolha)  → "identify"
 *   nextGate(meta sem a escolha)  → "experience"
 *
 * Ou seja: o gate `identify` NASCE no meio do turno, depois de a rota já ter
 * decidido que não havia gate a mostrar. Enquanto `identify` morava antes da
 * busca isso não existia — ele nunca dependia de uma tool do próprio turno.
 *
 * A correção é estreita de propósito: só vale para os GATES DE AÇÃO (`decision`,
 * `contract`, `identify`), que o `emitCard` já declara serem "o próximo passo do
 * que acabou de ser mostrado", e só quando o funil realmente avançou dentro do
 * turno. Gate opcional que nasce no meio do caminho continua esperando o turno
 * seguinte — quem cede a vez continua cedendo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { type AgentGraphStateType, funnelFromMeta } from "../state";

// Mock PARCIAL: `nextGate` (importado por este nó desde o conserto) usa
// `isValidCpf` do mesmo módulo. Mock total apagaria o resto e o teste falharia
// por infraestrutura, não por comportamento.
vi.mock("@/lib/conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/identity")>()),
	loadIdentity: async () => null,
}));

const { emitCardNode } = await import("./emit-card");

// A VITRINE PRECISA ESTAR LIGADA AQUI — ela é quem muda a ordem do funil.
//
// A suíte nasce com `VITRINE_*` vazias (vitest.setup.ts), e sem elas `nextGate`
// devolve `identify` mesmo ANTES da escolha da cota: o caso de controle deixa de
// controlar coisa nenhuma e o teste fica verde por acidente. Foi o que aconteceu
// na primeira tentativa deste arquivo.
const ENV_ORIGINAL = { ...process.env };
beforeEach(() => {
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});
afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

/**
 * O ESTADO LITERAL da conversa `213b426b`, colhido do banco depois do turno em
 * que a venda parou — sem o cookie e sem os campos de pendência, que são efeito
 * e não causa. Fixture inventado não serve aqui: foi justamente um fixture
 * "parecido" que me fez concluir errado na primeira tentativa (nele o gate já
 * era `identify` mesmo sem a escolha, e o teste não provava nada).
 */
const META_DA_CONVERSA = {
	escolha: {
		origem: "mencao",
		groupId: "6a7b59c325935b16a731689f",
		termMonths: 48,
		creditValue: 81973,
		administradora: "ITAÚ",
		monthlyPayment: 1992.78,
	},
	desireAsked: false,
	contractOffer: {
		groupId: "6a7b59c325935b16a731689f",
		termMonths: 48,
		creditValue: 81973,
		administradora: "ITAÚ",
		monthlyPayment: 1992.78,
	},
	currentPersona: "auto",
	qualifyAnswers: {
		objetivo: "contemplacao_rapida",
		creditMax: 80000,
		creditMin: 72000,
		motivation: "tenho pressa",
		prazoMeses: 0,
		alvoDeBusca: "valor",
		desiredItem: "um carro",
		creditMentionedAtDesire: 80000,
	},
	currentCategory: "auto",
	maxStageReached: "em_negociacao",
	revealCompleted: true,
	recommendedOffer: {
		groupId: "6a7b59c325935b16a731689f",
		category: "auto",
		termMonths: 48,
		avgBidValue: 56717.12,
		creditValue: 81973,
		administradora: "ITAÚ",
		availableSlots: 7,
		monthlyPayment: 1992.78,
	},
	searchDispatched: true,
	identityCollected: false,
	decisionDispatched: false,
	discoveryEmptyStreak: 0,
	recommendedOfferStale: false,
	discoveredCreditTarget: 80000,
	pendingRecommendationCard: {
		id: "6a7b59c325935b16a731689f",
		score: 0.6901,
		groupId: "6a7b59c325935b16a731689f",
		quotaId: "6a7b59c325935b16a731689f",
		category: "auto",
		termMonths: 48,
		avgBidValue: 56717.12,
		creditValue: 81973,
		administradora: "ITAÚ",
		availableSlots: 7,
		monthlyPayment: 1992.78,
		rawCreditValue: 80000,
		scoreBreakdown: {
			adminFee: 0.7116666666666667,
			bidReach: 0.5,
			termMatch: 0.5,
			monthlyFit: 0,
			contemplation: 0.875,
			creditProximity: 0.9753375,
		},
		adminFeePercent: 13.73,
		contempladosMes: 7,
		recommendationStage: "neutral",
	},
	recommendedAdministradora: "ITAÚ",
} as unknown as ConversationMetadata;

/** O fecho da jornada nova: reveal feito, identidade ainda não coletada. */
function noFecho(over: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
	return {
		conversationId: "conv-fecho",
		channel: "web",
		contactName: "Mirella",
		isUserTurn: true,
		userText: "gostei da do Itaú, como faço pra seguir?",
		intent: "ready_to_proceed",
		baseMeta: META_DA_CONVERSA,
		// A rota não mostrou gate nenhum: quando ela rodou, o gate era `experience`
		// (é o que o log `[route] gate=experience show=false` registrou ao vivo).
		gate: undefined,
		answeredGate: "experience",
		events: [],
		messages: [],
		modelAskedQuestion: true,
		modelAskedForName: false,
		apresentaOfertaNesteTurno: false,
		ancoraFalhou: false,
		streamedArtifactIds: [],
		funnel: funnelFromMeta(META_DA_CONVERSA),
		...over,
	} as unknown as AgentGraphStateType;
}

describe("emitCard — o gate de ação que nasce no meio do turno", () => {
	it("escolheu a cota → o gate `identify` sai NESTE turno", async () => {
		const out = await emitCardNode(noFecho());
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(1);
		expect(gates[0]).toMatchObject({ gate: "identify" });
	});

	it("sem a escolha, nada muda — o gate opcional continua esperando o turno seguinte", async () => {
		// A metade que impede isto de virar "emite gate sempre". Sem `escolha`, o
		// funil ainda está em `experience`, que é opcional e cede a vez.
		const semEscolha = noFecho();
		const funnel = { ...semEscolha.funnel } as Record<string, unknown>;
		delete funnel.escolha;
		delete funnel.contractOffer;
		const baseMeta = { ...META_DA_CONVERSA } as Record<string, unknown>;
		delete baseMeta.escolha;
		delete baseMeta.contractOffer;
		const out = await emitCardNode({
			...semEscolha,
			baseMeta,
			funnel,
		} as unknown as AgentGraphStateType);
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(0);
	});

	it("turno do SERVIDOR não abre o formulário sozinho", async () => {
		// Mesma disciplina do `portao-nao-queima-sozinho`: quem decide o passo do
		// fecho é a fala do cliente, não uma directive.
		const out = await emitCardNode(noFecho({ isUserTurn: false }));
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(0);
	});

	it("a fala já pediu o CPF → o card NÃO repete a pergunta canônica", async () => {
		// O furo que a rodada 10 encontrou neste mesmo conserto. A guarda contra o
		// pedido em dobro (`modeloJaPediuIdentidade`) estava ancorada em
		// `state.gate === "identify"` — e neste caminho o gate nasce DEPOIS da
		// rota, então `state.gate` é `undefined` por construção. A guarda morria
		// exatamente no turno que este bloco criou, e a regressão medida em 14/08
		// ("4 de 4 turnos entregaram o pedido duas vezes") voltava no pior lugar
		// possível: o fecho.
		//
		// `modelAsked: false` no evento é o que faz o adapter injetar a canônica
		// "Pra seguir com essa cota, preciso do seu CPF e celular." colada na fala
		// que acabou de pedir a mesma coisa.
		const out = await emitCardNode(
			noFecho({
				// Pedir CPF sai como AFIRMAÇÃO, não pergunta — por isso
				// `modelAskedQuestion` é false aqui, e por isso a outra guarda existe.
				modelAskedQuestion: false,
				events: [
					{
						type: "text-delta",
						text: "Pronto, cota registrada! Pra seguir, preciso do seu CPF e celular.",
					},
				],
			} as unknown as Partial<AgentGraphStateType>),
		);
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(1);
		expect(gates[0]).toMatchObject({ gate: "identify", modelAsked: true });
	});

	it("a fala NÃO pediu o CPF → o card leva a pergunta (a rede não pode cair)", async () => {
		const out = await emitCardNode(
			noFecho({
				modelAskedQuestion: false,
				events: [{ type: "text-delta", text: "Pronto, cota registrada!" }],
			} as unknown as Partial<AgentGraphStateType>),
		);
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(1);
		expect(gates[0]).toMatchObject({ gate: "identify", modelAsked: false });
	});

	it("quando a rota JÁ mostrou o gate, não sai em dobro", async () => {
		const out = await emitCardNode(noFecho({ gate: "identify", answeredGate: "identify" }));
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(1);
	});
});
