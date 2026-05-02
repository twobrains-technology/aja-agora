import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

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
