/**
 * BUG-SIMULATOR-SUBAGENTS (descoberto em 2026-05-18, ~3h antes da demo 13h)
 *
 * Sintoma reportado (Kairo):
 *   No simulador admin com time-travel ativo (`metadata.simulator.clockOffsetMs > 0`),
 *   quando o admin avança o tempo (+5d, +30d, +1y), os **specialists**
 *   (Helena/imovel, Bruno/auto, Marina/moto, Rafa/servicos) continuam
 *   se comportando como se a data corrente fosse o agora real do servidor.
 *   Ex: +30d simulado, mas o specialist responde como se a assembleia
 *   "que acontece em 5 dias" ainda fosse daqui a 5 dias reais (já passou).
 *
 *   Suspeita adicional: specialists podem nem estar recebendo a memória
 *   Letta (bloco humano) no system prompt — apenas o agente principal
 *   (concierge) ou o orquestrador injeta memory; specialists começam zerados.
 *
 * Causa raiz suspeita (após inspeção em builder.ts e system-prompt.ts):
 *
 *   1) TIME-TRAVEL não chega ao specialist:
 *      - `buildAgent(row, expertise)` em builder.ts NÃO aceita
 *        `simulatedNow` nem `conversation` como parâmetro
 *        (src/lib/agent/agents/builder.ts:28).
 *      - `buildSpecialistPrompt` chama `simulatorNow()` UMA vez para
 *        filtrar `activeCampaigns` (system-prompt.ts:509), mas o LLM
 *        NÃO recebe nenhum marcador textual de "hoje é X" — nem em
 *        `<role>`, nem em `<flow_rules>`, nem em system_context.
 *        Resultado: o modelo recorre ao seu cutoff de treinamento,
 *        que é a data REAL (~2026-01), totalmente indiferente ao
 *        offset simulado de +30d/+1y persistido na conversation.
 *      - PIOR: `agentCache` em agents/index.ts:6 cacheia o agente por
 *        `id:v${version}:${expertise}` — instâncias subsequentes
 *        reutilizam a MESMA `instructions` computada na PRIMEIRA build
 *        (que rodou com offset=0, antes do admin avançar o tempo).
 *        Mesmo se um marcador textual fosse adicionado, ele
 *        congelaria no momento do primeiro build.
 *
 *   2) MEMÓRIA Letta não chega ao specialist via builder:
 *      - `buildAgent` não tem nenhuma referência a `MemoryContext`,
 *        `HumanMemoryBlock`, nem leitura do `metadata.memory` da conv.
 *      - A memória é injetada APENAS no orchestrator/index.ts:153 como
 *        um `system message extra` PREPENDED ao array de messages, NÃO
 *        dentro das `instructions` próprias do specialist. Isso significa
 *        que se o orchestrator falhar em prepend (ex: identity null,
 *        Letta offline, circuit aberto), o specialist NÃO TEM nenhum
 *        fallback de memória — começa do zero.
 *      - O specialist montado por `buildAgent` é estruturalmente
 *        "memoryless" — não conhece quem é o user, qual a última
 *        simulação, qual o último orçamento. Depende 100% do
 *        orchestrator para prepender memory context a cada turno, em
 *        cada specialist criado.
 *
 * Este teste valida o CONTRATO mínimo para o simulador ser confiável:
 *   - Test 1: specialist construído dentro de `runWithSimulatorClock(+30d)`
 *     deve ter o `today=<data simulada>` visível no prompt — assim o LLM
 *     consegue raciocinar "passou 1 mês desde a última simulação". Sem
 *     isso, time-travel é teatro.
 *   - Test 2: specialist construído COM uma conversa que tem
 *     `metadata.memory.humanBlock` populada deve ter o bloco humano
 *     visível no prompt (ex: "Nome: Maria", "Estágio: engajado") — assim
 *     o specialist reconhece o user mesmo se o orchestrator falhar em
 *     prepend.
 *
 * Ambos os testes DEVEM FALHAR hoje. Fix sugerido no fim do arquivo.
 *
 * Constraints:
 *   - Integration test (vitest + DB real via aja-pg-develop:5434).
 *   - Sem Playwright, sem E2E.
 *   - Sem chamar Letta API real — mockamos o adapter de memória.
 *   - Cleanup explícito (afterEach delete da conversation criada).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getPersona } from "@/lib/agent/personas-repo";
import { invalidateAgentCache } from "@/lib/agent/agents";
import type { HumanMemoryBlock, MemoryContext } from "@/lib/memory/types";
import {
	runWithSimulatorClock,
	simulatorNow,
} from "@/lib/utils/simulator-clock";
import { buildAgent } from "./builder";

// ─── Helpers de introspecção ────────────────────────────────────────────────
//
// `ToolLoopAgent` armazena settings em `agent.settings` (campo runtime, não
// exposto pelo .d.ts mas verificado em
// node_modules/ai/dist/index.d.ts:3329 e dump local — ver _debug.test.ts).
// `settings.instructions` aceita string | SystemModelMessage |
// Array<SystemModelMessage> (d.ts:3344). builder.ts:55 sempre devolve
// Array<SystemModelMessage>. Esta função normaliza para o texto concatenado
// que será enviado à Anthropic.
function getAgentInstructionsText(agent: unknown): string {
	// biome-ignore lint/suspicious/noExplicitAny: introspecção runtime do ToolLoopAgent
	const inst = (agent as any)?.settings?.instructions;
	if (typeof inst === "string") return inst;
	if (Array.isArray(inst)) {
		return inst
			.map((m: { content?: unknown }) =>
				typeof m?.content === "string" ? m.content : "",
			)
			.join("\n\n");
	}
	if (inst && typeof inst === "object" && "content" in inst) {
		const content = (inst as { content?: unknown }).content;
		return typeof content === "string" ? content : "";
	}
	return "";
}

describe("BUG-SIMULATOR-SUBAGENTS — Teste 1: time-travel não propaga pros specialists", () => {
	beforeEach(() => {
		// Limpa cache do agente entre testes — o cache é estático no módulo
		// agents/index.ts e congela `instructions` no primeiro build, o que
		// agrava o bug em produção mas atrapalha asserções locais.
		invalidateAgentCache();
	});

	it("specialist Helena (imovel) construído com clock simulado +30d DEVE ter a data simulada visível no system prompt", async () => {
		const persona = await getPersona("imovel");

		const THIRTY_DAYS_MS = 30 * 86_400_000;
		// Captura o que o specialist DEVERIA reportar como "hoje" — a data
		// simulada que o ALS injeta via `simulatorNow()`.
		let simulatedTodayISO = "";
		let realTodayISO = "";

		const instructionsText = runWithSimulatorClock(
			{ offsetMs: THIRTY_DAYS_MS, conversationId: "test-sim-30d" },
			() => {
				simulatedTodayISO = simulatorNow().toISOString().slice(0, 10);
				realTodayISO = new Date().toISOString().slice(0, 10);
				// Build acontece DENTRO do scope ALS — qualquer
				// `simulatorNow()` chamado em buildSpecialistPrompt vê +30d.
				const agent = buildAgent(persona);
				return getAgentInstructionsText(agent);
			},
		);

		expect(
			simulatedTodayISO,
			"sanity: simulatorNow dentro do scope deveria estar 30 dias adiante do real",
		).not.toBe(realTodayISO);

		// CONTRATO: o LLM precisa saber QUAL é a data corrente da conversa
		// para raciocinar sobre "passou 1 semana desde sua última simulação"
		// no time-travel. Se a data simulada NÃO aparece em nenhum lugar do
		// system prompt, o specialist vai recorrer ao cutoff de treinamento
		// (~2026-01) — o time-travel vira teatro.
		expect(
			instructionsText,
			[
				"O specialist Helena foi construído com simulatorNow() = " +
					simulatedTodayISO +
					" (vs real " +
					realTodayISO +
					"), mas o system prompt NÃO contém a data simulada.",
				"",
				"Isso significa que mesmo com +30d ativo na conversation, o LLM",
				"não tem nenhum marcador textual de 'hoje é X' — recorre ao",
				"cutoff de treinamento. Tools dependentes de tempo (assembleia",
				"próxima, dias desde a última simulação, expiração de campanha)",
				"vão falar de datas reais, ignorando o offset.",
				"",
				"Fix esperado: injetar em buildSpecialistPrompt (ou via",
				"buildSystemContext do orchestrator) uma linha tipo:",
				`  <current_date>${simulatedTodayISO}</current_date>`,
				"que reflita simulatorNow() a cada build (sem cache estático)",
				"OU passar um parâmetro currentDate explícito a buildAgent.",
				"",
				"Prompt snippet (primeiros 400 chars): " +
					instructionsText.slice(0, 400),
			].join("\n"),
		).toContain(simulatedTodayISO);
	});

	it("agentCache congela instructions — segunda build com +30d reutiliza prompt do primeiro build (offset=0)", async () => {
		// Este teste demonstra a SEGUNDA camada do bug: mesmo se um marcador
		// textual de "hoje" fosse adicionado ao prompt, o cache de agentes
		// em agents/index.ts:6 reutiliza a primeira instância — congelando
		// o prompt com a data do PRIMEIRO build.
		//
		// Reprodução em produção: primeiro turno de qualquer conversa real
		// constrói o specialist com offset=0 e cacheia. Depois, qualquer
		// conversa simulada com clock avançado herda o mesmo prompt cached.
		invalidateAgentCache();
		const persona = await getPersona("auto");

		// Cenário A: primeiro build com clock real (sem ALS)
		const realBuildInstructions = getAgentInstructionsText(buildAgent(persona));

		// Cenário B: segunda build dentro de scope +30d — em produção isso
		// é o admin avançando o relógio na sessão do simulador.
		const ONE_YEAR_MS = 365 * 86_400_000;
		const simulatedBuildInstructions = runWithSimulatorClock(
			{ offsetMs: ONE_YEAR_MS, conversationId: "test-sim-1y" },
			() => getAgentInstructionsText(buildAgent(persona)),
		);

		// CONTRATO: se time-travel afeta o specialist, dois builds com
		// tempos DIFERENTES (real vs +1ano) precisam produzir prompts
		// DIFERENTES — mesmo que só pela data corrente, ou pela lista de
		// campanhas ativas (já que campaigns são filtradas por
		// startsAt/endsAt vs simulatorNow).
		expect(
			simulatedBuildInstructions,
			[
				"Build com clock simulado (+1 ano) produziu prompt IDÊNTICO ao",
				"build com clock real. Isso confirma que:",
				"  (a) o cache em agents/index.ts:agentCache reutiliza a instância,",
				"  (b) OU buildSpecialistPrompt não tem marcador textual de tempo,",
				"  (c) OU ambos.",
				"",
				"Resultado: o admin pode avançar o tempo no simulador o quanto",
				"quiser — o specialist nunca percebe.",
				"",
				"Fix esperado: ou (1) remover cache para specialists que tenham",
				"clock simulado ativo, ou (2) incluir o clockOffsetMs/data",
				"simulada no `cacheKey` de agents/index.ts:cacheKey, ou",
				"(3) injetar a data fora das instructions (via prepareCall ou",
				"system message extra do orchestrator a cada turno).",
			].join("\n"),
		).not.toBe(realBuildInstructions);
	});
});

describe("BUG-SIMULATOR-SUBAGENTS — Teste 2: specialist não recebe memória Letta no system prompt", () => {
	let convId: string;

	beforeEach(async () => {
		invalidateAgentCache();
		const [c] = await db
			.insert(conversations)
			.values({
				channel: "web",
				isSimulated: true,
				// metadata.memory.humanBlock simula o estado que viria da
				// Letta para um usuário recorrente. Em produção, isso é
				// carregado por loadMemoryContextForTurn em
				// orchestrator-bridge.ts. O buildAgent deveria ter acesso
				// pra montar specialist memory-aware desde o nascimento,
				// mas hoje IGNORA completamente.
				metadata: {
					memory: {
						humanBlock: {
							schemaVersion: 1,
							name: "Maria Time-Travel",
							stage: "engajado",
							category: "imovel",
							creditMax: 250000,
							termMonthsPreferred: 120,
							expertiseLevel: "experienced",
							lastInteractionAt: "2026-04-01T12:00:00.000Z",
							lastSimulation: {
								creditValue: 200000,
								termMonths: 120,
								monthlyPrice: 1850,
								date: "2026-04-01",
							},
						},
					},
				},
			})
			.returning();
		convId = c.id;
	});

	afterEach(async () => {
		await db.delete(conversations).where(eq(conversations.id, convId));
		invalidateAgentCache();
	});

	it("buildAgent NÃO aceita conversation/memory como parâmetro — specialist nasce memoryless", async () => {
		const persona = await getPersona("imovel");

		// Lê a conversa criada com memory block populada (Maria, engajada,
		// imóvel, simulou 200k em 120m em 01/04).
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv, "sanity: conversation criada no beforeEach").toBeDefined();
		const meta = (conv?.metadata as Record<string, unknown>) ?? {};
		const memoryBlock =
			((meta.memory as Record<string, unknown>)?.humanBlock as Record<
				string,
				unknown
			>) ?? null;
		expect(
			memoryBlock?.name,
			"sanity: metadata.memory.humanBlock.name foi gravado",
		).toBe("Maria Time-Travel");

		// CONTRATO 1: a assinatura de buildAgent precisa aceitar opts
		// adicionais (currentDate, memoryContext) pra propagar time-travel
		// e Letta sem depender de prepend de system message no orchestrator.
		// O fix expõe `buildAgent(row, expertise, opts)` — chamar com 3 args
		// não pode lançar TypeError nem produzir agent malformado.
		const memoryContext: MemoryContext = {
			agentId: "test-agent",
			block: (memoryBlock as unknown) as HumanMemoryBlock,
			archivalHits: [],
			daysSinceLastInteraction: null,
		};
		expect(
			() => buildAgent(persona, "neutro", { memoryContext }),
			"buildAgent precisa aceitar opts.memoryContext sem lançar erro",
		).not.toThrow();
	});

	it("specialist construído COM memoryContext tem o bloco humano (Maria, engajado, simulou 200k) renderizado no system prompt", async () => {
		const persona = await getPersona("imovel");

		// Lê a conversa criada no beforeEach e monta um MemoryContext
		// equivalente ao que loadMemoryContextForTurn devolveria em produção.
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		const meta = (conv?.metadata as Record<string, unknown>) ?? {};
		const block = ((meta.memory as Record<string, unknown>)?.humanBlock ??
			null) as HumanMemoryBlock | null;
		expect(block, "sanity: humanBlock gravado no beforeEach").not.toBeNull();

		const memoryContext: MemoryContext = {
			agentId: "test-agent-id",
			block: block as HumanMemoryBlock,
			archivalHits: [],
			daysSinceLastInteraction: null,
		};

		// Build do specialist passando memoryContext — contrato pós-fix.
		const agent = buildAgent(persona, "neutro", { memoryContext });
		const instructions = getAgentInstructionsText(agent);

		// CONTRATO: o prompt do specialist tem que conter ALGUMA pista
		// textual do user recorrente. Marcadores possíveis (qualquer um
		// que o agent reconheça):
		//   - "[CONTEXTO DO USUÁRIO]" (formato de buildMemorySystemMessage)
		//   - "Nome: Maria"
		//   - "Estágio atual: engajado"
		//   - "Última simulação"
		//   - "Maria Time-Travel"
		const memoryMarkers = [
			"[CONTEXTO DO USUÁRIO]",
			"Nome: Maria",
			"Maria Time-Travel",
			"Estágio atual: engajado",
			"Última simulação",
			"lastSimulation",
			"Crédito alvo: até R$ 250",
		];
		const foundMarkers = memoryMarkers.filter((m) =>
			instructions.includes(m),
		);

		expect(
			foundMarkers,
			[
				"O specialist Helena foi construído para uma conversa que tem",
				"`metadata.memory.humanBlock` com Maria/engajado/última simulação",
				"de R$ 200k. Mas o system prompt do specialist NÃO contém",
				"nenhum marcador da memória — buildAgent ignora a conversa",
				"inteira.",
				"",
				"Isso significa: se o orchestrator falhar em prepend (identity",
				"null, Letta offline, circuit aberto, primeira passagem web",
				"antes do threshold de 3 turnos), o specialist nasce zerado.",
				"Em time-travel +30d, o specialist nem sabe que existiu uma",
				"interação 30 dias atrás — fala como se fosse a primeira vez.",
				"",
				"Marcadores procurados: " + memoryMarkers.join(", "),
				"",
				"Fix esperado: buildAgent deveria receber MemoryContext (do",
				"orchestrator-bridge) e renderizar buildMemorySystemMessage()",
				"INSIDE das `instructions` do ToolLoopAgent — não como system",
				"message extra do orchestrator. Assim:",
				"  - specialist nasce já memory-aware",
				"  - cache key inclui hash do humanBlock (ou skip cache se há memory)",
				"  - falha de prepend no orchestrator não esvazia o specialist",
				"",
				"Prompt snippet (primeiros 600 chars): " +
					instructions.slice(0, 600),
			].join("\n"),
		).not.toEqual([]);
	});
});
