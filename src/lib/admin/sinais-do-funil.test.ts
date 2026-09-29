// FIX-387 — a FASE do funil como fato do servidor.
//
// A régua decidia a chave do template só pelo BEM. Não existia a noção de fase:
// quem parou no início e quem só falta fechar recebiam a mesma mensagem (Kairo,
// 22/09 12:02:49: "se o cara tá no início… ele chegou até visualizar a oferta…
// Já tá no finalzinho, é só fechar?").
//
// Duas provas aqui, e a segunda é a que impede a regressão silenciosa:
//   1. `faseDoFunil` é uma função PURA dos sinais — sem banco, sem relógio;
//   2. os sinais (`viu_oferta`, `teve_proposta`) moram num fragmento ÚNICO. O
//      `teve_proposta` vivia inline em TRÊS arquivos; uma quarta cópia nasceria
//      no primeiro consumidor novo e divergiria no primeiro dia.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { faseDoFunil, type SinaisDoFunil } from "./sinais-do-funil";

const RAIZ = process.cwd();

function ler(caminhoRelativo: string): string {
	return readFileSync(join(RAIZ, caminhoRelativo), "utf8");
}

const semSinal: SinaisDoFunil = { viuOferta: false, teveProposta: false };

describe("faseDoFunil — a macro-fase a partir dos sinais", () => {
	it("não viu oferta ainda → inicio (a primeira das três mensagens)", () => {
		expect(faseDoFunil(semSinal)).toBe("inicio");
	});

	it("chegou a visualizar a oferta → viu_oferta", () => {
		expect(faseDoFunil({ viuOferta: true, teveProposta: false })).toBe("viu_oferta");
	});

	it("já tem proposta na mesa → fechamento (a última das três)", () => {
		expect(faseDoFunil({ viuOferta: true, teveProposta: true })).toBe("fechamento");
	});

	it("quem tem proposta é fechamento mesmo sem o sinal de oferta gravado", () => {
		// A ordem dos degraus é estrita: proposta implica ter visto a oferta, mas o
		// evento pode não estar no histórico (conversa anterior à instrumentação).
		// O degrau mais FUNDO vence — é o mesmo princípio da escada do Percurso.
		expect(faseDoFunil({ viuOferta: false, teveProposta: true })).toBe("fechamento");
	});
});

describe("os sinais do funil são UM fragmento só (fonte única)", () => {
	const consumidores = [
		"src/lib/admin/percurso-queries.ts",
		"src/lib/admin/performance-queries.ts",
		"src/lib/exportacao/percurso.ts",
	];

	it("os três consumidores usam os fragmentos de `sinais-do-funil`", () => {
		for (const arquivo of consumidores) {
			const fonte = ler(arquivo);
			expect(fonte, `${arquivo} deveria usar viuOferta()`).toContain("viuOferta(");
			expect(fonte, `${arquivo} deveria usar teveProposta()`).toContain("teveProposta(");
		}
	});

	it("nenhum consumidor redefine o predicado inline (nem `viu_oferta`, nem `teve_proposta`)", () => {
		// Se qualquer um voltar a escrever o EXISTS na mão, o fragmento deixa de ser
		// fonte única e as três telas divergem no primeiro dia. O padrão é o do
		// PREDICADO (não a menção da tabela em outro contexto): o funil de mídia
		// tem `LEFT JOIN bevi_proposals` para CONTAR, e isso não é o mesmo fato.
		for (const arquivo of consumidores) {
			const fonte = ler(arquivo);
			expect(fonte, `${arquivo} não pode ter o EXISTS de bevi_proposals inline`).not.toContain(
				"EXISTS (SELECT 1 FROM bevi_proposals",
			);
			expect(fonte, `${arquivo} não pode ter o EXISTS de artifacts inline`).not.toMatch(
				/EXISTS \(SELECT 1 FROM messages m[\s\S]{0,60}JOIN artifacts a ON a\.message_id/,
			);
		}
	});
});