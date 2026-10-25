import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVISO_LGPD, clienteAceitouLgpd, garanteAvisoLgpd, resolverAceiteLgpd } from "./lgpd";
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
