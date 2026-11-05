// COMPARAÇÃO DE PRAZO SÓ COM O NÚMERO DA MESA — VERIFICAÇÃO de FATO, não reescrita de fala.
//
// Defeito medido (print `prints-ux/13-seguir-ou-comparar-com-nome.png`, 27/10 22:35, ordem do
// líder): o agente disse *"Ela tem prazo mais curto que a de 94 meses da ÂNCORA"* sobre a carta de
// **96** meses. 96 é MAIS LONGO que 94. O cliente que confia na frase contrata o prazo errado, e o
// erro passa despercebido porque a fala soa plausível — é exatamente o caso em que o modelo troca
// um número com cara de acerto.
//
// SEGUNDA MEDIDA (28/10, conversa de teste após o `9f5ccecf`): a primeira versão tomava a PRIMEIRA
// carta da tela como "a recomendada" e deixou passar *"a da CANOPUS com parcela de R$ 1.176,39 …
// com maior prazo que a da ÂNCORA de 114 meses"* — a CANOPUS dessa parcela tem 96 meses. O sujeito
// da comparação não é a primeira carta da tela: é a carta que a PRÓPRIA FALA cita, e a fala a cita
// pela parcela ("R$ 1.176,39") ou pelo prazo ("a de 96"). É por esse número que a carta se acha.
//
// O que este arquivo faz: lê a direção que a fala AFIRMA ("mais curto", "mais longo", "menor
// prazo", "maior prazo") e confere contra os prazos REAIS das cartas que estão na mesa. Quando a
// direção CONTRADIZ a mesa — ou o prazo citado não existe em carta nenhuma (invenção), ou não dá
// para saber de quem se fala — emite o sinal `fala_contradiz_mesa` e DEVOLVE O TEXTO INALTERADO.
//
// Desde o remendo P11 (05/11): a REESCRITA saiu do código (`AGENTS.md` P11 — conversa é do
// prompt). A conduta manda a fala bater com a mesa e o card trazer o número certo; o sinal mede o
// caso e alimenta o eval. Fica aqui só a conferência da verdade contra o dado da ferramenta.
import { publicarScores } from "@/lib/observability/sinais/publicar";

const ONDE = "remendos-fala";

/** A carta como a mesa a conhece — só o que a comparação precisa. */
export type CartaDaMesa = { parcela: number; prazoMeses: number; administradora?: string };

const PRAZO_COM_UNIDADE = /(\d{2,3})\s*(?:meses|m[êe]s)\b/gi;
/** Prazo citado sem a unidade: "a de 94 tem…". Só vale depois de "de" e NÃO é dinheiro. */
const PRAZO_SEM_UNIDADE = /\bde\s+(\d{2,3})(?![\d.,]*\s*(?:mil|reais|%|dias)|[.,]\d)/gi;
const PARCELA = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g;

/** Comparativo: a direção que a fala AFIRMA sobre o prazo do sujeito em relação à referência. */
const MAIS_CURTO = /mais\s+curto|menor\s+(?:prazo|tempo)|prazo\s+menor/i;
const MAIS_LONGO = /mais\s+longo|maior\s+(?:prazo|tempo)|prazo\s+maior/i;

/** Uma frase por vez, mantendo a ordem. */
function frasesDe(texto: string): string[] {
	return texto.split(/(?<=[.!?])\s+|\n+/).filter((f) => f.trim().length > 0);
}

const dinheiro = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

type Mencao = { at: number; prazo: number };

/**
 * Os prazos que a frase MENCIONA, na ordem em que aparecem: cada prazo escrito ("114 meses",
 * "a de 96") e cada carta citada pela parcela ("R$ 1.176,39" → o prazo dessa carta na mesa).
 * Parcela que não é de carta nenhuma da mesa não é menção — não há o que conferir.
 */
function mencoesDa(frase: string, mesa: readonly CartaDaMesa[]): Mencao[] {
	const achadas: Mencao[] = [];
	for (const m of frase.matchAll(PRAZO_COM_UNIDADE)) {
		achadas.push({ at: m.index ?? 0, prazo: Number(m[1]) });
	}
	for (const m of frase.matchAll(PRAZO_SEM_UNIDADE)) {
		achadas.push({ at: (m.index ?? 0) + m[0].indexOf("de"), prazo: Number(m[1]) });
	}
	for (const m of frase.matchAll(PARCELA)) {
		const valor = dinheiro(m[1]);
		const prazos = new Set(
			mesa.filter((c) => Math.abs(c.parcela - valor) < 0.005).map((c) => c.prazoMeses),
		);
		// Duas cartas com a mesma parcela e prazos diferentes: não dá para saber de qual se fala.
		if (prazos.size === 1) achadas.push({ at: m.index ?? 0, prazo: [...prazos][0] as number });
	}
	achadas.sort((a, b) => a.at - b.at);
	// A mesma carta citada pela parcela e pelo prazo na mesma frase é UNA menção só.
	const semRepetir: Mencao[] = [];
	for (const m of achadas) {
		if (!semRepetir.some((x) => x.prazo === m.prazo)) semRepetir.push(m);
	}
	return semRepetir;
}

/** O sinal que substitui o remendo: quantas comparações na fala contradizem a mesa. */
function publicarSinal(problemas: number): void {
	if (problemas <= 0) return;
	publicarScores([{ name: "fala_contradiz_mesa", value: problemas, dataType: "NUMERIC" }], ONDE);
}

/**
 * Verifica a comparação de prazo de um texto. DEVOLVE O TEXTO INALTERADO; o segundo valor é o
 * número de comparações problemáticas (direção contradiz a mesa; prazo citado não existe em carta
 * nenhuma; não dá para saber de quem se fala).
 *
 * O SUJEITO é a primeira menção da frase; a REFERÊNCIA é a última. Frase com uma menção só ("Ela
 * tem prazo mais curto que a de 94 meses") herda o sujeito da frase anterior mais próxima que
 * cite uma carta ("A da CANOPUS com parcela de R$ 1.176,39…").
 */
function verificarComparacaoDePrazo(
	texto: string,
	mesa: readonly CartaDaMesa[],
): { texto: string; problemas: number } {
	if (!texto || (!MAIS_CURTO.test(texto) && !MAIS_LONGO.test(texto)))
		return { texto, problemas: 0 };
	const prazosDaMesa = new Set(mesa.map((c) => c.prazoMeses));
	const frases = frasesDe(texto);
	let problemas = 0;

	frases.forEach((frase, i) => {
		const curto = MAIS_CURTO.test(frase);
		const longo = MAIS_LONGO.test(frase);
		if (!curto && !longo) return;

		// Prazo ESCRITO que não é de carta nenhuma da mesa: o número é invenção.
		const escritos = [
			...[...frase.matchAll(PRAZO_COM_UNIDADE)].map((m) => Number(m[1])),
			...[...frase.matchAll(PRAZO_SEM_UNIDADE)].map((m) => Number(m[1])),
		];
		if (escritos.some((p) => !prazosDaMesa.has(p))) {
			problemas += 1;
			return;
		}

		const mencoes = mencoesDa(frase, mesa);
		let sujeito: number | undefined;
		let referencia: number | undefined;
		if (mencoes.length >= 2) {
			sujeito = mencoes[0]?.prazo;
			referencia = mencoes[mencoes.length - 1]?.prazo;
		} else if (mencoes.length === 1) {
			referencia = mencoes[0]?.prazo;
			// O sujeito é a carta da frase anterior mais próxima que cite uma.
			for (let k = i - 1; k >= 0 && sujeito === undefined; k--) {
				const antes = mencoesDa(frases[k] ?? "", mesa);
				const ultimo = antes[antes.length - 1];
				if (ultimo) sujeito = ultimo.prazo;
			}
		}

		// Sem os dois prazos não há como provar a direção: não dá para saber de quem se fala.
		if (sujeito === undefined || referencia === undefined) {
			problemas += 1;
			return;
		}
		if (sujeito === referencia) return;

		const afirmaCurto = curto && !longo;
		// Direção contradiz a mesa: sinal, sem tocar a fala.
		if (afirmaCurto !== sujeito < referencia) problemas += 1;
	});

	return { texto, problemas };
}

/**
 * Verifica a comparação de prazo de um texto e emite o sinal `fala_contradiz_mesa`.
 * A fala sai INALTERADA — a conduta manda a fala bater com a mesa.
 */
export function corrigirComparacaoDePrazo(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] } = { cartasDaMesa: [] },
): string {
	const { texto: inalterado, problemas } = verificarComparacaoDePrazo(texto, args.cartasDaMesa);
	publicarSinal(problemas);
	return inalterado;
}

// ---------------------------------------------------------------------------------------------
// PARCELA — a mesma régua. Medido na conversa de teste de 28/10: depois de apontar a ÂNCORA de 94
// meses (parcela R$ 1.454,51) o agente disse que ela tinha "parcela menor que a outra da ÂNCORA"
// (a outra é R$ 1.099,62). Comparação de parcela também tem de bater com a mesa.
// ---------------------------------------------------------------------------------------------

/** "parcela menor/maior/mais baixa/mais alta/mais barata/mais cara/mais em conta (do) que …" */
const COMPARATIVO_DE_PARCELA =
	/(?:a\s+)?parcela\s+(menor|maior|mais\s+baixa|mais\s+alta|mais\s+barata|mais\s+cara|mais\s+em\s+conta)\s+(?:do\s+)?que\s+((?:[^.!?]|\.(?=\d))*)/i;
const PARCELA_MENOR = /menor|baixa|barata|em\s+conta/i;

const semAcento = (t: string) =>
	t
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

/** As cartas que a frase cita, na ordem: pela parcela (R$), ou pelo prazo (a administradora
 * desempata quando duas cartas têm o mesmo prazo). Citação ambígua não conta. */
function cartasCitadas(frase: string, mesa: readonly CartaDaMesa[]): CartaDaMesa[] {
	const achadas: { at: number; carta: CartaDaMesa }[] = [];
	const fraseSemAcento = semAcento(frase);
	for (const m of frase.matchAll(PARCELA)) {
		const valor = dinheiro(m[1] as string);
		const cartas = mesa.filter((c) => Math.abs(c.parcela - valor) < 0.005);
		if (cartas.length === 1) achadas.push({ at: m.index ?? 0, carta: cartas[0] as CartaDaMesa });
	}
	const prazos = [
		...[...frase.matchAll(PRAZO_COM_UNIDADE)].map((m) => ({ at: m.index ?? 0, n: Number(m[1]) })),
		...[...frase.matchAll(PRAZO_SEM_UNIDADE)].map((m) => ({
			at: (m.index ?? 0) + m[0].indexOf("de"),
			n: Number(m[1]),
		})),
	];
	for (const { at, n } of prazos) {
		let cartas = mesa.filter((c) => c.prazoMeses === n);
		if (cartas.length > 1) {
			cartas = cartas.filter(
				(c) => c.administradora && fraseSemAcento.includes(semAcento(c.administradora)),
			);
		}
		if (cartas.length === 1) achadas.push({ at, carta: cartas[0] as CartaDaMesa });
	}
	achadas.sort((a, b) => a.at - b.at);
	const unicas: CartaDaMesa[] = [];
	for (const { carta } of achadas) if (!unicas.includes(carta)) unicas.push(carta);
	return unicas;
}

/** "a outra da ÂNCORA", "a da CANOPUS": a carta da administradora que NÃO é o sujeito. */
function cartaPelaAdministradora(
	trecho: string,
	mesa: readonly CartaDaMesa[],
	sujeito: CartaDaMesa,
): CartaDaMesa | undefined {
	const t = semAcento(trecho);
	const nomes = [
		...new Set(mesa.map((c) => c.administradora).filter((a): a is string => Boolean(a))),
	].filter((a) => t.includes(semAcento(a)));
	if (nomes.length !== 1) return undefined;
	const doNome = mesa.filter((c) => c.administradora === nomes[0] && c !== sujeito);
	return doNome.length === 1 ? doNome[0] : undefined;
}

/**
 * Verifica "parcela menor/maior … que …". DEVOLVE O TEXTO INALTERADO e conta como problema quando
 * a direção contradiz a mesa ou quando não dá para saber de qual carta se fala (sujeito ou
 * referência fora da mesa). A conduta manda a fala bater com a mesa; o sinal mede o caso.
 */
function verificarComparacaoDeParcela(
	texto: string,
	mesa: readonly CartaDaMesa[],
): { texto: string; problemas: number } {
	if (!texto || !COMPARATIVO_DE_PARCELA.test(texto)) return { texto, problemas: 0 };
	const frases = frasesDe(texto);
	let problemas = 0;

	frases.forEach((frase, i) => {
		const achado = COMPARATIVO_DE_PARCELA.exec(frase);
		if (!achado) return;
		const [, direcao, referenciaEscrita] = achado as unknown as [string, string, string];
		const antes = frase.slice(0, achado.index);

		// O sujeito: a última carta citada ANTES do comparativo na frase, ou na frase anterior
		// mais próxima que cite uma.
		let sujeito = cartasCitadas(antes, mesa).at(-1);
		for (let k = i - 1; k >= 0 && !sujeito; k--) {
			sujeito = cartasCitadas(frases[k] ?? "", mesa).at(-1);
		}
		// A referência: a carta citada na própria oração ("que a de R$ 1.099,62") ou a outra da
		// administradora ("que a outra da ÂNCORA").
		const referencia = sujeito
			? (cartasCitadas(referenciaEscrita, mesa).at(-1) ??
				cartaPelaAdministradora(referenciaEscrita, mesa, sujeito))
			: undefined;

		if (!sujeito || !referencia || sujeito === referencia) {
			problemas += 1;
			return;
		}

		const afirmaMenor = PARCELA_MENOR.test(direcao);
		if (afirmaMenor !== sujeito.parcela < referencia.parcela) problemas += 1;
	});

	return { texto, problemas };
}

/** Verifica a comparação de parcela e emite o sinal. Fala sai INALTERADA. */
export function corrigirComparacaoDeParcela(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] } = { cartasDaMesa: [] },
): string {
	const { texto: inalterado, problemas } = verificarComparacaoDeParcela(texto, args.cartasDaMesa);
	publicarSinal(problemas);
	return inalterado;
}

// ---------------------------------------------------------------------------------------------
// PRAZO INVENTADO — conversa de teste de 28/10: "a menor parcela é da ÂNCORA, mas o prazo é de
// 100 meses". A ÂNCORA da mesa tem 114 e 94; não existe carta de 100. Prazo dito sobre a oferta
// tem de ser o de uma carta da mesa — o que não é, é invenção: sinal, sem tocar a fala.
// ---------------------------------------------------------------------------------------------

/** "…, mas o prazo é de 100 meses" / "o prazo fica em 100 meses": o prazo ESCRITO como atributo. */
const PRAZO_COMO_ATRIBUTO =
	/(\s*[,;]?\s*(?:mas\s+|e\s+|por[ée]m\s+)?)\bo\s+prazo\s+(?:dela\s+|dele\s+)?(?:[ée]|fica|seria|ser[áa]|são|ficaria)?\s*(?:de|em|por)?\s*(\d{2,3})\s*(?:meses|m[êe]s)\b/i;

/** "A da ÂNCORA tem 100 meses", "a CANOPUS com 100 meses", "prazo de 100 meses": o prazo dito como
 * característica da carta. Só vale de 36 meses para cima (prazo de consórcio) — "contemplado em
 * 12 meses" não é prazo de carta. */
const PRAZO_DITO_DA_CARTA =
	/(?<![A-Za-zÀ-ÿ])(tem|com|prazo\s+de|[ée]\s+de|s[ãa]o\s+de|fica\s+em|ficam\s+em)\s+(\d{2,3})\s*(?:meses|m[êe]s)\b/i;
/** "A diferença é de 4 meses" / "diferença de prazo de 4 meses". */
const DIFERENCA_DE_PRAZO =
	/diferen[çc]a\s+(?:de\s+prazo\s+)?(?:[ée]\s+de|de|entre\s+[^.!?]*?\s+[ée]\s+de)\s+(\d{1,3})\s*(?:meses|m[êe]s)/i;
const MENCIONA_A_OFERTA = /parcela|prazo|carta|recomend|op[çc][ãa]o|cota|grupo/i;

/**
 * Verifica os prazos ditos na fala contra a mesa. DEVOLVE O TEXTO INALTERADO e conta como problema
 * cada prazo que não é de carta nenhuma da mesa (invenção) ou que contradiz o prazo da carta que a
 * própria frase identifica. Sem cartas na mesa, não há o que conferir: nenhum problema.
 */
function verificarPrazoInventado(
	texto: string,
	mesa: readonly CartaDaMesa[],
): { texto: string; problemas: number } {
	if (!texto || mesa.length === 0) return { texto, problemas: 0 };
	const prazos = new Set(mesa.map((c) => c.prazoMeses));
	let problemas = 0;
	for (const frase of frasesDe(texto)) {
		const atributo = PRAZO_COMO_ATRIBUTO.exec(frase);
		if (atributo && !prazos.has(Number(atributo[2]))) {
			problemas += 1;
			continue;
		}

		// "A diferença é de 4 meses": só é verdade se algum PAR de cartas da mesa difere assim.
		const diferenca = DIFERENCA_DE_PRAZO.exec(frase);
		if (diferenca) {
			const possiveis = new Set<number>();
			for (const a of prazos) for (const b of prazos) if (a !== b) possiveis.add(Math.abs(a - b));
			if (!possiveis.has(Number(diferenca[1]))) {
				problemas += 1;
				continue;
			}
		}

		// Cada "tem/é de/com N meses" da frase é conferido (a frase pode citar duas cartas).
		const fala = semAcento(frase);
		const citaAAdministradora = mesa.some(
			(c) => c.administradora && fala.includes(semAcento(c.administradora)),
		);
		if (!MENCIONA_A_OFERTA.test(frase) && !citaAAdministradora) continue;
		for (const m of frase.matchAll(new RegExp(PRAZO_DITO_DA_CARTA.source, "gi"))) {
			const dissePrazo = Number(m[2]);
			if (dissePrazo < 36) continue;
			// A carta que a frase identifica: pela parcela, ou pela administradora que só tem uma.
			const semEste = frase.replace(m[0], " ");
			const identificada =
				cartasCitadasPelaParcela(semEste, mesa) ?? cartaUnicaDaAdministradora(semEste, mesa);
			// Certo = é o prazo da carta identificada; sem identificar, basta existir na mesa.
			const certo = identificada ? identificada.prazoMeses === dissePrazo : prazos.has(dissePrazo);
			if (!certo) problemas += 1;
		}
	}
	return { texto, problemas };
}

/** Verifica os prazos ditos contra a mesa e emite o sinal. Fala sai INALTERADA. */
export function semPrazoInventado(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] },
): string {
	const { texto: inalterado, problemas } = verificarPrazoInventado(texto, args.cartasDaMesa);
	publicarSinal(problemas);
	return inalterado;
}

/** A carta que a frase identifica pela parcela em R$ (única), se houver. */
function cartasCitadasPelaParcela(
	frase: string,
	mesa: readonly CartaDaMesa[],
): CartaDaMesa | undefined {
	for (const m of frase.matchAll(PARCELA)) {
		const valor = dinheiro(m[1] as string);
		const cartas = mesa.filter((c) => Math.abs(c.parcela - valor) < 0.005);
		if (cartas.length === 1) return cartas[0];
	}
	return undefined;
}

/** A administradora citada na frase tem UMA carta só na mesa? Então é essa. */
function cartaUnicaDaAdministradora(
	frase: string,
	mesa: readonly CartaDaMesa[],
): CartaDaMesa | undefined {
	const t = semAcento(frase);
	const nomes = [
		...new Set(mesa.map((c) => c.administradora).filter((a): a is string => Boolean(a))),
	].filter((a) => t.includes(semAcento(a)));
	if (nomes.length !== 1) return undefined;
	const dela = mesa.filter((c) => c.administradora === nomes[0]);
	return dela.length === 1 ? dela[0] : undefined;
}

/**
 * As duas réguas juntas, em VERIFICAÇÃO: nenhuma reescrita, nenhum corte — a fala sai INALTERADA.
 * O sinal `fala_contradiz_mesa` (NUMERIC, onde="remendos-fala") carrega o total de comparações
 * problemáticas de todas as três conferências. `montarTrechoDeSaida` chama; o call site sai na
 * onda 2.
 */
export function corrigirComparacoes(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] },
): string {
	const prazo = verificarComparacaoDePrazo(texto, args.cartasDaMesa);
	const parcela = verificarComparacaoDeParcela(prazo.texto, args.cartasDaMesa);
	const inventado = verificarPrazoInventado(parcela.texto, args.cartasDaMesa);
	publicarSinal(prazo.problemas + parcela.problemas + inventado.problemas);
	return inventado.texto;
}
