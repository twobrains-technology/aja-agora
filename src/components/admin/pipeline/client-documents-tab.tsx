"use client";

import { AlertTriangle, Download, FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyStateCard } from "@/components/admin/empty-state-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// FIX-83: aba "Documentos" do lead-detail — o operador da mesa vê e baixa os
// documentos do cliente pelo Kanban, mesmo com a Bevi travada (nosso S3 é a
// fonte da verdade). Download via URL pré-assinada de curta expiração.

interface ClientDocumentDTO {
	id: string;
	slot: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	status: string;
	dispatchStatus: string;
	dispatchTarget: string | null;
	createdAt: string;
}

const SLOT_LABELS: Record<string, string> = {
	identidade_frente: "Identidade — frente",
	identidade_verso: "Identidade — verso",
	comprovante_endereco: "Comprovante de endereço",
};

const DISPATCH_LABELS: Record<string, string> = {
	pending: "Aguardando despacho",
	sent: "Enviado à administradora",
	failed: "Falha no envio — documento seguro, requer atenção",
	manual: "Transferido pra mesa (manual)",
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(0)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

export function ClientDocumentsTab({ leadId }: { leadId: string }) {
	const [docs, setDocs] = useState<ClientDocumentDTO[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [downloading, setDownloading] = useState<string | null>(null);

	const fetchDocs = useCallback(async () => {
		setError(null);
		try {
			const res = await fetch(`/api/admin/leads/${leadId}/documents`);
			if (!res.ok) throw new Error(`Erro ${res.status}`);
			const data = await res.json();
			setDocs(data.documents ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao carregar documentos");
		}
	}, [leadId]);

	useEffect(() => {
		setDocs(null);
		fetchDocs();
	}, [fetchDocs]);

	const handleDownload = async (documentId: string) => {
		setDownloading(documentId);
		try {
			const res = await fetch(`/api/admin/documents/${documentId}/download`);
			if (!res.ok) throw new Error("Falha ao gerar link de download");
			const data = (await res.json()) as { url: string };
			window.open(data.url, "_blank", "noreferrer");
		} catch (err) {
			alert(err instanceof Error ? err.message : "Erro ao baixar documento");
		} finally {
			setDownloading(null);
		}
	};

	if (error) {
		return (
			<EmptyStateCard
				icon={AlertTriangle}
				iconBg="bg-red-100 dark:bg-red-900/30"
				iconColor="text-red-600 dark:text-red-400"
				title="Não foi possível carregar"
				description="Tente novamente em instantes."
				action={{ label: "Tentar novamente", onClick: fetchDocs }}
			/>
		);
	}

	if (docs === null) {
		return (
			<div className="grid grid-cols-1 gap-3 p-4">
				{Array.from({ length: 2 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
					<Skeleton key={i} className="h-16 w-full rounded-lg" />
				))}
			</div>
		);
	}

	if (docs.length === 0) {
		return (
			<EmptyStateCard
				icon={FileText}
				iconBg="bg-blue-100 dark:bg-blue-900/30"
				iconColor="text-blue-600 dark:text-blue-400"
				title="Nenhum documento ainda"
				description="Os documentos enviados pelo cliente no chat aparecem aqui."
			/>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 p-4">
			{docs.map((doc) => (
				<Card key={doc.id}>
					<CardContent className="flex items-start gap-3 py-3">
						<div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
							<FileText className="size-5 text-blue-600" />
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-semibold">{SLOT_LABELS[doc.slot] ?? doc.slot}</p>
							<p className="text-xs text-muted-foreground truncate">
								{doc.filename} · {formatBytes(doc.sizeBytes)}
							</p>
							<Badge variant="secondary" className="text-xs mt-1">
								{DISPATCH_LABELS[doc.dispatchStatus] ?? doc.dispatchStatus}
							</Badge>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => handleDownload(doc.id)}
							disabled={downloading === doc.id}
							data-testid={`doc-download-${doc.id}`}
						>
							{downloading === doc.id ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Download className="size-4" />
							)}
						</Button>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
