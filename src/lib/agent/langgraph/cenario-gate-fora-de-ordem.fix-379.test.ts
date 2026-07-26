// FIX-379 — investigação: o agente perguntou o VALOR antes do NOME.
//
// Visto ao vivo (Kairo, 2026-07-26), primeiro turno da conversa:
//   "Que ótimo! Carro novo é uma ótima escolha! ... **Qual é o valor aproximado
//    do carro que você quer comprar?**"
// O cliente respondeu ironizando ("Pode me chamar de 100 reais") e só então o
// agente pediu o nome.
//
// `nextGate` (qualify-state.ts) é explícito: sem `hasContactName`, o ÚNICO gate
// é `name`. Então a pergunta do valor veio do modelo, não do funil.
//
// A pergunta que este cenário responde é: o CÓDIGO fez sua parte? Se o gate
// `name` foi emitido (o card de nome, com input focado), então a ordem do funil
// está intacta e o desvio é do prompt — e prompt NÃO vira trava de regex aqui
// (lei-mãe do CLAUDE.md: conversa é do modelo). Se o gate NÃO saiu, é bug de
// código e tem dono.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-379 — primeiro turno sem nome: o funil tem que pedir o nome", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("emite o gate `name` mesmo quando o modelo pergunta outra coisa", async () => {
		const r = await runScenario({
			// Ninguém se apresentou ainda — é o estado real do primeiro turno.
			contactName: null,
			metaInicial: {},
			turns: [
				{
					user: "Quero comprar um carro.",
					// O modelo faz o que fez ao vivo: pula pro valor.
					beats: [
						{
							text: "Que ótimo! Carro novo é uma ótima escolha! Qual é o valor aproximado do carro que você quer comprar?",
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		// O funil não pode concordar com o desvio: o gate do nome é o único
		// legítimo aqui, e é ele que dá ao cliente o input certo pra responder.
		expect(r.turns[0].trilha).toContain("gate:name");

		// E nada de valor pode ter sido gravado: o cliente não disse valor nenhum.
		expect(r.meta.qualifyAnswers?.creditMax).toBeUndefined();
	});
});
