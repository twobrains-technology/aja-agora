/**
 * Gera um PDF mínimo válido (1 página, fonte Helvetica padrão) com um texto
 * extraível, computando os offsets do xref em código (byte-exato). Usado como
 * fixture nos testes de extração de PDF (FIX-62) — evita commitar binário e
 * mantém o texto-alvo explícito no teste.
 *
 * Restrições: texto deve ser ASCII (sem parênteses não-escapados). Suficiente
 * pro fixture de teste.
 */
export function makeMinimalPdf(text: string): Uint8Array<ArrayBuffer> {
	const safe = text.replace(/([\\()])/g, "\\$1");
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		`<< /Length ${`BT /F1 24 Tf 72 700 Td (${safe}) Tj ET`.length} >>\nstream\nBT /F1 24 Tf 72 700 Td (${safe}) Tj ET\nendstream`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	];

	let body = "%PDF-1.4\n";
	const offsets: number[] = [];
	for (let i = 0; i < objects.length; i++) {
		offsets.push(body.length);
		body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
	}

	const xrefOffset = body.length;
	let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const off of offsets) {
		xref += `${String(off).padStart(10, "0")} 00000 n \n`;
	}
	const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

	return new Uint8Array(Buffer.from(body + xref + trailer, "latin1"));
}
