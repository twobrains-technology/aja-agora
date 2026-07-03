"use client";

import { Headset } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeadActiveHandoff } from "./lead-card";

// Bloco "Responsável pela mesa" (spec 2026-07-03). Mostra quem assumiu o caso e deixa o admin
// REATRIBUIR a outro atendente (decisão: específico, não re-broadcast) ou ENCERRAR o atendimento
// (→ handoff concluido + lead fechado_ganho). Vive na aba Atendimento dos dois painéis do kanban.

interface AttendantOption {
	id: string;
	nome: string;
	isActive: boolean;
}

const FIELD_CLASS =
	"w-full rounded border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const REASSIGN_ERROR: Record<string, string> = {
	mesmo_atendente: "Escolha um atendente diferente do responsável atual.",
	handoff_encerrado: "Este atendimento já foi encerrado.",
	attendant_not_found: "Atendente indisponível.",
	handoff_not_found: "Atendimento não encontrado.",
};

export function MesaResponsavel({
	activeHandoff,
	onChanged,
}: {
	activeHandoff: LeadActiveHandoff | null;
	onChanged?: () => void;
}) {
	const [attendants, setAttendants] = useState<AttendantOption[]>([]);
	const [selectedId, setSelectedId] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: o id do handoff é o gatilho do fetch
	useEffect(() => {
		if (!activeHandoff) return;
		let alive = true;
		fetch("/api/admin/mesa-attendants")
			.then((r) => (r.ok ? r.json() : { mesaAttendants: [] }))
			.then((d: { mesaAttendants?: AttendantOption[] }) => {
				if (alive) setAttendants((d.mesaAttendants ?? []).filter((a) => a.isActive));
			})
			.catch(() => {
				if (alive) setAttendants([]);
			});
		return () => {
			alive = false;
		};
	}, [activeHandoff?.id]);

	if (!activeHandoff) return null;

	const owner = activeHandoff.attendant;
	// Reatribuir só pra OUTRO atendente ativo (o dono atual daria 400 mesmo_atendente).
	const options = attendants.filter((a) => a.id !== owner?.id);

	async function reassign() {
		if (!activeHandoff || !selectedId) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/mesa/handoffs/${activeHandoff.id}/reassign`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mesaAttendantId: selectedId }),
			});
			if (!res.ok) {
				const d = (await res.json().catch(() => ({}))) as { error?: string };
				setError(REASSIGN_ERROR[d.error ?? ""] ?? "Falha ao reatribuir.");
				return;
			}
			setSelectedId("");
			onChanged?.();
		} catch {
			setError("Erro de conexão. Tente novamente.");
		} finally {
			setBusy(false);
		}
	}

	async function encerrar() {
		if (!activeHandoff) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/mesa/handoffs/${activeHandoff.id}/close`, {
				method: "POST",
			});
			if (!res.ok) {
				setError("Falha ao encerrar o atendimento.");
				return;
			}
			onChanged?.();
		} catch {
			setError("Erro de conexão. Tente novamente.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="rounded-lg border p-3 space-y-2 text-sm">
			<h4 className="font-semibold">Responsável pela mesa</h4>

			{owner ? (
				<p className="text-muted-foreground flex items-center gap-1.5">
					<Headset className="size-3.5 text-indigo-600 dark:text-indigo-400" />
					<span className="text-foreground font-medium">{owner.nome}</span>
					{owner.whatsapp ? <span>· {owner.whatsapp}</span> : null}
				</p>
			) : (
				<p className="text-muted-foreground">
					⏳ Aguardando a mesa — broadcast enviado, ainda sem dono.
				</p>
			)}

			{error && (
				<div className="p-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded">
					{error}
				</div>
			)}

			<label className="block text-xs font-medium text-muted-foreground" htmlFor="mesa-reassign">
				Reatribuir para outro atendente
			</label>
			<select
				id="mesa-reassign"
				aria-label="Reatribuir para outro atendente"
				value={selectedId}
				onChange={(e) => setSelectedId(e.target.value)}
				disabled={busy}
				className={FIELD_CLASS}
			>
				<option value="">Selecione um atendente…</option>
				{options.map((a) => (
					<option key={a.id} value={a.id}>
						{a.nome}
					</option>
				))}
			</select>

			<div className="flex justify-between gap-2 pt-1">
				<Button variant="outline" size="sm" onClick={reassign} disabled={!selectedId || busy}>
					Reatribuir
				</Button>
				<Button variant="outline" size="sm" onClick={encerrar} disabled={busy}>
					Encerrar atendimento
				</Button>
			</div>
		</div>
	);
}
