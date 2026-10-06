// A borda que TORNA VISÍVEL a falha do LLM — log estruturado e alerta.
//
// A classificação pura mora em `erro-do-llm.ts`; aqui é o I/O: uma linha de log
// parseável para todo erro e, no caso de billing, o alerta pelo caminho que já
// existe no projeto (`sendEmail` via SendGrid + ocorrência no Cortex), com
// dedupe de 1 h por tipo.
//
// O destinatário é o JÁ CONFIGURADO no projeto (`ALERTA_OBSERVABILIDADE_TO`,
// o mesmo da rota `api/observability/alerta-langfuse`) — nenhum endereço novo
// entra no código. Sem a env, o alerta NÃO é enviado e isso vira log de erro,
// nunca silêncio.
//
// Dedupe em MEMÓRIA do processo: cobre a rajada de 29 erros iguais por hora
// que motivou o bloco. Não sobrevive a restart nem é compartilhado entre
// instâncias do ECS — limitação conhecida; persistir exigiria migration, que
// não pertence a este bloco.

import { sendEmail } from "@/lib/email/sendgrid";
import { abrirOcorrenciaNoCortex } from "@/lib/observability/alerta/cortex";
import { classificarErroDoLlm, type TipoDeErroDoLlm } from "./erro-do-llm";

const JANELA_DEDUPE_MS = 60 * 60 * 1000;

/** O instante do último alerta por tipo. `Map` para o dedupe ser por tipo, como
 *  o bloco pede — hoje só `billing` alerta, mas a chave já é o tipo. */
const ultimoAlertaPorTipo = new Map<TipoDeErroDoLlm, number>();

/** `true` quando já passou a janela desde o último alerta deste tipo. */
function deveAlertar(
	tipo: TipoDeErroDoLlm,
	agoraMs: number,
	janelaMs: number = JANELA_DEDUPE_MS,
): boolean {
	const ultimo = ultimoAlertaPorTipo.get(tipo);
	return ultimo === undefined || agoraMs - ultimo >= janelaMs;
}

/** Marca o alerta deste tipo como emitido agora. */
function marcarAlerta(tipo: TipoDeErroDoLlm, agoraMs: number): void {
	ultimoAlertaPorTipo.set(tipo, agoraMs);
}

/** Só para teste — devolve o dedupe ao estado inicial. */
export function resetarDedupeDeAlerta(): void {
	ultimoAlertaPorTipo.clear();
}

function mensagemDoErro(err: unknown): string {
	if (err instanceof Error) return err.message;
	return typeof err === "string" ? err : "erro desconhecido";
}

/** Uma linha JSON parseável — é o que um `grep '[llm-erro]'` no log de
 *  container encontra, e o que o alerta consome. */
function logEstruturadoDoErro(tipo: TipoDeErroDoLlm, err: unknown): void {
	console.error(
		`[llm-erro] ${JSON.stringify({
			tipo,
			mensagem: mensagemDoErro(err),
			quando: new Date().toISOString(),
		})}`,
	);
}

function corpoDoAlertaDeBilling(err: unknown): string {
	return [
		"O gateway de LLM respondeu sem crédito (billing).",
		"",
		"Enquanto isso, todo turno de agente falha e o cliente recebe um erro em vez de resposta.",
		"",
		`Erro: ${mensagemDoErro(err)}`,
		`Quando: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
		"",
		"Ação: conferir o saldo/crédito no gateway antes de reativar a operação.",
	].join("\n");
}

/** Destinatários do projeto. Mesma env da rota de alerta do Langfuse; sem ela o
 *  alerta é logado como erro de configuração, não enviado a lugar nenhum. */
function destinatarios(env: Record<string, string | undefined> = process.env): string[] {
	return (env.ALERTA_OBSERVABILIDADE_TO ?? "")
		.split(",")
		.map((e) => e.trim())
		.filter(Boolean);
}

/** Manda o e-mail e abre a ocorrência. Nunca lança: alerta é observabilidade,
 *  não pode derrubar o turno que já falhou. */
async function dispararAlerta(
	tipo: TipoDeErroDoLlm,
	err: unknown,
): Promise<{ email: boolean; cortex: boolean }> {
	if (tipo !== "billing") return { email: false, cortex: false };

	const assunto = "[Aja Agora] LLM sem crédito (billing)";
	const texto = corpoDoAlertaDeBilling(err);
	const paraQuem = destinatarios();

	let email = false;
	if (paraQuem.length === 0) {
		console.error(
			"[llm-erro] ALERTA_OBSERVABILIDADE_TO ausente — alerta de billing NÃO enviado por e-mail",
		);
	} else {
		try {
			await Promise.all(
				paraQuem.map((to) =>
					sendEmail({ to, subject: assunto, html: texto.replace(/\n/g, "<br>"), text: texto }),
				),
			);
			email = true;
		} catch (e) {
			console.error("[llm-erro] envio do alerta falhou:", e);
		}
	}

	let cortex = false;
	try {
		const ocorrencia = await abrirOcorrenciaNoCortex({
			titulo: assunto,
			descricao: texto,
			prioridade: "urgent",
		});
		cortex = ocorrencia.aberta;
	} catch (e) {
		console.error("[llm-erro] ocorrência no Cortex falhou:", e);
	}

	return { email, cortex };
}

/**
 * Registra a falha do LLM: log estruturado sempre; alerta (e-mail + Cortex)
 * quando billing e fora da janela de dedupe. É este o ponto único chamado pelas
 * bordas (webhook do WhatsApp, chat web). Nunca lança.
 */
export async function registrarFalhaDoLlm(
	err: unknown,
	contexto: Record<string, unknown> = {},
	agoraMs: number = Date.now(),
): Promise<void> {
	const tipo = classificarErroDoLlm(err);
	logEstruturadoDoErro(tipo, err);

	if (tipo !== "billing" || !deveAlertar(tipo, agoraMs)) return;

	// Contexto só no log de alerta — nunca vai ao cliente.
	if (Object.keys(contexto).length > 0) {
		console.error(`[llm-erro] alerta de billing ${JSON.stringify(contexto)}`);
	}

	// A janela só é consumida quando ALGO saiu. Marcar antes de enviar faz um
	// SendGrid fora do ar comprar 1 h de silêncio — o oposto do que este bloco
	// existe para fazer.
	const { email, cortex } = await dispararAlerta(tipo, err);
	if (email || cortex) marcarAlerta(tipo, agoraMs);
}