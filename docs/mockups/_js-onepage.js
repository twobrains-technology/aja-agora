// ================= A DOBRA: tudo que decide, em UMA tela =================

// Funil compacto: 7 degraus em linha, com a queda entre cada par
function montarFunilLinha(el) {
	const f = D.total;
	const et = [
		{ r: "Pessoas", n: f.pessoas },
		{ r: "Conversas", n: f.conversas },
		{ r: "Identificados", n: f.identificados },
		{ r: "Viram oferta", n: f.viu_oferta },
		{ r: "Propostas", n: f.propostas },
		{ r: "Na mesa", n: f.handoffs },
		{ r: "Fechados", n: f.fechados },
	];
	el.innerHTML = et
		.map((e, i) => {
			const ant = i ? et[i - 1].n : null;
			const pass = ant ? (100 * e.n) / ant : null;
			const pior = pass !== null && pass < 35;
			return (
				(i
					? '<div class="fl-seta" aria-hidden="true">' +
						'<span class="' +
						(pior ? "pior" : "") +
						'">' +
						pass.toFixed(0) +
						"%</span>›</div>"
					: "") +
				'<div class="fl-item' +
				(e.n === 0 ? " zero" : "") +
				'">' +
				'<b class="figure">' +
				fmt.format(e.n) +
				"</b><span>" +
				e.r +
				"</span></div>"
			);
		})
		.join("");
}

// Origem compacta: só a barra de pipeline contra a de público
function montarOrigemCompacta(el) {
	const dados = D.por_origem.slice().sort((a, b) => b.pct_publico - a.pct_publico);
	el.innerHTML = dados
		.map((o) => {
			const morto = o.pct_pipeline === 0;
			return (
				'<div class="oc">' +
				'<div class="oc-rot">' +
				o.origem +
				"</div>" +
				'<div class="oc-b"><div class="oc-t"><div class="oc-f pub" style="width:' +
				Math.max(0.8, o.pct_publico) +
				'%"></div></div>' +
				"<b>" +
				o.pct_publico.toString().replace(".", ",") +
				"%</b></div>" +
				'<div class="oc-b"><div class="oc-t"><div class="oc-f pip' +
				(morto ? " zero" : "") +
				'" style="width:' +
				Math.max(0.8, o.pct_pipeline) +
				'%"></div></div>' +
				"<b" +
				(morto ? ' class="nulo"' : "") +
				">" +
				o.pct_pipeline.toString().replace(".", ",") +
				"%</b></div>" +
				"</div>"
			);
		})
		.join("");
}

// Fila de ação enxuta: só o que está vivo
function montarFilaCurta(el) {
	const vivos = D.mesa
		.filter((m) => m.raia !== "perdido")
		.map((m) => ({
			est: "bad",
			rot: "Esperando",
			nome: m.nome,
			onde: "Aguardando pagamento · " + (m.adm || ""),
			valor: m.valor,
			dias: m.dias,
		}))
		.concat(
			D.acao
				.filter((a) => a.raia !== "sem lead")
				.map((a) => ({
					est: "warn",
					rot: "Sem toque",
					nome: a.nome,
					onde: "Viu oferta · " + raia(a.raia) + " · " + a.msgs + " msgs",
					valor: null,
					dias: a.dias,
				})),
		);
	vivos.sort((x, y) => y.dias - x.dias);
	const mortos = D.mesa.filter((m) => m.raia === "perdido").length;
	el.innerHTML =
		vivos
			.slice(0, 4)
			.map(
				(l) =>
					"<tr><td>" +
					tag(l.est, l.rot) +
					"</td><td><b>" +
					l.nome +
					"</b></td>" +
					'<td class="mini">' +
					l.onde +
					"</td>" +
					'<td class="rt">' +
					(l.valor ? "<b>" + brl(l.valor) + "</b>" : '<span class="mini">—</span>') +
					"</td>" +
					'<td class="rt"><b>' +
					l.dias +
					"d</b></td></tr>",
			)
			.join("") +
		'<tr><td colspan="5" class="mini" style="padding-top:9px">' +
		"<b>+" +
		(D.quentes.reduce((a, q) => a + q.n, 0) - vivos.length) +
		" leads qualificados</b> parados de 9 a 15 dias · " +
		mortos +
		" handoffs com o lead já encerrado e o registro aberto (falso alarme, não fila).</td></tr>";
}

// Os 4 KPIs, versão curta
function montarKPIsCurto(el) {
	const sm = D.semana;
	const taxa = (100 * sm.leads) / sm.conversas,
		taxaAnt = (100 * sm.ant_leads) / sm.ant_conversas;
	const kpis = [
		{
			ico: "dinheiro",
			rot: "Propostas na semana",
			val: sm.propostas,
			tag: tag("bad", "era " + sm.ant_propostas + " · última em 26/08"),
			pe: "Acumulado <b>" + D.total.propostas + "</b> · " + brl(D.total.pipeline) + " em cartas",
		},
		{
			ico: "relogio",
			rot: "Parado na mesa",
			val: D.mesa.filter((m) => m.raia !== "perdido").length,
			tag: tag("bad", D.mesa[0].dias + " dias o mais antigo"),
			pe: "<b>" + brl(211258) + "</b> aguardando pagamento há 20 dias",
		},
		{
			ico: "pessoa",
			rot: "Conversa vira lead",
			val: taxa.toFixed(0).replace(".", ",") + "<small>%</small>",
			tag: delta(Math.round((100 * (taxa - taxaAnt)) / taxaAnt), true),
			pe: "era <b>" + taxaAnt.toFixed(0) + "%</b> na semana anterior",
		},
		{
			ico: "antena",
			rot: "Retorno do anúncio pago",
			val: "R$&nbsp;0",
			tag: tag("bad", "53,6% do público"),
			pe: "<b>" + fmt.format(D.por_origem[0].pessoas) + " pessoas</b>, nenhuma proposta",
		},
	];
	el.innerHTML = kpis
		.map(
			(k) =>
				'<div class="card"><div class="kpi kpi-curto">' +
				'<div class="rot">' +
				ICO[k.ico] +
				k.rot +
				"</div>" +
				'<div class="val figure">' +
				k.val +
				"</div>" +
				'<div style="margin:4px 0 3px">' +
				k.tag +
				"</div>" +
				'<p class="pe">' +
				k.pe +
				"</p></div></div>",
		)
		.join("");
}

function montarAlertasCurto(el) {
	const as = [
		{
			cls: "critico",
			ico: "parar",
			rot: "Pare esta campanha",
			txt: "<b>1.273 pessoas, 0 conversas.</b> Veem 0,8 seção contra 5,1 do orgânico.",
		},
		{
			cls: "critico",
			ico: "relogio",
			rot: "Dinheiro parado",
			txt: "<b>" + brl(211258) + " há 20 dias</b> aguardando pagamento, sem ninguém atuando.",
		},
		{
			cls: "atencao",
			ico: "antena",
			rot: "A Meta otimiza no escuro",
			txt: "<b>28 de 45 avisos falharam.</b> Nenhum e-mail capturado em 40 leads.",
		},
	];
	el.innerHTML = as
		.map(
			(a) =>
				'<div class="al al-curto ' +
				a.cls +
				'">' +
				ICO[a.ico] +
				'<div class="txt"><b>' +
				a.rot +
				"</b>" +
				a.txt +
				"</div></div>",
		)
		.join("");
}
