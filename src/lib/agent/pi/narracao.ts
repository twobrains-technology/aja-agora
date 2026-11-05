// A NARRAÇÃO DA FERRAMENTA — medida, não corte (P11).
//
// Medido no dev em 25/10/2026 com navegador real (`/tmp/aja-dono/ui/item0-04.png`):
// o vendedor anunciava a própria chamada de tool em volta do card — "Deixa eu
// mostrar os detalhes dela para você:" antes, "Pronto! Aí estão todos os
// números" depois. O padrão do dono é o card falar por si.
//
// Desde a P11 (`docs/design/planos/2026-11-05-remendos-fala-p11.md`, item 13)
// isto é DETECTOR, não guarda: o corte de fala em código saiu. Nenhum balão é
// suspenso nem suprimido — quem decide não anunciar o card é a conduta (sufixo
// do prompt). O que fica é a medida: quando um balão casa com o vocabulário
// fechado de anúncio de ferramenta, emite o sinal `narracao_de_ferramenta`
// (`[sinal]`) para o dono ler a ocorrência em vez de ter a fala escondida.
import { publicarScores } from "@/lib/observability/sinais/publicar";

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

/** O BALÃO INTEIRO é anúncio de ferramenta? É detector puro: decide só o sinal,
 * nunca corta fala. */
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

/** O turno visto pela medida da narração: cada balão pronto passa por aqui e
 * segue para o canal EXATAMENTE como saiu do modelo (P11 — fala é do prompt).
 * O detector só emite o sinal `narracao_de_ferramenta` quando um balão casa com
 * o vocabulário de anúncio. Nada aqui derruba o turno. */
export function criarNarracaoDoTurno() {
	const anunciar = (texto: string): void => {
		if (!ehNarracaoDeFerramenta(texto)) return;
		publicarScores(
			[{ name: "narracao_de_ferramenta", value: 1, dataType: "BOOLEAN" }],
			"remendos-fala",
		);
	};
	return {
		/** Um balão ficou pronto: sai inteiro, sempre. */
		aoTexto(texto: string): string[] {
			if (!texto.trim()) return [];
			anunciar(texto);
			return [texto];
		},
		/** No-op: o card nunca mais silencia fala. */
		mostrouCard(): boolean {
			return false;
		},
		/** O turno acabou: nada pendente — todo balão já saiu. */
		fimDoTurno(): string[] {
			return [];
		},
	};
}
