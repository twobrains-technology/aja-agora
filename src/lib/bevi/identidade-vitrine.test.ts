/**
 * A VITRINE — mostrar carta real ANTES de pedir o CPF do cliente.
 *
 * Medido em produção (10-26/08/2026, 87 conversas): 49,4% das conversas morrem
 * antes de o cliente dizer o nome, a mediana é de 5 perguntas até a primeira
 * carta aparecer, e o Langfuse põe `name`+`identify`+`credit` em 80,5% dos
 * turnos travados. O cliente que escreve "Me mostra as opções primeiro" recebe
 * duas perguntas e some (conv aebac770); o que diz "não quero passar meus
 * dados" ouve que é "tipo abrir conta de banco sem documento" e se despede
 * (conv 92c4c1ce).
 *
 * A causa é estrutural, não de fala: `ensureOffers` cria uma PROPOSTA na Bevi
 * (com `consultarDados: true`) para poder simular, então o funil inteiro foi
 * desenhado para arrancar o CPF antes de qualquer oferta.
 *
 * A vitrine desata isso usando um par CPF+celular DA CASA — conta homologada na
 * administradora — só para popular a prateleira. O CPF do cliente volta a ser
 * pedido onde ele sempre fez sentido: na hora de fechar, trocado por um
 * contrato.
 *
 * O que estes testes travam é a fronteira: a vitrine serve para MOSTRAR, nunca
 * para CONTRATAR.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ehIdentidadeDeVitrine,
	identidadeDeVitrine,
	vitrineDisponivel,
} from "./identidade-vitrine";

/** CPF de teste público (111.444.777-35), válido no módulo 11.
 *  O par REAL de homologação vive no vault (`contas-teste`) e no `.env.local` —
 *  PII não entra em teste versionado. */
const CPF_VITRINE = "11144477735";
const CELULAR_VITRINE = "62992496793";

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = CPF_VITRINE;
	process.env.VITRINE_CELULAR = CELULAR_VITRINE;
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("identidadeDeVitrine", () => {
	it("devolve o par configurado, só com os dígitos", () => {
		process.env.VITRINE_CPF = "111.444.777-35";
		process.env.VITRINE_CELULAR = "(62) 99249-6793";

		expect(identidadeDeVitrine()).toEqual({
			cpf: CPF_VITRINE,
			celular: CELULAR_VITRINE,
		});
	});

	it("aceita o celular em E.164 sem '+' (13 dígitos, como está no vault) e entrega 11", () => {
		// A API de Parceiro REJEITA 13 dígitos com `400 "CELULAR inválido."`
		// (docs/integracoes/contas-teste-homologacao.md) — o 55 tem que cair aqui,
		// não na hora do POST.
		process.env.VITRINE_CELULAR = `55${CELULAR_VITRINE}`;

		expect(identidadeDeVitrine()?.celular).toBe(CELULAR_VITRINE);
	});

	it("é NULA quando a env não está configurada — sem vitrine implícita", () => {
		process.env.VITRINE_CPF = undefined;
		process.env.VITRINE_CELULAR = undefined;

		expect(identidadeDeVitrine()).toBeNull();
		expect(vitrineDisponivel()).toBe(false);
	});

	it("é NULA quando o CPF configurado não passa no módulo 11", () => {
		// Foi o que aconteceu de verdade na abertura desta tarefa: o CPF chegou
		// por voz com dois dígitos transpostos e não passava no módulo 11. A Bevi
		// devolveria erro e o cliente veria a busca falhar sem entender por quê.
		// Melhor não ter vitrine do que ter vitrine quebrada.
		process.env.VITRINE_CPF = "11144477734";

		expect(identidadeDeVitrine()).toBeNull();
		expect(vitrineDisponivel()).toBe(false);
	});

	it("é NULA quando o celular não tem DDD + número", () => {
		process.env.VITRINE_CELULAR = "9249679";

		expect(identidadeDeVitrine()).toBeNull();
	});

	it("não cai em CPF de sequência repetida, que passa em validador ingênuo", () => {
		process.env.VITRINE_CPF = "11111111111";

		expect(identidadeDeVitrine()).toBeNull();
	});
});

describe("ehIdentidadeDeVitrine — a fronteira que impede o contrato errado", () => {
	it("reconhece o CPF da casa em qualquer formatação", () => {
		expect(ehIdentidadeDeVitrine("111.444.777-35")).toBe(true);
		expect(ehIdentidadeDeVitrine(CPF_VITRINE)).toBe(true);
	});

	it("não confunde o CPF de um cliente real com o da vitrine", () => {
		expect(ehIdentidadeDeVitrine("52998224725")).toBe(false);
	});

	it("é FALSO para vazio/indefinido — ausência de CPF não é a vitrine", () => {
		expect(ehIdentidadeDeVitrine("")).toBe(false);
		expect(ehIdentidadeDeVitrine(undefined)).toBe(false);
		expect(ehIdentidadeDeVitrine(null)).toBe(false);
	});

	it("é FALSO quando não há vitrine configurada — senão todo CPF viraria 'da casa'", () => {
		// Guard contra o modo de falha mais perigoso: com a env vazia, um
		// `ehIdentidadeDeVitrine` frouxo compararia "" com "" e bloquearia
		// TODA contratação, ou pior, deixaria passar.
		process.env.VITRINE_CPF = undefined;
		process.env.VITRINE_CELULAR = undefined;

		expect(ehIdentidadeDeVitrine("")).toBe(false);
		expect(ehIdentidadeDeVitrine(CPF_VITRINE)).toBe(false);
	});
});
