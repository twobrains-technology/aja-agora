"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { ChevronLeft, ChevronRight, Globe, Smartphone } from "lucide-react";
import { parseAsInteger, parseAsIsoDate, parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ConversationDetailPanel } from "./conversation-detail-panel";
import { ConversationsFilters, type ConversationsFiltersValue } from "./conversations-filters";

type ConversationItem = {
	id: string;
	contactName: string | null;
	waId: string | null;
	channel: "web" | "whatsapp";
	status: "active" | "handed_off" | "closed";
	currentCategory: string | null;
	handedOffUser: { id: string; name: string | null } | null;
	messageCount: number;
	createdAt: string;
	updatedAt: string;
};

type ListResponse = {
	items: ConversationItem[];
	total: number;
	limit: number;
	offset: number;
};

const STATUS_LABELS: Record<ConversationItem["status"], string> = {
	active: "Ativa",
	handed_off: "Com atendente",
	closed: "Encerrada",
};

const STATUS_VARIANTS: Record<ConversationItem["status"], "default" | "secondary" | "outline"> = {
	active: "default",
	handed_off: "secondary",
	closed: "outline",
};

const CATEGORY_LABELS: Record<string, string> = {
	imovel: "Imóvel",
	auto: "Automóvel",
	servicos: "Serviços",
};

const PAGE_SIZE = 50;

function ConversationsTableSkeleton() {
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Contato</TableHead>
						<TableHead>Canal</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Categoria</TableHead>
						<TableHead>Atendente</TableHead>
						<TableHead className="text-right">Mensagens</TableHead>
						<TableHead>Atualizada</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{Array.from({ length: 6 }).map((_, idx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
						<TableRow key={idx}>
							{Array.from({ length: 7 }).map((__, j) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
								<TableCell key={j}>
									<Skeleton className="h-4 w-24" />
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export function ConversationsTable() {
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const [channel, setChannel] = useQueryState("channel", parseAsString.withDefault("all"));
	const [status, setStatus] = useQueryState("status", parseAsString.withDefault("all"));
	const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
	const [from, setFrom] = useQueryState("from", parseAsIsoDate);
	const [to, setTo] = useQueryState("to", parseAsIsoDate);
	const [offset, setOffset] = useQueryState("offset", parseAsInteger.withDefault(0));

	const [data, setData] = useState<ListResponse | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const filtersValue = useMemo<ConversationsFiltersValue>(
		() => ({ channel, status, q, from, to }),
		[channel, status, q, from, to],
	);

	const handleFiltersChange = useCallback(
		(next: Partial<ConversationsFiltersValue>) => {
			if (next.channel !== undefined) setChannel(next.channel === "all" ? null : next.channel);
			if (next.status !== undefined) setStatus(next.status === "all" ? null : next.status);
			if (next.q !== undefined) setQ(next.q === "" ? null : next.q);
			if (next.from !== undefined) setFrom(next.from);
			if (next.to !== undefined) setTo(next.to);
			setOffset(0);
		},
		[setChannel, setStatus, setQ, setFrom, setTo, setOffset],
	);

	useEffect(() => {
		let cancelled = false;
		const params = new URLSearchParams();
		params.set("limit", String(PAGE_SIZE));
		params.set("offset", String(offset));
		if (channel !== "all") params.set("channel", channel);
		if (status !== "all") params.set("status", status);
		if (q) params.set("q", q);
		if (from) params.set("from", from.toISOString());
		if (to) params.set("to", to.toISOString());

		setLoadError(null);
		(async () => {
			try {
				const res = await fetch(`/api/admin/conversations?${params.toString()}`, {
					cache: "no-store",
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = (await res.json()) as ListResponse;
				if (!cancelled) setData(json);
			} catch (err) {
				if (!cancelled) {
					const message = err instanceof Error ? err.message : String(err);
					setLoadError(`Falha ao carregar conversas: ${message}`);
					setData({ items: [], total: 0, limit: PAGE_SIZE, offset });
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [channel, status, q, from, to, offset]);

	const total = data?.total ?? 0;
	const items = data?.items ?? [];
	const showingFrom = items.length === 0 ? 0 : offset + 1;
	const showingTo = offset + items.length;
	const hasPrev = offset > 0;
	const hasNext = offset + items.length < total;

	return (
		<div className="space-y-4">
			<ConversationsFilters value={filtersValue} onChange={handleFiltersChange} />

			{loadError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{loadError}
				</div>
			)}

			{data === null ? (
				<ConversationsTableSkeleton />
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Contato</TableHead>
								<TableHead>Canal</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Categoria</TableHead>
								<TableHead>Atendente</TableHead>
								<TableHead className="text-right">Mensagens</TableHead>
								<TableHead>Atualizada</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.length === 0 && !loadError && (
								<TableRow>
									<TableCell colSpan={7} className="text-center text-muted-foreground py-8">
										Nenhuma conversa encontrada com os filtros atuais.
									</TableCell>
								</TableRow>
							)}
							{items.map((c) => {
								const display = c.contactName ?? c.waId ?? "—";
								return (
									<TableRow
										key={c.id}
										className="cursor-pointer"
										onClick={() => setSelectedId(c.id)}
									>
										<TableCell className="font-medium">{display}</TableCell>
										<TableCell>
											<div className="flex items-center gap-1.5 text-sm">
												{c.channel === "whatsapp" ? (
													<Smartphone className="size-3.5 text-green-600" />
												) : (
													<Globe className="size-3.5 text-blue-600" />
												)}
												<span className="capitalize">{c.channel}</span>
											</div>
										</TableCell>
										<TableCell>
											<Badge variant={STATUS_VARIANTS[c.status]}>{STATUS_LABELS[c.status]}</Badge>
										</TableCell>
										<TableCell className="text-sm capitalize">
											{c.currentCategory ? CATEGORY_LABELS[c.currentCategory] ?? c.currentCategory : "—"}
										</TableCell>
										<TableCell className="text-sm">{c.handedOffUser?.name ?? "—"}</TableCell>
										<TableCell className="text-right text-sm tabular-nums">
											{c.messageCount}
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											<span
												title={format(new Date(c.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
											>
												{formatDistanceToNow(new Date(c.updatedAt), {
													addSuffix: true,
													locale: ptBR,
												})}
											</span>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{data && total > PAGE_SIZE && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Mostrando {showingFrom}–{showingTo} de {total}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={!hasPrev}
							onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
						>
							<ChevronLeft className="size-4" />
							Anterior
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={!hasNext}
							onClick={() => setOffset(offset + PAGE_SIZE)}
						>
							Próximo
							<ChevronRight className="size-4" />
						</Button>
					</div>
				</div>
			)}

			<ConversationDetailPanel
				conversationId={selectedId}
				open={selectedId !== null}
				onClose={() => setSelectedId(null)}
			/>
		</div>
	);
}
