// FIX-407 — "não vejo a hora de fechar" não é uma recusa.
//
// A 9ª revisão independente achou isto medindo o predicado de produção, e o
// achado é meu: o FIX-406 pôs `detectYesNoText(...) === false` como veto no
// atalho de fechamento do WhatsApp, e com isso SEIS falas reais de fechamento
// pararam de fechar. Mas a causa não estava no veto — estava no primitivo:
//
//   detectYesNoText("não vejo a hora, quero fechar")   → false
//   detectYesNoText("não tenho dúvida, quero fechar")  → false
//   detectYesNoText("não pensei duas vezes, fechado")  → false
//
// Todas são ENTUSIASMO. O português usa a negação como intensificador positivo
// ("não vejo a hora", "não tenho dúvida", "não pensei duas vezes"), e a regra de
// "quem aparece primeiro governa" lê o "não" inicial como recusa. Isso vale nos
// DOIS canais: no gate da web, quem responde "não vejo a hora" a "quer seguir?"
// era registrado como tendo recusado.
//
// O remédio é o que o próprio módulo já faz com a hesitação: `avaliarOracao`
// remove "não sei" antes de julgar, porque quem diz "não sei, pode mostrar sim"
// está aceitando. Idioma entusiasmado é a mesma figura — a negação não nega o
// verbo seguinte, ela intensifica a frase. Uma lista lexical é o instrumento
// certo aqui, pelo motivo que `yes-no.ts:21` já argumenta: cada entrada é uma
// expressão inequívoca, ao contrário de uma regra em bloco que apostaria no
// infinito.
//
// ⚠️ A metade que impede o remédio de virar doença: remover o "não" NÃO pode
// transformar recusa em aceite. "não quero" segue sendo recusa; só as locuções
// fixas listadas são neutralizadas, e só elas.
import { describe, expect, it } from "vitest";
import { detectYesNoText, falaRecusa } from "./yes-no";

describe("FIX-407 — negação que intensifica não é negação que recusa", () => {
	it.each([
		"não vejo a hora, quero fechar",
		"não vejo a hora de começar",
		"não tenho dúvida, quero fechar",
		"não tenho dúvidas, é essa",
		"não quero perder essa, bora fechar",
		"não aguento mais esperar, quero fechar",
		"não pensei duas vezes, fechado",
		"não é à toa que eu quero essa",
	])("idioma entusiasmado não vira recusa: %s", (fala) => {
		expect(detectYesNoText(fala, "neutral"), fala).not.toBe(false);
		expect(falaRecusa(fala), fala).toBe(false);
	});

	it.each([
		// A contraprova. Se a lista de idiomas vazasse para além das locuções
		// fixas, TODA recusa com "não" viraria indefinida e o funil deixaria de
		// fechar gates — que é o defeito oposto e igualmente caro (foi o que o
		// FIX-396 corrigiu).
		"não quero",
		"não quero o embutido",
		"não, obrigado",
		"não gostei dessa",
		"não vou fechar",
		"não quero usar o embutido, mas quero ver as opções",
	])("recusa de verdade continua sendo recusa: %s", (fala) => {
		expect(detectYesNoText(fala, "neutral"), fala).toBe(false);
	});

	it("a hesitação preservada pelo módulo desde sempre não regride", () => {
		// `não sei, pode mostrar sim` é aceite (o strip de "não sei" já existia).
		expect(detectYesNoText("não sei, pode mostrar sim", "neutral")).toBe(true);
		// E `não sei se` continua sendo dúvida sobre a própria coisa.
		expect(detectYesNoText("não sei se quero", "neutral")).toBeNull();
	});
});

describe("FIX-407 — `falaRecusa` é o predicado ÚNICO de recusa", () => {
	// Ele vivia privado em `choose-offer.ts`. O FIX-406 precisou de um veto de
	// recusa no proxy do WhatsApp e usou só METADE dele (`detectYesNoText`),
	// deixando passar toda a família sem marcador — exatamente a divergência que
	// o commit dizia estar evitando ao não escrever "uma nona regex".
	it.each([
		"de jeito nenhum",
		"nem pensar",
		"jamais",
		"nunca",
		"de forma alguma",
		"detesto",
		"odeio",
		"não quero",
	])("recusa sem depender da palavra 'não': %s", (fala) => {
		expect(falaRecusa(fala), fala).toBe(true);
	});

	it.each(["quero fechar", "bora fechar", "topei", "tenho interesse", "pode ser"])(
		"fala afirmativa não é recusa: %s",
		(fala) => {
			expect(falaRecusa(fala), fala).toBe(false);
		},
	);
});
