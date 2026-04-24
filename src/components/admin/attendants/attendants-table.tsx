"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { AttendantFormDialog } from "./attendant-form-dialog";
import { AttendantRowActions } from "./attendant-row-actions";

export type AttendantStatus = "pending" | "active" | "inactive";

export interface Attendant {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	invitedAt: string | null;
	createdAt: string;
	status: AttendantStatus;
}

const STATUS_LABEL: Record<AttendantStatus, string> = {
	pending: "Convite pendente",
	active: "Ativo",
	inactive: "Inativo",
};

const STATUS_VARIANT: Record<AttendantStatus, "default" | "secondary" | "outline"> = {
	pending: "secondary",
	active: "default",
	inactive: "outline",
};

function AttendantsTableLoading() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-9 w-40" />
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nome</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Telefone</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Convidado em</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{Array.from({ length: 4 }).map((_, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
							<TableRow key={idx}>
								<TableCell>
									<Skeleton className="h-4 w-28" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-40" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-32" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-5 w-20 rounded-full" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-20" />
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

export function AttendantsTable() {
	const [attendants, setAttendants] = useState<Attendant[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<Attendant | null>(null);

	const loadAttendants = useCallback(async () => {
		setLoadError(null);
		try {
			const res = await fetch("/api/admin/attendants", { cache: "no-store" });
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const data = (await res.json()) as { attendants: Attendant[] };
			setAttendants(data.attendants);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setLoadError(`Falha ao carregar atendentes: ${message}`);
			setAttendants([]);
		}
	}, []);

	useEffect(() => {
		void loadAttendants();
	}, [loadAttendants]);

	if (attendants === null) {
		return <AttendantsTableLoading />;
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					{attendants.length} {attendants.length === 1 ? "atendente" : "atendentes"}
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
							<TableHead>Email</TableHead>
							<TableHead>Telefone</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Convidado em</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{attendants.length === 0 && !loadError && (
							<TableRow>
								<TableCell colSpan={6} className="text-center text-muted-foreground py-8">
									Nenhum atendente cadastrado ainda.
								</TableCell>
							</TableRow>
						)}
						{attendants.map((a) => (
							<TableRow key={a.id}>
								<TableCell className="font-medium">{a.name}</TableCell>
								<TableCell>{a.email}</TableCell>
								<TableCell>{a.phone ?? "—"}</TableCell>
								<TableCell>
									<Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{a.invitedAt ? new Date(a.invitedAt).toLocaleDateString("pt-BR") : "—"}
								</TableCell>
								<TableCell>
									<AttendantRowActions
										attendant={a}
										onEdit={() => setEditing(a)}
										onRefresh={loadAttendants}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<AttendantFormDialog
				mode="create"
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={loadAttendants}
			/>

			{editing && (
				<AttendantFormDialog
					mode="edit"
					attendant={editing}
					open={editing !== null}
					onOpenChange={(open) => !open && setEditing(null)}
					onSuccess={loadAttendants}
				/>
			)}
		</div>
	);
}
