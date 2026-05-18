"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type TemplateRow = {
	id: string;
	name: string;
	category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
	language: string;
	bodyText: string;
	metaStatus: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
	metaRejectionReason: string | null;
	placeholdersCount: number;
	createdAt: string;
};

const STATUS_VARIANT: Record<
	TemplateRow["metaStatus"],
	"default" | "secondary" | "destructive" | "outline"
> = {
	DRAFT: "outline",
	PENDING: "secondary",
	APPROVED: "default",
	REJECTED: "destructive",
	PAUSED: "destructive",
	DISABLED: "outline",
};

export function WhatsAppTemplatesTable() {
	const [rows, setRows] = useState<TemplateRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/admin/whatsapp-templates")
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				const data = (await r.json()) as { templates: TemplateRow[] };
				setRows(data.templates);
			})
			.catch((e) => setError(e.message));
	}, []);

	if (error) {
		return (
			<div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
				Erro ao carregar templates: {error}
			</div>
		);
	}

	if (!rows) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
				Nenhum template cadastrado. Clique em &ldquo;Novo template&rdquo; pra criar o primeiro.
			</div>
		);
	}

	return (
		<div className="rounded-lg border">
			<table className="w-full text-sm">
				<thead className="bg-muted/40 text-left">
					<tr>
						<th className="px-4 py-2.5 font-medium">Nome</th>
						<th className="px-4 py-2.5 font-medium">Categoria</th>
						<th className="px-4 py-2.5 font-medium">Status Meta</th>
						<th className="px-4 py-2.5 font-medium">Placeholders</th>
						<th className="px-4 py-2.5 font-medium">Body</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((t) => (
						<tr key={t.id} className="border-t">
							<td className="px-4 py-2.5 font-mono text-xs">{t.name}</td>
							<td className="px-4 py-2.5">{t.category}</td>
							<td className="px-4 py-2.5">
								<Badge variant={STATUS_VARIANT[t.metaStatus]}>{t.metaStatus}</Badge>
								{t.metaRejectionReason ? (
									<span className="ml-2 text-xs text-muted-foreground">
										({t.metaRejectionReason})
									</span>
								) : null}
							</td>
							<td className="px-4 py-2.5">{t.placeholdersCount}</td>
							<td className="px-4 py-2.5 max-w-md truncate text-muted-foreground">{t.bodyText}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
