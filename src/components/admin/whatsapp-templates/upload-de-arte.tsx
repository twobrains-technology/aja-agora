"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIMES_DA_ARTE, recusaDaArte } from "@/lib/validations/whatsapp-template";

interface Props {
	/** id do input, para o `<Label htmlFor>` casar com o campo. */
	id: string;
	/** Rótulo visível (ex: "Arte do cabeçalho", "Arte do card 1"). */
	rotulo: string;
	/** Handle já obtido (vem do banco ao editar um rascunho). */
	handle: string;
	onHandle: (handle: string) => void;
	disabled?: boolean;
}

/**
 * Campo de upload da arte de um header de template.
 *
 * Escolhe o arquivo → valida formato/tamanho AQUI (mesma função da rota, para a
 * recusa ser imediata e em português) → sobe para a Resumable Upload API pela
 * rota `/api/admin/whatsapp/templates/media` → guarda o `handle`. O preview sai
 * do `objectURL` local; o handle é o que viaja para a Meta.
 */
export function UploadDeArte({ id, rotulo, handle, onHandle, disabled }: Props) {
	const [enviando, setEnviando] = useState(false);
	const [preview, setPreview] = useState<string | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const previewRef = useRef<string | null>(null);

	// Revoga o objectURL no desmonte (sem isso, o blob fica na memória enquanto a
	// aba viver). Trocas de arquivo revogam o anterior na hora.
	useEffect(() => {
		return () => {
			if (previewRef.current) URL.revokeObjectURL(previewRef.current);
		};
	}, []);

	async function aoEscolher(arquivo: File | undefined) {
		if (!arquivo) return;
		setErro(null);

		const recusa = recusaDaArte({ type: arquivo.type, size: arquivo.size });
		if (recusa) {
			setErro(recusa);
			return;
		}

		if (previewRef.current) URL.revokeObjectURL(previewRef.current);
		const url = URL.createObjectURL(arquivo);
		previewRef.current = url;
		setPreview(url);
		setEnviando(true);
		try {
			const form = new FormData();
			form.append("arte", arquivo);
			const res = await fetch("/api/admin/whatsapp/templates/media", {
				method: "POST",
				body: form,
			});
			const body = (await res.json().catch(() => ({}))) as { handle?: string; error?: string };
			if (!res.ok || !body.handle) {
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			onHandle(body.handle);
		} catch (err) {
			setErro(err instanceof Error ? err.message : String(err));
		} finally {
			setEnviando(false);
		}
	}

	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{rotulo}</Label>
			<div className="flex items-center gap-3">
				{preview ? (
					// biome-ignore lint/performance/noImgElement: preview local (blob), não é asset do Next
					<img
						src={preview}
						alt={`Pré-visualização de ${rotulo.toLowerCase()}`}
						className="size-16 rounded-md border object-cover"
					/>
				) : (
					<div className="flex size-16 items-center justify-center rounded-md border bg-muted text-muted-foreground">
						<ImageUp className="size-6" />
					</div>
				)}
				<div className="space-y-1">
					<Input
						id={id}
						type="file"
						accept={MIMES_DA_ARTE.join(",")}
						disabled={disabled || enviando}
						onChange={(e) => void aoEscolher(e.target.files?.[0])}
						className="max-w-xs"
					/>
					<p className="text-xs text-muted-foreground">
						JPEG ou PNG, até 5 MB. Dimensão recomendada: 1080×1080.
					</p>
				</div>
			</div>

			{enviando && (
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Loader2 className="size-3 animate-spin" />
					Enviando arte…
				</p>
			)}
			{!enviando && handle && (
				<p className="text-xs text-emerald-600">Arte enviada e pronta para submeter.</p>
			)}
			{erro && <p className="text-sm text-destructive">{erro}</p>}
		</div>
	);
}
