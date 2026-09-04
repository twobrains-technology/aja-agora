// ================= ABA DIÁRIA =================
const O = D.ontem,
	M7 = D.media7;

function vsMedia(valor, media, maiorEhMelhor) {
	if (!media) return tag("neutro", "sem base de comparação");
	const pct = Math.round((100 * (valor - media)) / media);
	if (Math.abs(pct) < 12) return tag("neutro", ICO ? "na média dos 7 dias" : "na média");
	const bom = maiorEhMelhor ? pct > 0 : pct < 0;
	return tag(bom ? "ok" : "bad", (pct > 0 ? "+" : "") + pct + "% vs. a média de 7 dias");
}

function montarFraseDia(el) {
	el.innerHTML =
		'<div class="fr">Ontem entraram <b>' +
		O.conversas +
		" conversas</b> — a média dos 7 dias anteriores é " +
		M7.conversas.toString().replace(".", ",") +
		". <b>Nenhuma virou lead</b>, e <b>" +
		D.quentes.reduce((s, q) => s + q.n, 0) +
		" clientes qualificados</b> seguem parados esperando alguém.</div>";
}

function montarAlertasDia(el) {
	const as = [
		{
			cls: "critico",
			ico: "relogio",
			rot: "Dia sem lead",
			txt: "<b>As 2 conversas de ontem morreram na primeira mensagem.</b> Nenhuma virou lead e nenhuma chegou a ver uma oferta. Foi o pior dia da série de 17 dias.",
			acao: "Ler as 2 conversas",
		},
		{
			cls: "critico",
			ico: "dinheiro",
			rot: "Dinheiro parado",
			txt:
				"<b>Uma proposta de " +
				brl(211258) +
				" no Itaú está aguardando pagamento há 20 dias</b>, com o handoff aberto e ninguém atuando.",
			acao: "Cobrar hoje",
		},
		{
			cls: "atencao",
			ico: "antena",
			rot: "Anúncio sem retorno",
			txt: "<b>Uma das 2 conversas veio de anúncio pago</b> — e o pago já acumula 53,6% do público com <b>zero</b> em pipeline.",
			acao: "Ver aba semanal",
		},
	];
	el.innerHTML = as
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
		.join("");
}

function montarKPIsDia(el) {
	const kpis = [
		{
			ico: "pessoa",
			rot: "Pessoas na página",
			val: fmt.format(O.pessoas),
			sufixo: "",
			tag: vsMedia(O.pessoas, M7.pessoas, true),
			pe:
				"Média dos 7 dias anteriores: " +
				M7.pessoas.toString().replace(".", ",") +
				" por dia. O tráfego não foi o problema de ontem.",
		},
		{
			ico: "chat",
			rot: "Conversas iniciadas",
			val: O.conversas,
			sufixo: "",
			tag: vsMedia(O.conversas, M7.conversas, true),
			pe:
				"Média: " +
				M7.conversas.toString().replace(".", ",") +
				" por dia. De 182 pessoas na página, 2 puxaram assunto — <b>1,1%</b>.",
		},
		{
			ico: "olho",
			rot: "Viram uma oferta",
			val: O.viram_oferta,
			sufixo: "",
			tag: tag("bad", "nenhuma chegou ao preço"),
			pe: "Ninguém chegou a ver carta de crédito na tela. É o degrau onde a venda começa a existir.",
		},
		{
			ico: "dinheiro",
			rot: "Leads e propostas",
			val: O.leads + " / " + O.propostas,
			sufixo: "",
			tag: vsMedia(O.leads, M7.leads, true),
			pe: "Nenhum lead identificado e nenhuma proposta nova. A última proposta na Bevi foi em <b>26/08</b>, há 9 dias.",
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

function montarTabelaOntem(el) {
	el.innerHTML = O.detalhe
		.map(
			(c) =>
				"<tr><td><b>" +
				c.hora +
				"</b></td><td>" +
				(c.canal === "web" ? "Site" : "WhatsApp") +
				"</td>" +
				"<td>" +
				c.origem +
				"</td>" +
				'<td class="rt">' +
				tag("bad", c.msgs + " mensagem") +
				"</td>" +
				'<td class="mini">' +
				raia(c.estagio) +
				"</td></tr>",
		)
		.join("");
}

function montarAcaoDia(el) {
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
				vivo: vivo,
			};
		})
		.concat(
			D.acao
				.filter((a) => a.raia !== "sem lead")
				.slice(0, 3)
				.map((a) => ({
					est: "warn",
					rot: "Sem toque",
					nome: a.nome,
					onde: "Viu oferta · " + raia(a.raia) + " · " + a.msgs + " mensagens",
					valor: null,
					dias: a.dias,
					vivo: true,
				})),
		);
	linhas.sort((x, y) => (y.vivo ? 1 : 0) - (x.vivo ? 1 : 0) || y.dias - x.dias);
	el.innerHTML = linhas
		.map(
			(l) =>
				"<tr" +
				(l.vivo ? "" : ' style="opacity:.6"') +
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
				(l.valor ? "<b>" + brl(l.valor) + "</b>" : '<span class="mini">sem proposta</span>') +
				"</td>" +
				'<td class="rt"><b>' +
				l.dias +
				" dias</b></td></tr>",
		)
		.join("");
}

function montarQuentesDia(el) {
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
