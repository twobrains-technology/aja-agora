/**
 * Vitrine e Trilho B não convivem — e o boot diz isso, não o cliente.
 *
 * A loja self-contract opera sobre UMA proposta corrente por `storeHash`. Com a
 * vitrine ligada, essa proposta é quase sempre a da casa. Então, no Trilho B:
 *
 *   1. o cliente escolhe a cota e fecha;
 *   2. `create-proposal` devolve `Duplicated Hash`;
 *   3. a retomada confere o dono e recusa (`PropostaDeOutroTitularError`).
 *
 * A recusa está CERTA — é ela que impede o contrato nascer em nome do titular da
 * vitrine. Mas o efeito combinado é que nenhuma venda fecha, e o cliente só
 * descobre no último clique, depois de escolher.
 *
 * Uma variável de ambiente separava a catástrofe (contrato errado) da paralisia
 * (nenhum contrato). Nenhuma das duas pode passar em silêncio: a primeira é
 * barrada no fecho, a segunda no boot.
 *
 * Produção hoje roda `PROPOSAL_GATEWAY=bevi` (Trilho A), onde nada disso se
 * aplica — o fechamento cria proposta própria com o CPF real.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setProposalGatewayForTests, getProposalGateway } from "./index";

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	__setProposalGatewayForTests(null); // limpa o cache do singleton
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
	__setProposalGatewayForTests(null);
});

describe("getProposalGateway — vitrine × Trilho B", () => {
	it("RECUSA no boot quando o Trilho B roda com a vitrine ligada", () => {
		process.env.PROPOSAL_GATEWAY = "selfcontract";
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";

		expect(() => getProposalGateway()).toThrow(/incompat[íi]vel com a VITRINE/i);
	});

	it("a mensagem diz o que fazer, não só o que deu errado", () => {
		process.env.PROPOSAL_GATEWAY = "selfcontract";
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";

		expect(() => getProposalGateway()).toThrow(/storeHash dedicado|Desligue VITRINE/i);
	});

	it("Trilho B SEM vitrine continua funcionando — não quebramos o caminho existente", () => {
		process.env.PROPOSAL_GATEWAY = "selfcontract";
		process.env.VITRINE_CPF = "";
		process.env.VITRINE_CELULAR = "";
		process.env.BEVI_SELFCONTRACT_HASH = "hash-de-teste";

		expect(() => getProposalGateway()).not.toThrow();
	});

	it("Trilho A (o de produção) NÃO é bloqueado pela vitrine", () => {
		// Ele exige o próprio token, e é isso que reclama aqui — não a vitrine.
		// O ponto do caso é que o guard novo não alcança o gateway de produção.
		process.env.PROPOSAL_GATEWAY = "bevi";
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";

		expect(() => getProposalGateway()).not.toThrow(/incompat[íi]vel com a VITRINE/i);
	});
});
