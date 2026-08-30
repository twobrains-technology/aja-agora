/**
 * A proposta retomada tem que ser DO CLIENTE que está fechando.
 *
 * Este é o desastre que a vitrine tornou determinístico, e que o guard do
 * `startContract` NÃO cobre — ele barra apenas o caso em que o CPF DA CASA chega
 * como input, que nenhum caminho legítimo produz. O caminho real é outro:
 *
 *   1. a vitrine abre a proposta corrente do `storeHash` com o CPF da casa;
 *   2. o cliente escolhe a cota e fecha, com o CPF REAL dele;
 *   3. `createProposal` recebe `400 Duplicated Hash` (a loja só tem uma
 *      proposta corrente por hash, e ela é a da vitrine);
 *   4. o gateway engole o erro, chama `/system` e adota o `proposalId` que
 *      voltar — sem conferir de quem é;
 *   5. `insertAdditionalData` anexa RG e endereço DO CLIENTE nessa proposta, e
 *      `finalize()` a envia à administradora em nome do titular da vitrine.
 *
 * `/system` resolve a proposta corrente só pelo hash — não devolve CPF —, então
 * a checagem tem que ser explícita: `get-multi-proposal/{cpf}` lista as
 * propostas daquele CPF. Se a proposta corrente não está lá, ela não é dele.
 *
 * Antes da vitrine isso era corrida rara entre duas conversas simultâneas. Com
 * a vitrine, a proposta corrente é quase sempre a da casa — o que era acidente
 * vira o caso comum. Produção roda `PROPOSAL_GATEWAY=bevi` (Trilho A) e não
 * passa por aqui; uma variável de ambiente separa um mundo do outro.
 */
import { describe, expect, it, vi } from "vitest";
import { DuplicatedProposalError, PropostaDeOutroTitularError } from "./bevi-errors";
import { BeviSelfContractProposalGateway } from "./bevi-self-contract-proposal-gateway";

const CPF_CLIENTE = "52998224725";
const CPF_DA_CASA = "11144477735";

/** Cliente falso do self-contract: a loja já tem uma proposta corrente (a da
 *  vitrine, aberta com o CPF da casa). */
function clienteComPropostaDaCasa(propostasDoCpf: string[] = []) {
	return {
		createProposal: vi.fn(async () => {
			throw new DuplicatedProposalError("Duplicated Hash");
		}),
		getSystemState: vi.fn(async () => ({
			proposalId: "prop-da-vitrine",
			currentStepSlug: "simulation",
			situation: "",
		})),
		getMultiProposal: vi.fn(async (_cpf: string) =>
			propostasDoCpf.map((id) => ({
				proposalId: id,
				hashId: "h",
				status: { name: "", systemicValue: "", situation: "" },
			})),
		),
	} as never;
}

describe("createProposal (Trilho B) — retomada não adota proposta alheia", () => {
	it("RECUSA quando a proposta corrente do hash não pertence ao CPF do fecho", async () => {
		// A loja devolve `prop-da-vitrine`; o CPF do cliente não tem proposta
		// nenhuma. Adotar essa proposta é assinar em nome de outra pessoa.
		const gateway = new BeviSelfContractProposalGateway(clienteComPropostaDaCasa([]));

		await expect(
			gateway.createProposal({
				cpf: CPF_CLIENTE,
				celular: "11987654321",
				termoLgpd: true,
				consultaDados: true,
			}),
		).rejects.toBeInstanceOf(PropostaDeOutroTitularError);
	});

	it("ACEITA a retomada quando a proposta corrente É do cliente", async () => {
		// Retomada legítima: o próprio cliente já tinha uma proposta em curso
		// (reabriu o chat, voltou depois). Este caminho não pode ser quebrado.
		const gateway = new BeviSelfContractProposalGateway(
			clienteComPropostaDaCasa(["prop-da-vitrine"]),
		);

		const r = await gateway.createProposal({
			cpf: CPF_CLIENTE,
			celular: "11987654321",
			termoLgpd: true,
			consultaDados: true,
		});

		expect(r.proposalId).toBe("prop-da-vitrine");
	});

	it("não consulta dono quando a proposta foi criada agora (sem duplicidade)", async () => {
		// Caminho feliz: `createProposal` não lançou, a proposta é nova e é dele
		// por construção. Uma chamada extra à Bevi aqui seria latência à toa.
		const cliente = {
			createProposal: vi.fn(async () => undefined),
			getSystemState: vi.fn(async () => ({
				proposalId: "prop-nova",
				currentStepSlug: "simulation",
				situation: "",
			})),
			getMultiProposal: vi.fn(async () => []),
		} as never;
		const gateway = new BeviSelfContractProposalGateway(cliente);

		const r = await gateway.createProposal({
			cpf: CPF_DA_CASA,
			celular: "62992496793",
			termoLgpd: true,
			consultaDados: true,
		});

		expect(r.proposalId).toBe("prop-nova");
		expect(
			(cliente as { getMultiProposal: { mock: { calls: unknown[] } } }).getMultiProposal.mock.calls
				.length,
		).toBe(0);
	});
});
