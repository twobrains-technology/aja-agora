// FIX-425 — o cliente pede pra ver outras opções e não vê nada.
//
// Visto ao vivo por Kairo em produção (ajaagora.com.br, 2026-08-02), numa
// conversa RETOMADA dias depois ("Você voltou — continue de onde parou"):
//
//   cliente  "Ver outras opções"
//   agente   "Certo! Vou trazer as melhores opções pra você com R$ 180 mil de crédito."
//            [nenhum card de oferta na tela]
//   agente   "Qual delas te interessou?"          ← delas quem?
//   cliente  "nao vi nenhuma"
//   agente   "Deixa eu tentar de novo e trazer as opções pra você visualizar melhor!"
//            [de novo, nada]
//
// O agente ANUNCIA as opções duas vezes e nas duas o card é engolido. Pior que
// não responder: promete e não entrega, e depois pergunta sobre uma lista que o
// cliente nunca viu.
//
// A causa é o guard `reveal-loop` (BUG-REVEAL-LOOP, 2026-06-02), que existe por
// um motivo legítimo: pós-reveal, afirmativo curto ("ta ótimo", "bora") fazia o
// agente re-emitir os cards de descoberta em loop, sem nunca cruzar pro passo 5.
// Ele suprime `comparison_table`/`recommendation_card`/`group_card` em TODO turno
// de usuário pós-reveal cujo valor-alvo não mudou.
//
// Só que "quero ver outras opções" não é afirmativo curto — é um PEDIDO EXPLÍCITO
// de ver a lista. No clique do card existe caminho determinístico
// (`action.kind = "show-other-options"` → `buildOtherOptions`, route.ts), que não
// passa por guard nenhum. Quem escreve, ou clica num chip que vira texto, cai no
// guard e recebe silêncio.
//
// Este cenário trava as duas metades: o pedido explícito passa, o afirmativo
// curto continua barrado.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O estado exato do print: conversa retomada, reveal já feito, Itaú escolhida,
 * R$ 180 mil de crédito. */
const RETOMADA_POS_REVEAL = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	qualifyAnswers: { creditMax: 180_000, desiredItem: "carro" },
	recommendedAdministradora: "ITAU",
	recommendedOffer: {
		administradora: "ITAU",
		category: "auto" as const,
		creditValue: 180_000,
		termMonths: 100,
		monthlyPayment: 4_384,
		groupId: "g-itau",
	},
};

const BEAT_COM_COMPARATIVO = [
	{
		text: "Certo! Vou trazer as melhores opções pra você com R$ 180 mil de crédito.",
		toolCalls: [
			{
				name: "present_comparison_table",
				args: {
					groups: [
						{
							groupId: "g-ancora",
							administradora: "ANCORA",
							category: "auto",
							creditValue: 180_000,
							monthlyPayment: 2_180,
							termMonths: 116,
						},
						{
							groupId: "g-porto",
							administradora: "PORTO",
							category: "auto",
							creditValue: 180_000,
							monthlyPayment: 2_310,
							termMonths: 110,
						},
					],
				},
			},
		],
	},
];

describeIfDb("FIX-425 — pedir outras opções por texto tem que MOSTRAR as opções", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("cliente escreve que quer ver outras opções → o comparativo aparece", async () => {
		const r = await runScenario({
			channel: "web",
			metaInicial: RETOMADA_POS_REVEAL,
			// `wants_more_options` é o rótulo que o analyzer dá a esta fala — o prompt
			// dele lista "mostra as outras"/"ver todas as opções" nesta categoria
			// (turn-analyzer.ts). Não é suposição do teste: é o contrato do analyzer.
			turns: [
				{ user: "Ver outras opções", intent: "wants_more_options", beats: BEAT_COM_COMPARATIVO },
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		expect(
			turno.artifacts,
			`o agente anunciou as opções e não mostrou nenhuma — trilha: ${turno.trilha.join(" → ")}`,
		).toContain("comparison_table");
	});

	it("cliente diz que não viu nada → a segunda tentativa também entrega", async () => {
		// A metade que dói mais no print: o cliente RECLAMA que não viu, o agente
		// promete tentar de novo, e o guard engole outra vez.
		const r = await runScenario({
			channel: "web",
			metaInicial: RETOMADA_POS_REVEAL,
			turns: [
				{ user: "Ver outras opções", intent: "wants_more_options", beats: BEAT_COM_COMPARATIVO },
				{
					user: "nao vi nenhuma",
					// "não vi nenhuma" é `confused` pelo contrato do analyzer: a pessoa
					// não entendeu/não enxergou o que foi apresentado. Reancorar mostrando
					// de novo é o comportamento certo (FIX-301), não um loop.
					intent: "confused",
					beats: [
						{
							text: "Deixa eu tentar de novo e trazer as opções pra você visualizar melhor!",
							toolCalls: BEAT_COM_COMPARATIVO[0].toolCalls,
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.turns[1].artifacts, `trilha do 2º turno: ${r.turns[1].trilha.join(" → ")}`).toContain(
			"comparison_table",
		);
	});

	it("o card de dúvidas não divide o turno com o que o cliente pediu", async () => {
		// No print, quem apareceu no lugar das ofertas foi o menu de dúvidas ("o que
		// é lance?", "como funciona o sorteio?"). Ele é convite LATERAL: sai sozinho
		// num turno calmo, nunca competindo com o conteúdo que o cliente pediu.
		// Mesma regra que já valia contra o gate do funil (FIX-360).
		const r = await runScenario({
			channel: "web",
			metaInicial: { ...RETOMADA_POS_REVEAL, experiencePrev: "first" as const },
			turns: [
				{ user: "Ver outras opções", intent: "wants_more_options", beats: BEAT_COM_COMPARATIVO },
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		expect(turno.artifacts, `trilha: ${turno.trilha.join(" → ")}`).toContain("comparison_table");
		expect(
			turno.artifacts,
			`o menu de dúvidas roubou o turno — trilha: ${turno.trilha.join(" → ")}`,
		).not.toContain("topic_picker");
	});

	it("mas num turno calmo o card de dúvidas continua saindo — o convite não some", async () => {
		// A metade que impede isto de virar "o novato nunca mais vê os tópicos":
		// turno de conversa pura, sem card e sem gate, o convite sai normalmente.
		const r = await runScenario({
			channel: "web",
			metaInicial: { ...RETOMADA_POS_REVEAL, experiencePrev: "first" as const },
			turns: [
				{
					user: "consórcio tem juros?",
					intent: "asking_question",
					beats: [{ text: "Não tem juros, só a taxa de administração." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.turns[0].artifacts, `trilha: ${r.turns[0].trilha.join(" → ")}`).toContain(
			"topic_picker",
		);
	});

	it("afirmativo curto pós-reveal continua barrado — o BUG-REVEAL-LOOP fica de pé", async () => {
		// O guard existe porque "bora"/"ta ótimo" re-abria a descoberta em loop e a
		// conversa nunca cruzava pro fechamento. Isso NÃO pode voltar.
		const r = await runScenario({
			channel: "web",
			metaInicial: RETOMADA_POS_REVEAL,
			turns: [{ user: "bora", intent: "ready_to_proceed", beats: BEAT_COM_COMPARATIVO }],
		});
		criadas.push(r.conversationId);

		expect(
			r.turns[0].artifacts,
			`afirmativo curto não pode re-abrir a descoberta — trilha: ${r.turns[0].trilha.join(" → ")}`,
		).not.toContain("comparison_table");
	});
});
