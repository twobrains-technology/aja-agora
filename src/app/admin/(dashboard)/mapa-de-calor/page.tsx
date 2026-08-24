"use client";

// Mapa de calor das landings.
//
// O layout segue a forma para a qual toda ferramenta da categoria converge: a
// PÁGINA é a peça, com os controles acima e a leitura ao lado. O operador vem
// aqui para olhar a landing, não para ler uma planilha sobre ela — e a primeira
// versão desta tela punha o preview espremido em meia coluna, atrás de quatro
// cartões de número grande.
//
// O filtro que dá razão de existir a esta tela é o de DESFECHO. Com ele se
// compara o mapa de todo mundo com o mapa de quem virou lead, e a diferença
// entre os dois é o que diz o que mudar na página. Ferramenta de terceiro não
// tem essa coluna, porque não conhece `leads`.

import { subDays } from "date-fns";
import { MousePointerClickIcon, ScrollTextIcon } from "lucide-react";
import { parseAsIsoDate, parseAsString, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { ListaDeAlvos } from "@/components/admin/heatmap/lista-de-alvos";
import { type ModoDoMapa, VisorDoMapa } from "@/components/admin/heatmap/visor-do-mapa";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LANDINGS_COM_MAPA } from "@/lib/heatmap/events";
import type { FiltroDevice, MapaDeCalor } from "@/lib/heatmap/queries";
import { cn } from "@/lib/utils";

const NOME_DA_PAGINA: Record<string, string> = {
	"/": "Home",
	"/autos": "Autos",
	"/imoveis": "Imóveis",
	"/motos": "Motos",
};

const DESFECHOS = [
	{ valor: "todos", rotulo: "Todos os visitantes" },
	{ valor: "lead", rotulo: "Só quem virou lead" },
	{ valor: "ganho", rotulo: "Só quem fechou contrato" },
];

const DEVICES = [
	{ valor: "mobile", rotulo: "Celular" },
	{ valor: "desktop", rotulo: "Computador" },
	{ valor: "tablet", rotulo: "Tablet" },
	{ valor: "todos", rotulo: "Todos os aparelhos" },
];

/**
 * O aparelho com que a tela abre — celular, e isso não é preferência.
 *
 * O clique é gravado com `pageY` absoluto, em pixels do documento que a pessoa
 * viu. Documento de celular e de desktop têm alturas completamente diferentes,
 * então a nuvem só cai sobre o componente certo quando o recorte tem UM aparelho
 * e o preview é renderizado na largura dele. "Todos os aparelhos" mistura as
 * duas réguas — continua na lista para quem quiser o total de cliques, mas
 * deixou de ser o padrão, e a tela avisa.
 *
 * Medido na produção em 24/08/2026: 91,2% dos visitantes do mapa são mobile
 * (505 de 554). Abrir no desktop era abrir no layout de 8% da audiência.
 */
const DEVICE_PADRAO = "mobile";

const MODOS: { valor: ModoDoMapa; rotulo: string; icone: typeof MousePointerClickIcon }[] = [
	{ valor: "cliques", rotulo: "Cliques", icone: MousePointerClickIcon },
	{ valor: "rolagem", rotulo: "Rolagem", icone: ScrollTextIcon },
];

/** Rótulo de uma opção pelo valor — o gatilho do select mostra texto, não código. */
function rotuloDe(opcoes: { valor: string; rotulo: string }[], valor: unknown): string {
	return opcoes.find((o) => o.valor === valor)?.rotulo ?? String(valor ?? "");
}

export default function MapaDeCalorPage() {
	return (
		<Suspense fallback={<Skeleton className="h-[80vh] w-full" />}>
			<MapaDeCalorContent />
		</Suspense>
	);
}

function MapaDeCalorContent() {
	const [from] = useQueryState("from", parseAsIsoDate.withDefault(subDays(new Date(), 30)));
	const [to] = useQueryState("to", parseAsIsoDate.withDefault(new Date()));
	const [path, setPath] = useQueryState("path", parseAsString.withDefault("/"));
	const [device, setDevice] = useQueryState("device", parseAsString.withDefault(DEVICE_PADRAO));
	const [desfecho, setDesfecho] = useQueryState("desfecho", parseAsString.withDefault("todos"));
	const [modo, setModo] = useState<ModoDoMapa>("cliques");

	const [mapa, setMapa] = useState<MapaDeCalor | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const carregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);

		try {
			const params = new URLSearchParams({ path, device, desfecho });
			if (from) params.set("from", from.toISOString());
			if (to) params.set("to", to.toISOString());

			const res = await fetch(`/api/admin/heatmap?${params.toString()}`);
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `Erro ao carregar o mapa de calor: ${res.status}`);
			}

			setMapa((await res.json()) as MapaDeCalor);
		} catch (err) {
			setErro(err instanceof Error ? err.message : "Erro desconhecido");
		} finally {
			setCarregando(false);
		}
	}, [from, to, path, device, desfecho]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const pronto = !carregando && mapa !== null;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="font-bold text-2xl tracking-tight">Mapa de calor</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Onde o visitante clica e até onde ele rola em cada landing
					</p>
				</div>
				<DateRangeFilter />
			</div>

			{/* Barra de controle: o que estou olhando (página, aparelho, quem) e como
			    (cliques ou rolagem). Tudo o que muda o mapa mora numa linha só. */}
			<div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
				<Select value={path} onValueChange={(valor) => setPath(valor ?? "/")}>
					<SelectTrigger className="w-[150px]" aria-label="Página">
						{/* O gatilho tem que mostrar o RÓTULO, não o valor: sem isto o filtro
						    de página lia "/" e o de aparelho lia "todos", que não dizem a
						    ninguém o que está selecionado. */}
						<SelectValue>{(v) => NOME_DA_PAGINA[String(v ?? "/")] ?? String(v)}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{LANDINGS_COM_MAPA.map((p) => (
							<SelectItem key={p} value={p}>
								{NOME_DA_PAGINA[p] ?? p}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select value={device} onValueChange={(valor) => setDevice(valor ?? "todos")}>
					<SelectTrigger className="w-[185px]" aria-label="Aparelho">
						<SelectValue>{(v) => rotuloDe(DEVICES, v)}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{DEVICES.map((d) => (
							<SelectItem key={d.valor} value={d.valor}>
								{d.rotulo}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select value={desfecho} onValueChange={(valor) => setDesfecho(valor ?? "todos")}>
					<SelectTrigger className="w-[215px]" aria-label="Desfecho">
						<SelectValue>{(v) => rotuloDe(DESFECHOS, v)}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{DESFECHOS.map((d) => (
							<SelectItem key={d.valor} value={d.valor}>
								{d.rotulo}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="ms-auto flex gap-1 rounded-md bg-muted p-1">
					{MODOS.map(({ valor, rotulo, icone: Icone }) => (
						<button
							key={valor}
							type="button"
							onClick={() => setModo(valor)}
							aria-pressed={modo === valor}
							className={cn(
								"flex items-center gap-1.5 rounded px-3 py-1.5 font-medium text-sm transition-colors",
								"focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
								modo === valor
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<Icone aria-hidden className="size-4" />
							{rotulo}
						</button>
					))}
				</div>
			</div>

			{erro && (
				<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
					{erro}
				</div>
			)}

			{/* Números em linha, não em cartões: são o contexto do mapa, não a peça. */}
			<div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
				{pronto ? (
					<>
						<Numero valor={mapa.visitantes} rotulo="visitantes" />
						<Numero valor={mapa.cliques} rotulo="cliques" />
						<Numero valor={mapa.rageCliques} rotulo="de raiva" />
						<Numero valor={mapa.scrollMedio} rotulo="de rolagem média" sufixo="%" />
					</>
				) : (
					<Skeleton className="h-5 w-96" />
				)}
			</div>

			{device === "todos" && (
				<p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground text-sm">
					<strong>A nuvem mistura aparelhos neste recorte.</strong> O clique é gravado na altura do
					documento que a pessoa viu, e a página do celular é bem mais alta que a do computador — os
					números do cabeçalho continuam certos, mas a posição da mancha só é confiável com um
					aparelho escolhido.
				</p>
			)}

			{desfecho !== "todos" && (
				<p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground text-sm">
					Recorte por desfecho: visitante sem cookie de visita fica de fora, porque não há como
					saber no que ele deu. Compare com “todos os visitantes” para ler a diferença, não o número
					absoluto.
				</p>
			)}

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
				{pronto ? (
					<VisorDoMapa
						path={mapa.path}
						modo={modo}
						pontos={mapa.pontos}
						funil={mapa.funil}
						device={device as FiltroDevice}
					/>
				) : (
					<Skeleton className="h-[720px] w-full" />
				)}

				<aside className="flex max-h-[720px] flex-col overflow-hidden rounded-lg border bg-card">
					<div className="border-b px-3 py-2.5">
						<h2 className="font-medium text-sm">O que foi clicado</h2>
						<p className="text-muted-foreground text-xs">
							“Raiva” é três batidas em menos de um segundo no mesmo alvo — costuma apontar algo que
							parece clicável e não responde.
						</p>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{pronto ? <ListaDeAlvos alvos={mapa.alvos} /> : <Skeleton className="m-3 h-64" />}
					</div>
				</aside>
			</div>
		</div>
	);
}

function Numero({ valor, rotulo, sufixo }: { valor: number; rotulo: string; sufixo?: string }) {
	return (
		<span className="flex items-baseline gap-1.5">
			<span className="font-semibold text-lg tabular-nums">
				{valor.toLocaleString("pt-BR")}
				{sufixo}
			</span>
			<span className="text-muted-foreground">{rotulo}</span>
		</span>
	);
}
