import { describe, expect, it } from "vitest";
import {
	buildAssistantTools,
	executeProposePatch,
	type ProposePatchResult,
} from "./assistant-tools";

// Helper p/ narrow type — tool.execute do AI SDK 6 retorna Result|AsyncIterable<Result>;
// aqui é sempre Result (Promise<R>), então cast direto.
async function execTool<T>(
	// biome-ignore lint/suspicious/noExplicitAny: tool.execute schema do SDK
	execute: any,
	input: unknown,
): Promise<T> {
	return (await execute(input, {} as never)) as T;
}

function makeCtx(
	over: Partial<Parameters<typeof buildAssistantTools>[0]> = {},
) {
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

function makeBaseCtx(
	over: Partial<Parameters<typeof buildAssistantTools>[0]> = {},
): Parameters<typeof executeProposePatch>[1] {
	return {
		personaId: "p1",
		personaVersion: 1,
		currentRow: {
			voiceTone: "formal e técnico",
			examples: [],
			forbiddenTopics: [],
			handoffTriggers: [],
		},
		...over,
	};
}

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
		const result = await execTool<{ question: string }>(
			tools.ask_clarification.execute,
			{
				question: "Menos formal igual amigo no zap, ou só menos técnico?",
			},
		);
		expect(result.question).toMatch(/menos formal/i);
	});
});

type ValidateResult = { valid: boolean; violations: string[] };

describe("validate_against_rules", () => {
	it("aceita texto limpo", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(
			tools.validate_against_rules.execute,
			{
				text: "casual, próximo, fala como amigo no zap",
				field: "voiceTone",
			},
		);
		expect(result.valid).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("detecta frase proibida 'Vamos achar a opção certa'", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(
			tools.validate_against_rules.execute,
			{
				text: "Vamos achar a opção certa pra você",
				field: "voiceTone",
			},
		);
		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => /vamos achar/i.test(v))).toBe(true);
	});

	it("detecta vazamento de raciocínio 'Motivo:'", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(
			tools.validate_against_rules.execute,
			{
				text: "Vou te conectar com humano. Motivo: valor acima do teto.",
				field: "example.assistantResponse",
			},
		);
		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => /Motivo/i.test(v))).toBe(true);
	});

	it("detecta voiceTone que instrui cumprimentar antes da tool", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(
			tools.validate_against_rules.execute,
			{
				text: "Sempre cumprimente pelo nome assim que entrar na conversa",
				field: "voiceTone",
			},
		);
		expect(result.valid).toBe(false);
		expect(
			result.violations.some((v) => /save_contact_name|cumpriment/i.test(v)),
		).toBe(true);
	});
});

describe("executeProposePatch — validações server-side", () => {
	it("rejeita personaVersionSeen stale", async () => {
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual",
				rationale: "x",
				personaVersionSeen: 3,
			},
			makeBaseCtx({ personaVersion: 5 }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/vers[ãa]o.*stale|version=3/i);
		}
	});

	it("rejeita voiceTone com before que não bate com row atual", async () => {
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "tom errado que não está no row",
				after: "casual",
				rationale: "x",
				personaVersionSeen: 1,
			},
			makeBaseCtx(),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/before.*não bate/i);
		}
	});

	it("rejeita voiceTone com frase proibida no after", async () => {
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual, e sempre cumprimente pelo nome assim que entrar",
				rationale: "x",
				personaVersionSeen: 1,
			},
			makeBaseCtx(),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/save_contact_name|cumpriment/i);
		}
	});

	it("rejeita example.add cujo assistantResponse contém frase proibida", async () => {
		const result = await executeProposePatch(
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
			makeBaseCtx(),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/vamos achar/i);
		}
	});

	it("aceita patch voiceTone válido", async () => {
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual, próximo, fala como amigo no zap",
				rationale: "admin pediu menos formal",
				personaVersionSeen: 1,
			},
			makeBaseCtx(),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.patch.kind).toBe("voiceTone");
		}
	});

	it("aceita patch example.add limpo", async () => {
		const result = await executeProposePatch(
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
			makeBaseCtx(),
		);
		expect(result.ok).toBe(true);
	});

	it("aceita example.remove sem validar conteúdo (não há after pra validar)", async () => {
		const result = await executeProposePatch(
			{
				kind: "example.remove",
				targetId: "550e8400-e29b-41d4-a716-446655440000",
				rationale: "removendo exemplo redundante",
				personaVersionSeen: 1,
			},
			makeBaseCtx(),
		);
		expect(result.ok).toBe(true);
	});
});
