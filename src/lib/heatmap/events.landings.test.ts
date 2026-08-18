// Amarra o mapa de calor às landings de verdade.
//
// Duas listas moram em arquivos diferentes por necessidade: `LANDINGS` é lida
// pelo proxy (edge), e importar o proxy dentro do coletor arrastaria o
// middleware inteiro pro bundle do navegador. Divergirem não quebra nada na
// tela — a página nova simplesmente nunca apareceria no painel, calada. Este
// teste é o único aviso que existe.

import { describe, expect, it } from "vitest";
import { LANDINGS } from "@/proxy";
import { LANDINGS_COM_MAPA, SECOES_POR_LANDING } from "./events";

describe("landings do mapa de calor", () => {
	it("cobre exatamente as landings que o proxy atribui", () => {
		expect([...LANDINGS_COM_MAPA].sort()).toEqual([...LANDINGS].sort());
	});

	it("dá a toda landing uma lista de seções não vazia e sem repetição", () => {
		for (const [path, secoes] of Object.entries(SECOES_POR_LANDING)) {
			expect(secoes.length, `${path} está sem seções`).toBeGreaterThan(0);
			expect(new Set(secoes).size, `${path} tem seção repetida`).toBe(secoes.length);
		}
	});
});
