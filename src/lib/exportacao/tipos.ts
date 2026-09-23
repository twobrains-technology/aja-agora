/**
 * O DICIONÁRIO DA ÁREA DE EXPORTAÇÃO — sem banco, sem servidor.
 *
 * Separado de `index.ts` de propósito: a TELA é client component e precisa das
 * chaves e dos rótulos, mas NÃO pode arrastar `@/db` para o bundle do navegador.
 * Aqui só há constante e tipo puro.
 */

export const TIPOS_DE_EXPORTACAO = ["conversas", "percurso", "toques", "limpeza"] as const;
export type TipoExportacao = (typeof TIPOS_DE_EXPORTACAO)[number];

export function ehTipoExportacao(valor: string): valor is TipoExportacao {
	return (TIPOS_DE_EXPORTACAO as readonly string[]).includes(valor);
}

export interface MetaDoTipo {
	/** O título do cartão. */
	titulo: string;
	/** O que sai, em uma frase — o pedido do Gustavo exige saber o que é. */
	descricao: string;
	/** O substantivo da contagem ("mensagens", "pessoas", "entradas"). */
	unidade: string;
}

export const META_DO_TIPO: Record<TipoExportacao, MetaDoTipo> = {
	conversas: {
		titulo: "Conversas, mensagem a mensagem",
		descricao:
			"Cada mensagem em ordem cronológica, com autoria (cliente, agente, atendente ou sistema), tipo e a etapa do funil no momento em que foi enviada.",
		unidade: "mensagens",
	},
	percurso: {
		titulo: "Percurso por pessoa",
		descricao:
			"Uma linha por pessoa que chegou pela mídia: de onde veio, até que degrau chegou e quantas conversas e mensagens deixou.",
		unidade: "pessoas",
	},
	toques: {
		titulo: "Toques da régua",
		descricao:
			"Uma linha por entrada na régua de remarketing: passo, status, próximo toque e motivo de saída.",
		unidade: "entradas",
	},
	limpeza: {
		titulo: "Candidatos à limpeza",
		descricao:
			"Uma linha por conversa com sinal de não ser cliente real — já marcada como teste, telefone da equipe ou na mesa sem contato — com o motivo e o `[ ] aplicar` para você aprovar o que sai.",
		unidade: "candidatos",
	},
};

/** Uma exportação que já aconteceu — a auditoria de LGPD. */
export interface ExportacaoRegistrada {
	id: string;
	tipo: string;
	formato: string;
	de: string;
	ate: string;
	mascarado: boolean;
	linhas: number;
	usuarioEmail: string | null;
	criadoEm: string;
}

/** O corpo de `GET /api/admin/exportacao`. */
export interface RespostaDoResumo {
	contagens: Record<TipoExportacao, number>;
	ultimas: ExportacaoRegistrada[];
}
