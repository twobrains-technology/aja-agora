// O TAP NO ATALHO DO WHATSAPP É CLIQUE, NÃO TEXTO.
//
// O botão de resposta rápida devolve o TÍTULO como mensagem — e o título é
// truncado em 20 caracteres pela API do WhatsApp. "A de prazo mais curto" tem
// 21: chega ao servidor como "A de prazo mais curt", nenhum resolvedor entende,
// e a escolha que o cliente fez com um toque vira uma frase que não ancora nada
// (revisão de 19/08/2026 — o canal de maior volume era o mais quebrado).
//
// ## Por que o id carrega uma ASSINATURA, e não só o índice
//
// O botão fica na tela para sempre: o WhatsApp não expira mensagem antiga. Com
// `qr_${i}`, um tap num atalho de dois turnos atrás era resolvido contra o
// atalho MAIS RECENTE — turno A oferece [Itaú 158, Itaú 147], turno B oferece
// [BB, Porto], o cliente rola e toca no botão de A, e o servidor ancora Porto.
// É o mesmo defeito D7 do PRD por outra porta: o clique virando outra coisa.
//
// Conferir o rótulo não resolve — dois atalhos de escolha costumam ter os
// mesmos rótulos ("A de menor parcela"). Por isso o id leva uma assinatura curta
// do conteúdo que o gerou; se ela não bate com o atalho vigente, o tap não
// ancora nada e cai no caminho de texto, onde sempre esteve.

/** O payload do último `quick_reply` emitido, como está persistido. */
export type PayloadDeAtalho = {
	options?: Array<{ label?: unknown; groupId?: unknown }>;
} | null;

/** Assinatura curta e estável do conjunto de opções — o que amarra o botão ao
 * atalho que o produziu. Não precisa ser criptográfica: precisa mudar quando as
 * opções mudam, e caber no id do botão. */
export function assinaturaDoAtalho(payload: PayloadDeAtalho): string {
	const base = (payload?.options ?? [])
		.map(
			(o) =>
				`${typeof o?.label === "string" ? o.label : ""}|${typeof o?.groupId === "string" ? o.groupId : ""}`,
		)
		.join("§");
	let h = 2166136261;
	for (let i = 0; i < base.length; i++) {
		h ^= base.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

/** O `id` do botão: índice + assinatura do atalho que o gerou. */
export function idDoAtalho(indice: number, payload: PayloadDeAtalho): string {
	return `qr_${indice}_${assinaturaDoAtalho(payload)}`;
}

/**
 * A cota que ESTE tap escolhe — ou `null` quando o atalho não escolhe cota, ou
 * quando o botão veio de um atalho que já não é o vigente.
 *
 * PURO. Nunca infere pelo texto do botão: o índice é o único vínculo confiável,
 * o `groupId` já veio conferido pelo servidor na emissão, e a assinatura garante
 * que o índice está sendo lido na lista certa.
 */
export function cotaDoTapDeAtalho(replyId: string, payload: PayloadDeAtalho): string | null {
	const m = /^qr_(\d+)_([a-z0-9]+)$/.exec(replyId ?? "");
	if (!m) return null;
	if (m[2] !== assinaturaDoAtalho(payload)) return null;
	const opcao = payload?.options?.[Number(m[1])];
	const groupId = opcao?.groupId;
	return typeof groupId === "string" && groupId.trim() ? groupId : null;
}
