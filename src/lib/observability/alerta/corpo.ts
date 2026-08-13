// O corpo do alerta — e-mail e ocorrência do Cortex saem daqui.
//
// Função PURA de propósito: é ela que os testes exercitam, e é ela que garante
// que o e-mail continua legível quando o Langfuse não respondeu (dossiê vazio)
// em vez de sair um HTML quebrado ou, pior, um e-mail vazio que parece ruído.
import type { Dossie, TurnoDoDossie } from "./dossie";

function escapar(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function hora(iso: string): string {
	// Horário de Brasília — quem lê o alerta está aqui, não em UTC.
	try {
		return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
	} catch {
		return iso;
	}
}

/** Os scores que explicam o defeito. A ordem é a de leitura: primeiro o
 *  determinístico (o que o servidor PROVA), depois o dos juízes. */
const SCORES_EM_DESTAQUE = [
	"tool_falhou",
	"tool_falha_nome",
	"tool_falha_tipo",
	"gate_entregue",
	"gate_afundado",
	"turno_mudo",
	"gate",
	"finish_reason",
	"handoff",
	"lead_stage",
	"judge_avancou",
	"judge_resolved",
	"judge_tone",
	"judge_hallucination",
];

function scoresRelevantes(t: TurnoDoDossie): string[] {
	return SCORES_EM_DESTAQUE.filter((n) => t.scores[n] !== undefined).map(
		(n) => `${n}=${t.scores[n]}`,
	);
}

/** Assunto: precisa dizer o defeito e o canal sem que ninguém abra o e-mail. */
export function assuntoDoAlerta(d: Dossie): string {
	const canais = [...new Set(d.turnos.map((t) => t.canal))].filter((c) => c !== "desconhecido");
	const sufixo = canais.length > 0 ? ` · ${canais.join("/")}` : "";
	return `[Aja Agora · ${d.alerta.severity}] ${d.alerta.message.title}${sufixo}`;
}

/** Versão em texto — é ela que vira a descrição da ocorrência no Cortex, que
 *  renderiza TEXTO PURO (markdown vira lixo na tela do card). */
export function corpoTexto(d: Dossie): string {
	const l: string[] = [];
	l.push(d.alerta.message.title);
	l.push("");
	l.push(d.alerta.message.body);
	l.push("");
	l.push(`Severidade: ${d.alerta.severity}`);
	l.push(`Janela: ${hora(d.alerta.fromTimestamp)} até ${hora(d.alerta.toTimestamp)}`);
	if (d.alerta.permalink) l.push(`Monitor: ${d.alerta.permalink}`);
	l.push("");

	if (d.turnos.length === 0) {
		// Sem isto o leitor conclui "não houve turno" — quando o que houve foi a
		// consulta não responder. Ausência de dado e dado ausente não são a mesma
		// coisa e o e-mail precisa dizer qual dos dois é.
		l.push(
			"Nenhum turno pôde ser recuperado para esta janela (a consulta ao Langfuse não respondeu ou o filtro não casou). Abra o monitor pelo link acima.",
		);
		return l.join("\n");
	}

	l.push(
		`TURNOS NA JANELA (${d.turnos.length}${d.turnosOmitidos > 0 ? ` de ${d.turnos.length + d.turnosOmitidos}` : ""}):`,
	);
	l.push("");
	for (const t of d.turnos) {
		l.push("────────────────────────────────────────");
		l.push(`${hora(t.inicio)} · canal ${t.canal}${t.userId ? ` · ${t.userId}` : ""}`);
		if (t.sessionId) l.push(`sessão ${t.sessionId}`);
		l.push(`${t.entradaEhDirective ? "DIRECTIVE DO SERVIDOR" : "CLIENTE"}: ${t.entrada}`);
		l.push(`AGENTE: ${t.saida || "(não escreveu nada — turno mudo)"}`);
		if (t.toolsChamadas.length > 0) l.push(`tools: ${t.toolsChamadas.join(", ")}`);
		if (t.toolsQueFalharam.length > 0)
			l.push(`TOOLS QUE FALHARAM: ${t.toolsQueFalharam.join(", ")}`);
		for (const e of t.erros) l.push(`ERRO: ${e}`);
		const s = scoresRelevantes(t);
		if (s.length > 0) l.push(`scores: ${s.join(" · ")}`);
		l.push(`trace: ${t.url}`);
		l.push("");
	}
	if (d.turnosOmitidos > 0) {
		l.push(
			`(+${d.turnosOmitidos} turno(s) na mesma janela não incluídos aqui — veja o monitor para a lista completa.)`,
		);
	}
	return l.join("\n");
}

/** Versão HTML — mesma informação, legível no cliente de e-mail. */
export function corpoHtml(d: Dossie): string {
	const cabecalho = `
		<h2 style="margin:0 0 4px;font:600 18px system-ui">${escapar(d.alerta.message.title)}</h2>
		<p style="margin:0 0 16px;color:#444;font:14px system-ui">${escapar(d.alerta.message.body)}</p>
		<p style="margin:0 0 16px;font:13px system-ui;color:#666">
			Severidade <strong>${escapar(d.alerta.severity)}</strong> ·
			janela ${escapar(hora(d.alerta.fromTimestamp))} → ${escapar(hora(d.alerta.toTimestamp))}
			${d.alerta.permalink ? ` · <a href="${escapar(d.alerta.permalink)}">abrir o monitor</a>` : ""}
		</p>`;

	if (d.turnos.length === 0) {
		return `<div>${cabecalho}<p style="font:14px system-ui">Nenhum turno pôde ser recuperado para esta janela (a consulta ao Langfuse não respondeu ou o filtro não casou).</p></div>`;
	}

	const turnos = d.turnos
		.map((t) => {
			const linhas: string[] = [];
			linhas.push(
				`<div style="font:12px system-ui;color:#666;margin-bottom:6px">${escapar(hora(t.inicio))} · canal <strong>${escapar(t.canal)}</strong>${t.userId ? ` · ${escapar(t.userId)}` : ""}${t.sessionId ? ` · sessão ${escapar(t.sessionId)}` : ""}</div>`,
			);
			linhas.push(
				`<div style="font:14px system-ui;margin:2px 0"><strong>${t.entradaEhDirective ? "Directive do servidor" : "Cliente"}:</strong> ${escapar(t.entrada)}</div>`,
			);
			linhas.push(
				`<div style="font:14px system-ui;margin:2px 0"><strong>Agente:</strong> ${
					t.saida ? escapar(t.saida) : "<em>não escreveu nada — turno mudo</em>"
				}</div>`,
			);
			if (t.toolsChamadas.length > 0) {
				linhas.push(
					`<div style="font:13px system-ui;color:#444;margin:2px 0">tools: ${escapar(t.toolsChamadas.join(", "))}</div>`,
				);
			}
			if (t.toolsQueFalharam.length > 0) {
				linhas.push(
					`<div style="font:13px system-ui;color:#b00;margin:2px 0"><strong>tools que falharam:</strong> ${escapar(t.toolsQueFalharam.join(", "))}</div>`,
				);
			}
			for (const e of t.erros) {
				linhas.push(
					`<div style="font:13px system-ui;color:#b00;margin:2px 0">erro: ${escapar(e)}</div>`,
				);
			}
			const s = scoresRelevantes(t);
			if (s.length > 0) {
				linhas.push(
					`<div style="font:12px ui-monospace,monospace;color:#555;margin:6px 0">${escapar(s.join(" · "))}</div>`,
				);
			}
			linhas.push(
				`<div style="font:13px system-ui;margin-top:6px"><a href="${escapar(t.url)}">abrir o trace</a></div>`,
			);
			return `<div style="border-left:3px solid #ddd;padding:10px 14px;margin:0 0 14px">${linhas.join("")}</div>`;
		})
		.join("");

	const rodape =
		d.turnosOmitidos > 0
			? `<p style="font:13px system-ui;color:#666">+${d.turnosOmitidos} turno(s) na mesma janela não incluídos aqui.</p>`
			: "";

	return `<div style="max-width:720px">${cabecalho}<h3 style="font:600 15px system-ui;margin:0 0 10px">Turnos na janela</h3>${turnos}${rodape}</div>`;
}
