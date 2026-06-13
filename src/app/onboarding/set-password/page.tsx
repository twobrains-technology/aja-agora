import { headers } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

interface InviteInfo {
	email: string;
	name: string;
}

async function fetchInvite(
	token: string,
): Promise<{ ok: true; data: InviteInfo } | { ok: false; status: number; error: string }> {
	const h = await headers();
	const proto = h.get("x-forwarded-proto") ?? "http";
	const host = h.get("host") ?? "localhost:3000";
	const base = `${proto}://${host}`;

	const res = await fetch(
		`${base}/api/onboarding/set-password?token=${encodeURIComponent(token)}`,
		{ cache: "no-store" },
	);

	if (res.ok) {
		const data = (await res.json()) as InviteInfo;
		return { ok: true, data };
	}

	let error = `HTTP ${res.status}`;
	try {
		const body = (await res.json()) as { error?: string };
		if (body.error) error = body.error;
	} catch {
		// ignore
	}
	return { ok: false, status: res.status, error };
}

export default async function SetPasswordPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;

	if (!token) {
		return (
			<PageShell>
				<Card>
					<CardHeader>
						<CardTitle>Token ausente</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-sm text-muted-foreground">
							O link que você usou não contém um token válido. Verifique se copiou o link completo
							do email, ou peça um novo convite ao administrador.
						</p>
						<Button variant="outline" className="w-full" render={<Link href="/admin/login" />}>
							Ir para login
						</Button>
					</CardContent>
				</Card>
			</PageShell>
		);
	}

	const result = await fetchInvite(token);

	if (!result.ok) {
		return (
			<PageShell>
				<Card>
					<CardHeader>
						<CardTitle>Link inválido ou expirado</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-sm text-muted-foreground">
							Este convite já foi usado ou passou do prazo de 7 dias. Peça um novo convite ao
							administrador.
						</p>
						<Button variant="outline" className="w-full" render={<Link href="/admin/login" />}>
							Ir para login
						</Button>
					</CardContent>
				</Card>
			</PageShell>
		);
	}

	return (
		<PageShell>
			<Card>
				<CardHeader>
					<CardTitle>Bem-vindo, {result.data.name}!</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground mb-4">
						Defina sua senha para ativar o acesso ao Aja Agora com o email{" "}
						<strong>{result.data.email}</strong>.
					</p>
					<SetPasswordForm token={token} email={result.data.email} />
				</CardContent>
			</Card>
		</PageShell>
	);
}

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
			<div className="w-full max-w-md">{children}</div>
		</div>
	);
}
