"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Administradora } from "./administradoras-table";

interface Doc {
	id: string;
	titulo: string;
	tipo: "manual" | "tabela" | "outro";
	versao: number;
	isActive: boolean;
	temTexto: boolean;
	createdAt: string;
}

const TIPO_LABEL: Record<Doc["tipo"], string> = {
	manual: "Manual",
	tabela: "Tabela",
	outro: "Outro",
};

interface Props {
	administradora: Administradora;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AdministradoraDocsDialog({ administradora, open, onOpenChange }: Props) {
	const [docs, setDocs] = useState<Doc[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [titulo, setTitulo] = useState("");
	const [tipo, setTipo] = useState<Doc["tipo"]>("manual");
	const [file, setFile] = useState<File | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const load = useCallback(async () => {
		setLoadError(null);
		try {
			const res = await fetch(
				`/api/admin/administradora-docs?administradoraId=${administradora.id}`,
				{ cache: "no-store" },
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { docs: Doc[] };
			setDocs(data.docs);
		} catch (err) {
			setLoadError(`Falha ao carregar documentos: ${err instanceof Error ? err.message : err}`);
			setDocs([]);
		}
	}, [administradora.id]);

	useEffect(() => {
		if (open) {
			setDocs(null);
			setTitulo("");
			setTipo("manual");
			setFile(null);
			setSubmitError(null);
			void load();
		}
	}, [open, load]);

	async function handleUpload() {
		setSubmitError(null);
		if (!titulo.trim() || !file) {
			setSubmitError("Informe um título e selecione um PDF.");
			return;
		}
		setSubmitting(true);
		try {
			const fd = new FormData();
			fd.set("administradoraId", administradora.id);
			fd.set("titulo", titulo.trim());
			fd.set("tipo", tipo);
			fd.set("file", file);
			const res = await fetch("/api/admin/administradora-docs", { method: "POST", body: fd });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			setTitulo("");
			setTipo("manual");
			setFile(null);
			if (fileInputRef.current) fileInputRef.current.value = "";
			await load();
		} catch (err) {
			setSubmitError(`Falha no upload: ${err instanceof Error ? err.message : err}`);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleDelete(id: string) {
		try {
			const res = await fetch(`/api/admin/administradora-docs/${id}`, { method: "DELETE" });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			await load();
		} catch (err) {
			setSubmitError(`Falha ao remover: ${err instanceof Error ? err.message : err}`);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Documentos — {administradora.nome}</DialogTitle>
					<DialogDescription>
						Manuais de contratação (PDF) que o copiloto da mesa injeta para orientar o atendente. O
						texto é extraído no upload.
					</DialogDescription>
				</DialogHeader>

				{/* Form de upload */}
				<div className="space-y-3 rounded-md border p-4">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="doc-titulo">Título</Label>
							<Input
								id="doc-titulo"
								value={titulo}
								onChange={(e) => setTitulo(e.target.value)}
								placeholder="Ex: Manual de contratação"
								disabled={submitting}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Tipo</Label>
							<Select value={tipo} onValueChange={(v) => setTipo(v as Doc["tipo"])}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Selecione">
										{(v) => TIPO_LABEL[(v as Doc["tipo"]) ?? "manual"] ?? "Selecione"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="manual">Manual</SelectItem>
									<SelectItem value="tabela">Tabela</SelectItem>
									<SelectItem value="outro">Outro</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="doc-file">Arquivo PDF</Label>
						<Input
							id="doc-file"
							ref={fileInputRef}
							type="file"
							accept="application/pdf,.pdf"
							disabled={submitting}
							onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						/>
					</div>
					{submitError && <p className="text-sm text-destructive">{submitError}</p>}
					<div className="flex justify-end">
						<Button onClick={handleUpload} disabled={submitting}>
							<Upload className="size-4" />
							{submitting ? "Enviando…" : "Enviar documento"}
						</Button>
					</div>
				</div>

				{/* Lista de docs */}
				<div className="space-y-2">
					{docs === null && <Skeleton className="h-16 w-full" />}
					{loadError && <p className="text-sm text-destructive">{loadError}</p>}
					{docs && docs.length === 0 && !loadError && (
						<p className="text-sm text-muted-foreground py-4 text-center">
							Nenhum documento cadastrado ainda.
						</p>
					)}
					{docs?.map((d) => (
						<div
							key={d.id}
							className="flex items-center justify-between rounded-md border p-3 text-sm"
						>
							<div className="flex items-center gap-3">
								<FileText className="size-4 text-muted-foreground" />
								<div>
									<div className="font-medium">{d.titulo}</div>
									<div className="text-muted-foreground text-xs flex items-center gap-2">
										<Badge variant="outline">{TIPO_LABEL[d.tipo]}</Badge>
										<span>v{d.versao}</span>
										<span>{d.temTexto ? "Texto extraído ✓" : "Sem texto"}</span>
									</div>
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => handleDelete(d.id)}
								className="text-destructive"
							>
								<Trash2 className="size-4" />
								<span className="sr-only">Remover documento</span>
							</Button>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
