// ---------- Aba 2: tabelas geradas ----------
const LACUNAS = [
	[
		"<b>A âncora que falta no anti-eco</b> <span class='tag bad'>defeito ativo</span>",
		"19 visitas que geraram conversa são descartadas como eco de prefetch, escondendo 22 conversas e 8 leads da atribuição. A melhor campanha da conta aparece com zero.",
		"Estender ao <code class='mono'>VISITA_NAO_E_ECO</code> a mesma âncora que <code class='mono'>VISITA_DE_GENTE</code> já tem: visita que produziu conversa nunca é descartada.",
		"Baixo",
	],
	[
		"Pipeline em R$ antes da proposta",
		"<code class='mono'>leads.credit_value</code> é NULL em 49 de 49. Só sabemos quanto vale um negócio depois que ele virou proposta — 8 de 49.",
		"Gravar o valor do bem no lead assim que o cliente o declara. O dado já existe em <code class='mono'>conversations.metadata.qualifyAnswers.creditMax</code> e no insight <code class='mono'>budget</code>.",
		"Baixo",
	],
	[
		"Investimento de mídia",
		"Sem custo não há CPL, CAC nem ROAS. Medimos só o numerador: sabemos que uma campanha trouxe 1.273 pessoas e zero conversas, mas não quanto isso custou.",
		"Integrar a Marketing API da Meta (insights por <code class='mono'>campaign_id</code>, que já é a chave que gravamos) numa tabela de spend diário.",
		"Médio",
	],
	[
		"Motivo de perda",
		"12 leads foram para <code class='mono'>perdido</code> e <code class='mono'>notes</code> está NULL nos 12. Perda por sumiço e reprovação da administradora viram a mesma linha.",
		"Enum <code class='mono'>lost_reason</code> obrigatório na transição, com opção para o worker (inatividade) e para a mesa (manual).",
		"Baixo",
	],
	[
		"Saúde do sinal de mídia",
		"28 de 45 <code class='mono'>chat_iniciado</code> falharam na Meta e nenhuma tela lê <code class='mono'>conversion_events</code>. A otimização da campanha está cega e ninguém foi avisado.",
		"Um cartão na one-page lendo status da tabela + corrigir o disparo (hoje sai sem telefone e a Meta recusa por dado insuficiente).",
		"Baixo",
	],
	[
		"Meta do mês",
		"Não existe tabela de objetivo. “Estamos bem?” hoje não tem resposta possível — só “estamos assim”.",
		"Tabela simples de meta por mês (contratos e R$), editável no admin. Sem isso o painel informa, mas não cobra.",
		"Baixo",
	],
	[
		"Avaliação de conversa ligada",
		"A rubrica de 6 dimensões existe e funciona, mas só dispara no handoff do WhatsApp: 2 de 131 conversas avaliadas. A web, que é a maioria, nunca é avaliada.",
		"Chamar <code class='mono'>triggerEvalScoring</code> também no encerramento da conversa web. A capacidade já está construída — está desligada.",
		"Baixo",
	],
];

const FASES = [
	[
		"Fase 1",
		"A tela que já dá para usar",
		[
			"<b>Corrigir a âncora do anti-eco</b> — sem isso a tabela de campanha nasce mentindo",
			"Endpoint <code class='mono'>/api/admin/one-page</code> compondo o que já existe",
			"Os 5 KPIs com tendência vs. período anterior",
			"Funil único de 7 etapas",
			"Tabela de campanhas com alerta de campanha sem conversa",
		],
		"Nada de novo no banco. É composição.",
	],
	[
		"Fase 2",
		"Fechar as lacunas baratas",
		[
			"<code class='mono'>lost_reason</code> na transição para perdido",
			"Valor do bem gravado no lead",
			"Cartão de saúde do sinal Meta",
			"Tabela de meta do mês",
		],
		"Quatro mudanças pequenas de schema; cada uma acende um bloco da tela.",
	],
	[
		"Fase 3",
		"Ligar o que está desligado",
		[
			"Avaliação automática da conversa web",
			"Widgets para os 25 scores órfãos do Langfuse",
			"Custo por conversa cruzando <code class='mono'>sessionId</code> com <code class='mono'>conversationId</code>",
		],
		"Zero dado novo — só passar a olhar o que já é produzido.",
	],
	[
		"Fase 4",
		"Sair da tela",
		[
			"Resumo diário por e-mail às 8h",
			"Export CSV do funil e das campanhas",
			"Investimento da Meta via Marketing API → CPL e ROAS reais",
		],
		"O painel passa a procurar o gestor, em vez de esperar.",
	],
];

const ARMADILHAS = [
	[
		"O denominador que mente",
		"Somar robô e gente no mesmo total fazia a tela mostrar 0,056% de visita→conversa quando a taxa sobre gente é 1,15%. Hoje 87% das linhas de <code class='mono'>visits</code> são máquina.",
		"perigo",
	],
	[
		"O funil que cresce",
		"Sem exigir <code class='mono'>visit_id</code>, conversa sem origem entrava no meio do funil e o resultado passava do topo — 328%.",
		"perigo",
	],
	[
		"O eco do prefetch",
		"Uma navegação virava quatro chegadas. 390 de 756 num único dia, e só no tráfego pago.",
		"alerta",
	],
	[
		"A nota que elogia a derrota",
		"O juiz LLM deu 0,923 de “a venda andou” no turno que anunciou “pré-cadastrado no Itaú” — com zero propostas no banco. Juiz é hipótese; sinal determinístico é prova.",
		"perigo",
	],
	[
		"Média de tempo",
		"Média de dias no funil é o número mais enganoso da operação; a mesa tem p50 de 401 h e um caso de 11 h. Sempre mediana e p90, nunca média.",
		"alerta",
	],
	[
		"A tela que a mesa não abre",
		"Toda a instrumentação de mesa (fila sem dono, SLA, p50/p90) vive em telas que o papel <code class='mono'>mesa_externa</code> não tem permissão de abrir.",
		"alerta",
	],
];

const tb = document.getElementById("tbl-lacunas");
if (tb)
	tb.innerHTML = LACUNAS.map(
		(l) =>
			"<tr><td><b>" +
			l[0] +
			'</b></td><td class="mini">' +
			l[1] +
			'</td><td class="mini">' +
			l[2] +
			"</td>" +
			'<td class="rt"><span class="tag ' +
			(l[3] === "Baixo" ? "ok" : "warn") +
			'">' +
			l[3] +
			"</span></td></tr>",
	).join("");

const fs = document.getElementById("fases");
if (fs)
	fs.innerHTML = FASES.map(
		(f) =>
			'<div class="card" style="box-shadow:0 0 0 1px var(--border)"><div class="card-h">' +
			'<div class="eyebrow">' +
			f[0] +
			'</div><h3 style="font-size:14px;margin-top:4px">' +
			f[1] +
			"</h3></div>" +
			'<div class="card-b"><ul class="lista" style="font-size:12.5px">' +
			f[2].map((i) => "<li>" + i + "</li>").join("") +
			'</ul><p class="mini" style="margin-top:9px;font-style:italic">' +
			f[3] +
			"</p></div></div>",
	).join("");

const ar = document.getElementById("armadilhas");
if (ar)
	ar.innerHTML = ARMADILHAS.map(
		(a) =>
			'<div class="prd-nota ' + a[2] + '" style="margin:0"><b>' + a[0] + "</b>" + a[1] + "</div>",
	).join("");

// ---------- Inicialização dos blocos de negócio e do diário ----------
montarGraficoOrigem(document.getElementById("graf-origem"));
montarCriativos(document.getElementById("tbl-criativos"));
montarBullets(document.getElementById("bullets"));
montarFraseDia(document.getElementById("frase-dia"));
montarAlertasDia(document.getElementById("alertas-dia"));
montarKPIsDia(document.getElementById("kpis-dia"));
montarTabelaOntem(document.querySelector("#tbl-ontem"));
montarAcaoDia(document.querySelector("#tbl-acao-dia"));
montarQuentesDia(document.getElementById("quentes-dia"));
desenharSerie(document.getElementById("grafico-dia"), D.serie);
