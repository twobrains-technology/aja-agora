// ---------- Série diária: linha, eixo ÚNICO ----------
// Conversas e leads compartilham escala de verdade (mesma unidade, mesma ordem
// de grandeza). Pessoas/dia ficaria em outra escala e viraria eixo duplo — o
// erro nº 1 de gráfico —, então não entra aqui.
function desenharSerie(el, serie) {
	const W = 760,
		H = 210,
		m = { t: 14, r: 16, b: 30, l: 32 };
	const iw = W - m.l - m.r,
		ih = H - m.t - m.b;
	const max = Math.max(4, ...serie.map((d) => Math.max(d.conversas, d.leads)));
	const x = (i) => m.l + (i * iw) / (serie.length - 1);
	const y = (v) => m.t + ih - (v / max) * ih;
	const linha = (k) =>
		serie.map((d, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(d[k]).toFixed(1)).join(" ");

	const ticks = [0, Math.round(max / 2), max];
	const grid = ticks
		.map(
			(t) =>
				'<line x1="' +
				m.l +
				'" x2="' +
				(W - m.r) +
				'" y1="' +
				y(t) +
				'" y2="' +
				y(t) +
				'" stroke="#e4e2d6"/>' +
				'<text x="' +
				(m.l - 7) +
				'" y="' +
				(y(t) + 4) +
				'" text-anchor="end" font-size="10.5" fill="#6b6b66">' +
				t +
				"</text>",
		)
		.join("");

	const rotulos = serie
		.map((d, i) => {
			if (i % 3 !== 0 && i !== serie.length - 1) return "";
			return (
				'<text x="' +
				x(i) +
				'" y="' +
				(H - 9) +
				'" text-anchor="middle" font-size="10.5" fill="#6b6b66">' +
				d.dia.slice(8, 10) +
				"/" +
				d.dia.slice(5, 7) +
				"</text>"
			);
		})
		.join("");

	// Dia com proposta é evento raro nesta operação — merece marca explícita e rótulo.
	const props = serie
		.map((d, i) => {
			if (!d.propostas) return "";
			return (
				'<line x1="' +
				x(i) +
				'" x2="' +
				x(i) +
				'" y1="' +
				m.t +
				'" y2="' +
				(m.t + ih) +
				'" stroke="#d62b3a" stroke-width="1.5" stroke-dasharray="3 3"/>' +
				'<circle cx="' +
				x(i) +
				'" cy="' +
				m.t +
				'" r="4" fill="#d62b3a"/>'
			);
		})
		.join("");

	// Ontem, destacado — é o assunto deste relatório.
	const iu = serie.length - 1;
	const ontem =
		'<rect x="' +
		(x(iu) - 13) +
		'" y="' +
		m.t +
		'" width="26" height="' +
		ih +
		'" fill="#021628" opacity=".06"/>' +
		'<text x="' +
		x(iu) +
		'" y="' +
		(m.t - 3) +
		'" text-anchor="middle" font-size="10" font-weight="700" fill="#021628">ontem</text>';

	const pts = (k, cor) =>
		serie
			.map(
				(d, i) =>
					'<circle cx="' +
					x(i) +
					'" cy="' +
					y(d[k]) +
					'" r="3.2" fill="' +
					cor +
					'" stroke="#fff" stroke-width="2"/>',
			)
			.join("");

	const alvos = serie
		.map(
			(d, i) =>
				'<rect class="hit" x="' +
				(x(i) - 11) +
				'" y="' +
				m.t +
				'" width="22" height="' +
				ih +
				'" fill="transparent" ' +
				'data-i="' +
				i +
				'" tabindex="0" role="img" aria-label="' +
				d.dia +
				": " +
				d.conversas +
				" conversas, " +
				d.leads +
				' leads"/>',
		)
		.join("");

	el.innerHTML =
		'<div class="legenda">' +
		'<span><i style="background:#036eff"></i>Conversas</span>' +
		'<span><i style="background:#0481a0"></i>Leads</span>' +
		'<span><i style="background:#d62b3a;border-radius:99px"></i>Dia com proposta na Bevi</span></div>' +
		'<svg viewBox="0 0 ' +
		W +
		" " +
		H +
		'" width="100%" height="' +
		H +
		'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Conversas e leads por dia, 18/08 a 03/09">' +
		grid +
		ontem +
		props +
		'<path d="' +
		linha("conversas") +
		'" fill="none" stroke="#036eff" stroke-width="2" stroke-linejoin="round"/>' +
		'<path d="' +
		linha("leads") +
		'" fill="none" stroke="#0481a0" stroke-width="2" stroke-linejoin="round"/>' +
		pts("conversas", "#036eff") +
		pts("leads", "#0481a0") +
		rotulos +
		alvos +
		'</svg><div class="tip" hidden></div>';

	const tip = el.querySelector(".tip");
	el.querySelectorAll(".hit").forEach((r) => {
		function entrar() {
			const d = serie[+r.dataset.i];
			tip.hidden = false;
			tip.innerHTML =
				"<b>" +
				d.dia.split("-").reverse().join("/") +
				"</b>" +
				'<span><i style="background:#036eff"></i>' +
				d.conversas +
				" conversas</span>" +
				'<span><i style="background:#0481a0"></i>' +
				d.leads +
				" leads</span>" +
				(d.propostas
					? '<span><i style="background:#d62b3a;border-radius:99px"></i>' +
						d.propostas +
						" proposta</span>"
					: "");
			tip.style.left = (+r.dataset.i / (serie.length - 1)) * 100 + "%";
		}
		r.addEventListener("mouseenter", entrar);
		r.addEventListener("focus", entrar);
	});
	el.addEventListener("mouseleave", () => {
		tip.hidden = true;
	});
}
