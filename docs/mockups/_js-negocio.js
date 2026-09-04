// ================= Blocos de leitura de negócio =================

// ---------- Gráfico: para onde vai o público × de onde vem o dinheiro ----------
// Barras pareadas, UM eixo só (ambas as séries são percentual do total, então
// compartilham escala de verdade — não é eixo duplo disfarçado).
function montarGraficoOrigem(el) {
	const dados = D.por_origem.slice().sort((a, b) => b.pct_publico - a.pct_publico);
	const max = 100;
	const linhas = dados
		.map((o) => {
			const larguraPub = Math.max(0.6, o.pct_publico);
			const larguraPip = Math.max(0.6, o.pct_pipeline);
			const morto = o.pct_pipeline === 0;
			return (
				'<div class="og">' +
				'<div class="og-rot">' +
				o.origem +
				"<span>" +
				fmt.format(o.pessoas) +
				" pessoas · " +
				o.conversas +
				" conversas · " +
				(o.propostas
					? o.propostas + " proposta" + (o.propostas > 1 ? "s" : "")
					: "nenhuma proposta") +
				"</span></div>" +
				'<div class="og-barras">' +
				'<div class="og-par"><span class="og-leg">Público</span>' +
				'<div class="og-trilho"><div class="og-fill pub" style="width:' +
				larguraPub +
				'%"></div></div>' +
				"<b>" +
				o.pct_publico.toString().replace(".", ",") +
				"%</b></div>" +
				'<div class="og-par"><span class="og-leg">Pipeline</span>' +
				'<div class="og-trilho"><div class="og-fill pip' +
				(morto ? " zero" : "") +
				'" style="width:' +
				larguraPip +
				'%"></div></div>' +
				"<b>" +
				o.pct_pipeline.toString().replace(".", ",") +
				"%</b></div>" +
				"</div>" +
				'<div class="og-vered">' +
				(morto ? tag("bad", "não gerou R$") : tag("ok", brl(o.valor))) +
				"</div>" +
				"</div>"
			);
		})
		.join("");
	el.innerHTML =
		'<div class="legenda">' +
		'<span><i style="background:#036eff"></i>Fatia do público que chegou</span>' +
		'<span><i style="background:#0481a0"></i>Fatia do pipeline em R$ que saiu dali</span>' +
		"</div>" +
		linhas;
}

// ---------- Criativos: qual anúncio funciona ----------
function montarCriativos(el) {
	const cs = D.criativos.slice().sort((a, b) => {
		const ta = a.conversas / a.pessoas,
			tb = b.conversas / b.pessoas;
		if (tb !== ta) return tb - ta;
		return b.pessoas - a.pessoas;
	});
	const rede = { ig: "Instagram", an: "Audience Network", fb: "Facebook" };
	el.innerHTML = cs
		.map((c) => {
			const taxa = (100 * c.conversas) / c.pessoas;
			const sec = c.secoes === null ? 0 : c.secoes;
			let est, rot;
			if (taxa >= 10) {
				est = "ok";
				rot = "O que funciona";
			} else if (taxa >= 2) {
				est = "neutro";
				rot = "Aceitável";
			} else if (sec < 0.5) {
				est = "bad";
				rot = "Não chega a ler a página";
			} else {
				est = "warn";
				rot = "Fraco";
			}
			const orgânico = c.criativo.indexOf("_") > 0;
			return (
				"<tr>" +
				"<td>" +
				tag(est, rot) +
				"</td>" +
				"<td>" +
				(orgânico
					? "<b>" + c.criativo + '</b><div class="mini">orgânico, não pago</div>'
					: '<span class="mono" style="font-size:12px">…' +
						c.criativo.slice(-9) +
						'</span><div class="mini">' +
						(rede[c.rede] || c.rede) +
						"</div>") +
				"</td>" +
				'<td class="rt">' +
				fmt.format(c.pessoas) +
				"</td>" +
				'<td class="rt"><b>' +
				sec.toString().replace(".", ",") +
				"</b></td>" +
				'<td class="rt">' +
				c.conversas +
				"</td>" +
				'<td class="rt"><b>' +
				taxa.toFixed(2).replace(".", ",") +
				"</b></td>" +
				'<td class="rt">' +
				c.leads +
				"</td></tr>"
			);
		})
		.join("");
}

// ---------- Bullets do especialista ----------
function montarBullets(el) {
	const grupos = [
		{
			tit: "Pare de pagar por isto",
			ico: "parar",
			cls: "bad",
			itens: [
				"<b>Nenhum criativo do Instagram pago gerou uma única conversa.</b> São 9 anúncios e 1.847 pessoas, todos com 0,0 a 0,4 seção vista por visita — a pessoa nem rola a página. Não é um criativo fraco: é o conjunto inteiro.",
				"<b>54% do público veio de anúncio e produziu 0% do pipeline.</b> Os R$ 1,47 milhão em cartas na rua saíram de tráfego que não custou nada.",
				"<b>O Audience Network é o único posicionamento pago que respira</b> — 3,7% de conversa e 2,1 seções vistas. Se a verba tem que ir para algum lugar hoje, é para lá, não para o feed do Instagram.",
			],
		},
		{
			tit: "Dobre a aposta aqui",
			ico: "sobe",
			cls: "ok",
			itens: [
				"<b>O link na bio do Instagram converte 39,4%</b> — 33 pessoas viraram 13 conversas e 7 leads. É a maior taxa de toda a operação, 12× a média, e ninguém está alimentando esse canal.",
				"<b>O mesmo Instagram funciona sem pagar e não funciona pagando.</b> Isso desmonta a hipótese de “o público do Instagram não compra consórcio” — o problema é o anúncio e a segmentação, não a rede.",
				"<b>“Orgânico com UTM” é 1,1% do público e 48% do pipeline.</b> Antes de comprar mais tráfego, vale perguntar por que o que já funciona recebe tão pouco volume.",
			],
		},
		{
			tit: "Pontos de atenção antes de decidir",
			ico: "alerta",
			cls: "warn",
			itens: [
				"<b>Não sabemos o tamanho do prejuízo, só que ele existe.</b> Sem custo de mídia no banco, dá para dizer que 2.516 pessoas não geraram receita, mas não se isso custou R$ 500 ou R$ 50 mil. É a primeira lacuna a fechar.",
				"<b>“Direto” não quer dizer orgânico.</b> São 30% do público e metade do pipeline, mas parte disso é anúncio que perdeu o UTM no caminho. Enquanto o rastro não fechar, o crédito está sendo dado ao lugar errado.",
				"<b>“Vindo de outro site” traz 739 pessoas, converte 3,5% e não gerou uma proposta.</b> Volume decente, resultado zero — vale entender que sites são esses antes de tratá-los como ganho.",
				"<b>O sinal que a Meta recebe está quebrado</b> (28 de 45 eventos falham). Enquanto o algoritmo aprender com dado incompleto, trocar de criativo tende a repetir o mesmo público ruim.",
			],
		},
		{
			tit: "O que eu mediria a partir de amanhã",
			ico: "olho",
			cls: "neutro",
			itens: [
				"<b>Seções vistas por visita é o alarme antecipado.</b> Abaixo de 0,5 nenhum criativo desta base converteu; acima de 1,3, todos converteram. Dá para reprovar um anúncio em 24 h, sem esperar o funil inteiro.",
				"<b>Custo por conversa, não por clique.</b> Clique aqui é barato e inútil; a unidade que importa é quanto custa alguém que escreve a primeira mensagem.",
				"<b>Pipeline por origem, em R$ e não em contagem.</b> É o único corte que mostrou diferença real entre canais — leads por origem são parecidos, o dinheiro não.",
			],
		},
	];
	el.innerHTML = grupos
		.map(
			(g) =>
				'<div class="bl-grupo"><div class="bl-tit">' +
				ICO[g.ico] +
				"<span>" +
				g.tit +
				"</span></div>" +
				'<ul class="bl-lista">' +
				g.itens.map((i) => "<li>" + i + "</li>").join("") +
				"</ul></div>",
		)
		.join("");
}
