// RITMO DE CONVERSA — as pausas entre os blocos de um mesmo turno.
//
// Visto ao vivo (Kairo, 2026-07-30): o turno do reveal despejava tudo de uma vez
// — fala, carrossel, segunda fala, card, chips — e o cliente recebia um bloco
// embaralhado, sem tempo de ler nada. Vendedor não fala assim: ele diz o que
// achou, DEIXA a pessoa olhar, e só então continua.
//
// A pausa vive no SERVIDOR, entre os eventos, de propósito: assim ela vale nos
// dois canais (no WhatsApp o adapter manda mensagens de verdade, e lá o
// atropelo é ainda pior) e não depende de a UI escalonar nada.
//
// Não é enfeite nem "regra-no-prompt": é a estrutura do turno, que é do código.
// As PALAVRAS continuam todas do modelo.

/** Quanto cada respiro dura, em ms. Números pequenos de propósito: o objetivo é
 * dar tempo de LER o bloco anterior, não simular digitação. */
export const RITMO = {
	/** Entre o fim de uma fala e o card que a ilustra. */
	falaParaCard: 900,
	/** Entre dois cards seguidos (carrossel → destaque). */
	cardParaCard: 700,
	/** Entre o card e a fala seguinte — o maior deles: é aqui que o cliente
	 * de fato olha as opções. */
	cardParaFala: 1400,
	/** Antes dos chips de resposta do gate. Curto: eles pertencem à pergunta que
	 * acabou de sair, e separá-los demais é o que fazia parecer órfão. */
	antesDosChips: 600,
} as const;

/** Desligado em teste (a suíte não pode ficar dormindo) e sob
 * `AGENT_RITMO_MS=0`, que é a válvula pra desligar em produção sem deploy de
 * código caso o ritmo atrapalhe algum canal. */
function ritmoLigado(): boolean {
	if (process.env.AGENT_RITMO_MS === "0") return false;
	if (process.env.VITEST) return false;
	return process.env.NODE_ENV !== "test";
}

export async function pausaDeConversa(ms: number): Promise<void> {
	if (!ritmoLigado() || ms <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, ms));
}
