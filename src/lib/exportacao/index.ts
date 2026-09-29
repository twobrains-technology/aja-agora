/**
 * A ÁREA "EXPORTAÇÃO E DADOS" — o vocabulário único dos três recortes.
 *
 * A API (`/api/admin/exportacao/[tipo]`) e a tela leem daqui: o `tipo` da URL
 * vira UMA destas chaves, e o que cada uma significa está escrito em um lugar
 * só. Duas listas (a da tela e a da rota) divergiriam no primeiro tipo novo.
 */

import type { Campanhas } from "@/lib/admin/campanhas";
import type { ModoDoPasso, PassoDoPercurso } from "@/lib/admin/percurso-types";
import { contarConversas, exportarConversas } from "./conversas";
import type { LinhaExportada } from "./formato";
import { contarCandidatosDeLimpeza, exportarCandidatosDeLimpeza } from "./limpeza";
import { contarPercurso, exportarPercurso } from "./percurso";
import type { TipoExportacao } from "./tipos";
import { contarToques, exportarToquesDaRegua } from "./toques";

export { contarConversas, exportarConversas } from "./conversas";
export * from "./formato";
export { contarCandidatosDeLimpeza, exportarCandidatosDeLimpeza } from "./limpeza";
export * from "./mascarar";
export { contarPercurso, exportarPercurso } from "./percurso";
export * from "./textos";
export * from "./tipos";
export { contarToques, exportarToquesDaRegua } from "./toques";

export interface OpcoesDeExportacao {
	de: Date;
	ate: Date;
	/** Padrão `true`. */
	mascarar?: boolean;
	/**
	 * O RECORTE da tela que pediu o arquivo.
	 *
	 * Nasceu do pedido da cliente (23/09): *"Só preciso ter um diagnóstico por
	 * etapa"*. Sem estes campos, exportar com um degrau selecionado devolvia TODOS
	 * os degraus — o arquivo respondia por outro recorte que a lista.
	 *
	 * Só o recorte de Percurso os usa hoje; os demais tipos ignoram o que não lhes
	 * diz respeito (o contrato é um só, como o `tipo` da URL).
	 */
	passo?: PassoDoPercurso | null;
	modo?: ModoDoPasso;
	origem?: string | null;
	campanha?: Campanhas;
	q?: string | null;
}

/** Roda o recorte pedido e devolve as linhas tipadas. */
export async function exportar(
	tipo: TipoExportacao,
	opcoes: OpcoesDeExportacao,
): Promise<LinhaExportada[]> {
	switch (tipo) {
		case "conversas":
			return exportarConversas(opcoes);
		case "percurso":
			return exportarPercurso(opcoes);
		case "toques":
			return exportarToquesDaRegua(opcoes);
		case "limpeza":
			return exportarCandidatosDeLimpeza(opcoes);
	}
}

/** Quantas linhas o recorte tem — para o cartão da tela, sem materializar. */
export async function contar(tipo: TipoExportacao, opcoes: OpcoesDeExportacao): Promise<number> {
	switch (tipo) {
		case "conversas":
			return (await contarConversas(opcoes)).mensagens;
		case "percurso":
			return (await contarPercurso(opcoes)).pessoas;
		case "toques":
			return (await contarToques(opcoes)).toques;
		case "limpeza":
			return (await contarCandidatosDeLimpeza(opcoes)).candidatos;
	}
}
