// Asserts determinísticos do golden-set (`pnpm eval`). A regra do CLAUDE.md
// manda: invariante verificável vira código (trajetória de artifacts/gates,
// HTTP, contaminação); prosa é do modelo — qualidade de fala é papel do juiz
// LLM (Evaluator no Langfuse), NUNCA daqui.

/** Marcadores de fallback degradado — HTTP 200 que significa "a LLM nunca
 * respondeu" (guard herdado do driver r9). Presença = cenário CONTAMINADO. */
import { extractMoneyMentions } from "@/lib/agent/orchestrator/money";

export const DEFAULT_CONTAMINATION_MARKERS: readonly string[] = [
	"Acho que me perdi por aqui",
	"me perdi por aqui",
];

export type GoldenTurnResult = {
	userMsg: string;
	agentText: string;
	artifactTypes: string[];
	httpStatus: number | null;
	error: string | null;
	/** Artifacts COM payload. Os asserts de número (duplicata, crédito) leem
	 * daqui — `artifactTypes` sozinho não sustenta invariante sobre valor.
	 * Opcional: cenário antigo que só afirma trajetória segue funcionando. */
	artifacts?: Array<{ type: string; data: unknown }>;
};

/** Oferta como ela trafega no payload — só os campos que os asserts leem.
 * Os nomes seguem o `ChosenOffer` de `orchestrator/choose-offer.ts`
 * (`creditValue`/`monthlyPayment`/`termMonths`); `installment` é aceito como
 * apelido porque alguns cards antigos ainda emitem com esse nome, e um assert
 * que só olhasse um dos dois passaria em falso — que é pior que falhar. */
type OfertaLida = {
	administradora?: string;
	creditValue?: number;
	monthlyPayment?: number;
	termMonths?: number;
};

const numeroOuUndefined = (v: unknown): number | undefined =>
	typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Varre o payload de um artifact atrás de arrays de oferta, em qualquer
 * profundidade. Genérico de propósito: `offer_options`, `comparison_table` e
 * `recommendation` têm shapes diferentes, e um assert que dependesse do nome
 * exato da chave quebraria no primeiro rename. */
function coletarOfertas(node: unknown, saida: OfertaLida[] = [], nivel = 0): OfertaLida[] {
	if (nivel > 6 || node === null || typeof node !== "object") return saida;
	if (Array.isArray(node)) {
		for (const item of node) coletarOfertas(item, saida, nivel + 1);
		return saida;
	}
	const obj = node as Record<string, unknown>;
	if (typeof obj.administradora === "string") {
		saida.push({
			administradora: obj.administradora,
			creditValue: numeroOuUndefined(obj.creditValue),
			monthlyPayment: numeroOuUndefined(obj.monthlyPayment) ?? numeroOuUndefined(obj.installment),
			termMonths: numeroOuUndefined(obj.termMonths),
		});
	}
	for (const v of Object.values(obj)) coletarOfertas(v, saida, nivel + 1);
	return saida;
}

const rotuloOferta = (o: OfertaLida) =>
	`${o.administradora}::${o.creditValue ?? "?"}::${o.monthlyPayment ?? "?"}::${o.termMonths ?? "?"}`;

export type GoldenTurnAsserts = {
	/** Todos precisam aparecer nos artifacts do turno (subset match). */
	expectArtifacts?: string[];
	/** Nenhum pode aparecer. */
	forbidArtifacts?: string[];
	/** Report de 05/08 ("Está repetindo grupos iguais"): duas ofertas com a MESMA
	 * administradora E os mesmos números na mesma tela. Administradora repetida
	 * com números diferentes é grupo distinto e continua válida. */
	forbidDuplicateOffers?: boolean;
	/** Report de 05/08 ("não diminuir a minha carta"): piso de carta de crédito
	 * ofertada. Existe porque, ao pedir "grupo com menor lance", o agente
	 * encolheu a carta de 200k pra 144k em vez de escolher outro grupo. */
	minCreditValue?: number;
	/** Report de 05/08 ("Não saio do lugar"): o agente repetiu o próprio bloco
	 * de fala do turno anterior. Compara com TODOS os turnos anteriores. */
	forbidRepeatedAgentText?: boolean;
	/** Report de 05/08 ("a IA tá chapada"): valor em R$ na fala do agente sem
	 * lastro em artifact nem na fala do usuário. O prompt já proíbe inventar
	 * número — como a regra-no-prompt não segurou, o invariante vira código. */
	forbidUngroundedMoney?: boolean;
	/** Report de 05/08 ("esse não seria o grupo com menor lance"): quando o
	 * cliente pede um eixo, a recomendação tem que ser a MELHOR nesse eixo entre
	 * as opções que estão na tela. Nome do campo a minimizar (ex. `avgBidValue`
	 * pra menor lance, `monthlyPayment` pra menor parcela). */
	recommendationMustMinimize?: string;
};

/** Frases longas o bastante pra que repetir signifique loop, não confirmação.
 * "Beleza!" repetido é conversa normal; um bloco de 40+ caracteres repetido
 * literalmente é o agente girando em falso. */
const MIN_CHARS_FRASE_REPETIDA = 40;

function frasesDe(texto: string): string[] {
	return texto
		.split(/(?<=[.!?])\s+/)
		.map((f) => f.trim())
		.filter((f) => f.length >= MIN_CHARS_FRASE_REPETIDA);
}

/** Pares (administradora, valor) para um campo numérico qualquer do payload —
 * base do assert de "a recomendação é a melhor no eixo pedido". */
function coletarComCampo(
	node: unknown,
	campo: string,
	saida: Array<{ nome?: string; valor: number }> = [],
	nivel = 0,
): Array<{ nome?: string; valor: number }> {
	if (nivel > 6 || node === null || typeof node !== "object") return saida;
	if (Array.isArray(node)) {
		for (const item of node) coletarComCampo(item, campo, saida, nivel + 1);
		return saida;
	}
	const obj = node as Record<string, unknown>;
	const valor = numeroOuUndefined(obj[campo]);
	if (valor !== undefined) {
		saida.push({
			nome: typeof obj.administradora === "string" ? obj.administradora : undefined,
			valor,
		});
	}
	for (const v of Object.values(obj)) coletarComCampo(v, campo, saida, nivel + 1);
	return saida;
}

/** Todo número que o payload do artifact carrega, em qualquer profundidade —
 * é o conjunto do que o agente PODE dizer sem estar inventando. */
function coletarNumeros(node: unknown, saida: Set<number> = new Set(), nivel = 0): Set<number> {
	if (nivel > 6 || node === null || node === undefined) return saida;
	if (typeof node === "number") {
		if (Number.isFinite(node)) saida.add(node);
		return saida;
	}
	if (typeof node !== "object") return saida;
	for (const v of Object.values(node as Record<string, unknown>)) {
		coletarNumeros(v, saida, nivel + 1);
	}
	return saida;
}

export type GoldenExpectations = {
	/** Somam-se aos DEFAULT_CONTAMINATION_MARKERS (checados em TODO turno). */
	forbidTextMarkers?: string[];
	/** Paralelo ao array de turnos; `null`/ausente = turno livre. */
	turns?: Array<GoldenTurnAsserts | null | undefined>;
	/** Teto de turnos CONSECUTIVOS no mesmo gate — o invariante de "o funil anda".
	 *
	 * Nasceu de uma reprodução em 09/08/2026: o agente perguntou o nome em 4
	 * turnos seguidos (inclusive depois de `save_contact_name` rodar) e o funil
	 * ficou parado em `gate:name`. É a assinatura do "Não saio do lugar" que a
	 * Bruna reportou no WhatsApp em 05/08.
	 *
	 * Por que gate e não texto: o modelo REFORMULA a pergunta a cada turno
	 * ("Como posso te chamar?" → "Antes de eu buscar as cartas, como posso te
	 * chamar?"), então comparar prosa não pega — e comparar prosa também violaria
	 * a regra de que fala é do modelo. O gate é trajetória, e trajetória é
	 * exatamente o que estes asserts existem pra vigiar. */
	maxConsecutiveSameGate?: number;
};

export type ScenarioVerdict = { pass: boolean; failures: string[] };

export function checkScenario(
	turns: GoldenTurnResult[],
	expected: GoldenExpectations,
): ScenarioVerdict {
	const failures: string[] = [];
	const markers = [...DEFAULT_CONTAMINATION_MARKERS, ...(expected.forbidTextMarkers ?? [])];

	if (expected.maxConsecutiveSameGate !== undefined) {
		const teto = expected.maxConsecutiveSameGate;
		let atual: string | null = null;
		let seguidos = 0;
		let jaAcusado = false;
		for (const t of turns) {
			// Um turno pode emitir mais de um artifact (transição + gate); o gate é
			// o que diz em que passo do funil a conversa está.
			const gate = t.artifactTypes.find((a) => a.startsWith("gate:")) ?? null;
			if (gate !== null && gate === atual) {
				seguidos += 1;
				if (seguidos > teto && !jaAcusado) {
					failures.push(
						`funil TRAVADO: "${gate}" se repetiu em ${seguidos} turnos consecutivos (teto ${teto}) — o passo não avançou`,
					);
					jaAcusado = true;
				}
			} else {
				atual = gate;
				seguidos = gate === null ? 0 : 1;
				jaAcusado = false;
			}
		}
	}

	turns.forEach((t, i) => {
		const rotulo = `turno ${i + 1} ("${t.userMsg.slice(0, 40)}")`;
		if (t.error) failures.push(`${rotulo}: erro de transporte — ${t.error}`);
		else if (t.httpStatus !== 200) failures.push(`${rotulo}: HTTP ${t.httpStatus}`);

		const marker = markers.find((m) => t.agentText.includes(m));
		if (marker) failures.push(`${rotulo}: CONTAMINADO (fallback degradado: "${marker}")`);

		const asserts = expected.turns?.[i];
		if (!asserts) return;
		for (const esperado of asserts.expectArtifacts ?? []) {
			if (!t.artifactTypes.includes(esperado)) {
				failures.push(
					`${rotulo}: esperava artifact "${esperado}", veio [${t.artifactTypes.join(", ")}]`,
				);
			}
		}
		for (const proibido of asserts.forbidArtifacts ?? []) {
			if (t.artifactTypes.includes(proibido)) {
				failures.push(`${rotulo}: artifact PROIBIDO "${proibido}" apareceu`);
			}
		}

		const precisaDePayload = asserts.forbidDuplicateOffers || asserts.minCreditValue !== undefined;
		if (precisaDePayload && !t.artifacts) {
			// Silêncio aqui seria pior que a falha: o assert passaria sem ter olhado
			// nada, e o cenário se reportaria verde por ausência de dado.
			failures.push(
				`${rotulo}: assert de payload pedido, mas o turno não trouxe artifacts com data`,
			);
			return;
		}

		const ofertas = (t.artifacts ?? []).flatMap((a) => coletarOfertas(a.data));

		if (asserts.forbidDuplicateOffers) {
			const vistas = new Set<string>();
			const repetidas = new Set<string>();
			for (const o of ofertas) {
				const chave = rotuloOferta(o);
				if (vistas.has(chave)) repetidas.add(chave);
				vistas.add(chave);
			}
			for (const chave of repetidas) {
				failures.push(`${rotulo}: oferta DUPLICADA na mesma tela — ${chave}`);
			}
		}

		if (asserts.minCreditValue !== undefined) {
			const piso = asserts.minCreditValue;
			for (const o of ofertas) {
				if (typeof o.creditValue === "number" && o.creditValue < piso) {
					failures.push(
						`${rotulo}: carta ENCOLHIDA — ${o.administradora} veio com ${o.creditValue.toLocaleString("pt-BR")}, abaixo do piso ${piso.toLocaleString("pt-BR")}`,
					);
				}
			}
		}

		if (asserts.forbidRepeatedAgentText) {
			const anteriores = turns.slice(0, i).map((p) => p.agentText);
			for (const frase of frasesDe(t.agentText)) {
				if (anteriores.some((a) => a.includes(frase))) {
					failures.push(`${rotulo}: agente REPETIU fala de turno anterior — "${frase}"`);
				}
			}
		}

		if (asserts.recommendationMustMinimize) {
			const campo = asserts.recommendationMustMinimize;
			const rec = (t.artifacts ?? []).find((a) => a.type.includes("recommendation"));
			// "Na tela" é tudo que o cliente JÁ VIU até aqui, não só este turno: a
			// lista de opções costuma chegar num turno anterior e a recomendação
			// depois. Comparar só dentro do turno faria o assert julgar contra um
			// conjunto vazio e nunca acusar nada.
			const naTela = turns
				.slice(0, i + 1)
				.flatMap((p) => p.artifacts ?? [])
				.filter((a) => !a.type.includes("recommendation"))
				.flatMap((a) => coletarComCampo(a.data, campo));
			const recValor = rec ? coletarComCampo(rec.data, campo)[0] : undefined;
			if (!rec || recValor === undefined) {
				// O card de recomendação só carrega `avgBidValue` "quando a fonte o
				// traz" (recommendation-payload.ts). Sem o campo NÃO dá pra afirmar
				// que a recomendação é a melhor no eixo — e passar em silêncio seria
				// dizer que está tudo certo sem ter olhado. Falha, mas dizendo que o
				// que falta é o DADO, não que a recomendação está errada.
				failures.push(
					`${rotulo}: não dá pra verificar o eixo "${campo}" — a recomendação não trouxe esse campo no payload (${naTela.length} oferta(s) na tela têm o campo)`,
				);
			} else {
				const melhor = naTela.reduce<{ nome?: string; valor: number } | null>(
					(acc, o) => (acc === null || o.valor < acc.valor ? o : acc),
					null,
				);
				if (melhor && melhor.valor < recValor.valor) {
					failures.push(
						`${rotulo}: recomendação IGNORA o eixo pedido — recomendou ${recValor.nome} (${campo} ${recValor.valor.toLocaleString("pt-BR")}) tendo ${melhor.nome} (${melhor.valor.toLocaleString("pt-BR")}) na mesma tela`,
					);
				}
			}
		}

		if (asserts.forbidUngroundedMoney) {
			// Lastro = número que apareceu em QUALQUER artifact (deste turno ou dos
			// anteriores — a conversa acumula contexto) ou que o próprio usuário
			// falou. Fora disso, o valor saiu do modelo.
			const comLastro = new Set<number>();
			for (const anterior of turns.slice(0, i + 1)) {
				for (const a of anterior.artifacts ?? []) {
					for (const n of coletarNumeros(a.data)) comLastro.add(n);
				}
				for (const n of extractMoneyMentions(anterior.userMsg)) comLastro.add(n);
			}
			// Tolerância de 1%: o agente arredonda ("R$ 6.252" vira "uns 6,3 mil")
			// e arredondar não é inventar.
			const temLastro = (v: number) =>
				[...comLastro].some((c) => c > 0 && Math.abs(c - v) / c <= 0.01);
			for (const v of extractMoneyMentions(t.agentText)) {
				if (!temLastro(v)) {
					failures.push(
						`${rotulo}: valor SEM LASTRO na fala — R$ ${v.toLocaleString("pt-BR")} não veio de tool nem do usuário`,
					);
				}
			}
		}
	});

	return { pass: failures.length === 0, failures };
}
