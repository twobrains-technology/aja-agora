import { requireRole } from "@/lib/admin/require-role";
import { diagnosticoDeAvisoSchema } from "@/lib/validations/diagnostico";

/**
 * Recebe o diagnóstico do aviso de mensagem que o navegador do atendente montou.
 *
 * Por que passa pelo servidor em vez de ficar no `console` do cliente: o console
 * mora na máquina de quem está com o problema, e a única forma de chegar até ele
 * seria pedir print — ou seja, a investigação dependeria da pessoa que já está
 * travada. Aqui o evento cai no log do container, filtrável por `[notificacoes]`
 * junto com o e-mail de quem reportou.
 *
 * Não grava em banco de propósito: é sinal de suporte, não dado de negócio.
 */

const LIMITE_DO_CORPO = 8_000;

export async function POST(req: Request) {
	const { error, session, role } = await requireRole(
		"admin",
		"viewer",
		"attendant",
		"mesa_externa",
	);
	if (error) return error;

	const cru = await req.text().catch(() => "");
	if (cru.length > LIMITE_DO_CORPO) {
		return Response.json({ ok: false, error: "corpo grande demais" }, { status: 413 });
	}

	let corpo: unknown;
	try {
		corpo = JSON.parse(cru);
	} catch {
		return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
	}

	const parsed = diagnosticoDeAvisoSchema.safeParse(corpo);
	if (!parsed.success) {
		return Response.json({ ok: false, error: "corpo inválido" }, { status: 400 });
	}

	// Uma linha por evento, JSON — mesmo formato do `[turn-trace]`, que é o que
	// deixa `tb-logs` filtrar sem parser especial.
	console.log(
		`[notificacoes] ${JSON.stringify({
			etapa: parsed.data.etapa,
			quando: parsed.data.quando ?? new Date().toISOString(),
			usuario: session.user.email ?? session.user.id,
			nome: session.user.name ?? null,
			papel: role,
			detalhe: parsed.data.detalhe ?? {},
			ambiente: parsed.data.ambiente ?? {},
		})}`,
	);

	return Response.json({ ok: true });
}
