import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
// Fonte única do conjunto de papéis — a mesma que define o que cada um enxerga
// no kanban (`role-scope.ts`). Duas listas de role em arquivos diferentes é
// como um papel novo entra no sistema com acesso que ninguém revisou.
import type { Role } from "./role-scope";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** União DISCRIMINADA: `error` falsy garante `session` presente. Sem isto o tipo
 * saía como `session: Session | null` mesmo depois do `if (error) return error`,
 * e cada rota compensava com `session!.user.id` — non-null assertion espalhada
 * (5 ocorrências) escondendo que a garantia existe, só não estava no tipo. */
type RequireRoleResult =
	| { error: NextResponse; session: null; role: null }
	| { error: null; session: Session; role: Role };

/** O papel efetivo da sessão. Ausente = `viewer` (o default da coluna). */
export function roleDaSessao(session: Session): Role {
	return ((session.user as { role?: string }).role ?? "viewer") as Role;
}

/**
 * A conta foi desativada?
 *
 * Só o `false` explícito barra: sessão emitida antes de o campo passar a viajar
 * nela vem sem ele, e tratar ausência como desativado expulsaria do painel gente
 * que nunca foi desligada.
 */
export function contaDesativada(session: Session): boolean {
	return (session.user as { isActive?: boolean }).isActive === false;
}

export async function requireRole(...allowedRoles: Role[]): Promise<RequireRoleResult> {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return {
			error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
			session: null,
			role: null,
		};
	}

	// Antes do papel: desativado não é questão de permissão. Quem foi desligado
	// tem a role que sempre teve, e é justamente por isso que a checagem de papel
	// sozinha o deixava passar em todas as rotas que ele já usava.
	if (contaDesativada(session)) {
		return {
			error: NextResponse.json({ error: "Conta desativada" }, { status: 403 }),
			session: null,
			role: null,
		};
	}

	const userRole = roleDaSessao(session);

	if (!allowedRoles.includes(userRole)) {
		return {
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
			role: null,
		};
	}

	// O papel sai junto: quase toda rota que autoriza também precisa DECIDIR com
	// base nele (que raias devolver, que movimento aceitar). Sem isto cada rota
	// refazia o cast de `session.user.role` por conta própria.
	return { error: null, session, role: userRole };
}
