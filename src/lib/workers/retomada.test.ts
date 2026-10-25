import { describe, expect, it } from "vitest";
import type { ChosenOffer } from "@/lib/agent/orchestrator/choose-offer";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildRetomadaDirective, escolherOfertaDaRetomada, podeRetomar } from "./retomada";

const META_COM_OFERTA = {
	currentCategory: "auto",
	recommendedOffer: {
		administradora: "CANOPUS",
		creditValue: 119_500,
		monthlyPayment: 1_092,
		termMonths: 96,
	},
} as ConversationMetadata;

/** O que o cliente VIU no card de comparação, do mais recente pro mais antigo. */
const CARTAS_VISTAS: ChosenOffer[] = [
	{ groupId: "g-recente", administradora: "RODOBENS", creditValue: 95_000, monthlyPayment: 890 },
	{ groupId: "g-antiga", administradora: "ITAU", creditValue: 80_000, monthlyPayment: 760 },
];

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

	it("sem oferta nenhuma, o directive NÃO inventa número", () => {
		const d = buildRetomadaDirective({ currentCategory: "auto" } as ConversationMetadata, {
			minutosParado: 5,
			channel: "web",
		});
		expect(d.length).toBeGreaterThan(0);
		expect(d).toContain("instrução do sistema");
		expect(d).not.toContain("R$");
		expect(d).toContain("nenhuma oferta");
	});

	it("a oferta RESOLVIDA (última carta da conversa) entra no directive", () => {
		// O caso que a retomada deixava mudo: o vendedor nunca gravou
		// `recommendedOffer`, mas o cliente viu a comparação.
		const oferta = escolherOfertaDaRetomada({ currentCategory: "auto" } as ConversationMetadata, [
			CARTAS_VISTAS[0],
		]);
		const d = buildRetomadaDirective({ currentCategory: "auto" } as ConversationMetadata, {
			minutosParado: 3,
			channel: "web",
			oferta,
		});
		expect(d).toContain("95.000");
		expect(d).toContain("RODOBENS");
		expect(d).not.toContain("nenhuma oferta");
	});
});

describe("a oferta da retomada", () => {
	it("usa a oferta GRAVADA pelo vendedor quando existe", () => {
		const oferta = escolherOfertaDaRetomada(META_COM_OFERTA, CARTAS_VISTAS);
		expect(oferta).toMatchObject({ administradora: "CANOPUS", creditValue: 119_500 });
	});

	it("sem oferta gravada, cai na ÚLTIMA carta mostrada na conversa", () => {
		const oferta = escolherOfertaDaRetomada({ currentCategory: "auto" } as ConversationMetadata, [
			CARTAS_VISTAS[0],
			CARTAS_VISTAS[1],
		]);
		// A lista vem da mais recente para a mais antiga.
		expect(oferta).toMatchObject({ administradora: "RODOBENS", creditValue: 95_000 });
	});

	it("carta sem número real não vira oferta — nada é fabricado", () => {
		const quebrada: ChosenOffer = { groupId: "g-zero", administradora: "ITAU", creditValue: 0 };
		expect(
			escolherOfertaDaRetomada({ currentCategory: "auto" } as ConversationMetadata, [quebrada]),
		).toBeNull();
	});

	it("conversa sem card e sem oferta gravada devolve null (e o directive diz isso)", () => {
		expect(escolherOfertaDaRetomada({} as ConversationMetadata, [])).toBeNull();
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
