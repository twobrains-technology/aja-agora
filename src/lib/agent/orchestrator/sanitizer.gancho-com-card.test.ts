// FIX-431 (P1 #9) — o gancho que anuncia um CARD não é órfão.
//
// Produção, WhatsApp, 2026-08-13, sessão `04fda013`, trace `71191c00`: turno
// mudo com dois cards na tela. O modelo escreveu "Beleza, dá uma olhada na
// simulação da BANCO DO BRASIL:" — exatamente o exemplo que a directive ditava —
// chamou `simulate_quota` e `present_simulation_result`, e o card saiu. A fala,
// não: o sanitizer classificou a frase como GANCHO (termina em ":"), segurou
// esperando o segmento seguinte, e no flush descartou. Quinze segundos de
// silêncio num canal onde card não existe.
//
// A regra "gancho sozinho no fim do turno não anuncia nada" nasceu do gancho
// órfão de TEXTO e continua certa. O que faltava era distinguir: quando o turno
// ENTREGOU um artifact, o que o gancho anunciava apareceu de verdade.
import { describe, expect, it } from "vitest";
import { EphemeralTextFilter } from "./sanitizer";

const GANCHO = "Beleza, essa é a simulação da BANCO DO BRASIL:";

describe("gancho pendurado no fim do turno", () => {
	it("COM card no turno: a fala sai (o gancho tinha o que anunciar)", () => {
		const filter = new EphemeralTextFilter();
		filter.push(GANCHO);
		filter.marcarArtifactEmitido();

		expect(filter.flush()).toContain("simulação da BANCO DO BRASIL");
	});

	// O comportamento antigo continua valendo onde ele nasceu: sem nada entregue,
	// um gancho sozinho promete uma frase que não existe.
	it("SEM card no turno: o gancho continua descartado", () => {
		const filter = new EphemeralTextFilter();
		filter.push(GANCHO);

		expect(filter.flush()).toBe("");
	});

	it("gancho seguido de texto sai junto com o texto, como sempre", () => {
		const filter = new EphemeralTextFilter();
		filter.push(`${GANCHO} A parcela ficou em R$ 696,72.`);

		const saida = filter.flush();
		expect(saida).toContain("simulação da BANCO DO BRASIL");
		expect(saida).toContain("696,72");
	});
});

// Auditoria de 2026-08-13: o gancho descartado no `flush()` zerava
// `this.gancho` sem registrar motivo em `droppedReasons`. Consequência: quando
// SÓ o gancho caía, nem a anotação de corte (que avisa o modelo do que não
// chegou ao cliente) nem o score `fala_podada` disparavam — o turno mudo saía
// sem rastro, que é exatamente o buraco que a sessão veio fechar.
describe("gancho descartado deixa rastro", () => {
	it("gancho podado sem card registra o motivo", () => {
		const filter = new EphemeralTextFilter();
		filter.push(GANCHO);
		filter.flush();

		expect(filter.droppedSegmentReasons()).toContain("gancho");
	});

	it("gancho entregue com card NÃO conta como poda", () => {
		const filter = new EphemeralTextFilter();
		filter.push(GANCHO);
		filter.marcarArtifactEmitido();
		filter.flush();

		expect(filter.droppedSegmentReasons()).not.toContain("gancho");
	});
});
