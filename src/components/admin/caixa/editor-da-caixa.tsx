"use client";

/**
 * A CONDUTA DO AGENTE, editável pela dona do produto — `/admin/caixa`.
 *
 * Até 23/10 a conduta só mudava por `pnpm exec tsx scripts/publicar-prompt-do-vendedor.ts`
 * na máquina do Kairo. A Bruna pediu em 20/10 ("ver aquela opção do agente… das
 * perguntas… antes de dar a simulação") e em 22/10 reclamou de ter que chamar o
 * Kairo para tirar o agente do ar: o texto era versionado, mas não tinha porta.
 *
 * Quatro coisas na mesma tela, e cada uma responde a uma pergunta diferente:
 *
 *   1. **Versão viva** — qual texto o turno está usando AGORA, de onde ele veio
 *      (`banco` ou o texto do código, que é o fallback) e quem publicou, quando.
 *   2. **Editor** — o texto da versão viva, para ajustar e publicar.
 *   3. **Histórico** — as versões publicadas, com o caminho de voltar.
 *   4. **Prévia do system** — o que o modelo lê de fato, nos três blocos.
 *
 * **Publicar cria versão nova, sempre.** Não existe editar nem apagar versão
 * publicada: "voltar para esta versão" é publicar o texto antigo de novo, como a
 * próxima versão. É o que torna o histórico uma auditoria de verdade.
 *
 * **A tela não escolhe label.** Ela mostra a label em vigor e publica nela — o
 * servidor é quem decide (`labelDaCaixa()`), porque aceitar label no corpo é o
 * acidente de 17/10: a label era compartilhada e publicar para testar em dev
 * mudou a conduta de produção.
 *
 * O dado inicial vem do SERVIDOR (`page.tsx` lê a caixa e o histórico), então
 * abrir a tela não dispara busca nenhuma; só publicar e pedir a prévia falam
 * com a API.
 */

import {
	ArrowLeftRight,
	BrainCircuit,
	History,
	ListChecks,
	PencilLine,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * O servidor recusa texto abaixo disto (`corpoSchema` em `/api/admin/caixa`) e a
 * tela usa o MESMO número: recusar no navegador o que o servidor recusaria evita
 * uma ida à API para receber a mesma mensagem.
 */
const MINIMO_DE_CARACTERES = 200;

/** Uma versão publicada, como a rota devolve (data em ISO, pronta para a tela). */
export type VersaoNaTela = {
	versao: number;
	texto: string;
	publicadoPor: string | null;
	criadoEm: string;
};

/** O que `page.tsx` entrega pronto — a tela não busca nada no primeiro render. */
export type EstadoInicialDaCaixa = {
	label: string;
	vivo: {
		versao: number;
		texto: string;
		origem: "banco" | "codigo";
		criadoEm: string | null;
	};
	historico: VersaoNaTela[];
	/** Mensagem quando o histórico não pôde ser lido; a conduta viva já veio. */
	erroDoHistorico: string | null;
};

type RespostaDaCaixa = EstadoInicialDaCaixa & { error?: string };

type PartesDaPrevia = { conduta: string; skills: string; fato: string };

type RespostaDaPrevia = {
	system: string;
	partes: PartesDaPrevia;
	label: string;
	versao: number;
	origem: "banco" | "codigo";
	error?: string;
};

type ErroDaApi = { error?: string; detalhes?: { fieldErrors?: Record<string, string[]> } };

type ResultadoDaPublicacao =
	| { ok: true; versao: number }
	| { ok: false; erro: string; erroDoCampo: string | null };

/**
 * Data no fuso de quem opera, fixado — o mesmo render no servidor e no cliente,
 * senão o horário pisca na hidratação. Segundos não interessam numa auditoria de
 * conduta: dia e hora bastam.
 */
const FORMATO_DE_DATA = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: "America/Sao_Paulo",
});

function dataCurta(iso: string | null): string | null {
	if (!iso) return null;
	const data = new Date(iso);
	if (Number.isNaN(data.getTime())) return null;
	return FORMATO_DE_DATA.format(data);
}

function BadgeDaOrigem({ origem }: { origem: "banco" | "codigo" }) {
	if (origem === "banco") {
		return (
			<Badge
				variant="success"
				className="gap-1"
				title="A conduta em vigor é uma versão publicada aqui e guardada no banco."
			>
				<PencilLine className="size-3" aria-hidden="true" />
				Publicada no banco
			</Badge>
		);
	}
	return (
		<Badge
			variant="outline"
			className="gap-1"
			title="Nenhuma versão publicada está sendo usada: o texto em vigor é o do código (fallback)."
		>
			<BrainCircuit className="size-3" aria-hidden="true" />
			Texto do código
		</Badge>
	);
}

export function EditorDaCaixa({ inicial }: { inicial: EstadoInicialDaCaixa }) {
	const [label, setLabel] = useState(inicial.label);
	const [vivo, setVivo] = useState(inicial.vivo);
	const [historico, setHistorico] = useState<VersaoNaTela[]>(inicial.historico);
	const [erroDoHistorico, setErroDoHistorico] = useState<string | null>(inicial.erroDoHistorico);

	const [texto, setTexto] = useState(inicial.vivo.texto);
	const [erroDoCampo, setErroDoCampo] = useState<string | null>(null);
	const [erroGeral, setErroGeral] = useState<string | null>(null);
	const [publicando, setPublicando] = useState(false);
	const [publicado, setPublicado] = useState<number | null>(null);

	const [versaoParaVoltar, setVersaoParaVoltar] = useState<VersaoNaTela | null>(null);
	const [erroDoVoltar, setErroDoVoltar] = useState<string | null>(null);

	const [previa, setPrevia] = useState<RespostaDaPrevia | null>(null);
	const [carregandoPrevia, setCarregandoPrevia] = useState(false);
	const [erroDaPrevia, setErroDaPrevia] = useState<string | null>(null);

	const caracteres = texto.trim().length;
	const curtoDemais = caracteres < MINIMO_DE_CARACTERES;

	/** A próxima versão é sempre a maior publicada + 1 — o servidor decide, a tela
	 * só antecipa o número para a confirmação dizer o que vai acontecer. */
	const proximaVersao = (historico[0]?.versao ?? vivo.versao) + 1;
	const dataDaViva = dataCurta(vivo.criadoEm);
	const autorDaViva = historico.find((v) => v.versao === vivo.versao)?.publicadoPor ?? null;

	/**
	 * Relê a caixa e o histórico depois de publicar. Falha aqui NÃO derruba a
	 * publicação (ela já aconteceu): a tela avisa que o histórico está velho em
	 * vez de fingir que o publish falhou.
	 */
	async function recarregar() {
		try {
			const res = await fetch("/api/admin/caixa", { cache: "no-store" });
			const corpo = (await res.json()) as RespostaDaCaixa;
			if (!res.ok) {
				setErroDoHistorico(corpo.error ?? "Não foi possível reler a conduta publicada.");
				return;
			}
			setLabel(corpo.label);
			setVivo(corpo.vivo);
			setHistorico(corpo.historico);
			setErroDoHistorico(null);
			// O editor passa a mostrar o texto que está no ar, e não o que foi digitado.
			setTexto(corpo.vivo.texto);
		} catch {
			setErroDoHistorico("Não foi possível reler a conduta publicada.");
		}
	}

	async function enviarPublicacao(conteudo: string): Promise<ResultadoDaPublicacao> {
		try {
			const res = await fetch("/api/admin/caixa", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ texto: conteudo }),
			});
			const corpo = (await res.json().catch(() => null)) as
				| (ErroDaApi & { versao?: number; label?: string })
				| null;

			if (!res.ok) {
				const mensagemDoCampo = corpo?.detalhes?.fieldErrors?.texto?.[0] ?? null;
				return {
					ok: false,
					erro: mensagemDoCampo
						? "O texto não foi publicado: corrija o campo abaixo."
						: (corpo?.error ?? "Não foi possível publicar a conduta."),
					erroDoCampo: mensagemDoCampo,
				};
			}

			await recarregar();
			return { ok: true, versao: corpo?.versao ?? proximaVersao };
		} catch {
			return {
				ok: false,
				erro: "Não foi possível falar com o servidor.",
				erroDoCampo: null,
			};
		}
	}

	async function publicarDoEditor() {
		setPublicando(true);
		setErroDoCampo(null);
		setErroGeral(null);
		setPublicado(null);

		const resultado = await enviarPublicacao(texto);
		if (resultado.ok) {
			setPublicado(resultado.versao);
			// A prévia é do texto ANTIGO até ser remontada; recarregar mantém a tela
			// coerente com o que acabou de ser publicado.
			if (previa) await carregarPrevia();
		} else {
			setErroDoCampo(resultado.erroDoCampo);
			if (!resultado.erroDoCampo) setErroGeral(resultado.erro);
		}
		setPublicando(false);
	}

	async function confirmarVoltar() {
		if (!versaoParaVoltar) return;
		setPublicando(true);
		setErroDoVoltar(null);

		const resultado = await enviarPublicacao(versaoParaVoltar.texto);
		if (resultado.ok) {
			setPublicado(resultado.versao);
			setVersaoParaVoltar(null);
			setErroDoCampo(null);
			setErroGeral(null);
			if (previa) await carregarPrevia();
		} else {
			setErroDoVoltar(resultado.erro);
		}
		setPublicando(false);
	}

	async function carregarPrevia() {
		setCarregandoPrevia(true);
		setErroDaPrevia(null);
		try {
			const res = await fetch("/api/admin/caixa/previa", { cache: "no-store" });
			const corpo = (await res.json()) as RespostaDaPrevia;
			if (!res.ok) {
				setErroDaPrevia(corpo.error ?? "Não foi possível montar a prévia.");
				return;
			}
			setPrevia(corpo);
		} catch {
			setErroDaPrevia("Não foi possível falar com o servidor.");
		} finally {
			setCarregandoPrevia(false);
		}
	}

	return (
		<div className="space-y-4">
			{/* 1. A versão viva */}
			<Card className="gap-3">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="text-sm">Versão em vigor</CardTitle>
						<div className="flex flex-wrap items-center gap-2">
							<BadgeDaOrigem origem={vivo.origem} />
							<Badge variant="secondary" title="A label do ambiente é escolhida pelo servidor.">
								label: {label}
							</Badge>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-1 text-sm">
					<p>
						<span className="text-muted-foreground">Versão: </span>
						{vivo.versao === 0 ? "0 (texto do código, nenhuma publicada)" : vivo.versao}
					</p>
					<p>
						<span className="text-muted-foreground">Publicada por: </span>
						{vivo.origem === "codigo"
							? "—"
							: (autorDaViva ?? "não registrado (publicação por script)")}
					</p>
					<p>
						<span className="text-muted-foreground">Quando: </span>
						{vivo.origem === "codigo" ? "—" : (dataDaViva ?? "data não registrada")}
					</p>
					{vivo.origem === "codigo" && (
						<p className="text-muted-foreground text-xs">
							Nenhuma versão publicada para esta label: o vendedor está usando o texto que vem do
							código. Publicar aqui passa a valer no próximo turno.
						</p>
					)}
				</CardContent>
			</Card>

			{/* 2. O editor */}
			<Card className="gap-3">
				<CardHeader>
					<CardTitle className="text-sm">Editar a conduta</CardTitle>
					<CardDescription>
						Este é o texto que o vendedor recebe como instrução. Publicar cria uma versão nova — a
						anterior continua no histórico.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<Label htmlFor="texto-da-conduta" className="sr-only">
						Texto da conduta do agente
					</Label>
					<Textarea
						id="texto-da-conduta"
						value={texto}
						rows={18}
						spellCheck
						aria-invalid={erroDoCampo ? true : undefined}
						aria-describedby="contagem-da-conduta"
						className="max-h-[28rem] min-h-64 overflow-y-auto font-mono text-xs leading-relaxed"
						onChange={(evento) => {
							setTexto(evento.target.value);
							setPublicado(null);
						}}
					/>
					<p id="contagem-da-conduta" className="text-muted-foreground text-xs">
						{caracteres.toLocaleString("pt-BR")} caracteres
						{curtoDemais && ` — o mínimo para publicar é ${MINIMO_DE_CARACTERES}`}. O modelo recebe
						este texto inteiro em cada turno.
					</p>

					{erroDoCampo && (
						<p className="text-destructive text-sm" role="alert">
							{erroDoCampo}
						</p>
					)}
					{erroGeral && (
						<p className="text-destructive text-sm" role="alert">
							{erroGeral}
						</p>
					)}

					<div className="flex flex-wrap items-center gap-3">
						<Button onClick={publicarDoEditor} disabled={publicando || curtoDemais}>
							{publicando ? "Publicando…" : `Publicar como versão ${proximaVersao}`}
						</Button>
						<Button
							variant="outline"
							disabled={publicando || texto === vivo.texto}
							onClick={() => {
								setTexto(vivo.texto);
								setErroDoCampo(null);
								setErroGeral(null);
								setPublicado(null);
							}}
						>
							<RefreshCw className="size-3.5" aria-hidden="true" />
							Desfazer edições
						</Button>
						{publicado !== null && (
							<output className="text-muted-foreground text-sm">
								Versão {publicado} publicada. Passa a valer no próximo turno, em até 60 segundos nos
								servidores que já estão no ar.
							</output>
						)}
					</div>
				</CardContent>
			</Card>

			{/* 3. O histórico */}
			<Card className="gap-3">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="text-sm">Histórico de versões</CardTitle>
						<Badge variant="outline" className="gap-1">
							<History className="size-3" aria-hidden="true" />
							{historico.length} {historico.length === 1 ? "versão" : "versões"}
						</Badge>
					</div>
					<CardDescription>
						Da mais nova para a mais antiga. Voltar para uma versão antiga publica o texto dela como
						a próxima — nenhuma versão é editada ou apagada.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					{erroDoHistorico && (
						<p className="text-destructive text-sm" role="alert">
							{erroDoHistorico}
						</p>
					)}

					{historico.length === 0 && !erroDoHistorico && (
						<p className="text-muted-foreground text-sm">
							Nenhuma versão publicada ainda. O texto do código é o que está em vigor.
						</p>
					)}

					{historico.map((versao) => {
						const emVigor = versao.versao === vivo.versao;
						return (
							<div
								key={versao.versao}
								className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
							>
								<div className="space-y-0.5">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-sm font-medium">Versão {versao.versao}</span>
										{emVigor && (
											<Badge variant="success" className="gap-1">
												<ListChecks className="size-3" aria-hidden="true" />
												Em vigor
											</Badge>
										)}
									</div>
									<p className="text-muted-foreground text-xs">
										{versao.publicadoPor ?? "autor não registrado"} ·{" "}
										{dataCurta(versao.criadoEm) ?? "data não registrada"} ·{" "}
										{versao.texto.trim().length.toLocaleString("pt-BR")} caracteres
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={emVigor || publicando}
									title={
										emVigor
											? "Esta é a versão em vigor — não há para onde voltar."
											: "Publica o texto desta versão como a próxima versão."
									}
									onClick={() => {
										setErroDoVoltar(null);
										setVersaoParaVoltar(versao);
									}}
								>
									<ArrowLeftRight className="size-3.5" aria-hidden="true" />
									Voltar para esta versão
								</Button>
							</div>
						);
					})}
				</CardContent>
			</Card>

			{/* 4. A prévia do system */}
			<Card className="gap-3">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="text-sm">O que o modelo recebe</CardTitle>
						<Button
							variant="outline"
							size="sm"
							onClick={carregarPrevia}
							disabled={carregandoPrevia}
						>
							{carregandoPrevia ? "Montando…" : previa ? "Remontar prévia" : "Montar prévia"}
						</Button>
					</div>
					<CardDescription>
						O system montado de verdade, com a conduta em vigor, o conhecimento da Bevi (skills) e a
						linha de fato do atendimento. A identidade usada aqui é de exemplo — nenhum dado de
						cliente entra na prévia.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{erroDaPrevia && (
						<p className="text-destructive text-sm" role="alert">
							{erroDaPrevia}
						</p>
					)}

					{!previa && !erroDaPrevia && (
						<p className="text-muted-foreground text-sm">
							Clique em &quot;Montar prévia&quot; para ver o texto exato que o vendedor lê hoje.
						</p>
					)}

					{previa && (
						<>
							<p className="text-muted-foreground text-xs">
								Montada com a versão {previa.versao} (
								{previa.origem === "banco" ? "banco" : "código"}
								), label {previa.label}.
							</p>
							{(
								[
									{ chave: "conduta", rotulo: "Conduta", conteudo: previa.partes.conduta },
									{
										chave: "skills",
										rotulo: "Ferramentas (skills)",
										conteudo: previa.partes.skills,
									},
									{ chave: "fato", rotulo: "Fato do atendimento", conteudo: previa.partes.fato },
								] as const
							).map((parte) => (
								<div key={parte.chave} className="space-y-1">
									<p className="text-sm font-medium">{parte.rotulo}</p>
									<pre className="bg-muted/40 max-h-72 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap">
										{parte.conteudo}
									</pre>
								</div>
							))}
						</>
					)}
				</CardContent>
			</Card>

			{/* A confirmação do rollback — diz em uma frase que o passado não é alterado. */}
			<Dialog
				open={versaoParaVoltar !== null}
				onOpenChange={(aberto) => {
					if (!aberto) {
						setVersaoParaVoltar(null);
						setErroDoVoltar(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Voltar para a versão {versaoParaVoltar?.versao}?</DialogTitle>
						<DialogDescription className="pt-2">
							Isso publica o texto da versão {versaoParaVoltar?.versao} como a versão{" "}
							{proximaVersao}. A versão em vigor não é alterada nem apagada — o histórico continua
							inteiro, e desfazer é publicar de novo o texto que você quiser.
						</DialogDescription>
					</DialogHeader>

					{erroDoVoltar && (
						<p className="text-destructive text-sm" role="alert">
							{erroDoVoltar}
						</p>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setVersaoParaVoltar(null)}
							disabled={publicando}
						>
							Cancelar
						</Button>
						<Button onClick={confirmarVoltar} disabled={publicando}>
							{publicando ? "Publicando…" : `Publicar como versão ${proximaVersao}`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
