/**
 * EXPORTAR OS CANDIDATOS À LIMPEZA — uma linha por conversa com sinal objetivo
 * de não ser cliente real.
 *
 * É a forma "planilha" do relatório do AJA-23 T3: o dono abre no Excel, confere
 * o motivo de cada linha e marca o `[ ] aplicar` do que ele aprova. **A
 * exportação não marca nada** — quem marca é a ação em lote da lista de
 * Conversas, ou o PATCH de uma conversa. Aqui só se lê.
 *
 * Mesmo par de funções dos outros recortes (`exportar*` + `contar*`) e mesma
 * fonte dos dados: `listarCandidatosDeLimpeza` — o módulo puro não reimplementa
 * a consulta, senão o cartão da tela contaria uma coisa e o arquivo traria
 * outra.
 *
 * A janela recorta `created_at` da conversa, como as demais exportações.
 */

import { listarCandidatosDeLimpeza } from "@/lib/admin/limpeza-queries";
import type { LinhaExportada } from "./formato";
import { mascararNome, mascararTelefone } from "./mascarar";

export interface OpcoesDeLimpeza {
	de: Date;
	ate: Date;
	mascarar?: boolean;
}

/**
 * O contato da linha é NOME ou TELEFONE — depende de qual existiu.
 *
 * A exportação recebe os dois no mesmo campo (`contato`), então o mascaramento
 * precisa distinguir: só dígitos (com ou sem separador) é telefone; o resto é
 * nome. Errar isso sairia caro dos dois lados — um nome inteiro num arquivo que
 * devia vir mascarado, ou um telefone cortado como se fosse primeiro nome.
 */
function mascararContato(contato: string, mascarar: boolean): string {
	if (!mascarar) return contato;
	const digitos = contato.replace(/\D/g, "");
	const pareceTelefone =
		digitos.length >= 10 && digitos.length === contato.replace(/[\s()+-]/g, "").length;
	if (pareceTelefone) {
		return mascararTelefone(contato) ?? contato;
	}
	return mascararNome(contato) ?? contato;
}

export async function exportarCandidatosDeLimpeza(
	opcoes: OpcoesDeLimpeza,
): Promise<LinhaExportada[]> {
	const candidatos = await listarCandidatosDeLimpeza({ de: opcoes.de, ate: opcoes.ate });
	const mascarar = opcoes.mascarar ?? true;

	return candidatos.map((candidato) => ({
		conversaId: candidato.conversationId,
		contato: mascararContato(candidato.contato, mascarar),
		// A CHAVE do motivo (`teste`, `telefone_da_equipe`, `sem_contato`), não o
		// rótulo: o arquivo é lido por script do outro lado, e dois nomes para o
		// mesmo sinal quebram a contagem (mesma razão das frases de vazio em
		// `textos.ts`).
		motivo: candidato.motivo ?? "sem_motivo",
		canal: candidato.canal,
		ultimaAtividade: candidato.ultimaAtividade,
		// O `[ ]` do pedido: quem aprova marca na planilha. Já marcada como teste
		// sai `[x]` — a linha continua na lista para o dono ver o que já está fora
		// do funil, em vez de sumir e parecer que nunca teve sinal.
		aplicar: candidato.jaMarcada ? "[x] já marcada como teste" : "[ ] aplicar",
	}));
}

/** Contagem barata para o cartão da tela. */
export async function contarCandidatosDeLimpeza(opcoes: {
	de: Date;
	ate: Date;
}): Promise<{ candidatos: number }> {
	const candidatos = await listarCandidatosDeLimpeza({ de: opcoes.de, ate: opcoes.ate });
	return { candidatos: candidatos.length };
}
