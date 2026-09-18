/**
 * MASCARAMENTO — a regra de dado pessoal da exportação (PRD §3, restrição 6).
 *
 * O padrão é MASCARADO. `mascarar: false` existe (a tela tem o switch "Incluir
 * dado pessoal completo"), mas exige decisão explícita de quem exporta — o
 * pedido do Gustavo inclui "minimizar dados pessoais", e um arquivo que sai
 * com telefone completo por default vaza PII em qualquer download distraído.
 *
 * O CPF NUNCA sai: não há função que o devolva, e nenhuma coluna de exportação
 * o carrega. Se um dia alguém quiser, isso é uma decisão de produto, não um
 * parâmetro.
 *
 * As formas são as do pedido e as da Régua (padrão do painel): telefone
 * `55629***6793`, e-mail `m***@dominio.com`.
 */

/** `55629***6793` — primeiros 5 e últimos 4 dígitos; qualquer coisa menor vira `***`. */
export function mascararTelefone(telefone: string | null | undefined): string | null {
	if (telefone === null || telefone === undefined) return null;
	const digitos = String(telefone).replace(/\D/g, "");
	if (digitos.length === 0) return null;
	if (digitos.length < 9) return "***";
	return `${digitos.slice(0, 5)}***${digitos.slice(-4)}`;
}

/** `m***@dominio.com` — a primeira letra do local e o domínio inteiro. */
export function mascararEmail(email: string | null | undefined): string | null {
	if (email === null || email === undefined) return null;
	const texto = String(email).trim();
	if (!texto) return null;
	const arroba = texto.lastIndexOf("@");
	if (arroba <= 0) return `${texto.slice(0, 1)}***`;
	return `${texto.slice(0, 1)}***${texto.slice(arroba)}`;
}

/** Só o primeiro nome. "Maria Graciete Souza" → "Maria". */
export function mascararNome(nome: string | null | undefined): string | null {
	if (nome === null || nome === undefined) return null;
	const partes = String(nome).trim().split(/\s+/);
	return partes[0] ? partes[0] : null;
}
