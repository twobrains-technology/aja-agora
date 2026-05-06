import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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

	// Per-section feature flags — redirect disabled admin sections to first available
	const dashboardEnabled = process.env.FEATURE_DASHBOARD !== "false";
	const pipelineEnabled = process.env.FEATURE_PIPELINE !== "false";
	const attendantsEnabled = process.env.FEATURE_ATTENDANTS !== "false";
	const personasEnabled = process.env.FEATURE_PERSONAS !== "false";

	const fallbackAdminRoute = dashboardEnabled
		? "/admin"
		: pipelineEnabled
			? "/admin/pipeline"
			: "/admin/conversations";

	const sectionDisabled =
		(pathname === "/admin" && !dashboardEnabled) ||
		(pathname.startsWith("/admin/pipeline") && !pipelineEnabled) ||
		(pathname.startsWith("/admin/attendants") && !attendantsEnabled) ||
		(pathname.startsWith("/admin/personas") && !personasEnabled);

	if (sectionDisabled && pathname !== fallbackAdminRoute) {
		return NextResponse.redirect(new URL(fallbackAdminRoute, request.url));
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
