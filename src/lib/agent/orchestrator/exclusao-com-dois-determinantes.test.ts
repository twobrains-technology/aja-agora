/**
 * "qualquer uma menos a do Banco do Brasil" — a exclusão que passava batida.
 *
 * `excluiMarca` (FIX-412) aceita UM determinante entre o gatilho e a marca:
 * "menos a Rodobens", "sem ser a Canopus". Só que quando o nome da
 * administradora é masculino, o jeito natural de falar em português usa DOIS —
 * "menos **a do** Banco do Brasil" (a cota do banco), "menos **a da** Porto".
 * Nesses casos a exclusão não era reconhecida, e a cota que o cliente acabara
 * de descartar seguia elegível para ancorar o contrato.
 *
 * Encontrado em 16/08/2026 enquanto se testava a parede do `escolher_cota`:
 * "menos o banco do brasil" era detectado e "menos a do banco do brasil" não —
 * a mesma intenção, com um "do" a mais.
 *
 * A correção é de PRECISÃO, não de vocabulário novo: a família sintática já
 * estava certa (`MENOS`, `SEM SER`, `EXCETO`…), o que faltava era permitir a
 * cadeia de determinantes que o português usa entre ela e o nome. Não entra
 * nenhuma palavra nova na lista — o alerta do FIX-412 sobre transformar ênfase
 * em recusa continua valendo, e as contraprovas abaixo prendem isso.
 */

import { describe, expect, it } from "vitest";
import type { ChosenOffer } from "./choose-offer";
import { administradoraFoiRecusada } from "./choose-offer";

const OFERTAS = [
	{ groupId: "a", administradora: "BANCO DO BRASIL" },
	{ groupId: "b", administradora: "PORTO" },
	{ groupId: "c", administradora: "RODOBENS" },
] as ChosenOffer[];

describe("exclusão de marca — a cadeia de determinantes do português", () => {
	it.each([
		["qualquer uma menos a do banco do brasil, quero fechar", "BANCO DO BRASIL"],
		["quero fechar, mas menos a da porto", "PORTO"],
		["pode ser qualquer uma, exceto a do banco do brasil", "BANCO DO BRASIL"],
		["sem ser a da rodobens, bora", "RODOBENS"],
	])("reconhece %j", (fala, marca) => {
		expect(administradoraFoiRecusada(fala, OFERTAS, marca)).toBe(true);
	});

	it("as formas que já funcionavam continuam funcionando", () => {
		expect(
			administradoraFoiRecusada("qualquer uma menos a rodobens, quero fechar", OFERTAS, "RODOBENS"),
		).toBe(true);
		expect(
			administradoraFoiRecusada(
				"qualquer uma menos o banco do brasil, quero fechar",
				OFERTAS,
				"BANCO DO BRASIL",
			),
		).toBe(true);
	});

	// CONTRAPROVA — o alerta do FIX-412: ênfase não é recusa. Se estas passarem
	// a contar como exclusão, o cliente escolhe uma administradora e o contrato
	// sai com outra, que é o defeito que este arquivo inteiro existe para evitar.
	it.each([
		["quero a do banco do brasil, sem a menor dúvida", "BANCO DO BRASIL"],
		["quero a da porto, sem a burocracia toda", "PORTO"],
		["a do banco do brasil é a melhor pra mim", "BANCO DO BRASIL"],
	])("NÃO trata ênfase como exclusão: %j", (fala, marca) => {
		expect(administradoraFoiRecusada(fala, OFERTAS, marca)).toBe(false);
	});

	it("exclusão de uma marca não contamina a outra", () => {
		const fala = "qualquer uma menos a do banco do brasil, quero fechar";
		expect(administradoraFoiRecusada(fala, OFERTAS, "PORTO")).toBe(false);
		expect(administradoraFoiRecusada(fala, OFERTAS, "RODOBENS")).toBe(false);
	});
});
