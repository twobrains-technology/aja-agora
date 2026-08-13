"use client";

import {
	AlertCircleIcon,
	CheckCircle2Icon,
	ImageUpIcon,
	Loader2Icon,
	RefreshCwIcon,
	SaveIcon,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	MIMES_DE_FOTO_ACEITOS,
	perfilCorporativoSchema,
	RAMOS_DE_ATIVIDADE,
	type RamoDeAtividade,
	recusaDaFoto,
} from "@/lib/validations/whatsapp-business-profile";

/** O que a Graph devolve do perfil. Espelha `PerfilCorporativo` do servidor. */
interface Perfil {
	about?: string;
	address?: string;
	description?: string;
	email?: string;
	profile_picture_url?: string;
	websites?: string[];
	vertical?: string;
}

interface Ligacao {
	phoneNumberId: string | null;
	wabaId: string | null;
	appId: string | null;
	temToken: boolean;
	podeTrocarFoto: boolean;
}

/** Estado do formulário — sempre string, porque input não tem `undefined`. */
interface Campos {
	about: string;
	description: string;
	address: string;
	email: string;
	site1: string;
	site2: string;
	vertical: RamoDeAtividade | "";
}

const CAMPOS_VAZIOS: Campos = {
	about: "",
	description: "",
	address: "",
	email: "",
	site1: "",
	site2: "",
	vertical: "",
};

/** Mensagem de erro por campo do formulário. */
type ErrosDoForm = Partial<Record<keyof Campos, string>>;

/**
 * Valida o formulário com o MESMO schema do servidor.
 *
 * Reusar o schema, e não reescrever as regras aqui, é o que impede que a tela
 * aceite algo que a rota recusa (ou o contrário). O que muda é só o formato: o
 * schema pensa em `websites[0]`, a tela em `site1`.
 */
function validar(campos: Campos): ErrosDoForm {
	const sites = [campos.site1.trim(), campos.site2.trim()];
	const r = perfilCorporativoSchema.safeParse({
		about: campos.about.trim(),
		description: campos.description.trim(),
		address: campos.address.trim(),
		email: campos.email.trim(),
		websites: sites.filter(Boolean),
		...(campos.vertical ? { vertical: campos.vertical } : {}),
	});
	if (r.success) return {};

	const erros: ErrosDoForm = {};
	for (const issue of r.error.issues) {
		const [campo, indice] = issue.path;
		if (campo === "websites") {
			// O índice do schema é o da lista JÁ filtrada; se o primeiro campo está
			// vazio, o índice 0 é o segundo campo da tela.
			const preenchidos: Array<keyof Campos> = [];
			if (sites[0]) preenchidos.push("site1");
			if (sites[1]) preenchidos.push("site2");
			const alvo = preenchidos[Number(indice) || 0] ?? "site1";
			erros[alvo] ??= issue.message;
			continue;
		}
		if (campo === "about") erros.about ??= issue.message;
		else if (campo === "description") erros.description ??= issue.message;
		else if (campo === "address") erros.address ??= issue.message;
		else if (campo === "email") erros.email ??= issue.message;
		else if (campo === "vertical") erros.vertical ??= issue.message;
	}
	return erros;
}

function camposDoPerfil(p: Perfil | null): Campos {
	if (!p) return CAMPOS_VAZIOS;
	const sites = p.websites ?? [];
	return {
		about: p.about ?? "",
		description: p.description ?? "",
		address: p.address ?? "",
		email: p.email ?? "",
		site1: sites[0] ?? "",
		site2: sites[1] ?? "",
		vertical: (p.vertical as RamoDeAtividade | undefined) ?? "",
	};
}

/**
 * Sinal de configurado/faltando.
 *
 * Ícone + palavra, nunca cor sozinha: quem não distingue as cores precisa
 * conseguir ler o estado, e "está verde" não é informação para todo mundo.
 */
function Sinal({ ok, rotulo, valor }: { ok: boolean; rotulo: string; valor?: string | null }) {
	return (
		<div className="flex items-start gap-2 text-sm">
			{ok ? (
				<CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
			) : (
				<AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
			)}
			<div className="min-w-0">
				<span className="font-medium">{rotulo}</span>{" "}
				<span className="text-muted-foreground break-all">
					{ok ? (valor ?? "configurado") : "não configurado"}
				</span>
			</div>
		</div>
	);
}

/**
 * Recado de sucesso ou de falha acima dos botões.
 *
 * `<output>` e não `<p role="status">`: o elemento já tem esse papel de fábrica,
 * então o leitor de tela anuncia o resultado sem ninguém precisar lembrar do
 * `role`. Ícone junto do texto, nunca a cor sozinha carregando o sentido.
 */
function Aviso({ tipo, texto }: { tipo: "ok" | "erro"; texto: string }) {
	const Icone = tipo === "ok" ? CheckCircle2Icon : AlertCircleIcon;
	return (
		<output
			className={`flex items-start gap-2 text-sm ${
				tipo === "ok" ? "text-success" : "text-destructive"
			}`}
		>
			<Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
			<span>{texto}</span>
		</output>
	);
}

/** Erro de um campo do formulário, em português, logo abaixo dele. */
function ErroDoCampo({ campo, mensagem }: { campo: string; mensagem?: string }) {
	if (!mensagem) return null;
	return (
		<p id={`erro-${campo}`} className="text-sm text-destructive">
			{mensagem}
		</p>
	);
}

function Carregando() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-32 w-full" />
			<Skeleton className="h-48 w-full" />
			<Skeleton className="h-72 w-full" />
		</div>
	);
}

export function ConfiguracaoWhatsapp() {
	const [ligacao, setLigacao] = useState<Ligacao | null>(null);
	const [perfil, setPerfil] = useState<Perfil | null>(null);
	const [campos, setCampos] = useState<Campos>(CAMPOS_VAZIOS);
	const [carregando, setCarregando] = useState(true);
	const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);

	const [salvando, setSalvando] = useState(false);
	const [erros, setErros] = useState<ErrosDoForm>({});
	const [avisoDoForm, setAvisoDoForm] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
		null,
	);

	const [enviandoFoto, setEnviandoFoto] = useState(false);
	const [avisoDaFoto, setAvisoDaFoto] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
		null,
	);
	const inputDeFoto = useRef<HTMLInputElement>(null);

	const carregar = useCallback(async () => {
		setErroDeCarga(null);
		try {
			const res = await fetch("/api/admin/whatsapp/perfil", { cache: "no-store" });
			const data = (await res.json()) as {
				ligacao?: Ligacao;
				perfil?: Perfil;
				erroDoPerfil?: string | null;
				error?: string;
			};
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

			// A `ligacao` entra ANTES de olhar o erro: ela vem de env, não da Meta, e
			// é justamente quando a Meta recusa que o operador precisa dela na tela.
			// Antes o erro cortava aqui, e o diagnóstico inteiro virava "não
			// configurado" — mentindo sobre variáveis que estavam configuradas.
			setLigacao(data.ligacao ?? null);
			setPerfil(data.perfil ?? null);
			setCampos(camposDoPerfil(data.perfil ?? null));
			if (data.erroDoPerfil) setErroDeCarga(data.erroDoPerfil);
		} catch (err) {
			setErroDeCarga(err instanceof Error ? err.message : String(err));
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		void carregar();
	}, [carregar]);

	function set<K extends keyof Campos>(chave: K, valor: Campos[K]) {
		setCampos((c) => ({ ...c, [chave]: valor }));
		setAvisoDoForm(null);
		// Some com o erro do campo assim que a pessoa mexe nele: erro velho ao lado
		// de um valor já corrigido faz parecer que a correção não pegou.
		setErros((e) => (e[chave] ? { ...e, [chave]: undefined } : e));
	}

	async function salvar(e: FormEvent) {
		e.preventDefault();

		// Validação NOSSA, em português. O `noValidate` no form desliga a do
		// navegador — que barrava o submit com um balão em inglês, porque esse texto
		// segue o idioma do browser e ignora o `lang` da página.
		const problemas = validar(campos);
		if (Object.values(problemas).some(Boolean)) {
			setErros(problemas);
			setAvisoDoForm(null);
			return;
		}
		setErros({});

		setSalvando(true);
		setAvisoDoForm(null);

		// Manda o formulário INTEIRO: aqui campo vazio significa "apague", e é assim
		// que o servidor lê (chave presente e vazia = limpar). Enviar só o que mudou
		// deixaria o operador sem como apagar um recado antigo.
		const sites = [campos.site1.trim(), campos.site2.trim()].filter(Boolean);
		const corpo: Record<string, unknown> = {
			about: campos.about.trim(),
			description: campos.description.trim(),
			address: campos.address.trim(),
			email: campos.email.trim(),
			websites: sites,
		};
		// Ramo em branco não viaja: a Graph não tem "sem ramo", e mandar "" seria
		// pedir um valor que o enum dela não tem.
		if (campos.vertical) corpo.vertical = campos.vertical;

		try {
			const res = await fetch("/api/admin/whatsapp/perfil", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(corpo),
			});
			const data = (await res.json()) as { perfil?: Perfil; error?: string };
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

			setPerfil(data.perfil ?? null);
			setCampos(camposDoPerfil(data.perfil ?? null));
			setAvisoDoForm({ tipo: "ok", texto: "Perfil atualizado no WhatsApp." });
		} catch (err) {
			setAvisoDoForm({
				tipo: "erro",
				texto: `Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`,
			});
		} finally {
			setSalvando(false);
		}
	}

	async function trocarFoto(e: ChangeEvent<HTMLInputElement>) {
		const arquivo = e.target.files?.[0];
		// Limpa o input já: sem isso, escolher o MESMO arquivo depois de um erro não
		// dispara `change` de novo, e a tela parece travada.
		e.target.value = "";
		if (!arquivo) return;

		setAvisoDaFoto(null);

		const recusa = recusaDaFoto({ type: arquivo.type, size: arquivo.size });
		if (recusa) {
			setAvisoDaFoto({ tipo: "erro", texto: recusa });
			return;
		}

		setEnviandoFoto(true);
		try {
			const form = new FormData();
			form.append("foto", arquivo);
			const res = await fetch("/api/admin/whatsapp/perfil/foto", { method: "POST", body: form });
			const data = (await res.json()) as { perfil?: Perfil; error?: string };
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

			setPerfil(data.perfil ?? null);
			setAvisoDaFoto({ tipo: "ok", texto: "Foto atualizada. Pode levar alguns minutos no app." });
		} catch (err) {
			setAvisoDaFoto({
				tipo: "erro",
				texto: `Não foi possível trocar a foto: ${err instanceof Error ? err.message : String(err)}`,
			});
		} finally {
			setEnviandoFoto(false);
		}
	}

	if (carregando) return <Carregando />;

	const semCredencial = ligacao ? !ligacao.temToken || !ligacao.phoneNumberId : true;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Conexão com a Meta</CardTitle>
					<CardDescription>
						De onde o número fala. Vem das variáveis de ambiente e não se edita por aqui — token não
						passa pelo painel.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<Sinal ok={Boolean(ligacao?.temToken)} rotulo="Token de acesso" valor="configurado" />
					<Sinal
						ok={Boolean(ligacao?.phoneNumberId)}
						rotulo="ID do número:"
						valor={ligacao?.phoneNumberId}
					/>
					<Sinal
						ok={Boolean(ligacao?.wabaId)}
						rotulo="Conta comercial (WABA):"
						valor={ligacao?.wabaId}
					/>
					<Sinal
						ok={Boolean(ligacao?.appId)}
						rotulo="ID do app (troca de foto):"
						valor={ligacao?.appId}
					/>
					<div className="pt-2">
						<Button type="button" variant="outline" size="sm" onClick={() => void carregar()}>
							<RefreshCwIcon className="size-4" />
							Recarregar da Meta
						</Button>
					</div>
					{erroDeCarga && (
						<Aviso tipo="erro" texto={`Falha ao ler o perfil na Meta: ${erroDeCarga}`} />
					)}
					{semCredencial && (
						<Aviso
							tipo="erro"
							texto="Sem WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID no ambiente não há perfil para ler nem para editar."
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Foto do perfil</CardTitle>
					<CardDescription>
						A imagem que o cliente vê ao abrir a conversa. JPEG ou PNG, até 5 MB — o WhatsApp corta
						em círculo, então prefira algo quadrado.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex items-center gap-4">
						{perfil?.profile_picture_url ? (
							/* A URL da Meta vem assinada e expira em horas. Pelo otimizador do
							   Next ela seria cacheada, e a foto sumiria da tela quando o link
							   morresse — para uma miniatura de 80px vista por um punhado de
							   admins, o `<img>` é o certo. */
							// biome-ignore lint/performance/noImgElement: URL assinada e efêmera da Meta, ver acima
							<img
								src={perfil.profile_picture_url}
								alt="Foto atual do perfil do WhatsApp"
								className="size-20 rounded-full object-cover border"
							/>
						) : (
							<div className="flex size-20 items-center justify-center rounded-full border border-dashed text-muted-foreground">
								<ImageUpIcon className="size-6" aria-hidden />
								<span className="sr-only">Nenhuma foto definida</span>
							</div>
						)}
						<div className="space-y-2">
							<input
								ref={inputDeFoto}
								type="file"
								accept={MIMES_DE_FOTO_ACEITOS.join(",")}
								className="hidden"
								onChange={(e) => void trocarFoto(e)}
							/>
							<Button
								type="button"
								variant="outline"
								disabled={enviandoFoto || !ligacao?.podeTrocarFoto}
								onClick={() => inputDeFoto.current?.click()}
							>
								{enviandoFoto ? (
									<Loader2Icon className="size-4 animate-spin" />
								) : (
									<ImageUpIcon className="size-4" />
								)}
								{enviandoFoto ? "Enviando…" : "Escolher nova foto"}
							</Button>
							{!ligacao?.podeTrocarFoto && (
								<p className="text-sm text-muted-foreground">
									Falta <code>WHATSAPP_APP_ID</code> no ambiente: a sessão de upload da Meta abre no
									ID do app, não no número.
								</p>
							)}
						</div>
					</div>
					{avisoDaFoto && <Aviso tipo={avisoDaFoto.tipo} texto={avisoDaFoto.texto} />}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Dados do negócio</CardTitle>
					<CardDescription>
						O que aparece em "Ver perfil comercial" no aplicativo. Deixar um campo em branco apaga o
						que estava lá.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{/* `noValidate`: a validação do navegador barra o submit com um balão
					    em INGLÊS (o texto segue o idioma do browser, não o `lang` da
					    página) e nem deixa o nosso código rodar. Quem valida é
					    `validar()`, com as mensagens em português do próprio schema. */}
					<form onSubmit={(e) => void salvar(e)} className="space-y-4" noValidate>
						<div className="space-y-2">
							<Label htmlFor="about">Recado</Label>
							<Input
								id="about"
								value={campos.about}
								disabled={semCredencial}
								placeholder="Consórcio de imóveis e autos, sem juros"
								onChange={(e) => set("about", e.target.value)}
							/>
							<ErroDoCampo campo="about" mensagem={erros.about} />
							<p className="text-xs text-muted-foreground">
								A frase curta logo abaixo do nome, como o "status" do WhatsApp.
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Descrição</Label>
							<Textarea
								id="description"
								rows={3}
								value={campos.description}
								disabled={semCredencial}
								placeholder="Quem somos e o que resolvemos para o cliente."
								onChange={(e) => set("description", e.target.value)}
							/>
							<ErroDoCampo campo="description" mensagem={erros.description} />
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="email">E-mail de contato</Label>
								<Input
									id="email"
									type="email"
									value={campos.email}
									disabled={semCredencial}
									placeholder="contato@ajaagora.com.br"
									aria-invalid={Boolean(erros.email)}
									aria-describedby={erros.email ? "erro-email" : undefined}
									onChange={(e) => set("email", e.target.value)}
								/>
								<ErroDoCampo campo="email" mensagem={erros.email} />
							</div>
							<div className="space-y-2">
								<Label htmlFor="vertical">Ramo de atividade</Label>
								<Select
									value={campos.vertical || undefined}
									disabled={semCredencial}
									onValueChange={(v) => set("vertical", v as RamoDeAtividade)}
								>
									<SelectTrigger id="vertical">
										{/* O rótulo entra explícito. Deixado a cargo do `SelectValue`,
										    o shadcn só o encontra depois que a lista abre (o
										    `SelectContent` é montado sob demanda) — até lá a tela
										    mostrava o enum cru da Meta, "PROF_SERVICES": inglês na UI. */}
										<SelectValue placeholder="Selecione o ramo">
											{campos.vertical ? RAMOS_DE_ATIVIDADE[campos.vertical] : null}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{Object.entries(RAMOS_DE_ATIVIDADE).map(([valor, rotulo]) => (
											<SelectItem key={valor} value={valor}>
												{rotulo}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="address">Endereço</Label>
							<Input
								id="address"
								value={campos.address}
								disabled={semCredencial}
								placeholder="Av. Paulista, 1000 — São Paulo, SP"
								onChange={(e) => set("address", e.target.value)}
							/>
							<ErroDoCampo campo="address" mensagem={erros.address} />
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="site1">Site</Label>
								<Input
									id="site1"
									inputMode="url"
									value={campos.site1}
									disabled={semCredencial}
									placeholder="https://ajaagora.com.br"
									aria-invalid={Boolean(erros.site1)}
									aria-describedby={erros.site1 ? "erro-site1" : undefined}
									onChange={(e) => set("site1", e.target.value)}
								/>
								<ErroDoCampo campo="site1" mensagem={erros.site1} />
							</div>
							<div className="space-y-2">
								<Label htmlFor="site2">Site alternativo</Label>
								<Input
									id="site2"
									inputMode="url"
									value={campos.site2}
									disabled={semCredencial}
									placeholder="https://instagram.com/ajaagora"
									aria-invalid={Boolean(erros.site2)}
									aria-describedby={erros.site2 ? "erro-site2" : undefined}
									onChange={(e) => set("site2", e.target.value)}
								/>
								<ErroDoCampo campo="site2" mensagem={erros.site2} />
							</div>
						</div>

						{avisoDoForm && <Aviso tipo={avisoDoForm.tipo} texto={avisoDoForm.texto} />}

						<div className="flex justify-end">
							<Button type="submit" disabled={salvando || semCredencial}>
								{salvando ? (
									<Loader2Icon className="size-4 animate-spin" />
								) : (
									<SaveIcon className="size-4" />
								)}
								{salvando ? "Salvando…" : "Salvar perfil"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
