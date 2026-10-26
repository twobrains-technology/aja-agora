// A NARRAÇÃO DA FERRAMENTA — o card fala por si (R5.1).
//
// Medido no dev em 25/10/2026 com navegador real (`/tmp/aja-dono/ui/item0-04.png`):
// o vendedor anunciava a própria chamada de tool em volta do card — "Deixa eu
// mostrar os detalhes dela para você:" antes, "Pronto! Aí estão todos os
// números" depois. O padrão do dono é o card falar por si.
//
// A guarda é ESTREITA de propósito, e mora no harness como o verificador de "uma
// pergunta por mensagem": só cai um BALÃO INTEIRO cujo texto seja só anúncio de
// ferramenta, e só quando ele está colado a um card do MESMO turno (antes ou
// depois). Um balão com qualquer outra informação — número, pergunta, nome
// próprio, explicação — fica inteiro: cortar fala legítima é pior que ouvir o
// vendedor narrar a ferramenta.
//
// O casamento é por VOCABULÁRIO FECHADO, não por regex de frase: qualquer
// palavra fora do anúncio já conta como informação. É o que mantém
// "Deixa eu te explicar como funciona o lance" e "Pronto, Marcos! Sua proposta
// está gerada" fora da guarda.

/** Anúncio comprido é fala, não etiqueta de passo. */
const LIMITE_DE_CARACTERES = 120;

/** As palavras de um anúncio de ferramenta — "deixa eu buscar", "vou mostrar",
 * "um segundo", "pronto", "aí estão os números". */
const VOCABULARIO = new Set([
	// o pedido de licença
	"deixa",
	"deixe",
	"eu",
	"me",
	"te",
	// o passo
	"vou",
	"vamos",
	"mostrar",
	"mostrando",
	"mostro",
	"buscar",
	"buscando",
	"busco",
	"ver",
	"vejo",
	"conferir",
	"confiro",
	"olhar",
	"olho",
	"checar",
	"checo",
	"consultar",
	"consulto",
	"pegar",
	"pego",
	"puxar",
	"puxo",
	// o tempo do passo
	"um",
	"uma",
	"segundo",
	"segundos",
	"instante",
	"instantes",
	"momento",
	"momentinho",
	"ja",
	"agora",
	"rapidinho",
	"rapido",
	"so",
	"logo",
	"entao",
	// o que a ferramenta devolve
	"pronto",
	"ai",
	"aqui",
	"estao",
	"esta",
	"todo",
	"todos",
	"toda",
	"todas",
	"os",
	"as",
	"o",
	"a",
	"de",
	"da",
	"do",
	"das",
	"dos",
	"dela",
	"dele",
	"disso",
	"dessa",
	"desse",
	"em",
	"no",
	"na",
	"com",
	"pra",
	"para",
	"pro",
	"numeros",
	"numero",
	"opcoes",
	"opcao",
	"detalhes",
	"detalhe",
	"cartas",
	"carta",
	"valores",
	"valor",
	"simulacoes",
	"simulacao",
	"grupos",
	"grupo",
	"condicoes",
	"informacoes",
	"dados",
	"tabela",
	"tabelas",
	"resumo",
	"resultado",
	"resultados",
	"voce",
	"vc",
	"por",
	"favor",
]);

/** Sem uma destas, o balão não está anunciando nada: "as cartas" sozinho é uma
 * etiqueta da conversa, não um passo da ferramenta. */
const NUCLEO = new Set([
	"deixa",
	"deixe",
	"vou",
	"vamos",
	"pronto",
	"estao",
	"aqui",
	"ai",
	"segundo",
	"segundos",
	"instante",
	"instantes",
	"momento",
	"momentinho",
	"mostrar",
	"mostrando",
	"mostro",
	"buscar",
	"buscando",
	"busco",
	"ver",
	"vejo",
	"conferir",
	"confiro",
	"olhar",
	"olho",
	"checar",
	"checo",
	"consultar",
	"consulto",
	"pegar",
	"pego",
	"puxar",
	"puxo",
]);

/** Sem acento, sem maiúscula, sem pontuação: o balão comparado por palavra. */
function palavrasDoBalao(texto: string): string[] {
	return texto
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(" ")
		.filter(Boolean);
}

/** O BALÃO INTEIRO é anúncio de ferramenta? Serve de guarda só com a condição
 * de vizinhança (`criarNarracaoDoTurno`): um anúncio longe de card é a fala da
 * vez e fica.
 *
 * Número não precisa de veto próprio: dígito vira palavra fora do vocabulário
 * ("de 80 mil" não casa) — informação no balão sempre derruba o casamento. */
export function ehNarracaoDeFerramenta(texto: string): boolean {
	const balao = texto.trim();
	if (!balao || balao.length > LIMITE_DE_CARACTERES) return false;
	// Pergunta é fala, não anúncio ("Pronto?" espera resposta).
	if (balao.includes("?")) return false;
	const palavras = palavrasDoBalao(balao);
	if (palavras.length === 0) return false;
	if (!palavras.some((p) => NUCLEO.has(p))) return false;
	return palavras.every((p) => VOCABULARIO.has(p));
}

/** O turno visto pela guarda da narração: cada balão pronto passa por aqui antes
 * de ir para o canal, e o card avisa quando aparece.
 *
 * A ORDEM DOS FATOS é a do harness (`turno-livre.ts`): o balão fica pronto
 * quando a tool é chamada ou quando o beat acaba, e o card sai no RESULTADO da
 * ferramenta — o artifact é emitido ali, antes da fala que vem depois dela. Por
 * isso o anúncio fica SUSPENSO até o turno dizer se veio card — é a
 * única hora em que dá para saber se ele estava colado a um. Guardar é o que
 * impede a guarda de comer fala legítima de um turno sem card. */
export function criarNarracaoDoTurno() {
	let suspensa: string | null = null;
	let ultimoFoiCard = false;
	const soltarSuspensa = (): string[] => {
		const antes = suspensa === null ? [] : [suspensa];
		suspensa = null;
		return antes;
	};
	return {
		/** Um balão ficou pronto: devolve os balões a emitir AGORA, na ordem. */
		aoTexto(texto: string): string[] {
			if (!texto.trim()) return [];
			if (!ehNarracaoDeFerramenta(texto)) {
				ultimoFoiCard = false;
				return [...soltarSuspensa(), texto];
			}
			// Colado a um card que já saiu: o card já disse tudo.
			if (ultimoFoiCard) return [];
			// Um anúncio seguido de outro não estava colado ao card: o mais velho sai.
			const antes = soltarSuspensa();
			suspensa = texto;
			return antes;
		},
		/** O turno mostrou card: o anúncio suspenso estava colado a ele e cai.
		 * Devolve se havia um anúncio para cair — é o que diz que o turno FALOU,
		 * com o card no lugar da prosa. */
		mostrouCard(): boolean {
			const caiu = suspensa !== null;
			suspensa = null;
			ultimoFoiCard = true;
			return caiu;
		},
		/** O turno acabou sem card: o anúncio era a fala da vez e sai como fala. */
		fimDoTurno(): string[] {
			return soltarSuspensa();
		},
	};
}
