// ================= ABA 1 — a tela =================
const D = DADOS;

// ---------- Funil ----------
function montarFunil(el, etapas) {
	const topo = etapas[0].n;
	el.innerHTML = etapas
		.map((e, i) => {
			const ant = i ? etapas[i - 1].n : null;
			const pass = ant ? (100 * e.n) / ant : 100;
			const perdeu = ant ? ant - e.n : 0;
			// O número mora SEMPRE dentro da barra. A barra tem largura mínima justamente
			// para caber o rótulo — posicionar o número por porcentagem o fazia colidir
			// com a barra nos degraus pequenos, que são a maioria deste funil.
			const larg = Math.max(0, (100 * e.n) / topo);
			return (
				'<div class="f-linha">' +
				'<div class="f-rot">' +
				e.rot +
				(e.sub ? "<span>" + e.sub + "</span>" : "") +
				"</div>" +
				'<div class="f-trilho"><div class="f-barra" style="width:' +
				larg +
				'%">' +
				"<span>" +
				fmt.format(e.n) +
				"</span></div></div>" +
				'<div class="f-num">' +
				(ant
					? "<b>" +
						pass.toFixed(1).replace(".", ",") +
						'%</b> passou<br><span class="f-queda">−' +
						fmt.format(perdeu) +
						"</span> aqui"
					: "topo do funil") +
				"</div></div>"
			);
		})
		.join("");
}

// ---------- Leads quentes parados ----------
function montarQuentes(el) {
	const max = Math.max.apply(
		null,
		D.quentes.map((d) => d.n),
	);
	const rot = {
		em_negociacao: "Em negociação",
		qualificado: "Qualificado",
		aguardando_pagamento: "Aguardando pagamento",
		proposta_enviada: "Proposta enviada",
	};
	el.innerHTML = D.quentes
		.map(
			(d) =>
				'<div class="bl">' +
				'<div class="fill' +
				(d.dias_media >= 14 ? " alerta" : "") +
				'" style="width:' +
				(100 * d.n) / max +
				'%"></div>' +
				'<div class="rot">' +
				(rot[d.raia] || d.raia) +
				'<span class="tag ' +
				(d.dias_media >= 14 ? "bad" : "warn") +
				'">' +
				ICO.relogio +
				d.dias_media +
				" dias parados</span></div>" +
				'<div class="v">' +
				d.n +
				"</div></div>",
		)
		.join("");
}

// ---------- Onde a conversa morre ----------
function montarMortes(el) {
	const f = D.engajamento.por_faixa_msgs.slice().sort((a, b) => {
		const o = { "1 msg": 0, "2-3": 1, "4-8": 2, "9+": 3 };
		return o[a.faixa] - o[b.faixa];
	});
	const total = f.reduce((s, x) => s + x.n, 0);
	const rot = {
		"1 msg": "Escreveu 1 mensagem e sumiu",
		"2-3": "2 a 3 mensagens",
		"4-8": "4 a 8 mensagens",
		"9+": "9 ou mais mensagens",
	};
	el.innerHTML = f
		.map(
			(x, i) =>
				'<div class="bl">' +
				'<div class="fill' +
				(i === 0 ? " alerta" : "") +
				'" style="width:' +
				((100 * x.n) / total) * 2.4 +
				'%"></div>' +
				'<div class="rot">' +
				rot[x.faixa] +
				"</div>" +
				'<div class="v">' +
				x.n +
				' <span class="mini">(' +
				Math.round((100 * x.n) / total) +
				"%)</span></div></div>",
		)
		.join("");
}

// ---------- Saúde dos sinais ----------
function montarSaude(el) {
	const itens = [
		{
			ico: "antena",
			t: "Envio de conversão para a Meta",
			estado: "bad",
			rot: "QUEBRADO",
			txt: "28 de 45 envios de <b>chat_iniciado</b> falharam: “dados de parâmetros do cliente insuficientes”. 14 continuam pendentes. O algoritmo da Meta está otimizando às cegas.",
		},
		{
			ico: "olho",
			t: "Avaliação de qualidade da conversa",
			estado: "warn",
			rot: "QUASE SEM COBERTURA",
			txt: "2 de 131 conversas avaliadas (1,5%). O eval automático só dispara no handoff do WhatsApp — a web, que é a maioria, nunca é avaliada.",
		},
		{
			ico: "chat",
			t: "Turnos sem resposta do agente",
			estado: "warn",
			rot: "11 CASOS",
			txt: "11 mensagens de cliente ficaram sem resposta (1,8% de 606 turnos). Baixo em percentual, fatal em unidade.",
		},
		{
			ico: "aperto",
			t: "Atrito na página",
			estado: "warn",
			rot: "AÇÃO PENDENTE",
			txt: "72 cliques de raiva no período; o alvo nº 1 é o botão <b>“Fale no WhatsApp”</b> (10). O botão de maior intenção é o que mais irrita — e o WhatsApp gerou só 7 das 131 conversas.",
		},
		{
			ico: "alerta",
			t: "Teste da equipe entra como cliente",
			estado: "warn",
			rot: "FILTRADO À MÃO",
			txt: "Os números desta tela já excluem o teste interno, mas isso foi feito <b>por fora</b>: a flag <b>is_simulated</b> não marca teste feito em produção. Precisa virar um campo no cadastro do contato.",
		},
		{
			ico: "relogio",
			t: "Observabilidade do agente",
			estado: "bad",
			rot: "INACESSÍVEL",
			txt: "As credenciais do Langfuse no secret de produção retornam HTTP 403 em toda a API pública — custo, latência e os ~41 scores por turno não são consultáveis hoje.",
		},
	];
	el.innerHTML = itens
		.map(
			(i) =>
				'<div class="card" style="box-shadow:0 0 0 1px var(--border)"><div class="kpi">' +
				'<div class="rot">' +
				ICO[i.ico] +
				i.t +
				"</div>" +
				'<div style="margin:7px 0 8px">' +
				tag(i.estado, i.rot) +
				"</div>" +
				'<p class="mini" style="line-height:1.5">' +
				i.txt +
				"</p></div></div>",
		)
		.join("");
}

// ---------- Ação: os mais quentes ----------
function montarAcao(el) {
	el.innerHTML = D.acao_agora.itens
		.map((i) => {
			const grave = i.dias_sem_toque >= 9;
			return (
				"<tr><td><b>" +
				i.nome +
				'</b><div class="mini">' +
				i.msgs +
				" mensagens trocadas</div></td>" +
				'<td class="mini">' +
				i.raia.replace("_", " ") +
				"</td>" +
				'<td class="rt">' +
				tag(grave ? "bad" : "warn", i.dias_sem_toque + " dias sem toque") +
				"</td></tr>"
			);
		})
		.join("");
}

// ---------- A frase do topo (template com variáveis, nunca texto fixo) ----------
function montarFrase(el) {
	const p = D.total.propostas,
		v = brl(D.total.pipeline),
		f = D.total.fechados;
	const parados = D.mesa.length;
	const dias = D.mesa[0].dias;
	el.innerHTML =
		'<div class="fr">' +
		"<b>" +
		p +
		" propostas</b> e <b>" +
		v +
		"</b> em cartas na rua; " +
		(f ? f + " venda(s) fechada(s)" : "<b>nenhuma venda</b>") +
		" — <b>" +
		parados +
		" leads</b> esperam a mesa há <b>" +
		dias +
		" dias</b>." +
		"</div>";
}

// ---------- Alertas: 3 visíveis ----------
function montarAlertas(el) {
	const as = [
		{
			cls: "critico",
			ico: "relogio",
			rot: "Mesa parada",
			txt: "<b>4 casos entregues à mesa continuam sem desfecho — o mais antigo há 25 dias.</b> Em 3 deles o lead já virou perdido e o handoff nunca foi encerrado.",
			acao: "Distribuir por nome hoje",
		},
		{
			cls: "critico",
			ico: "parar",
			rot: "Parar campanha",
			txt: "<b>A campanha …207680104 (Instagram) trouxe 1.273 pessoas e nenhuma conversa.</b> Cada visita vê 0,8 seção da página, contra 5,1 do orgânico — a pessoa chega, olha o topo e sai.",
			acao: "Pausar e realocar",
		},
		{
			cls: "atencao",
			ico: "alerta",
			rot: "A Meta otimiza no escuro",
			txt: "<b>28 dos 45 avisos de “chat iniciado” não chegaram ao Facebook</b>, e nenhum e-mail foi capturado em 49 leads. O algoritmo aprende com dado incompleto — é a causa provável do público errado acima.",
			acao: "Abrir chamado",
		},
	];
	el.innerHTML =
		as
			.map(
				(a) =>
					'<div class="al ' +
					a.cls +
					'">' +
					ICO[a.ico] +
					'<div class="txt"><b>' +
					a.rot +
					"</b>" +
					a.txt +
					"</div>" +
					'<span class="acao">' +
					a.acao +
					" →</span></div>",
			)
			.join("") +
		'<div class="mini" style="padding-left:4px">Outros 6 sinais foram rebaixados a e-mail ou ao rodapé — alerta que nunca desliga vira papel de parede.</div>';
}

// ---------- Sparkline (contexto temporal sem ocupar um bloco) ----------
function spark(vals, cor) {
	const W = 110,
		H = 26,
		max = Math.max.apply(null, vals) || 1;
	const pts = vals
		.map(
			(v, i) =>
				((i * W) / (vals.length - 1)).toFixed(1) + "," + (H - 2 - (v / max) * (H - 5)).toFixed(1),
		)
		.join(" ");
	return (
		'<svg class="spark" viewBox="0 0 ' +
		W +
		" " +
		H +
		'" width="' +
		W +
		'" height="' +
		H +
		'" aria-hidden="true">' +
		'<polyline points="' +
		pts +
		'" fill="none" stroke="' +
		cor +
		'" stroke-width="1.6" stroke-linejoin="round"/></svg>'
	);
}

// ---------- Os 4 KPIs ----------
function montarKPIs(el) {
	const sm = D.semana;
	const dPessoas = Math.round((100 * (sm.pessoas - sm.ant_pessoas)) / sm.ant_pessoas);
	const dConv = Math.round((100 * (sm.conversas - sm.ant_conversas)) / sm.ant_conversas);
	const taxa = (100 * sm.leads) / sm.conversas,
		taxaAnt = (100 * sm.ant_leads) / sm.ant_conversas;
	const dTaxa = Math.round((100 * (taxa - taxaAnt)) / taxaAnt);
	const serie = D.serie.slice(-14);
	const kpis = [
		{
			ico: "dinheiro",
			rot: "Propostas novas na Bevi",
			val: sm.propostas,
			sufixo: "<small> na semana</small>",
			tag: delta(-100, true),
			pe:
				"Na semana anterior foi " +
				sm.ant_propostas +
				". Acumulado: <b>" +
				D.total.propostas +
				" propostas</b> · " +
				brl(D.total.pipeline) +
				" · ticket " +
				brl(D.total.ticket) +
				". A última foi em <b>26/08</b>.",
		},
		{
			ico: "relogio",
			rot: "Casos parados na mesa",
			val: D.mesa.length,
			sufixo: "",
			tag: tag("bad", D.mesa[0].dias + " dias o mais antigo"),
			pe:
				"Só <b>1 dos " +
				D.mesa.length +
				"</b> tem lead em raia viva (" +
				brl(211258) +
				" aguardando pagamento). " +
				"Nos outros 3 o lead já foi encerrado e o handoff nunca foi fechado.",
		},
		{
			ico: "pessoa",
			rot: "Conversa que vira lead",
			val: taxa.toFixed(1).replace(".", ","),
			sufixo: "<small>%</small>",
			tag: delta(dTaxa, true),
			pe:
				sm.leads +
				" de " +
				sm.conversas +
				" conversas. Na semana anterior: <b>" +
				taxaAnt.toFixed(1).replace(".", ",") +
				"%</b> (" +
				sm.ant_leads +
				" de " +
				sm.ant_conversas +
				").<br>" +
				spark(
					serie.map((x) => x.conversas),
					"#036eff",
				) +
				' <span class="mini">conversas por dia</span>',
		},
		{
			ico: "antena",
			rot: "Público pago que virou R$",
			val: "0",
			sufixo: "<small>%</small>",
			tag: tag("bad", "53,6% do público · R$ 0"),
			pe:
				"Anúncio pago trouxe <b>" +
				fmt.format(D.por_origem[0].pessoas) +
				" pessoas</b> e nenhuma proposta. " +
				"Todo o pipeline saiu de tráfego que não custou nada.",
		},
	];
	el.innerHTML = kpis
		.map(
			(k) =>
				'<div class="card"><div class="kpi">' +
				'<div class="rot">' +
				ICO[k.ico] +
				k.rot +
				"</div>" +
				'<div class="val figure">' +
				k.val +
				k.sufixo +
				"</div>" +
				'<div style="margin:6px 0 2px">' +
				k.tag +
				"</div>" +
				'<p class="pe">' +
				k.pe +
				"</p></div></div>",
		)
		.join("");
}

// ---------- A linha da reunião ----------
function montarProva(el) {
	const t = D.tempo_ate_carta;
	el.innerHTML =
		'<div class="prova-box">' +
		ICO.ok +
		"<div><b>O que a máquina faz bem, e vale dizer em voz alta:</b> " +
		D.total.viu_oferta +
		" pessoas viram uma <b>oferta real de consórcio na tela</b>, com mediana de <b>2 min 30 s</b> e " +
		t.turnos_media.toString().replace(".", ",") +
		" turnos desde o “oi” — inclusive de madrugada " +
		"(11 conversas entre 0h e 6h). Nenhum vendedor humano faz isso às 3 da manhã.</div></div>";
}

// ---------- Placar de responsabilidade ----------
function montarPlacar(el) {
	const maq = [
		["Pessoas que chegaram", fmt.format(D.total.pessoas)],
		["Conversas conduzidas", D.total.conversas],
		["Leads identificados", D.total.identificados],
		["Ofertas reais mostradas", D.total.viu_oferta],
		["Propostas criadas na Bevi", D.total.propostas],
		["Crédito colocado em jogo", brl(D.total.pipeline)],
		["Casos entregues à mesa", D.total.handoffs],
	];
	const mesa = [
		["Casos recebidos", D.total.handoffs],
		["Ainda sem desfecho", D.mesa.length],
		["Mais antigo parado há", D.mesa[0].dias + " dias"],
		["Leads que viraram perdido", "3 dos 4"],
		["Motivo de perda registrado", "nenhum"],
		["Vendas fechadas", D.total.fechados],
	];
	function col(tit, itens, cls, nota) {
		return (
			'<div class="card" style="box-shadow:0 0 0 1px var(--border)"><div class="card-h">' +
			'<h3 style="font-size:14px">' +
			tit +
			'</h3></div><div class="card-b" style="padding-top:8px">' +
			itens
				.map(
					(i) => '<div class="pl"><span>' + i[0] + '</span><b class="num">' + i[1] + "</b></div>",
				)
				.join("") +
			'<p class="mini" style="margin-top:10px;font-style:italic">' +
			nota +
			"</p></div></div>"
		);
	}
	el.innerHTML =
		col(
			"O que o agente entregou",
			maq,
			"ok",
			"Do primeiro “oi” à proposta assinável na administradora, sem ninguém no meio.",
		) +
		col(
			"O que aconteceu depois da entrega",
			mesa,
			"bad",
			"“Concluído” encerra o transbordo — não é venda. Velocidade sozinha ainda não produziu contrato nenhum.",
		);
}

// ---------- Linha de saúde (rodapé colapsado) ----------
function montarResumoSaude(el) {
	el.innerHTML =
		ICO.alerta +
		"<span><b>3 sinais cegos e 3 defeitos abertos</b> — o painel sabe onde ele mesmo não enxerga.</span>" +
		'<span class="mini" style="margin-left:auto">abrir</span>';
}

// ---------- Tabela de ação (a fila real, com o estado do lead junto) ----------
function montarTabelaAcao(el) {
	const linhas = D.mesa
		.map((m) => {
			const vivo = m.raia !== "perdido";
			return {
				est: vivo ? "bad" : "neutro",
				rot: vivo ? "Esperando" : "Encerrado",
				nome: m.nome,
				onde: vivo
					? "Aguardando pagamento · " + (m.adm || "")
					: "Perdido · handoff nunca foi fechado",
				valor: m.valor,
				dias: m.dias,
				dono: "atribuído",
				vivo: vivo,
			};
		})
		.concat(
			D.acao
				.filter((a) => a.raia !== "sem lead")
				.map((a) => ({
					est: "warn",
					rot: "Sem toque",
					nome: a.nome,
					onde: "Viu oferta · " + raia(a.raia) + " · " + a.msgs + " mensagens",
					valor: null,
					dias: a.dias,
					dono: "sem dono",
					vivo: true,
				})),
		);
	linhas.sort((x, y) => (y.vivo ? 1 : 0) - (x.vivo ? 1 : 0) || y.dias - x.dias);
	el.innerHTML =
		linhas
			.map(
				(l) =>
					"<tr" +
					(l.vivo ? "" : ' style="opacity:.62"') +
					">" +
					"<td>" +
					tag(l.est, l.rot) +
					"</td>" +
					"<td><b>" +
					l.nome +
					"</b></td>" +
					'<td class="mini">' +
					l.onde +
					"</td>" +
					'<td class="rt">' +
					(l.valor
						? "<b>" + brl(l.valor) + "</b>"
						: '<span class="mini">sem proposta — valor não é gravado antes dela</span>') +
					"</td>" +
					'<td class="rt"><b>' +
					l.dias +
					" dias</b></td>" +
					'<td class="mini">' +
					l.dono +
					"</td></tr>",
			)
			.join("") +
		'<tr><td colspan="6" class="mini" style="padding-top:12px">' +
		"<b>Leitura obrigatória:</b> 3 das 4 linhas de mesa têm o lead já encerrado e o handoff aberto para sempre — " +
		"sem a coluna de estado, o painel gritaria “4 clientes esperando” todo dia e a equipe aprenderia a ignorá-lo. " +
		"Só a primeira é dinheiro parado de verdade.</td></tr>";
}

// ---------- Inicialização ----------
montarFrase(document.getElementById("frase"));
montarAlertasCurto(document.getElementById("alertas"));
montarKPIsCurto(document.getElementById("kpis"));
montarFilaCurta(document.getElementById("fila-curta"));
montarFunilLinha(document.getElementById("funil-linha"));
montarOrigemCompacta(document.getElementById("origem-curta"));

document.getElementById("tag-acao").innerHTML =
	ICO.alerta + D.quentes.reduce((a, q) => a + q.n, 0) + " leads quentes parados";
montarFunil(document.getElementById("funil"), [
	{ rot: "Pessoas", sub: "visitas contáveis", n: D.total.pessoas },
	{ rot: "Conversas", sub: "puxaram assunto", n: D.total.conversas },
	{ rot: "Identificados", sub: "deram telefone", n: D.total.identificados },
	{ rot: "Viram oferta", sub: "preço real na tela", n: D.total.viu_oferta },
	{ rot: "Propostas", sub: "na administradora", n: D.total.propostas },
	{ rot: "Na mesa", sub: "com um humano", n: D.total.handoffs },
	{ rot: "Fechados", sub: "contrato assinado", n: D.total.fechados },
]);
montarProva(document.getElementById("prova"));
montarPlacar(document.getElementById("placar"));
montarResumoSaude(document.getElementById("resumo-saude"));
montarSaude(document.getElementById("saude"));
