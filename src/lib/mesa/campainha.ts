/**
 * A CAMPAINHA do handoff — a chamada tocou, e alguém ouviu?
 *
 * ## Por que isto existe antes da acolhida
 *
 * O cliente `75f77efd` ficou 28,9 horas sem resposta depois de fechar a proposta
 * numa sexta à noite. A leitura fácil é "a mesa não olhou". A leitura provada é
 * outra: a notificação saiu 19:02:04, foi `delivered` só às 19:44:39 (42 min) e
 * `read` às 12:26:22 do dia seguinte — 17h24 depois. E o painel estava com ZERO
 * listeners conectados no instante do handoff.
 *
 * Os webhooks `sent`/`delivered`/`read` da Meta já chegavam, e viravam
 * `console.log`. Sem nada gravado, "a campainha tocou?" não tinha resposta
 * consultável — e o time acaba consertando o CLIENTE (mandar uma acolhida) em
 * vez de consertar a CHAMADA. A acolhida N1 (`acolhida-n1.ts`) é o cobertor;
 * isto aqui é a campainha.
 *
 * Puro e sem I/O de propósito: os testes exercitam os números reais do incidente.
 */

export type NotificacaoDeHandoff = {
	sentAt: Date;
	deliveredAt: Date | null;
	readAt: Date | null;
	failedAt: Date | null;
	failureReason?: string | null;
	/** Listeners do bus do painel no instante do handoff. `null` quando não medido. */
	listenersNoHandoff: number | null;
};

/**
 * Acima disto, uma notificação ainda não entregue é problema — não latência.
 *
 * Cinco minutos é generoso para a Meta: entrega normal é de segundos, e as
 * entregas saudáveis medidas ficaram em dezenas de segundos. O caso real levou
 * 42 minutos, que é ordem de grandeza de "o celular do atendente estava
 * desligado", não de rede.
 */
export const LIMITE_ENTREGA_MIN = 5;

const minutosEntre = (de: Date, ate: Date): number =>
	Math.round((ate.getTime() - de.getTime()) / 60_000);

export type DiagnosticoDaCampainha = {
	/** Minutos entre o envio e a entrega. `null` = nunca entregue. */
	minutosAteEntregar: number | null;
	/** Minutos entre o envio e a leitura pelo atendente. `null` = nunca lida. */
	minutosAteLer: number | null;
	/** A Meta recusou, ou o limite venceu sem entrega. */
	naoEntregue: boolean;
	/** Entregue, mas fora do que se espera de uma notificação. */
	entregaLenta: boolean;
	/** Ninguém estava com o painel aberto quando o cliente chegou. */
	semPainelAberto: boolean;
};

export function diagnosticoDaCampainha(
	n: NotificacaoDeHandoff,
	agora: Date,
): DiagnosticoDaCampainha {
	const minutosAteEntregar = n.deliveredAt ? minutosEntre(n.sentAt, n.deliveredAt) : null;
	const minutosAteLer = n.readAt ? minutosEntre(n.sentAt, n.readAt) : null;

	// Falha declarada pela Meta não espera limite nenhum: já se sabe que não
	// chegou. Sem falha, só conta como "não entregue" depois do limite — antes
	// disso a mensagem pode estar legitimamente a caminho, e alarme prematuro
	// treina todo mundo a ignorar o alarme.
	const naoEntregue =
		n.deliveredAt === null &&
		(n.failedAt !== null || minutosEntre(n.sentAt, agora) > LIMITE_ENTREGA_MIN);

	return {
		minutosAteEntregar,
		minutosAteLer,
		naoEntregue,
		entregaLenta: minutosAteEntregar !== null && minutosAteEntregar > LIMITE_ENTREGA_MIN,
		semPainelAberto: n.listenersNoHandoff === 0,
	};
}

export type ScoreDaCampainha = {
	name: string;
	value: number;
	dataType: "NUMERIC" | "BOOLEAN";
	comment?: string;
};

/**
 * Os sinais que não existiam.
 *
 * Medida sempre que houver o dado; alarme só quando há o que alarmar. Emitir
 * booleano zero em todo handoff saudável encheria o painel de ruído e esconderia
 * o caso raro — que é justamente o que se quer enxergar.
 */
export function scoresDaCampainha(n: NotificacaoDeHandoff, agora: Date): ScoreDaCampainha[] {
	const d = diagnosticoDaCampainha(n, agora);
	const scores: ScoreDaCampainha[] = [];

	if (d.minutosAteEntregar !== null) {
		scores.push({
			name: "handoff_notificacao_entregue_min",
			value: d.minutosAteEntregar,
			dataType: "NUMERIC",
		});
	}
	if (d.minutosAteLer !== null) {
		scores.push({
			name: "handoff_notificacao_lida_min",
			value: d.minutosAteLer,
			dataType: "NUMERIC",
			comment: "Minutos entre chamar o atendente e ele abrir a mensagem.",
		});
	}
	if (d.naoEntregue) {
		scores.push({
			name: "handoff_notificacao_nao_entregue",
			value: 1,
			dataType: "BOOLEAN",
			comment:
				n.failureReason ??
				`Sem confirmação de entrega ${LIMITE_ENTREGA_MIN} min depois do envio — o atendente pode nunca ter sido chamado.`,
		});
	}
	if (d.semPainelAberto) {
		scores.push({
			name: "handoff_painel_sem_listener",
			value: 1,
			dataType: "BOOLEAN",
			comment: "Nenhum atendente com o painel aberto no instante do handoff.",
		});
	}
	return scores;
}
