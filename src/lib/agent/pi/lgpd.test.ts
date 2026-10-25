import { describe, expect, it } from "vitest";
import { clienteAceitouLgpd, resolverAceiteLgpd } from "./lgpd";

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
