// Camada 1 (FIX-25) — derivação do input do startContract. Módulo ÚNICO
// consumido por web (route.ts) e WhatsApp (contract-capture.ts): a mesma
// proposta real sai dos dois canais com os mesmos parâmetros.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "./contract-input";

const identity = { cpf: "52998224725", celular: "62999887766" };

describe("buildStartContractInput — derivação canônica (FIX-25, CA-10)", () => {
	it("deriva segmento/valor/objetivo a partir do meta e injeta identidade + lgpd", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			recommendedAdministradora: "ANCORA",
			qualifyAnswers: {
				creditMax: 80000,
				objetivo: "contemplacao_rapida",
			},
		} as ConversationMetadata;

		const input = buildStartContractInput(meta, { ...identity, lgpd: true });

		expect(input.cpf).toBe("52998224725");
		expect(input.celular).toBe("62999887766");
		expect(input.lgpd).toBe(true);
		expect(input.segmento).toBe("AUTOS");
		expect(input.valor).toBe(80000);
		expect(input.objetivo).toBe("contemplacao_rapida");
		expect(input.lanceEmbutido).toBe("nenhum");
		expect(input.administradoraPreferida).toBe("ANCORA");
	});

	it("lanceEmbutido vira percentual string quando o usuário optou", () => {
		const meta: ConversationMetadata = {
			currentCategory: "imovel",
			qualifyAnswers: { creditMin: 120000, lanceEmbutido: true, lanceEmbutidoPercent: 50 },
		} as ConversationMetadata;

		const input = buildStartContractInput(meta, { ...identity, lgpd: true });
		expect(input.segmento).toBe("IMOVEL");
		expect(input.valor).toBe(120000); // cai pra creditMin quando não há creditMax
		expect(input.lanceEmbutido).toBe("50");
	});

	it("defaults seguros quando o meta está vazio (valor 50000, objetivo rápido)", () => {
		const meta: ConversationMetadata = {} as ConversationMetadata;
		const input = buildStartContractInput(meta, { ...identity, lgpd: false });
		expect(input.valor).toBe(50000);
		expect(input.objetivo).toBe("contemplacao_rapida");
		expect(input.lanceEmbutido).toBe("nenhum");
		expect(input.administradoraPreferida).toBeNull();
		expect(input.lgpd).toBe(false);
	});

	// FIX-48 (Camada 1): o caller (route web / WhatsApp) resolve o leadId da
	// conversa e o injeta — sem isso a proposta nasce órfã e a raia trava em
	// `qualificado`. buildStartContractInput precisa PROPAGAR o leadId pro shape.
	it("FIX-48: propaga o leadId resolvido pelo caller pro input do startContract", () => {
		const meta: ConversationMetadata = { currentCategory: "auto" } as ConversationMetadata;
		const input = buildStartContractInput(
			meta,
			{ ...identity, lgpd: true },
			{ leadId: "lead-123" },
		);
		expect(input.leadId).toBe("lead-123");
	});

	it("FIX-48: leadId é null quando o caller não resolve (não vira undefined silencioso)", () => {
		const meta: ConversationMetadata = { currentCategory: "auto" } as ConversationMetadata;
		const input = buildStartContractInput(meta, { ...identity, lgpd: true });
		expect(input.leadId).toBeNull();
	});
});
