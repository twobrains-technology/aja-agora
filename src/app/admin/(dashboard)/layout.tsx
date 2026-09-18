import { cookies, headers } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { ChipDePeriodo } from "@/components/admin/dashboard/chip-de-periodo";
import { PeriodoProvider } from "@/components/admin/dashboard/periodo-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { COOKIE_DO_PERIODO, diasDoPeriodo } from "@/lib/admin/periodo";
import { resolverPeriodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import type { Role } from "@/lib/admin/role-scope";
import { auth } from "@/lib/auth";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
	// O papel vem do SERVIDOR pro menu não oferecer porta que o `proxy.ts` vai
	// fechar na cara de quem clicar. O menu é conveniência; quem barra é o proxy.
	const session = await auth.api.getSession({ headers: await headers() });
	const role = ((session?.user as { role?: string } | undefined)?.role ?? "viewer") as Role;

	// O período da PESSOA, lido do cookie no servidor e entregue ao cliente. É o
	// que faz uma escolha feita numa tela abrir a próxima na mesma janela — e o
	// que impede o `withDefault` do filtro de divergir das rotas na primeira
	// tela. Sem cookie, o padrão segue sendo HOJE.
	const jar = await cookies();
	const valorDoCookie = jar.get(COOKIE_DO_PERIODO)?.value ?? null;
	const periodo = resolverPeriodoDaRequisicao({ cookie: valorDoCookie });
	const dias = diasDoPeriodo(periodo.de, periodo.ate);

	return (
		<SidebarProvider>
			<AppSidebar role={role} />
			<SidebarInset className="overflow-x-hidden">
				<AdminHeader />
				<div className="mx-auto w-full max-w-7xl flex-1 overflow-x-auto px-4 py-6 sm:px-6">
					<NuqsAdapter>
						<PeriodoProvider de={dias.de} ate={dias.ate} veioDoCookie={Boolean(valorDoCookie)}>
							{/* O período em vigor, em uma linha. `Suspense` porque o chip lê a
							    querystring, e no render do servidor isso suspende. */}
							<div className="mb-4 flex justify-end">
								<Suspense
									fallback={
										<span className="inline-block h-7 w-40 rounded-md border bg-muted/40" />
									}
								>
									<ChipDePeriodo />
								</Suspense>
							</div>
							{children}
						</PeriodoProvider>
					</NuqsAdapter>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
