"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { MesaAttendantFormDialog } from "./mesa-attendant-form-dialog";
import { MesaAttendantRowActions } from "./mesa-attendant-row-actions";

export interface MesaAttendant {
	id: string;
	nome: string;
	whatsapp: string;
	isActive: boolean;
	createdAt: string;
}

/** Formata E.164 sem '+' (5562999998888) pra exibição: +55 (62) 99999-8888. */
export function formatWhatsappDisplay(e164: string): string {
	const d = e164.replace(/\D/g, "");
	if (d.length < 12) return e164;
	const ddi = d.slice(0, 2);
	const ddd = d.slice(2, 4);
	const rest = d.slice(4);
	if (rest.length === 9) return `+${ddi} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
	if (rest.length === 8) return `+${ddi} (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
	return e164;
}

function MesaAttendantsTableLoading() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-9 w-44" />
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nome</TableHead>
							<TableHead>WhatsApp</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{Array.from({ length: 3 }).map((_, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
							<TableRow key={idx}>
								<TableCell>
									<Skeleton className="h-4 w-32" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-36" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-5 w-16 rounded-full" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-8 w-8 rounded-md" />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

export function MesaAttendantsTable() {
	const [items, setItems] = useState<MesaAttendant[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<MesaAttendant | null>(null);

	const load = useCallback(async () => {
		setLoadError(null);
		try {
			const res = await fetch("/api/admin/mesa-attendants", { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { mesaAttendants: MesaAttendant[] };
			setItems(data.mesaAttendants);
		} catch (err) {
			setLoadError(
				`Falha ao carregar atendentes de mesa: ${err instanceof Error ? err.message : err}`,
			);
			setItems([]);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (items === null) return <MesaAttendantsTableLoading />;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					{items.length} {items.length === 1 ? "atendente" : "atendentes"}
				</div>
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="size-4" />
					Adicionar atendente
				</Button>
			</div>

			{loadError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{loadError}
				</div>
			)}

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nome</TableHead>
							<TableHead>WhatsApp</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.length === 0 && !loadError && (
							<TableRow>
								<TableCell colSpan={4} className="text-center text-muted-foreground py-8">
									Nenhum atendente de mesa cadastrado ainda.
								</TableCell>
							</TableRow>
						)}
						{items.map((a) => (
							<TableRow key={a.id}>
								<TableCell className="font-medium">{a.nome}</TableCell>
								<TableCell className="font-mono text-sm">
									{formatWhatsappDisplay(a.whatsapp)}
								</TableCell>
								<TableCell>
									<Badge variant={a.isActive ? "default" : "outline"}>
										{a.isActive ? "Ativo" : "Inativo"}
									</Badge>
								</TableCell>
								<TableCell>
									<MesaAttendantRowActions
										attendant={a}
										onEdit={() => setEditing(a)}
										onRefresh={load}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<MesaAttendantFormDialog
				mode="create"
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={load}
			/>

			{editing && (
				<MesaAttendantFormDialog
					mode="edit"
					attendant={editing}
					open={editing !== null}
					onOpenChange={(open) => !open && setEditing(null)}
					onSuccess={load}
				/>
			)}
		</div>
	);
}
