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

	it("o valor NÃO herda a carta da conversa quando não há cota contratada", () => {
		// Sem ação estruturada, o crédito cai pro teto que o cliente pediu — nunca
		// pra carta de uma oferta que ele só olhou. Mesma regra do FIX-73, aplicada
		// ao campo certo.
		expect(buildStartContractInput(SO_TEXTO, IDENT).valor).toBe(180_000);
	});

	it("vale para os DOIS canais — é a mesma função", () => {
		// `contract-input.ts` é o módulo único consumido por `route.ts` (web) e
		// `whatsapp/contract-capture.ts`. Testar aqui é testar os dois; foi por não
		// olhar este arquivo que a parede do FIX-413 nasceu só na web, e mesmo lá
		// só no rótulo.
		//
		// Sentinela: se algum dia esta função deixar de ser a única derivação, este
		// teste continua passando e mentindo. O guard de allowlist
		// (`quem-assina-contrato.guard`) é quem cobre esse flanco.
		const web = buildStartContractInput(COM_ACAO_ESTRUTURADA, IDENT, { leadId: "lead-1" });
		const zap = buildStartContractInput(COM_ACAO_ESTRUTURADA, IDENT, { leadId: "lead-2" });
		expect(web.administradoraPreferida).toBe(zap.administradoraPreferida);
		expect(web.prazoPreferido).toBe(zap.prazoPreferido);
	});
});
