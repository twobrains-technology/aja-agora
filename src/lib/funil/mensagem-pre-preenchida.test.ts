// O dicionário da mensagem pré-preenchida — sem banco.
//
// A tabela de casos vem do diagnóstico de produção (§h): as seis primeiras
// variantes (carro/imóvel/moto, longa e curta, mais o "Oi! Quero comparar
// consórcios." do WhatsApp) somam 142 das 163 conversas web e todas as 11 do
// WhatsApp com uma única mensagem. É contra ESSA lista que o predicado é
// medido — e os três negativos que apareceram no banco no mesmo dia entram
// junto, porque um predicado que casa tudo não serve para nada.
//
// O segundo bloco prova que os textos são IMPORTADOS e não copiados: ele lê as
// constantes reais do conteúdo das landings e do chat, e falha se alguém
// reescrever a string num lado só.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { HERO_AUTO, UPGRADE_AUTO } from "@/app/(verticais)/autos/conteudo";
import { FGTS_IMOVEL, HERO_IMOVEL } from "@/app/(verticais)/imoveis/conteudo";
import { HERO_MOTO, PASSOS_MOTO } from "@/app/(verticais)/motos/conteudo";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { WELCOME_OPTIONS } from "@/lib/chat/welcome-options";
import {
	ehMensagemPrePreenchida,
	normalizarMensagem,
	sqlMensagemPrePreenchida,
	TEXTOS_PRE_PREENCHIDOS_WEB,
	TEXTOS_PRE_PREENCHIDOS_WHATSAPP,
} from "./mensagem-pre-preenchida";
import {
	CHIP_DE_BEM,
	PRIMEIRA_FALA_WHATSAPP,
	SEMENTE_BLOCO_FGTS,
	SEMENTE_BLOCO_MOTO_TRABALHO,
	SEMENTE_BLOCO_UPGRADE,
	SEMENTE_PARCELA_PREFIXO,
	SEMENTE_VALOR_PREFIXO,
	SEMENTES_DE_BLOCO,
	TITULO_CATEGORIA_WHATSAPP,
} from "./textos-do-cta";

describe("ehMensagemPrePreenchida — os textos que o produto escreve", () => {
	it("reconhece as variantes medidas em produção (web)", () => {
		const medidas = [
			"Quero comprar um carro.",
			"Quero comprar um imóvel.",
			"Quero comprar uma moto.",
			"Automóvel",
			"Imóvel",
			"Moto",
			"Quero um carro. Consigo pagar R$ 1.200/mês.",
		];
		for (const texto of medidas) {
			expect(ehMensagemPrePreenchida(texto, "web"), texto).toBe(true);
		}
	});

	it("reconhece a fala do link do WhatsApp", () => {
		expect(ehMensagemPrePreenchida("Oi! Quero comparar consórcios.", "whatsapp")).toBe(true);
	});

	it("reconhece o botão de categoria do WhatsApp, que também é gravado como mensagem", () => {
		expect(ehMensagemPrePreenchida("Carro", "whatsapp")).toBe(true);
		expect(ehMensagemPrePreenchida("Imóvel", "whatsapp")).toBe(true);
		expect(ehMensagemPrePreenchida("Moto", "whatsapp")).toBe(true);
	});

	it("reconhece as sementes dinâmicas pelo prefixo — o valor é variável", () => {
		for (const texto of [
			"Quero um carro de R$ 50.000.",
			"Quero um carro de R$ 200.000.",
			"Quero um imóvel de R$ 400.000.",
			"Quero uma moto de R$ 25.000.",
			"Quero um imóvel. Consigo pagar R$ 800/mês.",
			"Quero uma moto. Consigo pagar R$ 320/mês.",
		]) {
			expect(ehMensagemPrePreenchida(texto, "web"), texto).toBe(true);
		}
	});

	it("reconhece as sementes dos CTAs de bloco", () => {
		for (const texto of SEMENTES_DE_BLOCO) {
			expect(ehMensagemPrePreenchida(texto, "web"), texto).toBe(true);
		}
	});

	it("ignora espaço a mais e espaço no começo e no fim", () => {
		expect(normalizarMensagem("  Quero   comprar um carro.  ")).toBe("Quero comprar um carro.");
		expect(ehMensagemPrePreenchida("  Quero   comprar um carro. ", "web")).toBe(true);
		expect(ehMensagemPrePreenchida("\nOi! Quero comparar consórcios.\t", "whatsapp")).toBe(true);
	});

	it("NÃO casa o que o cliente digitou — os três negativos que apareceram no banco", () => {
		for (const texto of ["quero um carro de 80 mil no maximo", "90000", "oi"]) {
			expect(ehMensagemPrePreenchida(texto, "web"), texto).toBe(false);
			expect(ehMensagemPrePreenchida(texto, "whatsapp"), texto).toBe(false);
		}
	});

	it("NÃO casa fala parecida que o cliente escreveu de verdade", () => {
		for (const texto of [
			"Oi, quero comparar consórcios",
			"Automóvel novo",
			"Quero comprar um carro elétrico.",
			"meu imóvel",
			"",
			"   ",
		]) {
			expect(ehMensagemPrePreenchida(texto, "web"), texto).toBe(false);
		}
	});

	it("o prefixo cobre também a variante humana com maiúscula — limite aceito, e estreito", () => {
		// O preço do casamento por PREFIXO nas sementes dinâmicas: quem escreve
		// "Quero um carro de 80 mil no máximo." com Q maiúsculo casa, porque o
		// começo da frase é literalmente o do produto. A variante que apareceu em
		// produção (§h) é minúscula justamente porque ninguém copiou o CTA — e é
		// ela que os negativos acima cobrem. Trocar o prefixo por regex de formato
		// de valor só estreitaria a margem; o que decide é que a mensagem do
		// produto é INTEIRAMENTE gerada por `formatarReais`.
		expect(ehMensagemPrePreenchida("Quero um carro de 80 mil no máximo.", "web")).toBe(true);
	});
});

describe("sqlMensagemPrePreenchida — o mesmo predicado no banco", () => {
	/** A consulta que o fragmento produz — texto e parâmetros, sem tocar o banco. */
	function sqlDoPredicado() {
		return db
			.select()
			.from(messages)
			.where(sqlMensagemPrePreenchida(sql`${messages.content}`))
			.toSQL();
	}

	it("compara por igualdade o texto fixo e por LIKE o dinâmico", () => {
		const { sql: texto, params } = sqlDoPredicado();

		// Igualdade contra o fixo — os chips e o rótulo curto entram como parâmetro,
		// nunca colados no SQL.
		expect(texto).toContain(" IN (");
		expect(params).toContain("Quero comprar um carro.");
		expect(params).toContain("Automóvel");
		expect(params).toContain(PRIMEIRA_FALA_WHATSAPP);

		// Prefixo para a semente de valor, que carrega o número escolhido.
		expect(texto).toContain("LIKE");
		expect(params).toContain(`${SEMENTE_VALOR_PREFIXO.auto}%`);

		// O texto gravado é normalizado como a leitura de produção (espaço colapsado).
		expect(texto).toContain("regexp_replace");
	});

	it("todo texto pré-preenchido conhecido casa o fragmento", () => {
		// A prova de fogo é unitária e não toca o banco: cada constante do
		// dicionário é reconhecida pela função pura, que é a MESMA tabela de
		// strings que o fragmento SQL parametriza.
		for (const texto of TEXTOS_PRE_PREENCHIDOS_WEB) {
			expect(ehMensagemPrePreenchida(texto, "web"), texto).toBe(true);
		}
		for (const texto of TEXTOS_PRE_PREENCHIDOS_WHATSAPP) {
			expect(ehMensagemPrePreenchida(texto, "whatsapp"), texto).toBe(true);
		}
	});
});

describe("os textos são importados, não copiados", () => {
	it("a resposta do hero/landing é a mesma constante do dicionário", () => {
		expect(HERO_AUTO.sementeVazia).toBe(CHIP_DE_BEM.auto);
		expect(HERO_MOTO.sementeVazia).toBe(CHIP_DE_BEM.moto);
		expect(HERO_IMOVEL.sementeVazia).toBe(CHIP_DE_BEM.imovel);
	});

	it("a semente de parcela é prefixo + parcela + ponto final", () => {
		expect(HERO_AUTO.semente("R$ 1.200/mês")).toBe(`${SEMENTE_PARCELA_PREFIXO.auto}R$ 1.200/mês.`);
		expect(HERO_MOTO.semente("R$ 320/mês")).toBe(`${SEMENTE_PARCELA_PREFIXO.moto}R$ 320/mês.`);
		expect(HERO_IMOVEL.semente("R$ 800/mês")).toBe(`${SEMENTE_PARCELA_PREFIXO.imovel}R$ 800/mês.`);
	});

	it("a semente de valor é prefixo + valor + ponto final", () => {
		expect(HERO_AUTO.sementeDeValor("R$ 50.000")).toBe(`${SEMENTE_VALOR_PREFIXO.auto}R$ 50.000.`);
		expect(HERO_MOTO.sementeDeValor("R$ 25.000")).toBe(`${SEMENTE_VALOR_PREFIXO.moto}R$ 25.000.`);
		expect(HERO_IMOVEL.sementeDeValor("R$ 400.000")).toBe(
			`${SEMENTE_VALOR_PREFIXO.imovel}R$ 400.000.`,
		);
	});

	it("os rótulos curtos do chat web saem da fonte única do welcome", () => {
		const rotulos = WELCOME_OPTIONS.map((o) => o.label);
		expect(rotulos).toEqual(["Imóvel", "Automóvel", "Moto"]);
		for (const rotulo of rotulos) {
			expect(ehMensagemPrePreenchida(rotulo, "web"), rotulo).toBe(true);
		}
	});

	it("as sementes dos CTAs de bloco são as mesmas constantes dos blocos da landing", () => {
		expect(FGTS_IMOVEL.semente).toBe(SEMENTE_BLOCO_FGTS);
		expect(UPGRADE_AUTO.semente).toBe(SEMENTE_BLOCO_UPGRADE);
		expect(PASSOS_MOTO.semente).toBe(SEMENTE_BLOCO_MOTO_TRABALHO);
	});

	it("a fala do WhatsApp é a mesma constante usada no link", () => {
		expect(PRIMEIRA_FALA_WHATSAPP).toBe("Oi! Quero comparar consórcios.");
		expect(Object.values(TITULO_CATEGORIA_WHATSAPP)).toEqual(["Imóvel", "Carro", "Moto"]);
	});
});
