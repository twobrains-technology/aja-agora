/**
 * POR QUE UMA CONVERSA NÃO ENTROU NA RÉGUA — a fonte única do motivo.
 *
 * ── O problema que isto resolve ─────────────────────────────────────────────
 *
 * Até 18/09/2026 a entrada na régua era uma consulta só: quem falhava QUALQUER
 * uma das nove condições simplesmente não aparecia no resultado. Medido em
 * produção (diagnóstico §c): dos 12 identificados-parados, 4 eram da web, 2
 * tinham telefonema antigo demais, 1 era o telefone da casa e 3 já estavam na
 * régua — e responder "por que estes não entraram?" era rodar as nove condições
 * à mão, uma a uma. Sem nome no motivo, a resposta para a Bruna era silêncio.
 *
 * ── Por que a decisão mora AQUI, e não no SQL ────────────────────────────────
 *
 * A consulta continua pré-filtrando por PERFORMANCE (a janela de 7 dias tem
 * índice), mas quem decide é esta função — e o ciclo a chama para CADA conversa
 * do recorte, inclusive as que seriam excluídas. Duas consequências, e as duas
 * são o motivo de o arquivo existir:
 *
 *   1. **o log do ciclo passa a ter nome**: `[remarketing-cycle] excluídos
 *      {motivo: n}` em vez de "não apareceu";
 *   2. **o admin e o worker não podem discordar**: `motivoForaDaRegua` da tela
 *      chama ESTA função. Um `CASE WHEN` em SQL daria duas verdades para a mesma
 *      pergunta, e a divergência apareceria como um número que não fecha com a
 *      lista logo abaixo dele (o defeito clássico de painel).
 *
 * ── A ordem dos guardas É a precedência do motivo ───────────────────────────
 *
 * Uma conversa pode falhar várias guardas; o motivo relatado é o PRIMEIRO da
 * lista abaixo. A ordem é a do código antigo (`entrarNaRegua`), do mais barato
 * e mais definitivo para o mais circunstancial:
 *
 *   1. `regua_desligada` — a chave operacional. Sem ela ninguém entra, e é o
 *      único motivo que não depende da conversa;
 *   2. `teste` — `is_simulated`: nunca é lead;
 *   3. `encerrada` / `com_atendente` — `status` fora de `active`;
 *   4. `conversa_web` — canal que a régua não atendia (passa com
 *      `REMARKETING_ENTRADA_WEB`);
 *   5. `sem_contato` — sem `contact_id` não há como contar o teto de 30 dias;
 *   6. `sem_telefone` — sem destino não há toque;
 *   7. `telefone_da_equipe` — a casa não recebe remarketing;
 *   8. `ja_na_regua` — já tem linha, não entra de novo;
 *   9. `ainda_em_silencio` — menos de 90 min (ou `last_inbound_at` nulo, a
 *      corrida do FIX-86);
 *  10. `parada_ha_mais_de_7_dias` — a janela fechou; NÃO se reabre
 *      retroativamente (decisão de produto, PRD §5.4).
 *
 * ── O que NÃO está aqui ─────────────────────────────────────────────────────
 *
 * Nada de leitura de banco, env ou relógio: `agora`, as flags e o veredito de
 * "telefone da equipe" entram por parâmetro (o ciclo resolve o I/O). É o que
 * permite provar cada guarda com uma fixture, sem Postgres.
 */

import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";
import { ESPERA_SILENCIO_MS } from "./regua";

// ─── Os motivos ─────────────────────────────────────────────────────────────

/** Os motivos de EXCLUSÃO da entrada — o vocabulário do log e da tela. */
export const MOTIVOS_DE_EXCLUSAO = [
	"regua_desligada",
	"teste",
	"encerrada",
	"com_atendente",
	"conversa_web",
	"sem_contato",
	"sem_telefone",
	"telefone_da_equipe",
	"ja_na_regua",
	"ainda_em_silencio",
	"parada_ha_mais_de_7_dias",
] as const;

export type MotivoDeExclusao = (typeof MOTIVOS_DE_EXCLUSAO)[number];

/** O motivo como o operador lê. Toda chave tem rótulo — é o que a tela mostra. */
export const ROTULO_DO_MOTIVO_DE_EXCLUSAO: Record<MotivoDeExclusao, string> = {
	regua_desligada: "Régua desligada",
	teste: "Conversa de teste",
	encerrada: "Conversa encerrada",
	com_atendente: "Com atendente",
	conversa_web: "Conversa da web",
	sem_contato: "Sem contato no cadastro",
	sem_telefone: "Sem telefone válido",
	telefone_da_equipe: "Telefone da equipe",
	ja_na_regua: "Já está na régua",
	ainda_em_silencio: "Ainda em silêncio",
	parada_ha_mais_de_7_dias: "Parada há mais de 7 dias",
};

// ─── Os motivos de SAÍDA ────────────────────────────────────────────────────
//
// A régua tem dois vocabulários, e confundi-los é o que faz a tela mentir: o
// motivo de EXCLUSÃO diz por que a conversa nunca entrou; o de SAÍDA diz por que
// ela parou depois de entrar. Os três primeiros já existiam em `regua.ts`
// (`MotivoSaida`) e o `segurado_pelo_atendente` nasceu na tela do admin; os dois
// novos vêm da higiene desta frente (AJA-10): a conversa marcada como teste sai
// da régua no mesmo PATCH, e o telefone da casa é segurado pelo ciclo.

/** Marca a linha que parou por ser TESTE (`conversations.is_simulated`). */
export const MOTIVO_SAIDA_TESTE = "teste";

/** Marca a linha que parou por o telefone ser da EQUIPE. */
export const MOTIVO_SAIDA_EQUIPE = "telefone_da_equipe";

/** O motivo da ação MANUAL de segurar (mesmo valor que a tela do admin lê). */
export const MOTIVO_SAIDA_SEGURADO = "segurado_pelo_atendente";

/** Os motivos de saída conhecidos, com o rótulo que o operador lê. */
export const ROTULO_DO_MOTIVO_DE_SAIDA: Record<string, string> = {
	cliente_respondeu: "O cliente respondeu",
	tres_toques_sem_resposta: "Três toques sem resposta",
	optout_do_cliente: "O cliente pediu para sair",
	[MOTIVO_SAIDA_SEGURADO]: "Segurou à mão, pelo painel",
	[MOTIVO_SAIDA_TESTE]: "Conversa de teste",
	[MOTIVO_SAIDA_EQUIPE]: "Telefone da equipe",
};

/**
 * O motivo de saída em português — e o valor CRU quando ele é desconhecido.
 *
 * O cru é deliberado: inventar um rótulo genérico ("outro") esconderia a
 * divergência em vez de mostrá-la, e um motivo novo gravado por outra frente
 * apareceria igual a um motivo que ninguém soube nomear. Mesma decisão de
 * `rotuloDoMotivo` na tela do admin.
 */
export function motivoDeSaidaLegivel(motivo: string | null | undefined): string | null {
	if (!motivo) return null;
	return ROTULO_DO_MOTIVO_DE_SAIDA[motivo] ?? motivo;
}

// ─── A decisão ──────────────────────────────────────────────────────────────

/** A conversa como a consulta a devolve — nada derivado, nada resolvido. */
export interface ConversaAvaliada {
	channel: "web" | "whatsapp";
	/** `conversations.status`: `active` · `handed_off` · `closed`. */
	status: "active" | "handed_off" | "closed";
	isSimulated: boolean;
	contactId: string | null;
	/** `conversations.last_inbound_at` — pode ser nulo (corrida do FIX-86). */
	lastInboundAt: Date | null;
	/** `conversations.wa_id` — o destino do WhatsApp, quando existe. */
	waId: string | null;
	/** `contacts.phone` — o telefone do cadastro (a fonte do lead da web). */
	phone: string | null;
	/** Já existe linha em `remarketing_touches` para esta conversa? */
	jaNaRegua: boolean;
}

export interface OpcoesDaElegibilidade {
	/** `REMARKETING_ATIVO` — a chave operacional, lida fora daqui. */
	reguaLigada: boolean;
	/** `REMARKETING_ENTRADA_WEB` — nasce vazia (desligada). */
	entradaWeb: boolean;
	/**
	 * O telefone de destino é da equipe? O ciclo resolve (lista em código, env e
	 * banco) e passa o veredito — a função não faz I/O.
	 */
	telefoneDaEquipe: boolean;
}

export type ResultadoDeElegibilidade =
	| { elegivel: true }
	| { elegivel: false; motivo: MotivoDeExclusao };

/** A janela de entrada: 7 dias. Mesma constante da consulta do ciclo. */
export const JANELA_DE_ENTRADA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O destino do toque: o `wa_id` da conversa e, sem ele, o telefone do contato.
 *
 * O `wa_id` vem primeiro porque é o número que a Meta entrega para aquele
 * aparelho; o do cadastro é a fonte do lead que chegou pela WEB, que nunca tem
 * `wa_id` (e é justamente quem a régua ignorava — AJA-09). Telefone fora do
 * formato brasileiro não conta como destino: melhor excluir com nome do que
 * tentar enviar para um número que a Meta vai recusar.
 */
export function destinoDoToque(conversa: Pick<ConversaAvaliada, "waId" | "phone">): string | null {
	for (const candidato of [conversa.waId, conversa.phone]) {
		if (candidato && chaveTelefoneBR(candidato) !== null) return candidato;
	}
	return null;
}

/**
 * A decisão, PURA: a conversa + o agora + as opções entram; o veredito sai.
 *
 * "Elegível" é a resposta para "esta conversa entra na régua no próximo ciclo?"
 * — e é a MESMA pergunta que `entrarNaRegua` responde em SQL. A igualdade das
 * duas é o que o teste de integração prova com fixtures reais: se a consulta
 * ganhar uma condição que a função não tem (ou o contrário), o teste cai.
 */
export function avaliarElegibilidade(
	conversa: ConversaAvaliada,
	agora: Date,
	opcoes: OpcoesDaElegibilidade,
): ResultadoDeElegibilidade {
	const exclui = (motivo: MotivoDeExclusao): ResultadoDeElegibilidade => ({
		elegivel: false,
		motivo,
	});

	// 1. A chave operacional vence tudo: desligada, ninguém entra — nem o lead
	// perfeito. É o que faz um deploy não começar a mandar WhatsApp por acidente.
	if (!opcoes.reguaLigada) return exclui("regua_desligada");

	// 2. Teste nunca é lead (e é o mesmo campo que tira a conversa do funil).
	if (conversa.isSimulated) return exclui("teste");

	// 3. Encerrada não tem para onde voltar; 4. com atendente já é da mesa.
	if (conversa.status === "closed") return exclui("encerrada");
	if (conversa.status !== "active") return exclui("com_atendente");

	// 5. Canal: a web só entra com a flag ligada (D1 do PRD).
	const daWeb = conversa.channel === "web";
	if (daWeb && !opcoes.entradaWeb) return exclui("conversa_web");

	// 6. Sem contato não há como contar o teto de 30 dias (a linha exige
	// `contact_id`), nem telefone para resolver.
	if (!conversa.contactId) return exclui("sem_contato");

	// 7. Sem destino não há toque.
	if (destinoDoToque(conversa) === null) return exclui("sem_telefone");

	// 8. A casa não recebe o próprio remarketing.
	if (opcoes.telefoneDaEquipe) return exclui("telefone_da_equipe");

	// 9. Já tem linha: quem decide se ela volta a disparar é o motor, não a
	// entrada (reentrada por simulação é decisão de OUTRO predicado).
	if (conversa.jaNaRegua) return exclui("ja_na_regua");

	// 10. Silêncio: 90 min contados do último inbound. Data ausente cai aqui de
	// propósito — sem saber quando a pessoa falou, não há como dizer que ela
	// está parada há tempo suficiente (FIX-86: 100% das conversas com UMA
	// mensagem do usuário tinham `last_inbound_at` nulo em produção).
	if (!conversa.lastInboundAt) return exclui("ainda_em_silencio");
	if (conversa.lastInboundAt.getTime() > agora.getTime() - ESPERA_SILENCIO_MS) {
		return exclui("ainda_em_silencio");
	}

	// 11. A janela de 7 dias. Quem saiu dela NÃO é reaberto retroativamente
	// (decisão de produto, PRD §5.4): aparece na lista como "fora da régua" e a
	// decisão de falar com a pessoa é da mesa.
	if (conversa.lastInboundAt.getTime() <= agora.getTime() - JANELA_DE_ENTRADA_MS) {
		return exclui("parada_ha_mais_de_7_dias");
	}

	return { elegivel: true };
}

/**
 * O log agregado do ciclo: quantas conversas foram avaliadas e por que as
 * excluídas ficaram de fora. Agregado de propósito (não uma linha por
 * conversa): o ciclo roda a cada 30 s e um log por conversa viraria ruído que
 * ninguém lê — a pergunta que ele responde é "de que lado está caindo a fila".
 */
export function agregarMotivos(avaliadas: readonly ResultadoDeElegibilidade[]): {
	avaliadas: number;
	elegiveis: number;
	motivos: Record<string, number>;
} {
	const motivos: Record<string, number> = {};
	let elegiveis = 0;
	for (const veredito of avaliadas) {
		if (veredito.elegivel) {
			elegiveis += 1;
			continue;
		}
		motivos[veredito.motivo] = (motivos[veredito.motivo] ?? 0) + 1;
	}
	return { avaliadas: avaliadas.length, elegiveis, motivos };
}
