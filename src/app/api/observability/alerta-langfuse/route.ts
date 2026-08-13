// Receptor do webhook dos Monitors do Langfuse.
//
// Por que existe: os Monitors do Langfuse mandam alerta para Slack, webhook ou
// GitHub Actions — **não existe saída de e-mail** (e Monitors/Automations não
// têm API pública, então nem dá para versionar a configuração deles em script).
// O Kairo quer o alerta no e-mail, com o trace cruzado, e quer uma ocorrência
// aberta no Cortex. Este endpoint é a ponte: recebe o `monitor-alert`,
// reconstrói os turnos da janela pela API do Langfuse (`dossie.ts`), manda o
// e-mail e abre a ocorrência.
//
// Ordem deliberada: **o e-mail sai primeiro**. O Cortex é integração de
// terceiro; se ele estiver fora, o alerta ainda tem que chegar em quem decide.
// A recíproca não vale — por isso o Cortex nunca bloqueia o e-mail.
import { type NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/sendgrid";
import { validarAssinaturaLangfuse } from "@/lib/observability/alerta/assinatura";
import { assuntoDoAlerta, corpoHtml, corpoTexto } from "@/lib/observability/alerta/corpo";
import { abrirOcorrenciaNoCortex, prioridadeDaSeveridade } from "@/lib/observability/alerta/cortex";
import { type AlertaDoMonitor, montarDossie } from "@/lib/observability/alerta/dossie";

export const runtime = "nodejs";
/** Alerta é evento — nada aqui pode ser servido de cache. */
export const dynamic = "force-dynamic";

// FIX-431 (P2 #17) — SEM default de destinatário no código.
//
// A regra de isolamento da casa é "default vazio + parâmetro explícito": e-mail
// cravado em código é como um alerta do domínio A acaba caindo na caixa do
// domínio B numa cópia de arquivo. O endereço vem de `ALERTA_OBSERVABILIDADE_TO`
// e ponto; sem ele a rota registra erro de configuração e NÃO envia — silêncio
// declarado é melhor que entrega para o lugar errado.
export function destinatarios(env: Record<string, string | undefined> = process.env): string[] {
	return (env.ALERTA_OBSERVABILIDADE_TO ?? "")
		.split(",")
		.map((e) => e.trim())
		.filter(Boolean);
}

type EnvelopeWebhook = {
	type?: string;
	apiVersion?: string;
	payload?: AlertaDoMonitor;
};

export async function POST(req: NextRequest) {
	const segredo = process.env.LANGFUSE_WEBHOOK_SECRET;
	if (!segredo) {
		// Sem segredo configurado o endpoint fica FECHADO. A alternativa (aceitar
		// sem validar) transforma a rota num botão público para disparar e-mail e
		// abrir ocorrência em nome do nosso monitoramento.
		console.error("[alerta] LANGFUSE_WEBHOOK_SECRET ausente — webhook recusado");
		return NextResponse.json({ erro: "webhook não configurado" }, { status: 503 });
	}

	// O corpo CRU é o que foi assinado — reserializar o JSON muda bytes e
	// invalida o HMAC.
	const corpoCru = await req.text();
	const assinatura = validarAssinaturaLangfuse({
		corpoCru,
		header: req.headers.get("x-langfuse-signature"),
		segredo,
	});
	if (!assinatura.valida) {
		console.error(`[alerta] assinatura recusada: ${assinatura.motivo}`);
		return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
	}

	let envelope: EnvelopeWebhook;
	try {
		envelope = JSON.parse(corpoCru) as EnvelopeWebhook;
	} catch {
		return NextResponse.json({ erro: "corpo não é JSON" }, { status: 400 });
	}

	// O Langfuse manda mais de um tipo de evento no mesmo webhook (prompt-version,
	// project-notification). 200 sem agir: recusar faria o Langfuse contar como
	// falha de entrega — e cinco falhas seguidas DESABILITAM a automação sozinhas.
	if (envelope.type !== "monitor-alert" || !envelope.payload) {
		return NextResponse.json({ ok: true, ignorado: envelope.type ?? "sem-tipo" });
	}

	const alerta = envelope.payload;
	const dossie = await montarDossie(alerta);
	const assunto = assuntoDoAlerta(dossie);
	const texto = corpoTexto(dossie);

	const paraQuem = destinatarios();
	let emailEnviado = false;
	if (paraQuem.length === 0) {
		console.error(
			"[alerta] ALERTA_OBSERVABILIDADE_TO ausente — alerta NÃO enviado por e-mail (configure a env)",
		);
	} else {
		try {
			await Promise.all(
				paraQuem.map((to) =>
					sendEmail({ to, subject: assunto, html: corpoHtml(dossie), text: texto }),
				),
			);
			emailEnviado = true;
		} catch (err) {
			console.error("[alerta] envio de e-mail falhou:", err);
		}
	}

	const ocorrencia = await abrirOcorrenciaNoCortex({
		titulo: assunto,
		descricao: texto,
		prioridade: prioridadeDaSeveridade(alerta.severity),
	});

	console.log(
		JSON.stringify({
			level: "warn",
			source: "alerta-langfuse",
			monitor_id: alerta.monitorId,
			severidade: alerta.severity,
			turnos: dossie.turnos.length,
			turnos_omitidos: dossie.turnosOmitidos,
			email_enviado: emailEnviado,
			ocorrencia_aberta: ocorrencia.aberta,
			ocorrencia_motivo: ocorrencia.motivo ?? null,
		}),
	);

	// 200 mesmo com falha parcial: o alerta JÁ foi processado, e devolver erro
	// faria o Langfuse reenfileirar e, na quinta falha, desabilitar a automação.
	// O que falhou está no log e no corpo da resposta.
	return NextResponse.json({
		ok: true,
		turnos: dossie.turnos.length,
		email: emailEnviado,
		cortex: ocorrencia.aberta,
	});
}
