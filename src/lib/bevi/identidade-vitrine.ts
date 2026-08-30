/**
 * A identidade DA CASA, usada só para montar a prateleira.
 *
 * Buscar carta na Bevi não é consultar um catálogo: `ensureOffers`
 * (bevi-self-contract-adapter.ts) cria uma PROPOSTA vinculada a um par
 * CPF+celular antes de conseguir simular qualquer coisa. Foi essa exigência da
 * administradora que empurrou o gate `identify` para antes da busca — e, com
 * ele, a cascata inteira de perguntas que mata metade das conversas antes do
 * primeiro número aparecer na tela.
 *
 * O invariante real nunca foi "o cliente entrega o CPF antes de ver oferta".
 * Era "a proposta Bevi exige um par CPF×celular válido". A vitrine satisfaz o
 * invariante com o par da própria casa — uma conta homologada na administradora
 * (docs/integracoes/contas-teste-homologacao.md) — e devolve ao cliente o
 * direito de ver o produto antes de se identificar.
 *
 * O par vem de ENV, nunca do código: é PII e a regra do repo é que ela vive no
 * `.env.local`/vault. Sem a env, `identidadeDeVitrine()` devolve `null` e o
 * funil segue exigindo a identidade do cliente como antes — desligar a vitrine
 * é remover uma variável, não reverter um commit.
 */
import type { SelfContractIdentity } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import { isValidCpf } from "@/lib/conversation/identity";

const onlyDigits = (raw: string): string => raw.replace(/\D/g, "");

/**
 * O vault guarda o celular em E.164 sem `+` (55 + DDD + número = 13 dígitos),
 * mas a API de Parceiro devolve `400 "CELULAR inválido."` para 13 dígitos — ela
 * quer 11 (DDD + número). Normalizar aqui, e não no POST, evita que a diferença
 * de formato vire um erro de integração distante da causa.
 */
function celularBrasileiro(raw: string): string | null {
	const d = onlyDigits(raw);
	const semDdi = d.length === 13 && d.startsWith("55") ? d.slice(2) : d;
	return semDdi.length === 10 || semDdi.length === 11 ? semDdi : null;
}

/**
 * O par da casa, ou `null` quando não há vitrine utilizável.
 *
 * CPF que não passa no módulo 11 é tratado como ausência, não como erro: um par
 * inválido faria a Bevi recusar a proposta e o cliente veria a busca falhar sem
 * explicação. Não é hipótese: na abertura desta tarefa o CPF chegou por voz com
 * dois dígitos transpostos e não passava no módulo 11 — melhor não ter vitrine
 * do que ter uma que quebra na cara do cliente.
 */
export function identidadeDeVitrine(): SelfContractIdentity | null {
	const cpf = onlyDigits(process.env.VITRINE_CPF ?? "");
	const celular = celularBrasileiro(process.env.VITRINE_CELULAR ?? "");
	if (!isValidCpf(cpf) || !celular) return null;
	return { cpf, celular };
}

/** Há prateleira para montar? */
export function vitrineDisponivel(): boolean {
	return identidadeDeVitrine() !== null;
}

/**
 * A fronteira que impede o acidente caro: este CPF é o da casa?
 *
 * A vitrine existe para MOSTRAR. Se um CPF de vitrine chegasse ao fechamento, o
 * contrato do cliente nasceria em nome de outra pessoa. Este predicado é o que
 * os guards de contratação consultam — e ele é deliberadamente estrito: sem
 * vitrine configurada devolve `false` para tudo, inclusive para string vazia,
 * senão a ausência de CPF passaria a "ser" a vitrine e bloquearia toda venda.
 */
export function ehIdentidadeDeVitrine(cpf: string | null | undefined): boolean {
	const vitrine = identidadeDeVitrine();
	if (!vitrine) return false;
	const alvo = onlyDigits(cpf ?? "");
	if (alvo.length !== 11) return false;
	return alvo === vitrine.cpf;
}
