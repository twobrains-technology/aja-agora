/**
 * EXPORTAR TOQUES DA RÉGUA — uma linha por ENTRADA na `remarketing_touches`.
 *
 * A tabela é uma linha por conversa (índice único em `conversation_id`): ela
 * guarda o ESTADO do ciclo — em que passo, quando é o próximo toque e por que
 * saiu. Não há tabela de histórico de toque, e o módulo não inventa uma: o que
 * sai é o estado que a tela de remarketing mostra, com o vazio declarado.
 *
 * A janela recorta `created_at` (o evento estável da linha), a mesma regra da
 * tela: `next_touch_at` muda a cada toque e servir por ele esconderia as
 * conversas já paradas.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isoDeSaoPaulo } from "./conversas";
import type { LinhaExportada } from "./formato";
import { listaDeIndisponiveis, SEM_VINCULO_SEM_CONTATO } from "./textos";

export interface OpcoesDeToques {
	de: Date;
	ate: Date;
	mascarar?: boolean;
}

interface LinhaCrua extends Record<string, unknown> {
	conversation_id: string;
	contact_id: string | null;
	objetivo: string;
	step: number | string;
	status: string;
	next_touch_at: string | null;
	ultimo_toque_em: string | null;
	touches_30d: number | string;
	motivo_saida: string | null;
	created_at: string;
	updated_at: string;
}

export async function exportarToquesDaRegua(opcoes: OpcoesDeToques): Promise<LinhaExportada[]> {
	const { rows } = await db.execute<LinhaCrua>(sql`
    SELECT rt.conversation_id::text AS conversation_id, rt.contact_id::text AS contact_id,
      rt.objetivo, rt.step, rt.status, rt.next_touch_at, rt.ultimo_toque_em,
      rt.touches_30d, rt.motivo_saida, rt.created_at, rt.updated_at
    FROM remarketing_touches rt
    WHERE rt.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
    ORDER BY rt.created_at ASC
  `);

	return rows.map((linha) => {
		const motivos: string[] = [];
		const contatoId = linha.contact_id ? String(linha.contact_id) : null;
		if (!contatoId) motivos.push(SEM_VINCULO_SEM_CONTATO);

		if (!linha.next_touch_at) motivos.push("indisponível: sem próximo toque agendado");
		if (!linha.ultimo_toque_em) motivos.push("indisponível: nenhum toque disparado");
		if (!linha.motivo_saida && linha.status !== "ATIVO") {
			motivos.push("indisponível: motivo de saída não registrado");
		}

		return {
			conversaId: linha.conversation_id,
			contatoId: contatoId ?? SEM_VINCULO_SEM_CONTATO,
			objetivo: linha.objetivo,
			passo: String(linha.step ?? 0),
			status: linha.status,
			toques30d: String(linha.touches_30d ?? 0),
			proximoToque: linha.next_touch_at
				? isoDeSaoPaulo(linha.next_touch_at)
				: "indisponível: sem próximo toque agendado",
			ultimoToque: linha.ultimo_toque_em
				? isoDeSaoPaulo(linha.ultimo_toque_em)
				: "indisponível: nenhum toque disparado",
			motivoSaida: linha.motivo_saida
				? String(linha.motivo_saida)
				: linha.status === "ATIVO"
					? "não aplicável: régua ativa"
					: "indisponível: motivo de saída não registrado",
			criadoEm: isoDeSaoPaulo(linha.created_at),
			atualizadoEm: isoDeSaoPaulo(linha.updated_at),
			dadosIndisponiveis: listaDeIndisponiveis(motivos),
		};
	});
}

/** Contagem barata para o cartão da tela. */
export async function contarToques(opcoes: { de: Date; ate: Date }): Promise<{ toques: number }> {
	const { rows } = await db.execute<{ toques: string | number }>(sql`
    SELECT count(*) AS toques FROM remarketing_touches rt
    WHERE rt.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
  `);
	return { toques: Number(rows[0]?.toques ?? 0) };
}
