import { describe, expect, it } from "vitest";
import {
	classifyDevice,
	MAX_EVENTS_POR_LOTE,
	marcarRageClicks,
	normalizeEvent,
	normalizeLote,
	sanitizeLabel,
} from "./events";

const AGORA = 1_770_000_000_000;

/** Payload cru mínimo que o coletor manda — o resto dos testes parte daqui. */
function cliqueCru(over: Record<string, unknown> = {}) {
	return {
		type: "click",
		path: "/",
		section: "kv-hero",
		selector: "main>section[1]>button[0]",
		label: "Simular agora",
		relX: 0.5,
		relY: 0.4,
		pageRelX: 0.32,
		pageY: 780,
		viewportWidth: 1440,
		viewportHeight: 900,
		at: AGORA,
		...over,
	};
}

describe("classifyDevice", () => {
	it("separa nas quebras do Tailwind, que são as que a landing usa", () => {
		expect(classifyDevice(390)).toBe("mobile");
		expect(classifyDevice(767)).toBe("mobile");
		expect(classifyDevice(768)).toBe("tablet");
		expect(classifyDevice(1023)).toBe("tablet");
		expect(classifyDevice(1024)).toBe("desktop");
		expect(classifyDevice(2560)).toBe("desktop");
	});
});

describe("sanitizeLabel", () => {
	it("mantém o texto visível do alvo, que é como o mapa fica legível", () => {
		expect(sanitizeLabel("  Simular agora  ")).toBe("Simular agora");
		expect(sanitizeLabel("Ver\n  ofertas   reais")).toBe("Ver ofertas reais");
	});

	it("trunca rótulo longo — parágrafo inteiro não é rótulo, é vazamento de conteúdo", () => {
		const longo = "a".repeat(200);

		expect(sanitizeLabel(longo)).toHaveLength(80);
	});

	it("apaga o que parece dado pessoal digitado, não importa o alvo", () => {
		// O coletor lê textContent do alvo. Num input preenchido isso viria a ser
		// o que o visitante digitou — CPF, e-mail e telefone NUNCA podem entrar
		// numa tabela de analytics.
		expect(sanitizeLabel("123.456.789-09")).toBe("");
		expect(sanitizeLabel("12345678909")).toBe("");
		expect(sanitizeLabel("fulano@exemplo.com.br")).toBe("");
		expect(sanitizeLabel("(62) 99999-8888")).toBe("");
		// O buraco deixado pelo telefone some no colapso de espaço — o rótulo
		// continua legível no painel, sem o dado pessoal.
		expect(sanitizeLabel("Fale com (62) 99999-8888 agora")).toBe("Fale com agora");
	});

	it("devolve vazio pra rótulo ausente ou só espaço", () => {
		expect(sanitizeLabel(null)).toBe("");
		expect(sanitizeLabel(undefined)).toBe("");
		expect(sanitizeLabel("   ")).toBe("");
	});
});

describe("normalizeEvent", () => {
	it("aceita um clique bem formado e devolve o registro pronto pro banco", () => {
		expect(normalizeEvent(cliqueCru())).toMatchObject({
			type: "click",
			path: "/",
			section: "kv-hero",
			label: "Simular agora",
			device: "desktop",
			viewportWidth: 1440,
		});
	});

	it("descarta evento sem tipo conhecido", () => {
		expect(normalizeEvent(cliqueCru({ type: "keylogger" }))).toBeNull();
		expect(normalizeEvent(cliqueCru({ type: undefined }))).toBeNull();
	});

	it("descarta coordenada fora de 0..1 — relativa é o contrato, não pixel", () => {
		expect(normalizeEvent(cliqueCru({ relX: 1.4 }))).toBeNull();
		expect(normalizeEvent(cliqueCru({ relY: -0.2 }))).toBeNull();
		expect(normalizeEvent(cliqueCru({ pageRelX: 12 }))).toBeNull();
	});

	it("descarta viewport impossível, que é sinal de payload forjado", () => {
		expect(normalizeEvent(cliqueCru({ viewportWidth: 0 }))).toBeNull();
		expect(normalizeEvent(cliqueCru({ viewportWidth: 99_999 }))).toBeNull();
	});

	it("só aceita as landings — endpoint público com path livre viraria coluna de texto da internet", () => {
		expect(normalizeEvent(cliqueCru({ path: "https://outro.site/x" }))).toBeNull();
		expect(normalizeEvent(cliqueCru({ path: "/termos-de-uso" }))).toBeNull();
		expect(normalizeEvent(cliqueCru({ path: "/admin/pipeline" }))).toBeNull();
	});

	it("aceita as verticais, com as seções delas", () => {
		expect(normalizeEvent(cliqueCru({ path: "/motos", section: "hero-vertical" }))).toMatchObject({
			path: "/motos",
			section: "hero-vertical",
		});

		// `kv-journey` existe na home e NÃO em `/motos` — cruzar as duas listas
		// encheria o funil da vertical de degrau que aquela página nunca teve.
		expect(normalizeEvent(cliqueCru({ path: "/motos", section: "kv-journey" }))).toBeNull();
	});

	it("normaliza a barra final — /autos/ e /autos são a mesma página", () => {
		expect(normalizeEvent(cliqueCru({ path: "/autos/", section: "kv-faq" }))).toMatchObject({
			path: "/autos",
		});
	});

	it("corta a query string do path — UTM já vive em visits, e aqui viraria cardinalidade infinita", () => {
		expect(normalizeEvent(cliqueCru({ path: "/?utm_source=meta&utm_campaign=x" }))).toMatchObject({
			path: "/",
		});
	});

	it("aceita scroll_depth sem coordenada de clique", () => {
		const evento = normalizeEvent({
			type: "scroll_depth",
			path: "/",
			scrollPct: 75,
			viewportWidth: 390,
			viewportHeight: 844,
			at: AGORA,
		});

		expect(evento).toMatchObject({ type: "scroll_depth", scrollPct: 75, device: "mobile" });
	});

	it("prende scroll_depth em 0..100", () => {
		const base = {
			type: "scroll_depth",
			path: "/",
			viewportWidth: 390,
			viewportHeight: 844,
			at: AGORA,
		};

		expect(normalizeEvent({ ...base, scrollPct: 140 })).toBeNull();
		expect(normalizeEvent({ ...base, scrollPct: -1 })).toBeNull();
	});

	it("exige seção em section_view — sem ela o evento não responde nada", () => {
		const base = {
			type: "section_view",
			path: "/",
			viewportWidth: 390,
			viewportHeight: 844,
			at: AGORA,
		};

		expect(normalizeEvent(base)).toBeNull();
		expect(normalizeEvent({ ...base, section: "kv-faq" })).toMatchObject({ section: "kv-faq" });
	});

	it("recusa seção que não é uma das seções conhecidas da landing", () => {
		expect(normalizeEvent(cliqueCru({ section: "seção-inventada" }))).toBeNull();
	});
});

describe("normalizeLote", () => {
	it("descarta os inválidos e mantém os bons — um evento torto não derruba o lote", () => {
		const lote = normalizeLote([cliqueCru(), { type: "lixo" }, cliqueCru({ section: "kv-faq" })]);

		expect(lote).toHaveLength(2);
		expect(lote.map((e) => e.section)).toEqual(["kv-hero", "kv-faq"]);
	});

	it("trunca lote gigante — é o limite que impede um script de encher a tabela", () => {
		const gigante = Array.from({ length: MAX_EVENTS_POR_LOTE + 50 }, () => cliqueCru());

		expect(normalizeLote(gigante)).toHaveLength(MAX_EVENTS_POR_LOTE);
	});

	it("devolve vazio pra entrada que não é lista", () => {
		expect(normalizeLote(null)).toEqual([]);
		expect(normalizeLote({ type: "click" })).toEqual([]);
	});
});

describe("marcarRageClicks", () => {
	it("promove a 3ª batida seguida no mesmo alvo dentro da janela", () => {
		const eventos = normalizeLote([
			cliqueCru({ at: AGORA }),
			cliqueCru({ at: AGORA + 300 }),
			cliqueCru({ at: AGORA + 600 }),
		]);

		expect(marcarRageClicks(eventos).map((e) => e.type)).toEqual(["click", "click", "rage_click"]);
	});

	it("não acusa raiva quando o visitante clica devagar", () => {
		const eventos = normalizeLote([
			cliqueCru({ at: AGORA }),
			cliqueCru({ at: AGORA + 3_000 }),
			cliqueCru({ at: AGORA + 6_000 }),
		]);

		expect(marcarRageClicks(eventos).every((e) => e.type === "click")).toBe(true);
	});

	it("não junta alvos diferentes — clicar rápido em três botões é navegação, não raiva", () => {
		const eventos = normalizeLote([
			cliqueCru({ at: AGORA, selector: "a" }),
			cliqueCru({ at: AGORA + 200, selector: "b" }),
			cliqueCru({ at: AGORA + 400, selector: "c" }),
		]);

		expect(marcarRageClicks(eventos).every((e) => e.type === "click")).toBe(true);
	});
});
