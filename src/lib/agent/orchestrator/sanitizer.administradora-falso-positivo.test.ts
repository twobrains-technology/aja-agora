import { describe, expect, it } from "vitest";
import { isHallucinatedAdministradoraClaim } from "./sanitizer";

// ============================================================================
// FIX-345 — o guard anti-alucinação (FIX-342) estava DROPANDO nome VÁLIDO
// ----------------------------------------------------------------------------
// O FIX-342 impede o agente de citar administradora que não existe nas ofertas
// (ele chegou a recomendar "Bradesco" e "Estrela", inexistentes). Mas ele
// comparava por IGUALDADE EXATA normalizada:
//
//     shown = Set(["ITAU CONSORCIOS"])        ← como a Bevi devolve
//     pattern = /\bITAU\b/                    ← como o mercado chama
//     shown.has("ITAU") === false             ← FALSO POSITIVO: dropa a ITAÚ
//
// Consequência ao vivo (rodada 3, servicos-web): o agente ficou MUDO sobre a
// própria recomendação e, sem conseguir nomear a administradora, INVENTOU uma
// desculpa: "Tive um probleminha pra renderizar os dados aqui". Ou seja: o fix
// trocou um bug por uma mentira nova — pior para a confiança do produto.
//
// O guard tem que casar por CONTINÊNCIA (a oferta exibida "ITAU CONSORCIOS"
// contém "ITAU"), não por igualdade.
// ============================================================================

describe("guard anti-alucinação de administradora — não pode calar nome VÁLIDO", () => {
	it("NÃO dropa a administradora real quando a Bevi devolve o nome com sufixo", () => {
		// A Bevi devolve nomes como "ITAU CONSORCIOS" / "ANCORA ADMINISTRADORA".
		const ctx = { shownAdministradoras: ["ITAU CONSORCIOS", "ANCORA ADMINISTRADORA"] } as never;
		expect(
			isHallucinatedAdministradoraClaim("A ITAÚ é a que mais encaixa no seu perfil.", ctx),
			"a ITAÚ ESTÁ nas ofertas — calar o agente aqui é pior que o bug original",
		).toBe(false);
		expect(isHallucinatedAdministradoraClaim("Fechando com a Âncora então.", ctx)).toBe(false);
	});

	it("NÃO dropa quando a fala usa o nome completo e a oferta veio curta", () => {
		const ctx = { shownAdministradoras: ["ITAU"] } as never;
		expect(isHallucinatedAdministradoraClaim("A ITAÚ Consórcios tem a melhor parcela.", ctx)).toBe(
			false,
		);
	});

	it("CONTINUA dropando administradora que NÃO existe nas ofertas (o bug original)", () => {
		const ctx = { shownAdministradoras: ["ITAU CONSORCIOS", "ANCORA"] } as never;
		expect(
			isHallucinatedAdministradoraClaim("Recomendo a Bradesco pra você.", ctx),
			"Bradesco não está nas ofertas — isto é alucinação e tem que ser dropado",
		).toBe(true);
		expect(isHallucinatedAdministradoraClaim("A Estrela é a mais indicada.", ctx)).toBe(true);
	});

	it("sem contexto de ofertas, nunca dropa (compat retroativa)", () => {
		expect(isHallucinatedAdministradoraClaim("Recomendo a Bradesco.", undefined)).toBe(false);
	});
});
