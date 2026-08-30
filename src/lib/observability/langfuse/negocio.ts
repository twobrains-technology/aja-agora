// Marcos de NEGÓCIO no Langfuse — o que aconteceu com a venda, não com o turno.
//
// Por que separado de `funil-scores.ts`: aquele mede um TURNO e vive dentro do
// trace ativo. Estes marcos acontecem fora de qualquer turno — a mesa fecha o
// caso pelo painel, o worker reconcilia o status na Bevi, o admin arrasta o
// card. Não há trace ativo, então a âncora é a SESSÃO (`sessionId` =
// `conversations.id`, a mesma chave que `withLangfuseTurn` usa). Score de
// sessão é o único jeito de a conversão aparecer junto da conversa que a
// produziu.
//
// Antes disto, o evento mais importante do produto — lead virar
// `fechado_ganho` — não emitia NADA: nem log de sucesso, nem métrica
// (`lead-transitions.ts` só logava a falha do registro de mídia). Dava pra
// contar contrato no Postgres, mas não pra cruzar com a conversa que o gerou.
import { getLangfuseClient } from "./client";
// O LangfuseClient não aceita `environment` no construtor — precisa ir score a
// score, senão marco de negócio cai em "default" e some do filtro de produção.
import { ambienteLangfuse } from "./env";

/** Estágio terminal de sucesso — a única transição que é dinheiro no bolso. */
const ESTAGIO_GANHO = "fechado_ganho";

export type MarcoDeNegocio = {
	/** `conversations.id` — mesma chave de sessão dos traces de turno. */
	conversationId: string | null;
	estagio: string;
	estagioAnterior: string;
	/** Valor do crédito do lead, quando conhecido. */
	valor?: number | null;
	/** Conversa de teste não entra em métrica de dinheiro. */
	isSimulated: boolean;
};

/**
 * Publica a transição de estágio do lead como score de sessão.
 *
 * Silencioso e sem efeito quando: não há credencial, não há conversa para
 * ancorar, ou o lead é simulado. Simulado fica de fora pelo mesmo motivo que
 * `registrarConversao` o descarta — contaminar a taxa de fechamento com
 * conversa de teste é pior do que não ter a métrica.
 */
export function registrarMarcoDeNegocio(marco: MarcoDeNegocio): void {
	if (marco.isSimulated) return;
	if (!marco.conversationId) return;
	const client = getLangfuseClient();
	if (!client) return;

	try {
		client.score.create({
			name: "lead_estagio",
			value: marco.estagio,
			dataType: "CATEGORICAL",
			sessionId: marco.conversationId,
			environment: ambienteLangfuse(),
			comment: `${marco.estagioAnterior} → ${marco.estagio}`,
		});

		// Booleano dedicado além do categórico: dá pra ler taxa de conversão como
		// média direta (`avg`), sem precisar filtrar categoria por categoria.
		if (marco.estagio === ESTAGIO_GANHO) {
			client.score.create({
				name: "conversao",
				value: 1,
				dataType: "BOOLEAN",
				sessionId: marco.conversationId,
				environment: ambienteLangfuse(),
			});
			if (typeof marco.valor === "number" && Number.isFinite(marco.valor) && marco.valor > 0) {
				client.score.create({
					name: "valor_contrato",
					value: marco.valor,
					dataType: "NUMERIC",
					sessionId: marco.conversationId,
					environment: ambienteLangfuse(),
				});
			}
		}
	} catch (err) {
		console.error("[langfuse] marco de negócio falhou (ignorado):", err);
	}
}

/**
 * A PRIMEIRA CARTA da conversa — score de SESSÃO, emitido uma vez.
 *
 * `carta_na_tela` (funil-scores.ts) mede um TURNO, e por isso responde a
 * pergunta errada para avaliar a vitrine: quanto melhor ela funciona, mais
 * turnos a conversa ganha DEPOIS da carta (escolha, dúvida, fecho) — todos
 * valendo zero. A média por turno cai justamente quando o produto melhora.
 *
 * A pergunta que importa é por CONVERSA: ela chegou a ver preço, e em quantos
 * turnos? Foi essa a métrica levantada à mão no banco para diagnosticar o funil
 * (mediana de 5 turnos até a primeira carta, 34% das conversas chegando lá);
 * aqui ela vira dimensão viva, sem depender de alguém rodar SQL.
 *
 * Silencioso e sem efeito sem credencial ou sem conversa. Simulada fica de
 * fora pelo mesmo motivo dos outros marcos: contaminar a métrica com teste é
 * pior do que não tê-la.
 */
export function registrarPrimeiraCarta(marco: {
	conversationId: string | null;
	/** Turnos do CLIENTE até esta carta aparecer (1 = viu já na primeira fala). */
	turnosAteACarta: number;
	isSimulated: boolean;
}): void {
	if (marco.isSimulated) return;
	if (!marco.conversationId) return;
	const client = getLangfuseClient();
	if (!client) return;

	try {
		client.score.create({
			name: "carta_vista",
			value: 1,
			dataType: "BOOLEAN",
			sessionId: marco.conversationId,
			environment: ambienteLangfuse(),
		});
		if (Number.isFinite(marco.turnosAteACarta) && marco.turnosAteACarta > 0) {
			client.score.create({
				name: "turnos_ate_carta",
				value: marco.turnosAteACarta,
				dataType: "NUMERIC",
				sessionId: marco.conversationId,
				environment: ambienteLangfuse(),
			});
		}
	} catch (err) {
		console.error("[langfuse] marco da primeira carta falhou (ignorado):", err);
	}
}
