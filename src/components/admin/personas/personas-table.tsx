"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
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

type PersonaListItem = {
	id: string;
	displayName: string;
	role: "concierge" | "specialist";
	category: string | null;
	expertise: string | null;
	isActive: boolean;
	version: number;
	updatedAt: string;
	activeCampaigns: unknown[];
	handoffTriggers: unknown[];
	forbiddenTopics: unknown[];
};

const CATEGORY_LABEL: Record<string, string> = {
	imovel: "Imóvel",
	auto: "Automóvel",
	servicos: "Serviços",
};

function categoryDisplay(p: PersonaListItem): string {
	if (p.role === "concierge") return "Atendente";
	return p.category ? (CATEGORY_LABEL[p.category] ?? p.category) : "—";
}

function expertiseDisplay(p: PersonaListItem): string {
	if (!p.expertise) return "Generalista";
	return p.expertise.charAt(0).toUpperCase() + p.expertise.slice(1);
}

function PersonaRow({ p }: { p: PersonaListItem }) {
	return (
		<TableRow>
			<TableCell className="font-medium">
				{p.displayName}
			</TableCell>
			<TableCell>{categoryDisplay(p)}</TableCell>
			<TableCell>
				{p.expertise ? (
					<Badge variant="secondary">{expertiseDisplay(p)}</Badge>
				) : (
					<span className="text-sm text-muted-foreground">{expertiseDisplay(p)}</span>
				)}
			</TableCell>
			<TableCell>
				<Badge variant={p.isActive ? "default" : "outline"}>
					{p.isActive ? "Ativa" : "Inativa"}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground text-sm">
				{p.activeCampaigns.length} campanhas · {p.handoffTriggers.length} triggers ·{" "}
				{p.forbiddenTopics.length} guardrails
			</TableCell>
			<TableCell className="text-muted-foreground">v{p.version}</TableCell>
			<TableCell className="text-muted-foreground text-sm">
				{new Date(p.updatedAt).toLocaleDateString("pt-BR")}
			</TableCell>
			<TableCell>
				<Button variant="outline" size="sm" render={<Link href={`/admin/personas/${p.id}`} />}>
					<Pencil className="size-3.5" />
					Editar
				</Button>
			</TableCell>
		</TableRow>
	);
}

function PersonasTableLoading() {
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Nome</TableHead>
						<TableHead>Categoria</TableHead>
						<TableHead>Especialidade</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Configurações</TableHead>
						<TableHead>Versão</TableHead>
						<TableHead>Atualizada</TableHead>
						<TableHead className="w-20" />
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
								<Skeleton className="h-4 w-20" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-20" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-5 w-16 rounded-full" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-32" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-8" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-24" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-8 w-16" />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export function PersonasTable() {
	const [personas, setPersonas] = useState<PersonaListItem[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoadError(null);
		try {
			const res = await fetch("/api/admin/personas", { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { personas: PersonaListItem[] };
			setPersonas(data.personas);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setLoadError(`Falha ao carregar personas: ${message}`);
			setPersonas([]);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (personas === null) return <PersonasTableLoading />;

	// Atendente primeiro; depois specialists agrupados naturalmente por categoria
	// (mas sem cabeçalho de seção), com generalista antes do especialista dentro
	// de cada categoria.
	const sortPersonas = (a: PersonaListItem, b: PersonaListItem) => {
		if (a.role !== b.role) return a.role === "concierge" ? -1 : 1;
		const aCat = a.category ?? "";
		const bCat = b.category ?? "";
		if (aCat !== bCat) return aCat.localeCompare(bCat);
		const aGen = a.expertise === null ? 0 : 1;
		const bGen = b.expertise === null ? 0 : 1;
		if (aGen !== bGen) return aGen - bGen;
		return a.id.localeCompare(b.id);
	};

	const sorted = [...personas].sort(sortPersonas);

	return (
		<div className="space-y-4">
			<div className="text-sm text-muted-foreground">
				{personas.length} {personas.length === 1 ? "persona" : "personas"}
			</div>

			{loadError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{loadError}
				</div>
			)}

			{personas.length === 0 && !loadError ? (
				<div className="rounded-md border p-8 text-center text-muted-foreground">
					Nenhuma persona cadastrada.
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nome</TableHead>
								<TableHead>Categoria</TableHead>
								<TableHead>Especialidade</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Configurações</TableHead>
								<TableHead>Versão</TableHead>
								<TableHead>Atualizada</TableHead>
								<TableHead className="w-20" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sorted.map((p) => (
								<PersonaRow key={p.id} p={p} />
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
