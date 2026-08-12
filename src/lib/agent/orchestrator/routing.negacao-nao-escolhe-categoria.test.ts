// Golden `golden-troca-de-categoria`, vermelho no eval de 2026-08-12: o cliente
// disse "Pensando melhor, na verdade eu quero uma moto, não imóvel" e o funil
// respondeu com o gate `credit` de IMÓVEL — a transição pra moto nunca
// aconteceu.
//
// A culpa não é do analyzer, como parecia à primeira vista. É do fallback
// determinístico: `fallbackDetectCategory` itera as categorias na ordem em que
// estão escritas no objeto (imovel → auto → moto) e devolve a PRIMEIRA que casa
// em qualquer lugar do texto. Na frase acima, "imóvel" aparece — dentro da
// NEGAÇÃO — e ganha de "moto", que é o que o cliente quer.
//
// Duas correções, ambas determinísticas:
//   1. o que vem negado não conta ("não imóvel" não é pedido de imóvel);
//   2. entre categorias que sobraram, vence a mencionada PRIMEIRO na frase, não
//      a que estiver antes no código — a ordem do objeto era um critério
//      acidental, e acidente não pode decidir a categoria da venda.

import { describe, expect, it } from "vitest";
import { fallbackDetectCategory } from "@/lib/agent/orchestrator/routing";

describe("negação não escolhe a categoria", () => {
	it("a frase literal do golden vermelho resolve pra moto", () => {
		expect(
			fallbackDetectCategory("Pensando melhor, na verdade eu quero uma moto, não imóvel"),
		).toBe("moto");
	});

	it("o bem negado nunca vence o bem pedido", () => {
		expect(fallbackDetectCategory("não quero carro, quero uma moto")).toBe("moto");
		expect(fallbackDetectCategory("moto não, quero um apartamento")).toBe("imovel");
		expect(fallbackDetectCategory("nem carro nem moto, é casa mesmo")).toBe("imovel");
	});

	it("com mais de um bem citado, vale o primeiro da frase", () => {
		expect(fallbackDetectCategory("quero uma moto ou talvez um carro")).toBe("moto");
		expect(fallbackDetectCategory("um carro, ou quem sabe uma moto")).toBe("auto");
	});

	it("frase simples continua funcionando", () => {
		expect(fallbackDetectCategory("quero comprar um carro")).toBe("auto");
		expect(fallbackDetectCategory("quero um imóvel")).toBe("imovel");
		expect(fallbackDetectCategory("uma moto pra trabalhar")).toBe("moto");
	});

	it("sem bem nenhum, devolve null", () => {
		expect(fallbackDetectCategory("oi, tudo bem?")).toBeNull();
		expect(fallbackDetectCategory("quanto custa?")).toBeNull();
	});

	it("negar o único bem citado não inventa outro", () => {
		expect(fallbackDetectCategory("não quero imóvel")).toBeNull();
	});
});
