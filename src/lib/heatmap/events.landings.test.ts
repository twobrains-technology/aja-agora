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
	// A relação é de CONTENÇÃO, não de igualdade: toda landing com mapa precisa
	// ser uma landing do proxy (fora do matcher não há visita, e o mapa ficaria
	// sem origem). O contrário não vale — `/direto` é landing de visita e NÃO
	// tem lista de seções própria, de propósito (ver o teste seguinte).
	it("todo mapa de calor pertence a uma landing que o proxy atribui", () => {
		for (const path of LANDINGS_COM_MAPA) {
			expect(LANDINGS, `${path} tem mapa mas não é landing do proxy`).toContain(path);
		}
	});

	// `/direto` é a variante da home em teste (comp "TESTE A"): o proxy grava a
	// chegada NELA — foi justamente o defeito do P5 corrigir isso —, mas o mapa de
	// calor dela é gravado como `/` (`src/app/direto/page.tsx` passa
	// `heatPath="/"`), de propósito, porque é assim que vai ser quando o rewrite
	// entrar no ar. Por isso ela não tem seções próprias, e esta lista é fechada:
	// landing nova sem mapa tem de ser uma decisão consciente, não um esquecimento.
	it("só uma variante documentada pode ser landing sem mapa próprio", () => {
		const semMapa = LANDINGS.filter(
			(path) => !(LANDINGS_COM_MAPA as readonly string[]).includes(path),
		);
		expect(semMapa).toEqual(["/direto"]);
	});

	it("dá a toda landing uma lista de seções não vazia e sem repetição", () => {
		for (const [path, secoes] of Object.entries(SECOES_POR_LANDING)) {
			expect(secoes.length, `${path} está sem seções`).toBeGreaterThan(0);
			expect(new Set(secoes).size, `${path} tem seção repetida`).toBe(secoes.length);
		}
	});
});
