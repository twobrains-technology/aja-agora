import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INSIGHTS_SYSTEM_PROMPT } from "@/lib/admin/insights-prompt";
import { buildMesaCopilotPrompt } from "./mesa-copilot/system-prompt";
import * as directives from "./orchestrator/directives";
import {
	buildConciergePrompt,
	buildSpecialistPrompt,
	contractClosedSection,
	type PersonaRow,
	SPECIALIST_BASE_PROMPT,
	SYSTEM_PROMPT,
	type WhatsappOptinStage,
	whatsappOptinSection,
} from "./system-prompt";
import { BASE_SYSTEM_INSTRUCTION } from "./turn-analyzer";

/**
 * Bug: aplicação inteira (agente + UI) escrita sem acentuação.
 * O agente espelha a ortografia do system prompt, então respondia sem acento.
 * Fix: regra dura explícita de ortografia no prompt + limpeza do texto (UI + prompts).
 *
 * Camada 1 (structural):
 *  (a) o prompt INSTRUI acentuação correta;
 *  (b) o texto de UI visível (.tsx) não contém palavras PT-BR sem acento;
 *  (c) FIX-73: o CORPO dos prompts do agente (.ts) — importados como STRING —
 *      não contém palavras PT-BR sem acento. Importar o valor (e não varrer o
 *      arquivo cru) evita falso-positivo em identificadores/nomes de tool.
 */

// Palavras que SEMPRE levam acento em PT-BR — varredura de TEXTO JSX visível (.tsx).
// "imovel"/"automovel" entram aqui (prosa de UI). Verbos ambíguos curtos
// (nao/ja/sao/esta) ficam FORA do .tsx pra não casar fragmentos de JSX.
const FORBIDDEN_UI = [
	"voce",
	"consorcio",
	"simulacao",
	"recomendacao",
	"contemplacao",
	"credito",
	"informacoes",
	"servico",
	"disponivel",
	"periodo",
	"analise",
	"relatorio",
	"configuracao",
	"aprovacao",
	"orcamento",
	"obrigatorio",
	"comecar",
	"formulario",
	"imovel",
	"automovel",
	// FIX-73 — ampliação (admin UI: "Visao geral", "Conversao", "operacao"…)
	"visao",
	"conversao",
	"operacao",
	"decisao",
	"opcao",
	"opcoes",
	"numero",
	"historico",
	"possivel",
	"tambem",
];

// Varredura do CORPO dos prompts do agente (strings .ts). Superset da UI, MAIS
// os verbos/advérbios inequívocos (nao/ja/ate/so/sera/sao) — seguros aqui porque
// a string já é texto de prompt, não código. NÃO inclui "imovel"/"servico(s)":
// nos prompts esses tokens funcionam como IDENTIFICADOR de categoria
// (category="imovel", "auto/imovel/moto/servicos") — acentuação de "imóvel" em
// prosa de prompt é cirúrgica e revisada à mão, não guardada aqui (evita
// falso-positivo no valor técnico).
const FORBIDDEN_PROMPT = [
	"voce",
	"consorcio",
	"simulacao",
	"simulacoes",
	"recomendacao",
	"recomendacoes",
	"contemplacao",
	"credito",
	"informacao",
	"informacoes",
	"disponivel",
	"disponiveis",
	"periodo",
	"relatorio",
	"configuracao",
	"aprovacao",
	"orcamento",
	"obrigatorio",
	"obrigatoria",
	"comecar",
	"formulario",
	"automovel",
	"visao",
	"conversao",
	"operacao",
	"decisao",
	"decisoes",
	"opcao",
	"opcoes",
	"numero",
	"numeros",
	"historico",
	"possivel",
	"tambem",
	"intencao",
	"duvida",
	"duvidas",
	"experiencia",
	"qualificacao",
	"proxima",
	"proximo",
	"proximas",
	"proximos",
	"mecanica",
	"reacao",
	"transicao",
	"excecao",
	"excecoes",
	"secao",
	"secoes",
	"mencao",
	"mencoes",
	"instrucao",
	"instrucoes",
	"padrao",
	"basico",
	"basica",
	"tecnico",
	"tecnica",
	"tecnicos",
	"pratico",
	"pratica",
	"generico",
	"generica",
	"especifico",
	"especifica",
	"especificas",
	"especificos",
	"estrategia",
	"estrategica",
	"otimo",
	"otima",
	"ola",
	"robo",
	"paragrafo",
	"paragrafos",
	"confortavel",
	"sugestao",
	"atencao",
	"condicao",
	"posicao",
	"proprio",
	"propria",
	"proprios",
	"proprias",
	"calculo",
	"referencia",
	"sequencia",
	"criterio",
	"criterios",
	"usuario",
	"usuarios",
	"sao",
	"nao",
	"ja",
	"ate",
	"so",
	"sera",
];

// Mock mínimo de persona — campos lidos pelos builders. voiceTone neutro (sem
// palavras da blocklist) pra não poluir a varredura.
const MOCK_ROW = {
	id: "auto",
	displayName: "Helena",
	role: "specialist",
	category: "auto",
	expertise: null,
	voiceTone: "Voz calorosa, frases curtas, sem bordões.",
	examples: [],
	temperature: 0.7,
	activeCampaigns: [],
	handoffTriggers: [],
	forbiddenTopics: [],
	activeTools: [],
	isActive: true,
	version: 1,
	createdAt: new Date(0),
	updatedAt: new Date(0),
} as unknown as PersonaRow;

const WHATSAPP_STAGES: WhatsappOptinStage[] = ["locked", "open", "confirm", "done"];

// Marcadores literais parseados/casados pelo código — preservados SEM acento
// (consistência com a fonte que os gera/casa). Removidos antes da varredura.
//  - "Nome do usuario:" → system message injetada em system-context.ts:13 e
//    orchestrator/index.ts:172; lida pelo LLM. Acentuar só um lado quebraria o
//    pareamento, então fica sem acento nos dois.
function stripInternalMarkers(text: string): string {
	return (
		text
			// system message de nome (marcador interno)
			.replace(/Nome do usuario/g, "Nome do __marker__")
			// inputs simulados de exemplo: <user_message>…</user_message>
			.replace(/<user_message>[\s\S]*?<\/user_message>/g, " ")
			// instruções/anotações internas entre colchetes: [sistema …], [usuario …],
			// [chame …], [finish sem tool], [orquestrador …] — nunca texto ao usuário.
			.replace(/\[[^\]]*\]/g, " ")
	);
}

function collectOffenders(label: string, raw: string, offenders: string[]): void {
	const text = stripInternalMarkers(raw);
	for (const word of FORBIDDEN_PROMPT) {
		const re = new RegExp(`\\b${word}\\b`, "gi");
		const matches = text.match(re);
		if (matches) offenders.push(`${label}: "${word}" (${matches.length}x)`);
	}
}

describe("regressão: acentuação", () => {
	it("SYSTEM_PROMPT exige acentuação correta em português", () => {
		expect(SYSTEM_PROMPT.toLowerCase()).toContain("acentua");
	});

	it("SPECIALIST_BASE_PROMPT exige acentuação correta em português", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toContain("acentua");
	});

	it("texto de UI visível (.tsx) não contém palavras PT-BR sem acento", () => {
		const pattern = new RegExp(`>[^<>{}]*\\b(${FORBIDDEN_UI.join("|")})\\b[^<>{}]*<`, "i");
		const root = join(__dirname, "..", "..");
		const offenders: string[] = [];
		// readdirSync recursivo (tipado no @types/node 20) — node:fs/promises.glob
		// é Node 22, não tipado aqui. Filtra .tsx visível, fora de node_modules/.test.tsx.
		const files = readdirSync(root, { recursive: true, encoding: "utf8" });
		for (const file of files) {
			if (!file.endsWith(".tsx") || file.endsWith(".test.tsx") || file.includes("node_modules")) {
				continue;
			}
			const content = readFileSync(join(root, file), "utf8");
			for (const line of content.split("\n")) {
				if (pattern.test(line)) offenders.push(`${file}: ${line.trim()}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("FIX-73: corpo dos prompts do agente (.ts) não contém palavras PT-BR sem acento", () => {
		const offenders: string[] = [];

		// system-prompt.ts — const + builders (cobre template, base, exemplos,
		// renderers de campanha/compliance/handoff, dynamic por expertise).
		collectOffenders("SYSTEM_PROMPT", SYSTEM_PROMPT, offenders);
		for (const expertise of ["leigo", "expert", "neutro"] as const) {
			const blocks = buildSpecialistPrompt(MOCK_ROW, expertise);
			collectOffenders(`buildSpecialistPrompt.stable[${expertise}]`, blocks.stable, offenders);
			collectOffenders(`buildSpecialistPrompt.dynamic[${expertise}]`, blocks.dynamic, offenders);
		}
		const concierge = buildConciergePrompt(MOCK_ROW);
		collectOffenders("buildConciergePrompt.stable", concierge.stable, offenders);
		for (const stage of WHATSAPP_STAGES) {
			collectOffenders(`whatsappOptinSection[${stage}]`, whatsappOptinSection(stage), offenders);
		}
		collectOffenders(
			"contractClosedSection",
			contractClosedSection({
				administradora: "Adm",
				grupo: "123",
				creditValue: 100000,
				monthlyPayment: 1000,
				proposalStatus: "documentos",
			}) || "",
			offenders,
		);

		// turn-analyzer.ts (instrução base) + insights-prompt.ts + mesa-copilot.
		collectOffenders("BASE_SYSTEM_INSTRUCTION", BASE_SYSTEM_INSTRUCTION, offenders);
		collectOffenders("INSIGHTS_SYSTEM_PROMPT", INSIGHTS_SYSTEM_PROMPT, offenders);
		const mesa = buildMesaCopilotPrompt({ administradoraNome: "Adm", docs: [] });
		collectOffenders("mesaCopilot.stable", mesa.stable, offenders);
		collectOffenders("mesaCopilot.dynamic", mesa.dynamic, offenders);

		// orchestrator/directives.ts — chama cada builder com args neutros; o
		// texto ESTÁTICO (não as interpolações) é o que importa pra varredura.
		const directiveTexts = [
			directives.buildTransitionFirstContactDirective("auto", ""),
			directives.buildTransitionReturningDirective(),
			directives.buildTransitionCrossSpecialistDirective(),
			directives.buildNameCapturedDirective("Kairo"),
			directives.buildExperienceFirstDirective("Primeira vez"),
			directives.buildExperienceReturningDirective("Já fiz"),
			directives.buildExperienceDoubtsDirective("Tenho dúvidas"),
			directives.buildQualifyStartYesDirective(),
			directives.buildQualifyStartMoreDirective(),
			directives.buildPlanReactionDirective({
				assetLabel: "Carro",
				intent: "parcela",
				targetMonth: 12,
				lanceLabel: "R$ 10 mil",
			}),
			directives.buildPlanReactionDirective({ assetLabel: "Carro", intent: "rapido" }),
			directives.buildPlanReactionDirective({ assetLabel: "Carro", intent: "lance" }),
			directives.buildCreditReactionDirective("faixa X"),
			directives.buildTimeframeReactionDirective("prazo X"),
			directives.buildLanceReactionDirective("sim"),
			directives.buildGroupSelectedDirective("Adm", "gid", 100000, 60),
			directives.buildSimulateDirective("Adm", "gid", 100000),
			directives.buildWhatIfDirective("Adm", 100000),
			directives.buildAdjustValueDirective({ administradora: "Adm", currentCreditValue: 100000 }),
			directives.buildAdvanceToContractDirective({ administradora: "Adm" }),
			directives.buildSimulationInterestDirective("Adm"),
			directives.buildDetailDirective("gid"),
			directives.buildRangePickerDirective("Automóvel", "auto", "creditMax=100000", "1.000"),
			// biome-ignore lint/suspicious/noExplicitAny: meta de teste neutro
			directives.buildSearchSummaryDirective({
				category: "auto",
				meta: {
					experiencePrev: "first",
					qualifyAnswers: {
						creditMin: 100000,
						creditMax: 200000,
						monthlyBudget: 1000,
						prazoMeses: 24,
						hasLance: "yes",
					},
				},
				// biome-ignore lint/suspicious/noExplicitAny: shape de teste
			} as any),
			directives.buildSimulatorDialDirective({ administradora: "Adm" }),
			directives.buildDecisionPromptDirective({ administradora: "Adm" }),
		];
		collectOffenders("directives", directiveTexts.join("\n"), offenders);

		expect(offenders).toEqual([]);
	});
});
