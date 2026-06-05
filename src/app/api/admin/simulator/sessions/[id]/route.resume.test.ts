/**
 * Teste de regressão: simulador admin DEVE retomar histórico de conversa ao re-abrir.
 *
 * Bug reportado: no /admin/simulator/web (e /whatsapp), quando o admin inicia
 * uma conversa simulada, sai do simulador e depois volta/clica de novo na mesma
 * sessão, o histórico das mensagens NÃO é renderizado — a UI começa do zero
 * embora a conversation continue existindo no banco. Deveria reabrir com TODAS
 * as mensagens da sessão visíveis.
 *
 * Investigação:
 *   - Endpoint GET /api/admin/simulator/sessions/[id] (este file: route.ts)
 *     JÁ retorna { conversation, handoffState, messages } com o array completo
 *     ordenado por createdAt. Esse pedaço do contrato funciona.
 *   - O consumidor (src/components/admin/simulator/web/simulator-web.tsx) faz
 *     fetch nesse endpoint para popular header (contactName, authorName), mas
 *     IGNORA o array `messages` retornado. Nunca chama setMessages no
 *     ChatProvider.
 *   - O ChatProvider (src/lib/chat/provider.tsx) só aceita
 *     `initialConversationId`. Quando esse muda, ele chama setMessages([])
 *     explicitamente (linha 99) e jamais hidrata. Não existe prop
 *     `initialMessages` no provider.
 *   - Resultado: usuário re-abre conversa → ChatProvider remonta com mesmo
 *     conversationId, useChat({ id }) começa com [] → backend mantém histórico
 *     no DB mas frontend não pinta nada até o próximo turno.
 *
 * Contrato afirmado:
 *   1. Endpoint retorna messages no formato esperado (regression guard do
 *      contrato — se alguém mexer no shape do GET, esse teste pega).
 *   2. O componente consumidor SimulatorWeb DEVE propagar o array `messages`
 *      do payload para o ChatProvider via prop `initialMessages` (ou
 *      equivalente). Hoje não propaga — esse assert falha estruturalmente.
 *   3. O ChatProvider DEVE aceitar a prop `initialMessages` e usá-la para
 *      semear o useChat. Hoje só aceita `initialConversationId` — esse assert
 *      falha estruturalmente.
 *
 * Integration test: bate no DB real do container (aja-pg-develop, 5434) e
 * inspeciona o source dos consumidores para detectar a falta da hidratação.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages as messagesTable } from "@/db/schema";

// requireRole consulta better-auth via headers() — mock pra rodar a rota como
// admin sem subir todo o ciclo de sessão.
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi
		.fn()
		.mockResolvedValue({ error: null, session: { user: { id: "test-admin", role: "admin" } } }),
}));

const { GET } = await import("./route");

type SessionResponse = {
	conversation: {
		id: string;
		channel: string;
		waId: string | null;
		status: string;
		contactName: string | null;
		isSimulated: boolean;
		createdAt: string;
		updatedAt: string;
	};
	handoffState: { isHandedOff: boolean };
	messages: Array<{
		id: string;
		role: "user" | "assistant" | "system";
		content: string;
		channel: string;
		createdAt: string;
	}>;
};

async function createSimulatedConversationWithHistory(): Promise<{
	convId: string;
	turns: Array<{ role: "user" | "assistant"; content: string }>;
}> {
	const [conv] = await db
		.insert(conversations)
		.values({
			channel: "web",
			isSimulated: true,
			contactName: "Kairo Teste",
			metadata: { createdBySimUserId: "test-admin" },
		})
		.returning();

	const turns: Array<{ role: "user" | "assistant"; content: string }> = [
		{ role: "user", content: "oi, quero simular um carro de R$ 80 mil" },
		{ role: "assistant", content: "Beleza! Quanto consegue pagar por mês?" },
		{ role: "user", content: "uns 800 reais" },
		{ role: "assistant", content: "Achei 3 grupos que encaixam. Quer ver?" },
	];

	// Inserir em sequência pra garantir ordem determinística por createdAt.
	let i = 0;
	for (const t of turns) {
		await db.insert(messagesTable).values({
			conversationId: conv.id,
			role: t.role,
			content: t.content,
			channel: "web",
			createdAt: new Date(Date.now() + i * 100),
		});
		i++;
	}

	return { convId: conv.id, turns };
}

async function cleanup(convId: string): Promise<void> {
	// messages cascateiam por FK on delete cascade da conversation.
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe("Simulador admin — retomar histórico ao re-abrir conversa", () => {
	let convId: string;
	let turns: Array<{ role: "user" | "assistant"; content: string }>;

	beforeEach(async () => {
		const created = await createSimulatedConversationWithHistory();
		convId = created.convId;
		turns = created.turns;
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("GET /api/admin/simulator/sessions/[id] retorna messages persistidas em ordem (baseline do contrato)", async () => {
		const res = await GET(new Request(`http://localhost/api/admin/simulator/sessions/${convId}`), {
			params: Promise.resolve({ id: convId }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as SessionResponse;

		// Conversa identificada.
		expect(body.conversation.id).toBe(convId);
		expect(body.conversation.isSimulated).toBe(true);
		expect(body.conversation.contactName).toBe("Kairo Teste");

		// Histórico COMPLETO e em ordem cronológica — o que o cliente precisa
		// pra re-renderizar o chat ao reabrir.
		expect(body.messages).toHaveLength(turns.length);
		expect(body.messages.map((m) => m.role)).toEqual(turns.map((t) => t.role));
		expect(body.messages.map((m) => m.content)).toEqual(turns.map((t) => t.content));

		// Sanity: cada msg tem id e timestamp (necessário pra useChat consumir).
		for (const m of body.messages) {
			expect(m.id).toBeTruthy();
			expect(m.createdAt).toBeTruthy();
		}
	});

	it("SimulatorWeb DEVE consumir messages do GET sessions/[id] e propagar pro ChatProvider (BUG: hoje só lê metadata)", async () => {
		// Primeiro confirma que o endpoint serve as messages (precondição do contrato).
		const res = await GET(new Request(`http://localhost/api/admin/simulator/sessions/${convId}`), {
			params: Promise.resolve({ id: convId }),
		});
		const body = (await res.json()) as SessionResponse;
		expect(body.messages.length).toBeGreaterThan(0);

		// Agora a parte do bug: o componente que renderiza essa tela ignora o
		// array `messages` do payload. Inspeciona o source pra provar que a
		// propagação NÃO está implementada — esse é exatamente o defeito que
		// deixa o histórico desaparecer na UI ao re-abrir.
		const simulatorWebSource = readFileSync(
			resolvePath(process.cwd(), "src/components/admin/simulator/web/simulator-web.tsx"),
			"utf8",
		);

		// CONTRATO: o componente deve ler `messages` da resposta E passar pro
		// ChatProvider via prop `initialMessages`. Hoje o componente só tipa
		// `contactName` e `createdBy` no `data` do fetch — `messages` nem
		// aparece no `as { conversation: ... }`.
		expect(
			simulatorWebSource,
			"SimulatorWeb não menciona `initialMessages` — significa que o histórico do GET é descartado e o chat re-abre vazio.",
		).toMatch(/initialMessages/);

		// CONTRATO complementar: o tipo do fetch precisa incluir `messages`
		// senão o autor da rota muda o shape e ninguém percebe.
		expect(
			simulatorWebSource,
			"O `data` tipado do fetch não declara `messages: ...` — qualquer hidratação está sendo feita sem tipos, ou (mais provável) não está sendo feita.",
		).toMatch(/messages\s*:/);
	});

	it("ChatProvider DEVE aceitar prop `initialMessages` pra hidratar histórico (BUG: hoje só aceita initialConversationId)", async () => {
		// Sem essa prop, mesmo que o SimulatorWeb leia messages do GET, não
		// existe canal pra entregar pro useChat sem fork do provider.
		const providerSource = readFileSync(
			resolvePath(process.cwd(), "src/lib/chat/provider.tsx"),
			"utf8",
		);

		expect(
			providerSource,
			"ChatProvider não aceita prop `initialMessages` — não há como semear o useChat com histórico ao re-abrir conversa simulada.",
		).toMatch(/initialMessages/);

		// Sanity pós-fix: ao trocar conversationId, o provider DEVE chamar
		// setMessages com o seed das mensagens iniciais (com fallback `?? []`)
		// em vez de zerar incondicionalmente. Esse padrão substitui o antigo
		// `setMessagesRef.current([])` e garante que o histórico vindo do GET
		// sessions/[id] sobreviva ao remount.
		expect(
			providerSource,
			"ChatProvider deve hidratar setMessages com seed das initialMessages ao trocar conversationId, não apenas zerar.",
		).toMatch(/setMessagesRef\.current\([^)]*\?\?\s*\[\]\s*\)/);

		// Complementar: useChat precisa receber `messages` no init pra que o
		// PRIMEIRO render da nova conversa já venha hidratado (sem isso, o
		// usuário veria um flash de chat vazio até o effect rodar).
		expect(
			providerSource,
			"ChatProvider deve passar `messages: initialMessages` ao useChat pra hidratar no primeiro render.",
		).toMatch(/messages:\s*initialMessages/);
	});
});
