/**
 * "de novo? ja passei" — o cliente, em produção (`fd76e393`, 16/08/2026 19:23:24).
 *
 * Ele tinha mandado o CPF às 19:18:21. Com `identityCollected = true` no estado,
 * o agente pediu de novo às 19:22:26, e outra vez às 19:23:10. A janela do turno
 * tinha TRÊS instruções mandando não repetir (o `blocoIdentidade` do `converse`
 * é explícito: "É PROIBIDO... pedir de novo"). Ele pediu mesmo assim.
 *
 * Não é desobediência: é colisão de autoridades, e venceu a mais específica da
 * tarefa. O directive do clique "Seguir agora" traz uma frase-exemplo — "Pra
 * garantir seu lugar nesse grupo, só preciso de uns dados rápidos" — e o turno
 * saiu quase verbatim nela, com "Qual é o seu CPF?" emendado. Uma frase-exemplo
 * que CONTRADIZ o estado é mais forte que três proibições genéricas: ela diz o
 * que fazer, e as outras dizem o que não fazer.
 *
 * A correção é remover a contradição, não empilhar a quarta proibição. Com a
 * identidade on file, o exemplo passa a ser o da conversa que de fato deve
 * acontecer: confirmar e seguir.
 */

import { describe, expect, it } from "vitest";
import { buildAdvanceToContractDirective, buildChooseOfferDirective } from "./directives";
import { GATE_INTENT } from "./system-context";

const pedeDados = /dados r[áa]pidos|preciso de.*dados|seu cpf/i;

describe("directive de contratação — não pede dado que o sistema já tem", () => {
	it("com identidade JÁ coletada, o exemplo não manda pedir dados", () => {
		const d = buildAdvanceToContractDirective({ identidadeJaColetada: true });
		expect(d).not.toMatch(pedeDados);
	});

	it("com identidade já coletada, o exemplo manda CONFIRMAR e seguir", () => {
		const d = buildAdvanceToContractDirective({ identidadeJaColetada: true });
		expect(d).toMatch(/j[áa] (est|te)\w*|j[áa] tenho|confirm/i);
	});

	it("sem identidade, continua pedindo os dados — o funil precisa deles", () => {
		const d = buildAdvanceToContractDirective({ identidadeJaColetada: false });
		expect(d).toMatch(/dados r[áa]pidos/i);
	});

	it("o mesmo vale pelo caminho do seletor do reveal", () => {
		const comIdentidade = buildChooseOfferDirective({
			administradora: "BANCO DO BRASIL",
			identidadeJaColetada: true,
		});
		expect(comIdentidade).not.toMatch(pedeDados);

		const semIdentidade = buildChooseOfferDirective({ administradora: "BANCO DO BRASIL" });
		expect(semIdentidade).toMatch(/dados r[áa]pidos/i);
	});

	// O gate `contract` é servido nos DOIS canais e dizia "O formulário com os
	// dados aparece logo abaixo da sua fala". No WhatsApp não existe formulário
	// nem "abaixo" — e o `blocoCanal` do mesmo turno afirma exatamente o
	// contrário ("não existe tela, card, botão"). Duas autoridades se
	// contradizendo na mesma janela é o que produziu o CPF pedido três vezes:
	// o modelo seguiu a mais específica da tarefa, que era a errada.
	it("o gate `contract` não descreve tela — a mecânica é do bloco de canal", () => {
		expect(GATE_INTENT.contract).not.toMatch(/formul[áa]rio|logo abaixo|na tela|no card/i);
	});

	it("o gate `contract` mantém o que vale nos dois canais", () => {
		expect(GATE_INTENT.contract).toMatch(/pr[ée]-cadastro/i);
		expect(GATE_INTENT.contract).toMatch(/n[ãa]o paga nada agora/i);
		expect(GATE_INTENT.contract).toMatch(/reservada/i);
	});

	it("nenhuma das versões volta a mandar pedir CPF por texto", () => {
		for (const d of [
			buildAdvanceToContractDirective({ identidadeJaColetada: true }),
			buildAdvanceToContractDirective({ identidadeJaColetada: false }),
		]) {
			expect(d).toMatch(/NUNCA pede CPF por texto|NUNCA peça CPF/i);
		}
	});
});
