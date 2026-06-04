// Resumo da contratação por WhatsApp — docx passo 5 (linha 52): "Mandar por
// WhatsApp/e-mail o resumo da contratação." A jornada coleta celular no gate
// identify (D1) — o resumo vai por WhatsApp via Cloud API. E-mail fica fora
// (a jornada não coleta e-mail) — registrado em docs/jornada/CONTEXT.md.
//
// Regra: o envio NUNCA quebra o fechamento. Sem WhatsApp configurado, ou com
// falha de envio, loga e marca meta.contractSummaryPending=true (sem fingir).

import type { SelfContractIdentity } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import { loadIdentity } from "@/lib/conversation/identity";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { sendTextMessage } from "@/lib/whatsapp/api";
import { getLatestBeviProposal } from "./proposal-repo";

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
// Parcela mantém os centavos — arredondar mentiria o valor mensal real.
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function buildContractSummaryText(args: {
	administradora: string;
	grupo: string | null;
	creditValue: number;
	monthlyPayment: number;
	signatureLink: string | null;
}): string {
	const lines = [
		"Resumo da sua contratação — Aja Agora ✅",
		"",
		`Administradora: ${args.administradora}`,
		...(args.grupo ? [`Grupo: ${args.grupo}`] : []),
		`Carta de crédito: ${brl(args.creditValue)}`,
		`Parcela mensal: ${brl2(args.monthlyPayment)}`,
		...(args.signatureLink ? ["", `Assinatura digital: ${args.signatureLink}`] : []),
		"",
		"A Aja Agora segue com você até a contemplação — e depois dela.",
	];
	return lines.join("\n");
}

export interface ContractSummaryDeps {
	loadIdentityImpl?: (conversationId: string) => Promise<SelfContractIdentity | null>;
	getProposalImpl?: typeof getLatestBeviProposal;
	sendTextImpl?: (to: string, text: string) => Promise<unknown>;
	whatsappConfigured?: () => boolean;
	persistMetaImpl?: (conversationId: string, patch: Record<string, unknown>) => Promise<unknown>;
}

const defaultConfigured = () =>
	Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** Envia o resumo da contratação pro celular da identidade (DDI 55). */
export async function sendContractSummary(
	conversationId: string,
	deps: ContractSummaryDeps = {},
): Promise<{ sent: boolean }> {
	const loadIdentityImpl = deps.loadIdentityImpl ?? loadIdentity;
	const getProposalImpl = deps.getProposalImpl ?? getLatestBeviProposal;
	const sendTextImpl = deps.sendTextImpl ?? sendTextMessage;
	const configured = deps.whatsappConfigured ?? defaultConfigured;
	// BUG-CONTRACT-SUMMARY-META-WIPE (2026-06-04): persistMeta SOBRESCREVE o
	// metadata inteiro — o default SEMPRE faz merge sobre o estado atual; um
	// patch parcial aqui destruía identityEnc/qualifyAnswers da conversa.
	const persistMetaImpl =
		deps.persistMetaImpl ??
		(async (id: string, patch: Record<string, unknown>) => {
			const current = await reloadMeta(id);
			await persistMeta(id, { ...current, ...patch } as Parameters<typeof persistMeta>[1]);
		});

	const markPending = async () => {
		try {
			await persistMetaImpl(conversationId, { contractSummaryPending: true });
		} catch {
			// melhor-esforço — flag é só observabilidade do gap de envio
		}
	};

	const [identity, row] = await Promise.all([
		loadIdentityImpl(conversationId),
		getProposalImpl(conversationId),
	]);
	if (!identity || !row?.administradora) {
		console.error(
			JSON.stringify({
				level: "warn",
				source: "contract-summary",
				conversation_id: conversationId,
				reason: identity ? "no-proposal" : "no-identity",
			}),
		);
		await markPending();
		return { sent: false };
	}

	const text = buildContractSummaryText({
		administradora: row.administradora,
		grupo: row.grupo ?? null,
		creditValue: Number(row.creditValue ?? 0),
		monthlyPayment: Number(row.monthlyPayment ?? 0),
		signatureLink: row.consortiumProposalLink ?? null,
	});

	if (!configured()) {
		console.log(
			JSON.stringify({
				level: "info",
				source: "contract-summary",
				conversation_id: conversationId,
				status: "pending",
				reason: "whatsapp-not-configured",
			}),
		);
		await markPending();
		return { sent: false };
	}

	try {
		// celular vem só-dígitos do identify (DDD+numero) — Cloud API exige DDI.
		const to = `55${identity.celular.replace(/\D/g, "")}`;
		await sendTextImpl(to, text);
		return { sent: true };
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "contract-summary",
				conversation_id: conversationId,
				error_message: err instanceof Error ? err.message : String(err),
			}),
		);
		await markPending();
		return { sent: false };
	}
}
