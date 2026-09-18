/**
 * AS FRASES DO VAZIO — a regra do Gustavo, num lugar só.
 *
 * "Célula vazia é proibida." No pedido dele (WhatsApp, 16/09 11:44) vínculo
 * ausente e dado indisponível têm que sair **nomeados**, não implícitos numa
 * célula em branco: quem abre o CSV no Excel e vê `,,` não sabe se o dado não
 * existe, se a consulta falhou, ou se ninguém preencheu a coluna. Cada vazio
 * tem um texto próprio, e é sempre o MESMO texto para o mesmo motivo — a
 * exportação é lida por script do outro lado, e dois nomes para o mesmo
 * problema quebram a contagem.
 *
 * O que NÃO mora aqui: nenhuma dessas frases julga fala do cliente ou do
 * agente (`CLAUDE.md`). São rótulos de ausência de VÍNCULO de dado, derivados
 * de estado do banco — verificável, então vira código.
 */

/** A conversa não tem `visit_id` — nasceu fora do mecanismo de atribuição. */
export const SEM_VINCULO_SEM_VISITA = "sem vínculo: conversa sem visita";
/** A conversa não resolveu para um contato unificado. */
export const SEM_VINCULO_SEM_CONTATO = "sem vínculo: conversa sem contato";
/** A conversa não tem lead. */
export const SEM_VINCULO_SEM_LEAD = "sem vínculo: conversa sem lead";
/** A conversa não está (nem esteve) na régua de remarketing. */
export const SEM_VINCULO_FORA_DA_REGUA = "sem vínculo: conversa fora da régua";
/** A visita existe mas não trouxe nenhum sinal de origem. */
export const SEM_VINCULO_VISITA_SEM_ORIGEM = "sem vínculo: visita sem origem";

/** Nome não capturado em nenhuma das fontes (contato ou lead). */
export const INDISPONIVEL_NOME = "indisponível: nome não capturado";
export const INDISPONIVEL_TELEFONE = "indisponível: telefone não capturado";
export const INDISPONIVEL_EMAIL = "indisponível: e-mail não capturado";

/**
 * Experimento e versão NÃO têm coluna no banco (levantamento §18: não existe
 * tabela nem enum de teste A/B). O que dá para entregar é o `utm_campaign` /
 * `utm_content` cru da visita, e o dado tem que DECLARAR que é derivado — senão
 * a growth leria "experimento=X" como campo estruturado e confiaria na
 * classificação. Ver a pendência registrada em `.orientacao/pendencia-integracao.md`.
 */
export const NAO_ESTRUTURADO_EXPERIMENTO = "não estruturado: derivado de utm_campanha";
export const NAO_ESTRUTURADO_VERSAO = "não estruturado: derivado de utm_conteudo";

/** Nenhum `lead_events` até o instante da mensagem. */
export const SEM_ETAPA_REGISTRADA = "sem etapa registrada";
/** Nenhum lead_events de forma alguma — não há etapa final para declarar. */
export const SEM_RESULTADO_COMERCIAL = "sem resultado: lead sem etapa";

/** Nada faltou na linha. O contrário de uma lista vazia. */
export const NENHUM_INDISPONIVEL = "nenhum";

/** Coluna `dados_indisponiveis`: separa os motivos com `; ` (vírgula já é o
 * separador do CSV, e o motivo viraria um campo fantasma). */
export function listaDeIndisponiveis(motivos: string[]): string {
	const limpos = motivos.filter((m) => m !== "");
	return limpos.length === 0 ? NENHUM_INDISPONIVEL : limpos.join("; ");
}
