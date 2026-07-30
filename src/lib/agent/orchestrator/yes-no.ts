import type { UserIntent } from "@/lib/agent/qualify-state";

// Sim/não em texto livre — módulo NEUTRO de propósito: é usado pelos dois
// runtimes (orchestrator/index.ts e langgraph/nodes/advance.ts) e não pode
// arrastar nenhuma dependência pesada. Quando morava no `index.ts`, importá-lo
// do grafo criava ciclo (index → runner → builder → …) e o Turbopack quebrava
// com "CJS module can't be async".
//
// Ter duas cópias era pior: a do grafo ficou para trás e manteve o bug em que
// o "não" ganhava por ser testado primeiro.
// FIX-395b (2026-07-30) — as afirmações naturais entraram AQUI, na lista, e não
// como "qualquer coisa sem 'não' quando o intent é ready_to_proceed".
//
// A primeira tentativa do FIX-387 foi a regra em bloco, e ela era perigosa:
// medido com o analyzer real, "de jeito nenhum", "nem pensar", "jamais",
// "prefiro usar só o meu dinheiro", "achei caro" e "fora do meu orçamento"
// voltam com `ready_to_proceed` e NENHUM deles contém a palavra "não" — todos
// viravam ACEITE. No gate do embutido isso comprava pro cliente uma carta 43%
// maior do que ele pediu, depois de ele ter recusado.
//
// O lado negativo é UMA palavra; o espaço de recusas sem ela é aberto. Então a
// assimetria só se sustenta pelo lado positivo: afirmação reconhecida vira SIM,
// o resto fica indefinido e o gate pergunta de novo. Ampliar esta lista é
// trabalho incremental — e é o trabalho certo, porque cada entrada é uma
// afirmação inequívoca, enquanto a regra em bloco apostava no infinito.
const YES_TEXT_MARKERS =
	/\b(sim|quero|considero|considerar|pode|pode ser|mostra|mostrar|topo|bora|vamos|manda ver|manda o contrato|isso mesmo|show|beleza|claro|positivo|certo|ok|aceito|aceita|faz sentido|faz todo sentido|faz total sentido|concordo|perfeito|combinado|isso a[íi]|é ess[ae] que eu quero|por mim (t[áa]|est[áa]) (bom|[óo]timo|tudo bem))(?![\wà-úÀ-Ú])/i;
const NO_TEXT_MARKERS = /\bn[ãa]o\b/i;

export function detectYesNoText(text: string, intent: UserIntent): boolean | null {
	if (
		intent === "asking_question" ||
		intent === "expressing_doubt" ||
		intent === "confused" ||
		intent === "off_topic" ||
		intent === "wants_more_options"
	) {
		return null;
	}
	// FIX-396 — recusa rotulada pelo analyzer é NÃO, mesmo sem a palavra "não".
	// É o lado do enum que faltava: antes, "de jeito nenhum" e "prefiro usar só o
	// meu dinheiro" não tinham nenhum sinal determinístico e ficavam indefinidos
	// (o gate reabria). Com o rótulo, a negativa fecha o gate de uma vez — que é o
	// que o cliente pediu.
	if (intent === "declines") return false;
	const t = text.trim();
	if (!t) return null;

	// ── ADVERSATIVA: a oração final só REBAIXA, nunca cria nem sobrepõe ──
	//
	// FIX-399d (3ª revisão independente). A 1ª versão desta regra avaliava
	// recursivamente só a oração DEPOIS do "mas", e com isso a segunda metade podia
	// CRIAR um aceite. Medido no grafo real, fixture do Bernardo (bem de R$ 700 mil,
	// gate do embutido):
	//
	//   "não quero usar o embutido, mas quero ver as opções"
	//     → HEAD: false · 1ª versão: TRUE · lanceEmbutido=true · carta 1.000.000
	//
	// Carta 43% maior pra quem acabou de recusar. A regra correta é de REBAIXAMENTO:
	// percorre as orações em ordem e o resultado só pode piorar. `false` de qualquer
	// oração é terminal; `null` derruba um `true`; `true` só sobrevive se veio da
	// PRIMEIRA oração e nada depois o contradisse.
	//
	// Perder um "tava em dúvida, mas concordo" (fica indefinido, o gate pergunta de
	// novo) custa uma pergunta repetida. Ganhar um falso aceite custa uma carta.
	const oracoes = t
		.split(/\b(?:mas|por[ée]m|s[óo] que|contudo|entretanto|todavia)\b/i)
		.map((o) => o.trim());
	if (oracoes.length > 1) {
		let acumulado: boolean | null = null;
		for (const [i, oracao] of oracoes.entries()) {
			// Oração vazia (frase interrompida no "mas") não conclui nada.
			const parcial = oracao ? avaliarOracao(oracao) : null;
			if (parcial === false) return false;
			if (i === 0) acumulado = parcial;
			else if (parcial !== true) acumulado = null; // rebaixa; nunca promove
		}
		return acumulado;
	}

	return avaliarOracao(t);
}

/** Sim/não de UMA oração, sem adversativa. Separado pra a regra de rebaixamento
 * poder aplicá-lo por oração — e pra o guard de condicional agir só onde deve.
 * Não recebe `intent`: `declines` já foi resolvido na função exportada (linha
 * acima) antes de qualquer split por oração. */
function avaliarOracao(t: string): boolean | null {
	// "não sei" é HESITAÇÃO, não recusa — quem diz "não sei, pode mostrar sim"
	// está aceitando.
	const semHesitacao = t.replace(/\bn[ãa]o\s+sei\b/gi, " ");
	const nao = semHesitacao.match(NO_TEXT_MARKERS);
	const sim = semHesitacao.match(YES_TEXT_MARKERS);
	const base: boolean | null = !nao
		? sim
			? true
			: null
		: !sim
			? false
			: // Os dois na mesma oração: quem aparece PRIMEIRO governa. "não quero" é
				// recusa; "não sei, pode mostrar sim" é aceite. Empatar em null congelaria
				// o funil nas recusas mais comuns, porque "quero"/"pode" estão no SIM.
				(sim.index ?? Number.MAX_SAFE_INTEGER) < (nao.index ?? Number.MAX_SAFE_INTEGER);

	// Os dois guards abaixo só REBAIXAM um `true`. Rodá-los sobre a frase inteira
	// antes de calcular a base era uma regressão que a 3ª revisão pegou: "não quero
	// embutido, seria dinheiro jogado fora" ia de `false` pra `null` e deixava de
	// fechar o gate. Recusa nunca é apagada por uma condicional.
	if (base !== true) return base;
	// "não sei SE <afirmação>" é dúvida sobre a própria coisa — o strip de "não sei"
	// acima transformava isso em aceite depois que o léxico cresceu.
	if (/\bn[ãa]o sei se\b/i.test(t)) return null;
	// Afirmação no CONDICIONAL não é aceite: "seria perfeito se a parcela fosse
	// menor" enuncia uma condição, não um sim.
	if (/\b(seria|ficaria|se fosse|se der|se tiver|se você)\b/i.test(t)) return null;
	return true;
}
