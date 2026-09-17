// O NOME da campanha chegando à tela — o caminho que importa.
//
// Medido em 17/09/2026 na conta `act_1594922312055163`: o sufixo de seis dígitos
// do id da campanha casa com DOIS anúncios diferentes (`…200104` e `…450104`
// também). O painel pode estar apontando o anúncio errado sem que ninguém
// perceba, porque id abreviado PARECE identificador.
//
// O que este teste fixa, em duas direções:
//
// 1. com o id presente e o espelho local sincronizado, o rótulo é o NOME real e
//    o `title` leva o id inteiro, de 18 dígitos;
// 2. **sem resolução, o rótulo é exatamente o de antes** — nada some da tela
//    porque o sync ainda não rodou. "Não saber" não pode virar "não mostrar".

import { afterEach, describe, expect, it } from "vitest";
import { type CampanhaResolvida, semearCache, serializarChave } from "@/lib/meta-ads/resolver";
import { descreverOrigem, rotuloDaCampanha } from "./agrupar-origens";
import { origemDaVisita } from "./origem-label";
import { tituloDaOrigem } from "./titulo-da-origem";

const ID_A = "120250956902860104";

// Os dois sufixos que a produção mediu colidindo: `…200104` aponta para dois
// anúncios diferentes. É por isso que o sufixo não serve de resposta.
const ID_COLIDE_1 = "120250956902200104";
const ID_COLIDE_2 = "120250989573200104";

function resolvida(nome: string, entityId: string | null): CampanhaResolvida {
	return { nome, entityId, origemDaResolucao: "id", status: "ACTIVE" };
}

function semear(entradas: Array<[string, CampanhaResolvida]>): void {
	semearCache(entradas);
}

afterEach(() => {
	// O cache é módulo-global: sem limpar, a resolução de um teste vaza para o
	// seguinte e o caminho "não resolvido" passa a mentir.
	semearCache([]);
});

describe("a campanha resolvida vira nome na tela", () => {
	it("mostra o nome real e guarda o id inteiro no title", () => {
		semear([
			[serializarChave({ tipo: "campaign_id", valor: ID_A }), resolvida("META | EXP | LEAD", ID_A)],
		]);

		const origem = origemDaVisita({
			utmSource: "ig",
			utmMedium: "cpc",
			utmCampaign: "nao-importa",
			utmContent: null,
			ctwaSourceId: null,
			ctwaHeadline: null,
			referrer: null,
			campaignId: ID_A,
		});

		expect(origem.nomeDaCampanha).toBe("META | EXP | LEAD");
		expect(origem.entityId).toBe(ID_A);
		expect(descreverOrigem(origem)).toBe("Instagram · META | EXP | LEAD");
		// O `title` leva as duas coisas que identificam: o nome oficial e o id
		// completo, como se cola no gerenciador.
		expect(tituloDaOrigem(origem)).toContain("META | EXP | LEAD");
		expect(tituloDaOrigem(origem)).toContain(ID_A);
	});

	it("o id da Meta ganha da UTM como chave", () => {
		// `campaign_id` é o id da própria Meta; a UTM é texto que o anunciante
		// digitou. Quando os dois existem e divergem, vale o id.
		semear([
			[serializarChave({ tipo: "campaign_id", valor: ID_A }), resolvida("Nome do id", ID_A)],
			[
				serializarChave({ tipo: "utm_campaign", valor: "utm-velha" }),
				resolvida("Nome da UTM", null),
			],
		]);

		const origem = origemDaVisita({
			utmSource: "fb",
			utmMedium: null,
			utmCampaign: "utm-velha",
			utmContent: null,
			ctwaSourceId: null,
			ctwaHeadline: null,
			referrer: null,
			campaignId: ID_A,
		});

		expect(origem.nomeDaCampanha).toBe("Nome do id");
	});

	it("dois ids que dividem o sufixo de seis dígitos não se confundem", () => {
		// O defeito medido: `…200104` casa com duas campanhas diferentes.
		semear([
			[
				serializarChave({ tipo: "campaign_id", valor: ID_COLIDE_1 }),
				resolvida("IMG | GERAL", ID_COLIDE_1),
			],
			[
				serializarChave({ tipo: "campaign_id", valor: ID_COLIDE_2 }),
				resolvida("TOFU | CARROS", ID_COLIDE_2),
			],
		]);

		const visita = {
			utmSource: "ig",
			utmMedium: null,
			utmCampaign: null,
			utmContent: null,
			ctwaSourceId: null,
			ctwaHeadline: null,
			referrer: null,
		};

		expect(descreverOrigem(origemDaVisita({ ...visita, campaignId: ID_COLIDE_1 }))).toBe(
			"Instagram · IMG | GERAL",
		);
		expect(descreverOrigem(origemDaVisita({ ...visita, campaignId: ID_COLIDE_2 }))).toBe(
			"Instagram · TOFU | CARROS",
		);
	});

	it("o rótulo curto da campanha dentro do canal também usa o nome real", () => {
		semear([
			[serializarChave({ tipo: "campaign_id", valor: ID_A }), resolvida("META | EXP | LEAD", ID_A)],
		]);
		const origem = origemDaVisita({
			utmSource: "ig",
			utmMedium: null,
			utmCampaign: null,
			utmContent: null,
			ctwaSourceId: null,
			ctwaHeadline: null,
			referrer: null,
			campaignId: ID_A,
		});
		expect(rotuloDaCampanha(origem)).toBe("META | EXP | LEAD");
	});
});

describe("sem resolução, nada muda", () => {
	const visita = {
		utmSource: "ig",
		utmMedium: null,
		utmCampaign: ID_A,
		utmContent: null,
		ctwaSourceId: null,
		ctwaHeadline: null,
		referrer: null,
		campaignId: ID_A,
	};

	it("cai no rótulo abreviado de antes, nunca em branco", () => {
		// O espelho local ainda não sincronizou: `nomeCurto` devolve null e o
		// painel tem que continuar mostrando o que mostrava.
		const origem = origemDaVisita(visita);

		expect(origem.nomeDaCampanha).toBeNull();
		expect(origem.entityId).toBeNull();
		expect(descreverOrigem(origem)).toBe("Instagram · campanha …860104");
		expect(rotuloDaCampanha(origem)).toBe("campanha …860104");
	});

	it("o title continua exatamente o rótulo cru", () => {
		const origem = origemDaVisita(visita);
		expect(tituloDaOrigem(origem)).toBe(origem.label);
	});

	it("sem campanha nenhuma, o direto segue direto", () => {
		const origem = origemDaVisita({
			utmSource: null,
			utmMedium: null,
			utmCampaign: null,
			utmContent: null,
			ctwaSourceId: null,
			ctwaHeadline: null,
			referrer: null,
			campaignId: null,
		});
		expect(descreverOrigem(origem)).toBe("Chegou direto, sem campanha");
		expect(tituloDaOrigem(origem)).toBe("Direto");
	});
});

describe("tituloDaOrigem com nome mas sem id", () => {
	it("ainda acrescenta o rótulo cru, e não inventa id", () => {
		// A resolução por UTM não tem entityId — o `title` não pode fingir um.
		const titulo = tituloDaOrigem({
			tipo: "campanha",
			fonte: "ig",
			campanha: "utm-x",
			criativo: null,
			label: "ig · utm-x",
			nomeDaCampanha: "Nome da UTM",
			entityId: null,
		});
		expect(titulo).toBe("Nome da UTM · ig · utm-x");
		expect(titulo).not.toContain("id completo");
	});
});
