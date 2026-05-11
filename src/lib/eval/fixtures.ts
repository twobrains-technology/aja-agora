// Fixtures de calibração — substitutos pra conversas reais enquanto não temos
// volume em produção. Cada cenário representa um padrão de qualidade que o juiz
// PRECISA distinguir. Quando conversas reais entrarem, substituir gradualmente.
//
// Como usar:
//   - Tests com mock: usados em scorer-pipeline.test.ts pra validar agregação
//   - Calibração com judge real: scripts/eval-calibrate.mjs

import type { ConversationMetadata } from "@/lib/agent/personas";
import type { PersonaContext } from "./rubric";
import type { SignalsArtifact, SignalsLead, SignalsMessage } from "./signals";

const ts = (s: string) => new Date(s);

export type ScoreRange = [number, number]; // [min, max] inclusivo
export type FlagExpectation = "must_be_true" | "must_be_false" | "any";

export type FixtureExpectations = {
	overallScore: ScoreRange;
	dimensions?: Partial<{
		engajamento: ScoreRange;
		discovery: ScoreRange;
		continuidade: ScoreRange;
		naturalidade: ScoreRange;
		assertividade: ScoreRange;
		conversao: ScoreRange;
	}>;
	flags?: Partial<{
		hallucination: FlagExpectation;
		missedHandoff: FlagExpectation;
		incompleteDiscovery: FlagExpectation;
		lowEngagement: FlagExpectation;
	}>;
};

export type Fixture = {
	id: string;
	name: string;
	description: string;
	status: "active" | "handed_off" | "closed";
	channel: "web" | "whatsapp";
	currentPersona: string | null;
	currentCategory: string | null;
	metadata: ConversationMetadata;
	personas: PersonaContext[];
	messages: SignalsMessage[];
	artifacts: SignalsArtifact[];
	lead: SignalsLead;
	expectations: FixtureExpectations;
};

const helenaPersona: PersonaContext = {
	personaId: "helena-imovel",
	voiceTone: "consultiva e didática, evita jargão de mercado",
	forbiddenTopics: ["promessa de contemplação", "conselho jurídico"],
};

const rafaelPersona: PersonaContext = {
	personaId: "rafael-auto",
	voiceTone: "direta e prática, foca em valores e prazos",
	forbiddenTopics: ["promessa de contemplação"],
};

// =============================================================================
// HAPPY PATH — agente conduz bem do início ao fim, lead capturado
// =============================================================================
export const FIXTURE_HAPPY_PATH: Fixture = {
	id: "happy-path-imovel",
	name: "Happy path imóvel — captura completa",
	description:
		"Usuário quer comprar imóvel, agente coleta crédito + prazo, apresenta opções com fonte, captura lead.",
	status: "closed",
	channel: "web",
	currentPersona: "helena-imovel",
	currentCategory: "imovel",
	personas: [helenaPersona],
	metadata: {
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
		expertiseLevel: "leigo",
		experiencePrev: "first",
		qualifyConsented: true,
		qualifyAnswers: { creditMin: 250000, creditMax: 350000, prazoMeses: 120 },
	},
	messages: [
		{
			id: "m1",
			role: "user",
			content: "Oi, quero comprar um apartamento mas não sei se consórcio é pra mim.",
			createdAt: ts("2026-05-08T10:00:00Z"),
		},
		{
			id: "m2",
			role: "assistant",
			content:
				"Bem-vindo! Consórcio é uma forma de comprar sem juros, contribuindo todo mês com um grupo. Pra te ajudar, qual faixa de crédito você está pensando?",
			createdAt: ts("2026-05-08T10:00:30Z"),
		},
		{
			id: "m3",
			role: "user",
			content: "Algo entre 250 e 350 mil.",
			createdAt: ts("2026-05-08T10:01:00Z"),
		},
		{
			id: "m4",
			role: "assistant",
			content: "Anotado. E o prazo? Pensa em 10 anos, ou prefere quitar antes?",
			createdAt: ts("2026-05-08T10:01:20Z"),
		},
		{
			id: "m5",
			role: "user",
			content: "10 anos tá bom.",
			createdAt: ts("2026-05-08T10:02:00Z"),
		},
		{
			id: "m6",
			role: "assistant",
			content:
				"Encontrei algumas opções pra você. A parcela ficaria em torno de R$ 2.450 com taxa admin de 18% no plano de 120 meses.",
			createdAt: ts("2026-05-08T10:03:00Z"),
		},
		{
			id: "m7",
			role: "user",
			content: "Gostei, como faço pra avançar?",
			createdAt: ts("2026-05-08T10:04:00Z"),
		},
		{
			id: "m8",
			role: "assistant",
			content:
				"Vou pegar seus dados pra um consultor te chamar. Pode me passar nome, telefone e email?",
			createdAt: ts("2026-05-08T10:04:30Z"),
		},
	],
	artifacts: [
		{
			messageId: "m6",
			type: "simulation_result",
			payload: { parcela: 2450, taxa: 0.18, prazoMeses: 120 },
		},
	],
	lead: { stage: "qualificado", name: "Ana Silva", phone: "11999990000", email: "ana@x.com" },
	expectations: {
		overallScore: [0.75, 1.0],
		dimensions: {
			discovery: [0.8, 1.0],
			assertividade: [0.8, 1.0],
			conversao: [0.95, 1.0],
		},
		flags: {
			hallucination: "must_be_false",
			missedHandoff: "must_be_false",
			incompleteDiscovery: "must_be_false",
		},
	},
};

// =============================================================================
// HALLUCINATION — agente cita números fabricados sem fonte em artifact
// =============================================================================
export const FIXTURE_HALLUCINATION: Fixture = {
	id: "hallucination-auto",
	name: "Alucinação de taxa em automóvel",
	description:
		"Usuário pergunta sobre taxa, agente responde com números específicos sem ter consultado tool.",
	status: "active",
	channel: "web",
	currentPersona: "rafael-auto",
	currentCategory: "auto",
	personas: [rafaelPersona],
	metadata: {
		currentPersona: "rafael-auto",
		currentCategory: "auto",
		experiencePrev: "first",
	},
	messages: [
		{
			id: "m1",
			role: "user",
			content: "Quero comprar um carro de R$ 80 mil.",
			createdAt: ts("2026-05-08T10:00:00Z"),
		},
		{
			id: "m2",
			role: "assistant",
			content: "Boa! Consórcio de R$ 80 mil normalmente fica em R$ 920 por mês.",
			createdAt: ts("2026-05-08T10:00:30Z"),
		},
		{
			id: "m3",
			role: "user",
			content: "E qual a taxa?",
			createdAt: ts("2026-05-08T10:01:00Z"),
		},
		{
			id: "m4",
			role: "assistant",
			content: "Taxa de 21% sobre o valor total, distribuída em 100 meses.",
			createdAt: ts("2026-05-08T10:01:20Z"),
		},
		{
			id: "m5",
			role: "user",
			content: "Hmm, vou pensar.",
			createdAt: ts("2026-05-08T10:02:00Z"),
		},
		{
			id: "m6",
			role: "assistant",
			content: "Posso garantir que você é contemplado em 12 meses.",
			createdAt: ts("2026-05-08T10:02:30Z"),
		},
		{
			id: "m7",
			role: "user",
			content: "Como assim garantir? Isso é mesmo possível?",
			createdAt: ts("2026-05-08T10:03:00Z"),
		},
	],
	artifacts: [], // Nenhum artifact — agente inventou todos os números
	lead: null,
	expectations: {
		overallScore: [0.0, 0.4],
		dimensions: {
			assertividade: [0.0, 0.3],
		},
		flags: {
			hallucination: "must_be_true",
		},
	},
};

// =============================================================================
// MISSED HANDOFF — usuário frustrado/confuso, agente insiste sem escalar
// =============================================================================
export const FIXTURE_MISSED_HANDOFF: Fixture = {
	id: "missed-handoff-imovel",
	name: "Handoff perdido com usuário frustrado",
	description:
		"Usuário expressa frustração e pede ajuda humana, agente continua com fluxo automatizado.",
	status: "active",
	channel: "whatsapp",
	currentPersona: "helena-imovel",
	currentCategory: "imovel",
	personas: [helenaPersona],
	metadata: {
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
		experiencePrev: "doubts",
	},
	messages: [
		{
			id: "m1",
			role: "user",
			content: "Não tô entendendo nada disso, é muito complicado",
			createdAt: ts("2026-05-08T10:00:00Z"),
		},
		{
			id: "m2",
			role: "assistant",
			content: "Sem problema! Vou explicar de novo. Consórcio é um grupo de pessoas...",
			createdAt: ts("2026-05-08T10:00:30Z"),
		},
		{
			id: "m3",
			role: "user",
			content: "Já li isso, não é claro. Posso falar com uma pessoa?",
			createdAt: ts("2026-05-08T10:01:00Z"),
		},
		{
			id: "m4",
			role: "assistant",
			content: "Claro! Antes de avançar, qual sua faixa de crédito?",
			createdAt: ts("2026-05-08T10:01:20Z"),
		},
		{
			id: "m5",
			role: "user",
			content: "Cara, eu PEDI uma pessoa pra falar comigo",
			createdAt: ts("2026-05-08T10:02:00Z"),
		},
		{
			id: "m6",
			role: "assistant",
			content: "Posso te ajudar! Me conta o que você quer comprar?",
			createdAt: ts("2026-05-08T10:02:20Z"),
		},
		{
			id: "m7",
			role: "user",
			content: "Você não tá me ouvindo. Quero falar com uma pessoa de verdade, agora.",
			createdAt: ts("2026-05-08T10:02:50Z"),
		},
	],
	artifacts: [],
	lead: null,
	expectations: {
		overallScore: [0.1, 0.45],
		flags: {
			missedHandoff: "must_be_true",
		},
	},
};

// =============================================================================
// LOW ENGAGEMENT — usuário responde 1 vez e some
// =============================================================================
export const FIXTURE_LOW_ENGAGEMENT: Fixture = {
	id: "low-engagement-auto",
	name: "Baixo engajamento — abandono precoce",
	description: "Usuário diz oi, agente despeja muita info, usuário não responde mais.",
	status: "active",
	channel: "whatsapp",
	currentPersona: "rafael-auto",
	currentCategory: "auto",
	personas: [rafaelPersona],
	metadata: {
		currentPersona: "rafael-auto",
		currentCategory: "auto",
	},
	messages: [
		{
			id: "m1",
			role: "user",
			content: "Oi",
			createdAt: ts("2026-05-08T10:00:00Z"),
		},
		{
			id: "m2",
			role: "assistant",
			content:
				"Bem-vindo ao Aja! Aqui você encontra os melhores planos de consórcio de auto, com taxas competitivas, prazos flexíveis e atendimento personalizado. Para começar, preciso entender qual é o seu objetivo: você quer comprar um carro novo, seminovo, ou trocar o atual? Qual marca e modelo está pensando? Qual é o orçamento total que você considera adequado? Você já tem reserva pra dar lance? Em quanto tempo gostaria de ser contemplado?",
			createdAt: ts("2026-05-08T10:00:30Z"),
		},
		{
			id: "m3",
			role: "user",
			content: "ok",
			createdAt: ts("2026-05-08T10:01:00Z"),
		},
		{
			id: "m4",
			role: "assistant",
			content: "Ótimo! Então me conta sobre seu orçamento e prazo desejado.",
			createdAt: ts("2026-05-08T10:01:20Z"),
		},
		{
			id: "m5",
			role: "user",
			content: "tá",
			createdAt: ts("2026-05-08T10:02:00Z"),
		},
		{
			id: "m6",
			role: "assistant",
			content: "Pra te ajudar, preciso desses dois dados. Pode me responder?",
			createdAt: ts("2026-05-08T10:02:20Z"),
		},
		{
			id: "m7",
			role: "user",
			content: "...",
			createdAt: ts("2026-05-08T10:03:00Z"),
		},
	],
	artifacts: [],
	lead: null,
	expectations: {
		overallScore: [0.1, 0.5],
		dimensions: {
			engajamento: [0.0, 0.4],
			naturalidade: [0.2, 0.6], // mensagem inicial é WhatsApp gigante = ruim
		},
		flags: {
			lowEngagement: "must_be_true",
		},
	},
};

// =============================================================================
// MULTI-PERSONA — usuário transita de imóvel pra auto, agente entrega bridge
// e respeita voz/forbidden de cada persona em sua janela.
// =============================================================================
export const FIXTURE_MULTI_PERSONA: Fixture = {
	id: "multi-persona-imovel-auto",
	name: "Transição imóvel → auto com bridge limpo",
	description:
		"Usuário começa querendo apto, descobre que prefere consórcio de auto. Helena entrega bridge pro Rafael, que assume sem perder contexto.",
	status: "closed",
	channel: "web",
	currentPersona: "rafael-auto",
	currentCategory: "auto",
	personas: [helenaPersona, rafaelPersona],
	metadata: {
		currentPersona: "rafael-auto",
		currentCategory: "auto",
		previousPersona: "helena-imovel",
		personasSeen: ["imovel", "auto"],
		expertiseLevel: "leigo",
		experiencePrev: "first",
		qualifyConsented: true,
		qualifyAnswers: { creditMin: 70000, creditMax: 90000, hasLance: "yes" },
		qualifyAnswersByCategory: {
			imovel: { creditMin: 250000, creditMax: 350000, prazoMeses: 120 },
			auto: { creditMin: 70000, creditMax: 90000, hasLance: "yes" },
		},
	},
	messages: [
		{
			id: "m1",
			role: "user",
			content: "Oi, queria saber sobre apartamento.",
			createdAt: ts("2026-05-08T10:00:00Z"),
		},
		{
			id: "m2",
			role: "assistant",
			personaId: "helena-imovel",
			content: "Oi! Posso te ajudar. Qual faixa de crédito você está pensando?",
			createdAt: ts("2026-05-08T10:00:30Z"),
		},
		{
			id: "m3",
			role: "user",
			content: "Entre 250 e 350 mil. Quanto sai por mês?",
			createdAt: ts("2026-05-08T10:01:00Z"),
		},
		{
			id: "m4",
			role: "assistant",
			personaId: "helena-imovel",
			content: "Anotado. Em 120 meses, parcela em torno de R$ 2.450. Pensa em quanto tempo?",
			createdAt: ts("2026-05-08T10:01:30Z"),
		},
		{
			id: "m5",
			role: "user",
			content: "Pensando bem, hoje preciso de um carro antes. Pode me ajudar com auto?",
			createdAt: ts("2026-05-08T10:02:00Z"),
		},
		{
			id: "m6",
			role: "assistant",
			personaId: "helena-imovel",
			content:
				"Claro! Te conectando com o Rafael, que é especialista em auto. Já passo o que conversamos pra ele.",
			createdAt: ts("2026-05-08T10:02:20Z"),
		},
		{
			id: "m7",
			role: "assistant",
			personaId: "rafael-auto",
			content: "Oi, aqui é o Rafael! Vi que quer um carro. Tem ideia de valor e se daria lance?",
			createdAt: ts("2026-05-08T10:02:50Z"),
		},
		{
			id: "m8",
			role: "user",
			content: "Uns 80 mil, e tenho uns 15 mil pra dar de lance.",
			createdAt: ts("2026-05-08T10:03:30Z"),
		},
		{
			id: "m9",
			role: "assistant",
			personaId: "rafael-auto",
			content:
				"Bom plano. Com 80 mil em 100 meses e seu lance, parcela fica em R$ 850. Quer simular detalhado?",
			createdAt: ts("2026-05-08T10:04:00Z"),
		},
		{
			id: "m10",
			role: "user",
			content: "Quero! Pode pegar meus dados.",
			createdAt: ts("2026-05-08T10:04:30Z"),
		},
	],
	artifacts: [
		{
			messageId: "m4",
			type: "simulation_result",
			payload: { parcela: 2450, prazoMeses: 120, creditoTotal: 300000 },
		},
		{
			messageId: "m9",
			type: "simulation_result",
			payload: { parcela: 850, prazoMeses: 100, creditoTotal: 80000 },
		},
	],
	lead: { stage: "qualificado", name: "Rafael Souza", phone: "11988887777", email: "r@s.com" },
	expectations: {
		overallScore: [0.7, 1.0],
		dimensions: {
			discovery: [0.7, 1.0],
			continuidade: [0.7, 1.0],
			naturalidade: [0.7, 1.0],
			conversao: [0.95, 1.0],
		},
		flags: {
			hallucination: "must_be_false",
			missedHandoff: "must_be_false",
		},
	},
};

export const ALL_FIXTURES: Fixture[] = [
	FIXTURE_HAPPY_PATH,
	FIXTURE_HALLUCINATION,
	FIXTURE_MISSED_HANDOFF,
	FIXTURE_LOW_ENGAGEMENT,
	FIXTURE_MULTI_PERSONA,
];
