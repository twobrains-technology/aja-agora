import { BotIcon, MessageSquareIcon, SmartphoneIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MODES = [
	{
		href: "/admin/simulator/whatsapp",
		title: "Cliente no WhatsApp",
		description:
			"Encarne um lead recebendo o agente pelo WhatsApp. UI fiel (bolhas, botões nativos) e mesmo código do canal real — sem mandar mensagem real.",
		icon: SmartphoneIcon,
	},
	{
		href: "/admin/simulator/web",
		title: "Cliente no Site",
		description:
			"Encarne um lead conversando pelo chat do site. Reusa os componentes reais (cards, gates, lead form) e a rota /api/chat de produção.",
		icon: MessageSquareIcon,
	},
	{
		href: "/admin/simulator/attendant",
		title: "Atendente Humano",
		description:
			"Encarne um atendente recebendo handoffs. Suas respostas vão pro cliente como se você estivesse no WhatsApp do vendedor.",
		icon: BotIcon,
	},
];

export default function SimulatorIndexPage() {
	if (process.env.NODE_ENV === "production") {
		notFound();
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Simulador</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Ferramenta de desenvolvimento. Escolha o papel que você quer encarnar — cada modo usa
					exatamente o mesmo caminho de código que a versão real, mas isola side-effects (Meta API,
					notificação a atendente, kanban, eval).
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				{MODES.map((mode) => {
					const Icon = mode.icon;
					return (
						<Link key={mode.href} href={mode.href} className="block">
							<Card className="h-full transition-colors hover:bg-accent/50">
								<CardHeader>
									<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
										<Icon className="size-5" />
									</div>
									<CardTitle className="mt-3 text-base">{mode.title}</CardTitle>
								</CardHeader>
								<CardContent>
									<CardDescription>{mode.description}</CardDescription>
								</CardContent>
							</Card>
						</Link>
					);
				})}
			</div>
		</div>
	);
}
