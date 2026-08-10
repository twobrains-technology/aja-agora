/**
 * Parâmetros posicionais de um template HSM.
 *
 * A Meta rejeita o envio quando a quantidade de `{{n}}` do corpo aprovado não
 * bate com a quantidade de parâmetros enviados — e o erro é 400, não um aviso:
 *
 *   (#132000) Number of parameters does not match the expected number of params
 *   body: number of localizable_params (0) does not match the expected number (1)
 *
 * Foi exatamente o que aconteceu em prod (2026-08-10): `aja_agora_atendente_retomada`
 * tem "Oi, {{1}}!" e o disparo ia sem `components`. A Meta recusava todos, e o
 * atendente via "contato de retomada enviado" — a rota não olhava o erro.
 *
 * Contar os placeholders do corpo (em vez de fixar "manda 1 parâmetro") mantém o
 * código honesto quando alguém aprovar um template com dois: quem manda na
 * aridade é o texto aprovado, não uma constante daqui.
 */

/** Quantos `{{n}}` distintos o corpo do template exige. */
export function contarParametros(bodyPreview: string | null | undefined): number {
	if (!bodyPreview) return 0;
	const indices = new Set<number>();
	for (const m of bodyPreview.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
		const n = Number(m[1]);
		if (Number.isFinite(n) && n > 0) indices.add(n);
	}
	// O maior índice manda: "{{2}}" sozinho ainda obriga a mandar dois valores,
	// porque a Meta preenche por POSIÇÃO, não por número declarado.
	return indices.size === 0 ? 0 : Math.max(...indices);
}

/** Só o primeiro nome — o template cumprimenta, não preenche cadastro. */
export function primeiroNome(nome: string | null | undefined): string | null {
	const limpo = nome?.trim().replace(/\s+/g, " ");
	if (!limpo) return null;
	return limpo.split(" ")[0] ?? null;
}

/**
 * Monta o `components` do envio. Devolve `undefined` quando o template não pede
 * parâmetro — mandar um array vazio também é erro 132000.
 *
 * O primeiro parâmetro é o nome de quem vai ler. Os demais (raros) recebem o
 * mesmo valor de preenchimento: é melhor um texto neutro do que um envio
 * recusado, e o corpo aprovado é sempre revisado por gente antes de ir ao ar.
 */
export function montarComponents(
	bodyPreview: string | null | undefined,
	nomeDoCliente: string | null | undefined,
): unknown[] | undefined {
	const quantidade = contarParametros(bodyPreview);
	if (quantidade === 0) return undefined;

	// Sem nome no cadastro, "Oi, cliente!" é impessoal mas correto — e chega.
	// Travar o envio deixaria o atendente sem caminho nenhum pra reabrir a conversa.
	const valor = primeiroNome(nomeDoCliente) ?? "cliente";

	return [
		{
			type: "body",
			parameters: Array.from({ length: quantidade }, () => ({ type: "text", text: valor })),
		},
	];
}
