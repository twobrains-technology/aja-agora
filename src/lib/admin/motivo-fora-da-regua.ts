/**
 * POR QUE ESTA CONVERSA NÃO ESTÁ NA RÉGUA — o dicionário ÚNICO do painel.
 *
 * A pergunta da Bruna ("por que estas 11 não estão na régua?") não tinha coluna
 * em tela nenhuma: a régua automática só alcança conversas de WhatsApp ativas,
 * com contato resolvido, paradas entre 90 minutos e 7 dias, e quem ficava fora
 * simplesmente não aparecia — sem log, sem motivo, sem explicação.
 *
 * ── O que este arquivo é, e o que ele NÃO é ─────────────────────────────────
 *
 * Ele é o ESPELHO, na mesma ordem, das guardas de `entrarNaRegua`
 * (`src/lib/workers/remarketing-cycle.ts:297-350`). Cada motivo é um FATO do
 * servidor — a guarda que falhou —, não interpretação, não heurística e não
 * frase do agente. Por isso o dicionário vive aqui, em código: é o mesmo
 * predicado que o motor roda, escrito para caber na tela.
 *
 * O que ele NÃO é: guard de fala. Nada aqui lê mensagem, regex ou texto de
 * cliente. A única comparação é contra constantes do PRÓPRIO código (ações,
 * status, janelas de tempo) — comparar com o que nós mesmos configuramos não é
 * o anti-padrão que o CLAUDE.md proíbe.
 *
 * ── A ordem É a regra ───────────────────────────────────────────────────────
 *
 * Os testes vão na ordem das guardas porque é ela que decide a resposta: uma
 * conversa web dentro da janela é "conversa_web", não "parada há mais de 7
 * dias". Trocar a ordem muda o motivo que a tela mostra — e a tela mostra UM
 * motivo, o primeiro que falha.
 *
 * ── Por que o tipo mora aqui, e não em `src/lib/remarketing/` ───────────────
 *
 * O F6 vai criar `src/lib/remarketing/motivo-de-exclusao.ts` com o mesmo enum,
 * para o motor registrar o log estruturado. Enquanto ele não existe, o tipo é
 * definido AQUI (não dá para importar um módulo de worker — BullMQ e Redis —
 * para dentro da rota do admin, que é a mesma razão pela qual
 * `remarketing-queries.ts` mantém a janela de 7 dias por conta própria).
 * Anotado na válvula para o líder unificar no merge.
 */

import type { LucideIcon } from "lucide-react";
import {
	CalendarX,
	CircleSlash,
	Clock,
	FlaskConical,
	Globe,
	Headset,
	PhoneOff,
	PowerOff,
	Users,
	UserX,
} from "lucide-react";
import { ESPERA_SILENCIO_MS } from "@/lib/remarketing/regua";

/**
 * A janela de entrada da régua: 7 dias.
 *
 * É a MESMA constante de `remarketing-cycle.ts` (`JANELA_DE_ENTRADA_MS`,
 * linha 162). Ela fica aqui — e não importada do worker — porque este módulo é
 * lido pela tela (componente cliente): importar o worker arrastaria BullMQ e
 * Redis para o bundle do navegador. `remarketing-queries.ts` importa daqui para
 * não ter uma TERCEIRA cópia. O F6 unifica as duas quando criar
 * `src/lib/remarketing/motivo-de-exclusao.ts`.
 */
export const JANELA_DE_ENTRADA_MS = 7 * 24 * 60 * 60 * 1000;

/** Os motivos, na ordem das guardas de `entrarNaRegua`. */
export const MOTIVOS_FORA_DA_REGUA = [
	"conversa_web",
	"encerrada",
	"com_atendente",
	"teste",
	"sem_contato",
	"sem_telefone",
	"ainda_em_silencio",
	"parada_ha_mais_de_7_dias",
	"telefone_da_equipe",
	"regua_desligada",
] as const;

export type MotivoForaDaRegua = (typeof MOTIVOS_FORA_DA_REGUA)[number];

/**
 * Rótulo pronto para a tela — já com o prefixo "Fora da régua · ".
 *
 * Prefixar aqui (e não em cada coluna) é o que garante que Conversas, Percurso
 * e a ficha digam a MESMA frase. O texto do motivo é a única parte que muda.
 */
export const ROTULO_FORA_DA_REGUA: Record<MotivoForaDaRegua, string> = {
	conversa_web: "Fora da régua · conversa pela web",
	encerrada: "Fora da régua · encerrada",
	com_atendente: "Fora da régua · com atendente",
	teste: "Fora da régua · marcada como teste",
	sem_contato: "Fora da régua · sem contato resolvido",
	sem_telefone: "Fora da régua · sem telefone",
	ainda_em_silencio: "Fora da régua · ainda em silêncio há menos de 90 min",
	parada_ha_mais_de_7_dias: "Fora da régua · parada há mais de 7 dias",
	telefone_da_equipe: "Fora da régua · telefone da equipe",
	regua_desligada: "Fora da régua · régua desligada",
};

/** Ícone por motivo. Estado nunca só por cor: ícone + rótulo sempre juntos. */
export const ICONE_DO_MOTIVO: Record<MotivoForaDaRegua, LucideIcon> = {
	conversa_web: Globe,
	encerrada: CircleSlash,
	com_atendente: Headset,
	teste: FlaskConical,
	sem_contato: UserX,
	sem_telefone: PhoneOff,
	ainda_em_silencio: Clock,
	parada_ha_mais_de_7_dias: CalendarX,
	telefone_da_equipe: Users,
	regua_desligada: PowerOff,
};

export function rotuloDoMotivo(motivo: MotivoForaDaRegua): string {
	return ROTULO_FORA_DA_REGUA[motivo];
}

/**
 * Os fatos da conversa que as guardas leem.
 *
 * `ehDaEquipe` e `temLinhaNaRegua` são resolvidos na BORDA (a checagem de
 * equipe é assíncrona: consulta atendentes e mesa no banco) — a função pura
 * recebe pronto o que não consegue decidir sozinha.
 */
export interface ConversaAvaliavel {
	/** `conversations.channel`. */
	channel: string;
	/** `conversations.status`: `active` · `handed_off` · `closed`. */
	status: string;
	/** `conversations.is_simulated`. */
	isSimulated: boolean;
	/** `conversations.contact_id`. */
	contactId: string | null;
	/** `conversations.last_inbound_at`. */
	lastInboundAt: Date | null;
	/**
	 * Existe telefone alcançável (`wa_id` da conversa ou `contacts.phone`).
	 *
	 * Não é uma guarda de `entrarNaRegua` — é só um fato que a BORDA usa para
	 * marcar "Equipe" e mascarar o número. O motivo `sem_telefone` NÃO olha este
	 * campo (ele é o nome que o produto deu à falta de `last_inbound_at`).
	 */
	temTelefone: boolean;
	/** O telefone é da equipe/atendente — já resolvido na borda. */
	ehDaEquipe: boolean;
	/**
	 * A conversa JÁ tem linha em `remarketing_touches`.
	 *
	 * Quando `true`, ela NÃO está "fora da régua": está na régua, e a tela mostra
	 * o estado dela (passo, próximo toque). A função devolve `null` — o motivo de
	 * exclusão só existe para quem ficou fora.
	 */
	temLinhaNaRegua: boolean;
}

/** Lê um booleano-de-ambiente do jeito do motor: `1`/`true`/`sim` ligam. */
function ligado(valor: string | undefined): boolean {
	const v = (valor ?? "").trim().toLowerCase();
	return v === "1" || v === "true" || v === "sim";
}

/**
 * Por que esta conversa NÃO entra (ou não entrou) na régua.
 *
 * Devolve `null` quando ela está na régua OU quando passaria em TODAS as
 * guardas com a régua ligada — nesse caso a régua a pega no próximo ciclo.
 * Qualquer outro retorno é a PRIMEIRA guarda que falhou, na ordem de
 * `entrarNaRegua`.
 *
 * `agora` entra por parâmetro (nada de `Date.now()` escondido), e as flags vêm
 * de `process.env` — `REMARKETING_ENTRADA_WEB` (F6) libera conversa web, e
 * `REMARKETING_ATIVO` desligada transforma "elegível" em "régua desligada".
 */
export function motivoForaDaRegua(
	conversa: ConversaAvaliavel,
	agora: Date,
	env: Record<string, string | undefined> = process.env,
): MotivoForaDaRegua | null {
	// Já está na régua: não é "fora", é o outro estado da tela.
	if (conversa.temLinhaNaRegua) return null;

	// 1. canal — a régua só toca WhatsApp (enquanto a entrada web não é ligada).
	if (conversa.channel !== "whatsapp" && !ligado(env.REMARKETING_ENTRADA_WEB)) {
		return "conversa_web";
	}

	// 2. status — encerrada ou já com atendente não recebe toque automático.
	if (conversa.status === "closed") return "encerrada";
	if (conversa.status === "handed_off") return "com_atendente";

	// 3. conversa marcada como teste (mesmo campo de "simulado").
	if (conversa.isSimulated) return "teste";

	// 4. contato resolvido — a linha da régua exige `contact_id`.
	if (!conversa.contactId) return "sem_contato";

	// 5. último inbound registrado. Sem ele a régua não tem de onde contar o
	//    silêncio e a conversa nunca entra — é a corrida do `last_inbound_at` que
	//    o F2 conserta. O rótulo do produto para este fato é "sem telefone".
	if (conversa.lastInboundAt === null) return "sem_telefone";

	// 6. silêncio mínimo de 90 min.
	if (conversa.lastInboundAt.getTime() > agora.getTime() - ESPERA_SILENCIO_MS) {
		return "ainda_em_silencio";
	}

	// 7. janela de 7 dias — parada antiga demais não é reaberta retroativamente.
	if (conversa.lastInboundAt.getTime() <= agora.getTime() - JANELA_DE_ENTRADA_MS) {
		return "parada_ha_mais_de_7_dias";
	}

	// 8. telefone da equipe/atendente nunca recebe toque.
	if (conversa.ehDaEquipe) return "telefone_da_equipe";

	// Passou em tudo: entraria no próximo ciclo — a menos que a régua esteja
	// desligada, e aí o que a tela deve dizer é isso, não "elegível".
	if (!ligado(env.REMARKETING_ATIVO)) return "regua_desligada";

	return null;
}
