import { describe, expect, it } from "vitest";
import { ensureLeadingUserTurn, MESA_COPILOT_KICKOFF } from "./index";

// Orientação PROATIVA no claim: o copiloto empurra o passo a passo ANTES de o atendente
// escrever. Isso faz o histórico começar por uma fala do copiloto (assistant). A Anthropic
// exige que a 1ª mensagem seja `user` — ensureLeadingUserTurn garante isso em tempo de
// chamada, sem poluir o histórico persistido em mesa_copilot_messages.
describe("mesa-copilot ensureLeadingUserTurn — 1ª msg tem que ser user (Anthropic)", () => {
	it("histórico começando por assistant (orientação proativa) ganha um turno user na frente", () => {
		const out = ensureLeadingUserTurn([
			{ role: "assistant", content: "🧭 Passo 1: acesse o portal da administradora." },
			{ role: "user", content: "e se faltar o comprovante?" },
		]);
		expect(out).toHaveLength(3);
		expect(out[0]).toEqual({ role: "user", content: MESA_COPILOT_KICKOFF });
		expect(out[1].role).toBe("assistant");
		expect(out[2].role).toBe("user");
	});

	it("histórico já começando por user fica intacto (sem kickoff duplicado)", () => {
		const out = ensureLeadingUserTurn([{ role: "user", content: "como faço o cadastro?" }]);
		expect(out).toHaveLength(1);
		expect(out[0]).toEqual({ role: "user", content: "como faço o cadastro?" });
	});

	it("histórico vazio vira só o kickoff (defensivo)", () => {
		expect(ensureLeadingUserTurn([])).toEqual([{ role: "user", content: MESA_COPILOT_KICKOFF }]);
	});
});
