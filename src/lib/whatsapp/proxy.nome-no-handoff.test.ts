// Revisão adversarial, 2026-08-12 — o TERCEIRO caminho de escrita do nome.
//
// Os dois primeiros (`saveContactName`, a tool do modelo; e `captureAnswerNode`,
// a captura determinística do gate) passaram a consultar
// `ehNomeProprioPlausivel`. Este aqui ficou de fora e é o mais exposto de todos:
// em `handlePendingHandoffText`, quando o cliente do WhatsApp pede pra falar com
// gente e ainda não tem nome, o agente pergunta "qual seu nome completo?" e a
// PRÓXIMA mensagem, seja ela qual for, era gravada verbatim em `contactName` —
// sem nenhuma validação.
//
// O estrago é maior que nos outros dois porque o nome vai direto pro atendente
// humano no dossiê do handoff: uma resposta confusa ("não sei", "isso mesmo",
// "pode ser agora") virava o nome do lead na mesa de atendimento.
//
// O handoff NÃO pode ser bloqueado por isso — quem pede atendimento humano
// recebe atendimento humano. O que muda é só o nome não ser gravado quando não
// for nome; o encaminhamento segue igual.

import { describe, expect, it } from "vitest";
import { ehNomeProprioPlausivel } from "@/lib/leads/contact-capture";
import { nomeParaHandoff } from "./proxy";

describe("nome capturado no handoff humano", () => {
	it("aceita nome de verdade", () => {
		expect(nomeParaHandoff("Rafael")).toBe("Rafael");
		expect(nomeParaHandoff("Ana Clara")).toBe("Ana Clara");
		expect(nomeParaHandoff("  Monique  ")).toBe("Monique");
	});

	it("recusa a resposta confusa que virava nome do lead na mesa", () => {
		for (const t of ["não sei", "isso mesmo", "pode ser agora", "sim", "quitar", "voltei"]) {
			expect(nomeParaHandoff(t), t).toBeNull();
		}
	});

	it("recusa vazio e texto sem letra", () => {
		expect(nomeParaHandoff("")).toBeNull();
		expect(nomeParaHandoff("   ")).toBeNull();
		expect(nomeParaHandoff("123456")).toBeNull();
		expect(nomeParaHandoff("👍")).toBeNull();
	});

	it("recusa frase — nome é resposta curta, igual nos outros dois caminhos", () => {
		expect(nomeParaHandoff("quero falar com um atendente agora")).toBeNull();
	});

	it("usa a MESMA fonte de verdade dos outros caminhos de escrita", () => {
		// Se alguém afrouxar a lista compartilhada, este caminho afrouxa junto —
		// que é exatamente o ponto: uma lista só, nunca duas divergentes.
		expect(ehNomeProprioPlausivel("Voltei")).toBe(false);
		expect(nomeParaHandoff("Voltei")).toBeNull();
	});
});
