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
import { AdministradoraFormDialog } from "./administradora-form-dialog";
import { AdministradoraRowActions } from "./administradora-row-actions";

export interface Administradora {
	id: string;
	nome: string;
	slug: string;
	codigoBevi: string | null;
	isActive: boolean;
	createdAt: string;
}

function AdministradorasTableLoading() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-9 w-48" />
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nome</TableHead>
							<TableHead>Slug</TableHead>
							<TableHead>Código Bevi</TableHead>
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
									<Skeleton className="h-4 w-28" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-20" />
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

export function AdministradorasTable() {
	const [items, setItems] = useState<Administradora[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<Administradora | null>(null);

	const load = useCallback(async () => {
		setLoadError(null);
		try {
			const res = await fetch("/api/admin/administradoras", { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { administradoras: Administradora[] };
			setItems(data.administradoras);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setLoadError(`Falha ao carregar administradoras: ${message}`);
			setItems([]);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (items === null) return <AdministradorasTableLoading />;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					{items.length} {items.length === 1 ? "administradora" : "administradoras"}
				</div>
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="size-4" />
					Adicionar administradora
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
							<TableHead>Slug</TableHead>
							<TableHead>Código Bevi</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.length === 0 && !loadError && (
							<TableRow>
								<TableCell colSpan={5} className="text-center text-muted-foreground py-8">
									Nenhuma administradora cadastrada ainda.
								</TableCell>
							</TableRow>
						)}
						{items.map((a) => (
							<TableRow key={a.id}>
								<TableCell className="font-medium">{a.nome}</TableCell>
								<TableCell className="text-muted-foreground font-mono text-xs">{a.slug}</TableCell>
								<TableCell>{a.codigoBevi ?? "—"}</TableCell>
								<TableCell>
									<Badge variant={a.isActive ? "default" : "outline"}>
										{a.isActive ? "Ativa" : "Inativa"}
									</Badge>
								</TableCell>
								<TableCell>
									<AdministradoraRowActions
										administradora={a}
										onEdit={() => setEditing(a)}
										onRefresh={load}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<AdministradoraFormDialog
				mode="create"
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={load}
			/>

			{editing && (
				<AdministradoraFormDialog
					mode="edit"
					administradora={editing}
					open={editing !== null}
					onOpenChange={(open) => !open && setEditing(null)}
					onSuccess={load}
				/>
			)}
		</div>
	);
}
