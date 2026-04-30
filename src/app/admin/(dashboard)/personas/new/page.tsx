import { PersonaCreateForm } from "@/components/admin/personas/persona-create-form";

export default function PersonaNewPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Nova persona</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Adicione uma nova persona pra conversar com seus clientes.
				</p>
			</div>
			<PersonaCreateForm />
		</div>
	);
}
