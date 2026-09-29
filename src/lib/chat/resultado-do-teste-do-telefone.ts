/**
 * FIX-397 — o RESULTADO do teste do telefone, separado por variante.
 *
 * Palavras do Kairo na call de 29/09/2026 (12:13:46): *"O melhor jeito de a gente
 * validar isso vai ser realmente com essa metrificação. A gente imagina que são
 * três possibilidades aqui. Vamos tirar as três então. Qual foi melhor?"* — e a
 * condição dele (12:15): sem número confiável, AB com pouca gente é viés.
 *
 * Sem o registro de qual caminho a pessoa percorreu, no dia 01/10 só haveria
 * opinião. Aqui ficam as duas metades:
 *
 *  1. `agregarResultadoDoTesteDoTelefone` — PURA, testável sem banco. Recebe as
 *     visitas do período com a variante e o que aconteceu em cada uma, e devolve
 *     a leitura por variante.
 *  2. `resultadoDoTesteDoTelefone` — a consulta que produz essas linhas.
 *
 * Duas regras de leitura, herdadas da régua do bloco de custo:
 *  - **sem dado ⇒ "não calculável", nunca zero.** Zero é uma afirmação ("nenhuma
 *    visita converteu"); "não calculável" é a verdade ("nenhuma visita caiu
 *    aqui ainda"). Numa massa de 60 pessoas a diferença decide se alguém tira
 *    conclusão de um lado vazio.
 *  - 🚫 **nenhum evento novo para a Meta.** O resultado sai de dados que já
 *    existem no banco; o teste A/B na Meta não é disparado por este bloco.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ARTIFACTS_DE_OFERTA_SQL, conversaIdentificada } from "@/lib/admin/sinais-do-funil";
import { lerVariante, VARIANTES_DO_TELEFONE, type VarianteDoTelefone } from "./variante-da-visita";

/** A chave em `conversations.metadata` onde a variante escolhida vive. Fonte
 *  única: quem grava e quem lê usam ESTA constante. */
export const CHAVE_DO_TESTE_NO_METADATA = "telefoneDoDesbloqueio";

/** Uma visita do teste: em que variante caiu e o que aconteceu com ela. */
export interface LinhaDoTesteDoTelefone {
	variante: VarianteDoTelefone;
	/** O cliente deixou telefone/e-mail (a régua de `conversaIdentificada`). */
	telefone: boolean;
	/** Chegou a ver número de oferta (a lista única de `ARTIFACTS_DE_OFERTA`). */
	comparacao: boolean;
}

export interface ResultadoPorVariante {
	variante: VarianteDoTelefone;
	/** `null` = não calculável (nenhuma visita caiu nesta variante no período). */
	visitas: number | null;
	telefones: number | null;
	naComparacao: number | null;
	/** telefones ÷ visitas. `null` quando não calculável. */
	taxaDeTelefone: number | null;
}

/**
 * Agrega as visitas por variante.
 *
 * Devolve SEMPRE as duas variantes, na ordem canônica — quem lê precisa ver "C:
 * não calculável" em vez de uma linha ausente que parece esquecimento.
 */
export function agregarResultadoDoTesteDoTelefone(
	linhas: readonly LinhaDoTesteDoTelefone[],
): ResultadoPorVariante[] {
	const porVariante = new Map<
		VarianteDoTelefone,
		{ visitas: number; telefones: number; comparacao: number }
	>();
	for (const variante of VARIANTES_DO_TELEFONE) {
		porVariante.set(variante, { visitas: 0, telefones: 0, comparacao: 0 });
	}

	for (const linha of linhas) {
		// Variante desconhecida ⇒ erro alto (não é "outro balde", é dado corrompido).
		const variante = linha.variante;
		const acumulado = porVariante.get(variante);
		if (!acumulado) {
			throw new TypeError(
				`agregarResultadoDoTesteDoTelefone: variante desconhecida (${String(variante)})`,
			);
		}
		acumulado.visitas += 1;
		if (linha.telefone) acumulado.telefones += 1;
		if (linha.comparacao) acumulado.comparacao += 1;
	}

	return VARIANTES_DO_TELEFONE.map((variante) => {
		const { visitas, telefones, comparacao } = porVariante.get(variante) as {
			visitas: number;
			telefones: number;
			comparacao: number;
		};
		if (visitas === 0) {
			return {
				variante,
				visitas: null,
				telefones: null,
				naComparacao: null,
				taxaDeTelefone: null,
			};
		}
		return {
			variante,
			visitas,
			telefones,
			naComparacao: comparacao,
			taxaDeTelefone: telefones / visitas,
		};
	});
}

/** O total das duas variantes — `null` quando NENHUMA visita entrou no teste. */
export function totalDoTesteDoTelefone(
	resultado: readonly ResultadoPorVariante[],
): { visitas: number; telefones: number; naComparacao: number } | null {
	if (resultado.every((r) => r.visitas === null)) return null;
	return resultado.reduce(
		(acc, r) => ({
			visitas: acc.visitas + (r.visitas ?? 0),
			telefones: acc.telefones + (r.telefones ?? 0),
			naComparacao: acc.naComparacao + (r.naComparacao ?? 0),
		}),
		{ visitas: 0, telefones: 0, naComparacao: 0 },
	);
}

/**
 * Lê do banco as visitas do período que entraram no teste, já com o desfecho de
 * cada uma. Só visitas WEB com variante registrada — WhatsApp não participa do
 * teste (o número já é conhecido) e visita sem variante não é "do teste".
 */
export async function resultadoDoTesteDoTelefone(
	de: Date,
	ate: Date,
): Promise<ResultadoPorVariante[]> {
	const variante = sql`c.metadata -> ${CHAVE_DO_TESTE_NO_METADATA} ->> 'variante'`;
	const { rows } = await db.execute<{
		visit_id: string;
		variante: string;
		telefone: boolean;
		comparacao: boolean;
	}>(sql`
    SELECT
      v.id::text AS visit_id,
      max(${variante}) AS variante,
      bool_or(${conversaIdentificada(sql`c`)}) AS telefone,
      bool_or(EXISTS (
        SELECT 1 FROM messages m
        JOIN artifacts a ON a.message_id = m.id
        WHERE m.conversation_id = c.id
          AND a.type IN (${ARTIFACTS_DE_OFERTA_SQL})
      )) AS comparacao
    FROM visits v
    JOIN conversations c
      ON c.visit_id = v.id
     AND c.is_simulated = false
     AND c.channel = 'web'
    WHERE v.created_at BETWEEN ${de} AND ${ate}
      AND ${variante} IS NOT NULL
    GROUP BY v.id
  `);

	return agregarResultadoDoTesteDoTelefone(
		rows.map((linha) => ({
			variante: lerVariante(linha.variante),
			telefone: linha.telefone === true,
			comparacao: linha.comparacao === true,
		})),
	);
}
