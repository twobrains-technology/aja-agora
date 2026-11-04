// Decisão pura de para onde vai o pedido de humano: fila de vendedores ou mesa.
// Mesa só com proposta gerada ou pedido explícito de fechar (P5, P8).

const PEDE_FECHAR =
	/\b(?:bora|vamos|quero|quer(?:emos)?|vou|posso|pode|podemos|j[aá]|desejo)\s+(?:logo\s+)?(?:fechar|contratar)\b/i;

export function clientePedeFechar(texto: string | null | undefined): boolean {
	if (!texto) return false;
	return PEDE_FECHAR.test(texto);
}

export function decidirRota(a: { temProposta: boolean; pediuFechar: boolean }): "fila" | "mesa" {
	return a.temProposta || a.pediuFechar ? "mesa" : "fila";
}
