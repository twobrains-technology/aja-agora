import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	AVISO_LGPD,
	clienteAceitouLgpd,
	garanteAvisoLgpd,
	PEDE_DADO_RE,
	resolverAceiteLgpd,
} from "./lgpd";
import { montarTrechoDeSaida } from "./turno-livre";

const AVISO =
	"Para gerar a sua proposta, a administradora consulta seu CPF nos birôs de crédito e usa seus dados só para isso, conforme a LGPD. Posso seguir?";

describe("o aceite da LGPD é conferido na conversa, não na última fala", () => {
	it("o caso medido (92dfa1ba): aviso dado antes, no meio o agente pediu o celular", () => {
		const falas = [
			{ role: "assistant" as const, content: AVISO },
			{ role: "user" as const, content: "pode usar, CPF 111.444.777-35" },
			// A última fala do agente NÃO tem o aviso — era isto que fazia a tool recusar.
			{ role: "assistant" as const, content: "Guardado. Qual é o seu celular com DDD?" },
			{ role: "user" as const, content: "11 98765-4321" },
		];
		const r = resolverAceiteLgpd({ falas });
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("aviso dado no MESMO turno é visto, mas sem o sim do cliente ainda não é aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "user", content: "quero seguir" }],
			textoDoTurno: `${AVISO} Posso gerar?`,
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});

	it("o sim do cliente neste turno fecha o aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "assistant", content: AVISO }],
			falaDoCliente: "pode usar",
		});
		expect(r.ok).toBe(true);
	});

	it("aceite já registrado vale uma vez e não pede aviso de novo", () => {
		const r = resolverAceiteLgpd({
			falas: [],
			aceiteJaGravado: { em: "2026-10-25T00:00:00Z", fala: "sim" },
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-ja-registrado");
	});

	it("sem aviso dado é aviso pendente, não aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "user", content: "sim" }],
			falaDoCliente: "sim",
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aviso-nao-dado");
	});

	it("negativa não é aceite", () => {
		expect(clienteAceitouLgpd("não pode")).toBe(false);
		expect(clienteAceitouLgpd("pode usar")).toBe(true);
		expect(clienteAceitouLgpd("sim, pode")).toBe(true);
	});
});

describe("o aviso vem antes do pedido de dado — decidido no harness, não no prompt", () => {
	it("fala que pede CPF sem aviso: o aviso ocupa a mensagem e o pedido fica pro aceite", () => {
		const r = garanteAvisoLgpd({
			texto: "Você escolheu a Canopus. Me passa seu CPF pra eu gerar a proposta.",
			avisoJaDado: false,
		});
		expect(r.avisoAdicionado).toBe(true);
		expect(r.pedidoAdiado).toBe(true);
		expect(r.texto).toContain("conforme a LGPD. Posso seguir?");
		// O acolhimento não se joga fora; o que se adia é o PEDIDO, até haver sim.
		expect(r.texto).toContain("Você escolheu a Canopus.");
		expect(r.texto.indexOf("LGPD")).toBeLessThan(r.texto.length);
	});

	it("aviso já dado na conversa: nada se repete", () => {
		const r = garanteAvisoLgpd({ texto: "Me passa seu CPF?", avisoJaDado: true });
		expect(r.avisoAdicionado).toBe(false);
		expect(r.texto).toBe("Me passa seu CPF?");
	});

	it("fala que não pede dado não é tocada", () => {
		const r = garanteAvisoLgpd({
			texto: "Qual prazo te serve, 48 ou 80 meses?",
			avisoJaDado: false,
		});
		expect(r.avisoAdicionado).toBe(false);
	});

	it("o aviso não é cortado pelo verificador de uma pergunta por mensagem", () => {
		const r = montarTrechoDeSaida({
			texto: "Você escolheu a Canopus. Me passa seu CPF, por favor, conforme a LGPD. Posso seguir?",
			avisoDado: false,
		});
		expect(r.texto.startsWith("Para gerar a sua proposta")).toBe(true);
		expect(r.texto).toContain("Você escolheu a Canopus");
		// Uma pergunta por mensagem: a pergunta do balão é a do aviso.
		expect((r.texto.match(/\?/g) ?? []).length).toBe(1);
	});

	it("o trecho que sai no balão aplica o aviso antes do pedido de dado", () => {
		const r = montarTrechoDeSaida({
			texto: "Legal! Me passa seu CPF pra eu gerar a proposta.",
			avisoDado: false,
		});
		expect(r.avisoAplicado).toBe(true);
		expect(r.texto).toContain("conforme a LGPD. Posso seguir?");
		// Com o aviso já dado na conversa, o mesmo trecho sai como o modelo escreveu.
		const depois = montarTrechoDeSaida({ texto: "Me passa seu CPF?", avisoDado: true });
		expect(depois.avisoAplicado).toBe(false);
		expect(depois.texto).toBe("Me passa seu CPF?");
	});

	// O turno não pode deixar de aplicar a guarda: se `soltarTrecho` voltar a só
	// mascarar CPF e contar pergunta, o aviso depende outra vez da boa vontade do modelo.
	it("o turno aplica a guarda em cada trecho que sai no balão", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const corpo = fonte.slice(fonte.indexOf("const soltarTrecho"), fonte.indexOf("const executar"));
		expect(corpo).toMatch(/montarTrechoDeSaida\(\{[^}]*texto:\s*pendente[^}]*avisoDado/);
		expect(corpo).not.toContain("manterUmaPergunta(scrubCpf(");
		expect(fonte).toMatch(/avisoDado = historico\.some/);
	});

	it("o aviso canônico do harness é o mesmo da skill", () => {
		const skill = readFileSync(
			new URL("./skills/proposta-com-dados-do-cliente/SKILL.md", import.meta.url).pathname,
			"utf8",
		);
		const norm = (t: string) => t.replace(/\s+/g, " ").trim();
		expect(norm(skill)).toContain(norm(AVISO_LGPD));
	});
});

describe("L32/N04 — só é pedido de dado quando há ato de pedir", () => {
	it("mencionar o canal ou o cadastro não é pedir dado", () => {
		for (const fala of [
			"Atendemos pelo WhatsApp, de segunda a sexta.",
			"Seu celular cadastrado recebe o contrato por WhatsApp.",
			"O telefone da administradora aparece no contrato.",
			"O contrato informa o telefone da administradora.",
		]) {
			expect(PEDE_DADO_RE.test(fala), fala).toBe(false);
			const r = garanteAvisoLgpd({ texto: fala, avisoJaDado: false });
			expect(r.avisoAdicionado, fala).toBe(false);
			expect(r.texto, fala).toBe(fala);
		}
	});

	it("o pedido de dado de verdade continua sendo pedido", () => {
		for (const fala of [
			"Me passa seu CPF pra eu gerar a proposta.",
			"Qual é o seu celular com DDD?",
			"Preciso do seu CPF para simular.",
			"Envie o número do seu WhatsApp, por favor.",
			"Pode me passar seu CPF?",
		]) {
			expect(PEDE_DADO_RE.test(fala), fala).toBe(true);
		}
	});

	it("o balão não troca a fala sobre o canal por um aviso de consentimento", () => {
		const r = montarTrechoDeSaida({
			texto:
				"Atendemos pelo WhatsApp, de segunda a sexta. Seu celular cadastrado recebe o contrato por lá.",
			avisoDado: false,
		});
		expect(r.avisoAplicado).toBe(false);
		expect(r.texto).not.toContain("conforme a LGPD");
	});
});

describe("L08 — pergunta e recusa não viram aceite; aviso novo não apaga aceite dado", () => {
	it("pergunta sobre a LGPD ou sobre o dado não é aceite", () => {
		expect(clienteAceitouLgpd("o que é LGPD?")).toBe(false);
		expect(clienteAceitouLgpd("pra que vocês querem meu CPF?")).toBe(false);
		expect(clienteAceitouLgpd("posso saber pra que vocês usam meu CPF?")).toBe(false);
		expect(clienteAceitouLgpd("pode explicar melhor?")).toBe(false);
	});

	it("recusa não é aceite", () => {
		expect(clienteAceitouLgpd("não")).toBe(false);
		expect(clienteAceitouLgpd("não aceito")).toBe(false);
		expect(clienteAceitouLgpd("prefiro não")).toBe(false);
		expect(clienteAceitouLgpd("não, obrigado")).toBe(false);
	});

	it("afirmação de verdade continua sendo aceite", () => {
		expect(clienteAceitouLgpd("sim, pode usar")).toBe(true);
		expect(clienteAceitouLgpd("Pode usar. E qual é o prazo?")).toBe(true);
	});

	it("a pergunta do cliente depois do aviso não fecha o aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "assistant", content: AVISO }],
			falaDoCliente: "pode explicar o que vocês fazem com meu CPF?",
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});

	it("um aviso novo no turno não apaga o sim já dado", () => {
		const r = resolverAceiteLgpd({
			falas: [
				{ role: "assistant", content: AVISO },
				{ role: "user", content: "sim, pode usar" },
			],
			textoDoTurno: `${AVISO} Só confirmando: posso seguir?`,
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});
});

// P262 da re-auditoria: na main a recusa tem prioridade sobre o aceite
// (`src/lib/whatsapp/contract-capture.ts:87`). Aqui o consentimento é resolvido na
// ORDEM da conversa, e uma recusa posterior revoga o sim anterior.
describe("P262 — o consentimento é cronológico: recusa posterior revoga o sim", () => {
	const aviso = { role: "assistant" as const, content: AVISO };

	it("aviso → sim → não autorizo: sem autorização", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim, pode usar" }],
			falaDoCliente: "não autorizo",
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aceite-revogado");
	});

	it("aviso → sim → não autorizo, tudo no histórico: sem autorização", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "sim, pode usar" },
				{ role: "assistant", content: "Qual prazo te serve, 48 ou 80 meses?" },
				{ role: "user", content: "não autorizo" },
			],
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aceite-revogado");
	});

	it("aviso → não autorizo → sim: o cliente voltou atrás e autorizou", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "não autorizo" }],
			falaDoCliente: "pode usar meus dados",
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("revogação depois de novo sim: o sim mais recente vale outra vez", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "sim, pode usar" },
				{ role: "user", content: "não autorizo mais" },
				{ role: "user", content: "pensando bem, pode usar" },
			],
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("o aceite GRAVADO também é revogado por uma recusa posterior", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim" }, { role: "user", content: "não autorizo" }],
			aceiteJaGravado: { em: "2026-10-25T00:00:00Z", fala: "sim" },
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aceite-revogado");
	});

	it("o aceite gravado continua valendo quando ninguém revogou", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim" }, { role: "user", content: "48 meses" }],
			aceiteJaGravado: { em: "2026-10-25T00:00:00Z", fala: "sim" },
		});
		expect(r.ok).toBe(true);
	});

	// Revogar é falar da AUTORIZAÇÃO. Recusar um detalhe da oferta depois do sim não
	// pode travar a proposta — senão toda negociação de prazo revogaria o consentimento.
	it("recusar um detalhe da oferta depois do sim não revoga o consentimento", () => {
		for (const fala of [
			"não aceito o prazo de 80 meses, prefiro 48",
			"não quero mais essa carta, me mostra outra",
			"não quero a parcela de 900",
		]) {
			const r = resolverAceiteLgpd({
				falas: [aviso, { role: "user", content: "sim, pode usar" }],
				falaDoCliente: fala,
			});
			expect(r.motivo, fala).toBe("aceite-do-cliente");
		}
	});

	it("perguntar sobre a revogação não é revogar", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim, pode usar" }],
			falaDoCliente: "posso revogar isso depois?",
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("recusa antes de qualquer sim é falta de aceite, não revogação", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "não autorizo" }],
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});
});
