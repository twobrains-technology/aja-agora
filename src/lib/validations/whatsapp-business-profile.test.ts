import { describe, expect, it } from "vitest";
import {
	perfilCorporativoSchema,
	RAMOS_DE_ATIVIDADE,
	recusaDaFoto,
	TAMANHO_MAXIMO_DA_FOTO_BYTES,
} from "./whatsapp-business-profile";

describe("campos do perfil", () => {
	// A distinção que faz a tela funcionar: sem ela, apagar o texto e salvar não
	// apagaria nada, e quem opera repetiria o gesto achando que o botão falhou.
	it("chave ausente não mexe no campo; chave vazia apaga", () => {
		const semNada = perfilCorporativoSchema.parse({});
		expect(semNada.about).toBeUndefined();

		const limpando = perfilCorporativoSchema.parse({ about: "" });
		expect(limpando.about).toBe("");
	});

	it("tira espaço das pontas — sobra de copiar e colar não vira conteúdo", () => {
		const r = perfilCorporativoSchema.parse({ description: "  Consórcio de imóveis  " });
		expect(r.description).toBe("Consórcio de imóveis");
	});

	it("e-mail inválido é recusado com mensagem em português", () => {
		const r = perfilCorporativoSchema.safeParse({ email: "contato@" });
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toContain("E-mail inválido");
	});

	it("e-mail vazio passa — é assim que se apaga o contato", () => {
		expect(perfilCorporativoSchema.parse({ email: "" }).email).toBe("");
	});

	it("site sem esquema é recusado — a Graph não aceita e o erro dela não diz qual campo", () => {
		const r = perfilCorporativoSchema.safeParse({ websites: ["ajaagora.com.br"] });
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toContain("http://");
	});

	it("site com https passa", () => {
		const r = perfilCorporativoSchema.parse({ websites: ["https://ajaagora.com.br"] });
		expect(r.websites).toEqual(["https://ajaagora.com.br"]);
	});

	it("lista de sites vazia é válida — apaga os sites", () => {
		expect(perfilCorporativoSchema.parse({ websites: [] }).websites).toEqual([]);
	});

	it("ramo fora do enum da Meta é recusado", () => {
		expect(perfilCorporativoSchema.safeParse({ vertical: "CONSORCIO" }).success).toBe(false);
		expect(perfilCorporativoSchema.safeParse({ vertical: "FINANCE" }).success).toBe(true);
	});

	it("texto acima do teto de sanidade é recusado antes de gastar viagem à Meta", () => {
		const r = perfilCorporativoSchema.safeParse({ about: "x".repeat(513) });
		expect(r.success).toBe(false);
	});
});

describe("rótulos dos ramos de atividade", () => {
	it("todo ramo tem rótulo em português, com acento onde precisa", () => {
		for (const [chave, rotulo] of Object.entries(RAMOS_DE_ATIVIDADE)) {
			expect(rotulo, `${chave} sem rótulo`).toBeTruthy();
			// Rótulo não pode ser o enum cru vazando pra tela.
			expect(rotulo).not.toBe(chave);
		}
	});

	it("cobre os 21 valores que a Graph documenta", () => {
		expect(Object.keys(RAMOS_DE_ATIVIDADE)).toHaveLength(21);
	});
});

describe("recusa da foto", () => {
	it("aceita JPEG e PNG dentro do tamanho", () => {
		expect(recusaDaFoto({ type: "image/jpeg", size: 1024 })).toBeNull();
		expect(recusaDaFoto({ type: "image/png", size: 1024 })).toBeNull();
	});

	it("é indiferente à caixa do MIME", () => {
		expect(recusaDaFoto({ type: "IMAGE/JPEG", size: 1024 })).toBeNull();
	});

	// A Resumable Upload API não aceita webp/gif; sem esta recusa o operador só
	// descobre depois da viagem, com a mensagem genérica da Meta.
	it("recusa formato que a Meta não aceita", () => {
		expect(recusaDaFoto({ type: "image/webp", size: 1024 })).toMatch(/JPEG ou PNG/);
		expect(recusaDaFoto({ type: "image/gif", size: 1024 })).toMatch(/JPEG ou PNG/);
	});

	it("recusa arquivo grande demais e arquivo vazio", () => {
		expect(recusaDaFoto({ type: "image/png", size: TAMANHO_MAXIMO_DA_FOTO_BYTES + 1 })).toMatch(
			/5 MB/,
		);
		expect(recusaDaFoto({ type: "image/png", size: 0 })).toMatch(/vazio/);
	});
});
