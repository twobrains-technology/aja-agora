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

	it("preserva o texto do alvo como estava na tela — inclusive dado do cliente", () => {
		// A filtragem de CPF/e-mail/telefone saiu em 18/08/2026 (ver `sanitizeLabel`).
		// O rótulo é o retrato do que a pessoa tocou, e é assim que ele serve pra
		// reconstruir o comportamento: um card de confirmação tem que aparecer no
		// painel como card de confirmação, não como frase com buracos.
		const cartao = "Vamos confirmar seu plano CPF 123.456.789-09 Celular (62) 99999-8888";

		expect(sanitizeLabel(cartao)).toBe(cartao);
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

describe("normalizeEvent — eventos de chat", () => {
	/** O que o teatro manda. Sem coordenada: o painel é `fixed`, posição não diz nada. */
	function chatCru(over: Record<string, unknown> = {}) {
		return {
			type: "chat_open",
			path: "/",
			viewportWidth: 390,
			viewportHeight: 844,
			at: AGORA,
			...over,
		};
	}

	it("aceita a abertura do teatro, com a seção do CTA que a originou", () => {
		// A seção responde a pergunta que decide a landing: o CTA do hero traz
		// gente que conversa, ou é o do rodapé, depois de ler a página inteira?
		expect(normalizeEvent(chatCru({ section: "kv-footer", label: "vazia" }))).toMatchObject({
			type: "chat_open",
			section: "kv-footer",
			label: "vazia",
			device: "mobile",
		});
	});

	it("guarda a conversa quando ela existe, e segue sem ela quando não existe", () => {
		// Abrir o teatro NÃO cria conversa — é justamente o buraco que estes
		// eventos existem pra tapar. Exigir `conversationId` aqui descartaria
		// exatamente quem abriu e nunca escreveu.
		const comConversa = normalizeEvent(
			chatCru({ conversationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }),
		);
		expect(comConversa?.conversationId).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");

		expect(normalizeEvent(chatCru())?.conversationId).toBeNull();
	});

	it("descarta id de conversa forjado sem perder o evento", () => {
		// Endpoint público: qualquer um manda o que quiser nesse campo. Coluna é
		// UUID no Postgres, e string torta quebraria o INSERT do lote inteiro.
		const evento = normalizeEvent(chatCru({ conversationId: "'; drop table --" }));

		expect(evento).not.toBeNull();
		expect(evento?.conversationId).toBeNull();
	});

	it("mede a espera: o tempo vem no evento, não é inferido depois", () => {
		// `chat_receive` responde quanto a pessoa esperou o agente. Inferir isso
		// por diferença de `created_at` mediria o atraso do lote, não a espera.
		expect(normalizeEvent(chatCru({ type: "chat_receive", duracaoMs: 4200 }))?.duracaoMs).toBe(
			4200,
		);
		expect(normalizeEvent(chatCru({ type: "chat_typing", duracaoMs: 900 }))?.duracaoMs).toBe(900);
	});

	it("zera duração impossível, mas mantém o evento — o fato vale mais que o número", () => {
		expect(normalizeEvent(chatCru({ type: "chat_close", duracaoMs: -5 }))?.duracaoMs).toBeNull();
		expect(
			normalizeEvent(chatCru({ type: "chat_close", duracaoMs: 99_999_999_999 }))?.duracaoMs,
		).toBeNull();
		expect(normalizeEvent(chatCru({ type: "chat_close" }))).not.toBeNull();
	});

	it("registra COMO a pessoa fechou — X, scrim ou Esc são desistências diferentes", () => {
		expect(normalizeEvent(chatCru({ type: "chat_close", label: "scrim" }))).toMatchObject({
			type: "chat_close",
			label: "scrim",
		});
	});

	it("aceita toque dentro do chat sem coordenada nenhuma", () => {
		// O clique da landing exige `relX/relY/pageRelX`. Aqui não: o teatro é
		// `fixed`, e `clientY + scrollY` desenharia o ponto numa seção da página
		// que a pessoa nunca tocou. O que importa é O QUE foi tocado.
		expect(
			normalizeEvent(
				chatCru({
					type: "chat_card_click",
					selector: "@data-heat-id=card-simular",
					label: "Simular ITAÚ",
				}),
			),
		).toMatchObject({
			type: "chat_card_click",
			selector: "@data-heat-id=card-simular",
			label: "Simular ITAÚ",
			relX: null,
			pageRelX: null,
		});
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
