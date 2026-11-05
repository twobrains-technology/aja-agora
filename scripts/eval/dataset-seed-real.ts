// ── Conversas reais de produção → dataset `aja-agora-eval` ───────────────
//
// Seed idempotente dos itens derivados das conversas REAIS de produção
// (RDS via túnel SSM, material cru em `.orientacao/conversas-reais/`,
// crítica em `.orientacao/critica-real-<slug>.md`).
//
// 1 item = 1 conversa real: input = desafio do lead real (perfil de
// comportamento); expected_output = invariantes de trajetória; metadata =
// perfil=real, origem (id da conversa, canal, data) e humano_atendeu.
//
// Ids determinísticos `aja-real-<slug>`; o POST com id existente UPSERT —
// re-run nunca duplica. A verificação de contagem soma o que JÁ existia
// (12 itens do D-0081) com os novos.
//
//   pnpm tsx scripts/eval/dataset-seed-real.ts

import "../_env-host";

import { execFileSync } from "node:child_process";

const NOME_DO_DATASET = "aja-agora-eval";

const CHAVES = ["LANGFUSE_BASE_URL", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"] as const;

type Credenciais = { baseUrl: string; publicKey: string; secretKey: string; origem: string };

function doVault(cofre: string, chave: string): string | null {
	try {
		return (
			execFileSync("secrets.sh", ["get-key", cofre, chave], { encoding: "utf8" }).trim() || null
		);
	} catch {
		return null;
	}
}

function candidatas(): Credenciais[] {
	const montadas: Credenciais[] = [];
	const montar = (origem: string, pega: (c: (typeof CHAVES)[number]) => string | null) => {
		const valores: string[] = [];
		for (const c of CHAVES) {
			const v = pega(c)?.trim();
			if (!v) return;
			valores.push(v);
		}
		montadas.push({ origem, baseUrl: valores[0], publicKey: valores[1], secretKey: valores[2] });
	};
	montar("ambiente", (c) => process.env[c] ?? null);
	montar("vault:aja-agora", (c) => doVault("aja-agora", c));
	montar("vault:pi-agentes-aja-langfuse", (c) => doVault("pi-agentes-aja-langfuse", c));
	return montadas;
}

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

type LangfuseClient = {
	get(caminho: string): Promise<{ status: number; corpo: unknown }>;
	post(caminho: string, corpo: unknown): Promise<{ status: number; corpo: unknown }>;
};

function cliente(c: Credenciais): LangfuseClient {
	const auth = Buffer.from(`${c.publicKey}:${c.secretKey}`).toString("base64");
	const cabecalho = { "content-type": "application/json", authorization: `Basic ${auth}` };
	async function pedir(metodo: "GET" | "POST", caminho: string, corpo?: unknown) {
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
			// resposta não-JSON vira texto no erro
		}
		if (!r.ok)
			throw new Error(
				`HTTP ${r.status} em ${metodo} ${caminho}: ${typeof texto === "string" ? texto.slice(0, 200) : JSON.stringify(json)}`,
			);
		return { status: r.status, corpo: json };
	}
	return {
		get: (caminho) => pedir("GET", caminho),
		post: (caminho, corpo) => pedir("POST", caminho, corpo),
	};
}

// ── itens: 1 por conversa real minerada ──────────────────────────────────

type ItemReal = {
	slug: string;
	abertura: string;
	tom: string;
	comportamento: string;
	o_que_quer: string;
	canal: "web" | "whatsapp";
	categoria: "auto" | "imovel";
	origem_real: string;
	humano_atendeu: boolean;
	desfecho: string;
	invariantes: string[];
};

const ITENS_REAIS: readonly ItemReal[] = [
	{
		slug: "quero-ver-todas",
		abertura: "quero ver todas",
		tom: "decidido, apressado, sabe o que quer",
		comportamento:
			"carro de R$ 80 mil; pede 'quero ver todas' DUAS vezes seguidas; se a resposta justificar o próprio gate ou repetir evasiva, aponta o erro; depois aceita e fecha ('quero fechar').",
		o_que_quer:
			"ver TODAS as opções antes de escolher, e fechar rápido (fechou em ~25 min com humano)",
		canal: "web",
		categoria: "auto",
		origem_real: "2800db3a (web, auto, 04/11 16:30, proposta fechada, 50 msgs)",
		humano_atendeu: true,
		desfecho: "proposta gravada (BB R$ 80.000, R$ 2.039,12 × 49)",
		invariantes: [
			"pedido de 'todas' mostra a lista completa que a tool devolveu, sem justificar o gate do WhatsApp (P1/P6)",
			"repetição do pedido não gera evasiva repetida (P0)",
			"lead decidido ('quero fechar') vai direto ao pré-cadastro (P5: ele pediu)",
			"números de carta/parcela/lance só de tool (P11)",
		],
	},
	{
		slug: "pede-ligacao-antes-do-dado",
		abertura: "Oi! Quero comparar consórcios.",
		tom: "whatsapp, cautelosa, desconfiada de dar dado",
		comportamento:
			"imóvel; cita valor absurdopossível ('$ 30 milhões'); antes de dar qualquer dado, pede 'Preciso que me ligue' e 'Prefiro que me ligue'. Se o agente repetir o pedido do CPF depois da recusa, ela desaparece (aconteceu: 2 pedidos após a recusa, lead perdido).",
		o_que_quer: "ser ligada por um humano ANTES de dar CPF ou qualquer dado",
		canal: "whatsapp",
		categoria: "imovel",
		origem_real: "d7662ecd (WhatsApp, Simone, 10/11 20:50, lead perdido, 23 msgs)",
		humano_atendeu: true,
		desfecho: "mesa assumiu e não retornou; lead perdido",
		invariantes: [
			"recusa de dado é respeitada: o pedido do CPF não se repete no mesmo turno nem no seguinte (P6)",
			"valor fora da faixa ('$ 30 milhões') passa por checagem, não por card (P11)",
			"pedido de ligação chama a fila (tool:falar_com_humano) e o agente segue conduzindo (P7/P8)",
			"o retorno prometido tem concreto (janela/horário), nunca 'em breve' (P0)",
		],
	},
	{
		slug: "pos-proposta-documentos",
		abertura: "Oi! Acabei de fechar minha proposta da ITAÚ pelo site da Aja Agora.",
		tom: "cordial, devagar, responde quase sempre só 'Ok'",
		comportamento:
			"pós-proposta: envia documentos errados (print em vez de PDF, recibo em vez de declaração, anexo com senha). Espera a lista de documentos ser cobrada UM POR VEZ como o humano fez ('Isso, agora preciso do verso da cnh apenas'). Se o agente repete a lista inteira ou promete data sem fato, desanima.",
		o_que_quer: "saber exatamente o próximo documento e quando o consórcio libera",
		canal: "whatsapp",
		categoria: "auto",
		origem_real: "75f77efd (WhatsApp, Ana, 08/2026, 154 msgs, contrato assinado)",
		humano_atendeu: true,
		desfecho: "contrato assinado — a documentação foi 100% humana",
		invariantes: [
			"cada resposta pós-proposta aponta O PRÓXIMO documento específico (um por vez), não a lista completa (P0)",
			"anexo errado → pede o formato certo sem culpar e sem repetir a lista",
			"nenhuma promessa de prazo de liberação que não vem de fato do sistema (P11)",
			"nenhum aviso de LGPD antes de pedir dado (decisão 27/10)",
		],
	},
	{
		slug: "correntista-e-esposa",
		abertura: "Oi! Acabei de fechar minha proposta da BANCO DO BRASIL pelo site da Aja Agora.",
		tom: "formal, educado, precisa alinhar com a esposa",
		comportamento:
			"pós-proposta: 'Não sou correntista do BB, sou do Itaú'; depois 'Por enquanto não. Estou verificando com a minha esposa os próximos passos e entro em contato em breve.' Se a retomada for template genérico ('Pode me responder por aqui?') repetido, nunca responde (aconteceu: 3 templates idênticos e lead perdido).",
		o_que_quer: "alinhar a compra com a esposa antes de seguir a documentação",
		canal: "web",
		categoria: "imovel",
		origem_real: "8e28d6f0 (web, Paulo, 13/08, lead PERDIDO com proposta, 64 msgs)",
		humano_atendeu: true,
		desfecho:
			"humano ofereceu duas janelas concretas (sexta 11h / segunda 14h); motor ofereceu template 3× e o lead sumiu",
		invariantes: [
			"objeção de cônjuge → duas janelas concretas de contato (o humano como régua), sem prometer prazo",
			"retomada seguinte traz fato novo (prazo/validade da reserva), nunca o mesmo texto (P0/P3)",
			"proposta gravada não encerra o trabalho do vendedor (P7)",
		],
	},
	{
		slug: "troca-financiamento-apartamento",
		abertura:
			"Tenho um financiamento de um apartamento e gostaria de trocar para consórcio, como proceder?",
		tom: "tecnico, faz perguntas encadeadas, testa o conhecimento",
		comportamento:
			"quer quitar o financiamento atual (R$ 380 mil); faz 7 perguntas técnicas (lance embutido, cenário de contemplação, quitação). Se o agente registrar cota sem ele pedir ou responder uma pergunta detalhada com 'Pronto!' + card, some (aconteceu: 'Ótimo! Vamos fechar isso então. Perfeito! Sua cota está registrada' e 'Claro! Pronto!').",
		o_que_quer:
			"entender DETALHADAMENTE como a carta quita o financiamento antes de registrar qualquer cota",
		canal: "web",
		categoria: "imovel",
		origem_real: "8eaabefa (web, 10/08 14:51, lead PERDIDO com proposta, 41 msgs)",
		humano_atendeu: true,
		desfecho: "cota registrada sem pedido; humano assumiu; lead sumiu",
		invariantes: [
			"pergunta técnica pede resposta técnica real, nunca 'Pronto!' + card (P0)",
			"cota NÃO se registra sem pedido explícito do lead (P5)",
			"sem contract_form nem handoff empurrados na resposta à pergunta (P5/P8)",
			"números de lance/médio/embutido só de tool (P11)",
		],
	},
	{
		slug: "tenho-duvidas-vago",
		abertura: "Gostaria de um carro",
		tom: "informal, digita com erros, foge de perguntas fechadas",
		comportamento:
			"'Não sei, me ajude a pensar'; 'até 1200' por mês; pergunta 'Qual voce sugere ?' — se o agente responder sobre CARRO em vez de CARTA, corrige ('eu me refiro a carta de crédit'); cobre 'responda minha pergunta por favor'; depois de reservar diz 'Tenho dúvidas' sem especificar.",
		o_que_quer: "sugestão de CARTA com justificativa; e espaço para as dúvidas dele",
		canal: "web",
		categoria: "auto",
		origem_real: "270b2464 (web, Neto, 10/08 14:37, lead PERDIDO com proposta, 58 msgs)",
		humano_atendeu: true,
		desfecho: "'Tenho dúvidas ?' caiu no vazio (o humano respondeu 'bao demais'); lead sumiu",
		invariantes: [
			"'sugere' é interpretado como carta (taxa, contemplados, prazo de tool), não modelo de carro (P10/P11)",
			"na 2ª cobrança ('responda minha pergunta') a resposta é DE FATO, sem evasiva nova (P0)",
			"'tenho dúvidas' abre espaço com pergunta específica, não cumprimento",
			"correção do lead ('tenho 0 reais') atualiza o modelo — sem suposição silenciosa",
		],
	},
	{
		slug: "lance-ciranda-de-cartas",
		abertura: "carro de 80 mil, algum com lance médio menor em relação com crédito?",
		tom: "sabido, faz contas, troca de carta quando a conta não fecha",
		comportamento:
			"testa 3 cartas com contas de lance ('Hoje tenho 20 mil em dinheiro o que compensa'; 'Quero outra carta'). Se os números mudarem de fala para fala sem tool ou se o agente só devolver a escolha de volta, perde a confiança.",
		o_que_quer:
			"a carta cuja conta de lance (próprio + embutido) fecha com o dinheiro que tem hoje",
		canal: "web",
		categoria: "auto",
		origem_real: "9611019d (web, Renan, 28-29/10 00:09-00:21, proposta_enviada, 52 msgs)",
		humano_atendeu: false,
		desfecho:
			"proposta_enviada (Âncora) — chegou pelo esforço do lead, com números inconsistentes no caminho",
		invariantes: [
			"cada troca de carta re-mostra lance estimado de tool, nunca de cabeça (P11)",
			"a conta do lance (próprio + embutido × lance médio) fecha aritmeticamente com os números já citados no mesmo turno",
			"após 2 cartas testadas, recomendação DECIDIDA com motivo — não devolver a escolha ao lead (P7)",
		],
	},
	{
		slug: "arrependido-pos-reserva",
		abertura: "oi, quero um Fiat Argo de 60 mil",
		tom: "rápido, decide e depois duvida",
		comportamento:
			"confirma a carta e 2 minutos depois pede 'Quero ver outras opções'. Se o agente não explicar o que acontece com a RESERVA (vale? é substituída? caduca?), e a retomada seguinte for template ('Sua comparação está pronta… O que ficou faltando?'), some (aconteceu: lead perdido com proposta).",
		o_que_quer: "explorar as outras cartas SEM perder a reserva que já fez",
		canal: "web",
		categoria: "auto",
		origem_real:
			"a9eb68d4 (web, Samir, 13/10 20:22, lead PERDIDO com proposta BB R$ 60 mil, 28 msgs)",
		humano_atendeu: false,
		desfecho: "reserva gravada, conversa morta 2 min depois do arrependimento",
		invariantes: [
			"arrependimento pós-reserva acolhido sem susto, com o fato do sistema sobre a reserva",
			"comparação das cartas com números de tool (carta, parcela, prazo, lance)",
			"a retomada seguinte retoma de ONDE parou (nome, carta reservada), nunca template genérico (P0/P3)",
		],
	},
	{
		slug: "voltei-sem-conteudo",
		abertura: "carro até 90 mil",
		tom: "elusivo, responde 'Voltei' sem dar informação",
		comportamento:
			"volta 3× só com 'Voltei'. Se o agente repetir o MESMO pedido (nome, valor) mais de 1 vez, desiste silenciosamente (aconteceu: 'Antes de eu buscar as ofertas, como posso te chamar?' 3× em 4 min).",
		o_que_quer: "não declarado — precisa de estímulo, não de interrogatório",
		canal: "web",
		categoria: "auto",
		origem_real: "bcd0e8cb (web, 22-28/10, em_negociacao parado, 47 msgs)",
		humano_atendeu: false,
		desfecho: "conversa morreu após 3 pedidos idênticos do nome",
		invariantes: [
			"'Voltei' sem conteúdo → ENTREGAR algo (faixa, número real), não perguntar de novo (P1)",
			"máximo 1 repetição do mesmo pedido; na 2ª muda a abordagem (P0/P3)",
			"a retomada pós-silêncio nunca é o mesmo texto (P0)",
		],
	},
	{
		slug: "investidor-incc",
		abertura: "quero comprar um imóvel de 200 mil",
		tom: "analítico, investidor, muda o alvo conforme aprende",
		comportamento:
			"muda o alvo 5 vezes (200→100→'meia parcela'→150 mil) e pergunta valorização/correção da carta. Se o agente citar percentual de memória (ex.: 'INCC estimado em 6% ao ano' sem fonte) ou reusar lista antiga sem rebuscar, perde credibilidade. Nunca dá o nome espontaneamente.",
		o_que_quer: "entender correção da carta (INCC) e comparar grupos antes de escolher",
		canal: "web",
		categoria: "imovel",
		origem_real: "ca0664dc (web, 18/10 19:50, em_negociacao parado, 42 msgs)",
		humano_atendeu: false,
		desfecho: "parado; 3 remarketings idênticos; nome nunca capturado",
		invariantes: [
			"cada novo alvo dispara busca nova de tool — 'nas opções da tela' não é resposta (P11)",
			"percentual de correção/índice só com fonte de tool; sem número = sem número (D11)",
			"o nome é pedido no máximo 1 vez com gancho natural (P6)",
			"próximo passo declarado a cada turno (P0)",
		],
	},
	{
		slug: "pergunta-fora-do-estoque",
		abertura: "quero comprar um imóvel de 400 mil",
		tom: "explorador, pergunta além da busca (leilão, parceria, ágio)",
		comportamento:
			"faz 4 perguntas fora do estoque (leilão de bancos, programa de parceria/comissão da administradora, carta contemplada, ágio). Se as respostas repetem a fórmula 'não tenho dados … não consigo' sem alternativa, ele diz 'Voltei' e some (aconteceu: 4 muros, lead sumiu).",
		o_que_quer:
			"respostas honestas que convertem no que o vendedor TEM (lance médio, cartas do grupo)",
		canal: "web",
		categoria: "imovel",
		origem_real: "e35ab51c (web, 02/11 12:04, em_negociacao parado, 39 msgs)",
		humano_atendeu: false,
		desfecho: "parado depois de 4 'não tenho' consecutivos",
		invariantes: [
			"honesto: não inventa comissão, ágio, leilão (P11)",
			"as respostas 'não tenho' NÃO repetem a mesma fórmula (forbidRepeatedAgentText)",
			"cada 'não tenho' vem com o que PODE oferecer (lance médio do grupo, cartas disponíveis) e próximo passo (P0)",
		],
	},
	{
		slug: "administradora-que-nao-exista",
		abertura: "carta de 170 mil, carro",
		tom: "direto, pede administradora específica",
		comportamento:
			"pede 'Sicred' (não existe na busca). Se o agente inventar cota, falha; se admitir e corrigir erro anterior com transparência, prossegue (o real fez bem). Depois pede cenários de lance embutido; se a resposta termina em 'não consigo concluir' sem alternativa, nunca volta (aconteceu).",
		o_que_quer:
			"a carta da administradora que pediu; quando não existe, a melhor alternativa com números",
		canal: "web",
		categoria: "auto",
		origem_real: "050bb0c8 (web, Kiko, 01/11 14:21, em_negociacao parado, 32 msgs)",
		humano_atendeu: false,
		desfecho: "conversa morreu no 'não consigo concluir'",
		invariantes: [
			"administradora inexistente → admite sem inventar cota (P11)",
			"erro anterior corrigido com transparência (padrão real: 'Também preciso corrigir o que falei antes')",
			"dado ausente da tool → alternativa CONCRETA com números, nunca fim em 'não consigo' (P0/P7)",
		],
	},
	{
		slug: "remarketing-identico",
		abertura: "carro entre 50 e 100 mil",
		tom: "prático, responde rápido e some",
		comportamento:
			"dá a faixa, pede explicação, entende e DIGITA o telefone na fala. Depois some. Se a retomada for o template 'O que você quer conquistar: carro, moto ou imóvel?' (que ele já respondeu), ignora todas (aconteceu: 17 retomadas idênticas por 20 dias).",
		o_que_quer: "que a retomada saiba o que ele já disse (faixa de valor, telefone)",
		canal: "web",
		categoria: "auto",
		origem_real: "f41a02cb (web, 15/10-04/11, parado, 45 msgs, remarketing 17×)",
		humano_atendeu: false,
		desfecho: "parado desde 15/10 com remarketing idêntico 17×",
		invariantes: [
			"telefone dito na FALA é o dado (não pede confirmação em card de novo) (P6)",
			"a retomada retoma de ONDE parou (faixa dada, telefone confirmado), nunca recomeça do zero (P0)",
			"retomadas repetidas nunca são o mesmo texto (P3)",
		],
	},
];

type ItemDoDataset = {
	id: string;
	input: Record<string, unknown>;
	expectedOutput: Record<string, unknown>;
	metadata: Record<string, unknown>;
};

function itemDeConversaReal(p: ItemReal): ItemDoDataset {
	return {
		id: `aja-real-${p.slug}`,
		input: {
			abertura: p.abertura,
			perfil: {
				tom: p.tom,
				comportamento: p.comportamento,
				o_que_quer: p.o_que_quer,
			},
			canal: p.canal,
			categoria: p.categoria,
		},
		expectedOutput: {
			invariantes: p.invariantes,
			desfecho_real: p.desfecho,
			sucesso:
				"a trajetória cumpre TODAS as invariantes; o vendedor se comporta melhor que o humano/acumulado real do caso de origem",
		},
		metadata: {
			perfil: "real",
			categoria: p.categoria,
			canal: p.canal,
			fonte: "conversas-reais-producao",
			origem: p.origem_real,
			humano_atendeu: p.humano_atendeu,
			golden: [`golden-real-${p.slug}`],
		},
	};
}

async function idIdsExistentes(lf: LangfuseClient): Promise<Set<string>> {
	const ids = new Set<string>();
	let pagina = 1;
	for (;;) {
		const r = await lf.get(
			`/api/public/dataset-items?datasetName=${NOME_DO_DATASET}&page=${pagina}&limit=50`,
		);
		const dados = (r.corpo as { data?: Array<{ id?: string }> }).data ?? [];
		for (const i of dados) if (i.id) ids.add(i.id);
		if (dados.length < 50) break;
		pagina += 1;
	}
	return ids;
}

async function main(): Promise<void> {
	let lf: LangfuseClient | null = null;
	for (const c of candidatas()) {
		const tentada = { ...c, baseUrl: paraHost(c.baseUrl) };
		try {
			const t = cliente(tentada);
			// a credencial vale quando ACEITA o dataset (a local aceita o GET de
			// datasets mas não tem o `aja-agora-eval` — o dataset vive na instância AWS)
			await t.get(`/api/public/datasets/${NOME_DO_DATASET}`);
			console.log(`[dataset-seed-real] credenciais: ${tentada.origem} (${tentada.baseUrl})`);
			lf = t;
			break;
		} catch (e) {
			console.log(
				`[dataset-seed-real] credenciais rejeitadas (${tentada.origem}): ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`,
			);
		}
	}
	if (!lf) {
		console.error("[dataset-seed-real] nenhuma credencial LANGFUSE_* aceita — seed abortado.");
		process.exit(2);
	}

	const itens = ITENS_REAIS.map(itemDeConversaReal);
	const antes = await idIdsExistentes(lf);
	const meus = itens.map((i) => i.id);
	const colisao =
		meus.filter((id) => antes.has(id) === false).length === 0 ? itens.length : itens.length;
	void colisao; // upsert cobre re-run

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
	const faltando = meus.filter((id) => !depois.has(id));
	console.log(
		`[dataset-seed-real] itens: ${itens.length} enviados · ${depois.size} no dataset (antes: ${antes.size}) · novos esperados ${meus.length}`,
	);
	if (faltando.length > 0) {
		console.error(`[dataset-seed-real] itens não gravados: ${faltando.join(", ")}`);
		process.exit(1);
	}
	if (depois.size < antes.size || depois.size < meus.length) {
		console.error(`[dataset-seed-real] contagem regrediu ou está incompleta: ${depois.size}`);
		process.exit(1);
	}
	const semSaida = itens.filter((i) => (i.expectedOutput.invariantes as string[]).length === 0);
	if (semSaida.length > 0) {
		console.error(
			`[dataset-seed-real] itens sem expected_output: ${semSaida.map((i) => i.id).join(", ")}`,
		);
		process.exit(1);
	}
	console.log("[dataset-seed-real] GATE: verde — itens de conversas reais gravados, idempotente.");
}

main().catch((e) => {
	console.error("[dataset-seed-real] falhou:", e);
	process.exit(1);
});
