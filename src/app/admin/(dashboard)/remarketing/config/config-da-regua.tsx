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
 *
 * A escala de retomada não é um número e NÃO entra no mapa dos vigentes: ela tem
 * bloco e estado próprios, porque o save reenvia todos os vigentes — um CSV que
 * voltasse pelo `<input type="number">` apagaria a escala do banco.
 */

import { Factory, PencilLine, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { EscalaDoCadastro, ParametroVigente } from "@/lib/admin/remarketing-config";

/**
 * A escala como a rota a devolve. A leitura do cadastro expõe o teto de passos
 * (`LIMITES_DA_ESCALA_NA_TELA.maximoDePassos`) junto da faixa, e a tela precisa
 * dele para dizer até quantos intervalos a lista aceita.
 */
type EscalaNaTela = EscalaDoCadastro & { maximoDePassos: number };

interface RespostaDoCadastro {
	parametros: ParametroVigente[];
	escalaDeRetomada: EscalaNaTela;
}

export function ConfigDaRegua() {
	const [vigentes, setVigentes] = useState<ParametroVigente[] | null>(null);
	const [valores, setValores] = useState<Record<string, string>>({});
	const [escala, setEscala] = useState<EscalaNaTela | null>(null);
	const [valorDaEscala, setValorDaEscala] = useState("");
	const [erros, setErros] = useState<Record<string, string>>({});
	const [erroGeral, setErroGeral] = useState<string | null>(null);
	const [salvo, setSalvo] = useState(false);
	const [carregando, setCarregando] = useState(true);
	const [salvando, setSalvando] = useState(false);

	const aplicarLeitura = useCallback(
		(corpo: { parametros: ParametroVigente[]; escalaDeRetomada?: EscalaNaTela | null }) => {
			setVigentes(corpo.parametros);
			setValores(Object.fromEntries(corpo.parametros.map((p) => [p.chave, String(p.valor)])));
			setEscala(corpo.escalaDeRetomada ?? null);
			setValorDaEscala(corpo.escalaDeRetomada?.valor ?? "");
		},
		[],
	);

	useEffect(() => {
		let vivo = true;
		(async () => {
			try {
				const res = await fetch("/api/admin/remarketing/config");
				const corpo = (await res.json()) as RespostaDoCadastro & { error?: string };
				if (!res.ok) throw new Error(corpo.error ?? "Falha ao ler o cadastro.");
				if (vivo) aplicarLeitura(corpo);
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
		if (!vigentes || !escala) return;
		setSalvando(true);
		setSalvo(false);
		setErros({});
		setErroGeral(null);

		try {
			const res = await fetch("/api/admin/remarketing/config", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					parametros: [
						...vigentes.map((p) => ({ chave: p.chave, valor: valores[p.chave] ?? "" })),
						// A escala vai como CSV junto dos outros — o servidor valida e normaliza.
						{ chave: escala.chave, valor: valorDaEscala },
					],
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

			aplicarLeitura(corpo);
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

	const erroDaEscala = escala ? erros[escala.chave] : undefined;

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
									{/* "Padrão de fábrica" só quando NÃO há ajuste salvo; com ajuste, é
									    "Editado". O rótulo de estado nunca usa `default` (coral). */}
									<Badge
										variant={parametro.origem === "cadastro" ? "warning" : "outline"}
										className="gap-1"
										title={
											parametro.origem === "cadastro"
												? "Este valor foi ajustado neste cadastro; o padrão do código foi substituído."
												: "O valor vigente é o padrão do código — nenhum ajuste foi salvo para este parâmetro."
										}
									>
										{parametro.origem === "cadastro" ? (
											<PencilLine className="size-3" aria-hidden="true" />
										) : (
											<Factory className="size-3" aria-hidden="true" />
										)}
										{parametro.origem === "cadastro" ? "Editado" : "Padrão de fábrica"}
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

			{escala && (
				<Card className="gap-3" data-testid="escala-da-regua">
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle className="text-sm">Escala de retomada</CardTitle>
							<Badge
								variant={escala.origem === "cadastro" ? "warning" : "outline"}
								className="gap-1"
								title={
									escala.origem === "cadastro"
										? "Esta escala foi ajustada neste cadastro; o padrão do código foi substituído."
										: "A escala vigente é o padrão do código — nenhum ajuste foi salvo para ela."
								}
							>
								{escala.origem === "cadastro" ? (
									<PencilLine className="size-3" aria-hidden="true" />
								) : (
									<Factory className="size-3" aria-hidden="true" />
								)}
								{escala.origem === "cadastro" ? "Editado" : "Padrão de fábrica"}
							</Badge>
						</div>
					</CardHeader>
					<CardContent className="space-y-2">
						<p className="text-muted-foreground text-xs">
							Os intervalos entre os toques enquanto a janela de 24 h da Meta está aberta. Fora dela, a
							régua segue os dias entre os toques.
						</p>

						<div className="flex items-center gap-2">
							<Label htmlFor={escala.chave} className="sr-only">
								Escala de retomada
							</Label>
							<Input
								id={escala.chave}
								type="text"
								inputMode="numeric"
								placeholder="90,180,300"
								className="w-48"
								value={valorDaEscala}
								aria-invalid={erroDaEscala ? true : undefined}
								onChange={(evento) => setValorDaEscala(evento.target.value)}
							/>
							<span className="text-muted-foreground text-sm">minutos</span>
						</div>

						<p className="text-muted-foreground text-xs">
							Intervalos em minutos separados por vírgula, em ordem crescente. Cada um aceita de{" "}
							{escala.minimo} a {escala.maximo} minutos, até {escala.maximoDePassos} intervalos. Deixe
							em branco para voltar ao padrão de fábrica.
						</p>

						{erroDaEscala && (
							<p className="text-destructive text-sm" role="alert">
								{erroDaEscala}
							</p>
						)}

						{escala.valorInvalido !== null && (
							<p className="text-destructive text-xs">
								Há uma escala gravada que a régua está ignorando (&quot;{escala.valorInvalido}&quot;) — por
								isso o padrão de fábrica está valendo.
							</p>
						)}
					</CardContent>
				</Card>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button onClick={salvar} disabled={salvando}>
					{salvando ? "Salvando…" : "Salvar cadastro"}
				</Button>
				<Button
					variant="outline"
					disabled={salvando}
					onClick={() => {
						setValores(Object.fromEntries(vigentes.map((p) => [p.chave, String(p.valor)])));
						setValorDaEscala(escala?.valor ?? "");
					}}
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
