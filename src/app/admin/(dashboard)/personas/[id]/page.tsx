import { notFound } from "next/navigation";
import { PersonaEditShell } from "@/components/admin/personas/persona-edit-shell";
import { getPersonaForAdmin } from "@/lib/agent/personas-repo";

export default async function PersonaEditPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	let persona: Awaited<ReturnType<typeof getPersonaForAdmin>>;
	try {
		persona = await getPersonaForAdmin(id);
	} catch {
		notFound();
	}

	return <PersonaEditShell persona={persona} />;
}
