import { describe, expect, it } from "vitest";
import { PARTES_PADRAO, PROMPT_DO_VENDEDOR } from "@/lib/agent/prompt-do-vendedor";
import { compilarConduta } from "./compilar-perfil";
import { ler, serializar } from "./orientacao-em-partes";
import type { AtributosDoPerfil } from "./tipos";

const atributos: AtributosDoPerfil = {
	agressividade: "equilibrada",
	proatividade: "media",
	tecnicidade: "neutro",
	tom: "neutro",
};

describe("envelope da orientação", () => {
	it("T3.1 ida e volta", () => {
		const entrada = { partes: { descoberta: "X" }, contato: "telefone-antes" as const, livre: "Y" };
		expect(ler(serializar(entrada))).toEqual(entrada);
	});

	it("T3.1 inválido, quebrado, versão desconhecida e legado viram livre", () => {
		for (const texto of [
			"{quebrado",
			'{"v":3,"partes":{}}',
			'{"v":2,"partes":[]}',
			"Seja gentil.",
		]) {
			expect(ler(texto)).toEqual({ partes: {}, contato: "carta-primeiro", livre: texto });
		}
	});

	it("ignora parte desconhecida e contato inválido", () => {
		const r = ler('{"v":2,"partes":{"xis":"a","abertura":"b"},"contato":"zzz","livre":""}');
		expect(r).toEqual({ partes: { abertura: "b" }, contato: "carta-primeiro", livre: "" });
	});
});

describe("compilarConduta", () => {
	const base = { partes: {}, contato: "carta-primeiro" as const, livre: "" };

	it("T3.2 tudo padrão, sem livre e sem Estilo geral é o prompt do vendedor", () => {
		expect(compilarConduta(base)).toBe(PROMPT_DO_VENDEDOR);
	});

	it("com atributos acrescenta o Estilo geral ao fim", () => {
		const t = compilarConduta({ ...base, atributos, livre: "Olá" });
		expect(t.startsWith(PROMPT_DO_VENDEDOR)).toBe(true);
		expect(t).toContain("Agressividade comercial (equilibrada)");
		expect(t).toContain("Orientação adicional:\nOlá");
	});

	it("T3.3 editar só descoberta muda só esse trecho", () => {
		const t = compilarConduta({ ...base, partes: { descoberta: "DESC" } });
		expect(t).toBe(PROMPT_DO_VENDEDOR.replace(PARTES_PADRAO.descoberta, "DESC"));
	});

	it("T3.4 telefone-antes troca só o contato", () => {
		const t = compilarConduta({ ...base, contato: "telefone-antes" });
		expect(t).not.toBe(PROMPT_DO_VENDEDOR);
		expect(t).toContain("No site, peça o WhatsApp antes");
		expect(t).toContain(PARTES_PADRAO.abertura);
		expect(t).not.toContain(PARTES_PADRAO.contato);
	});

	it("parte editada de contato vence o preset", () => {
		const t = compilarConduta({ ...base, contato: "telefone-antes", partes: { contato: "MEU" } });
		expect(t).toContain("MEU");
		expect(t).not.toContain("peça o WhatsApp antes");
	});
});
