// O intervalo em que a contratação foi oferecida e AINDA NÃO aconteceu.
//
// Entre o formulário de contratação sair e o contrato fechar, não existe
// proposta nenhuma na administradora. O modelo precisa desse fato na janela,
// senão o vazio é preenchido com a versão otimista — que numa venda é a pior
// mentira possível.
//
// Na web isso já existia (`blocoFormularioAberto`, em `converse.ts`), com a
// condição presa a `channel === "web"`. No WhatsApp o bloco nunca armava, e
// nesse intervalo o modelo ficava sem nenhum fato negativo: em `fd76e393`
// (prod, 16/08/2026 19:24:10) ele respondeu "Pronto, Kairo! Sua proposta está
// fechada com a cota do Banco do Brasil, R$ 1.031.904 de crédito" com
// `bevi_proposals = 0`.
//
// Isto NÃO é um filtro de fala. A mesma frase é legítima quando `contractClosed`
// for true — e aí o bloco se desarma sozinho. O que se corrige é o que o modelo
// SABE, não o que ele pode dizer.
//
// Os dois textos diferem porque os canais diferem: na web o que falta é o
// cliente confirmar os dados na tela; no WhatsApp não há tela, e nomear
// formulário, botão ou campo mandaria o cliente procurar algo que não existe.

import type { Channel } from "@/lib/conversation/messages";

export function blocoDeFechoPendente(args: {
	channel: Channel;
	contractFormDispatched: boolean | undefined;
	contractClosed: boolean | undefined;
}): string | null {
	if (args.contractFormDispatched !== true) return null;
	if (args.contractClosed === true) return null;

	if (args.channel === "web") {
		return (
			`A contratação está aberta AGUARDANDO A CONFIRMAÇÃO DELE — ela ainda NÃO aconteceu. É ` +
			`PROIBIDO dizer que os dados "já estão confirmados", que o cadastro "seguiu" ou que o ` +
			`próximo passo "vai aparecer": nada avança sem ele confirmar. Se ele disser que confirma, ` +
			`peça com naturalidade que conclua a confirmação dos dados pra você seguir — sem nomear ` +
			`botão, campo ou card, e sem dizer que já está feito.`
		);
	}

	return (
		`A contratação está AGUARDANDO A CONFIRMAÇÃO DELE — ela ainda NÃO aconteceu, e neste ` +
		`momento NÃO existe nenhuma proposta criada na administradora. É PROIBIDO dizer que a ` +
		`proposta está fechada, que a cota está reservada ou garantida, ou que a administradora ` +
		`vai entrar em contato: nada disso existe até ele confirmar. O que falta é a confirmação ` +
		`dele — conduza a conversa até esse sim, com naturalidade, e não dê nada por concluído.`
	);
}
