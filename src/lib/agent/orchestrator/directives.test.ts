import { describe, expect, it } from "vitest";
import {
	buildAdjustValueDirective,
	buildAdvanceToContractDirective,
	buildChooseOfferDirective,
	buildDiscoveryFailedFallback,
	buildEmbeddedBidDirective,
	buildLanceReactionDirective,
	buildLanceSoParcelaDirective,
	buildQualifyStartYesDirective,
	buildScarcityDirective,
	buildToolErrorRecoveryFallback,
	buildToolErrorRecoveryFallbackRepeat,
	buildToolErrorRecoveryResolvedFallback,
	buildTransitionFirstContactDirective,
	TWO_PATHS_FOLLOWUP_TEXT,
} from "./directives";

// FIX-266 (P1, veredito Fable r6, "o que segura o 7" #1): o fallback do
// tool-error/cap (FIX-262) pedia "me diz o nome da administradora" mesmo
// quando o usuário TINHA acabado de nomear uma oferta já exibida — contenção
// sem resolução. `buildToolErrorRecoveryResolvedFallback` transforma a
// contenção em resolução: reafirma os dados da oferta já ancorada, sem pedir
// de novo o que o usuário já disse. `buildToolErrorRecoveryFallbackRepeat`
// cobre o caso sem resolução: nunca repete a MESMA frase 2×, oferece a lista
// concreta das cotas já exibidas na 2ª ocorrência.
describe("FIX-266 — recuperação do tool-error transforma contenção em resolução", () => {
	const offerItau = {
		groupId: "g-itau",
		administradora: "ITAU",
		creditValue: 92902,
		termMonths: 120,
		monthlyPayment: 1580.5,
	};

	it("buildToolErrorRecoveryResolvedFallback reafirma a oferta resolvida — NUNCA pede o nome de novo", () => {
		const text = buildToolErrorRecoveryResolvedFallback({ name: "Mario", offer: offerItau });
		expect(text).not.toMatch(/me diz o nome/i);
		expect(text).toMatch(/ITAU/i);
		expect(text).toMatch(/92\.902|92902/);
	});

	it("buildToolErrorRecoveryResolvedFallback sem nome do contato não quebra (sem saudação)", () => {
		const text = buildToolErrorRecoveryResolvedFallback({ name: null, offer: offerItau });
		expect(text.length).toBeGreaterThan(0);
		expect(text).toMatch(/ITAU/i);
	});

	it("buildToolErrorRecoveryFallbackRepeat NUNCA é idêntico ao fallback genérico (1ª ocorrência)", () => {
		const first = buildToolErrorRecoveryFallback({ name: "Mario" });
		const repeat = buildToolErrorRecoveryFallbackRepeat({ name: "Mario", offers: [offerItau] });
		expect(repeat).not.toBe(first);
	});

	it("buildToolErrorRecoveryFallbackRepeat lista as opções concretas já exibidas", () => {
		const repeat = buildToolErrorRecoveryFallbackRepeat({
			name: "Mario",
			offers: [
				offerItau,
				{ groupId: "g-bb", administradora: "BANCO DO BRASIL", creditValue: 90000 },
			],
		});
		expect(repeat).toMatch(/ITAU/i);
		expect(repeat).toMatch(/BANCO DO BRASIL/i);
	});

	it("buildToolErrorRecoveryFallbackRepeat sem ofertas exibidas ainda difere do fallback genérico", () => {
		const first = buildToolErrorRecoveryFallback({ name: "Mario" });
		const repeat = buildToolErrorRecoveryFallbackRepeat({ name: "Mario", offers: [] });
		expect(repeat).not.toBe(first);
		expect(repeat.length).toBeGreaterThan(0);
	});
});

// FIX-186 (Kairo 2026-07-01) — a mensagem determinística de fallback quando a
// descoberta na Bevi falha após retry. É a copy FIXA que substitui a narração
// crua do modelo ("dificuldade técnica pontual"). NÃO é directive pro modelo — é
// o texto que chega DIRETO ao usuário (Lei 1: código dispõe). Por isso: PT-BR
// correto (acentos) e ZERO palavra de erro técnico cru.
// FIX-246 (rodada 3, Fable r2 — causa-raiz): o card `two_paths` continuava
// órfão mesmo com o directive instruindo "chame present_two_paths" (0
// emissões em 2 conduções) — invariante no PROMPT, não em CÓDIGO (Lei 1/4).
// Agora o directive só escreve a frase de introdução (o LLM NÃO chama tool
// nenhuma); o card é emitido SERVER-SIDE determinístico pelo handler
// (buildTwoPathsCard) e o convite pra decidir é o texto FIXO
// TWO_PATHS_FOLLOWUP_TEXT — nunca a critério do modelo.
describe("buildLanceSoParcelaDirective — 3ª saída do lance ('só a parcela')", () => {
	it("NÃO instrui a chamar nenhuma tool (emissão do card é server-side, FIX-246)", () => {
		const d = buildLanceSoParcelaDirective();
		expect(d).not.toMatch(/present_two_paths/);
		expect(d.toLowerCase()).toMatch(/n[ãa]o chame.*tool/);
	});

	it("proíbe explicar lance embutido ou chamar a agulha/simulação", () => {
		const d = buildLanceSoParcelaDirective();
		expect(d).toMatch(/N[ÃA]O explique lance embutido/i);
		expect(d).toMatch(/N[ÃA]O chame simulate_quota/i);
		expect(d).toMatch(/present_contemplation_dial/);
	});

	it("instrui a escrever SÓ a frase de introdução (o card + convite ficam por conta do sistema)", () => {
		const d = buildLanceSoParcelaDirective();
		expect(d).toMatch(/APENAS UMA frase/i);
		expect(d).not.toMatch(/recomendo|eu indicaria|melhor caminho/i);
	});
});

describe("TWO_PATHS_FOLLOWUP_TEXT — convite fixo pra decidir (nunca gerado pelo LLM)", () => {
	it("devolve a decisão ao usuário, sem recomendar um caminho (FIX-246: texto fixo, não directive)", () => {
		expect(TWO_PATHS_FOLLOWUP_TEXT.toLowerCase()).toMatch(/n[ãa]o tem certo ou errado/);
		expect(TWO_PATHS_FOLLOWUP_TEXT).not.toMatch(/recomendo|eu indicaria|melhor caminho/i);
	});
});

// FIX-237 (Fable r1, D2.1 gap #3) — os cards embedded_bid/scarcity existiam
// (tool+schema+allowlist) mas eram ÓRFÃOS: nenhum directive instruía o modelo
// a chamá-los, então nunca apareciam em condução real.
// FIX-246 (rodada 3, Fable r2): mesmo com o directive instruindo a tool-call
// (FIX-237), o LLM continuou desobedecendo/errando (0 emissões no veredito
// r2) — a wiring em route.ts/index.ts que dispara o directive no gate certo
// é validada por teste source-level em
// tests/regression/fix-237-cards-orfaos.test.ts; a emissão do CARD em si
// agora é server-side determinística (server-cards.ts), nunca tool-call.
describe("buildEmbeddedBidDirective — card de lance embutido (antes órfão)", () => {
	it("NÃO instrui a chamar nenhuma tool (emissão do card é server-side, FIX-246)", () => {
		const d = buildEmbeddedBidDirective();
		expect(d).not.toMatch(/present_embedded_bid\(/);
		expect(d.toLowerCase()).toMatch(/n[ãa]o chame present_embedded_bid/);
	});

	it("proíbe o modelo de inventar os números (percentual/valor líquido)", () => {
		const d = buildEmbeddedBidDirective();
		expect(d).toMatch(/N[ÃA]O (invente|digita|calcula)/i);
	});

	it("instrui a escrever SÓ a frase de introdução", () => {
		expect(buildEmbeddedBidDirective()).toMatch(/APENAS UMA frase/i);
	});

	// FIX-268 (rodada 7, veredito Fable r6, residual D4): o directive instruía
	// o LLM a "introduzir o conceito" de lance embutido — e o gate
	// `lance-embutido` que dispara LOGO EM SEGUIDA (gate-questions.ts,
	// lanceEmbutidoEdu) já explica o MESMO conceito por completo. Resultado:
	// a mesma definição ("usar parte da carta como lance") saía 2× no mesmo
	// turno, em 2 balões seguidos. O directive não pode mais explicar o
	// conceito — só faz a transição, igual ao buildScarcityDirective.
	it("NÃO explica o conceito de lance embutido (a educação completa vem do gate lance-embutido logo em seguida — evita duplicar a mesma ideia no turno)", () => {
		const d = buildEmbeddedBidDirective();
		expect(d).not.toMatch(/usa(r)? parte da (própria )?carta( de crédito)? como lance/i);
		expect(d.toLowerCase()).toMatch(/n[ãa]o explique o que [ée] lance embutido/);
	});
});

describe("buildScarcityDirective — card de escassez (antes órfão)", () => {
	it("NÃO instrui a chamar nenhuma tool (emissão do card é server-side, FIX-246)", () => {
		const d = buildScarcityDirective();
		expect(d).not.toMatch(/present_scarcity\(/);
		expect(d.toLowerCase()).toMatch(/n[ãa]o chame present_scarcity/);
	});

	it("proíbe inventar o número de vagas ou o total de cotas", () => {
		const d = buildScarcityDirective();
		expect(d).toMatch(/N[ÃA]O invente/i);
		expect(d.toLowerCase()).toMatch(/total de cotas/);
	});

	it("instrui a escrever SÓ a frase de transição", () => {
		expect(buildScarcityDirective()).toMatch(/APENAS UMA frase/i);
	});
});

describe("buildDiscoveryFailedFallback — mensagem determinística de descoberta falhada", () => {
	// As MESMAS palavras que o detector do cassette (Camada 2) reprova na narração
	// crua do modelo. A mensagem determinística tem que passar limpa por elas.
	const PALAVRAS_PROIBIDAS = [
		/problema/i,
		/dificuldade t[ée]cnica/i,
		/instabilidade/i,
		/inst[áa]vel/i,
		/tent[ea]\s+de\s+novo/i,
		/erro/i,
	];

	it("não usa NENHUMA palavra de erro técnico cru", () => {
		const msg = buildDiscoveryFailedFallback({ name: "Maria" });
		for (const rx of PALAVRAS_PROIBIDAS) {
			expect(rx.test(msg), `fallback não pode casar ${rx} — vira narração de erro cru`).toBe(
				false,
			);
		}
	});

	it("é PT-BR correto (acentos/cedilha) — 'opções' com acento, nunca ASCII-fication", () => {
		const msg = buildDiscoveryFailedFallback({ name: "Maria" });
		expect(msg).toContain("opções");
		expect(msg).not.toMatch(/\bopcoes\b|\bnao\b|\bvoce\b/);
	});

	it("oferece as duas saídas acionáveis: re-tentar + especialista da Aja", () => {
		const msg = buildDiscoveryFailedFallback({ name: "Maria" });
		expect(msg.toLowerCase()).toContain("especialista");
		// convite a re-tentar SEM a frase proibida "tente de novo"
		expect(msg.toLowerCase()).toMatch(/daqui a pouco|em instantes|mais tarde|de novo/);
	});

	it("usa o nome do usuário quando conhecido e funciona sem nome", () => {
		expect(buildDiscoveryFailedFallback({ name: "Maria" })).toContain("Maria");
		const semNome = buildDiscoveryFailedFallback({ name: null });
		expect(semNome.length).toBeGreaterThan(0);
		expect(semNome).not.toContain("null");
		expect(semNome).not.toContain("undefined");
	});
});

describe("buildTransitionFirstContactDirective — nome capture", () => {
	it("inclui nameHint quando sistema sabe o nome do user", () => {
		const directive = buildTransitionFirstContactDirective(
			"Automóvel",
			"O usuario se chama Kairo, voce pode usar o primeiro nome.",
		);
		expect(directive).toContain("Kairo");
		expect(directive.toLowerCase()).not.toContain("pergunte o nome");
	});

	it("instrui agent a pedir nome quando nameHint vazio (PF-08)", () => {
		const directive = buildTransitionFirstContactDirective("Automóvel", "");
		expect(directive.toLowerCase()).toContain("nome");
		expect(directive.toLowerCase()).toMatch(/pergunte|peca|como.*chamar/i);
	});

	it("menciona categoria no directive", () => {
		const directive = buildTransitionFirstContactDirective("Imóvel", "");
		expect(directive).toContain("Imóvel");
	});
});

// FIX-29 — directives do clique pós-reveal: "Ajustar valor" reabre o what-if e
// NUNCA inicia fechamento; reafirmar interesse pós-decisão avança pro passo 5.
describe("buildAdjustValueDirective — reabre o ajuste, sem fechamento", () => {
	it("instrui perguntar o novo valor e NÃO simular ainda", () => {
		const d = buildAdjustValueDirective({ administradora: "Itaú", currentCreditValue: 200_000 });
		expect(d).toMatch(/ajustar|novo valor|mudar/i);
		expect(d).toContain("Itaú");
	});

	it("PROÍBE iniciar fechamento (sem lead_form, contract_form ou decision_prompt)", () => {
		const d = buildAdjustValueDirective({ administradora: "Itaú", currentCreditValue: 200_000 });
		expect(d).not.toContain("present_lead_form");
		expect(d).not.toContain("present_contract_form");
		expect(d).not.toContain("present_decision_prompt");
	});
});

describe("buildAdvanceToContractDirective — reafirmou interesse pós-decisão → passo 5", () => {
	it("dirige present_contract_form, NUNCA present_lead_form/consultor", () => {
		const d = buildAdvanceToContractDirective({ administradora: "Itaú" });
		expect(d).toContain("present_contract_form");
		expect(d).not.toContain("present_lead_form");
		expect(d.toLowerCase()).not.toContain("consultor");
	});

	// FIX-216 (Ata 2026-07-04, item 5): terminologia "reserva de cota" — nunca
	// "contratar/fechar". FIX-250 (rodada 3, Fable r2, polish): "é tipo um
	// booking" era inglês solto (inviolável PT-BR) — trocado por "pré-reserva".
	// FIX-256 (rodada 4, veredito Fable FINAL §N-I) — SUPERSEDE o FIX-216:
	// "reserva"/"pré-reserva" ainda implica compromisso pré-contratação,
	// borderline com "nunca 'reservado' antes da contratação". Trocado por
	// "garantir seu lugar" + "pré-cadastro" — nunca contratar/fechar/reserva.
	it("NÃO usa 'reserva' pré-contratação (FIX-256) — nunca contratar/fechar/booking, em PT-BR", () => {
		const d = buildAdvanceToContractDirective({ administradora: "Itaú" });
		expect(d.toLowerCase()).not.toMatch(/contrat|fechar/);
		expect(d.toLowerCase()).not.toMatch(/\bbooking\b/);
		expect(d.toLowerCase()).not.toMatch(/reserv/);
		expect(d.toLowerCase()).toMatch(/n[ãa]o paga nada agora/);
		expect(d.toLowerCase()).toMatch(/boleto/);
	});
});

describe("buildChooseOfferDirective — FIX-256: mesma troca de terminologia (sem 'reserva')", () => {
	it("NÃO usa 'reserva' pré-contratação — nunca contratar/fechar/booking, em PT-BR", () => {
		const d = buildChooseOfferDirective({ administradora: "Itaú" });
		expect(d.toLowerCase()).not.toMatch(/\bbooking\b/);
		expect(d.toLowerCase()).not.toMatch(/reserv/);
		expect(d.toLowerCase()).toMatch(/n[ãa]o paga nada agora/);
		expect(d.toLowerCase()).toMatch(/boleto/);
		expect(d).toContain("present_contract_form");
	});
});

// FIX-272 (rodada 8, veredito Fable r7, D4 residual): o gate `lance` já não
// dizia mais "reserva" (FIX-268, gate-questions.ts) — mas a REAÇÃO ao clique
// (este directive, disparado LOGO DEPOIS da resposta do gate) ainda instruía
// "sobre ter reserva pra lance", e o LLM ecoou o termo na prosa ao vivo 3×
// ("com sua reserva pra lance", "Com sua reserva, dá pra acelerar") — inclusive
// presumindo reserva que o usuário nunca declarou. O directive não pode mais
// induzir nem deixar o modelo livre pra usar a palavra.
describe("buildLanceReactionDirective — FIX-272: 'reserva' varrido também da REAÇÃO (não só da pergunta do gate)", () => {
	it("a descrição do que o usuário respondeu NÃO usa 'reserva' (não prime o LLM com o termo)", () => {
		const d = buildLanceReactionDirective("Sim, tenho como dar");
		// só a parte que descreve a situação pro modelo (antes do "FLUXO:") —
		// a proibição explícita mais adiante PRECISA nomear a palavra que veda.
		const descricao = d.slice(0, d.indexOf("FLUXO:"));
		expect(descricao.toLowerCase()).not.toMatch(/reserv/);
	});

	it("proíbe explicitamente o modelo de dizer 'reserva' na reação", () => {
		const d = buildLanceReactionDirective("Sim, tenho como dar");
		expect(d.toLowerCase()).toMatch(/n[ãa]o diga.*reserva/);
	});

	it("segue reagindo sobre a capacidade de dar lance pra antecipar a contemplação (mesma linguagem do gate, FIX-268)", () => {
		const d = buildLanceReactionDirective("Sim, tenho como dar");
		expect(d.toLowerCase()).toMatch(/lance/);
	});
});

// FIX-194 (qa-dono-produto carro web, defeito E): o agente perguntava "Quanto
// custa o carro?" no MESMO balão do gate que só coleta CPF/celular — o usuário
// não pode responder ali (o valor tem seu próprio passo DEPOIS da identidade,
// FIX-53). O turno consent→identify roda buildQualifyStartYesDirective: ele
// precisa reagir curto e NÃO puxar a pergunta de valor. "Uma coisa por vez."
describe("FIX-194 — turno consent→identify não pergunta o valor/preço do bem", () => {
	it("o directive PROÍBE perguntar o valor/preço (identidade vem antes; o sistema conduz)", () => {
		const d = buildQualifyStartYesDirective();
		// forbid explícito da pergunta de valor.
		expect(d).toMatch(/N[ÃA]O\s+pergunt\w+[^.]*(valor|pre[çc]o)/i);
	});

	it("o directive NÃO contém a pergunta de preço em si (uma coisa por vez)", () => {
		const d = buildQualifyStartYesDirective();
		expect(d.toLowerCase()).not.toMatch(/quanto custa/);
		// não instrui a chamar tool nem a coletar o valor neste turno.
		expect(d).not.toContain("present_value_picker");
	});
});
