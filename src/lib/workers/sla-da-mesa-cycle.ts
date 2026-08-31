// src/lib/workers/sla-da-mesa-cycle.ts
//
// A campainha do D3 (SLA de resposta humana) e do E1 (SLA de documentos
// pós-proposta) — os dois itens do plano que sobraram como "medição sim,
// alarme não".
//
// ── O que a medição achou ───────────────────────────────────────────────────
//
// Nos 6 handoffs de toda a base: p50 de 401,5 h aberto (16,7 dias), p90 de
// 485,2 h. Metade de um mês é a MEDIANA, não a cauda. E `handoff_notifications`
// tem zero linhas em toda a base — o caminho mudou (o atendente atende pelo
// painel, não pelo WhatsApp), então nem o registro de notificação existe mais.
//
// ── Por que não é um Monitor do Langfuse, que era o previsto ────────────────
//
// Monitor observa TRACE. Handoff parado é ausência de trace: o lead esquecido
// há 16 dias não gera evento nenhum — é justamente por isso que ninguém o viu.
// Alarme que dispara com evento não pega silêncio.
//
// E o que já estava entregue era uma TELA (a lista de parados no painel de
// Performance). O incidente que motiva o item é sobre coisa que ninguém abriu;
// trocar uma tela que ninguém abre por outra tela que ninguém abre não é
// entrega. Isto aqui vai atrás de quem decide.
//
// ── Por que aqui, no worker, e não numa rota de cron ────────────────────────
//
// Não existe rota de cron no projeto. O que existe é o worker BullMQ que já
// roda em ECS (`aja-agora-worker-prod`) com quatro ciclos. Este é o quinto, e
// entra com um job repetível PRÓPRIO — o `repeat` do BullMQ é quem garante uma
// execução por período, mesmo com mais de uma instância do worker de pé. Sem
// isso, o ciclo de 30s mandaria 2.880 e-mails por dia.

import {
	computeLeadsParados,
	type LeadParado,
	marcarSlaAlertado,
} from "@/lib/admin/handoff-queries";
import { sendEmail } from "@/lib/email/sendgrid";

/** 24 h. Um dia útil inteiro sem ninguém tocar num lead que a mesa já recebeu é
 *  o mínimo defensável — e ainda assim é 16× mais rápido que a mediana atual. */
const LIMITE_PADRAO_HORAS = 24;

/** Quanto tempo separa dois ciclos — o `repeat` do job em `gate-reengage-poll.ts`
 *  deriva daqui. Não é mais a largura de nenhuma janela: o dedup passou a ser
 *  por marca no banco (ver abaixo). */
export const INTERVALO_DO_CICLO_HORAS = 24;

export type ResultadoSlaDaMesa = {
	/** Quem ainda não tinha sido alertado — os nomes que vão no e-mail. */
	novos: number;
	/** Quem já recebeu aviso em algum ciclo anterior — vira contagem, não lista. */
	jaAlertados: number;
	enviado: boolean;
};

/** O limite, do ambiente, com guarda contra typo.
 *
 *  `Number("vinte e quatro")` é `NaN`, e `NaN` chegaria no SQL como
 *  `make_interval(hours => NaN)`: a consulta quebra e o alarme fica mudo por
 *  causa de um erro de digitação na configuração. Justamente o modo de falha
 *  que este ciclo existe para eliminar. */
function limiteHoras(env = process.env): number {
	const bruto = Number(env.SLA_MESA_LIMITE_HORAS);
	return Number.isFinite(bruto) && bruto > 0 ? bruto : LIMITE_PADRAO_HORAS;
}

/** Destinatários. Vazio = não envia.
 *
 *  Mesma regra da rota de alerta do Langfuse (`alerta-langfuse/route.ts`):
 *  default vazio + parâmetro explícito. E-mail cravado em código é como alerta
 *  de um domínio termina na caixa de outro numa cópia de arquivo. */
function destinatarios(env = process.env): string[] {
	return (env.ALERTA_SLA_MESA_TO ?? "")
		.split(",")
		.map((e) => e.trim())
		.filter(Boolean);
}

/** Horas em dias, que é como se decide o que fazer.
 *
 *  "401,5 h" obriga quem lê a dividir de cabeça antes de entender o tamanho do
 *  problema; "16,7 dias" já é a informação. */
function emDias(horas: number): string {
	return `${(horas / 24).toFixed(1).replace(".", ",")} dias`;
}

function linhaDeTexto(p: {
	nome: string | null;
	telefone: string | null;
	estagio: string;
	horasParado: number;
}): string {
	// Lead sem nome não vira linha anônima: o telefone é o que permite AGIR, e
	// esconder a linha por falta de nome sumiria justamente com o lead que
	// ninguém cadastrou direito.
	const quem = p.nome ?? "(sem nome)";
	const fone = p.telefone ?? "(sem telefone)";
	return `• ${quem} — ${fone} — ${p.estagio} — parado há ${emDias(p.horasParado)}`;
}

/**
 * Um ciclo do alarme. Silencioso quando a mesa está em dia.
 *
 * Nunca lança: o worker roda outros quatro ciclos na mesma tarefa, e uma falha
 * de SendGrid não pode levar junto o re-engajamento do funil.
 */
export async function runSlaDaMesaCycle(): Promise<ResultadoSlaDaMesa> {
	const limite = limiteHoras();
	const parados = await computeLeadsParados(limite);

	// ── Só quem ainda NÃO foi alertado ───────────────────────────────────────
	//
	// A primeira versão mandava a lista inteira a cada ciclo. Com o estado real
	// medido (~24 leads na allowlist, p50 de 16,7 dias), a mesa receberia os
	// mesmos ~24 nomes todo dia e criaria um filtro de caixa de entrada — o modo
	// de falha que este arquivo nomeia duas vezes.
	//
	// A segunda deduplicava por JANELA (parado entre `limite` e
	// `limite + intervalo`). Funciona enquanto todo ciclo roda: um deploy, um
	// restart de task no ECS ou um blip do Redis, e o lead que cruzou durante a
	// lacuna chega ao ciclo seguinte já fora da janela — vira contagem no rodapé
	// e nunca é alertado individualmente. O alarme pulando em silêncio
	// exatamente o lead esquecido que ele existe para pegar.
	//
	// A marca não tem esse buraco: quem não foi anunciado continua pendente por
	// quanto tempo durar a lacuna. Ela vive em `leads.sla_alertado_em`, e não em
	// `lead_events`, porque aquela tabela É o relógio do SLA — escrever nela
	// faria o lead parecer tocado e sair da lista.
	// O critério é EPISÓDIO, não vida do lead: alerta quem nunca foi avisado, e
	// também quem foi avisado ANTES da última movimentação de estágio.
	//
	// `slaAlertadoEm !== null` sozinho silenciava o lead para sempre. Com p50 de
	// 16,7 dias, "esquecido, resgatado e esquecido de novo" não é caso exótico —
	// e o segundo abandono chegava mudo, contado só no rodapé. O discriminante
	// já vinha na consulta: `desdeISO` é `max(lead_events.created_at)`, o mesmo
	// relógio que define o SLA. Aviso anterior a ele = episódio novo.
	const ehEpisodioNovo = (p: LeadParado) =>
		p.slaAlertadoEm === null || p.slaAlertadoEm < p.desdeISO;
	const novos = parados.filter(ehEpisodioNovo);
	const jaAlertados = parados.filter((p) => !ehEpisodioNovo(p));

	if (novos.length === 0) {
		return { novos: 0, jaAlertados: jaAlertados.length, enviado: false };
	}

	const para = destinatarios();
	if (para.length === 0) {
		console.error(
			`[sla-da-mesa] ${novos.length} lead(s) parados além de ${limite}h, mas ALERTA_SLA_MESA_TO está vazio — nenhum e-mail enviado`,
		);
		return { novos: novos.length, jaAlertados: jaAlertados.length, enviado: false };
	}

	// Mais antigo primeiro — é ele que a mesa tem que ligar agora.
	const lista = [...novos].sort((a, b) => b.horasParado - a.horasParado);
	const pior = lista[0];

	const plural = lista.length === 1 ? "1 lead parado" : `${lista.length} leads parados`;
	const subject = `[AJA] ${plural} — o mais antigo há ${emDias(pior.horasParado)}`;

	// A pilha antiga entra como NÚMERO, nunca como lista de nomes: silenciar o
	// já-avisado é o objetivo, apagá-lo faria a mesa perder a noção do tamanho da
	// pilha — e é ela que diz se a situação melhora ou piora.
	const maisAntigo = jaAlertados.reduce((a, p) => (p.horasParado > a ? p.horasParado : a), 0);
	const rodape =
		jaAlertados.length === 0
			? []
			: [
					`Além destes, ${jaAlertados.length} lead(s) continuam parados e já foram avisados antes — o mais antigo há ${emDias(maisAntigo)}. Não são repetidos aqui todo dia de propósito; a lista completa está em /admin/performance.`,
				];

	const text = [
		`${plural} há mais de ${limite}h sem nenhuma movimentação de estágio, e ainda sem aviso.`,
		"",
		...lista.map(linhaDeTexto),
		"",
		...rodape,
		"O relógio é a última transição de estágio (lead_events), não a última escrita na linha.",
		"Lista completa e p50/p90 por sub-etapa: /admin/performance",
	].join("\n");

	const html = [
		`<p><b>${plural}</b> há mais de ${limite}h sem nenhuma movimentação de estágio, e ainda sem aviso.</p>`,
		"<ul>",
		...lista.map(
			(p) =>
				`<li><b>${p.nome ?? "(sem nome)"}</b> — ${p.telefone ?? "(sem telefone)"} — ${p.estagio} — parado há <b>${emDias(p.horasParado)}</b></li>`,
		),
		"</ul>",
		...rodape.map((linha) => `<p>${linha}</p>`),
		'<p style="color:#666;font-size:13px">O relógio é a última transição de estágio (<code>lead_events</code>), não a última escrita na linha. Lista completa e p50/p90 por sub-etapa em <code>/admin/performance</code>.</p>',
	].join("\n");

	try {
		await sendEmail({ to: para.join(","), subject, html, text });
	} catch (erro) {
		console.error("[sla-da-mesa] envio falhou:", erro);
		// NÃO marca. Marcar um lead cujo e-mail falhou o silenciaria para sempre —
		// o alarme perderia justamente quem ele não conseguiu anunciar.
		return { novos: lista.length, jaAlertados: jaAlertados.length, enviado: false };
	}

	// Só depois do envio confirmado.
	await marcarSlaAlertado(lista.map((p) => p.leadId));

	console.log(
		`[sla-da-mesa] alerta enviado: ${lista.length} novo(s) além de ${limite}h · ${jaAlertados.length} já avisados`,
	);
	return { novos: lista.length, jaAlertados: jaAlertados.length, enviado: true };
}
