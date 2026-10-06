"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { FiltroAB, NOTA_DO_BRACO_DA_PESSOA } from "@/components/admin/dashboard/filtro-ab";
import { BlocoDeCustos } from "@/components/admin/performance/bloco-de-custos";
import { FunilDeHandoffCard } from "@/components/admin/performance/funil-de-handoff";
import { FunilMidiaChart } from "@/components/admin/performance/funil-midia-chart";
import { PortaDoFunilCard } from "@/components/admin/performance/porta-do-funil";
// Ocultação declarada (22/09): o bloco "Quem chegou" (o perfil de quem iniciou a
// conversa) sai da tela de Performance por decisão do dono. O componente fica
// pronto e desligado — religá-lo é devolver a linha abaixo, não reescrever a tela.
// import { QuemChegouCard } from "@/components/admin/performance/quem-chegou";
import { SerieAquisicaoChart } from "@/components/admin/performance/serie-aquisicao-chart";
import { TabelaOrigens } from "@/components/admin/performance/tabela-origens";
import { TesteDoTelefone } from "@/components/admin/performance/teste-do-telefone";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PerformanceResponse } from "@/lib/admin/performance-types";
import { diaDeHoje } from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";
import { PARAMETRO_DO_RECORTE_AB } from "@/lib/experimentos/registro";

// O período padrão vive em `periodo.ts` — desde 24/08/2026 é HOJE, e é o mesmo
// objeto que o filtro e a rota resolvem.
const defaultFrom = () => diaDeHoje();
const defaultTo = () => diaDeHoje();

function BlocoSkeleton({ altura = 300 }: { altura?: number }) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-40" />
			</CardHeader>
			<CardContent>
				<Skeleton className="w-full" style={{ height: altura }} />
			</CardContent>
		</Card>
	);
}

function PerformanceContent() {
	const [from] = useQueryState("from", parseAsDiaDoNegocio.withDefault(defaultFrom()));
	const [to] = useQueryState("to", parseAsDiaDoNegocio.withDefault(defaultTo()));
	// O recorte por braço de experimento. Ele viaja pelo MESMO trilho do período
	// (querystring + cookie `aja_ab`) e é o servidor que resolve a precedência —
	// aqui só se repassa o que veio na URL, e a ausência deixa o cookie decidir.
	const [ab] = useQueryState(PARAMETRO_DO_RECORTE_AB, parseAsString);

	const [midia, setMidia] = useState<PerformanceResponse | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	// UM fetch, e não dois.
	//
	// A página puxava também `/api/admin/dashboard` para desenhar um segundo
	// funil — o comercial, de 9 estágios, medido de outra tabela. Eram duas
	// escadas na mesma tela, com números que podiam divergir e o leitor sem
	// saber em qual acreditar. Ficou a que mede o caminho inteiro, da visita ao
	// contrato; a outra saiu, e o request foi junto.
	//
	// ── A resposta que não é mais a do período selecionado NÃO pinta a tela ──
	//
	// Trocar o período deixa DUAS consultas no ar, e a mais lenta é a antiga
	// (janela maior): ela chegava depois e o `setMidia` dela sobrescrevia o número
	// novo — a tela pintava 30 dias com o rótulo "Hoje". Cada disparo leva um
	// bilhete, e só o ÚLTIMO pode escrever estado. Mesmo padrão do
	// `teste-do-telefone.tsx`, que já descarta por uma bandeira `vivo`.
	const bilheteAtual = useRef(0);

	const carregar = useCallback(async () => {
		const bilhete = ++bilheteAtual.current;
		setCarregando(true);
		setErro(null);

		try {
			const params = new URLSearchParams();
			if (from) params.set("from", from.toISOString());
			if (to) params.set("to", to.toISOString());
			if (ab) params.set(PARAMETRO_DO_RECORTE_AB, ab);

			const resMidia = await fetch(`/api/admin/performance?${params.toString()}`);
			if (!resMidia.ok) throw new Error(`Erro ao carregar performance: ${resMidia.status}`);

			const dados = (await resMidia.json()) as PerformanceResponse;
			if (bilhete !== bilheteAtual.current) return;
			setMidia(dados);
		} catch (err) {
			if (bilhete !== bilheteAtual.current) return;
			setErro(err instanceof Error ? err.message : "Erro desconhecido");
		} finally {
			// O `carregando` é do ÚLTIMO disparo: quem chegou atrasado não pode
			// apagar o "Carregando…" de uma consulta que ainda está em curso.
			if (bilhete === bilheteAtual.current) setCarregando(false);
		}
	}, [from, to, ab]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const pronto = !carregando && midia !== null;

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Performance</h1>
					<p className="text-muted-foreground text-sm mt-1">
						De onde vem o tráfego, onde ele vaza e o que vira contrato
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<FiltroAB nota={NOTA_DO_BRACO_DA_PESSOA} />
					<DateRangeFilter />
				</div>
			</div>

			{erro && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
					{erro}
				</div>
			)}

			{/* A porta vem antes do funil, e a cobertura de atribuição virou a nota de
			    rodapé dela — a faixa própria disputava atenção com o título da página
			    para dizer algo que só qualifica estes números. */}
			{pronto ? (
				<PortaDoFunilCard porta={midia.porta} cobertura={midia.cobertura} />
			) : (
				<BlocoSkeleton altura={140} />
			)}

			{/* "Quem chegou" fica OCULTO nesta tela (decisão do dono, 22/09) — o perfil
			    de quem iniciou a conversa passa a viver no painel "Agora". A remoção é de
			    grade, não de dado: o componente continua pronto e o espaço não fica vazio,
			    porque a página é uma pilha vertical e os blocos abaixo sobem. */}
			{pronto ? (
				<FunilMidiaChart etapas={midia.funil} de={from} ate={to} />
			) : (
				<BlocoSkeleton altura={320} />
			)}

			{/* O funil da MESA vem logo abaixo do funil do produto, e nesta ordem de
			    propósito: o de cima termina em "viram oferta / propostas", que é
			    exatamente onde o de baixo começa. Quem lê a página de cima para
			    baixo percorre a jornada inteira sem trocar de tela — e a fronteira
			    entre "o que o bot faz" e "o que a mesa faz" fica visível, que é a
			    passagem de bastão onde a auditoria suspeita da perda. */}
			{pronto ? <FunilDeHandoffCard handoff={midia.handoff} /> : <BlocoSkeleton altura={360} />}

			{pronto ? <SerieAquisicaoChart data={midia.serie} /> : <BlocoSkeleton />}

			{/* O CPC fecha a leitura: depois de ver onde o tráfego entra, onde vaza e o
			    que fecha, o bloco de custos responde quanto custou cada qualificado —
			    o número que a cliente pediu para levantar (Bruna, 22/09). Vem por
			    último de propósito: ele soma tudo o que está acima. */}
			{pronto ? <BlocoDeCustos custos={midia.custos} /> : <BlocoSkeleton altura={220} />}

			{pronto ? (
				<TabelaOrigens origens={midia.origens} de={from} ate={to} />
			) : (
				<BlocoSkeleton altura={200} />
			)}

			{/* O resultado do A/B do telefone fecha a página: é a leitura do teste que
			    decide qual caminho do pedido de telefone fica — e o período é o MESMO
			    que o resto da tela, senão o número do teste não bate com o dos blocos
			    acima dele. Puxa sozinho (`/api/admin/performance/telefone-ab`), com o
			    mesmo `from`/`to`: é outro assunto, não uma segunda versão destes
			    números. */}
			<TesteDoTelefone de={from} ate={to} />
		</div>
	);
}

export default function PerformancePage() {
	return <PerformanceContent />;
}
