// O cadastro da dinâmica do remarketing — os três casos que enganam, provados.
//
// O que este arquivo tranca, em ordem de importância:
//
//   1. SEM LINHA, o valor é o da constante. É o que faz a tabela nascer vazia
//      sem mudar comportamento nenhum — se isto inverter, o deploy do cadastro
//      muda a régua sozinho.
//   2. COM LINHA, o valor é o do banco — e a origem diz "cadastro".
//   3. VALOR CORROMPIDO não derruba o motor: cai no padrão e a tela avisa. Um
//      teto lido como texto não pode virar "dispara para quem pediu para sair".
//
// Nada aqui toca Postgres: a montagem é pura (`montarLeitura`) e recebe as
// linhas como um `select` as devolveria. O que se prova é a leitura, não o I/O.

import { describe, expect, it } from "vitest";
import {
	CAMPOS_COM_CADASTRO,
	chaveDoCampo,
	limiteNaTela,
	montarLeitura,
	PARAMETROS_DO_CADASTRO,
	validarEntradas,
} from "@/lib/admin/remarketing-config";
import {
	CAMPOS_DOS_PARAMETROS,
	normalizarParametros,
	PARAMETROS_DE_FABRICA,
} from "@/lib/remarketing/regua";

const DIA_MS = 24 * 60 * 60 * 1000;

describe("o cadastro nasce vazio e não muda nada", () => {
	it("(a) sem linha, cada parâmetro é o da constante de fábrica", () => {
		const leitura = montarLeitura([]);

		expect(leitura.parametros).toEqual(PARAMETROS_DE_FABRICA);
		expect(leitura.parametros.esperaSilencioMs).toBe(90 * 60 * 1000);
		expect(leitura.parametros.diasAteSegundoToque).toBe(3);
		expect(leitura.parametros.diasAteTerceiroToque).toBe(5);
		expect(leitura.parametros.maxToques).toBe(3);
		expect(leitura.parametros.tetoToques30Dias).toBe(3);
		expect(leitura.parametros.janelaDoTetoMs).toBe(30 * DIA_MS);
		expect(leitura.parametros.horaAbertura).toBe(9);
		expect(leitura.parametros.horaFechamento).toBe(20);
	});

	it("(a) e a tela diz, em cada linha, que o valor é padrão de fábrica", () => {
		for (const vigente of montarLeitura([]).vigentes) {
			expect(vigente.origem, vigente.chave).toBe("fabrica");
			expect(vigente.valorInvalido, vigente.chave).toBeNull();
		}
	});

	it("o cadastro cobre exatamente os oito campos da régua", () => {
		expect([...CAMPOS_COM_CADASTRO].sort()).toEqual([...CAMPOS_DOS_PARAMETROS].sort());
		for (const campo of CAMPOS_DOS_PARAMETROS) {
			expect(chaveDoCampo(campo), campo).toBeTypeOf("string");
		}
		expect(PARAMETROS_DO_CADASTRO).toHaveLength(CAMPOS_DOS_PARAMETROS.length);
	});

	it("toda chave do cadastro é snake_case de banco (sem acento, sem espaço)", () => {
		for (const def of PARAMETROS_DO_CADASTRO) {
			expect(def.chave).toMatch(/^[a-z][a-z0-9_]*$/);
		}
	});
});

describe("com linha, o banco manda — na unidade humana, convertida uma vez só", () => {
	it("(b) o valor do banco vence a constante e a origem vira 'cadastro'", () => {
		const leitura = montarLeitura([
			{ chave: "espera_silencio_minutos", valor: "30" },
			{ chave: "dias_ate_segundo_toque", valor: "1" },
			{ chave: "dias_ate_terceiro_toque", valor: "2" },
			{ chave: "max_toques", valor: "2" },
			{ chave: "teto_toques_30_dias", valor: "2" },
			{ chave: "janela_do_teto_dias", valor: "15" },
			{ chave: "hora_abertura", valor: "8" },
			{ chave: "hora_fechamento", valor: "21" },
		]);

		expect(leitura.parametros).toEqual({
			esperaSilencioMs: 30 * 60 * 1000,
			diasAteSegundoToque: 1,
			diasAteTerceiroToque: 2,
			maxToques: 2,
			tetoToques30Dias: 2,
			janelaDoTetoMs: 15 * DIA_MS,
			horaAbertura: 8,
			horaFechamento: 21,
		});

		for (const vigente of leitura.vigentes) {
			expect(vigente.origem, vigente.chave).toBe("cadastro");
		}

		// Na TELA o valor volta para a unidade humana: 30 minutos, não 1800000.
		const espera = leitura.vigentes.find((v) => v.chave === "espera_silencio_minutos");
		expect(espera?.valor).toBe(30);
		const janela = leitura.vigentes.find((v) => v.chave === "janela_do_teto_dias");
		expect(janela?.valor).toBe(15);
	});

	it("linha de chave desconhecida é ignorada, não quebra a leitura", () => {
		const leitura = montarLeitura([
			{ chave: "parametro_que_nao_existe_mais", valor: "7" },
			{ chave: "max_toques", valor: "2" },
		]);

		expect(leitura.parametros.maxToques).toBe(2);
		expect(leitura.parametros.tetoToques30Dias).toBe(PARAMETROS_DE_FABRICA.tetoToques30Dias);
	});
});

describe("valor corrompido no banco não derruba o motor — cai no padrão", () => {
	it("(c) texto onde se espera número cai no padrão e a tela avisa", () => {
		const leitura = montarLeitura([
			{ chave: "max_toques", valor: "três" },
			{ chave: "teto_toques_30_dias", valor: "" },
			{ chave: "dias_ate_segundo_toque", valor: "3.5" },
			{ chave: "espera_silencio_minutos", valor: "noventa" },
		]);

		expect(leitura.parametros.maxToques).toBe(PARAMETROS_DE_FABRICA.maxToques);
		expect(leitura.parametros.tetoToques30Dias).toBe(PARAMETROS_DE_FABRICA.tetoToques30Dias);
		expect(leitura.parametros.diasAteSegundoToque).toBe(PARAMETROS_DE_FABRICA.diasAteSegundoToque);
		expect(leitura.parametros.esperaSilencioMs).toBe(PARAMETROS_DE_FABRICA.esperaSilencioMs);

		for (const chave of [
			"max_toques",
			"teto_toques_30_dias",
			"dias_ate_segundo_toque",
			"espera_silencio_minutos",
		]) {
			const vigente = leitura.vigentes.find((v) => v.chave === chave);
			expect(vigente?.origem, chave).toBe("fabrica");
			expect(vigente?.valorInvalido, chave).not.toBeNull();
		}
	});

	it("(c) número fora da faixa é recusado, nunca 'dispara mais'", () => {
		const leitura = montarLeitura([
			// Tetos absurdos: o viés é sempre menos toque, jamais mais.
			{ chave: "teto_toques_30_dias", valor: "100" },
			{ chave: "max_toques", valor: "999" },
			{ chave: "hora_fechamento", valor: "25" },
			{ chave: "espera_silencio_minutos", valor: "0" },
		]);

		expect(leitura.parametros).toEqual(PARAMETROS_DE_FABRICA);
	});

	it("(c) janela de horário invertida volta inteira para a fábrica", () => {
		const leitura = montarLeitura([
			{ chave: "hora_abertura", valor: "22" },
			{ chave: "hora_fechamento", valor: "6" },
		]);

		expect(leitura.parametros.horaAbertura).toBe(PARAMETROS_DE_FABRICA.horaAbertura);
		expect(leitura.parametros.horaFechamento).toBe(PARAMETROS_DE_FABRICA.horaFechamento);
		for (const chave of ["hora_abertura", "hora_fechamento"]) {
			const vigente = leitura.vigentes.find((v) => v.chave === chave);
			expect(vigente?.origem, chave).toBe("fabrica");
			expect(vigente?.valorInvalido, chave).not.toBeNull();
		}
	});

	it("mistura de linha boa e linha ruim: só a boa vale", () => {
		const leitura = montarLeitura([
			{ chave: "dias_ate_segundo_toque", valor: "1" },
			{ chave: "dias_ate_terceiro_toque", valor: "não é número" },
		]);

		expect(leitura.parametros.diasAteSegundoToque).toBe(1);
		expect(leitura.parametros.diasAteTerceiroToque).toBe(
			PARAMETROS_DE_FABRICA.diasAteTerceiroToque,
		);
	});
});

describe("a validação da gravação recusa o que o motor não pode ler", () => {
	it("texto onde se espera número é recusado com mensagem clara", () => {
		const { erros, valores } = validarEntradas([{ chave: "max_toques", valor: "três" }]);

		expect(valores).toHaveLength(0);
		expect(erros.max_toques).toMatch(/números inteiros/i);
	});

	it("valor fora da faixa é recusado com a faixa na mensagem", () => {
		const { erros } = validarEntradas([{ chave: "hora_fechamento", valor: "30" }]);

		expect(erros.hora_fechamento).toMatch(/entre 1 e 24/);
	});

	it("campo vazio é remoção — volta ao padrão de fábrica, não é erro", () => {
		const { erros, remocoes, valores } = validarEntradas([{ chave: "max_toques", valor: "  " }]);

		expect(erros).toEqual({});
		expect(valores).toHaveLength(0);
		expect(remocoes).toEqual(["max_toques"]);
	});

	it("chave desconhecida é recusada", () => {
		const { erros } = validarEntradas([{ chave: "nao_existe", valor: "1" }]);
		expect(erros.nao_existe).toMatch(/desconhecido/i);
	});

	it("grava o valor normalizado (sem espaço, como inteiro)", () => {
		const { valores } = validarEntradas([{ chave: "espera_silencio_minutos", valor: " 120 " }]);
		expect(valores).toEqual([{ chave: "espera_silencio_minutos", valor: "120" }]);
	});

	it("subir só a abertura para depois do fechamento atual é recusado", () => {
		const { erros } = validarEntradas(
			[{ chave: "hora_abertura", valor: "22" }],
			PARAMETROS_DE_FABRICA, // fechamento vigente: 20
		);

		expect(erros.hora_abertura).toMatch(/antes da hora de fechamento/i);
	});

	it("o par de horário coerente passa junto", () => {
		const { erros, valores } = validarEntradas([
			{ chave: "hora_abertura", valor: "7" },
			{ chave: "hora_fechamento", valor: "22" },
		]);

		expect(erros).toEqual({});
		expect(valores).toHaveLength(2);
	});

	it("a faixa mostrada na tela é a mesma que o motor aceita", () => {
		const espera = PARAMETROS_DO_CADASTRO.find((d) => d.chave === "espera_silencio_minutos");
		expect(espera).toBeDefined();
		if (!espera) return;

		expect(limiteNaTela(espera)).toEqual({ minimo: 1, maximo: 24 * 60 });

		// A borda de baixo da tela é a borda aceita pelo motor; abaixo dela, nada.
		expect(validarEntradas([{ chave: espera.chave, valor: "1" }]).erros).toEqual({});
		expect(
			validarEntradas([{ chave: espera.chave, valor: "0" }]).erros[espera.chave],
		).toBeDefined();
	});

	it("normalizarParametros é a peneira de tudo que chega ao motor", () => {
		expect(normalizarParametros({ maxToques: 999, tetoToques30Dias: -1 })).toEqual(
			PARAMETROS_DE_FABRICA,
		);
	});
});
