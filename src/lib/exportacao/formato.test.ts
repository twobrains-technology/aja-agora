import { describe, expect, it } from "vitest";
import { chaveParaColuna, gerar, paraCsv, paraJson } from "./formato";

const LINHA = { conversaId: "c1", msgId: "m1", autoria: "cliente", conteudo: "oi" };

describe("chaveParaColuna", () => {
	it("vira snake_case sem acento", () => {
		expect(chaveParaColuna("conversaId")).toBe("conversa_id");
		expect(chaveParaColuna("criadoEm")).toBe("criado_em");
		expect(chaveParaColuna("dadosIndisponiveis")).toBe("dados_indisponiveis");
		expect(chaveParaColuna("ctwaSourceId")).toBe("ctwa_source_id");
		expect(chaveParaColuna("msgId")).toBe("msg_id");
	});
});

describe("paraCsv", () => {
	it("usa a ordem das chaves e snake_case no cabeçalho", () => {
		const csv = paraCsv([LINHA]);
		const [cabecalho] = csv.split("\n");
		expect(cabecalho).toBe("\ufeffconversa_id,msg_id,autoria,conteudo");
	});

	it("escapa vírgula, aspas e quebra de linha (RFC 4180)", () => {
		const csv = paraCsv([{ ...LINHA, conteudo: 'ele disse "oi", e foi\nembora' }]);
		expect(csv).toContain('"ele disse ""oi"", e foi\nembora"');
	});

	it("LANÇA em célula vazia — vazio tem que sair escrito", () => {
		expect(() => paraCsv([{ ...LINHA, conteudo: "" }])).toThrow(/conteudo/);
		expect(() => paraCsv([{ ...LINHA, conteudo: null as unknown as string }])).toThrow();
	});
});

describe("paraJson", () => {
	it("devolve array com as chaves como estão", () => {
		expect(JSON.parse(paraJson([LINHA]))).toEqual([LINHA]);
	});

	it("LANÇA em célula vazia, igual ao CSV", () => {
		expect(() => paraJson([{ ...LINHA, autoria: "" }])).toThrow(/autoria/);
	});
});

describe("gerar", () => {
	it("arquivo vazio continua válido nos dois formatos", () => {
		expect(gerar("json", [])).toBe("[]");
		expect(gerar("csv", [])).toBe("\ufeff\n");
	});

	it("com linhas, delega ao formato pedido", () => {
		expect(gerar("json", [LINHA])).toContain('"conversaId"');
		expect(gerar("csv", [LINHA])).toContain("conversa_id");
	});
});
