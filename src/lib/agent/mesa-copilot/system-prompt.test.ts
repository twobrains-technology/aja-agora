import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMesaCopilotPrompt } from "./system-prompt";

// ============================================================================
// FIX-67 — Camada 1 (structural): o builder do copiloto de mesa injeta o
// texto_extraido do(s) PDF(s) da administradora certa no system prompt, marca
// o bloco do manual como o bloco STABLE (cacheável) e carrega a persona que
// NÃO vaza stack/meta. Spec: docs/visao/mesa-de-operacao.md §5 + DEC-C.
// ============================================================================

const CANOPUS_MANUAL =
	"MANUAL CANOPUS — para contratar: 1) acesse o portal do parceiro; 2) selecione o grupo; " +
	"3) preencha CPF e dados do cliente; 4) confirme a carta de crédito; 5) gere o boleto da adesão.";

const RODOBENS_TABELA =
	"TABELA RODOBENS — taxa de administração 18%, fundo de reserva 2%, seguro prestamista opcional.";

function buildCanopus(overrides = {}) {
	return buildMesaCopilotPrompt({
		administradoraNome: "Canopus",
		docs: [{ titulo: "Manual de contratação", tipo: "manual", textoExtraido: CANOPUS_MANUAL }],
		grupo: "1234",
		creditValue: "80000",
		monthlyPayment: "950",
		termMonths: 80,
		clienteNome: "Helena Souza",
		...overrides,
	});
}

describe("FIX-67 builder — injeção do manual da administradora no system prompt", () => {
	it("injeta o texto_extraido do PDF no bloco STABLE (full-text, DEC-C)", () => {
		const { stable } = buildCanopus();
		expect(stable).toContain(CANOPUS_MANUAL);
	});

	it("injeta o manual da administradora CERTA — não vaza o de outra", () => {
		const { stable } = buildMesaCopilotPrompt({
			administradoraNome: "Rodobens",
			docs: [{ titulo: "Tabela", tipo: "tabela", textoExtraido: RODOBENS_TABELA }],
		});
		expect(stable).toContain(RODOBENS_TABELA);
		expect(stable).not.toContain(CANOPUS_MANUAL);
		expect(stable).toContain("Rodobens");
	});

	it("multi-doc: concatena TODOS os docs com texto, cada um rotulado", () => {
		const { stable } = buildMesaCopilotPrompt({
			administradoraNome: "Canopus",
			docs: [
				{ titulo: "Manual de contratação", tipo: "manual", textoExtraido: CANOPUS_MANUAL },
				{ titulo: "Tabela de taxas", tipo: "tabela", textoExtraido: RODOBENS_TABELA },
			],
		});
		expect(stable).toContain(CANOPUS_MANUAL);
		expect(stable).toContain(RODOBENS_TABELA);
		expect(stable).toContain("Manual de contratação");
		expect(stable).toContain("Tabela de taxas");
	});

	it("doc sem texto_extraido (PDF não processado) é PULADO — não injeta vazio", () => {
		const { stable } = buildMesaCopilotPrompt({
			administradoraNome: "Canopus",
			docs: [
				{ titulo: "Manual", tipo: "manual", textoExtraido: CANOPUS_MANUAL },
				{ titulo: "Anexo pendente", tipo: "outro", textoExtraido: null },
			],
		});
		expect(stable).toContain(CANOPUS_MANUAL);
		// O título do doc sem texto não entra (não há seção vazia)
		expect(stable).not.toContain("Anexo pendente");
	});

	it("administradora SEM nenhum doc com texto → bloco diz explicitamente que não há manual", () => {
		const { stable } = buildMesaCopilotPrompt({
			administradoraNome: "Embracon",
			docs: [],
		});
		expect(stable.toLowerCase()).toMatch(/nenhum manual|sem manual|não há manual|nao ha manual/);
		// E não trava — ainda monta a persona
		expect(stable.toLowerCase()).toContain("copiloto");
	});
});

describe("FIX-67 builder — dados do caso no bloco DYNAMIC (volátil, fora do cache)", () => {
	it("cota/oferta escolhida e cliente vão no bloco dynamic", () => {
		const { dynamic } = buildCanopus();
		expect(dynamic).toContain("Helena Souza");
		expect(dynamic).toContain("1234");
		// crédito e parcela formatados/presentes
		expect(dynamic).toMatch(/80\.?000|80000/);
		expect(dynamic).toMatch(/950/);
		expect(dynamic).toMatch(/80\s*meses|80 meses/);
	});

	it("o manual NÃO vaza pro dynamic (fica só no stable cacheável)", () => {
		const { dynamic } = buildCanopus();
		expect(dynamic).not.toContain(CANOPUS_MANUAL);
	});
});

describe("FIX-67 builder — persona inviolável: orienta o atendente, não vaza stack/meta", () => {
	it("a persona deixa claro que orienta o ATENDENTE, não fala com o cliente", () => {
		const { stable } = buildCanopus();
		const low = stable.toLowerCase();
		expect(low).toContain("atendente");
		expect(low).toMatch(/n[ãa]o (fala|fale|se dirij|conversa).{0,20}cliente|cliente final/);
	});

	it("a persona PROÍBE expor stack trace / erro técnico / detalhe de implementação", () => {
		const { stable } = buildCanopus();
		const low = stable.toLowerCase();
		expect(low).toMatch(/stack trace|erro t[ée]cnico|mensagem de erro/);
		expect(low).toMatch(/nunca|n[ãa]o exponha|proibido/);
	});

	it("a persona PROÍBE narrar o mecanismo do sistema (meta-narrativa)", () => {
		const { stable } = buildCanopus();
		const low = stable.toLowerCase();
		expect(low).toMatch(/mecanismo|meta-?narrat|o sistema vai/);
	});

	it("a persona fixa resposta em português do Brasil", () => {
		const { stable } = buildCanopus();
		expect(stable.toLowerCase()).toMatch(/portugu[êe]s/);
	});
});

describe("FIX-67 builder — cache do manual (anti-regressão de prompt caching)", () => {
	it("index.ts aplica cacheControl ephemeral no bloco STABLE do copiloto", () => {
		const src = readFileSync("src/lib/agent/mesa-copilot/index.ts", "utf-8");
		expect(src).toMatch(/anthropic:\s*\{\s*cacheControl:\s*\{\s*type:\s*"ephemeral"/);
		// O cacheControl fica no bloco stable (não no dynamic).
		expect(src).toMatch(/content:\s*stable[\s\S]{0,160}cacheControl/);
	});

	it("o runner NÃO expõe tools ao copiloto (Q&A puro, sem tool calling)", () => {
		const src = readFileSync("src/lib/agent/mesa-copilot/index.ts", "utf-8");
		// streamText do copiloto não passa `tools:` — orientação textual pura.
		expect(src).not.toMatch(/\btools:\s*\{/);
	});
});
