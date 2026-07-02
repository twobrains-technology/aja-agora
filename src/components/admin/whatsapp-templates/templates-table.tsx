"use client";

import { Plus, RefreshCw } from "lucide-react";
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
import { TemplateFormDialog } from "./template-form-dialog";
import { TemplateRowActions } from "./template-row-actions";
import { templateStatusMeta } from "./template-status-meta";

export interface WhatsappTemplate {
	id: string;
	usageKey: string | null;
	metaName: string;
	language: string;
	category: "UTILITY" | "MARKETING" | "AUTHENTICATION" | null;
	components: Array<{ type: string; text?: string }> | null;
	bodyPreview: string | null;
	status: string;
	metaTemplateId: string | null;
	rejectionReason: string | null;
	submittedAt: string | null;
	approvedAt: string | null;
	createdAt: string;
}

function TableLoading() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-4 w-32" />
				<div className="flex gap-2">
					<Skeleton className="h-9 w-40" />
					<Skeleton className="h-9 w-36" />
				</div>
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Template</TableHead>
							<TableHead>Categoria</TableHead>
							<TableHead>Idioma</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Detalhe</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{Array.from({ length: 3 }).map((_, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
							<TableRow key={idx}>
								{Array.from({ length: 6 }).map((__, cidx) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells
									<TableCell key={cidx}>
										<Skeleton className="h-4 w-24" />
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

export function TemplatesTable() {
	const [items, setItems] = useState<WhatsappTemplate[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [syncMessage, setSyncMessage] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoadError(null);
		try {
			const res = await fetch("/api/admin/whatsapp/templates", { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { templates: WhatsappTemplate[] };
			setItems(data.templates);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setLoadError(`Falha ao carregar templates: ${message}`);
			setItems([]);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const handleSync = useCallback(async () => {
		setSyncing(true);
		setSyncMessage(null);
		try {
			const res = await fetch("/api/admin/whatsapp/templates/sync", { method: "POST" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { updated: number };
			setSyncMessage(
				data.updated > 0
					? `${data.updated} template(s) atualizado(s).`
					: "Status já estava em dia.",
			);
			await load();
		} catch (err) {
			setSyncMessage(`Falha ao sincronizar: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setSyncing(false);
		}
	}, [load]);

	if (items === null) return <TableLoading />;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="text-sm text-muted-foreground">
					{items.length} {items.length === 1 ? "template" : "templates"}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={handleSync} disabled={syncing}>
						<RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
						Sincronizar status
					</Button>
					<Button onClick={() => setCreateOpen(true)}>
						<Plus className="size-4" />
						Novo template
					</Button>
				</div>
			</div>

			{syncMessage && (
				<div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
					{syncMessage}
				</div>
			)}

			{loadError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{loadError}
				</div>
			)}

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Template</TableHead>
							<TableHead>Categoria</TableHead>
							<TableHead>Idioma</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Detalhe</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.length === 0 && !loadError && (
							<TableRow>
								<TableCell colSpan={6} className="text-center text-muted-foreground py-8">
									Nenhum template cadastrado ainda.
								</TableCell>
							</TableRow>
						)}
						{items.map((t) => {
							const meta = templateStatusMeta(t.status);
							return (
								<TableRow key={t.id}>
									<TableCell>
										<div className="font-medium font-mono text-sm">{t.metaName}</div>
										<div className="text-xs text-muted-foreground">
											{t.usageKey ? (
												<span className="font-mono">uso: {t.usageKey}</span>
											) : (
												<span className="italic">sem vínculo de uso</span>
											)}
										</div>
									</TableCell>
									<TableCell className="text-sm">{t.category ?? "—"}</TableCell>
									<TableCell className="text-sm font-mono">{t.language}</TableCell>
									<TableCell>
										<Badge variant={meta.variant}>{meta.label}</Badge>
									</TableCell>
									<TableCell className="max-w-xs">
										{t.rejectionReason ? (
											<span className="text-xs text-destructive">
												{t.status === "REJECTED" ? "Rejeitado: " : "Falha ao submeter: "}
												{t.rejectionReason}
											</span>
										) : (
											<span className="text-xs text-muted-foreground line-clamp-2">
												{t.bodyPreview ?? "—"}
											</span>
										)}
									</TableCell>
									<TableCell>
										<TemplateRowActions
											template={t}
											onEdit={() => setEditing(t)}
											onRefresh={load}
										/>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			<TemplateFormDialog
				mode="create"
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={load}
			/>

			{editing && (
				<TemplateFormDialog
					mode="edit"
					template={editing}
					open={editing !== null}
					onOpenChange={(open) => !open && setEditing(null)}
					onSuccess={load}
				/>
			)}
		</div>
	);
}
