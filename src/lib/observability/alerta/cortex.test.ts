// A leitura da resposta do Cortex tem teste próprio por um motivo medido, não
// teórico: em 2026-08-13, testando contra o servidor real
// (tb-cortex.twobrainstechnology.com), `abrir_ocorrencia` num projeto
// inexistente respondeu **HTTP 200, `isError: false`**, com a falha escondida
// dentro do texto do content. Quem confiar em `isError` vai logar
// "ocorrência aberta" para um card que nunca existiu — e o alerta some sem que
// ninguém perceba.
import { describe, expect, it } from "vitest";
import { lerRespostaDoCortex, prioridadeDaSeveridade } from "./cortex";

describe("resposta do Cortex", () => {
	it("sucesso: content com o card criado", () => {
		const corpo = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			result: {
				isError: false,
				content: [{ type: "text", text: JSON.stringify({ id: "oc-1", titulo: "x" }) }],
			},
		});
		expect(lerRespostaDoCortex(corpo)).toEqual({ ok: true });
	});

	// O caso REAL medido — 200 + isError:false + erro no texto.
	it("falha disfarçada de sucesso: isError=false com {erro} dentro do texto", () => {
		const corpo = JSON.stringify({
			jsonrpc: "2.0",
			id: 3,
			result: {
				isError: false,
				content: [
					{
						type: "text",
						text: JSON.stringify({ erro: 'Projeto "__inexistente__" não encontrado' }),
					},
				],
			},
		});
		const r = lerRespostaDoCortex(corpo);
		expect(r.ok).toBe(false);
		expect(r).toMatchObject({ erro: expect.stringContaining("não encontrado") });
	});

	it("erro de JSON-RPC no envelope (auth, método inexistente)", () => {
		const corpo = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "Unauthorized" } });
		expect(lerRespostaDoCortex(corpo)).toEqual({ ok: false, erro: "Unauthorized" });
	});

	it("isError=true continua sendo falha", () => {
		const corpo = JSON.stringify({ result: { isError: true, content: [] } });
		expect(lerRespostaDoCortex(corpo).ok).toBe(false);
	});

	it("corpo ilegível não lança — vira falha", () => {
		expect(lerRespostaDoCortex("<html>502</html>")).toEqual({
			ok: false,
			erro: "resposta ilegível",
		});
	});

	it("resposta em prosa (não-JSON no texto) conta como sucesso", () => {
		const corpo = JSON.stringify({
			result: { isError: false, content: [{ type: "text", text: "Ocorrência criada." }] },
		});
		expect(lerRespostaDoCortex(corpo)).toEqual({ ok: true });
	});
});

// Inflação de urgência mata alerta: se tudo é urgente, nada é.
describe("prioridade da ocorrência", () => {
	it("ALERT vira urgent; o resto vira high", () => {
		expect(prioridadeDaSeveridade("ALERT")).toBe("urgent");
		expect(prioridadeDaSeveridade("WARNING")).toBe("high");
	});
});
