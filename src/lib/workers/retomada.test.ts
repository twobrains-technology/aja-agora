import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildRetomadaDirective, podeRetomar } from "./retomada";

const META_COM_OFERTA = {
	currentCategory: "auto",
	recommendedOffer: {
		administradora: "CANOPUS",
		creditValue: 119_500,
		monthlyPayment: 1_092,
		termMonths: 96,
	},
} as ConversationMetadata;

describe("directive de retomada", () => {
	it("carrega o FATO da conversa, com os números reais", () => {
		const d = buildRetomadaDirective(META_COM_OFERTA, { minutosParado: 4, channel: "web" });
		// O modelo precisa saber o que está na mesa — senão retoma no vazio.
		expect(d).toContain("119.500");
		expect(d).toContain("CANOPUS");
		expect(d).toContain("4");
	});

	it("não dita sequência nem nomeia ferramenta", () => {
		const d = buildRetomadaDirective(META_COM_OFERTA, { minutosParado: 3, channel: "whatsapp" });
		// Fato + intenção. Passo a passo e nome de tool no directive é como o
		// agente acaba narrando mecânica ou perseguindo tool que não existe.
		expect(d).not.toMatch(/present_|simulate_|search_groups|recommend_groups/);
		// E é instrução de sistema declarada — o cliente não pode ver este texto.
		expect(d).toContain("instrução do sistema");
	});

	it("funciona sem oferta ancorada — retoma pelo passo do funil", () => {
		const d = buildRetomadaDirective({ currentCategory: "auto" } as ConversationMetadata, {
			minutosParado: 5,
			channel: "web",
		});
		expect(d.length).toBeGreaterThan(0);
		expect(d).toContain("instrução do sistema");
	});
});

describe("anti-loop da retomada", () => {
	const agora = 1_800_000_000_000;

	it("primeira retomada passa", () => {
		expect(podeRetomar({}, agora)).toBe(true);
	});

	it("segunda espera o backoff", () => {
		const meta = { retomada: { attempts: 1, lastAt: agora - 60_000 } } as ConversationMetadata;
		expect(podeRetomar(meta, agora)).toBe(false);
		// Meia hora depois, pode.
		expect(podeRetomar(meta, agora + 31 * 60_000)).toBe(true);
	});

	it("para no teto — retomar para sempre é perseguir quem já foi embora", () => {
		const meta = {
			retomada: { attempts: 2, lastAt: agora - 10 * 60 * 60_000 },
		} as ConversationMetadata;
		expect(podeRetomar(meta, agora)).toBe(false);
	});
});
