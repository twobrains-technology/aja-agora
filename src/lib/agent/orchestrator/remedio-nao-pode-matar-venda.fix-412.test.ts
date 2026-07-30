// FIX-412 — o remédio passou a custar mais que a doença. Três regressões MINHAS.
//
// A 10ª revisão independente mediu os fixes 407/408 e achou que eles tinham
// introduzido defeitos piores que os corrigidos. Ela está certa nos três, e os
// três são da mesma família: eu tratei "a palavra de recusa aparece" como "há
// recusa", quando em português essas palavras também são INTENSIFICADORES.
//
//   1. `segments.some(falaRecusa)` no proxy barrou DOZE fechamentos legítimos:
//      "nunca tive tanta certeza, quero fechar" → não fechava mais. No canal de
//      MAIOR VOLUME. Matar venda é pior que o que o veto foi corrigir.
//
//   2. o strip de idioma entusiasmado virava ACEITE: removido o "não", sobrava
//      "quero" — e "cancelar"/"desistir" não estão no léxico do NÃO. Resultado:
//      "não quero perder tempo, pode deixar" marcava `decisionAccepted`, que abre
//      o gate `contract`. O cliente pedindo pra cancelar recebia o formulário.
//
//   3. `SEM (A|O)` como gatilho de CLÁUSULA recriou, dentro da correção, o bug
//      que o `choose-offer.ts` documenta: "quero a Rodobens, sem a menor dúvida"
//      mandava o contrato pra CANOPUS — parcela 2,5× menor, sem uma palavra sobre
//      a troca.
//
// As três correções compartilham um princípio, e é ele que este arquivo guarda:
// **a palavra de recusa só recusa quando ela É a fala, ou quando incide sobre a
// coisa.** Fora disso ela é ênfase. É a mesma âncora que o `INTEREST_RE` sempre
// usou pro lado positivo — o instrumento estava no repo, eu é que não o apliquei
// deste lado.
import { describe, expect, it } from "vitest";
import { isInterestExpression } from "@/lib/whatsapp/proxy";
import { resolveAdministradoraMention } from "./choose-offer";
import { detectYesNoText, recusaIsolada } from "./yes-no";

type Oferta = Parameters<typeof resolveAdministradoraMention>[0][number];
const OFERTAS = [
	{
		groupId: "rodobens",
		administradora: "RODOBENS",
		creditValue: 171_000,
		monthlyPayment: 2_719,
		termMonths: 96,
	},
	{
		groupId: "canopus",
		administradora: "CANOPUS",
		creditValue: 170_000,
		monthlyPayment: 1_092,
		termMonths: 96,
	},
] as unknown as Oferta[];

describe("FIX-412 (1) — palavra de recusa como ÊNFASE não barra a venda", () => {
	it.each([
		"nunca tive tanta certeza, quero fechar",
		"nunca vi proposta melhor, bora fechar",
		"jamais vi oferta melhor, bora fechar",
		"esquece as outras, quero fechar",
		"odeio esperar, quero fechar",
		"detesto enrolação, bora fechar",
		"de jeito nenhum eu perco essa, quero fechar",
		"nem pensar em desistir, quero fechar",
		"não vejo a hora, quero fechar",
	])("fechamento legítimo passa: %s", (fala) => {
		expect(isInterestExpression(fala), fala).toBe(true);
	});

	it.each([
		// A metade que impede o remédio de virar "nunca barra nada". Aqui a palavra
		// de recusa É a fala inteira daquele segmento.
		"não, quero fechar",
		"de jeito nenhum, quero fechar",
		"jamais, topei",
		"deixa pra lá, quero fechar",
		"esquece, tenho interesse",
		"nem pensar, bora fechar",
		"não quero fechar",
		"Rodobens, não obrigado",
		// A 10ª revisão também achou o vocabulário coloquial que faltava: estas
		// disparavam a diretiva de contrato porque `falaRecusa` não as enxerga.
		"cancela, quero fechar",
		"desisti, quero fechar",
		"tô fora, quero fechar",
		"deixa quieto, quero fechar",
		"nem a pau, quero fechar",
		"nem morto, quero fechar",
	])("recusa isolada barra o contrato: %s", (fala) => {
		expect(isInterestExpression(fala), fala).toBe(false);
	});

	it("`recusaIsolada` é mais estrita que `falaRecusa` — e é essa a diferença", () => {
		// Os dois predicados existem de propósito e respondem a perguntas
		// diferentes. Confundi-los foi o defeito: usei o permissivo onde errar
		// custa uma venda.
		expect(recusaIsolada("de jeito nenhum")).toBe(true);
		expect(recusaIsolada("de jeito nenhum eu perco essa")).toBe(false);
		expect(recusaIsolada("esquece")).toBe(true);
		expect(recusaIsolada("esquece as outras")).toBe(false);
	});
});

describe("FIX-412 (2) — idioma entusiasmado NEUTRALIZA, nunca AFIRMA", () => {
	it.each([
		"não quero perder tempo, pode deixar",
		"não aguento mais, quero cancelar",
		"não vejo a hora de sair dessa, pode cancelar",
		"não pensei duas vezes, quero desistir",
	])("recusa com locução entusiasmada não vira aceite: %s", (fala) => {
		// `decisionAccepted` (advance.ts) exige `=== true` e abre o gate `contract`.
		// `null` é a saída segura: o gate pergunta de novo.
		expect(detectYesNoText(fala, "neutral"), fala).not.toBe(true);
	});

	it("e continua não sendo lido como RECUSA (o que o FIX-407 corrigiu)", () => {
		// A correção não pode desfazer a anterior: o ponto do FIX-407 é que
		// "não vejo a hora" não é uma recusa. Ela agora é indefinida — nem sim, nem
		// não —, que é o que uma ênfase ambígua merece.
		expect(detectYesNoText("não vejo a hora, quero fechar", "neutral")).toBeNull();
		expect(detectYesNoText("não tenho dúvida, quero fechar", "neutral")).toBeNull();
	});

	it("recusa clássica segue sendo recusa", () => {
		expect(detectYesNoText("não quero", "neutral")).toBe(false);
		expect(detectYesNoText("não quero o embutido", "neutral")).toBe(false);
	});
});

describe("FIX-412 (3) — exclusão incide sobre a MARCA, não sobre a cláusula", () => {
	it.each([
		"quero a Rodobens, sem a menor dúvida",
		"quero a Rodobens, sem a burocracia toda",
		"a Rodobens, tirando a taxa, é perfeita — quero fechar",
		"a Rodobens, sem a menor dúvida",
		"a Rodobens é a que eu quero, exceto se tiver taxa escondida",
	])("ênfase com preposição de exclusão NÃO troca a marca escolhida: %s", (fala) => {
		// Este era o pior dos três: o cliente pedia RODOBENS (R$ 2.719/mês) e
		// recebia o formulário da CANOPUS (R$ 1.092/mês), calado.
		expect(resolveAdministradoraMention(OFERTAS, fala)?.administradora, fala).toBe("RODOBENS");
	});

	it.each([
		// E a exclusão de verdade continua valendo — inclusive as formas que a 10ª
		// revisão achou passando pela lista da 1ª versão.
		"qualquer uma menos essa Rodobens, quero fechar",
		"sem ser a Rodobens, quero fechar",
		"com exceção da Rodobens, quero fechar",
		"pode ser qualquer uma que não seja a Rodobens, quero fechar",
		"fora a Rodobens, quero fechar",
		"a Rodobens eu já eliminei, quero fechar",
		"a Rodobens tá descartada, quero fechar",
	])("exclusão adjacente à marca continua excluindo: %s", (fala) => {
		expect(resolveAdministradoraMention(OFERTAS, fala)?.administradora, fala).not.toBe("RODOBENS");
	});
});
