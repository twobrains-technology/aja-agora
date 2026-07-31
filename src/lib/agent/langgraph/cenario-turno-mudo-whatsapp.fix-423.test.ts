// FIX-423 — o turno do reveal no WhatsApp não pode sair MUDO.
//
// Visto em PRODUÇÃO (Kairo, 2026-07-30), depois do FIX-422 já estar no ar:
//
//   cliente:   02874137138
//   agente:    "Perfeito, recebido! Já vou buscar as melhores opções."
//   agente:    "Consultando as administradoras agora, só um instante."
//   agente:    "Ótimo! Deixa eu tentar de outro jeito.
//               Pra trazer as melhores ofertas pra você, preciso do seu CPF e
//               do seu celular…"
//   agente:    "Qual é o seu CPF?"      ← O CPF DE NOVO
//   agente:    [Comparativo — 10 de 17 opções]
//
// ⚠️ A CADEIA, que é o que este teste trava:
//
//   1. No turno do reveal o beat 1 é PROIBIDO de perguntar (só apresenta).
//   2. O modelo escreveu SÓ uma pergunta ("Me diz só: qual é o seu CPF?").
//   3. O filtro dropou a interrogativa; o FIX-422 aparou a deixa junto.
//   4. Sobrou NADA — o turno fechou mudo.
//   5. No WhatsApp, turno mudo aciona o `empty-turn-guard` (adapter.ts), que
//      re-cobra o gate de coleta pendente. E foi ele quem pediu o CPF de novo.
//
// Ou seja: o fix anterior trocou "texto amputado" por "silêncio", e o silêncio
// tem um guard que reintroduz a repetição pela porta dos fundos. O invariante
// que faltava é anterior aos dois: UM TURNO QUE APRESENTA OFERTAS SEMPRE FALA.
// Se o modelo não produziu texto aproveitável, o turno não pode simplesmente
// terminar — porque no canal de maior volume o silêncio não é neutro.
//
// O teste é de TRAJETÓRIA (existe fala no turno?), nunca de prosa: o que o
// agente diz continua sendo dele.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Tudo pronto pra busca: identidade coletada, valor declarado. É o estado
 * exato do print — o cliente ACABOU de mandar o CPF. */
const PRONTO_PRA_BUSCAR = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	identityCollected: true,
	qualifyAnswers: { creditMax: 200_000, desiredItem: "carro" },
};

describeIfDb("FIX-423 — turno que mostra ofertas nunca fecha mudo (WhatsApp)", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("modelo só produziu uma PERGUNTA proibida → o turno ainda assim fala", async () => {
		const r = await runScenario({
			channel: "whatsapp",
			busca: buscaDoMock(96),
			metaInicial: PRONTO_PRA_BUSCAR,
			turns: [
				{
					user: "02874137138",
					isUserTurn: true,
					beats: [
						// O que o Haiku fez em produção: no beat de apresentação, escreveu
						// uma deixa + uma pergunta, e nada mais. Os dois pedaços são
						// descartados (pergunta proibida no beat 1 + deixa órfã) e o turno
						// fica sem nada pra dizer.
						{ text: "Me diz só: qual é o seu CPF?" },
						// O beat de RECUPERAÇÃO, com o modelo cooperando: instruído a só
						// apresentar, ele apresenta. É o caminho que o fix abre.
						{ text: "Achei 17 opções na sua faixa, e tem coisa boa aqui." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		// Sentinela: sem os cards o cenário não é o do reveal, e a asserção de fala
		// perderia o sentido.
		expect(turno.artifacts, "o turno precisa ter apresentado ofertas").toContain(
			"comparison_table",
		);
		// O INVARIANTE: apresentou oferta, então falou. Mudo aqui é o que aciona o
		// empty-turn-guard do WhatsApp e faz o agente re-cobrar o CPF.
		expect(
			turno.trilha.includes("text"),
			`turno fechou MUDO — trilha: ${turno.trilha.join(" → ")}`,
		).toBe(true);
	});
});
