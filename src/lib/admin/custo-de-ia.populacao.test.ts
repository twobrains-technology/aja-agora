// A POPULAÇÃO do custo de IA — `computeCustoDeIA` e o CPC contra o banco.
//
// P217/P219: o custo da tela é o custo da OPERAÇÃO. O simulador do admin cria
// conversa de verdade (`api/admin/simulator/sessions`) e o Pi grava o consumo dela
// em `uso_de_ia` como o de qualquer outra; na `main` a consulta de conversas
// filtrava `is_simulated = false`, e o gasto de teste nunca entrava no CPC. A
// prova é de população: gasto real e gasto de simulador no MESMO período, e só o
// real no número — no custo e no CPC que divide por ele.
//
// P273: a linha antiga do Pi perdeu a medição de cache (`tokens_cache_read` NULL
// com input líquido). Ela não tem custo conhecido e não pode aparecer precificada
// integralmente: entra na marca PARCIAL. Cache 0 é medido e o custo é cheio.
//
// Período próprio (junho/2032) para não encostar na população de outro arquivo
// rodando em paralelo.

import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { calcularCpc } from "@/components/admin/performance/custos-do-cpc";
import { db } from "@/db";
import { conversations, leads, usoDeIa, visits } from "@/db/schema";
import { computeCustoDeIA, conversasDoPeriodo, lerCustoLocal } from "./custo-de-ia";
import type { ResultadoCustoDeMensagem } from "./custo-de-mensagem";
import { computeCustosDoCpc } from "./performance-queries";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DE = new Date("2032-06-01T00:00:00.000Z");
const ATE = new Date("2032-06-02T23:59:59.000Z");
const BASE = Date.parse("2032-06-01T12:00:00.000Z");

/** 80 mil tokens de entrada do default do vendedor (US$ 0,05/M) = 0,4 centavo. */
const REAL_CENTS = 0.4;
/**
 * O gasto do simulador no mesmo período: 1 milhão de entrada do haiku (US$ 1/M) = 1 dólar =
 * 100 centavos. Um número só dele, para o teste ver se ele vazou para o total.
 */
const SIMULADO_CENTS = 100;
/** 300 mil de entrada do haiku = 30 centavos — a chamada avulsa, sem conversa. */
const AVULSA_CENTS = 30;
/** A cotação é CADASTRO, não população: aqui ela entra fixa para o valor sair em real. */
const COTACAO = 5.5;

/**
 * As fontes reais do recorte: as duas consultas do banco são as de produção. Só a
 * cotação é injetada — ela mora em `custos_config` e é configuração, não a
 * população que este arquivo prova.
 */
const FONTES = {
	lerUso: lerCustoLocal,
	lerConversas: conversasDoPeriodo,
	lerCotacao: async () => COTACAO,
};

/** O preço da mensagem também é cadastro, e não é o que o CPC deste arquivo prova. */
const SEM_MENSAGEM: ResultadoCustoDeMensagem = {
	quantidade: 0,
	porTemplate: [],
	custo: { tipo: "valor", centavos: 0, precoUnitarioCents: 0 },
};

const conversas: string[] = [];
const visitantes: string[] = [];
const avulsas: string[] = [];

async function limpar(): Promise<void> {
	if (conversas.length > 0) {
		await db.delete(leads).where(inArray(leads.conversationId, conversas));
		await db.delete(conversations).where(inArray(conversations.id, conversas));
	}
	if (avulsas.length > 0) await db.delete(usoDeIa).where(inArray(usoDeIa.id, avulsas));
	if (visitantes.length > 0) await db.delete(visits).where(inArray(visits.visitorId, visitantes));
	conversas.length = 0;
	visitantes.length = 0;
	avulsas.length = 0;
}

beforeEach(limpar);
afterAll(limpar);

/** Uma conversa do período — a de operação ou a do simulador. */
async function semearConversa(dados: { simulado: boolean }): Promise<string> {
	const [linha] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			isSimulated: dados.simulado,
			createdAt: new Date(BASE),
			updatedAt: new Date(BASE),
		})
		.returning({ id: conversations.id });
	const id = linha?.id as string;
	conversas.push(id);
	return id;
}

/**
 * Uma linha do livro-caixa. `cache: null` é a linha ANTIGA do Pi (medição perdida);
 * `cache: 0` é o que o turno grava desde o contrato com `precos.ts` — medido, zero.
 */
async function semearUso(dados: {
	conversa: string | null;
	modelo: string;
	tokensInput: number;
	cache: number | null;
}): Promise<void> {
	const [linha] = await db
		.insert(usoDeIa)
		.values({
			conversationId: dados.conversa,
			modelo: dados.modelo,
			tokensInput: dados.tokensInput,
			tokensOutput: 0,
			tokensCacheRead: dados.cache,
			tokensCacheWrite: dados.cache,
			criadoEm: new Date(BASE),
		})
		.returning({ id: usoDeIa.id });
	if (dados.conversa === null) avulsas.push(linha?.id as string);
}

/** Uma pessoa com visita, conversa e lead — da contagem que denomina o CPC. */
async function semearPessoa(dados: {
	sufixo: string;
	simulado: boolean;
	estagio: "novo" | "qualificado";
}): Promise<string> {
	const visitante = `teste-custo-ia-${dados.sufixo}`;
	const [visita] = await db
		.insert(visits)
		.values({
			visitorId: visitante,
			channel: "web",
			userAgent: "Mozilla/5.0 (Macintosh)",
			createdAt: new Date(BASE),
		})
		.returning({ id: visits.id });
	visitantes.push(visitante);

	const [conversa] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			isSimulated: dados.simulado,
			visitId: visita?.id,
			createdAt: new Date(BASE),
			updatedAt: new Date(BASE),
		})
		.returning({ id: conversations.id });
	const conversaId = conversa?.id as string;
	conversas.push(conversaId);

	await db.insert(leads).values({
		conversationId: conversaId,
		phone: null,
		stage: dados.estagio,
		isSimulated: dados.simulado,
		createdAt: new Date(BASE),
		updatedAt: new Date(BASE),
	});

	return conversaId;
}

describeIfDb("P217 — o custo operacional exclui o gasto do simulador", () => {
	it("gasto real e gasto de simulador no mesmo período: só o real entra", async () => {
		const real = await semearConversa({ simulado: false });
		await semearUso({ conversa: real, modelo: "qwen3.6-flash", tokensInput: 80_000, cache: 0 });

		const simulada = await semearConversa({ simulado: true });
		await semearUso({
			conversa: simulada,
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			cache: 0,
		});

		const custo = await computeCustoDeIA({ de: DE, ate: ATE }, FONTES);

		expect(custo.tipo).toBe("valor");
		if (custo.tipo !== "valor") return;
		// 0,4 centavo do turno real — e NÃO 100,4, que é o que sairia com o gasto do
		// simulador somado ao período.
		expect(custo.parcial).toBe(false);
		expect(custo.usdCents).toBeCloseTo(REAL_CENTS, 10);
		expect(custo.usdCents).not.toBeCloseTo(REAL_CENTS + SIMULADO_CENTS, 10);
		expect(custo.brlCents).toBe(2); // 0,4 × 5,5 = 2,2 → 2
		// A conversa do simulador também não é conversa do período.
		expect(custo.conversas).toBe(1);
	});

	it("a chamada avulsa continua no total, mesmo sem conversa nenhuma", async () => {
		const real = await semearConversa({ simulado: false });
		await semearUso({ conversa: real, modelo: "qwen3.6-flash", tokensInput: 80_000, cache: 0 });

		const simulada = await semearConversa({ simulado: true });
		await semearUso({
			conversa: simulada,
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			cache: 0,
		});

		// Juiz, diagnóstico e insight gastam sem conversa a quem atribuir: continuam
		// contando (P314), com ou sem conversa simulada no período.
		await semearUso({ conversa: null, modelo: "claude-haiku-4-5", tokensInput: 300_000, cache: 0 });

		const custo = await computeCustoDeIA({ de: DE, ate: ATE }, FONTES);

		expect(custo.tipo).toBe("valor");
		if (custo.tipo !== "valor") return;
		expect(custo.usdCents).toBeCloseTo(REAL_CENTS + AVULSA_CENTS, 10);
		expect(custo.semConversa.chamadas).toBe(1);
		expect(custo.semConversa.usdCents).toBeCloseTo(AVULSA_CENTS, 10);
	});
});

describeIfDb("P273 — a linha sem a medição de cache é desconhecida, não custo cheio", () => {
	it("a linha antiga do Pi (cache NULL) fica fora da soma e marca o período PARCIAL", async () => {
		const conversa = await semearConversa({ simulado: false });
		// A linha do contrato novo: cache medido em zero, custo conhecido.
		await semearUso({ conversa, modelo: "qwen3.6-flash", tokensInput: 80_000, cache: 0 });
		// A linha antiga: input líquido, sem medição de cache — gasto desconhecido.
		await semearUso({ conversa, modelo: "qwen3.6-flash", tokensInput: 80_000, cache: null });

		const custo = await computeCustoDeIA({ de: DE, ate: ATE }, FONTES);

		expect(custo.tipo).toBe("valor");
		if (custo.tipo !== "valor") return;
		expect(custo.usdCents).toBeCloseTo(REAL_CENTS, 10);
		expect(custo.parcial).toBe(true);
		expect(custo.semPreco).toEqual([{ modelo: "qwen3.6-flash", linhas: 1 }]);
	});

	it("cache medido em zero: o mesmo período sem a linha antiga não é parcial", async () => {
		const conversa = await semearConversa({ simulado: false });
		await semearUso({ conversa, modelo: "qwen3.6-flash", tokensInput: 80_000, cache: 0 });

		const custo = await computeCustoDeIA({ de: DE, ate: ATE }, FONTES);

		expect(custo.tipo).toBe("valor");
		if (custo.tipo !== "valor") return;
		expect(custo.usdCents).toBeCloseTo(REAL_CENTS, 10);
		expect(custo.parcial).toBe(false);
		expect(custo.semPreco).toEqual([]);
	});
});

describeIfDb("P219 — o CPC combina custo real com denominador real", () => {
	it("o gasto do simulador não infla o numerador nem o denominador", async () => {
		const real = await semearPessoa({ sufixo: "real", simulado: false, estagio: "qualificado" });
		await semearUso({ conversa: real, modelo: "qwen3.6-flash", tokensInput: 80_000, cache: 0 });

		const simulada = await semearPessoa({
			sufixo: "simulada",
			simulado: true,
			estagio: "qualificado",
		});
		await semearUso({
			conversa: simulada,
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			cache: 0,
		});

		// O denominador sai da consulta real de contagens do funil.
		const custos = await computeCustosDoCpc(DE, ATE);
		expect(custos.contagens.qualificados).toBe(1);

		// O numerador do custo de IA sai das consultas reais do livro-caixa e das
		// conversas. Investimento e preço da mensagem entram fixos: são cadastro/mídia,
		// não a população deste arquivo.
		const custoIA = await computeCustoDeIA({ de: DE, ate: ATE }, FONTES);
		const cpc = calcularCpc({
			...custos,
			investimentoMetaCents: 1_000,
			custoDeIA: custoIA,
			custoDeMensagem: SEM_MENSAGEM,
		});

		// (1.000 + 2 do custo de IA real) ÷ 1 qualificado real. Com o simulador no custo
		// de IA daria 1.552; com ele no denominador, 501.
		expect(cpc).toEqual({ tipo: "valor", centavos: 1_002, parcial: false });
	});
});
