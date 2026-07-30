// Derivação canônica do input do `startContract` (passo 5 "Contratar"). Módulo
// ÚNICO consumido pelo web (route.ts) e pelo WhatsApp (contract-capture.ts): a
// mesma proposta real sai dos dois canais com segmento/valor/objetivo/lance
// idênticos — sem drift entre canais (FIX-25 / MC-5).
//
// LGPD: o `cpf`/`celular` chegam SÓ aqui em memória (resolvidos via loadIdentity,
// decifrados). Esta função não loga, não persiste — só monta o objeto pro gateway.

import { categoryToBeviSegment } from "@/lib/adapters/bevi/offer-mapper";
import { MAX_CREDIT_DEVIATION } from "@/lib/adapters/bevi/partner-offer-mapper";
import { normalizeAdministradora } from "@/lib/agent/orchestrator/choose-offer";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { StartContractInput } from "./fulfillment";

/** Identidade + consentimento resolvidos pelo caller (web ou WhatsApp). */
export interface ContractIdentityInput {
	cpf: string;
	celular: string;
	lgpd: boolean;
}

/** Vínculos de funil resolvidos pelo caller (web ou WhatsApp). FIX-48: o `leadId`
 * é resolvido no momento do fechamento e PRECISA chegar à proposta — sem ele a
 * raia trava em `qualificado` (createBeviProposal pula a transição). */
export interface ContractLinkInput {
	leadId?: string | null;
	/** Administradora da proposta JÁ REGISTRADA nesta conversa, quando existe.
	 *
	 * FIX-415 — é o que torna um retry seguro. Sem cota ancorada por clique, a
	 * preferência iria `null` e o gateway escolheria por proximidade de valor
	 * (`pickClosestOffer` → `best(offers)`): num retry legítimo, isso podia
	 * produzir uma SEGUNDA proposta real numa administradora diferente da
	 * primeira. Com este campo, qualquer nova tentativa numa conversa que já tem
	 * proposta vai para a MESMA administradora, por construção — e o guard
	 * anti-refazer (`administradoraConflictsWithRegisteredProposal`) enxerga
	 * igual contra igual, em vez de desconhecido. */
	registeredAdministradora?: string | null;
}

/** Re-ancora o estado na cota REAL que a administradora devolveu no fechamento.
 *
 * Até aqui o `recommendedOffer` continuava sendo a cota SIMULADA mesmo depois do
 * contrato criado — e a carta real volta com outro grupo, outra parcela, outro
 * prazo e outro lance médio. O agente seguia conversando com os números velhos:
 * dizia "ainda falta R$ 106.013 pro lance médio" quando, na cota efetivamente
 * contratada, faltavam ~R$ 23.000. Depois do fecho, a cota real é a única
 * verdade — o card já mostra a divergência, o estado também tem que virar.
 *
 * Substituição total (nunca merge): campo que a cota real não trouxe não pode
 * sobreviver da simulada. `category` fica porque é do cliente, não da cota. */
export function ancorarOfertaReal(
	meta: ConversationMetadata,
	offer: {
		administradora?: string | null;
		grupo?: string | null;
		creditValue?: number;
		monthlyPayment?: number;
		termMonths?: number;
		avgBidValue?: number;
	},
): Pick<ConversationMetadata, "recommendedOffer" | "recommendedAdministradora"> {
	const num = (v: unknown): number | undefined =>
		typeof v === "number" && Number.isFinite(v) ? v : undefined;
	return {
		recommendedAdministradora: offer.administradora ?? meta.recommendedAdministradora,
		recommendedOffer: {
			...(meta.currentCategory ? { category: meta.currentCategory } : {}),
			...(offer.grupo ? { groupId: offer.grupo } : {}),
			administradora: offer.administradora ?? undefined,
			creditValue: num(offer.creditValue) as number,
			monthlyPayment: num(offer.monthlyPayment) as number,
			termMonths: num(offer.termMonths) as number,
			avgBidValue: num(offer.avgBidValue),
		},
	};
}

/** Monta o input do `startContract` a partir do estado da conversa + identidade.
 * Os defaults (valor 50000, objetivo rápido, lance "nenhum") espelham o web. */
export function buildStartContractInput(
	meta: ConversationMetadata,
	identity: ContractIdentityInput,
	links: ContractLinkInput = {},
): StartContractInput {
	const q = meta.qualifyAnswers ?? {};
	const segmento = categoryToBeviSegment(meta.currentCategory ?? null);
	// FIX-251 vivia aqui: um guard de "defesa em profundidade" que detectava
	// `recommendedOffer.administradora` divergindo de `recommendedAdministradora`
	// e, nesse caso, recusava o `creditValue` do snapshot por ser de uma oferta
	// abandonada.
	//
	// FIX-414 o tornou desnecessário, e a razão é boa: o contrato deixou de ler os
	// dois campos. Ele lê `contractOffer`, que é UMA cota inteira ancorada de uma
	// vez por ação estruturada — administradora, crédito e prazo viajam juntos, do
	// mesmo grupo, e não há como divergirem. O guard protegia contra uma
	// inconsistência que só existia porque a marca vinha de um campo e o número de
	// outro.
	//
	// FIX-417 — `valor` é DICA DE MATCHING; `administradoraPreferida` é VÍNCULO.
	// Só o vínculo precisa da parede, e confundir os dois foi o erro do FIX-414.
	//
	// Ao mandar `valor` cair direto no `creditMax` sem cota ancorada, eu reabri o
	// FIX-73 palavra por palavra: o cliente vê uma carta de 171.000, o teto que ele
	// falou é 180.000, a Bevi recebe 180.000 e devolve uma cota NOVA — diferente da
	// que o card anunciou. Bait-and-switch, o defeito que aquele fix nomeou na
	// jornada AUTO de 2026-07-02. A 12ª revisão independente mediu e apontou.
	//
	// A carta EXIBIDA é o único número que o cliente de fato viu, e usá-la como
	// dica de matching não o compromete com administradora nenhuma — a marca
	// continua vindo só de ação estruturada (abaixo). `creditMax` fica como
	// fallback defensivo, pra quando não houve reveal (caso já barrado a montante).
	//
	// ⚠️ E o guard do FIX-251 VOLTA aqui, porque ele protegia algo real e eu o
	// apaguei rápido demais no FIX-414: quando a marca do `recommendedOffer`
	// diverge da que a conversa confirmou, aquela carta é de uma oferta ABANDONADA
	// (o caso do what-if rejeitado — ITAÚ 161.258 sobrevivendo depois de o cliente
	// reconfirmar RODOBENS 90.000). Usá-la como dica de matching mandaria a Bevi
	// procurar perto de um número que o cliente dispensou.
	//
	// Ele é desnecessário para a MARCA (que hoje vem de uma cota inteira, ancorada
	// de uma vez) e continua necessário para o VALOR — que é justamente a
	// distinção que eu não tinha feito.
	const ofertaConsistente =
		!meta.recommendedOffer?.administradora ||
		!meta.recommendedAdministradora ||
		normalizeAdministradora(meta.recommendedOffer.administradora) ===
			normalizeAdministradora(meta.recommendedAdministradora);
	// FIX-418 — a carta exibida é DICA, o teto declarado é LIMITE.
	//
	// A 13ª revisão independente mediu o pior caso do FIX-417 e mostrou que ele era
	// PIOR que a versão anterior: com um what-if de 300.000 que o cliente RECUSOU
	// parado em `recommendedOffer`, e teto declarado de 180.000, o input saía com
	// 300.000 — 66% acima do que ele pediu, e o próprio payload carregava o 180.000
	// em `originalRequestedCreditValue`. O sistema sabia e mandava assim.
	//
	// Minha premissa era que "a carta exibida" sempre respeita "o que o cliente
	// pediu". Não respeita: `recommendedOffer` não tem teto, e um what-if recusado
	// deixa lá uma carta que ele nunca quis. Erro LIMITADO pelo teto que ele
	// declarou é ruim; erro ILIMITADO é outra categoria — no fim disso há CPF e
	// consulta de bureau.
	//
	// A cota ANCORADA por clique é a única exceção, e é deliberada: se ele tocou o
	// card, aquele número é a decisão mais recente e vale mesmo acima do teto
	// antigo. Limitar ali seria ignorar a ação estruturada que a parede inteira
	// existe pra privilegiar.
	// FIX-419 — o cap ganha TOLERÂNCIA. Cap duro era pior que não ter cap.
	//
	// A 14ª revisão independente mediu a distribuição real e ela derruba a premissa
	// do FIX-418: de 67 cartas exibidas, 54 (80,6%) estão ACIMA do teto declarado —
	// e 83% desse excesso cabe em 0-10%. Isso NÃO é resíduo de what-if, é como
	// consórcio funciona: o cliente diz "uns 90 mil" e o grupo real da administradora
	// é 92.902. O cap duro estragava 53 cartas legítimas pra pegar 1 resíduo, e o
	// efeito medido foi mandar 120.000 à Bevi para quem tinha clicado num card de
	// 150.000 — o mesmo bait-and-switch do FIX-73, agora pra baixo.
	//
	// Eu tinha testado a regra contra UM fixture e aplicado a uma população que não
	// olhei. A tolerância certa já existe no repo (`MAX_CREDIT_DEVIATION`, a mesma
	// que decide se uma oferta serve): preserva as cartas reais e ainda barra o caso
	// que motivou o cap (300.000 sobre teto de 180.000 = +66%).
	const tetoDeclarado = q.creditMax ?? q.creditMin;
	const tetoComFolga =
		tetoDeclarado === undefined ? undefined : tetoDeclarado * (1 + MAX_CREDIT_DEVIATION);
	const cartaExibida = ofertaConsistente ? meta.recommendedOffer?.creditValue : undefined;
	const dicaDentroDoTeto =
		cartaExibida !== undefined && (tetoComFolga === undefined || cartaExibida <= tetoComFolga)
			? cartaExibida
			: undefined;
	const valor = meta.contractOffer?.creditValue ?? dicaDentroDoTeto ?? tetoDeclarado ?? 50000;
	// FIX-281 (r9 onda 2, gap G-A): âncora do aviso de divergência CDC no
	// `real_offer` — o pedido ORIGINAL do cliente, MESMA precedência do hero
	// (runner.ts:656-665, FIX-261). Campo NOVO e independente de `valor` acima
	// (que segue servindo só o matching da oferta, FIX-73): `valor` é o
	// creditValue da ÚLTIMA oferta vista, nunca o que o cliente pediu de fato.
	// O aviso "você pediu X, a carta real ficou Y" tem que citar o que o CLIENTE
	// disse. `creditMax` deixa de servir aqui quando ele aceita lance embutido: o
	// alvo passa a ser o valor RECALCULADO (bem ÷ (1 − pct)) e o cliente lia
	// "você pediu uma carta de ~R$ 428.571" sem nunca ter dito esse número — a
	// conta interna do embutido apresentada como fala dele. `valorDoBemAlvo`
	// guarda o preço do bem, que é o que ele efetivamente pediu.
	const originalRequestedCreditValue =
		q.creditClampedFrom ?? q.valorDoBemAlvo ?? q.creditMentionedAtDesire ?? q.creditMax;
	const objetivo = q.objetivo ?? "contemplacao_rapida";
	const lanceEmbutido = q.lanceEmbutido ? String(q.lanceEmbutidoPercent ?? 30) : "nenhum";
	return {
		cpf: identity.cpf,
		celular: identity.celular,
		lgpd: identity.lgpd,
		segmento,
		valor,
		originalRequestedCreditValue,
		objetivo,
		lanceEmbutido,
		// ── FIX-414: A PAREDE, NO LUGAR ONDE O DINHEIRO PASSA ──
		//
		// Este campo lia `recommendedAdministradora` — escrita por resolução de
		// TEXTO. Onze revisões independentes acharam a mesma classe de defeito, e a
		// 11ª mostrou por que o FIX-413 não a fechou: eu levantei a parede no
		// `emit-card.ts`, que decide o RÓTULO do formulário, e não aqui, que decide
		// o que a Bevi RECEBE. Medido: "a Rodobens é muito cara, quero fechar" saía
		// com o formulário mudo e `administradoraPreferida: "RODOBENS"`.
		//
		// Pior: antes do FIX-413 o formulário ao menos EXIBIA a marca e o cliente
		// podia ver o erro. Ausente-na-tela + presente-no-request é pior que
		// errado-na-tela — a correção tinha reduzido a observabilidade do defeito.
		//
		// Agora só a cota ancorada por AÇÃO ESTRUTURADA (clique de card nos dois
		// canais, ou tool `escolher_cota` com groupId conferido) chega ao contrato.
		// Sem ela, `null`: a Bevi não recebe preferência nenhuma, em vez de receber
		// o palpite do parser. Ausente é melhor que errado — a mesma regra que o
		// `avgBidValue` já segue (FIX-375).
		// FIX-415 — sem cota ancorada, cai pra administradora da proposta JÁ
		// registrada (quando existe). Nunca pro campo que o texto escreve: o retry
		// tem que repetir o contrato que existe, não inaugurar um segundo.
		administradoraPreferida:
			meta.contractOffer?.administradora ?? links.registeredAdministradora ?? null,
		// FIX-417 — a marca da TELA, só pro aviso de divergência. Nunca entra no
		// matching: quem vincula é `administradoraPreferida`, acima.
		administradoraExibida:
			meta.contractOffer?.administradora ?? meta.recommendedOffer?.administradora ?? null,
		// E o MESMO prazo que ele viu — desempata o matching dentro da admin
		// (matching preparatório 2026-06-28). O snapshot da oferta ativa traz o
		// prazo — mesma checagem de consistência do `valor` acima.
		// FIX-414 — mesma fonte da administradora. O prazo desempata o matching
		// DENTRO da administradora: mandá-lo sem ela vincularia o contrato pela
		// porta dos fundos, que é exatamente o tipo de fresta que esta campanha
		// vem encontrando.
		prazoPreferido: meta.contractOffer?.termMonths ?? null,
		// FIX-48: vincula a proposta ao lead já existente da conversa pra a raia
		// avançar (qualificado→proposta_enviada). null explícito (nunca undefined).
		leadId: links.leadId ?? null,
	};
}

// FIX-263 (P1, veredito Fable r5, seam PARCIAL, 2026-07-10) — o anti-refazer
// (não abrir uma 2ª proposta REAL de administradora diferente) era REGRA-NO-
// PROMPT e falhou ao vivo 2×: o agente negou a proposta RODOBENS registrada,
// afirmou falsamente que a ITAÚ estava registrada (sem check_proposal_status)
// e reabriu o contract_form da ITAÚ — a 1 clique de uma 2ª proposta real (CPF
// + consulta de bureau) na MESMA conversa. Lei 1/4: o guard vira código, não
// fica no prompt. `route.ts` (contract-submit) chama isto ANTES de startContract
// com a administradora já registrada em `bevi_proposals` (getLatestBeviProposal)
// — nunca confia no que o modelo afirma sobre o estado da proposta.

/** A administradora PEDIDA neste fechamento conflita com uma já REGISTRADA
 * nesta conversa? Mesma normalização do FIX-251 (acento/caixa não disparam
 * falso-positivo: "Itau" === "ITAÚ"). Sem proposta registrada ainda, ou sem
 * administradora pedida (defensivo), nunca conflita — só bloqueia quando há
 * DUAS administradoras REAIS e DIFERENTES em jogo. */
export function administradoraConflictsWithRegisteredProposal(
	registeredAdministradora: string | null | undefined,
	requestedAdministradora: string | null | undefined,
): boolean {
	// FIX-415 — `sem marca pedida → não conflita` CONTINUA CERTO, e a razão mudou.
	//
	// Antes era "não há o que comparar". Hoje é mais forte: quando não há marca
	// pedida, `buildStartContractInput` manda a administradora da proposta JÁ
	// REGISTRADA (via `links.registeredAdministradora`) — ou seja, uma tentativa
	// sem âncora vira necessariamente um retry do MESMO contrato, não uma segunda
	// proposta. Não há conflito porque não há como haver.
	//
	// Quem chama passa `contractOffer?.administradora ?? recommendedAdministradora`
	// (route.ts): o guard olha também o FOCO da conversa, de propósito. Ser mais
	// estrito que a ação é seguro — bloquear a mais custa uma mensagem; bloquear a
	// menos custa uma consulta de bureau no CPF de alguém.
	if (!registeredAdministradora || !requestedAdministradora) return false;
	return (
		normalizeAdministradora(registeredAdministradora) !==
		normalizeAdministradora(requestedAdministradora)
	);
}
