import type { Category, QualifyAnswers } from "@/lib/agent/personas";
import type { Gate } from "@/lib/agent/qualify-state";

/** FIX-301 (P7, loop-de-goal r10) — lead-in universal quando o usuário sinaliza
 * confusão ("não entendi") com um gate REALMENTE pendente. Reconhece a dúvida
 * em 1 frase e deixa a pergunta/card canônico do MESMO gate seguir — nunca um
 * menu novo nem uma dissertação livre. Usado por `orchestrator/index.ts`
 * (curto-circuito ANTES de invocar a LLM, Lei 4). */
export const CLARIFY_LEAD_IN = "Sem problemas, deixa eu simplificar:";

/** FIX-212 (split 2 tempos) — a EDUCAÇÃO do lance embutido e a PERGUNTA são
 * constantes separadas. Preserva as âncoras do docx (própria carta / R$ 100 mil /
 * chances de contemplação / sem precisar hoje / "a gente te ajuda"). Na WEB o card
 * mostra as duas juntas (gateQuestion compõe abaixo); no WhatsApp a educação sai
 * como balão de contexto e o card carrega SÓ a pergunta — channel-aware, o card
 * deixa de ser 3 parágrafos de aula + a pergunta numa unidade só. */
const formatCredit0 = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** FIX-245 (rodada 2, Fable r1, §D4.d do veredito): o gate `lance-embutido`
 * roda PÓS-reveal desde o FIX-215 — `meta.recommendedOffer.creditValue` já é
 * a carta REAL que o cliente está vendo na tela. Um consultor de verdade usa
 * o número do cliente, não um exemplo genérico. Sem carta real (chamador que
 * ainda não tem o snapshot) → mantém o exemplo honesto de "R$ 100 mil". */
export function lanceEmbutidoEdu(creditValue?: number): string {
	const cartaPhrase =
		creditValue != null && Number.isFinite(creditValue) && creditValue > 0
			? `na sua carta de ${formatCredit0(creditValue)}`
			: "numa carta de R$ 100 mil";
	return (
		"Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. " +
		`É usar parte da própria carta de crédito como lance — ${cartaPhrase}, por exemplo, ` +
		"você usa uma fatia desse valor pra aumentar suas chances de contemplação, " +
		"sem precisar ter todo o lance em dinheiro hoje."
	);
}
/** @deprecated Use `lanceEmbutidoEdu(creditValue)` pra usar a carta REAL do
 * cliente — este const mantém só o fallback genérico, pra quem ainda não
 * repassou o valor real. */
export const LANCE_EMBUTIDO_EDU = lanceEmbutidoEdu();
export const LANCE_EMBUTIDO_ASK = "Quer considerar esse tipo de lance nas suas simulações?";

/** FIX-312 — "esse"/"essa" concordando com o `desiredItem` referenciado no
 * gate `credit`. Prioridade 1: o PRÓPRIO artigo indefinido que o analyzer já
 * capturou junto do item ("um Corolla", "uma casa") — sinal mais confiável
 * que a categoria sozinha, porque `imovel`/`servicos` têm itens de género
 * variável ("um apartamento" vs. "uma casa"). Sem artigo no texto, cai no
 * default por categoria (auto/imovel = masculino do "carro"/"imóvel", moto =
 * feminino da "moto"). Sem isso, "esse " + "um Corolla" (artigo cru, sem
 * remoção) virava "esse um Corolla" — erro de concordância, veredito Sonnet
 * rodada A.2. */
const INDEFINITE_ARTICLE_PREFIX = /^(um|uma|uns|umas)\s+(.+)$/i;
const CREDIT_DEMONSTRATIVE_FALLBACK_BY_CATEGORY: Record<Category, "esse" | "essa"> = {
	imovel: "esse",
	auto: "esse",
	moto: "essa",
	servicos: "esse",
};

function creditItemDemonstrative(
	item: string,
	category: Category | null | undefined,
): { demonstrative: "esse" | "essa"; item: string } {
	const trimmed = item.trim();
	const articleMatch = trimmed.match(INDEFINITE_ARTICLE_PREFIX);
	if (articleMatch) {
		const article = articleMatch[1].toLowerCase();
		return {
			demonstrative: article === "uma" || article === "umas" ? "essa" : "esse",
			item: articleMatch[2],
		};
	}
	return {
		demonstrative: category ? CREDIT_DEMONSTRATIVE_FALLBACK_BY_CATEGORY[category] : "esse",
		item: trimmed,
	};
}

const TIMEFRAME_QUESTIONS: Record<Category, string> = {
	imovel: "Em quanto tempo você quer estar com o seu imóvel?",
	auto: "Em quanto tempo você quer estar com o carro novo?",
	moto: "Em quanto tempo você quer estar com a moto nova?",
	servicos: "Em quanto tempo você quer realizar isso?",
};

/** FIX-233 (handoff agente-vendas-consorcio, 2026-07-09) — gate `desire`, não
 * bloqueante: 1ª das duas perguntas de contexto (bem específico + motivo de
 * agora). A pergunta sai no TEXTO do agente (directive), não num card — a
 * segunda pergunta (motivo) é conversa livre, sem gate próprio. */
const DESIRE_QUESTIONS: Record<Category, string> = {
	imovel: "Qual imóvel você tem em mente?",
	auto: "Qual carro você tem em mente?",
	moto: "Qual moto você tem em mente?",
	servicos: "O que você tem em mente pra realizar?",
};

export function gateQuestion(
	gate: Gate,
	category?: Category | null,
	creditValue?: number,
	// FIX-255 (rodada 4, veredito Fable FINAL §N-D): default "whatsapp" —
	// preserva o comportamento de TODOS os chamadores pré-existentes
	// (whatsapp/adapter.ts, identify-capture.ts, gate-reengage.ts), que já
	// rodam nesse canal. Só web/adapter.ts passa "web" explicitamente.
	channel: "web" | "whatsapp" = "whatsapp",
	// FIX-284 — valor aproximado mencionado informalmente no gate `desire`
	// (`qualifyAnswers.creditMentionedAtDesire`). Quando presente, o gate
	// `credit` CONFIRMA esse valor em vez de perguntar do zero.
	creditMentionedAtDesire?: number,
	// FIX-296 — o bem específico capturado no gate `desire`
	// (`qualifyAnswers.desiredItem`, ex.: "Corolla"). Quando presente e sem
	// `creditMentionedAtDesire`, a copy do `credit` referencia o bem
	// ("E quanto custa esse Corolla hoje?") em vez da pergunta genérica.
	desiredItem?: string | null,
	// FIX-312 — nº da tentativa (1-based) em que o gate `credit` está sendo
	// perguntado NESTA conversa. Na 2ª+ tentativa a copy reconhece que já foi
	// perguntado em vez de repetir o texto verbatim (balão colado + repetição,
	// veredito Sonnet rodada A.2, dossiê Madalena). Default 1 preserva o
	// comportamento de todos os chamadores pré-existentes.
	attempt = 1,
): string | null {
	switch (gate) {
		case "name":
			// FIX-17: a pergunta do nome ("Como posso te chamar?") já sai no TEXTO
			// do agente (directive de primeiro contato). O card só complementa com
			// input focado — null aqui evita a pergunta aparecer duas vezes.
			return null;
		case "desire":
			return category ? DESIRE_QUESTIONS[category] : null;
		case "experience":
			return "Você já fez consórcio antes?";
		case "credit": {
			const isReask = attempt >= 2;
			// FIX-284: o valor já foi mencionado informalmente no gate `desire`
			// (2 turnos atrás) — CONFIRMA em vez de perguntar do zero (viola
			// "sem pedir dado já dado", veredito Sonnet 5 G-F).
			if (
				creditMentionedAtDesire != null &&
				Number.isFinite(creditMentionedAtDesire) &&
				creditMentionedAtDesire > 0
			) {
				return isReask
					? `Ainda sobre o valor: fica em uns ${formatCredit0(creditMentionedAtDesire)} mesmo, ou prefere ajustar?`
					: `Uns ${formatCredit0(creditMentionedAtDesire)} então, é isso? Pode ajustar se quiser.`;
			}
			// FIX-296 (mockup Madalena, docs/design/specs/assets/2026-07-12-aja-
			// dois-cenarios.html): com o bem já nomeado no gate `desire`, a
			// pergunta do valor referencia ele — "E quanto custa esse Corolla
			// hoje?" — em vez da fria "qual valor do bem". Fallback genérico
			// (FIX-2, linguagem do docx) quando o bem não é específico o
			// bastante (ex.: usuário só disse "um carro").
			// FIX-312: "esse"/"essa" concorda com o género do item (nunca "esse
			// um X") e a 2ª+ tentativa varia a copy em vez de repetir verbatim.
			if (desiredItem && desiredItem.trim()) {
				const { demonstrative, item } = creditItemDemonstrative(desiredItem, category);
				return isReask
					? `Só retomando: quanto custa ${demonstrative} ${item}, mais ou menos?`
					: `E quanto custa ${demonstrative} ${item} hoje?`;
			}
			return isReask
				? "Voltando aqui: qual valor você tem em mente pro bem?"
				: "Qual valor do bem faz mais sentido pra você?";
		}
		case "timeframe":
			return category ? TIMEFRAME_QUESTIONS[category] : null;
		case "lance":
			// FIX-268 (rodada 7, veredito Fable r6, residual D4): "reserva" varrido
			// — mesma disciplina do FIX-234/FIX-256 (nunca "reserva"/"reservado"
			// antes da contratação real). Aqui o sentido era outro (dinheiro
			// guardado pro lance), mas a ambiguidade com o termo proibido é
			// exatamente o risco que a regra existe pra eliminar.
			return "Você teria como dar um lance pra antecipar a contemplação?";
		case "lance-value":
			// docx passo 2 (linha 21-22): se "sim" → "Qual valor aproximado?"
			return "Boa! E qual valor aproximado você pensa em dar de lance?";
		case "lance-embutido":
			// FIX-212: educação + pergunta compostas (a WEB usa o card completo). No
			// WhatsApp o adapter usa lanceEmbutidoEdu()/LANCE_EMBUTIDO_ASK separados
			// (educação num balão, card só com a pergunta) — split 2 tempos.
			// FIX-245: creditValue (carta REAL, pós-reveal) substitui o exemplo
			// genérico de "R$ 100 mil" quando disponível.
			return `${lanceEmbutidoEdu(creditValue)}\n\n${LANCE_EMBUTIDO_ASK}`;
		case "identify":
			// FIX-210 (reforma de conversa WhatsApp): a copy do identify foi UNIFICADA
			// e encurtada — aqui vive só o PEDIDO (beat 2 da cadência 2-tempos). O
			// contexto (beat 1: "pra comparar as administradoras e achar sua melhor
			// opção") vem do LLM como balão próprio, entregue pelo adapter antes deste
			// pedido. Antes havia DOIS textos concorrentes — este e o
			// IDENTIFY_WHATSAPP_PROMPT ("me envia seu CPF... celular eu já tenho") —
			// que agora reexporta ESTA fonte única (identify-capture.ts). No WhatsApp o
			// celular já é o waId, então só falta o CPF. Sem emoji, sem hedge, sem
			// "preciso do CPF e celular" (FIX-53 pedia identidade antes do valor; o
			// gancho forward-looking migrou pro beat de contexto do LLM).
			//
			// FIX-255 (rodada 4, veredito Fable FINAL §N-D): a copy "Seu celular eu
			// já pego aqui do WhatsApp" só faz sentido no CANAL WhatsApp (celular =
			// waId, já conhecido). Na WEB o form pede CPF E celular (gatePartData
			// "identity" tem os dois campos, `prefilledPhone: null`) — a mesma frase
			// mentia sobre de onde o celular vem (3 de 3 runs do veredito).
			// FIX-296 (mockup Madalena): no canal WEB o identify agora chega
			// DEPOIS do valor (reversão do FIX-53) — a moldura do docx justifica
			// o pedido ANTES de fazê-lo: "pra eu trazer as ofertas reais das
			// administradoras, preciso do seu CPF e WhatsApp". O WhatsApp segue
			// com o beat de contexto próprio (identify-capture.ts,
			// IDENTIFY_CONTEXT_WHATSAPP) — fora de escopo deste fix.
			return channel === "web"
				? "Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular."
				: "Me manda seu CPF, só os números. Seu celular eu já pego aqui do WhatsApp.";
		case "simulator-offer":
			// docx passo 4 (linha 34): oferta literal do simulador.
			return (
				"Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, " +
				"caso você seja contemplado em 3, 6 ou 12 meses — que tal?"
			);
		case "reco-consent":
			// FIX-297: gate leve entre a lista (comparison_table) e o hero
			// (recommendation_card) — só com resposta afirmativa aqui o hero é
			// liberado (server-forced em orchestrator/index.ts).
			return "Posso te mostrar a opção que eu recomendo?";
		case "doubts-wait":
		case "search":
		case "decision":
			// "decision" não é uma pergunta de chip — é o card present_decision_prompt
			// ("Esse plano faz sentido?"), dirigido pelo orquestrador no fim do passo 4.
			return null;
	}
}

/**
 * FIX-305 — texto determinístico (fora do LLM, mesmo padrão de
 * `TWO_PATHS_FOLLOWUP_TEXT`/`SPECIALIST_EXIT_OFFER`) emitido quando um gate
 * atinge o teto de tentativas sem progresso e o orquestrador assume o default
 * (`registerGateStuckTurn`, qualify-state.ts). Avisa o usuário do valor
 * assumido e que pode ajustar depois — nunca finge que o dado veio dele.
 * `patch` é o retalho de `qualifyAnswers` recém-aplicado (já mesclado no
 * meta pelo chamador), usado só pra compor o número/valor na frase.
 */
export function gateStuckDefaultNotice(
	gate: Gate,
	patch: Pick<QualifyAnswers, "prazoMeses" | "lanceValue">,
): string | null {
	switch (gate) {
		case "timeframe":
			return `Vou considerar ${patch.prazoMeses} meses por enquanto — você pode ajustar isso depois.`;
		case "lance":
			return "Vou seguir sem considerar lance por enquanto — se quiser, a gente volta nesse assunto depois.";
		case "lance-value":
			return patch.lanceValue
				? `Vou considerar um lance de ${formatCredit0(patch.lanceValue)} por enquanto — você pode ajustar depois.`
				: "Vou considerar um lance moderado por enquanto — você pode ajustar depois.";
		case "lance-embutido":
			return "Vou seguir sem considerar o lance embutido por enquanto — se quiser, a gente volta nesse assunto depois.";
		default:
			return null;
	}
}
