/**
 * CUSTO DE MENSAGEM — a contagem é fato, o preço é cadastro.
 *
 * ── As duas metades, e por que elas não se misturam ─────────────────────────
 *
 * (a) CONTAGEM — quantas mensagens de template saíram no período, por template.
 *     É fato do servidor: ou a mensagem saiu e a linha existe, ou não saiu.
 *     Duas fontes, e são DISJUNTAS:
 *       - `whatsapp_outbound_queue` (`status='sent'`, `sent_at` no período,
 *         chave `usage_key`): a mensagem business-initiated que o dispatcher
 *         enviou sozinho quando o template virou aprovado;
 *       - `messages.template_name` (a mensagem HSM que o atendente mandou pelo
 *         painel; `role='assistant'`, `created_at` no período) — só entram as
 *         conversas NÃO simuladas, a mesma regra do resto da tela.
 *     Os dois caminhos não se sobrepõem: o dispatcher não grava em `messages`
 *     e o painel não enfileira. Somar os dois é contar cada envio uma vez.
 *
 * (b) PREÇO — quanto custa cada uma. **Cadastro** (`custos_config`, chave
 *     `preco_mensagem_cents`), nunca constante em código: a tabela da Meta muda
 *     por categoria e país, e um número cravado no código mentiria no dia em que
 *     a Meta reajustasse.
 *
 * ── A lei ──────────────────────────────────────────────────────────────────
 *
 * **Sem preço cadastrado, a tela mostra a CONTAGEM e diz "sem preço
 * cadastrado" — nunca "R$ 0,00".** Zero afirmaria que a mensagem saiu de graça;
 * o que existe é a falta do preço. A contagem é o que sobra de útil (dá para
 * fechar o volume), e ela vai junto do motivo.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
	CHAVE_DO_PRECO_DA_MENSAGEM,
	lerCustoDoCadastro,
	precoEmCentavosDoCadastro,
} from "./custos-do-cadastro";

/** Quantas mensagens de um mesmo template saíram no período. */
export interface ContagemDeTemplate {
	template: string;
	quantidade: number;
}

export interface ResultadoCustoDeMensagem {
	/** O FATO: total de mensagens de template no período. Existe sem preço. */
	quantidade: number;
	/** O mesmo fato aberto por template, ordenado — para a tela não oscilar. */
	porTemplate: ContagemDeTemplate[];
	/** O PREÇO, ou o motivo nomeado de ele não existir. */
	custo:
		| { tipo: "valor"; centavos: number; precoUnitarioCents: number }
		| { tipo: "motivo"; motivo: "sem_preco"; explicacao: string };
}

const EXPLICACAO_SEM_PRECO =
	"Sem preço cadastrado — o volume está contado, o custo não é calculável.";

/**
 * Monta o resultado a partir das contagens (fato) e do preço (cadastro) — PURO,
 * para os dois casos que importam (com e sem preço) serem provados sem Postgres.
 */
export function montarCustoDeMensagem(args: {
	contagens: readonly ContagemDeTemplate[];
	precoUnitarioCents: number | null;
}): ResultadoCustoDeMensagem {
	const porTemplate = [...args.contagens].sort((a, b) =>
		a.template < b.template ? -1 : a.template > b.template ? 1 : 0,
	);
	const quantidade = porTemplate.reduce((total, contagem) => total + contagem.quantidade, 0);

	// Sem preço: mostra a contagem e NOMEIA o motivo. Nunca "R$ 0,00".
	if (args.precoUnitarioCents === null) {
		return {
			quantidade,
			porTemplate,
			custo: { tipo: "motivo", motivo: "sem_preco", explicacao: EXPLICACAO_SEM_PRECO },
		};
	}

	return {
		quantidade,
		porTemplate,
		custo: {
			tipo: "valor",
			centavos: quantidade * args.precoUnitarioCents,
			precoUnitarioCents: args.precoUnitarioCents,
		},
	};
}

/**
 * Conta as mensagens de template do período, por template. Server-only.
 *
 * O `UNION ALL` é de propósito: cada fonte é dona do seu fato e nenhuma linha
 * é contada duas vezes (ver o cabeçalho). O `to_char` fixa o fuso do negócio
 * para o filho do dispatcher, e o `is_simulated = false` mantém o teste interno
 * fora — a mesma regra que todo o resto da tela segue.
 */
export async function contagensDoPeriodo(de: Date, ate: Date): Promise<ContagemDeTemplate[]> {
	const resultado = await db.execute<{ template: string; quantidade: unknown }>(sql`
    SELECT template, count(*)::int AS quantidade FROM (
      SELECT q.usage_key AS template
        FROM whatsapp_outbound_queue q
        WHERE q.status = 'sent'
          AND q.sent_at BETWEEN ${de} AND ${ate}
      UNION ALL
      SELECT m.template_name AS template
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.role = 'assistant'
          AND m.template_name IS NOT NULL
          AND c.is_simulated = false
          AND m.created_at BETWEEN ${de} AND ${ate}
    ) AS envios
    GROUP BY template
    ORDER BY template
  `);

	return resultado.rows.map((linha) => ({
		template: String(linha.template),
		quantidade: Number(linha.quantidade ?? 0) || 0,
	}));
}

/** As fontes do custo de mensagem — injetáveis para prover a costura sem banco. */
export interface FontesDoCustoDeMensagem {
	lerContagens(de: Date, ate: Date): Promise<ContagemDeTemplate[]>;
	lerPreco(): Promise<number | null>;
}

const FONTES_REAIS: FontesDoCustoDeMensagem = {
	lerContagens: contagensDoPeriodo,
	lerPreco: () => lerCustoDoCadastro(CHAVE_DO_PRECO_DA_MENSAGEM).then(precoEmCentavosDoCadastro),
};

/**
 * O custo de mensagem do período, pronto para a tela.
 *
 * Falha de leitura não vira "sem preço": devolve o motivo `sem_preco` só quando
 * o preço realmente não está cadastrado; erro de banco sobe, porque contagem
 * errada é pior que contagem ausente e o chamador decide o que mostrar.
 */
export async function computeCustoDeMensagem(
	args: { de: Date; ate: Date },
	fontes: FontesDoCustoDeMensagem = FONTES_REAIS,
): Promise<ResultadoCustoDeMensagem> {
	const [contagens, preco] = await Promise.all([
		fontes.lerContagens(args.de, args.ate),
		fontes.lerPreco(),
	]);
	return montarCustoDeMensagem({ contagens, precoUnitarioCents: preco });
}
