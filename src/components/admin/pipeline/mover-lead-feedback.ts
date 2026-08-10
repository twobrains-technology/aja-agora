import { rotuloDoEstagio } from "@/lib/admin/lead-stages";

/** Corpo que `PATCH /api/admin/leads/[id]/stage` devolve quando recusa o movimento. */
type FalhaAoMover = {
	error?: string;
	reason?: string;
	/** Raia em que o lead REALMENTE está (o servidor a devolve no 409 de regressão). */
	current?: string;
} | null;

/**
 * Traduz a recusa do servidor na frase que o operador precisa ler.
 *
 * O ponto: `status` aqui não é detalhe técnico, é a diferença entre "o sistema
 * falhou, insista" e "a regra não permite, pare". O board tratava os dois como
 * o mesmo alerta genérico, e no caso mais comum — arrastar um card pra trás —
 * a orientação estava simplesmente errada.
 *
 * `null` em `status` = a requisição nem chegou ao servidor (rede caiu). É o
 * ÚNICO caso em que repetir o gesto tem chance de dar certo.
 */
export function mensagemDeFalhaAoMover(status: number | null, body: FalhaAoMover): string {
	if (status === null) {
		return "Sem conexão com o servidor. O card voltou pro lugar — tente novamente.";
	}

	switch (status) {
		case 409: {
			// Forward-only (FIX-44): o funil não regride sem flag explícita, pra um
			// arrasto acidental não desfazer progresso de venda.
			const onde = body?.current ? ` Ele continua em "${rotuloDoEstagio(body.current)}".` : "";
			return `O funil não anda pra trás: esse card não pode voltar pra uma etapa anterior.${onde}`;
		}
		case 401:
			return "Sua sessão expirou. Entre de novo pra continuar movendo os cards.";
		case 403:
			return "Você não tem permissão pra mover esse card.";
		case 404:
			return "Esse lead não foi encontrado — talvez tenha sido removido. Atualize a página.";
		case 400:
			return "O servidor recusou esse movimento: a etapa de destino não é válida.";
		default:
			return "O servidor não conseguiu mover o card. O card voltou pro lugar.";
	}
}
