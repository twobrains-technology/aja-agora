// F2 / AJA-02 — o vocabulário único de "quem é esta pessoa" nas telas do admin.
//
// O mesmo contato aparecia como "Sem nome ainda" na Régua, "—" na lista de
// conversas e "Anônimo d1c7" no Percurso. Três telas respondendo à mesma pergunta
// com três respostas diferentes — e nenhuma delas dizendo o que a pessoa É
// (telefone ou, na falta dele, um identificador curto e estável).
//
// Módulo PURO de propósito: a função decide o TEXTO, não a tela. Quem renderiza
// (Conversas, Percurso, Régua e Agora — frente F3) importa daqui, e o dicionário
// passa a ser um só. Nada de "—" e nada de "Anônimo": os dois escondem que o dado
// simplesmente não existe.
//
// A máscara é a MESMA da Régua: `maskPhoneForDisplay` sobre a chave canônica do
// BR (`chaveTelefoneBR`), que corta o "55" de país. `remarketing-queries.ts` já
// faz exatamente esta composição (`telefoneParaExibir`); o F3 troca aquela
// função local por esta (anotado na válvula — não editei o arquivo da frente).

import { maskPhoneForDisplay } from "@/lib/conversation/identity";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";

export interface NomeExibido {
	/** O nome, ou o rótulo explícito "Sem nome". */
	principal: string;
	/** Telefone mascarado ("(83) 9...-9307") ou o id curto ("d1c7"); "" se não há nem um nem outro. */
	secundario: string;
}

/** Quantos caracteres do id viram identificador. 4 é o que o Percurso já mostra
 *  ("Anônimo d1c7") e o suficiente para distinguir duas linhas na tela. */
const CARACTERES_DO_ID = 4;

/** Telefone mascarado a partir da chave canônica do BR. */
function telefoneDeExibicao(telefone: string | null | undefined): string | null {
	const chave = chaveTelefoneBR(telefone ?? null);
	if (!chave) return null;
	return maskPhoneForDisplay(chave) || null;
}

/**
 * O par (nome, identificador) de uma pessoa para exibição em lista.
 *
 * Nunca devolve "—" nem "Anônimo": sem nome, o principal é "Sem nome"; sem
 * telefone, o secundário é o começo do id. Sem nenhum dos dois, o secundário é
 * vazio — e quem renderiza não inventa nada no lugar.
 */
export function nomeExibido(entrada: {
	nome?: string | null;
	telefone?: string | null;
	id?: string | null;
}): NomeExibido {
	const nome = entrada.nome?.trim();
	const principal = nome ? nome : "Sem nome";

	const telefone = telefoneDeExibicao(entrada.telefone);
	const id = entrada.id?.trim();
	const secundario = telefone ?? (id ? id.slice(0, CARACTERES_DO_ID) : "");

	return { principal, secundario };
}
