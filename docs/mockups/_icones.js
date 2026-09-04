// Ícones lucide inline — estado NUNCA só por cor: todo rótulo de estado carrega forma própria.
const ICO = {
	alerta:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
	relogio:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
	parar:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/></svg>',
	ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>',
	sobe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
	desce:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
	igual:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 9h14"/><path d="M5 15h14"/></svg>',
	dinheiro:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20"/><path d="M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
	chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
	pessoa:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
	aperto:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 1 0-2.8L17 5"/><path d="m21 3-2.7 2.7a2 2 0 0 1-2.8 0l-1-1a2 2 0 0 0-2.8 0L9 7.6"/><path d="m3 21 2.7-2.7"/></svg>',
	olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></svg>',
	antena:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.9 19.1A7 7 0 0 1 4.9 9"/><path d="M7.8 16.2a3 3 0 0 1 0-4.3"/><circle cx="12" cy="14" r="2"/><path d="M16.2 16.2a3 3 0 0 0 0-4.3"/><path d="M19.1 19.1a7 7 0 0 0 0-10.1"/></svg>',
};
const fmt = new Intl.NumberFormat("pt-BR");
const brl = (v) =>
	"R$ " +
	new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
function tag(estado, texto) {
	const map = {
		ok: ["ok", "ok"],
		warn: ["warn", "alerta"],
		bad: ["bad", "alerta"],
		neutro: ["neutro", "igual"],
	};
	const m = map[estado] || map.neutro;
	return '<span class="tag ' + m[0] + '">' + ICO[m[1]] + texto + "</span>";
}
function delta(pct, maiorEhMelhor) {
	if (pct === null || pct === undefined)
		return '<span class="tag neutro">' + ICO.igual + "sem base</span>";
	const bom = maiorEhMelhor ? pct > 0 : pct < 0;
	const ico = pct > 0 ? ICO.sobe : pct < 0 ? ICO.desce : ICO.igual;
	const palavra =
		pct === 0
			? "igual à semana anterior"
			: bom
				? "melhor que a semana anterior"
				: "pior que a semana anterior";
	const cls = pct === 0 ? "neutro" : bom ? "ok" : "bad";
	return (
		'<span class="tag ' +
		cls +
		'">' +
		ico +
		(pct > 0 ? "+" : "") +
		pct.toString().replace(".", ",") +
		"% · " +
		palavra +
		"</span>"
	);
}

const RAIA = {
	novo: "Novo",
	engajado: "Engajado",
	qualificado: "Qualificado",
	em_negociacao: "Em negociação",
	proposta_enviada: "Proposta enviada",
	na_administradora: "Na administradora",
	em_atendimento: "Em atendimento",
	aguardando_pagamento: "Aguardando pagamento",
	fechado_ganho: "Fechado ganho",
	perdido: "Perdido",
	"sem lead": "Não deixou contato",
};
function raia(k) {
	return RAIA[k] || k.replace(/_/g, " ");
}
