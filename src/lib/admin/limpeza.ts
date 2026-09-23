/**
 * A LIMPEZA DA BASE — quem não é cliente real, e por qual sinal objetivo.
 *
 * O dono foi literal em 22/09/2026: *"Primeira coisa que eu vou fazer é limpar
 * todo mundo que não deveria estar ali. Deletar teste meu, seu, do Gustavo…
 * Vamos deixar só gente real"*. E na mesma call, sobre lead de web sem contato:
 * *"esses aí também eles já não entram nessa seara nossa aqui de recontactar"*.
 *
 * **O que este módulo NÃO faz: adivinhar.** "Cliente oculto" (decisão do dono,
 * 22/09) são conhecidos da Bruna que caíram na mesa — pessoas reais que não são
 * clientes. Nenhuma consulta descobre isso: não há campo, não há padrão de
 * telefone, não há heurística honesta. O que dá para fazer é listar os SINAIS
 * objetivos e deixar a decisão com quem conhece a lista. Por isso aqui existe
 * `motivoDeLimpeza` — o rótulo do sinal — e não um "é oculto" calculado.
 *
 * **E o que também não faz: apagar.** Não existe delete de conversa real no
 * sistema (o único DELETE de `conversations` é o do simulador, guardado por
 * `isSimulated = true`). O tratamento aqui é marcar como teste, que é
 * REVERSÍVEL e segura a linha da régua. Apagar levaria junto `messages`,
 * `artifacts` e `remarketing_touches` — se um dia for pedido, é item próprio,
 * com o desenho de consequência na mão.
 */

/**
 * O SINAL que põe a conversa na lista de candidatos.
 *
 * A ordem de precedência importa: uma conversa pode ter mais de um sinal, e o
 * relatório precisa de UM motivo por linha para ser acionável. `teste` vem
 * primeiro porque é o mais forte (já é decisão tomada); `telefone_da_equipe`
 * depois, que é quase-certeza (é o número de quem atende); `sem_contato` em
 * seguida, que é "chegou à mesa e não dá para recontactar"; e `mesa_sem_origem`
 * por último, porque "sem campanha" é indício, não prova — cliente que chegou
 * por indicação ou busca também não tem campanha.
 */
export type MotivoDeLimpeza = "teste" | "telefone_da_equipe" | "sem_contato" | "mesa_sem_origem";

export const ROTULO_DO_MOTIVO_DE_LIMPEZA: Record<MotivoDeLimpeza, string> = {
	teste: "já marcada como teste",
	telefone_da_equipe: "telefone da equipe",
	sem_contato: "na mesa e sem contato",
	mesa_sem_origem: "na mesa sem origem de campanha",
};

/** Em que ordem os sinais são avaliados — o primeiro que casa é o motivo. */
export const ORDEM_DOS_MOTIVOS_DE_LIMPEZA: readonly MotivoDeLimpeza[] = [
	"teste",
	"telefone_da_equipe",
	"sem_contato",
	"mesa_sem_origem",
];

/** Os fatos que decidem o sinal — todos já lidos da conversa/lead. */
export interface FatosParaLimpeza {
	/** `conversations.is_simulated` — já está fora do funil. */
	jaMarcadaComoTeste: boolean;
	/** Telefone normalizado (o do lead ou o do `waId`) bate na lista da equipe. */
	telefoneDaEquipe: boolean;
	/** Chegou à mesa (handoff) e não há contato para recontactar. */
	naMesaSemContato: boolean;
	/** Chegou à mesa (handoff) e a conversa NÃO tem campanha que a explique. */
	naMesaSemOrigemDeCampanha: boolean;
}

/**
 * O sinal, ou `null` quando não há sinal nenhum — conversa de cliente normal.
 *
 * `null` não é "aprovada": é "não achei motivo objetivo para você olhar". Quem
 * decide marcar é o dono, na lista.
 */
export function motivoDeLimpeza(fatos: FatosParaLimpeza): MotivoDeLimpeza | null {
	if (fatos.jaMarcadaComoTeste) return "teste";
	if (fatos.telefoneDaEquipe) return "telefone_da_equipe";
	if (fatos.naMesaSemContato) return "sem_contato";
	if (fatos.naMesaSemOrigemDeCampanha) return "mesa_sem_origem";
	return null;
}
