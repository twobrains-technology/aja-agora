/**
 * O aviso que o SERVIDOR grava quando a mensagem do cliente foi entregue a um
 * atendente humano — a frase que a tela do chat web mostra no lugar do turno.
 *
 * ## O defeito que ela fecha
 *
 * No chat web, depois do card "Ver cartas nesse valor", o cliente escreveu
 * "Uns R$ 250 mil" e a tela respondeu **"Mensagem enviada para Consultor.
 * Aguarde a resposta aqui."** — e não havia Consultor nenhum: o nome era
 * `handedOffUser?.name ?? "Consultor"` (`route.ts`), inventado no lugar de um
 * dono que não existia. Pior que o nome inventado era o beco: "aguarde" seco, sem
 * nenhum próximo passo, contra P0 ("a conversa não morre").
 *
 * ## O que a frase precisa ter
 *
 * - **Nome real** de quem assumiu (`quemRespondePara`, dono do atendimento). Sem
 *   nome, o lugar do nome fica vazio — nunca um vocativo inventado;
 * - **Próximo passo**: o cliente pode seguir escrevendo por aqui e a mensagem
 *   chega a quem atende. Dar a direção é o que impede o silêncio de virar
 *   abandono;
 * - **Nada de prazo**: não existe expediente cadastrado no código, e prometer
 *   horário é inventar dado;
 * - **`PREFIXO_AVISO_ENCAMINHAMENTO` no começo** — é o contrato com `ehFalaDaMesa`
 *   (`@/lib/mesa/acolhida-n1`), que precisa reconhecer este aviso como fala do
 *   SERVIDOR e não como resposta do atendente.
 *
 * O texto começa literalmente no prefixo: nada de markdown antes dele, senão o
 * `startsWith` do `ehFalaDaMesa` deixa de casar.
 */

import { PREFIXO_AVISO_ENCAMINHAMENTO } from "@/lib/mesa/acolhida-n1";

/** Para onde o aviso aponta quando não há nome — e só nesse caso. */
const DESTINO_SEM_NOME = "o nosso atendimento";

/** O convite que sustenta P0: a conversa tem continuação, com ou sem resposta imediata. */
const PROXIMO_PASSO =
	"Pode continuar escrevendo por aqui — cada mensagem sua também chega pra quem está te atendendo.";

/**
 * O placeholder que este aviso NUNCA pode carregar.
 *
 * Era `?? "Consultor"` na rota: quando não havia dono, o servidor inventava um
 * nome. A guarda é aqui, e não só no chamador, porque o contrato com o cliente é
 * "nome de gente ou nenhum nome" — quem passar o placeholder recebe a frase sem
 * nome em vez de uma mentira.
 */
const NOME_PROIBIDO = /consultor/i;

/**
 * A frase do aviso, a partir do nome REAL de quem assumiu.
 *
 * `null`/`undefined`/vazio é entrada legítima (atendimento sem dono nomeado):
 * a frase muda o destinatário e mantém o próximo passo.
 */
export function avisoDeEncaminhamento(nome: string | null | undefined): string {
	const limpo = (nome ?? "").trim();
	const quem = limpo.length > 0 && !NOME_PROIBIDO.test(limpo) ? limpo : DESTINO_SEM_NOME;
	return `${PREFIXO_AVISO_ENCAMINHAMENTO} ${quem}. ${PROXIMO_PASSO}`;
}
