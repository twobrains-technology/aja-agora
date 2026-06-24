// Camada 1 / unit — FIX-62: extração de texto de PDF (unpdf) roda de verdade
// sobre um fixture mínimo gerado em código.
import { describe, expect, it } from "vitest";
import { makeMinimalPdf } from "../../../tests/helpers/make-pdf";
import { extractPdfText } from "./extract";

describe("FIX-62 — extractPdfText", () => {
	it("extrai o texto de um PDF mínimo", async () => {
		const pdf = makeMinimalPdf("MANUAL CANOPUS PROCEDIMENTO");
		const text = await extractPdfText(pdf);
		expect(text).toContain("CANOPUS");
		expect(text.length).toBeGreaterThan(0);
	});
});
