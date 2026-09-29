/**
 * A regra da limpeza: o SINAL de cada candidato.
 *
 * O que este arquivo deixou de testar, e por quê: existia aqui um \"teste de
 * paridade\" entre uma cópia em JavaScript do predicado de identificado (usada
 * pelo filtro do Pipeline) e o SQL do funil. Ele não media paridade — um `it`
 * conferia substring do SQL e o outro exercitava só a função JS, então o SQL
 * nunca rodava sobre os casos: quando o predicado do funil mudou, os dois lados
 * divergiram com o teste verde. A cópia foi ELIMINADA (o Pipeline passou a usar o
 * mesmo predicado, no servidor) e a paridade real é provada onde ela pode ser
 * exercitada: `src/app/api/admin/leads/route.recorte.test.ts` e
 * `identificado-pelo-cliente.integration.test.ts`, contra o banco.
 */

import { describe, expect, it } from "vitest";
import { motivoDeLimpeza } from "./limpeza";

describe("motivoDeLimpeza", () => {
	const nada = {
		jaMarcadaComoTeste: false,
		telefoneDaEquipe: false,
		naMesaSemContato: false,
		naMesaSemOrigemDeCampanha: false,
		propostas: 0,
	};

	it("não acha sinal em conversa de cliente normal", () => {
		expect(motivoDeLimpeza(nada)).toBeNull();
	});

	it("reconhece cada um dos cinco sinais", () => {
		expect(motivoDeLimpeza({ ...nada, jaMarcadaComoTeste: true })).toBe("teste");
		expect(motivoDeLimpeza({ ...nada, telefoneDaEquipe: true })).toBe("telefone_da_equipe");
		expect(motivoDeLimpeza({ ...nada, naMesaSemContato: true })).toBe("sem_contato");
		expect(motivoDeLimpeza({ ...nada, naMesaSemOrigemDeCampanha: true })).toBe("mesa_sem_origem");
		expect(motivoDeLimpeza({ ...nada, jaMarcadaComoTeste: true, propostas: 5 })).toBe(
			"proposta_em_teste",
		);
	});

	it("a proposta só é sinal quando a conversa é de teste", () => {
		// Proposta REAL (conversa de cliente) não é motivo de limpeza — o relatório
		// da administradora tem que continuar mostrando a venda dela.
		expect(motivoDeLimpeza({ ...nada, propostas: 3 })).toBeNull();
	});

	it("com mais de um sinal, o motivo é o mais forte — a linha tem UM motivo", () => {
		expect(
			motivoDeLimpeza({
				jaMarcadaComoTeste: true,
				telefoneDaEquipe: true,
				naMesaSemContato: true,
				naMesaSemOrigemDeCampanha: true,
				propostas: 0,
			}),
		).toBe("teste");
		expect(
			motivoDeLimpeza({
				jaMarcadaComoTeste: false,
				telefoneDaEquipe: true,
				naMesaSemContato: true,
				naMesaSemOrigemDeCampanha: true,
				propostas: 0,
			}),
		).toBe("telefone_da_equipe");
		// A conversa de teste COM proposta é o motivo mais específico: é o único
		// que diz que existe venda de teste poluindo a administradora.
		expect(
			motivoDeLimpeza({
				jaMarcadaComoTeste: true,
				telefoneDaEquipe: true,
				naMesaSemContato: true,
				naMesaSemOrigemDeCampanha: true,
				propostas: 5,
			}),
		).toBe("proposta_em_teste");
		// "Sem contato" (não dá para recontactar) vence "sem campanha" (indício
		// fraco): o caso do dono, que TEM contato, é o que cai no último.
		expect(
			motivoDeLimpeza({
				jaMarcadaComoTeste: false,
				telefoneDaEquipe: false,
				naMesaSemContato: true,
				naMesaSemOrigemDeCampanha: true,
				propostas: 0,
			}),
		).toBe("sem_contato");
	});
});
