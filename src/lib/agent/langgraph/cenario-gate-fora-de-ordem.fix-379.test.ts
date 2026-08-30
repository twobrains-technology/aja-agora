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

	// REVISADO em 2026-08-12 com evidência nova de produção. O contrato original
	// era "o gate `name` sai NO MESMO turno em que o modelo pergunta outra
	// coisa". Onze conversas reais mostraram o custo desse contrato (conv do
	// Erik): o texto perguntava o imóvel, o card pedia o nome, o cliente
	// respondia ao card — que é o que tem campo pra digitar — e a pergunta do
	// agente morria sem resposta, fazendo ele repeti-la no turno seguinte.
	//
	// O contrato agora é "o card cede a vez UMA vez". A preocupação que gerou o
	// FIX-379 continua coberta e é o que o segundo caso abaixo prova: o funil
	// não fica refém do modelo — no máximo perde um turno.
	it("cede a vez no turno em que o modelo pergunta outra coisa", async () => {
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

		// A pergunta do agente fica de pé sozinha — sem um campo de nome embaixo
		// competindo por resposta.
		expect(r.turns[0].trilha).not.toContain("gate:name");

		// E nada de valor pode ter sido gravado: o cliente não disse valor nenhum.
		expect(r.meta.qualifyAnswers?.creditMax).toBeUndefined();
	});

	it("na segunda insistência o card entra e o funil retoma a ordem", async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: {},
			turns: [
				{
					user: "Quero comprar um carro.",
					beats: [{ text: "Que ótimo! Qual é o valor aproximado do carro?" }],
				},
				{
					user: "Ainda não sei bem.",
					// O modelo insiste em não perguntar o nome.
					beats: [{ text: "Sem problema! Você prefere um carro novo ou usado?" }],
				},
			],
		});
		criadas.push(r.conversationId);

		// O CONTRATO É "UM CARD ENTRA", E ELE CONTINUA DE PÉ — o que mudou é QUAL
		// (30/08/2026).
		//
		// "Quero comprar um carro." traz a categoria, e desde 30/08 quem já disse
		// o que quer não é recebido pelo nome: o card que entra é o do VALOR, com
		// a parcela estimada na tela. Foi essa troca que a medição de produção
		// pediu — das 71 conversas de 16–30/08, 34 morreram na primeira resposta,
		// quase todas depois de um chip de categoria responder com uma pergunta.
		//
		// A preocupação que gerou o FIX-379 é outra e continua coberta: o funil
		// não fica refém do modelo. Ele insistiu em não perguntar nada útil por
		// dois turnos e mesmo assim um card entrou, com o campo que o funil
		// precisa preencher.
		expect(r.turns[1].trilha).toContain("gate:credit");
	});
});
