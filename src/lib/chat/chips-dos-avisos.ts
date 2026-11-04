// OS AVISOS DO SERVIDOR TAMBÉM PEDEM UM TOQUE.
//
// Medido no banco do dev (conversas simuladas desde 17:14 de 27/10/2026): **558** turnos do agente
// terminaram com pergunta, **456** (81,7 %) saíram com opção de um toque e **102** saíram sem
// nenhum. As duas maiores famílias restantes não eram fala do modelo: eram avisos escritos em
// `src/app/api/chat/route.ts` por `writeAndSaveText`, que grava só TEXTO e por isso nunca passou
// pelo `garantirChip`/`soltarTrecho` do loop livre — 9× "Tive um problema ao gerar sua proposta…" e
// 7× "Não encontrei seus dados aqui…". Requisito do dono (27/10, 13:35): todo turno que espera
// resposta traz opção de um toque.
//
// ## Por que há DUAS camadas: a tabela dos avisos conhecidos e o fallback derivado
//
// Isto não é fala do modelo: são textos FIXOS do servidor. Os dois avisos medidos têm tabela
// própria, por trecho literal (prioridade) — neles a saída certa é decisão de produto, não derivada.
//
// O defeito que sobreviveu à primeira correção (auditoria do sha `e2461a52`, R21 de 28/10
// 01:58:27Z): só DOIS avisos passaram por `writeAndSaveTextComAviso`, e os outros cinco continuaram
// saindo por `writeAndSaveText` — texto puro, sem card, sem chip, cliente sem botão. Um deles
// perguntou *"Antes de eu confirmar seu plano, deixa eu te mostrar o formulário rapidinho — me diz
// que quer seguir?"* e o cliente não tinha o que tocar.
//
// Por isso aviso que NÃO está na tabela não fica sem toque: se ele PERGUNTA ou PEDE UM DADO
// (`balaoPedeResposta`), as opções são derivadas com `sugestaoDoTurno` — a mesma função pura que o
// caminho do agente usa. Aviso neutro ("recebi", "já registrei", confirmação) continua `null`:
// botão em aviso que não espera resposta é ruído.
//
// ## Por que `label` é a opção inteira
//
// O atalho da web manda o `label` como mensagem do cliente
// (`components/chat/artifacts/quick-reply.tsx`, `sendUserMessage(opt.label)`), e o do WhatsApp
// devolve o título do botão como mensagem também. Não existe campo `reply` no `QuickReplyPayload`
// (`types.ts`): o `label` é o que a tela mostra E o que o clique envia — então ele é escrito na voz
// do cliente, pronto para ser a mensagem dele. Nenhuma opção recusa o dado que salva o lead (P6).

import { balaoPedeResposta, sugestaoDoTurno } from "@/lib/agent/pi/sugestoes";

/** Uma opção do atalho: o rótulo do botão é a própria mensagem do cliente. */
export type OpcaoDeAviso = { label: string };

/** `route.ts:1531` — a proposta não saiu (offer-confirm falhou). */
const AVISO_DE_PROPOSTA_QUE_FALHOU =
	/problema ao gerar sua proposta|pode tentar confirmar de novo/i;

/** `route.ts:1312` — o formulário de contrato veio sem CPF/celular. */
const AVISO_DE_DADOS_FALTANDO = /preenche o cpf e o celular/i;

/** As duas coisas que o cliente pode fazer quando a proposta falhou: refazer, ou voltar ao que ele
 * estava decidindo (o lance) antes de fechar. */
const OPCOES_DO_AVISO_DE_PROPOSTA: OpcaoDeAviso[] = [
	{ label: "Tentar de novo" },
	{ label: "Antes quero falar do lance" },
];

/** Sem CPF/celular não há proposta pela web — as duas saídas são preencher agora ou continuar pelo
 * WhatsApp, que é o contato que salva o lead de qualquer jeito (P6). */
const OPCOES_DO_AVISO_DE_DADOS: OpcaoDeAviso[] = [
	{ label: "Vou preencher agora" },
	{ label: "Prefiro seguir pelo WhatsApp" },
];

/** As opções de um toque para um aviso do servidor — `null` quando o aviso não espera resposta.
 *
 * 1. Os dois avisos conhecidos têm a saída DELES (produto), por trecho literal.
 * 2. Qualquer outro: se pergunta ou pede dado, o toque sai do `sugestaoDoTurno` — 2+ opções na voz
 *    do cliente. Texto neutro não inventa botão.
 */
export function chipsDoAviso(texto: string): OpcaoDeAviso[] | null {
	if (AVISO_DE_DADOS_FALTANDO.test(texto)) return OPCOES_DO_AVISO_DE_DADOS.map((o) => ({ ...o }));
	if (AVISO_DE_PROPOSTA_QUE_FALHOU.test(texto))
		return OPCOES_DO_AVISO_DE_PROPOSTA.map((o) => ({ ...o }));

	// Fallback: o aviso que pergunta ("… me diz que quer seguir?") ou pede um dado
	// ("… me manda o celular") recebe o atalho do MESMO módulo que serve o turno do agente.
	if (!balaoPedeResposta(texto)) return null;
	const opcoes = sugestaoDoTurno(texto).opcoes;
	return opcoes.length > 0 ? opcoes.map((label) => ({ label })) : null;
}
