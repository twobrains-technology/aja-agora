import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	const onlyKanban = process.env.FEATURE_ONLY_KANBAN === "true";

	// Feature: Only Kanban — redirect "/" and "/admin" straight to kanban, skip auth
	if (onlyKanban) {
		if (pathname === "/" || pathname === "/admin") {
			return NextResponse.redirect(new URL("/admin/pipeline", request.url));
		}
		// No auth guard in kanban-only mode
		return NextResponse.next();
	}

	// Feature: Landing Page — when disabled, redirect "/" to admin login
	if (pathname === "/" && process.env.FEATURE_LANDING_PAGE === "false") {
		return NextResponse.redirect(new URL("/admin/login", request.url));
	}

	// Auth guard for admin routes (except login)
	if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
		const session = await auth.api.getSession({
			headers: await headers(),
		});

		if (!session) {
			return NextResponse.redirect(new URL("/admin/login", request.url));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/", "/admin", "/admin/((?!login).*)"],
};
