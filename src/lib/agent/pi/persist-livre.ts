// PERSISTÊNCIA DO VENDEDOR LIVRE — o mínimo que é FATO, sem gate.
//
// O que sobrevive (e por quê):
//  · mensagens: é a conversa no admin, na retomada e no histórico do próximo turno;
//    gravadas na ORDEM DOS EVENTOS (fala → card → fala), porque é por ela que a
//    retomada remonta a tela;
//  · marcador de card (`registrarCardEnviado`): prova que a cota foi mostrada —
//    sem ele a escolha do cliente não é validável depois;
//  · `persistMeta` ANTES do artifact sair: o adapter relê a meta fresca do banco
//    no handler do card;
//  · nome do contato: o kanban e a mesa leem daqui;
//  · estágio comercial do lead (`estagioComercialDoTurno`): o painel, o CPC e a
//    conversão comem daqui — é FATO da conversa, não gate;
//  · `uso_de_ia`: o livro-caixa de token do turno.
//
// O que saiu: `pendingGate`, `desireAsked`, `conduziu`, lead-stage POR GATE —
// tudo isso é instrumento do funil que este motor não tem mais. O estágio que
// fica é o que o mandato manda manter (`docs/design/2026-10-20-mandato-vendedor-livre.md:259`).

import { recordStageReached, type TrackableStage } from "@/lib/admin/lead-stage-tracker";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { passaFinal } from "@/lib/agent/orchestrator/vazamento";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { type EstadoDoTurno, funnelFromMeta } from "@/lib/agent/turn/estado";
import { projectToMeta } from "@/lib/agent/turn/projecao";
import { sincronizarNomeDoContato } from "@/lib/contacts/sincronizar-nome";
import { registrarCardEnviado } from "@/lib/conversation/cards";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { getCurrentClockOffset, runWithSimulatorClock } from "@/lib/utils/simulator-clock";

/**
 * O relógio do TURNO: cada linha gravada sai pelo menos 1 ms depois da anterior.
 *
 * A retomada (`chat/resume.ts`) lê as linhas na ordem de criação e desempata por
 * `id` — uuid ALEATÓRIO. Dois `saveMessage` seguidos caem na mesma volta do
 * relógio com facilidade, e aí quem decide a posição do card é o sorteio do
 * uuid: ao recarregar a página o card apareceria antes da fala que o anuncia.
 * O passo de 1 ms tira o empate; o offset do simulador (conversa simulada) é
 * somado, nunca perdido.
 */
function relogioDoTurno(conversationId: string) {
	const base = getCurrentClockOffset();
	let passo = 0;
	return <T>(linha: () => Promise<T>): Promise<T> =>
		runWithSimulatorClock({ offsetMs: base + passo++, conversationId }, linha);
}

/** Fala do cliente que não é digitada por ele (diretiva de servidor). */
function pareceDirectiveDeServidor(texto: string): boolean {
	if (texto.length < 400) return false;
	return /\bFLUXO\b|\bFIX-\d+|NÃO chame|tool-call/i.test(texto);
}

export async function persistirTurnoLivre(args: {
	estado: EstadoDoTurno;
	persona?: string | null;
}): Promise<void> {
	const { estado, persona = null } = args;
	const { conversationId, channel, isUserTurn, userText, events } = estado;
	const baseMeta = estado.baseMeta;
	const gravar = relogioDoTurno(conversationId);

	// 1. Fala do cliente — nunca um prompt de servidor no lugar dela.
	if (isUserTurn && userText && !pareceDirectiveDeServidor(userText)) {
		await gravar(() => saveMessage(conversationId, "user", userText, channel));
	}

	// 2. Meta ANTES dos cards (o adapter relê do banco ao abrir o artifact).
	//
	// `persistMeta` SUBSTITUI a coluna inteira. Se o turno lê a meta no começo,
	// grava identidade no meio (storeIdentity) e persiste o snapshot velho no
	// fim, o CPF que acabou de chegar é APAGADO — e a proposta passa a ser
	// impossível. Medido pelo parecer do Opus em 20/10/2026, e é o defeito que
	// derrubava o fechamento inteiro.
	//
	// Conserto: reler a meta do banco e aplicar SÓ os campos que este turno de
	// fato mudou (projeção do estado contra a projeção do estado de ENTRADA).
	// Campo que a tool gravou no meio do turno sobrevive.
	const meta = await metaDoTurnoSemApagar(baseMeta, estado);
	await persistMeta(conversationId, meta);

	// 3. O estágio comercial que este turno PROVOU. Depois do `persistMeta` de
	// propósito: a identidade capturada neste turno é gravada por `storeIdentity`
	// no MEIO dele, então a verdade está na meta FRESCA que acabou de ir ao banco,
	// não no `baseMeta` de entrada. `recordStageReached` é forward-only e
	// idempotente — reemitir a cada turno é seguro, e movimento humano no painel
	// nunca é desfeito por um turno de conversa.
	const estagio = estagioComercialDoTurno(estado, meta);
	if (estagio) await recordStageReached(conversationId, estagio);

	if (estado.contactName) {
		await sincronizarNomeDoContato({ conversationId, nome: estado.contactName }).catch(
			(erro: unknown) => {
				console.error("[persist-livre] nome do contato não sincronizado (ignorado):", erro);
			},
		);
	}

	// 4. As linhas do turno na ORDEM DOS EVENTOS — fala → card → fala.
	//
	// Antes esta função gravava TODOS os balões e só depois os marcadores de
	// card: o card fechava o turno no banco e, ao recarregar a página, voltava
	// no fim da conversa — ao vivo ele sai no meio, porque o stream manda as
	// partes na ordem dos eventos. A retomada (`chat/resume.ts`) reconstrói a
	// tela pela ordem de criação, então quem tem de gravar na ordem é este laço.
	//
	// Um balão por `text-boundary`, como antes. O card abre e fecha balão (R5.1):
	// se algum produtor emitir artifact sem boundary antes, o texto é fechado
	// ali mesmo e continua em balão novo — o card nunca fica dentro da fala.
	let balao = "";
	const fecharBalao = async () => {
		const texto = balao;
		balao = "";
		// Último passe: máquina (JSON de argumento, nome de tool) não vira balão.
		const limpo = passaFinal(texto);
		if (limpo.trim().length === 0) return;
		await gravar(() => saveMessage(conversationId, "assistant", limpo, channel, persona));
	};

	for (const ev of events) {
		if (ev.type === "text-delta") {
			balao += ev.text;
			continue;
		}
		if (ev.type === "artifact") {
			await fecharBalao();
			await gravar(() =>
				registrarCardEnviado({
					conversationId,
					tipo: ev.artifactType,
					payload: ev.payload,
					channel,
					personaId: persona,
				}),
			);
			continue;
		}
		if (ev.type === "text-boundary") await fecharBalao();
	}
	await fecharBalao();
}

/**
 * Até onde o lead chegou, lido dos FATOS da conversa — os mesmos degraus que a
 * `main` emitia como evento `lead-stage` no nó de persistência
 * (`src/lib/agent/langgraph/nodes/persist.ts:371`), sem o gate que os disparava.
 *
 * · `engajado` — o cliente disse o que quer: a categoria do assunto está posta.
 *   Na `main` era `desireAsked || currentCategory`; sem gate `desire`, a
 *   categoria é a âncora que sobra — e é mais forte, porque só existe quando a
 *   busca levou o assunto a sério;
 * · `qualificado` — identidade capturada (`identityCollected`, ligado por
 *   `storeIdentity` quando CPF + celular chegam);
 * · `em_negociacao` — viu as ofertas reais (`revealCompleted`) e voltou a falar:
 *   exige turno do CLIENTE depois do reveal, como na `main` — só receber os
 *   cards não é negociar.
 *
 * Devolve o degrau MAIS ALTO provado. É a versão em código do evento
 * `lead-stage` que a `main` mandava ao adapter: aqui o efeito (`recordStageReached`
 * → `metadata.maxStageReached` + a raia do lead) acontece na própria persistência,
 * que é o ponto por onde TODO turno passa — inclusive os que não têm adapter
 * escutando o stream.
 *
 * Estágios acima de `em_negociacao` (`proposta_enviada`, `na_administradora`,
 * `fechado_ganho`) não nascem de conversa: quem os escreve é o dono do fato
 * (`proposal-repo` no cadastro da proposta, a mesa no handoff, o poll de status
 * da Bevi).
 */
export function estagioComercialDoTurno(
	estado: Pick<EstadoDoTurno, "isUserTurn">,
	meta: ConversationMetadata,
): TrackableStage | null {
	// Do degrau mais alto para o mais baixo: o primeiro que bater é o estágio final.
	if (meta.revealCompleted && estado.isUserTurn) return "em_negociacao";
	if (meta.identityCollected) return "qualificado";
	if (meta.currentCategory) return "engajado";
	return null;
}

/**
 * A meta do fim do turno SEM apagar o que foi gravado DURANTE ele.
 *
 * `projectToMeta` faz merge por cima do `baseMeta` lido no INÍCIO do turno —
 * então tudo o que outra escrita gravou no meio (identidade cifrada, aceite de
 * LGPD, `contractClosed`) volta ao valor velho e desaparece. Aqui a base é a
 * meta FRESCA do banco, e só os campos que este turno realmente mudou entram
 * por cima.
 *
 * A régua do "mudou" é a projeção do estado INICIAL, não o `baseMeta` cru:
 * `projectToMeta` preenche default (`identityCollected: false`, por exemplo), e
 * comparar esse default com um `baseMeta` que não tinha o campo dava `undefined
 * → false` como mudança — o turno em que o CPF chegou sobrescrevia com `false`
 * o `true` que o `storeIdentity` acabara de gravar, e o lead daquele cliente
 * nunca chegava a `qualificado`. Dois lados pelo mesmo `projectToMeta` comparam
 * o que é comparável: só o que o TURNO mexeu entra por cima.
 */
export async function metaDoTurnoSemApagar(
	baseMeta: EstadoDoTurno["baseMeta"],
	estado: EstadoDoTurno,
): Promise<EstadoDoTurno["baseMeta"]> {
	const inicial = projectToMeta({ baseMeta, funnel: funnelFromMeta(baseMeta) });
	const projetado = projectToMeta(estado) as Record<string, unknown>;
	const fresca = await reloadMeta(estado.conversationId).catch(() => baseMeta);
	const mudados: Record<string, unknown> = {};
	for (const [chave, valor] of Object.entries(projetado)) {
		const antes = (inicial as Record<string, unknown>)[chave];
		if (JSON.stringify(valor) !== JSON.stringify(antes)) mudados[chave] = valor;
	}
	return { ...fresca, ...mudados } as EstadoDoTurno["baseMeta"];
}

/** Drena os eventos não-streamados (artifact/handoff) depois da persistência. */
export function eventosDeSaida(events: readonly TurnEvent[]): TurnEvent[] {
	return events.filter((ev) => ev.type === "artifact" || ev.type === "handoff");
}
