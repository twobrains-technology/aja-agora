/**
 * A PRÉVIA do system do vendedor — "o que o modelo recebe", montado de verdade.
 *
 * Mostra o texto que o próximo turno usaria, com os três blocos separados:
 * conduta (a caixa viva), skills e a linha de fato. A identidade é de EXEMPLO e
 * não carrega CPF real: a prévia existe para conferir a conduta publicada, não
 * para ver dado de cliente — e o system nunca imprime os dígitos de qualquer
 * forma (o fato traz `CPF: ainda não informado`).
 */

import { requireRole } from "@/lib/admin/require-role";
import { labelDaCaixa, lerCaixa } from "@/lib/agent/box/caixa";
import { montarSystemDoVendedor } from "@/lib/agent/pi/system-do-vendedor";

export async function GET() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const label = labelDaCaixa();

	try {
		// A caixa é lida AQUI e repassada: assim a prévia mostra exatamente a
		// versão que ela mesma anuncia em `versao`/`origem`.
		const caixa = await lerCaixa({ label });
		const { system, partes } = await montarSystemDoVendedor({
			channel: "web",
			contactName: "Cliente de exemplo",
			identidade: null,
			caixa,
		});

		return Response.json({
			system,
			partes,
			label,
			versao: caixa.versao,
			origem: caixa.origem,
		});
	} catch (err) {
		console.error("[admin/caixa/previa GET]", err);
		return Response.json({ error: "Não foi possível montar a prévia do system." }, { status: 500 });
	}
}
