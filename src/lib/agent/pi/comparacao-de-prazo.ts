// COMPARAÇÃO DE PRAZO SÓ COM O NÚMERO DA MESA — invariante de FATO, não de tom.
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
// prazo", "maior prazo") e confere contra os prazos REAIS das cartas que estão na mesa. Se a
// direção estiver trocada, corrige a palavra; se o prazo citado não existir em carta nenhuma da
// mesa, o número é invenção e a comparação sai; se não dá para saber de quem se fala, a comparação
// também sai (não se afirma o que não se pode conferir).
//
// Não é guarda de fala do agente (o `AGENTS.md` proíbe regex de tom, repetição e fluidez): é a
// mesma família do "número sem lastro" — comparação verificável contra o dado da ferramenta.

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
	// A mesma carta citada pela parcela e pelo prazo na mesma frase é UMA menção só.
	const semRepetir: Mencao[] = [];
	for (const m of achadas) {
		if (!semRepetir.some((x) => x.prazo === m.prazo)) semRepetir.push(m);
	}
	return semRepetir;
}

/**
 * Corrige a comparação de prazo de um texto.
 *
 * O SUJEITO é a primeira menção da frase; a REFERÊNCIA é a última. Frase com uma menção só ("Ela
 * tem prazo mais curto que a de 94 meses") herda o sujeito da frase anterior mais próxima que
 * cite uma carta ("A da CANOPUS com parcela de R$ 1.176,39…").
 */
export function corrigirComparacaoDePrazo(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] } = { cartasDaMesa: [] },
): string {
	if (!texto || (!MAIS_CURTO.test(texto) && !MAIS_LONGO.test(texto))) return texto;
	const mesa = args.cartasDaMesa;
	const prazosDaMesa = new Set(mesa.map((c) => c.prazoMeses));
	const frases = frasesDe(texto);

	return frases
		.map((frase, i) => {
			const curto = MAIS_CURTO.test(frase);
			const longo = MAIS_LONGO.test(frase);
			if (!curto && !longo) return frase;

			// Prazo ESCRITO que não é de carta nenhuma da mesa: o número é invenção.
			const escritos = [
				...[...frase.matchAll(PRAZO_COM_UNIDADE)].map((m) => Number(m[1])),
				...[...frase.matchAll(PRAZO_SEM_UNIDADE)].map((m) => Number(m[1])),
			];
			if (escritos.some((p) => !prazosDaMesa.has(p))) return semComparativo(frase);

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

			// Sem os dois prazos não há como provar a direção: a comparação sai.
			if (sujeito === undefined || referencia === undefined) return semComparativo(frase);
			if (sujeito === referencia) return frase;

			const afirmaCurto = curto && !longo;
			if (afirmaCurto === sujeito < referencia) return frase;

			// Direção trocada: a palavra certa é a outra.
			return curto
				? frase.replace(MAIS_CURTO, (m) => trocarSentido(m, "longo"))
				: frase.replace(MAIS_LONGO, (m) => trocarSentido(m, "curto"));
		})
		.join(" ");
}

function trocarSentido(achado: string, sentido: "curto" | "longo"): string {
	const minusculo = achado.toLowerCase();
	if (minusculo.includes("mais")) return `mais ${sentido}`;
	if (minusculo.includes("menor") || minusculo.includes("maior"))
		return sentido === "curto" ? "menor prazo" : "maior prazo";
	return `prazo ${sentido === "curto" ? "menor" : "maior"}`;
}

/** Tira o comparativo da frase, mantendo o fato que ela carrega. */
function semComparativo(frase: string): string {
	return frase
		.replace(
			/\s*,?\s*(?:com|de|que tem)?\s*(?:prazo|tempo)?\s*(?:mais\s+(?:curto|longo)|menor|maior)\s*(?:prazo|tempo)?\s*(?:que|do que)\s+[^.!?]{0,40}?\d{2,3}\s*(?:meses|m[êe]s)[^.!?]*/gi,
			"",
		)
		.replace(/\s{2,}/g, " ")
		.trim();
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
 * Confere "parcela menor/maior … que …". Direção trocada e verificável → troca a palavra; não dá
 * para saber de qual carta se fala (ou a referência não está na mesa) → a oração comparativa sai e
 * a frase continua só com o que é fato.
 */
export function corrigirComparacaoDeParcela(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] } = { cartasDaMesa: [] },
): string {
	if (!texto || !COMPARATIVO_DE_PARCELA.test(texto)) return texto;
	const mesa = args.cartasDaMesa;
	const frases = frasesDe(texto);
	return frases
		.map((frase, i) => {
			const achado = COMPARATIVO_DE_PARCELA.exec(frase);
			if (!achado) return frase;
			const [inteiro, direcao, referenciaEscrita] = achado as unknown as [string, string, string];
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

			if (!sujeito || !referencia || sujeito === referencia) return tirarOracao(frase, inteiro);

			const afirmaMenor = PARCELA_MENOR.test(direcao);
			if (afirmaMenor === sujeito.parcela < referencia.parcela) return frase;
			// Direção trocada: a parcela dela é o oposto do que a fala disse.
			const oposta = afirmaMenor ? "parcela maior" : "parcela menor";
			return frase.replace(
				/(?:a\s+)?parcela\s+(?:menor|maior|mais\s+baixa|mais\s+alta|mais\s+barata|mais\s+cara|mais\s+em\s+conta)/i,
				oposta,
			);
		})
		.join(" ");
}

/** Tira a oração comparativa ("e parcela menor que a outra da ÂNCORA") e deixa o resto da frase. */
function tirarOracao(frase: string, oracao: string): string {
	const i = frase.indexOf(oracao);
	if (i < 0) return frase;
	// O que sobra de antes perde o conectivo pendurado ("…o menor prazo e" / ", com").
	const antes = frase.slice(0, i).replace(/\s*,?\s*\b(?:e|com)\s*$/i, "");
	return `${antes}${frase.slice(i + oracao.length)}`.replace(/\s+([,.;:!?])/g, "$1").trim();
}

// ---------------------------------------------------------------------------------------------
// PRAZO INVENTADO — conversa de teste de 28/10: "a menor parcela é da ÂNCORA, mas o prazo é de
// 100 meses". A ÂNCORA da mesa tem 114 e 94; não existe carta de 100. Prazo dito sobre a oferta tem
// de ser o de uma carta da mesa — o que não é, sai da fala (a frase continua só com o fato).
// ---------------------------------------------------------------------------------------------

/** "…, mas o prazo é de 100 meses" / "o prazo fica em 100 meses": o prazo ESCRITO como atributo. */
const PRAZO_COMO_ATRIBUTO =
	/(\s*[,;]?\s*(?:mas\s+|e\s+|por[ée]m\s+)?)\b(?:o\s+)?prazo\s+(?:dela\s+|dele\s+)?(?:[ée]|fica|seria|ser[áa]|são|ficaria)?\s*(?:de|em|por)?\s*(\d{2,3})\s*(?:meses|m[êe]s)\b/i;

/** Tira da fala o prazo-atributo que não é de carta nenhuma da mesa. Sem cartas na mesa, não faz nada. */
export function semPrazoInventado(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] },
): string {
	if (!texto || args.cartasDaMesa.length === 0) return texto;
	const prazos = new Set(args.cartasDaMesa.map((c) => c.prazoMeses));
	return frasesDe(texto)
		.map((frase) => {
			const m = PRAZO_COMO_ATRIBUTO.exec(frase);
			if (!m || prazos.has(Number(m[2]))) return frase;
			const inicio = m.index;
			const fim = inicio + m[0].length;
			const antes = frase.slice(0, inicio).trim();
			// O prazo era a frase inteira ("O prazo é de 100 meses."): a frase sai.
			if (!antes || /:$/.test(antes)) return antes.replace(/:$/, "").trim();
			const depois = frase.slice(fim).replace(/^[\s,]*(?:que\s+)?[^.!?]*?(?=[.!?]|$)/, "");
			return `${antes}${depois}`.replace(/\s+([,.;:!?])/g, "$1").trim();
		})
		.filter((f) => f.length > 0)
		.join(" ");
}

/** As duas réguas juntas — o que `montarTrechoDeSaida` aplica ao balão. */
export function corrigirComparacoes(
	texto: string,
	args: { cartasDaMesa: readonly CartaDaMesa[] },
): string {
	return corrigirComparacaoDeParcela(
		corrigirComparacaoDePrazo(semPrazoInventado(texto, args), args),
		args,
	);
}
