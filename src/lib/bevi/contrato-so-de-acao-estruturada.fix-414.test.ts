// FIX-414 — a parede no lugar CERTO: o que a Bevi recebe.
//
// A 11ª revisão independente achou o furo em quatro minutos, e o achado é
// devastador porque é preciso:
//
//   "A parede foi levantada em `emit-card.ts`, que decide o RÓTULO do
//    formulário. Ela não foi levantada em `buildStartContractInput`, que decide
//    O QUE A BEVI RECEBE."
//
// Medido no grafo real:
//
//   fala = "a Rodobens é muito cara, quero fechar"
//     contractOffer             = undefined    ← o teste do FIX-413 passava aqui
//     formulário.administradora = undefined    ← o teste do FIX-413 passava aqui
//     administradoraPreferida   = "RODOBENS"   ← o que ia pra Bevi
//
// E o agravante que eu não tinha visto: ANTES do FIX-413 o formulário ao menos
// EXIBIA "Administradora: RODOBENS", e o cliente tinha chance de ver o erro. Eu
// removi o último aviso visual e mantive o vínculo. Ausente-na-tela +
// presente-no-request é PIOR que errado-na-tela.
//
// É a quarta vez seguida que este repo comete a mesma estrutura de erro: fechar
// uma porta, declarar em commit que a classe acabou, e não varrer as irmãs. O
// FIX-400 esqueceu o proxy; o FIX-406 esqueceu o proxy; o FIX-413 esqueceu
// `contract-input.ts` — que é literalmente o módulo cujo cabeçalho diz ser a
// "derivação canônica do input do startContract, módulo ÚNICO consumido pelo web
// e pelo WhatsApp". Eu li esse cabeçalho e não o segui.
//
// Este teste existe no nível da FUNÇÃO PURA de propósito: é o último ponto antes
// da chamada real, é consumido pelos DOIS canais, e não depende de harness
// nenhum. Se a parede vale, ela vale aqui.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "./contract-input";

const IDENT = { cpf: "12345678909", celular: "62999887766", lgpd: true };

/** O estado que o TEXTO produz: a conversa foi levada pra Rodobens por menção.
 * É legítimo — é assim que o agente acompanha a atenção do cliente. O que não
 * pode é isso virar contrato. */
const SO_TEXTO = {
	currentCategory: "auto",
	revealCompleted: true,
	recommendedAdministradora: "RODOBENS",
	recommendedOffer: {
		administradora: "RODOBENS",
		creditValue: 171_000,
		termMonths: 96,
		monthlyPayment: 2_719,
		groupId: "g-rodobens",
	},
	qualifyAnswers: { creditMax: 180_000 },
} as unknown as ConversationMetadata;

/** O mesmo estado, mas com a cota do CONTRATO ancorada por ação estruturada
 * (clique de card ou tool com groupId conferido). */
const COM_ACAO_ESTRUTURADA = {
	...SO_TEXTO,
	contractOffer: {
		administradora: "CANOPUS",
		creditValue: 170_000,
		termMonths: 120,
		monthlyPayment: 1_092,
		groupId: "g-canopus",
	},
} as unknown as ConversationMetadata;

describe("FIX-414 — a Bevi só recebe administradora vinda de ação estruturada", () => {
	it("sem `contractOffer`, NADA de administradora vai pro contrato", () => {
		const input = buildStartContractInput(SO_TEXTO, IDENT);

		// Este era o vazamento: `recommendedAdministradora` é escrita por resolução
		// de TEXTO, e ia direto pro request.
		expect(input.administradoraPreferida).toBeNull();
		// O prazo desempata o matching DENTRO da administradora — mandá-lo sem ela
		// vincularia o contrato pela porta dos fundos.
		expect(input.prazoPreferido).toBeNull();
	});

	it("com `contractOffer`, é ELA que vai — nunca a cota em foco na conversa", () => {
		// O teste que impede o fix de virar "nunca fecha": ação estruturada tem que
		// chegar à Bevi, e tem que chegar COMPLETA. Os dois campos divergem de
		// propósito (conversa em RODOBENS, contrato em CANOPUS) — se a função
		// confundisse os dois, valores iguais esconderiam o erro.
		const input = buildStartContractInput(COM_ACAO_ESTRUTURADA, IDENT);

		expect(input.administradoraPreferida).toBe("CANOPUS");
		expect(input.prazoPreferido).toBe(120);
		// E o valor tem que ser o da cota CONTRATADA, não o da cota conversada —
		// senão o contrato sai com a carta de uma e a marca de outra, que é o
		// bait-and-switch que o FIX-73 documenta.
		expect(input.valor).toBe(170_000);
	});

	it("CORRIGIDO PELO FIX-417: o valor É a carta exibida, e só a MARCA fica sem vínculo", () => {
		// ⚠️ Este teste afirmava o contrário e estava ERRADO. Ele codificava como
		// invariante justamente o bait-and-switch que o FIX-73 documenta: cair no
		// `creditMax` faz a Bevi devolver uma cota NOVA, diferente da que o card
		// anunciou (cliente vê 171.000, teto 180.000, contrato pede 180.000).
		//
		// A distinção que faltava: `valor` é DICA DE MATCHING, `administradoraPreferida`
		// é VÍNCULO. Só o vínculo precisa da parede. A carta exibida é o único número
		// que o cliente de fato viu, e usá-la não o compromete com marca nenhuma.
		const input = buildStartContractInput(SO_TEXTO, IDENT);
		expect(input.valor).toBe(171_000);
		expect(input.administradoraPreferida).toBeNull();
	});

	it("vale para os DOIS canais — provado pelas IMPORTAÇÕES, não por tautologia", () => {
		// ⚠️ A 1ª versão deste teste chamava `buildStartContractInput` DUAS VEZES e
		// comparava os resultados entre si. Ele passava com a correção revertida — a
		// 12ª revisão independente o listou como vácuo, e o próprio comentário que eu
		// tinha escrito admitia ("continua passando e mentindo"). Comparar uma função
		// pura com ela mesma não prova paridade de canal; prova que ela é
		// determinística.
		//
		// O que de fato sustenta a afirmação é estrutural: os dois canais IMPORTAM
		// esta função. Se algum deles passar a derivar o input por conta própria,
		// esta asserção quebra — e é exatamente aí que a parede rachou no FIX-413.
		const web = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
		const zap = readFileSync(join(process.cwd(), "src/lib/whatsapp/contract-capture.ts"), "utf8");
		expect(web, "a rota web precisa usar a derivação canônica").toContain(
			"buildStartContractInput",
		);
		expect(zap, "o WhatsApp precisa usar a MESMA derivação").toContain("buildStartContractInput");
	});
});
