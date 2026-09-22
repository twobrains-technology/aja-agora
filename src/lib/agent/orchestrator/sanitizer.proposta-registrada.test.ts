// Produção, WEB, 2026-09-21 01:41 — conversa do lead `9f8e7d6c`:
//
//     "Sua proposta já está registrada e seguindo com a Âncora."
//
// E o banco: ZERO linhas em `bevi_proposals` para aquela conversa. A fala
// afirmou um fato que o servidor não tem.
//
// Por que este guard NÃO é o anti-padrão que o CLAUDE.md proíbe: ele é ancorado
// num FATO do servidor (`ctx.hasProposal` / `ctx.contractClosed`), como o
// `isPrematureReservationClaim` que o próprio CLAUDE.md cita como exemplo do
// guard legítimo. A MESMA frase tem de passar quando a proposta existe — é o
// par de testes abaixo, na mesma string. O que o guard reconhece é a MORFOLOGIA
// DO ATO (verbo de registro em estado consumado + objeto `proposta`), não uma
// lista de paráfrases.
import { describe, expect, it } from "vitest";
import { EphemeralTextFilter, isUnfoundedRegistrationClaim } from "./sanitizer";

const SEM_PROPOSTA = {
	hasProposal: false,
	contractClosed: false,
	hasReceivedDocuments: false,
	hasSearchToolCall: true,
};
const COM_PROPOSTA = { ...SEM_PROPOSTA, hasProposal: true };

/** A fala exata do incidente — o par "barra sem proposta / passa com proposta"
 * roda sobre ESTA string. */
const FALA_DO_INCIDENTE = "Sua proposta já está registrada e seguindo com a Âncora.";

describe("proposta 'registrada' sem proposta registrada", () => {
	it("barra a frase exata de produção quando não existe proposta", () => {
		expect(isUnfoundedRegistrationClaim(FALA_DO_INCIDENTE, SEM_PROPOSTA)).toBe(true);
	});

	it("COM proposta criada, a MESMA frase passa", () => {
		expect(isUnfoundedRegistrationClaim(FALA_DO_INCIDENTE, COM_PROPOSTA)).toBe(false);
	});

	it("com contrato fechado, a MESMA frase também passa", () => {
		expect(
			isUnfoundedRegistrationClaim(FALA_DO_INCIDENTE, {
				...SEM_PROPOSTA,
				contractClosed: true,
			}),
		).toBe(false);
	});

	it("pega as outras formas consumadas do mesmo ato", () => {
		expect(isUnfoundedRegistrationClaim("Já registramos sua proposta.", SEM_PROPOSTA)).toBe(true);
		expect(isUnfoundedRegistrationClaim("Registrei a proposta dele agora.", SEM_PROPOSTA)).toBe(
			true,
		);
		expect(
			isUnfoundedRegistrationClaim("Sua proposta foi enviada pra análise.", SEM_PROPOSTA),
		).toBe(true);
	});

	it("pergunta de verdade (sem o sujeito nosso) não é barrada", () => {
		expect(isUnfoundedRegistrationClaim("E aí, já foi registrada?", SEM_PROPOSTA)).toBe(false);
	});

	it("suposição e futuro não afirmam registro", () => {
		expect(
			isUnfoundedRegistrationClaim(
				"Se sua proposta for registrada, você recebe o contrato por e-mail.",
				SEM_PROPOSTA,
			),
		).toBe(false);
		expect(
			isUnfoundedRegistrationClaim("Vou enviar sua proposta pro sistema agora.", SEM_PROPOSTA),
		).toBe(false);
	});

	// A fala HONESTA é o remédio, não a doença: é o que o turno precisa dizer no
	// lugar da afirmação barrada ("falta você confirmar os dados"). Apagá-la
	// devolveria o turno mudo que a lane proíbe.
	it("a negação — próximo passo honesto — não é barrada", () => {
		expect(
			isUnfoundedRegistrationClaim(
				"Sua proposta ainda não está registrada — falta você confirmar os dados.",
				SEM_PROPOSTA,
			),
		).toBe(false);
		expect(isUnfoundedRegistrationClaim("Não registramos nada ainda.", SEM_PROPOSTA)).toBe(false);
	});

	it("não vira rede de arrasto: registro de OUTRA coisa é fala legítima", () => {
		expect(
			isUnfoundedRegistrationClaim("Seu telefone está registrado aqui, obrigado.", SEM_PROPOSTA),
		).toBe(false);
		expect(
			isUnfoundedRegistrationClaim("Já registrei seu interesse no simulador.", SEM_PROPOSTA),
		).toBe(false);
	});
});

describe("fiação no filtro: o motivo próprio chega ao guard de turno-vazio", () => {
	it("dropa o segmento e reporta 'unfounded-registration'", () => {
		const filtro = new EphemeralTextFilter(() => SEM_PROPOSTA);
		const saida =
			filtro.push(`${FALA_DO_INCIDENTE} Me confirma seus dados pra seguir?`) + filtro.flush();
		expect(saida).not.toContain("registrada");
		expect(filtro.droppedSegmentReasons()).toContain("unfounded-registration");
	});

	it("com proposta criada, a mesma fala sai inteira", () => {
		const filtro = new EphemeralTextFilter(() => COM_PROPOSTA);
		const saida = filtro.push(FALA_DO_INCIDENTE) + filtro.flush();
		expect(saida).toContain("registrada");
		expect(filtro.droppedSegmentReasons()).not.toContain("unfounded-registration");
	});
});
