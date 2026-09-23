"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import {
	ChevronLeft,
	ChevronRight,
	CircleCheck,
	CircleSlash,
	FlaskConical,
	Globe,
	Headset,
	Smartphone,
	Users,
} from "lucide-react";
import { parseAsBoolean, parseAsInteger, parseAsIsoDate, parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parserDeCampanha } from "@/components/admin/dashboard/campanha-filter";
import { estadoNaLista } from "@/components/admin/remarketing/estado-na-lista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { MotivoForaDaRegua } from "@/lib/admin/motivo-fora-da-regua";
import { rotuloDoBem } from "@/lib/admin/rotulo-do-bem";
import { ConversationDetailPanel } from "./conversation-detail-panel";
import { ConversationsFilters, type ConversationsFiltersValue } from "./conversations-filters";
import { MarcarLoteDialog } from "./marcar-lote-dialog";

type RemarketingDaLinha = {
	status: string;
	step: number;
	nextTouchAt: string | null;
	ultimoToqueEm: string | null;
	motivoSaida: string | null;
};

type ConversationItem = {
	id: string;
	contactName: string | null;
	waId: string | null;
	telefoneMascarado: string | null;
	channel: "web" | "whatsapp";
	status: "active" | "handed_off" | "closed";
	isSimulated: boolean;
	ehDaEquipe: boolean;
	currentCategory: string | null;
	handedOffUser: { id: string; name: string | null } | null;
	messageCount: number;
	latestEvalScore: number | null;
	remarketing: RemarketingDaLinha | null;
	motivoForaDaRegua: MotivoForaDaRegua | null;
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

/** Estado = ícone + rótulo; cor é reforço. Nenhum estado usa `default` (coral). */
const STATUS_APARENCIA: Record<
	ConversationItem["status"],
	{ variante: "success" | "secondary" | "outline"; icone: typeof CircleCheck }
> = {
	active: { variante: "success", icone: CircleCheck },
	handed_off: { variante: "secondary", icone: Headset },
	closed: { variante: "outline", icone: CircleSlash },
};

const CANAIS: Record<ConversationItem["channel"], string> = {
	whatsapp: "WhatsApp",
	web: "Web",
};

const PAGE_SIZE = 10;

/** Lista vazia com identidade estável: "sem filtro de campanha". */
const SEM_CAMPANHAS: readonly string[] = [];

/** Marca curta para quando não há telefone nem nome — a linha tem que ser citável. */
function marcaCurta(waId: string | null): string | null {
	if (!waId) return null;
	const limpo = waId.replace(/\D/g, "");
	return limpo.length >= 4 ? limpo.slice(-4) : null;
}

function ConversationsTableSkeleton() {
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Contato</TableHead>
						<TableHead>Canal</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Bem</TableHead>
						<TableHead>Atendente</TableHead>
						<TableHead className="text-right">Mensagens</TableHead>
						<TableHead>Remarketing</TableHead>
						<TableHead>Atualizada</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{Array.from({ length: 6 }).map((_, idx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
						<TableRow key={idx}>
							{Array.from({ length: 8 }).map((__, j) => (
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

/** Contato: nome (ou "Sem nome") com o telefone mascarado/marca embaixo. */
function CelulaDeContato({ conversa }: { conversa: ConversationItem }) {
	const principal = conversa.contactName?.trim() ? conversa.contactName : "Sem nome";
	const secundario =
		conversa.telefoneMascarado ??
		(marcaCurta(conversa.waId) ? `d${marcaCurta(conversa.waId)}` : null);

	return (
		<TableCell className="font-medium">
			<div className="flex flex-col gap-0.5">
				<div className="flex flex-wrap items-center gap-1.5">
					<span>{principal}</span>
					{conversa.isSimulated && (
						<Badge variant="outline" className="gap-1 text-xs" title="Fora das métricas e da régua">
							<FlaskConical className="size-3" aria-hidden="true" />
							Teste
						</Badge>
					)}
					{conversa.ehDaEquipe && (
						<Badge
							variant="outline"
							className="gap-1 text-xs"
							title="Telefone da casa — nunca recebe toque"
						>
							<Users className="size-3" aria-hidden="true" />
							Equipe
						</Badge>
					)}
				</div>
				{secundario && (
					<span className="text-xs text-muted-foreground tabular-nums">{secundario}</span>
				)}
			</div>
		</TableCell>
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
	// Chegam pelo link vindo da tela de Performance ("clicar nas 4 do Instagram
	// e ver aquelas 4"). Não têm controle próprio na barra: são um recorte que
	// veio de outra tela, e o que a barra oferece é desfazê-lo.
	const [origem, setOrigem] = useQueryState("origem", parseAsString);
	// Campanha agora é LISTA (`?campanha=a,b,c`): o mesmo recorte serve para uma
	// campanha ou para várias. `?? SEM_CAMPANHAS` mantém a identidade do array
	// estável quando não há filtro e evita disparar o fetch a cada render.
	const [campanhasUrl, setCampanhas] = useQueryState("campanha", parserDeCampanha);
	const campanhas = campanhasUrl ?? SEM_CAMPANHAS;

	// O filtro "identificável" (AJA-23 T2): só quem tem contato INFORMADO pelo
	// cliente. O recorte é do SERVIDOR (`?identificavel=true` → o predicado
	// `conversaIdentificada`), não um filtro de cliente sobre a página carregada:
	// filtrar aqui só esconderia as linhas daquela página e o total do rodapé
	// continuaria contando todo mundo.
	const [identificavel, setIdentificavel] = useQueryState(
		"identificavel",
		parseAsBoolean.withDefault(false),
	);

	const [data, setData] = useState<ListResponse | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	// "Mostrar testes e equipe" — desligado por padrão (AJA-10). Vai para a API
	// como `include_simulated`: testes somem da lista por default, e aqui eles
	// voltam COM o selo que diz o que são.
	const [mostrarTestes, setMostrarTestes] = useState(false);
	// A SELEÇÃO do lote. Vive em `Set` porque a pergunta é "este id está marcado?",
	// feita uma vez por linha a cada render — e porque marcar/desmarcar um id é
	// O(1) sem recriar o array inteiro.
	const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
	const [dialogAberto, setDialogAberto] = useState(false);
	const [marcarComoTeste, setMarcarComoTeste] = useState(true);
	const [avisoDoLote, setAvisoDoLote] = useState<string | null>(null);

	const filtersValue = useMemo<ConversationsFiltersValue>(
		() => ({ channel, status, q, from, to, origem, campanhas, identificavel }),
		[channel, status, q, from, to, origem, campanhas, identificavel],
	);

	const handleFiltersChange = useCallback(
		(next: Partial<ConversationsFiltersValue>) => {
			if (next.channel !== undefined) setChannel(next.channel === "all" ? null : next.channel);
			if (next.status !== undefined) setStatus(next.status === "all" ? null : next.status);
			if (next.q !== undefined) setQ(next.q === "" ? null : next.q);
			if (next.from !== undefined) setFrom(next.from);
			if (next.to !== undefined) setTo(next.to);
			// Limpar a origem limpa as campanhas junto: campanha sem canal é um
			// recorte que a tela não sabe nomear.
			if (next.origem !== undefined) {
				setOrigem(next.origem);
				if (!next.origem) setCampanhas(null);
			}
			// Lista vazia REMOVE o parâmetro (não vira `?campanha=`): sem filtro
			// continua significando "mostre tudo".
			if (next.campanhas !== undefined) {
				setCampanhas(next.campanhas.length > 0 ? [...next.campanhas] : null);
			}
			if (next.identificavel !== undefined) setIdentificavel(next.identificavel);
			setOffset(0);
		},
		[
			setChannel,
			setStatus,
			setQ,
			setFrom,
			setTo,
			setOffset,
			setOrigem,
			setCampanhas,
			setIdentificavel,
		],
	);

	// Recarrega a lista quando a marcação "é teste" muda no painel de detalhe:
	// a conversa marcada sai do resultado (a busca esconde simuladas por padrão),
	// então a tela precisa refletir isso sem o operador ter que apertar F5.
	const [recarga, setRecarga] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const params = new URLSearchParams();
		params.set("_r", String(recarga));
		params.set("limit", String(PAGE_SIZE));
		params.set("offset", String(offset));
		if (channel !== "all") params.set("channel", channel);
		if (status !== "all") params.set("status", status);
		if (q) params.set("q", q);
		if (from) params.set("from", from.toISOString());
		if (to) params.set("to", to.toISOString());
		if (origem) params.set("origem", origem);
		if (mostrarTestes) params.set("include_simulated", "true");
		if (identificavel) params.set("identificavel", "true");
		// A rota separa a vírgula de volta numa lista (ver `campanhas.ts`); a URL
		// fica com um parâmetro só, que é o que cabe num link.
		if (campanhas.length > 0) params.set("campanha", campanhas.join(","));

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
	}, [
		channel,
		status,
		q,
		from,
		to,
		offset,
		origem,
		campanhas,
		recarga,
		mostrarTestes,
		identificavel,
	]);

	const total = data?.total ?? 0;
	const items = data?.items ?? [];

	// A seleção não sobrevive à página: um id marcado que saiu da lista (mudou o
	// filtro, mudou a página) não pode continuar no lote — a confirmação diria
	// "12 conversas" e aplicaria em algumas que o operador não está vendo.
	useEffect(() => {
		if (data === null) return;
		const visiveis = new Set(data.items.map((c) => c.id));
		setSelecionados((anterior) => {
			const mantidos = [...anterior].filter((id) => visiveis.has(id));
			return mantidos.length === anterior.size ? anterior : new Set(mantidos);
		});
	}, [data]);

	const alternarUm = (id: string) => {
		setSelecionados((anterior) => {
			const proximo = new Set(anterior);
			if (proximo.has(id)) proximo.delete(id);
			else proximo.add(id);
			return proximo;
		});
	};

	const todosDaPaginaMarcados = items.length > 0 && items.every((c) => selecionados.has(c.id));
	const alternarPagina = () => {
		setSelecionados((anterior) => {
			const proximo = new Set(anterior);
			if (items.every((c) => proximo.has(c.id))) {
				for (const c of items) proximo.delete(c.id);
			} else {
				for (const c of items) proximo.add(c.id);
			}
			return proximo;
		});
	};
	const showingFrom = items.length === 0 ? 0 : offset + 1;
	const showingTo = offset + items.length;
	const hasPrev = offset > 0;
	const hasNext = offset + items.length < total;
	const agora = new Date();

	return (
		<div className="space-y-4">
			<ConversationsFilters value={filtersValue} onChange={handleFiltersChange} />

			<div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
				<Checkbox checked={mostrarTestes} onCheckedChange={(c) => setMostrarTestes(c === true)} />
				Mostrar testes e equipe
			</div>

			{/* A barra do lote — só aparece com seleção ativa. */}
			{selecionados.size > 0 && (
				<div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
					<span className="font-medium tabular-nums">
						{selecionados.size}{" "}
						{selecionados.size === 1 ? "conversa selecionada" : "conversas selecionadas"}
					</span>
					<Button
						size="sm"
						onClick={() => {
							setMarcarComoTeste(true);
							setDialogAberto(true);
						}}
					>
						Marcar como teste
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setMarcarComoTeste(false);
							setDialogAberto(true);
						}}
					>
						Voltar a contar
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
						Limpar seleção
					</Button>
				</div>
			)}

			{avisoDoLote && (
				<div className="flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
					<span>{avisoDoLote}</span>
					<Button variant="ghost" size="sm" onClick={() => setAvisoDoLote(null)}>
						Fechar
					</Button>
				</div>
			)}

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
								<TableHead className="w-10">
									<Checkbox
										checked={todosDaPaginaMarcados}
										onCheckedChange={alternarPagina}
										aria-label="Selecionar todas as conversas desta página"
									/>
								</TableHead>
								<TableHead>Contato</TableHead>
								<TableHead>Canal</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Bem</TableHead>
								<TableHead>Atendente</TableHead>
								<TableHead className="text-right">Mensagens</TableHead>
								<TableHead>Remarketing</TableHead>
								<TableHead>Atualizada</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.length === 0 && !loadError && (
								<TableRow>
									<TableCell colSpan={9} className="text-center text-muted-foreground py-8">
										Nenhuma conversa encontrada com os filtros atuais.
									</TableCell>
								</TableRow>
							)}
							{items.map((c) => {
								const aparencia = STATUS_APARENCIA[c.status];
								const IconeStatus = aparencia.icone;
								const bem = rotuloDoBem(c.currentCategory);
								const estado = estadoNaLista({
									regua: c.remarketing
										? {
												status: c.remarketing.status,
												step: c.remarketing.step,
												nextTouchAt: c.remarketing.nextTouchAt
													? new Date(c.remarketing.nextTouchAt)
													: null,
												ultimoToqueEm: c.remarketing.ultimoToqueEm
													? new Date(c.remarketing.ultimoToqueEm)
													: null,
												motivoSaida: c.remarketing.motivoSaida,
											}
										: null,
									motivo: c.motivoForaDaRegua,
									agora,
								});
								const IconeRegua = estado.icone;

								return (
									<TableRow
										key={c.id}
										className="cursor-pointer"
										onClick={() => setSelectedId(c.id)}
									>
										<TableCell onClick={(e) => e.stopPropagation()}>
											<Checkbox
												checked={selecionados.has(c.id)}
												onCheckedChange={() => alternarUm(c.id)}
												aria-label={`Selecionar a conversa de ${c.contactName ?? c.waId ?? "sem contato"}`}
											/>
										</TableCell>
										<CelulaDeContato conversa={c} />

										<TableCell>
											<div className="flex items-center gap-1.5 text-sm">
												{c.channel === "whatsapp" ? (
													<Smartphone className="size-3.5 text-success" aria-hidden="true" />
												) : (
													<Globe className="size-3.5 text-muted-foreground" aria-hidden="true" />
												)}
												<span>{CANAIS[c.channel]}</span>
											</div>
										</TableCell>

										<TableCell>
											<Badge variant={aparencia.variante} className="gap-1">
												<IconeStatus className="size-3" aria-hidden="true" />
												{STATUS_LABELS[c.status]}
											</Badge>
										</TableCell>

										<TableCell className="text-sm">
											{bem ?? <span className="text-muted-foreground">Não informado</span>}
										</TableCell>

										<TableCell className="text-sm">
											{c.handedOffUser?.name ?? (
												<span className="text-muted-foreground">Sem atendente</span>
											)}
										</TableCell>

										<TableCell className="text-right text-sm tabular-nums">
											{c.messageCount}
										</TableCell>

										<TableCell>
											<Badge variant={estado.variante} className="gap-1.5" title={estado.tooltip}>
												<IconeRegua className="size-3" aria-hidden="true" />
												{estado.rotulo}
											</Badge>
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
				onMarcada={() => setRecarga((n) => n + 1)}
			/>

			<MarcarLoteDialog
				ids={[...selecionados]}
				isSimulated={marcarComoTeste}
				open={dialogAberto}
				onOpenChange={setDialogAberto}
				onConcluido={(resultado) => {
					setAvisoDoLote(
						`${resultado.conversas} ${resultado.conversas === 1 ? "conversa" : "conversas"} ` +
							`${marcarComoTeste ? "marcadas como teste" : "voltaram a contar"}` +
							(resultado.leadsMarcados > 0 ? ` (${resultado.leadsMarcados} leads junto)` : "") +
							".",
					);
					setSelecionados(new Set());
					// Recarrega: a busca esconde simuladas por padrão, então as marcadas
					// precisam sumir da lista sem o operador apertar F5.
					setRecarga((n) => n + 1);
				}}
			/>
		</div>
	);
}
