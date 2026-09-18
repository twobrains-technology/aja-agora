"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { FiltrosDaTela } from "@/components/admin/dashboard/filtros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { abreviarId, nomeDaFonte } from "@/lib/admin/agrupar-origens";
import { chaveDeOrigem, nomeCurto } from "@/lib/meta-ads/resolver";

const CHANNEL_OPTIONS = [
	{ value: "all", label: "Todos os canais" },
	{ value: "web", label: "Web" },
	{ value: "whatsapp", label: "WhatsApp" },
] as const;

const STATUS_OPTIONS = [
	{ value: "all", label: "Todos os status" },
	{ value: "active", label: "Ativa" },
	{ value: "handed_off", label: "Com atendente" },
	{ value: "closed", label: "Encerrada" },
] as const;

export type ConversationsFiltersValue = {
	channel: string;
	status: string;
	q: string;
	/**
	 * O período herdado da tabela (`ConversationsTable`), que ainda lê `from`/`to`
	 * da URL para montar a consulta à API. Este componente NÃO o edita — o período
	 * é escrito pelo `<DateRangeFilter/>`.
	 */
	from: Date | null;
	to: Date | null;
	/** Chave do canal, como a tabela por origem a monta (`campanha:ig`, `direto`). */
	origem?: string | null;
	/**
	 * As campanhas do recorte — `?campanha=a,b,c`.
	 *
	 * Lista (`string[]`) e não valor único: o filtro passou a aceitar mais de uma
	 * campanha. Lista vazia é "sem filtro" — nunca um recorte que não casa nada.
	 */
	campanhas?: readonly string[];
};

/**
 * O nome do canal para quem lê — a mesma tradução da tabela por origem.
 *
 * Duplicar o dicionário aqui seria pior do que parece: o painel diria
 * "Instagram" numa tela e "ig" na outra, para o mesmo recorte. Por isso o nome
 * sai de `agrupar-origens`, que é onde ele já é decidido.
 */
function rotuloDaOrigem(origem: string, campanha: string | null): string {
	const nome = origem.startsWith("campanha:")
		? nomeDaFonte(origem.slice("campanha:".length))
		: origem === "ctwa"
			? "Click-to-WhatsApp"
			: origem === "referencia"
				? "Referência"
				: origem === "direto"
					? "Direto"
					: origem;
	if (!campanha) return nome;
	// O nome real vem do resolvedor quando ele conhece a campanha (o rótulo
	// guarda a UTM, que é a chave fraca). Sem ele, cai no id abreviado de antes.
	const chave = chaveDeOrigem({ utmCampaign: campanha });
	const resolvida = chave ? nomeCurto(chave) : null;
	return `${nome} · ${resolvida?.nome ?? `campanha ${abreviarId(campanha)}`}`;
}

export function ConversationsFilters({
	value,
	onChange,
}: {
	value: ConversationsFiltersValue;
	onChange: (next: Partial<ConversationsFiltersValue>) => void;
}) {
	const [localQ, setLocalQ] = useState(value.q);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// As campanhas escolhidas viram as OPÇÕES do filtro. A lista completa vive na
	// tela de Performance (muda com o período); aqui o que a barra precisa é
	// mostrar o recorte que veio no link e deixar tirar cada campanha dele. Quando
	// o bloco das campanhas passar a oferecer a lista inteira, é este array que
	// cresce — o componente não muda.
	const opcoesDeCampanha = useMemo(() => {
		const lista = value.campanhas ?? [];
		return lista.map((campanha) => ({
			valor: campanha,
			rotulo: value.origem ? rotuloDaOrigem(value.origem, campanha) : campanha,
		}));
	}, [value.campanhas, value.origem]);

	const campanhasAtivas = value.campanhas?.length ?? 0;

	useEffect(() => {
		setLocalQ(value.q);
	}, [value.q]);

	const handleSearchChange = (next: string) => {
		setLocalQ(next);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			onChange({ q: next });
		}, 300);
	};

	const hasActive =
		value.channel !== "all" ||
		value.status !== "all" ||
		value.q !== "" ||
		Boolean(value.origem) ||
		campanhasAtivas > 0;

	// O período NÃO entra aqui: ele é estado do painel, escrito pelo
	// `<DateRangeFilter/>` na URL e no cookie. Limpar os filtros da tela não pode
	// apagar a janela que a pessoa escolheu — são controles diferentes.
	const clear = () => {
		onChange({
			channel: "all",
			status: "all",
			q: "",
			origem: null,
			campanhas: [],
		});
		setLocalQ("");
	};

	return (
		<FiltrosDaTela
			// O período é o MESMO do resto do painel — URL + cookie, via
			// `<DateRangeFilter/>`. Antes esta tela tinha o par De/Até próprio, sem
			// cookie, então a escolha feita em Performance morria ao navegar para cá.
			periodo={<DateRangeFilter />}
			campanhas={opcoesDeCampanha}
		>
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
				<Input
					value={localQ}
					onChange={(e) => handleSearchChange(e.target.value)}
					placeholder="Buscar nome ou telefone..."
					className="pl-8 h-8 w-[260px]"
				/>
			</div>

			<Select value={value.channel} onValueChange={(v) => onChange({ channel: v ?? "all" })}>
				<SelectTrigger size="sm" className="w-[180px]">
					<SelectValue>
						{(v) => CHANNEL_OPTIONS.find((o) => o.value === v)?.label ?? "Todos os canais"}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{CHANNEL_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={value.status} onValueChange={(v) => onChange({ status: v ?? "all" })}>
				<SelectTrigger size="sm" className="w-[180px]">
					<SelectValue>
						{(v) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? "Todos os status"}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{value.origem && (
				// Chip, e não Select: a lista de origens vive na tela de Performance
				// e muda com o período. Repetir aquele seletor aqui seria manter dois
				// lugares em dia; o que esta tela precisa é dizer QUAL recorte está
				// valendo e deixar sair dele. As campanhas do recorte aparecem uma a
				// uma no filtro de campanha, acima.
				<Badge variant="secondary" className="h-8 gap-1.5 px-2.5 font-normal">
					<span className="text-muted-foreground">Origem:</span>
					{rotuloDaOrigem(value.origem, null)}
					<button
						type="button"
						onClick={() => onChange({ origem: null, campanhas: [] })}
						aria-label="Remover o filtro de origem"
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="size-3.5" aria-hidden="true" />
					</button>
				</Badge>
			)}

			{hasActive && (
				<Button variant="ghost" size="sm" onClick={clear}>
					<X className="size-3.5" />
					Limpar
				</Button>
			)}
		</FiltrosDaTela>
	);
}
