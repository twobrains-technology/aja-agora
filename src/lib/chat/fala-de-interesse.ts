/** A fala do lead quando toca numa carta: interesse, não "simular" (o passo de
 * simulação não existe mais). Vale para o card e para a tabela de comparação. */
const brl = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value);

/** 240000 → "R$ 240 mil"; 240452 → "R$ 240.452". */
function creditoFalado(value: number): string {
	return value >= 1000 && value % 1000 === 0 ? `R$ ${value / 1000} mil` : brl(value);
}

export function falaDeInteresseNaCarta(carta: {
	administradora: string;
	creditValue?: number | null;
	termMonths?: number | null;
}): string {
	const credito =
		typeof carta.creditValue === "number" && Number.isFinite(carta.creditValue)
			? ` de ${creditoFalado(carta.creditValue)}`
			: "";
	const prazo =
		typeof carta.termMonths === "number" && Number.isFinite(carta.termMonths)
			? `, prazo de ${carta.termMonths} meses`
			: "";
	return `Me interessei na ${carta.administradora}${credito}${prazo}`;
}
