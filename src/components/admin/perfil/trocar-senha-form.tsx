"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

/** Mínimo do better-auth (`emailAndPassword`), espelhado aqui só para avisar o
 * usuário ANTES do round-trip — o servidor continua sendo quem valida. */
const MINIMO_DA_SENHA = 8;

type Estado =
	| { tipo: "ocioso" }
	| { tipo: "salvando" }
	| { tipo: "ok" }
	| { tipo: "erro"; msg: string };

/**
 * Troca de senha do próprio usuário logado.
 *
 * Até 2026-08-12 não existia: o menu do topo tinha "Minha conta" e
 * "Configuracoes" sem `onClick` nem `href` — clicavam e não faziam nada, o que
 * a equipe leu (com razão) como "desabilitado". Quem precisasse trocar a senha
 * não tinha por onde.
 *
 * `revokeOtherSessions` vai LIGADO e não é opção na tela: se a pessoa está
 * trocando a senha, o motivo mais comum é suspeita de que alguém a conhece —
 * manter as outras sessões vivas anularia a troca. Derrubar tudo é o padrão
 * seguro, e o custo é ela entrar de novo nos outros dispositivos.
 */
export function TrocarSenhaForm() {
	const [atual, setAtual] = useState("");
	const [nova, setNova] = useState("");
	const [confirma, setConfirma] = useState("");
	const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" });

	const curtaDemais = nova.length > 0 && nova.length < MINIMO_DA_SENHA;
	const naoConfere = confirma.length > 0 && nova !== confirma;
	const podeSalvar =
		atual.length > 0 &&
		nova.length >= MINIMO_DA_SENHA &&
		nova === confirma &&
		estado.tipo !== "salvando";

	async function salvar(e: React.FormEvent) {
		e.preventDefault();
		if (!podeSalvar) return;
		setEstado({ tipo: "salvando" });

		const { error } = await authClient.changePassword({
			currentPassword: atual,
			newPassword: nova,
			revokeOtherSessions: true,
		});

		if (error) {
			// A mensagem do better-auth para senha errada é genérica; traduzir o
			// caso comum evita o usuário achar que o sistema quebrou.
			const msg =
				error.status === 400 || error.status === 401
					? "Senha atual incorreta."
					: (error.message ?? "Não foi possível trocar a senha. Tente de novo.");
			setEstado({ tipo: "erro", msg });
			return;
		}

		setAtual("");
		setNova("");
		setConfirma("");
		setEstado({ tipo: "ok" });
	}

	return (
		<form onSubmit={salvar} className="max-w-md space-y-4">
			<div className="space-y-2">
				<Label htmlFor="senha-atual">Senha atual</Label>
				<Input
					id="senha-atual"
					type="password"
					autoComplete="current-password"
					value={atual}
					onChange={(e) => setAtual(e.target.value)}
					required
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="senha-nova">Nova senha</Label>
				<Input
					id="senha-nova"
					type="password"
					autoComplete="new-password"
					value={nova}
					onChange={(e) => setNova(e.target.value)}
					aria-describedby="ajuda-senha"
					required
				/>
				<p id="ajuda-senha" className="text-muted-foreground text-xs">
					Pelo menos {MINIMO_DA_SENHA} caracteres.
				</p>
				{curtaDemais && (
					<p className="text-destructive text-xs">
						A senha precisa ter no mínimo {MINIMO_DA_SENHA} caracteres.
					</p>
				)}
			</div>

			<div className="space-y-2">
				<Label htmlFor="senha-confirma">Confirme a nova senha</Label>
				<Input
					id="senha-confirma"
					type="password"
					autoComplete="new-password"
					value={confirma}
					onChange={(e) => setConfirma(e.target.value)}
					required
				/>
				{naoConfere && <p className="text-destructive text-xs">As duas senhas não são iguais.</p>}
			</div>

			<div className="flex items-center gap-3">
				<Button type="submit" disabled={!podeSalvar}>
					{estado.tipo === "salvando" ? "Salvando…" : "Trocar senha"}
				</Button>
				{estado.tipo === "ok" && (
					<span className="text-sm text-emerald-600">
						Senha alterada. As outras sessões foram encerradas.
					</span>
				)}
				{estado.tipo === "erro" && <span className="text-destructive text-sm">{estado.msg}</span>}
			</div>
		</form>
	);
}
