import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ConversationsPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
				<p className="text-muted-foreground text-sm mt-1">Historico de conversas com leads.</p>
			</div>

			<Card className="shadow-sm">
				<CardContent className="flex flex-col items-center justify-center py-16 text-center">
					<div className="flex size-14 items-center justify-center rounded-full bg-primary/10 mb-4">
						<MessageSquare className="size-7 text-primary" />
					</div>
					<h3 className="text-lg font-semibold">Nenhuma conversa ainda</h3>
					<p className="text-sm text-muted-foreground mt-1 max-w-sm">
						As conversas dos leads aparecerao aqui conforme interagirem com o agente.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
