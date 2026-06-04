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

function makeCtx(over: Partial<Parameters<typeof buildAssistantTools>[0]> = {}) {
	return buildAssistantTools({
		personaId: "p1",
		personaVersion: 1,
		role: "specialist",
		category: "auto",
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
	over: Partial<Parameters<typeof executeProposePatch>[1]> = {},
): Parameters<typeof executeProposePatch>[1] {
	return {
		personaId: "p1",
		personaVersion: over.personaVersion ?? 1,
		role: "specialist",
		category: "auto",
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
		const result = await execTool<{ question: string }>(tools.ask_clarification.execute, {
			question: "Menos formal igual amigo no zap, ou só menos técnico?",
		});
		expect(result.question).toMatch(/menos formal/i);
	});
});

type ValidateResult = { valid: boolean; violations: string[] };

describe("validate_against_rules", () => {
	it("aceita texto limpo", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(tools.validate_against_rules.execute, {
			text: "casual, próximo, fala como amigo no zap",
			field: "voiceTone",
		});
		expect(result.valid).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("detecta frase proibida 'Vamos achar a opção certa'", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(tools.validate_against_rules.execute, {
			text: "Vamos achar a opção certa pra você",
			field: "voiceTone",
		});
		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => /vamos achar/i.test(v))).toBe(true);
	});

	it("detecta vazamento de raciocínio 'Motivo:'", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(tools.validate_against_rules.execute, {
			text: "Vou te conectar com humano. Motivo: valor acima do teto.",
			field: "example.assistantResponse",
		});
		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => /Motivo/i.test(v))).toBe(true);
	});

	it("detecta voiceTone que instrui cumprimentar antes da tool", async () => {
		const tools = makeCtx();
		const result = await execTool<ValidateResult>(tools.validate_against_rules.execute, {
			text: "Sempre cumprimente pelo nome assim que entrar na conversa",
			field: "voiceTone",
		});
		expect(result.valid).toBe(false);
		expect(result.violations.some((v) => /save_contact_name|cumpriment/i.test(v))).toBe(true);
	});
});

describe("executeProposePatch — validações server-side", () => {
	it("rejeita personaVersionSeen stale (snapshot)", async () => {
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

	it("anti-race: refreshVersion sobrescreve ctx.personaVersion no momento do propose_patch (Gap A round 2)", async () => {
		// Simula: POST inicia com persona.version=5 (snapshot ctx). LLM
		// stream demora 30s. Durante esse tempo, outro admin PATCH bumpou
		// pra version=6 no DB. refreshVersion DEVE detectar e rejeitar.
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual",
				rationale: "x",
				personaVersionSeen: 5,
			},
			makeBaseCtx({
				personaVersion: 5,
				refreshVersion: async () => 6, // outro admin bumpou
			}),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/outro admin|releia/i);
		}
	});

	it("anti-race: refreshVersion confirma version igual à do ctx → aceita", async () => {
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "formal e técnico",
				after: "casual mas profissional",
				rationale: "x",
				personaVersionSeen: 5,
			},
			makeBaseCtx({
				personaVersion: 5,
				refreshVersion: async () => 5, // nada mudou no DB
			}),
		);
		expect(result.ok).toBe(true);
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

	it("rejeita example.remove com targetId que não existe (A-03)", async () => {
		const result = await executeProposePatch(
			{
				kind: "example.remove",
				targetId: "550e8400-e29b-41d4-a716-446655440000",
				rationale: "removendo exemplo redundante",
				personaVersionSeen: 1,
			},
			makeBaseCtx(), // examples: []
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/n[ãa]o.*existe|inexistente|n[ãa]o encontrad/i);
		}
	});

	it("aceita example.remove quando targetId existe no row", async () => {
		const result = await executeProposePatch(
			{
				kind: "example.remove",
				targetId: "550e8400-e29b-41d4-a716-446655440000",
				rationale: "removendo exemplo redundante",
				personaVersionSeen: 1,
			},
			makeBaseCtx({
				currentRow: {
					voiceTone: "formal e técnico",
					examples: [
						{
							id: "550e8400-e29b-41d4-a716-446655440000",
							userMessage: "exemplo",
							assistantResponse: "resposta",
						},
					],
					forbiddenTopics: [],
					handoffTriggers: [],
				},
			}),
		);
		expect(result.ok).toBe(true);
	});

	it("rejeita forbiddenTopic.add com tópico canônico do funil (A-01)", async () => {
		const canonicos = [
			"consórcio",
			"consorcio",
			"simulação",
			"carta de crédito",
			"parcela",
			"lance",
			"contemplação",
		];
		for (const topic of canonicos) {
			const result = await executeProposePatch(
				{
					kind: "forbiddenTopic.add",
					after: {
						id: "ft-1",
						topic,
						responseWhenAsked: "não falo disso",
						enabled: true,
					},
					rationale: "x",
					personaVersionSeen: 1,
				},
				makeBaseCtx(),
			);
			expect(
				result.ok,
				`forbiddenTopic com topic="${topic}" deveria ser rejeitado (tópico canônico do funil)`,
			).toBe(false);
		}
	});

	it("aceita forbiddenTopic.add com tópico fora do funil (comissão, concorrência)", async () => {
		const result = await executeProposePatch(
			{
				kind: "forbiddenTopic.add",
				after: {
					id: "ft-2",
					topic: "comissão de corretor",
					responseWhenAsked: "Não trabalho com corretagem. Sou agente direto.",
					enabled: true,
				},
				rationale: "evitar pergunta de comissão",
				personaVersionSeen: 1,
			},
			makeBaseCtx(),
		);
		expect(result.ok).toBe(true);
	});

	it("rejeita handoffTrigger.add com condition fraca (palavra-chave única) (A-02)", async () => {
		const fracos = ["ajuda", "dúvida", "duvida", "usuário disse 'ajuda'", "user fala 'dúvida'"];
		for (const condition of fracos) {
			const result = await executeProposePatch(
				{
					kind: "handoffTrigger.add",
					after: { id: "ht-1", condition, enabled: true },
					rationale: "x",
					personaVersionSeen: 1,
				},
				makeBaseCtx(),
			);
			expect(
				result.ok,
				`handoffTrigger condition="${condition}" deveria ser rejeitado (palavra fraca)`,
			).toBe(false);
		}
	});

	it("aceita handoffTrigger.add com condition explícita de pedido humano", async () => {
		const result = await executeProposePatch(
			{
				kind: "handoffTrigger.add",
				after: {
					id: "ht-2",
					condition: "usuário pede explicitamente falar com pessoa ou consultor humano",
					enabled: true,
				},
				rationale: "trigger explícito",
				personaVersionSeen: 1,
			},
			makeBaseCtx(),
		);
		expect(result.ok).toBe(true);
	});

	it("rejeita example.add em persona concierge cujo assistantResponse cita valor de parcela (CA-33)", async () => {
		const result = await executeProposePatch(
			{
				kind: "example.add",
				after: {
					id: "ex-conc-1",
					userMessage: "Qual a parcela?",
					assistantResponse: "Esse grupo tem parcela de R$ 850 e crédito de R$ 80.000.",
				},
				rationale: "exemplo com valor",
				personaVersionSeen: 1,
			},
			makeBaseCtx({ role: "concierge", category: null }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/concierge.*(valor|parcela|R\$)/i);
		}
	});

	it("aceita example.add em persona concierge sem citar valor", async () => {
		const result = await executeProposePatch(
			{
				kind: "example.add",
				after: {
					id: "ex-conc-2",
					userMessage: "Quero comprar um carro",
					assistantResponse:
						"Boa! Vou te encaminhar pro especialista de auto pra te mostrar as opções.",
				},
				rationale: "exemplo concierge encaminhando",
				personaVersionSeen: 1,
			},
			makeBaseCtx({ role: "concierge", category: null }),
		);
		expect(result.ok).toBe(true);
	});

	it("rejeita example.add em specialist auto cujo assistantResponse menciona imóvel (CA-34)", async () => {
		const result = await executeProposePatch(
			{
				kind: "example.add",
				after: {
					id: "ex-auto-x",
					userMessage: "Tenho dúvida sobre apartamento",
					assistantResponse: "Pra imóvel você pode pegar um consórcio de R$ 300k em 180 meses.",
				},
				rationale: "exemplo cruzado errado",
				personaVersionSeen: 1,
			},
			makeBaseCtx({ role: "specialist", category: "auto" }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/auto.*im[óo]vel|categoria/i);
		}
	});

	it("aceita example.add em specialist auto que fala só de auto", async () => {
		const result = await executeProposePatch(
			{
				kind: "example.add",
				after: {
					id: "ex-auto-ok",
					userMessage: "Quero um SUV",
					assistantResponse:
						"Boa escolha. Tenho opções de SUV compacto e médio nas faixas de crédito que cabem no seu perfil.",
				},
				rationale: "exemplo auto",
				personaVersionSeen: 1,
			},
			makeBaseCtx({ role: "specialist", category: "auto" }),
		);
		expect(result.ok).toBe(true);
	});
});
