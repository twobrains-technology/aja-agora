import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================================
// FIX-340(b) (bloco-c-whatsapp-invariantes) — contradição literal dentro do
// MESMO arquivo: a linha ~203 PROÍBE nomear o botão ("NUNCA instrua o usuário
// a 'tocar em Tenho interesse'... verbalizar o clique é vazar a mecânica"),
// mas a seção "Após simulação" MANDAVA fazer exatamente isso ("...direcione:
// 'Show, pra fechar e só tocar em \"Tenho interesse\" no resumo que
// enviei.'"). A regra mais recente/concreta vencia nas 4 jornadas — o modelo
// obedecia e ainda produzia o artefato de aspas com quebra de linha ao tentar
// citar o rótulo ("Tenho interesse!\n\n" no balão, dossiês moto/imóvel/
// serviços). Fix: a instrução de "após simulação" não pode mais citar o
// rótulo do botão entre aspas.
// ============================================================================

function promptSource(): string {
	return readFileSync(resolve(process.cwd(), "src/lib/agent/system-prompt.ts"), "utf-8");
}

describe("FIX-340(b) — o system-prompt não instrui o modelo a citar o botão entre aspas", () => {
	it("NÃO existe mais instrução pra 'tocar em/clicar em Tenho interesse' entre aspas", () => {
		const src = promptSource();
		expect(src).not.toMatch(/tocar em ['"]Tenho interesse/i);
		expect(src).not.toMatch(/clicar em ['"]Tenho interesse/i);
		expect(src).not.toMatch(/clica em ['"]Tenho interesse/i);
	});

	it("a regra 'NUNCA instrua/nomeie o botão' continua presente (não foi removida por engano)", () => {
		const src = promptSource();
		expect(src).toMatch(/NUNCA instrua o usu[áa]rio a ['"]tocar em Tenho interesse/i);
	});

	it("a seção pós-simulação não contradiz mais a regra — orienta SEM nomear o botão", () => {
		const src = promptSource();
		const match = src.match(
			/Se o usuário reagir positivamente em texto[\s\S]{0,400}?NUNCA chame recommend_groups/,
		);
		expect(match, "não achei o parágrafo de reação pós-simulação").not.toBeNull();
		const paragraph = match?.[0] ?? "";
		expect(paragraph).not.toMatch(/["']Tenho interesse["']/);
	});
});
