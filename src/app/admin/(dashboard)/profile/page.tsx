import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TrocarSenhaForm } from "@/components/admin/perfil/trocar-senha-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";

export const metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) redirect("/admin/login");

	const { name, email } = session.user;
	const papel = (session.user as { role?: string }).role ?? "viewer";

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Meu perfil</h1>
				<p className="text-muted-foreground text-sm mt-1">Seus dados de acesso a este painel.</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Dados da conta</CardTitle>
					<CardDescription>
						Nome e e-mail são definidos por quem administra o painel. Para alterá-los, fale com um
						administrador.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 text-sm sm:grid-cols-3">
					<div>
						<div className="text-muted-foreground text-xs">Nome</div>
						<div className="font-medium">{name || "—"}</div>
					</div>
					<div>
						<div className="text-muted-foreground text-xs">E-mail</div>
						<div className="font-medium break-all">{email}</div>
					</div>
					<div>
						<div className="text-muted-foreground text-xs">Papel</div>
						<div className="font-medium">{papel}</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Trocar senha</CardTitle>
					<CardDescription>
						Ao trocar a senha, as sessões abertas em outros dispositivos são encerradas.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<TrocarSenhaForm />
				</CardContent>
			</Card>
		</div>
	);
}
