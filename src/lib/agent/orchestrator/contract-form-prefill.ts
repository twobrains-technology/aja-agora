// FIX-9 (teste manual Kairo 2026-06-05): o contract_form do passo 5 vinha com
// CPF/celular VAZIOS — dados já coletados (e cifrados) no gate identify.
// O payload é enriquecido server-side com a identidade armazenada, SEMPRE
// mascarada: o CPF completo NUNCA viaja pro browser de novo — o submit usa
// useStoredIdentity e o route resolve via loadIdentity.

import type { ContractFormPayload } from "@/lib/chat/types";

/** "52998224725" → "529.•••.•••-25" — só os 3 primeiros e 2 últimos dígitos. */
export function maskCpfForDisplay(cpf: string): string {
	const d = cpf.replace(/\D/g, "");
	if (d.length !== 11) return "•••.•••.•••-••";
	return `${d.slice(0, 3)}.•••.•••-${d.slice(9)}`;
}

/** "62999887766" → "(62) 99988-7766" (ou 10 dígitos: "(62) 9988-7766"). */
export function formatPhoneForDisplay(celular: string): string {
	const d = celular.replace(/\D/g, "");
	if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
	if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
	return celular;
}

/** Enriquece o payload do contract_form com a identidade armazenada (quando
 * existe). Puro/sincrono — o caller (runner) carrega a identidade via
 * loadIdentity e injeta aqui. */
export function enrichContractFormPayload(
	input: Record<string, unknown>,
	identity: { cpf: string; celular: string } | null,
): ContractFormPayload & Record<string, unknown> {
	if (!identity) return input as ContractFormPayload & Record<string, unknown>;
	return {
		...input,
		identityOnFile: true,
		prefilledCpfMasked: maskCpfForDisplay(identity.cpf),
		prefilledPhone: formatPhoneForDisplay(identity.celular),
	} as ContractFormPayload & Record<string, unknown>;
}
