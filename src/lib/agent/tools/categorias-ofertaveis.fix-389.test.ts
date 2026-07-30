// FIX-389 — o agente não pode CONVIDAR o cliente pra um segmento que ele não
// vende.
//
// Rodada 2026-07-29 (grupo AJA AGORA + Twobrains, 22/07 18:32-18:42). O
// Bernardo pediu pra esposa testar como leiga:
//
//   Bernardo → "Ela simulou uma carta de serviços. Acho que não deveríamos
//               oferecer essa modalidade."
//   Bruna    → "Não mesmo… não estava habilitado. Só imóvel, auto e moto"
//   Bernardo → "Aí o agente disse que teve problema na integração"
//   Kairo    → "as opcoes foram removidas mas ele continuava no escritorio"
//
// Os dois sintomas têm UMA raiz. Os schemas das tools já são allowlist correta
// (`z.enum(["imovel","auto","moto"])`), mas a DESCRIÇÃO da `search_groups` dizia
// ao modelo: "Use quando o usuario mencionar o que quer comprar (carro, casa,
// servico)". A descrição é contexto de decisão do modelo tanto quanto o schema:
// convidado a tentar `servico`, ele tenta, o schema recusa, e a falha de
// validação chega ao cliente como "tive um problema na integração" — erro cru
// de infraestrutura numa conversa de venda.
//
// O invariante é de ALLOWLIST (lei 2 de arquitetura de agentes): a fronteira do
// que existe se declara UMA vez e vale pros dois lados — schema E descrição.
// Este teste varre as descrições reais das tools, então não há como reintroduzir
// um segmento morto num texto de prompt sem a suíte apontar.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { consorcioTools } from "./ai-sdk";

/** As únicas categorias que o produto vende. Espelha o `z.enum` dos schemas
 * (`schemas.ts:35`, `ai-sdk.ts:51/146/318/889/945`). */
const CATEGORIAS_VENDIDAS = ["imovel", "auto", "moto"] as const;

/** Palavras que um cliente usaria pra pedir um segmento que NÃO existe aqui.
 * Se alguma aparecer numa descrição de tool, o modelo é convidado a tentar. */
const SEGMENTOS_MORTOS = [
	"servico",
	"serviço",
	"serviços",
	"servicos",
	"pesado", // caminhão/máquina pesada — nunca foi habilitado
	"náutico",
	"nautico",
	"aeronave",
];

function descricoes(): Array<{ tool: string; description: string }> {
	return Object.entries(consorcioTools as Record<string, { description?: string }>).map(
		([tool, def]) => ({ tool, description: def.description ?? "" }),
	);
}

describe("FIX-389 — descrição de tool não oferece segmento que o produto não vende", () => {
	it("nenhuma descrição de tool menciona um segmento morto", () => {
		const infratores = descricoes().flatMap(({ tool, description }) => {
			const d = description.toLowerCase();
			return SEGMENTOS_MORTOS.filter((s) => d.includes(s)).map((s) => `${tool}: "${s}"`);
		});
		expect(infratores).toEqual([]);
	});

	// A descrição de tool não era a única porta. A saudação do concierge
	// (few-shot em `system-prompt.ts`) anunciava "imóvel, automóvel ou serviços"
	// — e few-shot o modelo IMITA. Era essa a porta que o Kairo descreveu como
	// "as opções foram removidas mas ele continuava no escritório".
	it.each(["src/lib/agent/system-prompt.ts", "src/lib/agent/orchestrator/directives.ts"])(
		"nenhuma copy de produção em %s oferece segmento morto ao cliente",
		(arquivo) => {
			// Varre a FONTE (sem comentários): a saudação vive num const não-exportado,
			// então inspecionar o módulo importado não a alcança. Comentários são
			// removidos de propósito — este próprio repo documenta os segmentos mortos
			// em comentário, e isso é desejável.
			const semComentarios = readFileSync(resolve(process.cwd(), arquivo), "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, " ")
				.replace(/(^|[^:])\/\/.*$/gm, "$1")
				.toLowerCase();
			const achados = SEGMENTOS_MORTOS.filter((s) => semComentarios.includes(s));
			expect(achados).toEqual([]);
		},
	);

	it("a search_groups continua explicando QUANDO usar (o fix não pode cegar o modelo)", () => {
		// Remover a enumeração não pode virar "descrição vazia": o modelo precisa
		// saber quando chamar a busca. Se esta asserção cair, o fix foi longe
		// demais e o agente para de buscar oferta.
		const busca = descricoes().find((d) => d.tool === "search_groups");
		expect(busca).toBeDefined();
		expect(busca?.description.length).toBeGreaterThan(80);
		expect(busca?.description.toLowerCase()).toMatch(/credito|crédito/);
	});

	it("as categorias vendidas seguem citáveis (nada de descrição genérica demais)", () => {
		const busca = descricoes().find((d) => d.tool === "search_groups");
		const d = (busca?.description ?? "").toLowerCase();
		// Pelo menos uma das categorias reais tem que aparecer, pra o modelo saber
		// que a busca é por categoria de BEM.
		expect(
			CATEGORIAS_VENDIDAS.some((c) => d.includes(c) || d.includes("carro") || d.includes("casa")),
		).toBe(true);
	});
});
