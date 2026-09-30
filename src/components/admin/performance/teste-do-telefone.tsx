"use client";

/**
 * O RESULTADO DO A/B DO TELEFONE na tela — as duas variantes lado a lado.
 *
 * FIX-401. O endpoint `GET /api/admin/performance/telefone-ab` já existia desde
 * o FIX-397 e não tinha consumidor: o dado estava pronto e o dono não tinha onde
 * ler. Este card é o consumidor — consome o período que a página já usa
 * (`from`/`to` do `DateRangeFilter`) e mostra, por variante, visitas, telefones,
 * na comparação e a taxa de telefone, cada lado com o estado da meta.
 *
 * ── O que este card NÃO faz, de propósito ───────────────────────────────────
 *
 * Ele não declara vencedor. Lê os dois lados e mostra a meta de 30 por variante;
 * concluir "B ganhou" é de quem lê, com o tamanho da amostra na frente — a
 * mesma condição que o Kairo colocou na call de 29/09 ("sem número confiável,
 * AB com pouca gente é viés").
 *
 * E ele não dispara nada: é `fetch` de leitura no endpoint que já existe. Nada
 * de pixel da Meta nem de evento de conversão — nenhum disparo novo por causa
 * do teste. Este card só LÊ.
 *
 * ── Ausência de dado não vira zero ──────────────────────────────────────────
 *
 * Sem visita numa variante, o lado inteiro diz **"não calculável"** — nunca `0`,
 * `0%` ou `NaN`. "0%" afirmaria que ninguém converteu; a verdade é que ninguém
 * caiu ali ainda. A régua de texto vive em `teste-do-telefone-leitura.ts`.
 */

import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResultadoPorVariante } from "@/lib/chat/resultado-do-teste-do-telefone";
import {
	type LeituraDaVariante,
	lerTotalDoTeste,
	lerVarianteDoTeste,
	META_DE_VISITAS_POR_VARIANTE,
	NAO_CALCULAVEL,
} from "./teste-do-telefone-leitura";

/** O corpo de `/api/admin/performance/telefone-ab` (o que este card lê). */
interface RespostaDoTesteDoTelefone {
	variantes: ResultadoPorVariante[];
	total: { visitas: number; telefones: number; naComparacao: number } | null;
}

/** O estado da meta, com ícone + rótulo: a cor reforça, não decide. */
function SeloDaMeta({ leitura }: { leitura: LeituraDaVariante }) {
	if (leitura.meta === NAO_CALCULAVEL) {
		return (
			<Badge variant="outline">
				<CircleDashedIcon aria-hidden="true" />
				{NAO_CALCULAVEL}
			</Badge>
		);
	}
	if (leitura.metaAtingida) {
		return (
			<Badge variant="success">
				<CircleCheckIcon aria-hidden="true" />
				{leitura.meta}
			</Badge>
		);
	}
	return (
		<Badge variant="warning">
			<CircleAlertIcon aria-hidden="true" />
			{leitura.meta}
		</Badge>
	);
}

/** Um número da variante — o ausente sai atenuado, e o texto já diz que é ausência. */
function LinhaDaVariante({ rotulo, valor }: { rotulo: string; valor: string }) {
	return (
		<div className="flex items-baseline justify-between gap-4 py-1.5">
			<dt className="text-sm text-muted-foreground">{rotulo}</dt>
			<dd
				className={`text-base tabular-nums ${
					valor === NAO_CALCULAVEL ? "text-muted-foreground" : "font-medium"
				}`}
			>
				{valor}
			</dd>
		</div>
	);
}

function ColunaDaVariante({ leitura }: { leitura: LeituraDaVariante }) {
	return (
		<div data-testid={`variante-${leitura.variante}`} className="rounded-lg border p-4">
			<div className="flex items-center justify-between gap-3">
				<span className="font-medium">Variante {leitura.variante}</span>
				<SeloDaMeta leitura={leitura} />
			</div>
			<dl className="mt-3 divide-y">
				<LinhaDaVariante rotulo="Visitas" valor={leitura.visitas} />
				<LinhaDaVariante rotulo="Deixaram telefone" valor={leitura.telefones} />
				<LinhaDaVariante rotulo="Chegaram à comparação" valor={leitura.naComparacao} />
				<LinhaDaVariante rotulo="Taxa de telefone" valor={leitura.taxa} />
			</dl>
		</div>
	);
}

export function TesteDoTelefone({ de, ate }: { de: Date | null; ate: Date | null }) {
	const [resposta, setResposta] = useState<RespostaDoTesteDoTelefone | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	// A dependência do efeito é a identidade TEMPORAL do período, não o objeto
	// `Date`: sem `from`/`to` na URL o período é recriado a cada render
	// (`withDefault(diaDeHoje())`), e depender do objeto refazia o fetch em laço.
	const deEm = de?.getTime() ?? null;
	const ateEm = ate?.getTime() ?? null;

	useEffect(() => {
		let vivo = true;

		async function carregar() {
			setCarregando(true);
			setErro(null);
			try {
				const params = new URLSearchParams();
				if (deEm !== null) params.set("from", new Date(deEm).toISOString());
				if (ateEm !== null) params.set("to", new Date(ateEm).toISOString());

				const res = await fetch(`/api/admin/performance/telefone-ab?${params.toString()}`);
				if (!res.ok) throw new Error(`Erro ao carregar o teste do telefone: ${res.status}`);

				const dados = (await res.json()) as RespostaDoTesteDoTelefone;
				if (vivo) setResposta(dados);
			} catch (err) {
				if (vivo) setErro(err instanceof Error ? err.message : "Erro desconhecido");
			} finally {
				if (vivo) setCarregando(false);
			}
		}

		carregar();
		return () => {
			vivo = false;
		};
	}, [deEm, ateEm]);

	const total = lerTotalDoTeste(resposta?.total ?? null);

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Teste do telefone — resultado por variante</CardTitle>
				<CardDescription>
					Quem pediu o telefone antes (B) e quem deixou borrado (C), lado a lado. Meta: ≥
					{META_DE_VISITAS_POR_VARIANTE} visitas por variante — abaixo disso o número não decide
					nada, e sem visita o lado é "não calculável", nunca zero.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{erro && (
					<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
						{erro}
					</div>
				)}

				{carregando && !resposta && (
					<div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
						Carregando o resultado do teste…
					</div>
				)}

				{resposta && (
					<>
						<div className="grid gap-4 md:grid-cols-2">
							{resposta.variantes.map((variante) => (
								<ColunaDaVariante key={variante.variante} leitura={lerVarianteDoTeste(variante)} />
							))}
						</div>

						{/* O total fecha a leitura: é o tamanho da amostra do teste inteiro —
						    o número que diz se a comparação entre os dois lados já vale. */}
						<div
							data-testid="teste-do-telefone-total"
							className="mt-4 rounded-lg border bg-muted/30 p-4"
						>
							<p className="text-sm text-muted-foreground">Total do teste no período</p>
							<dl className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-3">
								<LinhaDaVariante rotulo="Visitas" valor={total.visitas} />
								<LinhaDaVariante rotulo="Deixaram telefone" valor={total.telefones} />
								<LinhaDaVariante rotulo="Chegaram à comparação" valor={total.naComparacao} />
							</dl>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
