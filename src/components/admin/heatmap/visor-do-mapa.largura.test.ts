// A largura do preview TEM que pertencer à faixa do aparelho que ela representa.
//
// É o guarda de um desalinhamento silencioso. O clique é gravado com `pageY`
// absoluto — pixels do documento que a pessoa viu —, então a nuvem só cai sobre
// o componente certo se a landing for renderizada aqui na largura daquele
// aparelho. Se `LARGURA_DE_PREVIEW.mobile` escorregasse para 800, ou se as
// quebras do Tailwind mudassem em `events.ts`, o preview passaria a desenhar um
// layout de tablet chamando-o de celular: nada quebra, nenhum teste fica
// vermelho, e o mapa volta a apontar para a seção errada — que foi exatamente o
// defeito de 24/08/2026, quando tudo era renderizado a 1.280px com 91,2% dos
// visitantes no celular.

import { describe, expect, it } from "vitest";
import { classifyDevice } from "@/lib/heatmap/events";
import { LARGURA_DE_PREVIEW } from "./visor-do-mapa";

describe("largura do preview por aparelho", () => {
	it.each(["mobile", "tablet", "desktop"] as const)(
		"a largura do preview de %s cai na faixa do próprio aparelho",
		(device) => {
			expect(classifyDevice(LARGURA_DE_PREVIEW[device])).toBe(device);
		},
	);

	it("o recorte 'todos' desenha no layout da maioria — o celular", () => {
		// Misturar aparelhos numa nuvem só é insolúvel (as alturas de documento são
		// outras). Escolhido o mal menor, ele tem que ser o dos 91%.
		expect(LARGURA_DE_PREVIEW.todos).toBe(LARGURA_DE_PREVIEW.mobile);
		expect(classifyDevice(LARGURA_DE_PREVIEW.todos)).toBe("mobile");
	});
});
