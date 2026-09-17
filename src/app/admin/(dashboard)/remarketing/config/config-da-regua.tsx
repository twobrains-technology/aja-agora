"use client";

/**
 * O cadastro da régua, do lado do cliente.
 *
 * Três coisas que a tela precisa dizer, e nenhuma delas é decoração:
 *
 *   1. **De onde veio o valor.** "Cadastro" é ajuste salvo aqui; "Padrão de
 *      fábrica" é a constante do código. Sem essa distinção, quem olha a tela não
 *      sabe se o motor está usando o número que está lendo.
 *   2. **A faixa aceita.** Campo fora da faixa é recusado pelo servidor com a
 *      mensagem no campo — e o `min`/`max` do input evita a maior parte das
 *      tentativas antes de sair do navegador.
 *   3. **O que está gravado mas sendo ignorado.** Se o banco guarda um ajuste que
 *      a régua recusou (texto, número absurdo), a tela avisa em vez de mostrar só
 *      o padrão, que faria o dono achar que o ajuste não foi salvo.
 *
 * Esvaziar um campo e salvar APAGA o ajuste: o parâmetro volta ao padrão de
 * fábrica. É o caminho de desfazer, e está escrito na tela.
 */

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { ParametroVigente } from "@/lib/admin/remarketing-config";

interface RespostaDoCadastro {
	parametros: ParametroVigente[];
}

export function ConfigDaRegua() {
	const [vigentes, setVigentes] = useState<ParametroVigente[] | null>(null);
	const [valores, setValores] = useState<Record<string, string>>({});
	const [erros, setErros] = useState<Record<string, string>>({});
	const [erroGeral, setErroGeral] = useState<string | null>(null);
	const [salvo, setSalvo] = useState(false);
	const [carregando, setCarregando] = useState(true);
	const [salvando, setSalvando] = useState(false);

	const aplicarLeitura = useCallback((parametros: ParametroVigente[]) => {
		setVigentes(parametros);
		setValores(Object.fromEntries(parametros.map((p) => [p.chave, String(p.valor)])));
	}, []);

	useEffect(() => {
		let vivo = true;
		(async () => {
			try {
				const res = await fetch("/api/admin/remarketing/config");
				const corpo = (await res.json()) as RespostaDoCadastro & { error?: string };
				if (!res.ok) throw new Error(corpo.error ?? "Falha ao ler o cadastro.");
				if (vivo) aplicarLeitura(corpo.parametros);
			} catch (err) {
				if (vivo) setErroGeral(err instanceof Error ? err.message : "Falha ao ler o cadastro.");
			} finally {
				if (vivo) setCarregando(false);
			}
		})();
		return () => {
			vivo = false;
		};
	}, [aplicarLeitura]);

	async function salvar() {
		if (!vigentes) return;
		setSalvando(true);
		setSalvo(false);
		setErros({});
		setErroGeral(null);

		try {
			const res = await fetch("/api/admin/remarketing/config", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					parametros: vigentes.map((p) => ({ chave: p.chave, valor: valores[p.chave] ?? "" })),
				}),
			});
			const corpo = (await res.json()) as RespostaDoCadastro & {
				error?: string;
				erros?: Record<string, string>;
			};

			if (!res.ok) {
				if (corpo.erros) setErros(corpo.erros);
				setErroGeral(Object.keys(corpo.erros ?? {}).length > 0 ? null : (corpo.error ?? null));
				if (!corpo.erros && !corpo.error) setErroGeral("Não foi possível salvar o cadastro.");
				return;
			}

			aplicarLeitura(corpo.parametros);
			setSalvo(true);
		} catch {
			setErroGeral("Não foi possível falar com o servidor.");
		} finally {
			setSalvando(false);
		}
	}

	if (carregando) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-28 w-full" />
			</div>
		);
	}

	if (!vigentes) {
		return (
			<Card>
				<CardContent className="text-destructive text-sm py-6">
					{erroGeral ?? "Não foi possível ler o cadastro da régua."}
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{erroGeral && (
				<p className="text-destructive text-sm" role="alert">
					{erroGeral}
				</p>
			)}

			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				{vigentes.map((parametro) => {
					const erro = erros[parametro.chave];
					return (
						<Card key={parametro.chave} className="gap-3">
							<CardHeader>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<CardTitle className="text-sm">{parametro.rotulo}</CardTitle>
									<Badge variant={parametro.origem === "cadastro" ? "default" : "outline"}>
										{parametro.origem === "cadastro" ? "Cadastro" : "Padrão de fábrica"}
									</Badge>
								</div>
							</CardHeader>
							<CardContent className="space-y-2">
								<p className="text-muted-foreground text-xs">{parametro.descricao}</p>

								<div className="flex items-center gap-2">
									<Label htmlFor={parametro.chave} className="sr-only">
										{parametro.rotulo}
									</Label>
									<Input
										id={parametro.chave}
										type="number"
										inputMode="numeric"
										step={1}
										min={parametro.minimo}
										max={parametro.maximo}
										className="w-28"
										value={valores[parametro.chave] ?? ""}
										aria-invalid={erro ? true : undefined}
										onChange={(evento) =>
											setValores((atual) => ({
												...atual,
												[parametro.chave]: evento.target.value,
											}))
										}
									/>
									<span className="text-muted-foreground text-sm">{parametro.unidadeRotulo}</span>
								</div>

								<p className="text-muted-foreground text-xs">
									Aceita de {parametro.minimo} a {parametro.maximo} {parametro.unidadeRotulo}. Deixe
									em branco para voltar ao padrão de fábrica.
								</p>

								{erro && (
									<p className="text-destructive text-sm" role="alert">
										{erro}
									</p>
								)}

								{parametro.valorInvalido !== null && (
									<p className="text-destructive text-xs">
										Há um valor gravado que a régua está ignorando (&quot;{parametro.valorInvalido}
										&quot;) — por isso o padrão de fábrica está valendo.
									</p>
								)}
							</CardContent>
						</Card>
					);
				})}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Button onClick={salvar} disabled={salvando}>
					{salvando ? "Salvando…" : "Salvar cadastro"}
				</Button>
				<Button
					variant="outline"
					disabled={salvando}
					onClick={() =>
						setValores(Object.fromEntries(vigentes.map((p) => [p.chave, String(p.valor)])))
					}
				>
					<RotateCcw className="size-3.5" />
					Desfazer edições
				</Button>
				{salvo && (
					<output className="text-sm text-muted-foreground">
						Cadastro salvo. A régua passa a usar estes valores no próximo ciclo.
					</output>
				)}
			</div>
		</div>
	);
}
