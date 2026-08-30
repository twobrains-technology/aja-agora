/**
 * A prateleira monta com a identidade da casa quando o cliente ainda não deu a
 * dele — e devolve a do cliente assim que ela existe.
 *
 * `ensureOffers` (bevi-self-contract-adapter.ts:283) lança
 * `IdentityNotCollectedError` quando `getIdentity()` devolve `null`. Era esse
 * `null` que obrigava o funil a arrancar o CPF antes de qualquer oferta. A
 * vitrine preenche o buraco sem mentir sobre quem é o cliente: a identidade
 * REAL, quando existe, sempre tem precedência.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverySessionForConversation } from "./discovery-session";

const CPF_VITRINE = "11144477735";
const CELULAR_VITRINE = "62992496793";
const ENV_ORIGINAL = { ...process.env };

const metaVazia = async () => ({}) as never;

beforeEach(() => {
	process.env.VITRINE_CPF = CPF_VITRINE;
	process.env.VITRINE_CELULAR = CELULAR_VITRINE;
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("discoverySessionForConversation — identidade da busca", () => {
	it("usa a identidade da casa quando o cliente ainda não se identificou", async () => {
		const sessao = discoverySessionForConversation("conv-1", {
			loadIdentityImpl: async () => null,
			reloadMetaImpl: metaVazia,
		});

		expect(await sessao.getIdentity()).toEqual({
			cpf: CPF_VITRINE,
			celular: CELULAR_VITRINE,
		});
	});

	it("PREFERE a identidade real do cliente sempre que ela existe", async () => {
		// Depois do fecho, a busca tem que rodar sob o CPF de quem vai assinar —
		// senão a re-simulação que ancora o contrato sairia da conta errada.
		const doCliente = { cpf: "52998224725", celular: "11987654321" };
		const sessao = discoverySessionForConversation("conv-1", {
			loadIdentityImpl: async () => doCliente,
			reloadMetaImpl: metaVazia,
		});

		expect(await sessao.getIdentity()).toEqual(doCliente);
	});

	it("devolve null sem vitrine e sem cliente — o erro antigo continua existindo", async () => {
		// Nada de vitrine implícita: sem env, `ensureOffers` volta a lançar
		// IdentityNotCollectedError e o funil volta a pedir o CPF antes da busca.
		process.env.VITRINE_CPF = "";
		process.env.VITRINE_CELULAR = "";
		const sessao = discoverySessionForConversation("conv-1", {
			loadIdentityImpl: async () => null,
			reloadMetaImpl: metaVazia,
		});

		expect(await sessao.getIdentity()).toBeNull();
	});
});
