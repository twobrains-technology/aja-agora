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
	//
	// FIX-407 — a mesma figura, do lado do ENTUSIASMO. O português usa a negação
	// como intensificador positivo, e a regra de "quem aparece primeiro governa"
	// (abaixo) lia o "não" inicial como recusa:
	//
	//   "não vejo a hora, quero fechar"  → false
	//   "não pensei duas vezes, fechado" → false
	//
	// Achado pela 9ª revisão independente medindo o predicado de produção: seis
	// falas reais de FECHAMENTO eram lidas como recusa. Vale nos dois canais — no
	// gate da web, quem respondia "não vejo a hora" a "quer seguir?" era
	// registrado como tendo recusado.
	//
	// Lista lexical, e não regra em bloco, pelo motivo que a linha 21 já
	// argumenta: cada entrada é uma locução FIXA e inequívoca, em que o "não" não
	// nega o verbo seguinte. Fora delas, "não" continua negando — "não quero" é
	// recusa, e tem que seguir sendo.
	const semHesitacao = t
		.replace(/\bn[ãa]o\s+sei\b/gi, " ")
		.replace(
			/\bn[ãa]o\s+(?:vejo\s+a\s+hora|tenho\s+d[úu]vidas?|quero\s+perder|aguento\s+mais|pensei\s+duas\s+vezes|[ée]\s+[àa]\s+toa)\b/gi,
			" ",
		);
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

/** A fala RECUSA? Predicado ÚNICO de recusa do sistema.
 *
 * FIX-407 — ele nasceu privado em `choose-offer.ts`. Quando o FIX-406 precisou de
 * um veto de recusa no atalho de fechamento do WhatsApp, usou só METADE dele
 * (`detectYesNoText`) e deixou passar a família inteira que recusa SEM a palavra
 * "não": "de jeito nenhum, quero fechar" e "esquece, tenho interesse" disparavam
 * o fluxo de contrato. A 9ª revisão independente mediu e apontou a ironia — o
 * commit dizia estar evitando "uma nona regex" ao reusar o primitivo, e criou a
 * divergência ao reusar metade dele.
 *
 * Mora aqui, junto de `detectYesNoText`, porque este módulo é o lugar NEUTRO que
 * os dois runtimes e os dois canais já importam sem criar ciclo (ver o cabeçalho).
 * Predicado de recusa duplicado é como a cópia do `yes-no` no grafo ficou para
 * trás; uma cópia só não tem como divergir. */
export function falaRecusa(text: string): boolean {
	const t = text ?? "";
	if (!t.trim()) return false;
	return (
		detectYesNoText(t, "neutral") === false ||
		// ⚠️ A borda final é `(?![\wà-úÀ-Ú])`, NUNCA `\b`. Em JS, `\b` é definido
		// sobre `[A-Za-z0-9_]`: depois de vogal acentuada ele casa no lugar errado,
		// e `\bdeixa pra lá\b` simplesmente não encontra "deixa pra lá". Esta
		// armadilha já custou dois defeitos neste repo (o léxico de SIM e o
		// `pediuParaFechar`) — o `YES_TEXT_MARKERS` acima usa a mesma lookahead
		// pelo mesmo motivo.
		/\b(de jeito nenhum|nem pensar|jamais|nunca|de forma alguma|detesto|odeio|esquece|deixa pra l[áa])(?![\wà-úÀ-Ú])/i.test(
			t,
		)
	);
}
