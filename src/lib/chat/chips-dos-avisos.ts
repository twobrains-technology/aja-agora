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
// ## Por que a regra é por CONTEÚDO, e não regex de pergunta
//
// Isto não é fala do modelo: são dois textos FIXOS do servidor. Quem decide se o aviso ganha atalho
// é qual aviso é — daí a comparação por trecho literal, sem detecção de intenção.
//
// ## Por que `label` é a opção inteira
//
// O atalho da web manda o `label` como mensagem do cliente
// (`components/chat/artifacts/quick-reply.tsx`, `sendUserMessage(opt.label)`), e o do WhatsApp
// devolve o título do botão como mensagem também. Não existe campo `reply` no `QuickReplyPayload`
// (`types.ts`): o `label` é o que a tela mostra E o que o clique envia — então ele é escrito na voz
// do cliente, pronto para ser a mensagem dele. Nenhuma opção recusa o dado que salva o lead (P6).

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

/** As opções de um toque para um aviso do servidor — `null` quando o texto não é um deles. */
export function chipsDoAviso(texto: string): OpcaoDeAviso[] | null {
	if (AVISO_DE_DADOS_FALTANDO.test(texto)) return OPCOES_DO_AVISO_DE_DADOS.map((o) => ({ ...o }));
	if (AVISO_DE_PROPOSTA_QUE_FALHOU.test(texto))
		return OPCOES_DO_AVISO_DE_PROPOSTA.map((o) => ({ ...o }));
	return null;
}
