import { describe, expect, it } from "vitest";
import { buildAssistantTools } from "./assistant-tools";

function makeCtx(over: Partial<Parameters<typeof buildAssistantTools>[0]> = {}) {
	return buildAssistantTools({
		personaId: "p1",
		personaVersion: 1,
		currentRow: {
			voiceTone: "formal e técnico",
			examples: [],
			forbiddenTopics: [],
			handoffTriggers: [],
		},
		...over,
	});
}

// AI SDK tool.execute esperam um segundo argumento (options); usamos cast pra teste.
const TOOL_OPTS = {} as never;

describe("buildAssistantTools — registry", () => {
	it("retorna 3 tools no registry", () => {
		const tools = makeCtx();
		expect(Object.keys(tools).sort()).toEqual([
			"ask_clarification",
			"propose_patch",
			"validate_against_rules",
		]);
	});
});

describe("ask_clarification", () => {
	it("retorna a pergunta sem persistir nada", async () => {
		const tools = makeCtx();
		const result = await tools.ask_clarification.execute(
			{
				question: "Menos formal igual amigo no zap, ou só menos técnico?",
			},
			TOOL_OPTS,
		);
		expect(result.question).toMatch(/menos formal/i);
	});
});

describe("validate_against_rules", () => {
	it("aceita texto limpo", async () => {
		const tools = makeCtx();
		const result = await tools.validate_against_rules.execute(
			{
				text: "casual, próximo, fala como amigo no zap",
				field: "voiceTone",
			},
			TOOL_OPTS,
		);
		expect(result.valid).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("detecta frase proibida 'Vamos achar a opção certa'", async () => {
		const tools = makeCtx();
		const result = await tools.validate_against_rules.execute(
			{
				text: "Vamos achar a opção certa pra você",
				field: "voiceTone",
			},
			TOOL_OPTS,
		);
		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => /vamos achar/i.test(v))).toBe(true);
	});

	it("detecta vazamento de raciocínio 'Motivo:'", async () => {
		const tools = makeCtx();
		const result = await tools.validate_against_rules.execute(
			{
				text: "Vou te conectar com humano. Motivo: valor acima do teto.",
				field: "example.assistantResponse",
			},
			TOOL_OPTS,
		);
		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => /Motivo/i.test(v))).toBe(true);
	});

	it("detecta voiceTone que instrui cumprimentar antes da tool", async () => {
		const tools = makeCtx();
		const result = await tools.validate_against_rules.execute(
			{
				text: "Sempre cumprimente pelo nome assim que entrar na conversa",
				field: "voiceTone",
			},
			TOOL_OPTS,
		);
		expect(result.valid).toBe(false);
		expect(
			result.violations.some((v) => /save_contact_name|cumpriment/i.test(v)),
		).toBe(true);
	});
});

describe("propose_patch — validações server-side", () => {
	it("rejeita personaVersionSeen stale", async () => {
		const tools = makeCtx({ personaVersion: 5 });
		const result = await tools.propose_patch.execute(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual",
				rationale: "x",
				personaVersionSeen: 3,
			},
			TOOL_OPTS,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/vers[ãa]o.*stale|version=3/i);
		}
	});

	it("rejeita voiceTone com before que não bate com row atual", async () => {
		const tools = makeCtx();
		const result = await tools.propose_patch.execute(
			{
				kind: "voiceTone",
				before: "tom errado que não está no row",
				after: "casual",
				rationale: "x",
				personaVersionSeen: 1,
			},
			TOOL_OPTS,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/before.*não bate/i);
		}
	});

	it("rejeita voiceTone com frase proibida no after", async () => {
		const tools = makeCtx();
		const result = await tools.propose_patch.execute(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual, e sempre cumprimente pelo nome assim que entrar",
				rationale: "x",
				personaVersionSeen: 1,
			},
			TOOL_OPTS,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/save_contact_name|cumpriment/i);
		}
	});

	it("rejeita example.add cujo assistantResponse contém frase proibida", async () => {
		const tools = makeCtx();
		const result = await tools.propose_patch.execute(
			{
				kind: "example.add",
				after: {
					id: "ex-1",
					userMessage: "Quanto custa?",
					assistantResponse: "Vamos achar a opção certa pra você!",
				},
				rationale: "exemplo de preço",
				personaVersionSeen: 1,
			},
			TOOL_OPTS,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/vamos achar/i);
		}
	});

	it("aceita patch voiceTone válido", async () => {
		const tools = makeCtx();
		const result = await tools.propose_patch.execute(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual, próximo, fala como amigo no zap",
				rationale: "admin pediu menos formal",
				personaVersionSeen: 1,
			},
			TOOL_OPTS,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.patch.kind).toBe("voiceTone");
		}
	});

	it("aceita patch example.add limpo", async () => {
		const tools = makeCtx();
		const result = await tools.propose_patch.execute(
			{
				kind: "example.add",
				after: {
					id: "ex-2",
					userMessage: "Como funciona o consórcio?",
					assistantResponse:
						"É simples: você paga parcelas, e ao ser contemplado (sorteio ou lance) recebe o crédito. Sem juros.",
				},
				rationale: "exemplo educativo",
				personaVersionSeen: 1,
			},
			TOOL_OPTS,
		);
		expect(result.ok).toBe(true);
	});

	it("aceita example.remove sem validar conteúdo (não há after pra validar)", async () => {
		const tools = makeCtx();
		const result = await tools.propose_patch.execute(
			{
				kind: "example.remove",
				targetId: "550e8400-e29b-41d4-a716-446655440000",
				rationale: "removendo exemplo redundante",
				personaVersionSeen: 1,
			},
			TOOL_OPTS,
		);
		expect(result.ok).toBe(true);
	});
});
