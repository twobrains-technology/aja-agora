import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type Role = "admin" | "viewer" | "attendant";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** União DISCRIMINADA: `error` falsy garante `session` presente. Sem isto o tipo
 * saía como `session: Session | null` mesmo depois do `if (error) return error`,
 * e cada rota compensava com `session!.user.id` — non-null assertion espalhada
 * (5 ocorrências) escondendo que a garantia existe, só não estava no tipo. */
type RequireRoleResult = { error: NextResponse; session: null } | { error: null; session: Session };

export async function requireRole(...allowedRoles: Role[]): Promise<RequireRoleResult> {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return {
			error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
			session: null,
		};
	}

	const userRole = (session.user as { role?: string }).role ?? "viewer";

	if (!allowedRoles.includes(userRole as Role)) {
		return {
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
		};
	}

	return { error: null, session };
}
