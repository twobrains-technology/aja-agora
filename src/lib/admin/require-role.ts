import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type Role = "admin" | "viewer";

export async function requireRole(...allowedRoles: Role[]) {
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
