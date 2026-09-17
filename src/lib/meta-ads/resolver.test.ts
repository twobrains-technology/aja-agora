// O RESOLVEDOR — o que se prova aqui é o caminho SEM banco.
//
// O contrato é congelado (bloco 2 lê o nome nas telas, bloco 3 o filtro, bloco 4
// a tela de campanhas), então o que falta cobrir é o comportamento que não
// depende do espelho: a ordem de força das chaves e o `null` como resposta
// legítima. A leitura de `meta_entities` está em `resolver.integration.test.ts`.

import { beforeEach, describe, expect, it } from "vitest";
import {
	type CampanhaResolvida,
	chaveDeOrigem,
	nomeCurto,
	rotuloDeCampanha,
	semearCache,
	serializarChave,
} from "./resolver";
// A metade que fala com o banco vive em arquivo separado: `resolver.ts` é puro
// porque componente de cliente o importa, e o `@/db` no bundle do navegador
// quebra o `next build`.
import { resolverCampanhas } from "./resolver-do-banco";

const ID_GRANDE = "120210000000370104";
const CAMPO_GRANDE: CampanhaResolvida = {
	nome: "META | EXP | LEAD | BR | PLACEMENTS",
	entityId: ID_GRANDE,
	origemDaResolucao: "id",
	status: "ACTIVE",
};

describe("chaveDeOrigem — a ordem de força", () => {
	it("campaign_id vence utm e ctwa (é o id da própria Meta)", () => {
		expect(
			chaveDeOrigem({
				campaignId: "120210000000370104",
				utmCampaign: "META | EXP | LEAD | BR | PLACEMENTS",
				ctwaSourceId: "abc",
			}),
		).toEqual({ tipo: "campaign_id", valor: "120210000000370104" });
	});

	it("sem id, utm_campaign vence ctwa_source_id", () => {
		expect(chaveDeOrigem({ utmCampaign: "meta-exp", ctwaSourceId: "abc" })).toEqual({
			tipo: "utm_campaign",
			valor: "meta-exp",
		});
	});

	it("só com ctwa_source_id, é ele; sem nada, é null", () => {
		expect(chaveDeOrigem({ ctwaSourceId: "abc" })).toEqual({
			tipo: "ctwa_source_id",
			valor: "abc",
		});
		expect(chaveDeOrigem({})).toBeNull();
		expect(chaveDeOrigem({ campaignId: "   ", utmCampaign: "" })).toBeNull();
	});
});

describe("nomeCurto e rotuloDeCampanha", () => {
	beforeEach(() => {
		semearCache([]);
	});

	it("chave desconhecida devolve null — e null NÃO é erro", () => {
		expect(nomeCurto({ tipo: "campaign_id", valor: "nao-existe" })).toBeNull();
		// O rótulo mantém o que a tela já tinha, em vez de apagar.
		expect(
			rotuloDeCampanha(
				{ tipo: "campaign_id", valor: "nao-existe" },
				null,
				"META | EXP | LEAD | BR | PLACEMENTS",
			),
		).toBe("META | EXP | LEAD | BR | PLACEMENTS");
	});

	it("com o cache semeado, nomeCurto responde na hora", () => {
		semearCache([[serializarChave({ tipo: "campaign_id", valor: ID_GRANDE }), CAMPO_GRANDE]]);
		expect(nomeCurto({ tipo: "campaign_id", valor: ID_GRANDE })?.nome).toBe(CAMPO_GRANDE.nome);
	});

	it("sem resolvida e sem fallback, sobra o valor cru da chave", () => {
		expect(rotuloDeCampanha({ tipo: "campaign_id", valor: "120210000000370104" }, null, null)).toBe(
			"120210000000370104",
		);
		expect(rotuloDeCampanha(null, null, null)).toBeNull();
	});

	it("chave ctwa não vai ao banco e não resolve — nada é deduzido por proximidade", async () => {
		const resolvidas = await resolverCampanhas([{ tipo: "ctwa_source_id", valor: "abc" }]);
		expect(resolvidas.size).toBe(0);
	});
});
