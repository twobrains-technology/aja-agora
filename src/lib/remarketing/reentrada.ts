/**
 * A REENTRADA DELIBERADA do bolo parado — a decisão pura.
 *
 * ── O problema que isto resolve ─────────────────────────────────────────────
 *
 * A janela de entrada de 7 dias (`motivo-de-exclusao.ts`, `JANELA_DE_ENTRADA_MS`)
 * fecha a porta por construção: quem ficou parado além dela NÃO entra na régua,
 * e é exatamente esse bolo que a cliente quer retomar. Medido em produção
 * (28/09/2026): `[remarketing-cycle] avaliadas 210, elegíveis 0` — e 4 conversas
 * apareciam com `parada_ha_mais_de_7_dias`.
 *
 * ── O que a reentrada é (e o que NÃO é) ─────────────────────────────────────
 *
 * É uma ação de ADMIN, **deliberada e em lote** (decisão do dono): o operador
 * escolhe trazer o bolo parado de volta IGNORANDO a janela de 7 dias. Não é o
 * ciclo se reabrindo sozinho — o ciclo continua respeitando os 7 dias.
 *
 * A decisão mora aqui, pura e sem I/O, pelo mesmo motivo de
 * `avaliarElegibilidade`: a tela (que só MOSTRA o que vai entrar e por que o
 * resto fica de fora) e a rota (que ESCREVE) chamam ESTA função. Um `CASE WHEN`
 * em SQL daria duas verdades para a mesma pergunta, e a divergência apareceria
 * como um número que não fecha com a lista logo abaixo dele.
 *
 * ── A janela de 7 dias é a ÚNICA guarda que a reentrada afrouxa ─────────────
 *
 * Todo o resto continua de pé, e na mesma ordem de `avaliarElegibilidade` — o
 * que muda é só a 11ª guarda (a janela): aqui ela não existe. As guardas que
 * NÃO se afrouxam:
 *
 *   - `regua_desligada` — sem a chave operacional o ciclo não dispara; trazer o
 *     bolo para uma régua desligada só criaria linhas paradas;
 *   - `teste` (`is_simulated`) — conversa de teste nunca é lead;
 *   - `optout` — quem pediu para sair NUNCA reentra (terminal por pessoa);
 *   - `encerrada` / `com_atendente` — sem para onde voltar;
 *   - `conversa_web` / `sem_contato` / `sem_telefone` / `telefone_da_equipe`;
 *   - `ainda_em_silencio` — a janela de 7 dias é o teto que cai; o PISO de 90
 *     min continua: ninguém reentra falando com a pessoa que acabou de escrever;
 *   - `respondeu` — quem ficou terminal POR TER RESPONDIDO não é reativado (o
 *     lead está vivo e é da mesa, não do robô);
 *   - `converteu` — fechou contrato, não se toca de novo;
 *   - `ja_ativo` — já está na régua; reentrar de novo é o que a idempotência
 *     impede.
 *
 * ── O estado inicial da linha reaberta ──────────────────────────────────────
 *
 * `step = 0`, `status = "ATIVO"`, `nextTouchAt = agora`, `touchesNaJanela = []`,
 * `motivoSaida = null`. O ciclo recomeça do ZERO (o motor nunca grava `step = 4`
 * numa reentrada — ver `registrarToque`), e o toque 01 volta a ser o primeiro.
 *
 * ── A cota de 30 dias CONTA o histórico (decisão do dono, 28/09) ────────────
 *
 * A cota é por PESSOA e global, entre campanhas. Na reentrada ela NÃO zera: o
 * que a linha já consumiu continua contando. Quem implementa isso é o motor, que
 * soma os toques do contato (`toquesDoContato`); a consequência na linha é que a
 * reabertura **preserva** `touches_30d` e `ultimo_toque_em` em vez de zerá-los.
 * Sem essa preservação, a reentrada daria 3 toques novos a quem já gastou os 3 —
 * o lado que não se pode errar.
 *
 * ⚠️ O dono AINDA NÃO respondeu se a cota conta o histórico ou zera com o passo
 * (registrado como EM ABERTO em `docs/decisoes/blocos/2026-09-28-decisoes-da-
 * frente-aja.md`, item 6). A recomendação do PRD — e o que esta frente seguiu —
 * é CONTAR (mais conservador).
 *
 * ── O registro de QUEM autorizou e QUANDO ───────────────────────────────────
 *
 * A reentrada é sempre de gente (nunca do ciclo), então a linha reaberta nasce
 * com o rastro de quem autorizou. Ele vai em `conversations.metadata`
 * (`remarketingAcao`), o mesmo lugar do rastro de segurar/soltar — sem coluna
 * nova, sem migration.
 */

import {
	type ConversaAvaliada,
	destinoDoToque,
	MOTIVOS_DE_EXCLUSAO,
	type MotivoDeExclusao,
	type OpcoesDaElegibilidade,
	ROTULO_DO_MOTIVO_DE_EXCLUSAO,
	referenciaDoSilencio,
} from "./motivo-de-exclusao";
import { ESPERA_SILENCIO_MS, type EstadoRegua, estadoInicial, type StatusRegua } from "./regua";

// ─── Os motivos: os da entrada + os que só a reentrada conhece ──────────────

/**
 * Por que uma conversa NÃO reentra. A reentrada afrouxa UMA guarda (a janela de
 * 7 dias) e adiciona as três que dependem do ESTADO da linha.
 */
export const MOTIVOS_DE_NAO_REENTRADA = [
	...MOTIVOS_DE_EXCLUSAO,
	"optout",
	"respondeu",
	"converteu",
	"ja_ativo",
] as const;

export type MotivoDeNaoReentrada = (typeof MOTIVOS_DE_NAO_REENTRADA)[number];

/** O motivo como o operador lê. Toda chave tem rótulo — é o que a tela mostra. */
export const ROTULO_DO_MOTIVO_DE_NAO_REENTRADA: Record<MotivoDeNaoReentrada, string> = {
	...ROTULO_DO_MOTIVO_DE_EXCLUSAO,
	optout: "O cliente pediu para sair — nunca reentra",
	respondeu: "O cliente respondeu — voltou para a mesa",
	converteu: "Fechou contrato",
	ja_ativo: "Já está na régua",
};

// ─── A conversa como a consulta a devolve ───────────────────────────────────

/** A linha da régua, quando a conversa já tem uma. */
export interface LinhaDaReguaResumida {
	status: StatusRegua;
	motivoSaida: string | null;
}

/**
 * A conversa avaliada para reentrada: a da entrada (`ConversaAvaliada`) mais o
 * terminal por PESSOA (opt-out no contato) e a linha da régua já existente.
 */
export interface ConversaParaReentrada extends ConversaAvaliada {
	/** `contacts.remarketing_optout_at` — opt-out por pessoa, terminal. */
	optoutDaPessoaEm: Date | null;
	/** Linha de `remarketing_touches`, quando já existe; `null` se nunca entrou. */
	regua: LinhaDaReguaResumida | null;
}

export type ResultadoDaReentrada =
	| { reentra: true }
	| { reentra: false; motivo: MotivoDeNaoReentrada };

// ─── A decisão ──────────────────────────────────────────────────────────────

/**
 * Esta conversa PODE reentrar na régua? A decisão, PURA.
 *
 * "Reentra" é a resposta para "esta conversa entra no lote de reentrada?" —
 * ignorando a janela de 7 dias e respeitando todo o resto. A idempotência sai
 * de graça: na segunda rodada a linha já está `ATIVO` e a resposta é
 * `ja_ativo`, então nada é duplicado.
 */
export function avaliarReentrada(
	conversa: ConversaParaReentrada,
	agora: Date,
	opcoes: OpcoesDaElegibilidade,
): ResultadoDaReentrada {
	const recusa = (motivo: MotivoDeNaoReentrada): ResultadoDaReentrada => ({
		reentra: false,
		motivo,
	});

	// 1. A chave operacional vence tudo: sem ela o ciclo não dispara, e trazer o
	// bolo para uma régua desligada só criaria linhas paradas.
	if (!opcoes.reguaLigada) return recusa("regua_desligada");

	// 2. Teste nunca é lead.
	if (conversa.isSimulated) return recusa("teste");

	// 3. Opt-out é terminal POR PESSOA — vence a régua inteira e sobrevive a
	// qualquer reentrada.
	if (conversa.optoutDaPessoaEm !== null || conversa.regua?.status === "OPTOUT") {
		return recusa("optout");
	}

	// 4/5. Encerrada não tem para onde voltar; com atendente já é da mesa.
	if (conversa.status === "closed") return recusa("encerrada");
	if (conversa.status !== "active") return recusa("com_atendente");

	// 6. Canal: a web só entra com a flag ligada (mesma guarda da entrada).
	const daWeb = conversa.channel === "web";
	if (daWeb && !opcoes.entradaWeb) return recusa("conversa_web");

	// 7/8. Sem contato não há como contar o teto de 30 dias; sem destino não há toque.
	if (!conversa.contactId) return recusa("sem_contato");
	if (destinoDoToque(conversa) === null) return recusa("sem_telefone");

	// 9. A casa não recebe o próprio remarketing.
	if (opcoes.telefoneDaEquipe) return recusa("telefone_da_equipe");

	// 10/11/12. O estado da linha já existente decide o resto.
	const status = conversa.regua?.status;
	if (status === "CONVERTEU") return recusa("converteu");
	// Quem ficou terminal POR TER RESPONDIDO não é reativado: o lead está vivo e
	// é da mesa. (Uma linha `RESPONDEU` de higiene — teste/equipe/segurado — cai
	// aqui também, de propósito: o atendente segurou à mão e a reentrada não
	// desfaz isso.)
	if (status === "RESPONDEU") return recusa("respondeu");
	// Já está na régua: reentrar de novo é o que a idempotência impede.
	if (status === "ATIVO") return recusa("ja_ativo");

	// 13. O PISO de silêncio continua: a janela de 7 dias é o teto que a reentrada
	// derruba, mas ninguém entra falando com quem acabou de escrever (ou sem saber
	// quando falou — a corrida do FIX-86). A referência é a MESMA da entrada (D9):
	// na web, a última FALA do cliente; no WhatsApp, o último inbound.
	const silencio = referenciaDoSilencio(conversa);
	if (!silencio) return recusa("ainda_em_silencio");
	if (silencio.getTime() > agora.getTime() - ESPERA_SILENCIO_MS) {
		return recusa("ainda_em_silencio");
	}

	// Sem linha (`null`) ou linha `ESGOTADO`: reentra. A janela de 7 dias NÃO é
	// consultada aqui — é exatamente ela que esta ação existe para ignorar.
	return { reentra: true };
}

// ─── O estado da linha reaberta ─────────────────────────────────────────────

/**
 * O estado da linha ESGOTADA depois da reentrada. PURA.
 *
 * Recomeça do ZERO (`step = 0`), volta a `ATIVO`, agenda o próximo toque para
 * AGORA e limpa `motivoSaida`. `toquesNaJanela` nasce VAZIO: o ciclo a
 * preenche de novo a partir do histórico da PESSOA (`toquesDoContato`), que é
 * quem faz a cota de 30 dias continuar CONTANDO (`touches_30d` e
 * `ultimoToqueEm` são preservados na gravação — ver o topo deste arquivo).
 */
export function reabrirEstado(estado: EstadoRegua, agora: Date): EstadoRegua {
	return {
		...estado,
		status: "ATIVO",
		step: 0,
		nextTouchAt: agora,
		toquesNaJanela: [],
		motivoSaida: null,
	};
}

/**
 * O estado de uma linha NOVA (a conversa que nunca tinha entrado). Mesmo estado
 * inicial da reabertura, via `estadoInicial`, para as duas portas nascerem
 * idênticas.
 */
export function estadoNovoDaReentrada(objetivo: string, agora: Date): EstadoRegua {
	return estadoInicial({ objetivo, nextTouchAt: agora });
}

// ─── O rastro de quem autorizou ─────────────────────────────────────────────

/** Quem autorizou a reentrada e quando — gravado na conversa. */
export interface AutorizacaoDaReentrada {
	tipo: "reentrada";
	/** Nome de quem estava logado. */
	por: string;
	/** O id da sessão, para quando dois nomes iguais agirem. */
	porId: string;
	/** Quando, em ISO. */
	em: string;
}

export function autorizacaoDaReentrada(
	por: string,
	porId: string,
	agora: Date,
): AutorizacaoDaReentrada {
	return { tipo: "reentrada", por, porId, em: agora.toISOString() };
}

/**
 * A linha reaberta, do jeito que o teste a exige: o estado inicial EXATO mais o
 * rastro de quem autorizou. O route grava o estado nas colunas e o rastro no
 * metadata da conversa.
 */
export interface LinhaReaberta {
	estado: EstadoRegua;
	autorizacao: AutorizacaoDaReentrada;
}

export function linhaReaberta(args: {
	/** Estado anterior (linha ESGOTADA) ou `null` quando a conversa nunca entrou. */
	estadoAnterior: EstadoRegua | null;
	/** Objetivo da conversa; usado só quando não há estado anterior. */
	objetivo: string;
	agora: Date;
	autorizacao: AutorizacaoDaReentrada;
}): LinhaReaberta {
	return {
		estado: args.estadoAnterior
			? reabrirEstado(args.estadoAnterior, args.agora)
			: estadoNovoDaReentrada(args.objetivo, args.agora),
		autorizacao: args.autorizacao,
	};
}

// ─── O log agregado ─────────────────────────────────────────────────────────

/**
 * O resumo do lote: quantas entraram e por que as outras ficaram de fora. É o
 * que a tela mostra ANTES de confirmar ("N vão entrar; M ficam de fora") e o que
 * o log grava depois.
 */
export function agregarReentrada(vereditos: readonly ResultadoDaReentrada[]): {
	avaliadas: number;
	entram: number;
	motivos: Record<string, number>;
} {
	const motivos: Record<string, number> = {};
	let entram = 0;
	for (const veredito of vereditos) {
		if (veredito.reentra) {
			entram += 1;
			continue;
		}
		motivos[veredito.motivo] = (motivos[veredito.motivo] ?? 0) + 1;
	}
	return { avaliadas: vereditos.length, entram, motivos };
}

/** O motivo de não-reentrada em português — o rótulo da tela. */
export function motivoDeNaoReentradaLegivel(motivo: MotivoDeNaoReentrada): string {
	return ROTULO_DO_MOTIVO_DE_NAO_REENTRADA[motivo];
}

// Reexport para a tela/route não precisarem de um terceiro import.
export type { MotivoDeExclusao };
