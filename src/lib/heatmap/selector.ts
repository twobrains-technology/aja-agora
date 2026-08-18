// src/lib/heatmap/selector.ts
//
// Identidade estável do elemento clicado. Roda no navegador, mas é PURO em
// relação ao DOM que recebe — dá pra provar com `happy-dom`, sem página real.
//
// Por que não usar o seletor CSS que o DevTools gera: ele carrega classe do
// Tailwind (`px-4 md:px-8 hover:bg-…`). Qualquer ajuste de espaçamento mudaria
// a identidade do MESMO botão, o histórico do mapa se partiria em dois alvos e
// a série de "cliques no CTA" reiniciaria do zero sem ninguém notar.
//
// O que se usa, em ordem de preferência: um id/atributo que o time escreveu de
// propósito (estável porque é intencional) e, na falta dele, o caminho
// estrutural até a seção (`section>div[1]>button[0]`), que só muda quando a
// estrutura muda de verdade.

/** Onde o caminho para de subir — a seção já identifica a região da página. */
const RAIZ = "[data-heat]";

/** Atributos que o time controla e que valem mais que qualquer caminho. */
const ATRIBUTOS_ESTAVEIS = ["data-heat-id", "data-testid", "id", "name"];

/** O que conta como alvo de um clique, mesmo que a batida caia num filho. */
const CLICAVEIS =
	"a,button,summary,input,select,textarea,label,[role=button],[role=link],[data-heat-id]";

/** Profundidade máxima do caminho. Segura o tamanho da coluna no banco. */
const MAX_NIVEIS = 6;

/**
 * Sobe do nó batido até o elemento que o visitante quis clicar.
 *
 * O clique quase nunca cai no botão: cai no `<span>` do rótulo ou no `<svg>` do
 * ícone dentro dele. Sem esta subida, o mesmo botão apareceria no painel
 * fatiado em três alvos diferentes.
 */
export function alvoDoClique(node: Element | null): Element | null {
	if (!node) return null;
	return node.closest(CLICAVEIS) ?? node;
}

/** A seção (`data-heat`) que contém o elemento. */
export function secaoDe(elemento: Element | null): string | null {
	return elemento?.closest(RAIZ)?.getAttribute("data-heat") ?? null;
}

function atributoEstavel(elemento: Element): string | null {
	for (const atributo of ATRIBUTOS_ESTAVEIS) {
		const valor = elemento.getAttribute(atributo);
		if (valor) return `${atributo === "id" ? "#" : `@${atributo}=`}${valor}`;
	}
	return null;
}

/** Posição do elemento entre os irmãos da MESMA tag — imune a irmão de outro tipo. */
function indiceEntreIrmaos(elemento: Element): number {
	const irmaos = elemento.parentElement?.children;
	if (!irmaos) return 0;

	let indice = 0;
	for (const irmao of Array.from(irmaos)) {
		if (irmao === elemento) return indice;
		if (irmao.tagName === elemento.tagName) indice += 1;
	}
	return indice;
}

/**
 * Caminho estável RELATIVO à seção. Para no primeiro atributo intencional que
 * encontrar, porque ele é mais forte que qualquer estrutura acima.
 *
 * A seção fica FORA do caminho de propósito: ela já é gravada em coluna própria,
 * e incluí-la aqui pelo índice entre irmãos (`div[3]>…`) faria mover uma seção
 * na página renomear todos os alvos das seções seguintes — o histórico do mapa
 * se partiria numa mudança de ordem que não mexeu em botão nenhum.
 */
export function caminhoEstavel(elemento: Element | null): string | null {
	if (!elemento) return null;

	const partes: string[] = [];
	let atual: Element | null = elemento;
	let niveis = 0;

	while (atual && niveis < MAX_NIVEIS) {
		if (atual.matches(RAIZ) || atual.tagName === "BODY") break;

		const ancora = atributoEstavel(atual);
		if (ancora) {
			partes.unshift(ancora);
			break;
		}

		partes.unshift(`${atual.tagName.toLowerCase()}[${indiceEntreIrmaos(atual)}]`);

		atual = atual.parentElement;
		niveis += 1;
	}

	return partes.length > 0 ? partes.join(">") : null;
}

/**
 * Texto visível do alvo, para o painel ficar legível.
 *
 * `aria-label` e `title` vêm antes do texto porque botão de ícone não tem texto
 * nenhum — e é justamente ele que apareceria como linha em branco na tabela.
 * A higienização de dado pessoal acontece no servidor (`sanitizeLabel`), que é
 * onde ela não depende de o navegador ter rodado a versão certa do script.
 */
export function rotuloDe(elemento: Element | null): string {
	if (!elemento) return "";

	const explicito =
		elemento.getAttribute("aria-label") ??
		elemento.getAttribute("title") ??
		elemento.getAttribute("alt");
	if (explicito) return explicito;

	// `input` não tem texto: o que identifica é o placeholder ou o tipo.
	if (elemento instanceof HTMLInputElement) {
		return elemento.placeholder || elemento.type || "input";
	}

	return (elemento.textContent ?? "").trim();
}
