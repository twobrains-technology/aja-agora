// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { alvoDoClique, caminhoEstavel, rotuloDe, secaoDe } from "./selector";

function montar(html: string) {
	document.body.innerHTML = html;
}

beforeEach(() => {
	document.body.innerHTML = "";
});

describe("alvoDoClique", () => {
	it("sobe do ícone até o botão — é o botão que o visitante quis clicar", () => {
		// Sem esta subida o MESMO botão apareceria fatiado no painel: uma linha pro
		// span do rótulo, outra pro svg do ícone, outra pro próprio botão.
		montar(`<button id="cta"><svg id="ico"></svg><span id="txt">Simular</span></button>`);

		expect(alvoDoClique(document.getElementById("txt"))?.id).toBe("cta");
		expect(alvoDoClique(document.getElementById("ico"))?.id).toBe("cta");
	});

	it("devolve o próprio elemento quando o clique cai fora de algo clicável", () => {
		montar(`<div id="fundo">texto solto</div>`);

		expect(alvoDoClique(document.getElementById("fundo"))?.id).toBe("fundo");
	});

	it("aceita null sem quebrar", () => {
		expect(alvoDoClique(null)).toBeNull();
	});
});

describe("secaoDe", () => {
	it("acha a seção que contém o elemento", () => {
		montar(`<div data-heat="kv-hero"><div><button id="b">ok</button></div></div>`);

		expect(secaoDe(document.getElementById("b"))).toBe("kv-hero");
	});

	it("devolve null fora de qualquer seção marcada", () => {
		montar(`<button id="b">ok</button>`);

		expect(secaoDe(document.getElementById("b"))).toBeNull();
	});
});

describe("caminhoEstavel", () => {
	it("prefere o atributo que o time escreveu de propósito", () => {
		montar(`<div data-heat="kv-hero"><button data-heat-id="cta-hero">Simular</button></div>`);

		expect(caminhoEstavel(document.querySelector("button"))).toBe("@data-heat-id=cta-hero");
	});

	it("NÃO usa classe — trocar o Tailwind não pode partir a série do mesmo botão", () => {
		// É o defeito que este módulo existe para evitar: o seletor do DevTools
		// carregaria `px-4 md:px-8`, e um ajuste de espaçamento zeraria o histórico
		// de cliques do CTA sem ninguém perceber.
		montar(
			`<div data-heat="kv-hero"><button class="px-4 md:px-8 hover:bg-blue-500">Ir</button></div>`,
		);
		const antes = caminhoEstavel(document.querySelector("button"));

		montar(
			`<div data-heat="kv-hero"><button class="px-6 lg:px-12 hover:bg-red-500">Ir</button></div>`,
		);
		const depois = caminhoEstavel(document.querySelector("button"));

		expect(antes).toBe(depois);
		expect(antes).not.toContain("px-");
	});

	it("indexa entre irmãos da MESMA tag — irmão de outro tipo não desloca o índice", () => {
		montar(`
			<div data-heat="kv-tipos">
				<h2>Título</h2>
				<button>primeiro</button>
				<hr />
				<button>segundo</button>
			</div>
		`);

		const [primeiro, segundo] = Array.from(document.querySelectorAll("button"));

		expect(caminhoEstavel(primeiro)).toBe("button[0]");
		expect(caminhoEstavel(segundo)).toBe("button[1]");
	});

	it("para na seção — o caminho não sobe até o body nem inclui a própria seção", () => {
		montar(`<main><div data-heat="kv-faq"><div><button>ok</button></div></div></main>`);

		const caminho = caminhoEstavel(document.querySelector("button"));

		expect(caminho).toBe("div[0]>button[0]");
		expect(caminho).not.toContain("main");
	});

	it("não se parte quando uma seção é movida de lugar na página", () => {
		// Reordenar seções não mexe em botão nenhum. Se o caminho carregasse a
		// posição da seção, o painel trataria o MESMO botão como alvo novo e a
		// série de cliques recomeçaria do zero.
		montar(
			`<main><div data-heat="kv-hero"><button>Ir</button></div><div data-heat="kv-faq"></div></main>`,
		);
		const antes = caminhoEstavel(document.querySelector("button"));

		montar(
			`<main><div data-heat="kv-faq"></div><div data-heat="kv-hero"><button>Ir</button></div></main>`,
		);
		const depois = caminhoEstavel(document.querySelector("button"));

		expect(antes).toBe(depois);
	});

	it("distingue dois botões em seções diferentes", () => {
		montar(`
			<div data-heat="kv-hero"><button>Simular</button></div>
			<div data-heat="kv-footer"><button>Simular</button></div>
		`);

		const [hero, footer] = Array.from(document.querySelectorAll("button")).map(caminhoEstavel);

		// Mesma posição estrutural dentro de seções distintas: é a seção gravada
		// junto no evento que os separa no painel, não o caminho.
		expect(hero).toBe(footer);
		expect(secaoDe(document.querySelectorAll("button")[0])).toBe("kv-hero");
		expect(secaoDe(document.querySelectorAll("button")[1])).toBe("kv-footer");
	});

	it("aceita null sem quebrar", () => {
		expect(caminhoEstavel(null)).toBeNull();
	});
});

describe("rotuloDe", () => {
	it("usa o texto visível", () => {
		montar(`<button>  Simular agora </button>`);

		expect(rotuloDe(document.querySelector("button"))).toBe("Simular agora");
	});

	it("usa aria-label quando o botão é só ícone — senão vira linha em branco na tabela", () => {
		montar(`<button aria-label="Abrir o chat"><svg></svg></button>`);

		expect(rotuloDe(document.querySelector("button"))).toBe("Abrir o chat");
	});

	it("identifica input pelo placeholder, nunca pelo que foi digitado", () => {
		montar(`<input placeholder="Seu WhatsApp" value="62999998888" />`);

		const rotulo = rotuloDe(document.querySelector("input"));

		expect(rotulo).toBe("Seu WhatsApp");
		expect(rotulo).not.toContain("62999998888");
	});

	it("devolve vazio pra elemento ausente", () => {
		expect(rotuloDe(null)).toBe("");
	});
});
