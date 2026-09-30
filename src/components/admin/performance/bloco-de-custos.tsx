"use client";

/**
 * O BLOCO DE CUSTOS — o CPC que a cliente quer fechar, número a número.
 *
 * Bruna, 22/09: *"levantar todos os custos para a gente calcular o CPC depois"*.
 * Até aqui o único custo na tela era `investimentoCents`, dentro de Campanhas.
 *
 * ── O que este bloco NÃO faz, de propósito ──────────────────────────────────
 *
 * Ele não inventa número. Cada custo tem a SUA leitura e pode vir "não
 * calculável" com o motivo nomeado — e a tela diz qual. Um CPC somado por cima
 * de um custo ausente seria menor que a verdade; e "R$ 0,00" afirmaria que a
 * mensagem saiu de graça quando o que falta é o preço cadastrado. É a mesma
 * regra da tela de Campanhas (`descreverCusto`), aplicada ao custo inteiro.
 *
 * ── Cada número declara de ONDE veio ────────────────────────────────────────
 *
 * Investimento é o reportado pela Meta; custo de IA é o Langfuse; custo de
 * mensagem é o volume do Postgres com o preço do cadastro. Sem declarar a
 * fonte, os três apareceriam lado a lado como se fossem a mesma coisa, medida
 * do mesmo jeito.
 */

import { inteiro, reais } from "@/components/admin/campanhas/formato";
import { FRASE_CUSTO_NAO_APLICAVEL } from "@/components/admin/dashboard/filtro-ab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustosDoCpc } from "@/lib/admin/performance-types";
import { calcularCpc } from "./custos-do-cpc";

function Linha({
	titulo,
	valor,
	nota,
	fonte,
	alerta,
}: {
	titulo: string;
	valor: string;
	nota?: string;
	fonte: string;
	alerta?: boolean;
}) {
	return (
		<div className="flex flex-col gap-0.5 py-2">
			<div className="flex items-baseline justify-between gap-4">
				<span className="text-sm text-muted-foreground">{titulo}</span>
				<span className={`text-base font-medium tabular-nums ${alerta ? "text-amber-600" : ""}`}>
					{valor}
				</span>
			</div>
			{nota && <span className="text-xs text-muted-foreground">{nota}</span>}
			<span className="text-[11px] text-muted-foreground/70">fonte: {fonte}</span>
		</div>
	);
}

/**
 * A frase do D6 — o custo não se divide por braço de teste.
 *
 * A mesma frase das telas de Campanhas (`resumo-campanhas.tsx`): a explicação é
 * do produto, não da tela — por isso ela mora em `filtro-ab.tsx`, com as demais
 * frases do recorte, e é importada aqui.
 */
export function BlocoDeCustos({ custos }: { custos: CustosDoCpc }) {
	const cpc = calcularCpc(custos);

	// ── Recorte por braço ativo: nenhum R$ nesta tela (D6) ────────────────────
	//
	// O gasto da Meta é do PERÍODO INTEIRO: não existe coluna de braço em
	// `meta_insights_diarios`. Ratear o investimento pelo funil recortado seria
	// inventar um número por onde a verba passa — e mostrar o custo de IA ou de
	// mensagem em reais ao lado de um funil recortado convidaria a mesma divisão
	// errada. Então NÃO se renderiza cifra nenhuma: mostra a frase e a contagem
	// que continua válida (o funil segue visível — é o que o dono pediu).
	if (custos.custoNaoAplicavelAoRecorte) {
		return (
			<Card className="shadow-sm">
				<CardHeader>
					<CardTitle>Custo por lead qualificado (CPC)</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<p
						data-testid="custo-nao-aplicavel-ao-recorte"
						className="rounded-md border border-dashed border-input bg-muted/30 p-3 text-sm text-muted-foreground"
					>
						{FRASE_CUSTO_NAO_APLICAVEL}
					</p>
					<Linha
						titulo="Conversas / qualificados"
						valor={`${inteiro(custos.contagens.conversas)} / ${inteiro(custos.contagens.qualificados)}`}
						nota={`${inteiro(custos.contagens.identificados)} se identificaram no período`}
						fonte={custos.fontes.contagens}
					/>
				</CardContent>
			</Card>
		);
	}

	const investimento =
		custos.investimentoMetaCents === null ? "não reportado" : reais(custos.investimentoMetaCents);

	const ia =
		custos.custoDeIA.tipo === "valor" ? reais(custos.custoDeIA.brlCents) : "não calculável";

	const mensagem =
		custos.custoDeMensagem.custo.tipo === "valor"
			? reais(custos.custoDeMensagem.custo.centavos)
			: "sem preço cadastrado";

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Custo por lead qualificado (CPC)</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-x-12 gap-y-1 md:grid-cols-2">
					{/* A coluna da esquerda: os TRÊS custos, cada um com a fonte. */}
					<div className="divide-y">
						<Linha
							titulo="Investimento Meta"
							valor={investimento}
							nota="O investimento oficial é o reportado pela Meta, não o atribuído no CRM."
							fonte={custos.fontes.investimento}
						/>
						<Linha
							titulo="Custo de IA"
							valor={ia}
							nota={custos.custoDeIA.tipo === "valor" ? undefined : custos.custoDeIA.explicacao}
							fonte={custos.fontes.custoDeIA}
							alerta={custos.custoDeIA.tipo !== "valor"}
						/>
						<Linha
							titulo="Custo de mensagem"
							valor={mensagem}
							nota={
								custos.custoDeMensagem.custo.tipo === "valor"
									? `${inteiro(custos.custoDeMensagem.quantidade)} mensagens de template`
									: `${inteiro(custos.custoDeMensagem.quantidade)} mensagens de template · sem preço cadastrado`
							}
							fonte={custos.fontes.custoDeMensagem}
							alerta={custos.custoDeMensagem.custo.tipo !== "valor"}
						/>
					</div>

					{/* A coluna da direita: o funil que serve de denominador e o CPC. */}
					<div className="flex flex-col justify-between gap-4">
						<Linha
							titulo="Conversas / qualificados"
							valor={`${inteiro(custos.contagens.conversas)} / ${inteiro(custos.contagens.qualificados)}`}
							nota={`${inteiro(custos.contagens.identificados)} se identificaram no período`}
							fonte={custos.fontes.contagens}
						/>
						<div data-testid="custos-cpc" className="rounded-lg border bg-muted/30 p-4">
							<p className="text-sm text-muted-foreground">CPC do período</p>
							{cpc.tipo === "valor" ? (
								<p className="text-2xl font-bold tabular-nums">{reais(cpc.centavos)}</p>
							) : (
								<>
									<p className="text-2xl font-bold text-amber-600">não calculável</p>
									<p className="mt-1 text-xs text-muted-foreground">{cpc.explicacao}</p>
								</>
							)}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
