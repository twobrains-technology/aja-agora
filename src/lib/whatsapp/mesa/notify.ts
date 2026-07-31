// Mesa de operação — outbound pro atendente COM espelho pro simulador dev (FIX-173).
//
// Espelha o padrão do sendToAttendant do chat de vendas (proxy.ts): toda mensagem
// que vai pro WhatsApp de um atendente TAMBÉM é publicada no simulator-bus, pra que
// /admin/simulator/attendant renderize sem precisar de um segundo número real. A
// chamada real à Meta API só é pulada quando o telefone é sintético (convenção
// SIM-, mesma de isSimulatedWaId) — atendente real de produção continua recebendo
// no WhatsApp de verdade, como sempre.
import { sendReplyButtons, sendTextMessage } from "@/lib/whatsapp/api";
import { isSimulatedWaId, publishToAttendant } from "../simulator-bus";

export async function notifyMesaAttendant(phone: string, text: string): Promise<void> {
	if (!isSimulatedWaId(phone)) {
		await sendTextMessage(phone, text);
	}
	publishToAttendant(phone, text);
}

/** Chave lógica do template que avisa o atendente de um caso novo. A linha do
 * banco nasce da migration `0036_mesa_novo_caso_template` — não depende de
 * cadastro manual no admin em nenhum ambiente. */
export const MESA_NOVO_CASO_USAGE_KEY = "mesa_novo_caso";

/** Identidade do template na Meta (WABA 2536995250087380), submetido em
 * 2026-07-30. Fonte de verdade do envio continua sendo a linha do banco
 * resolvida por `usageKey`; estas constantes existem pra rastrear qual template
 * é esse sem abrir o Business Manager, e para o teste travar o vínculo. */
export const MESA_NOVO_CASO_TEMPLATE_NAME = "aja_agora_mesa_novo_caso";
export const MESA_NOVO_CASO_TEMPLATE_ID = "910556708148286";

export async function notifyMesaAttendantButtons(
	phone: string,
	text: string,
	buttons: Array<{ id: string; title: string }>,
): Promise<{ messageId?: string; error?: string }> {
	const interactive = {
		type: "button",
		body: { text },
		action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: b })) },
	};
	if (isSimulatedWaId(phone)) {
		publishToAttendant(phone, text, { interactive });
		return { messageId: `sim-${crypto.randomUUID()}` };
	}

	// O ATENDENTE SÓ RECEBE POR TEMPLATE — a janela dele quase nunca está aberta.
	//
	// Reportado por Kairo (2026-07-30): proposta fechada no WhatsApp não chegou na
	// mesa. Causa: este broadcast usava `sendReplyButtons`, que é mensagem de TEXTO
	// LIVRE — a Meta só entrega dentro da janela de 24h, e a janela conta a partir
	// da última mensagem que a PESSOA mandou pro número da empresa. O atendente não
	// fica conversando com o próprio sistema, então a janela está fechada quase
	// sempre e a notificação morria em silêncio (o handoff era criado, mas ninguém
	// era avisado).
	//
	// Ordem: template aprovado → se não houver, tenta o interativo (funciona se por
	// acaso a janela estiver aberta) → e o handoff já está registrado no board de
	// qualquer forma, então nenhum caso se perde por causa disto.
	try {
		const { findTemplateByUsageKey } = await import("@/lib/whatsapp/template-dispatch");
		const { reconciliarSePendente } = await import("@/lib/whatsapp/template-sync");
		// Template recém-submetido pode ter sido aprovado sem o webhook chegar —
		// pergunta à Meta antes de concluir que o atendente ficará sem aviso.
		await reconciliarSePendente(MESA_NOVO_CASO_USAGE_KEY);
		const template = await findTemplateByUsageKey(MESA_NOVO_CASO_USAGE_KEY);
		if (template && template.status === "APPROVED") {
			const { sendTemplate } = await import("@/lib/whatsapp/api");
			const result = (await sendTemplate(phone, template.metaName, template.language, [
				{ type: "body", parameters: [{ type: "text", text: primeiraLinha(text) }] },
			])) as { messageId?: string };
			publishToAttendant(phone, text, { interactive });
			return result;
		}
		console.warn(
			JSON.stringify({
				level: "warn",
				source: "mesa-notify",
				usage_key: MESA_NOVO_CASO_USAGE_KEY,
				template_status: template?.status ?? "ausente",
				note: "sem template aprovado — caindo no interativo, que só chega se a janela de 24h do atendente estiver aberta",
			}),
		);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "mesa-notify",
				error: err instanceof Error ? err.message : String(err),
				note: "falha ao resolver template do atendente — seguindo pro interativo",
			}),
		);
	}

	const result = await sendReplyButtons(phone, text, buttons);
	publishToAttendant(phone, text, { interactive });
	return result;
}

/** O template tem UMA variável de corpo; o dossiê completo tem várias linhas.
 * Manda a primeira linha (identificação do caso) — o atendente abre o painel pro
 * resto, que é onde os dados sensíveis devem ficar mesmo (§8 LGPD). */
function primeiraLinha(texto: string): string {
	const linha = texto.split("\n").find((l) => l.trim().length > 0) ?? "Novo caso na mesa";
	return linha.replace(/[*_~]/g, "").slice(0, 120);
}
