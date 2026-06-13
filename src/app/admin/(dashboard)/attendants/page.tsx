import { AttendantsTable } from "@/components/admin/attendants/attendants-table";

export default function AttendantsPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Atendentes</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Gerencie os atendentes que recebem handoffs das conversas.
				</p>
			</div>
			<AttendantsTable />
		</div>
	);
}
