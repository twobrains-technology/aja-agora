// ── B9 — Golden set como DATASET no Langfuse ─────────────────────────────
//
// Seed idempotente do dataset único de eval (`aja-agora-eval`) na instância
// Langfuse, via REST (`/api/public/datasets` + `/api/public/datasets/<name>/items`).
// 1 item = 1 conversa simulada inteira:
//   · `input`           = abertura + perfil JSON;
//   · `expected_output` = invariantes de trajetória (o que a conversa TEM que cumprir);
//   · `metadata`        = perfil / administradora / anúncio (filtro na UI e no runner).
//
// Fonte dos itens:
//   · os 4 perfis base da simulação (P12) lidos de
//     `src/lib/playground/simulacao/perfis-de-cliente.ts`;
//   · os 8 perfis derivados de produção real de D-0081
//     (`dataset-seed.md`, conversas 20/10–04/11/2026, is_simulated=false).
//
// Idempotência: cada item tem id determinístico (`aja-<slug>`); o POST com id
// existente UPSERT (documentação Langfuse: "If an ID is provided, it updates the
// existing item") — re-run nunca duplica.
//
//   pnpm tsx scripts/eval/dataset-seed.ts
//
// Credenciais: `LANGFUSE_BASE_URL`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`
// do ambiente; ausentes, caem no vault (`secrets.sh get-key aja-agora …`) —
// nunca em arquivo versionado. Sem nenhuma das duas fontes: erro claro, sem seed.

import "../_env-host";

import { execFileSync } from "node:child_process";
import type { PerfilDeCliente } from "../../src/lib/playground/simulacao/tipos";
import { PERFIS_DE_CLIENTE } from "../../src/lib/playground/simulacao/perfis-de-cliente";

const NOME_DO_DATASET = "aja-agora-eval";
const DESCRICAO =
	"Aja Agora — golden set de conversas simuladas (B9/D-0081). 1 item = 1 conversa inteira: input = abertura + perfil; expected_output = invariantes de trajetória; metadata = perfil/administradora/anúncio. Filtrável por metadata.";

const CHAVES = ["LANGFUSE_BASE_URL", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"] as const;

type Credenciais = { baseUrl: string; publicKey: string; secretKey: string; origem: string };
const chavesDoCofre: Record<(typeof CHAVES)[number], string> = {
	LANGFUSE_BASE_URL: "LANGFUSE_BASE_URL",
	LANGFUSE_PUBLIC_KEY: "LANGFUSE_PUBLIC_KEY",
	LANGFUSE_SECRET_KEY: "LANGFUSE_SECRET_KEY",
};
const chavesDoValor: Record<(typeof CHAVES)[number], keyof Omit<Credenciais, "origem">> = {
	LANGFUSE_BASE_URL: "baseUrl",
	LANGFUSE_PUBLIC_KEY: "publicKey",
	LANGFUSE_SECRET_KEY: "secretKey",
};

type ChaveEnv = (typeof CHAVES)[number];

function doVault(cofre: string, chave: string): string | null {
	try {
		const valor = execFileSync("secrets.sh", ["get-key", cofre, chave], {
			encoding: "utf8",
		}).trim();
		return valor || null;
	} catch {
		return null;
	}
}

/** Nome de serviço da tb-local-net (`tb-langfuse-web`) não resolve do Mac;
 *  o OrbStack resolve o sufixo `.orb.local`. Mesma tradução de
 *  `scripts/_env-host.ts`, aplicada à URL que veio do vault (o `_env-host`
 *  só traduz o que já estava no env no momento do import). */
function paraHost(url: string): string {
	try {
		const u = new URL(url);
		if (u.hostname.includes(".") || u.hostname === "localhost") return url;
		u.hostname = `${u.hostname}.orb.local`;
		return u.toString().replace(/\/$/, "");
	} catch {
		return url;
	}
}

/** Candidatas, na ordem: ambiente → vault `aja-agora` (LANGFUSE_* locais) →
 *  vault `pi-agentes-aja-langfuse` (instância AWS — a que os traces de produção
 *  usam; medida em 05/11/2026: aceita credenciais, a instância local rejeita). */
function candidatas(): Credenciais[] {
	const montadas: Credenciais[] = [];
	const porOrigem = (origem: string, ler: (chave: ChaveEnv) => string | null): Credenciais | null => {
		const valores: string[] = [];
		for (const chave of CHAVES) {
			const valor = ler(chave)?.trim();
			if (!valor) return null;
			valores.push(valor);
		}
		return {
			origem,
			baseUrl: valores[0],
			publicKey: valores[1],
			secretKey: valores[2],
		} as Credenciais;
	};
	const ambiente = porOrigem("ambiente", (c) => process.env[c] ?? null);
	if (ambiente) montadas.push(ambiente);
	const aja = porOrigem("vault:aja-agora", (c) => doVault("aja-agora", chavesDoCofre[c]));
	if (aja) montadas.push(aja);
	const prod = porOrigem("vault:pi-agentes-aja-langfuse", (c) => doVault("pi-agentes-aja-langfuse", c));
	if (prod) montadas.push(prod);
	return montadas;
}

// ── itens ────────────────────────────────────────────────────────────────

type ItemDoDataset = {
	id: string;
	input: Record<string, unknown>;
	expectedOutput: Record<string, unknown>;
	metadata: Record<string, unknown>;
};

/** Item a partir de um perfil base do playground (P12). */
function itemDePerfilDoPlayground(p: PerfilDeCliente): ItemDoDataset {
	const invariantes = [
		"do primeiro ao último turno, toda resposta deixa um próximo passo para o lead (P0)",
		"a primeira resposta entrega valor — opção, comparação, número — antes de pedir dado (P1)",
		"números (carta, parcela, prazo, contemplados) vêm de ferramenta, nunca de memória (P11)",
	];
	if (p.esperaProposta)
		invariantes.push(
			"a conversa chega à proposta; o fechamento só ocorre quando o lead pede ou já gerou proposta (P5)",
		);
	if (p.esperaFila)
		invariantes.push(
			"o vendedor é chamado pelo card/fila e o agente segue conduzindo até um humano assumir (P7/P8)",
		);
	if (p.roteiro)
		invariantes.push(
			"nenhuma repetição idêntica do mesmo pedido: o toque que repete leva algo novo (P0/P3)",
		);

	// Perfil → cenários golden que exercitam o mesmo eixo (metadata, para filtro).
	const goldenPorPerfil: Partial<Record<PerfilDeCliente["id"], string[]>> = {
		"caminho-feliz": ["golden-mario-sem-lance", "golden-smoke-agente"],
		"nervoso-bugado": ["golden-dono-chato-tudo-numa-frase-so", "golden-dono-chato-nao-entendi-duas-vezes"],
		"recusa-telefone": ["golden-objecao-cpf", "golden-e-se-eu-fechar-a-tela"],
		objecao: ["golden-objecao-financiamento", "golden-objecao-quanto-tempo"],
	};

	return {
		id: `aja-${p.id}`,
		input: {
			abertura: p.abertura,
			perfil: {
				persona: p.persona,
				objetivo: p.objetivo,
				roteiro: p.roteiro ?? null,
				maxTurnos: p.maxTurnos,
			},
			esperaProposta: p.esperaProposta,
			esperaFila: p.esperaFila,
			dados: p.dados,
		},
		expectedOutput: {
			invariantes,
			sucesso: p.esperaProposta
				? "chega à proposta (objetivo-atingido)"
				: "conduz até o teto de turnos sem repetir pedido nem abandonar o lead",
		},
		metadata: {
			perfil: p.id,
			categoria: "auto",
			administradora: null,
			anuncio: null,
			canal: "web",
			fonte: "playground-perfis",
			golden: goldenPorPerfil[p.id] ?? [],
		},
	};
}

// ── perfis derivados de produção real (D-0081, dataset-seed.md) ─────────

type PerfilReal = {
	id: string;
	abertura: string;
	perfil: {
		tom: string;
		comportamento: string;
		o_que_quer: string;
	};
	categoria: "auto" | "imovel" | "moto";
	canal: "web" | "whatsapp";
	administradora: string | null;
	anuncio: string | null;
	origem_real: string;
	invariantes: string[];
	cenario_morte: string;
	golden: string[];
};

const PERFIS_REAIS: readonly PerfilReal[] = [
	{
		id: "moto-valor-card-travado",
		abertura: "Quero comprar uma moto.",
		perfil: {
			tom: "direto, curto, sem conversa",
			comportamento:
				"diz o valor na primeira resposta (R$ 25.000) e depois CESSA. Não clica no card do telefone. 'Agora não' se insistirem uma segunda vez.",
			o_que_quer:
				"saber quanto custa a parcela de uma moto de R$ 25.000 antes de dar qualquer dado",
		},
		categoria: "moto",
		canal: "web",
		administradora: null,
		anuncio: "meta→google",
		origem_real:
			"00af0dc0 (web, moto, meta→google, 04/11 16:25, em_negociacao) e a2f4eaeb (web, moto, google, 04/11 11:18)",
		invariantes: [
			"a conversa não morre (P0): se o lead não der o telefone, o agente deixa próximo passo sem repetir o mesmo pedido 2×",
			"chega à carta: a comparação pode aparecer mesmo sem o telefone (P6 — o telefone é dado de contato, não portão)",
			"não promete parcela fora da cota: números só de ferramenta",
			"cada resposta deixa o próximo passo declarado",
		],
		cenario_morte:
			"card do telefone: o lead trava exatamente quando o card telefone_do_desbloqueio aparece e nunca clica",
		golden: ["golden-e-se-eu-fechar-a-tela"],
	},
	{
		id: "imovel-viu-comparacao-sumiu",
		abertura: "Quero comprar um imóvel.",
		perfil: {
			tom: "objeções em dois cliques de quick_reply, decisivo quando decidir",
			comportamento:
				"dá o valor (R$ 100.000), clica 'Ver a minha comparação', simula uma carta (BANCO DO BRASIL — R$ 101.409) e entra em silêncio permanente. Ignora o remarketing 'Quer que eu refaça?'.",
			o_que_quer:
				"comparar administradoras de um imóvel de ~R$ 100 mil; provavelmente compara com outro canal fora do chat",
		},
		categoria: "imovel",
		canal: "web",
		administradora: "Banco do Brasil",
		anuncio: "google",
		origem_real:
			"a528bcc3 (web, imóvel, google, 04/11 18:03, telefone 81993361512, em_negociacao, 13 msgs)",
		invariantes: [
			"o vendedor conduz depois da simulação: pergunta o que pesou na decisão, oferece o próximo passo concreto (lance, grupo, revisão da comparação)",
			"o remarketing existe e re-engaja: a retomada não é só 'quer que eu refaça?' — tem que mover a conversa (P0, P3)",
			"números de carta/parcela saem da ferramenta, nunca de memória",
			"a conversa termina com passo combinado, não com pergunta retórica sem retorno",
		],
		cenario_morte:
			"pós-simulação: o lead simulou a carta e o agente não deu o próximo passo — a conversa morre na pergunta 'Você já fez consórcio antes?' / 'Quer que eu refaça?'",
		golden: ["golden-topico-proibido"],
	},
	{
		id: "auto-triplo-objecao-sem-telefone",
		abertura: "Oi, quero um carro de uns 80 mil.",
		perfil: {
			tom: "cético, testa o vendedor com 3 objeções seguidas",
			comportamento:
				"faz as 3 objeções clássicas em sequência e NUNCA informa o WhatsApp — se o agente repetir o pedido do telefone a cada resposta, desiste silenciosamente",
			o_que_quer:
				"entender se consórcio vale mais que financiamento antes de dar qualquer contato",
		},
		categoria: "auto",
		canal: "web",
		administradora: null,
		anuncio: "direto",
		origem_real:
			"41081792 (web, auto, direto, 04/11 15:49, em_negociacao, 10 msgs, sem telefone)",
		invariantes: [
			"responder as 3 objeções com conteúdo (contemplação é por sorteio ou lance; financiamento x consórcio juros x taxa) — P1: entrega antes de perguntar",
			"não amarrar CADA resposta ao mesmo pedido de telefone: máximo 1 pedido explícito por turno, e alternar o próximo passo",
			"não prometer data de contemplação nem desconto fora da cota",
			"a conversa sobrevive às 3 objeções e termina com próximo passo (comparar grupo com histórico de contemplados, por exemplo)",
		],
		cenario_morte:
			"objeção triplo + pedido repetido do telefone: o lead sai depois da 3ª objeção porque toda resposta virou 'informe seu WhatsApp'",
		golden: ["golden-objecao-financiamento", "golden-objecao-quanto-tempo", "golden-objecao-cpf"],
	},
	{
		id: "whatsapp-lance-embutido-sabido",
		abertura: "Por favor",
		perfil: {
			tom: "whatsapp, informal, sabe do que está falando",
			comportamento:
				"carro de R$ 140.000; depois de ver a comparação, traz a objeção técnica 'quero administradora que aceite lance embutido'. Se a resposta for vaga ou promessa, some. Testa se o vendedor sabe do assunto.",
			o_que_quer:
				"uma carta MAIOR (~R$ 200.000) para usar lance embutido de 30% e sobrar ~R$ 140.000",
		},
		categoria: "auto",
		canal: "whatsapp",
		administradora: "Itaú",
		anuncio: null,
		origem_real: "f4b0708d (WhatsApp, Rafael, 21973685867, auto, 26/10 11:49, em_negociacao, 15 msgs)",
		invariantes: [
			"o vendedor reconhece lance embutido e propõe a estratégia da carta maior SEM inventar a lista de administradoras",
			"número da carta, parcela e prazo vêm da ferramenta; contemplados/mês também",
			"retomada depois da proposta precisa levar algo NOVO (novo grupo, lance diferente), não repetir a mesma pergunta",
			"no WhatsApp, telefone/nome já chegaram com a mensagem: não se pede de novo (P6)",
		],
		cenario_morte:
			"objeção técnica de lance embutido: o agente propõe a carta certa (Itaú R$ 142.086) mas a retomada não leva valor novo e o lead não volta",
		golden: ["golden-dono-chato-quer-lance"],
	},
	{
		id: "imovel-precisa-entender-antes",
		abertura: "Oi! Quero comparar consórcios.",
		perfil: {
			tom: "whatsapp, prudente, educada, não apressa",
			comportamento:
				"imóvel de R$ 500.000. Antes de decidir, pede EXPLICAÇÃO: 'Gostaria de entender como funciona'. Se o agente só empurra simulação, ela fica repetindo o ciclo e não fecha",
			o_que_quer:
				"entender contemplação, lance e diferença de carta antes de escolher a administradora",
		},
		categoria: "imovel",
		canal: "whatsapp",
		administradora: null,
		anuncio: null,
		origem_real:
			"ead30396 (WhatsApp, Gabriela Pirani, 13974125588, imóvel, 23/10 09:22, em_negociacao, 22 msgs)",
		invariantes: [
			"explicar consórcio (poupança coletiva, contemplação por sorteio ou lance, sem juros, sem data garantida) SEM prometer prazo",
			"após explicar, dar próximo passo DIFERENTE a cada retomada (P0/P3): trocar ângulo, não repetir 'quer que eu simule?' 3×",
			"chega à carta e mostra número real da cota",
			"se o lead não responde, o próximo toque não é a mesma pergunta",
		],
		cenario_morte:
			"explicação dada mas retomadas idênticas: 3 perguntas iguais em 8h e o lead silencia",
		golden: ["golden-dono-chato-nao-entendi-duas-vezes"],
	},
	{
		id: "voltei-sem-nada",
		abertura: "Voltei",
		perfil: {
			tom: "elusivo; respondeu o toque do remarketing mas não traz informação",
			comportamento:
				"diz 'Voltei' até 3× sem dar o bem nem o valor; se o agente repetir a MESMA pergunta de valor a cada 'Voltei', desiste",
			o_que_quer:
				"não declarado — teste de paciência ou lembrança vaga; precisa de estímulo, não de interrogatório",
		},
		categoria: "auto",
		canal: "web",
		administradora: null,
		anuncio: "meta",
		origem_real:
			"6951f1fd (web, auto, meta, 04/11 19:10, 6 msgs) e 80e0b0af (web, auto, meta, 04/11 12:38, 4 msgs); 6 conversas do período terminam em 'Voltei'",
		invariantes: [
			"reconhecer que o lead voltou e, na volta, ENTREGAR algo (faixa com boas opções, exemplo real de carta) em vez de só perguntar de novo (P1)",
			"máximo 1 repetição da mesma pergunta; na 2ª, mudar a abordagem (oferecer faixas de valor, card com opções)",
			"a conversa não morre: sempre um próximo passo (P0)",
		],
		cenario_morte:
			"loop de 'Voltei': o agente repete a pergunta de valor e o lead desaparece na 3ª repetição",
		golden: ["golden-dono-chato-some-e-volta"],
	},
	{
		id: "whatsapp-silencio-total",
		abertura: "Oi! Quero comparar consórcios.",
		perfil: {
			tom: "whatsapp; apenas clique no quick-reply, nunca digita",
			comportamento:
				"responde 1 vez e depois recebe 2–3 toques do agente sem nunca voltar; não é robô (celular real identificado)",
			o_que_quer: "desconhecido — o perfil testa se o agente consegue DESPERTAR conversa sem resposta",
		},
		categoria: "auto",
		canal: "whatsapp",
		administradora: null,
		anuncio: null,
		origem_real:
			"27a8095e (WhatsApp, Eliane, 24992360238, 30/10 14:57, engajado, 6 msgs) e 1097ded0 (joserufuno9, 24/10, 11 msgs, 3 reentradas sem conteúdo)",
		invariantes: [
			"nenhum toque repetido: cada retomada leva algo novo (número real de carta da categoria, prazo, gancho diferente)",
			"a fila de amanhã existe (P3): quem não respondeu hoje é retomada, não abandono",
			"não inventar resposta nem assumir o bem por ela (não é alucinar 'você quer um carro, né?')",
		],
		cenario_morte:
			"toques idênticos de retomada: 3 mensagens com o mesmo conteúdo e o lead silencia para sempre",
		golden: ["golden-dono-chato-some-e-volta"],
	},
	{
		id: "whatsapp-ruido-de-anexo",
		abertura: "Oi! Quero comparar consórcios.",
		perfil: {
			tom: "whatsapp, confuso com a tecnologia",
			comportamento:
				"em vez de responder, envia o mesmo texto/reenvio ou 'Documento recebido' / 'Imagem recebida' (áudio/foto do WhatsApp) várias vezes; espera que o agente decifre",
			o_que_quer: "prosseguir, mas por meio de documento/áudio em vez de texto",
		},
		categoria: "auto",
		canal: "whatsapp",
		administradora: null,
		anuncio: null,
		origem_real: "a346805d (WhatsApp, Lucim, 8881237859, 28/10 16:11, engajado, 9 msgs)",
		invariantes: [
			"tratar o anexo/ruído como tentativa de comunicação: pedir de outra forma (ex.: 'pode me mandar o valor do bem por aqui?') sem culpá-la nem repetir o mesmo pedido 3×",
			"a conversa não morre no ruído (P0): oferecer alternativa (escolher por card, responder em texto)",
			"não alucinar o conteúdo do documento recebido",
		],
		cenario_morte:
			"ruído de anexos: o agente volta à pergunta padrão, não decifra o canal alternativo e o lead desiste",
		golden: ["golden-fora-de-escopo"],
	},
];

function itemDePerfilReal(p: PerfilReal): ItemDoDataset {
	return {
		id: `aja-${p.id}`,
		input: {
			abertura: p.abertura,
			perfil: {
				tom: p.perfil.tom,
				comportamento: p.perfil.comportamento,
				o_que_quer: p.perfil.o_que_quer,
			},
			roteiro: null,
			canal: p.canal,
			categoria: p.categoria,
		},
		expectedOutput: {
			invariantes: p.invariantes,
			cenario_morte: p.cenario_morte,
			sucesso: "a trajetória cumpre TODAS as invariantes; a conversa não morre e o lead não desiste pelo motivo do cenário de morte",
		},
		metadata: {
			perfil: p.id,
			categoria: p.categoria,
			administradora: p.administradora,
			anuncio: p.anuncio,
			canal: p.canal,
			fonte: "dataset-seed-D-0081",
			origem_real: p.origem_real,
			golden: p.golden,
		},
	};
}

function todosOsItens(): ItemDoDataset[] {
	const base = PERFIS_DE_CLIENTE.filter((p) =>
		["caminho-feliz", "nervoso-bugado", "recusa-telefone", "objecao"].includes(p.id),
	).map(itemDePerfilDoPlayground);
	return [...base, ...PERFIS_REAIS.map(itemDePerfilReal)];
}

// ── cliente REST do Langfuse ────────────────────────────────────────────

// ── cliente REST do Langfuse ───────────────────────────────────────────

type LangfuseClient = {
	get(caminho: string): Promise<{ status: number; corpo: unknown }>;
	post(caminho: string, corpo: unknown): Promise<{ status: number; corpo: unknown }>;
};

function cliente(c: Credenciais): LangfuseClient {
	const auth = Buffer.from(`${c.publicKey}:${c.secretKey}`).toString("base64");
	const cabecalho = { "content-type": "application/json", authorization: `Basic ${auth}` };
	async function pedir(
		metodo: "GET" | "POST",
		caminho: string,
		corpo?: unknown,
	): Promise<{ status: number; corpo: unknown }> {
		const r = await fetch(`${c.baseUrl}${caminho}`, {
			method: metodo,
			headers: cabecalho,
			body: corpo === undefined ? undefined : JSON.stringify(corpo),
		});
		const texto = await r.text();
		let json: unknown = texto;
		try {
			json = JSON.parse(texto);
		} catch {
			// resposta não-JSON vira texto cru no erro abaixo
		}
		if (!r.ok) {
			const detalhe = typeof texto === "string" ? texto.slice(0, 300) : JSON.stringify(json);
			throw new Error(`HTTP ${r.status} em ${metodo} ${caminho}: ${detalhe}`);
		}
		return { status: r.status, corpo: json };
	}
	return {
		get: (caminho) => pedir("GET", caminho),
		post: (caminho, corpo) => pedir("POST", caminho, corpo),
	};
}

/** A primeira candidata cujas credenciais a instância ACEITA (GET /datasets → 200). */
async function credenciais(): Promise<Credenciais> {
	for (const c of candidatas()) {
		const tentada = { ...c, baseUrl: paraHost(c.baseUrl) };
		try {
			const r = await cliente(tentada).get("/api/public/datasets");
			if (r.status === 200) {
				console.log(`[dataset-seed] credenciais: ${tentada.origem} (${tentada.baseUrl})`);
				return tentada;
			}
		} catch (erro) {
			console.log(
				`[dataset-seed] credenciais rejeitadas (${tentada.origem}): ${erro instanceof Error ? erro.message.slice(0, 120) : String(erro)}`,
			);
		}
	}
	console.error(
		"[dataset-seed] nenhuma credencial LANGFUSE_* aceita (ambiente e vault) — seed abortado.",
	);
	process.exit(2);
}

async function idIdsExistentes(lf: LangfuseClient): Promise<Set<string>> {
	const ids = new Set<string>();
	let pagina = 1;
	for (;;) {
		const r = await lf.get(`/api/public/dataset-items?datasetName=${NOME_DO_DATASET}&page=${pagina}&limit=50`);
		const dados = (r.corpo as { data?: Array<{ id?: string }> }).data ?? [];
		for (const i of dados) if (i.id) ids.add(i.id);
		if (dados.length < 50) break;
		pagina += 1;
	}
	return ids;
}

async function main(): Promise<void> {
	const c = await credenciais();
	const lf = cliente(c);
	const itens = todosOsItens();

	// dataset existe? (GET 404 → cria; o POST de dataset é por nome, único por projeto)
	let r;
	try {
		r = await lf.get(`/api/public/datasets/${NOME_DO_DATASET}`);
	} catch {
		r = await lf.post("/api/public/datasets", { name: NOME_DO_DATASET, description: DESCRICAO });
	}
	console.log(`[dataset-seed] dataset: ${(r.corpo as { name?: string }).name ?? NOME_DO_DATASET}`);

	const antes = await idIdsExistentes(lf);
	for (const item of itens) {
		await lf.post("/api/public/dataset-items", {
			id: item.id,
			input: item.input,
			expectedOutput: item.expectedOutput,
			metadata: item.metadata,
			datasetName: NOME_DO_DATASET,
		});
	}

	const depois = await idIdsExistentes(lf);
	const esperados = itens.map((i) => i.id);
	const faltando = esperados.filter((id) => !depois.has(id));
	const duplicados = depois.size - esperados.length;

	console.log(
		`[dataset-seed] itens: ${itens.length} enviados · ${depois.size} no dataset · esperados ${esperados.length}`,
	);
	console.log(
		`[dataset-seed] já existiam antes: ${[...antes].filter((id) => esperados.includes(id)).length} · faltando pós-seed: ${faltando.length}`,
	);
	if (faltando.length > 0) {
		console.error(`[dataset-seed] itens não gravados: ${faltando.join(", ")}`);
		process.exit(1);
	}
	if (duplicados !== 0) {
		console.error(`[dataset-seed] contagem do dataset diverge dos itens esperados: ${depois.size}`);
		process.exit(1);
	}
	const semSaida = itens.filter(
		(i) => (i.expectedOutput.invariantes as string[]).length === 0,
	);
	if (semSaida.length > 0) {
		console.error(`[dataset-seed] itens sem expected_output: ${semSaida.map((i) => i.id).join(", ")}`);
		process.exit(1);
	}
	console.log("[dataset-seed] GATE: verde — dataset com itens completos e sem duplicação.");
}

main().catch((erro) => {
	console.error("[dataset-seed] falhou:", erro);
	process.exit(1);
});
