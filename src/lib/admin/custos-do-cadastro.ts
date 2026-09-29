// O CADASTRO DOS CUSTOS — o que não é fato medido vira número que o dono digita.
//
// Duas leituras do painel dependem de um número que NENHUM servidor mede:
//
//   `cotacao_usd_brl`      — o custo de IA sai do Langfuse em DÓLAR e o CPC é em
//                            REAL; sem esta cotação, o dólar não vira real.
//   `preco_mensagem_cents` — a mensagem de template/remarketing tem preço, e a
//                            tabela da Meta muda por categoria e país — por isso
//                            é cadastro, não constante em código.
//
// Mesmo desenho de `remarketing_config`: chave-valor de TEXTO, tipo validado na
// leitura, e **ausência de linha = "não calculável"**. Um `null` daqui nunca
// pode virar `0` lá na frente: zero é uma afirmação ("custou nada"), e o que
// existe aqui é a falta do dado.
//
// Puro na montagem (`montarCustosDoCadastro`) para provar os casos sem Postgres.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { custosConfig } from "@/db/schema";

/** A linha crua de `custos_config`, como vem do banco. */
export interface LinhaDoCadastroDeCustos {
	chave: string;
	valor: string | null;
}

export const CHAVE_DA_COTACAO = "cotacao_usd_brl";
export const CHAVE_DO_PRECO_DA_MENSAGEM = "preco_mensagem_cents";

/** " 5.45 " → 5.45; vazio, texto ou ≤ 0 → `null` (ausência, nunca zero). */
export function cotacaoDoCadastro(bruto: string | null | undefined): number | null {
	if (bruto == null) return null;
	const texto = bruto.trim().replace(",", ".");
	if (!/^\d+(\.\d+)?$/.test(texto)) return null;
	const numero = Number(texto);
	return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** " 12 " → 12 centavos; vazio, texto, decimal ou negativo → `null`. */
export function precoEmCentavosDoCadastro(bruto: string | null | undefined): number | null {
	if (bruto == null) return null;
	const texto = bruto.trim();
	if (!/^\d+$/.test(texto)) return null;
	const numero = Number(texto);
	return Number.isSafeInteger(numero) ? numero : null;
}

export interface CustosDoCadastro {
	/** Reais por 1 dólar; `null` = sem cotação cadastrada. */
	cotacaoUsdBrl: number | null;
	/** Centavos de real por mensagem de template; `null` = sem preço cadastrado. */
	precoMensagemCents: number | null;
}

/** Monta o cadastro a partir das linhas do banco — SEM I/O. */
export function montarCustosDoCadastro(
	linhas: readonly LinhaDoCadastroDeCustos[],
): CustosDoCadastro {
	const porChave = new Map(linhas.map((linha) => [linha.chave, linha.valor]));
	return {
		cotacaoUsdBrl: cotacaoDoCadastro(porChave.get(CHAVE_DA_COTACAO)),
		precoMensagemCents: precoEmCentavosDoCadastro(porChave.get(CHAVE_DO_PRECO_DA_MENSAGEM)),
	};
}

/** Lê uma chave do cadastro. Server-only. */
export async function lerCustoDoCadastro(chave: string): Promise<string | null> {
	const [linha] = await db
		.select({ valor: custosConfig.valor })
		.from(custosConfig)
		.where(eq(custosConfig.chave, chave))
		.limit(1);
	return linha?.valor ?? null;
}
