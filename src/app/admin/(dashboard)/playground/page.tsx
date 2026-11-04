import { notFound } from "next/navigation";
import { Playground } from "@/components/admin/playground/playground";
import { isPlaygroundEnabled } from "@/lib/playground/ambiente";

export default function PlaygroundPage() {
	if (!isPlaygroundEnabled()) {
		notFound();
	}

	return (
		<div className="space-y-3">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Playground de comportamento</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Ajuste o perfil do vendedor e compare a conversa antes e depois, lado a lado. Só existe em
					dev.
				</p>
			</div>
			<Playground />
		</div>
	);
}
