// Escopo do que cada role ENXERGA e PODE MOVER no kanban.
//
// Isto é invariante de segurança, então mora em código puro — não em `hidden` no
// componente, não em `if` espalhado por rota. A tela é consequência da política;
// a política não é consequência da tela.
//
// A regra é ALLOWLIST: role desconhecida não vê nada e não move nada. Blocklist
// aqui significaria que toda role futura nasce com acesso total até alguém
// lembrar de negá-la.
//
// `mesa_externa` (2026-08-10): o atendente de mesa ganhou login. Ele conduz o
// caso que assumiu do fim do funil até o fechamento — e só isso. Não vê topo de
// funil, não vê lead de outro atendente, não declara perda.

import { describe, expect, it } from "vitest";
import { STAGE_ORDER } from "./lead-stages";
import { podeAcessarRota, podeMoverCard, raiasVisiveisPara, rotaInicialDe } from "./role-scope";

describe("raias visíveis por role", () => {
	it("mesa_externa vê o fim do funil inteiro, incluindo a saída por perda", () => {
		expect(raiasVisiveisPara("mesa_externa")).toEqual([
			"em_atendimento",
			"aguardando_pagamento",
			"fechado_ganho",
			"perdido",
		]);
	});

	it("mesa_externa NÃO vê topo de funil", () => {
		const visiveis = raiasVisiveisPara("mesa_externa");
		for (const proibida of [
			"novo",
			"engajado",
			"qualificado",
			"em_negociacao",
			"proposta_enviada",
			"na_administradora",
		]) {
			expect(visiveis).not.toContain(proibida);
		}
	});

	it("as raias da mesa externa saem na ordem do funil, não numa ordem própria", () => {
		const visiveis = raiasVisiveisPara("mesa_externa");
		const posicoes = visiveis.map((r) => STAGE_ORDER.indexOf(r));
		expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
	});

	it("admin continua vendo o funil inteiro", () => {
		expect(raiasVisiveisPara("admin")).toEqual([...STAGE_ORDER]);
	});

	it("role desconhecida não vê nada (allowlist, não blocklist)", () => {
		expect(raiasVisiveisPara("papel_que_nao_existe" as never)).toEqual([]);
	});
});

describe("movimento de card por role", () => {
	it("mesa_externa leva o caso adiante até o ganho", () => {
		expect(podeMoverCard("mesa_externa", "em_atendimento", "aguardando_pagamento")).toBe(true);
		expect(podeMoverCard("mesa_externa", "aguardando_pagamento", "fechado_ganho")).toBe(true);
		expect(podeMoverCard("mesa_externa", "em_atendimento", "fechado_ganho")).toBe(true);
	});

	// 2026-08-10 — o forward-only caiu (decisão do Kairo: "esse negócio de não
	// poder voltar atrás não existe, ele deve poder movimentar sempre"). A regra
	// tratava arrasto pra trás como acidente; na operação, corrigir uma
	// classificação errada é rotina, e a trava virava um erro sem saída na tela.
	// O que restringe agora é ESCOPO, não direção.
	it("mesa_externa move nos dois sentidos dentro do escopo dela", () => {
		expect(podeMoverCard("mesa_externa", "fechado_ganho", "em_atendimento")).toBe(true);
		expect(podeMoverCard("mesa_externa", "aguardando_pagamento", "em_atendimento")).toBe(true);
		expect(podeMoverCard("mesa_externa", "perdido", "em_atendimento")).toBe(true);
	});

	// Decisão do Kairo (2026-08-10), revendo a escolha inicial: sem uma saída por
	// perda, caso frustrado fica preso em atendimento pra sempre. E a perda vale
	// de QUALQUER raia dela, ganho inclusive — venda que cai depois de fechada é
	// real, e quem está atendendo é quem fica sabendo.
	it("mesa_externa marca perdido a partir de qualquer raia dela — inclusive de Ganho", () => {
		expect(podeMoverCard("mesa_externa", "em_atendimento", "perdido")).toBe(true);
		expect(podeMoverCard("mesa_externa", "aguardando_pagamento", "perdido")).toBe(true);
		expect(podeMoverCard("mesa_externa", "fechado_ganho", "perdido")).toBe(true);
	});

	it("caso dado como perdido pode ser retomado — engano acontece", () => {
		expect(podeMoverCard("mesa_externa", "perdido", "fechado_ganho")).toBe(true);
		expect(podeMoverCard("mesa_externa", "perdido", "aguardando_pagamento")).toBe(true);
	});

	it("mesa_externa não toca em raia que nem enxerga", () => {
		expect(podeMoverCard("mesa_externa", "novo", "engajado")).toBe(false);
		expect(podeMoverCard("mesa_externa", "proposta_enviada", "em_atendimento")).toBe(false);
		// Nem para dentro do escopo dele vindo de fora: quem transborda é o admin.
		expect(podeMoverCard("mesa_externa", "na_administradora", "em_atendimento")).toBe(false);
		// E não marca perdido um lead que não é dela nem está no escopo dela.
		expect(podeMoverCard("mesa_externa", "novo", "perdido")).toBe(false);
	});

	it("admin move o que quiser — a regra forward-only dele é do servidor, não desta política", () => {
		expect(podeMoverCard("admin", "novo", "qualificado")).toBe(true);
		expect(podeMoverCard("admin", "em_atendimento", "perdido")).toBe(true);
		expect(podeMoverCard("admin", "fechado_ganho", "novo")).toBe(true);
	});

	it("viewer não move nada — é leitura", () => {
		expect(podeMoverCard("viewer", "novo", "engajado")).toBe(false);
		expect(podeMoverCard("viewer", "em_atendimento", "fechado_ganho")).toBe(false);
	});

	it("role desconhecida não move nada", () => {
		expect(podeMoverCard("papel_que_nao_existe" as never, "novo", "engajado")).toBe(false);
	});
});

describe("acesso às telas do painel", () => {
	it("mesa_externa entra no pipeline e no próprio perfil", () => {
		expect(podeAcessarRota("mesa_externa", "/admin/pipeline")).toBe(true);
		expect(podeAcessarRota("mesa_externa", "/admin/profile")).toBe(true);
	});

	it("mesa_externa não alcança tela nenhuma de operação interna", () => {
		for (const rota of [
			"/admin",
			"/admin/performance",
			"/admin/conversations",
			"/admin/attendants",
			"/admin/atendentes-mesa",
			"/admin/administradoras",
			"/admin/personas",
			"/admin/whatsapp/templates",
			"/admin/simulator",
			"/admin/settings",
		]) {
			expect(podeAcessarRota("mesa_externa", rota), `${rota} deveria ser negada`).toBe(false);
		}
	});

	it("sub-rota herda a permissão do prefixo — e a negação também", () => {
		expect(podeAcessarRota("mesa_externa", "/admin/pipeline/qualquer-coisa")).toBe(true);
		expect(podeAcessarRota("mesa_externa", "/admin/personas/123/editar")).toBe(false);
	});

	it("prefixo não vaza por semelhança de nome", () => {
		// `/admin/pipeline-secreto` NÃO é sub-rota de `/admin/pipeline`.
		expect(podeAcessarRota("mesa_externa", "/admin/pipeline-secreto")).toBe(false);
	});

	it("admin entra em tudo", () => {
		expect(podeAcessarRota("admin", "/admin")).toBe(true);
		expect(podeAcessarRota("admin", "/admin/simulator")).toBe(true);
	});

	it("role desconhecida não entra em lugar nenhum", () => {
		expect(podeAcessarRota("papel_que_nao_existe" as never, "/admin/pipeline")).toBe(false);
	});

	it("cada role tem uma tela de chegada — a da mesa externa é o pipeline", () => {
		expect(rotaInicialDe("mesa_externa")).toBe("/admin/pipeline");
		expect(rotaInicialDe("admin")).toBe("/admin");
	});
});
