#!/usr/bin/env python3
"""Guard do prompt gerenciado: mexeu no texto, publica — ou pelo menos SABE que não publicou.

Por que existe
--------------
O runtime lê o prompt com label `production` do Langfuse e só usa a constante do
código como fallback (`src/lib/observability/langfuse/prompts.ts`). Editar
`system-prompt.ts` / `turn-analyzer.ts`, commitar e deployar NÃO muda o agente.

Em 2026-08-15 isso foi medido em produção: o `aja-turn-analyzer` estava publicado
na v1 de 07/08 enquanto o código, desde 14/08, já trazia os exemplos que separam
"200 por mês" (parcela) de "200 mil" (valor do bem). Ninguém foi avisado, porque
nada olhava para isso.

Dois modos
----------
- `post-edit`: logo após editar um dos arquivos, injeta o lembrete no contexto.
- `stop`: ao tentar encerrar o turno com um desses arquivos modificado no working
  tree, BLOQUEIA uma vez e manda rodar `pnpm prompts:check`.

O bloqueio é deliberadamente de UMA vez por sessão. O objetivo é garantir que
alguém OLHE — não prender a sessão num laço quando publicar depende de credencial
de produção que nem sempre está à mão (publicar em prod é decisão do Kairo).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ARQUIVOS_DE_PROMPT = (
    "src/lib/agent/system-prompt.ts",
    "src/lib/agent/turn-analyzer.ts",
)

LEMBRETE = (
    "Você acabou de editar um texto de prompt GERENCIADO ({alvo}).\n"
    "O agente em produção lê a label `production` do Langfuse — o código é só fallback. "
    "Editar aqui e deployar NÃO muda o agente.\n"
    "Antes de dar este trabalho por concluído: rode `pnpm prompts:check` (diz se produção "
    "está rodando o repo) e, se divergir, `pnpm sync-prompts` apontado para a instância certa. "
    "Publicar em produção é decisão do Kairo — se ele não autorizou, registre como pendência "
    "em vez de deixar o texto no limbo."
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def prompts_modificados() -> list[str]:
    """Arquivos de prompt com mudança não commitada OU commitada mas não publicada.

    Usa o working tree (staged + unstaged): é o sinal de que ESTA sessão mexeu.
    Falha em silêncio (lista vazia) fora de repo git — o guard nunca pode ser o
    motivo de uma sessão travar.
    """
    try:
        saida = subprocess.run(
            ["git", "status", "--porcelain", "--", *ARQUIVOS_DE_PROMPT],
            cwd=repo_root(),
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if saida.returncode != 0:
        return []
    achados = []
    for linha in saida.stdout.splitlines():
        caminho = linha[3:].strip()
        if caminho:
            achados.append(caminho)
    return achados


def git_dir() -> Path | None:
    """Diretório real do git.

    NÃO dá para assumir `<repo>/.git`: nos worktrees do Superset — que é como
    este projeto é desenvolvido — `.git` é um ARQUIVO apontando para o gitdir
    real, e criar um subdiretório ali estoura `NotADirectoryError`. Pego no
    teste do próprio hook, em 2026-08-15.
    """
    try:
        saida = subprocess.run(
            ["git", "rev-parse", "--absolute-git-dir"],
            cwd=repo_root(),
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if saida.returncode != 0:
        return None
    caminho = saida.stdout.strip()
    return Path(caminho) if caminho else None


def ja_bloqueou(session_id: str) -> bool:
    """Marca por sessão, guardada no gitdir (fora do versionamento)."""
    if not session_id:
        return False
    base = git_dir()
    if base is None:
        return False
    marca = base / "prompt-sync-guard" / session_id
    try:
        if marca.exists():
            return True
        marca.parent.mkdir(parents=True, exist_ok=True)
        marca.write_text("bloqueado uma vez\n")
    except OSError:
        # Sem lugar para gravar a marca, o guard perderia a memória e poderia
        # bloquear em laço. Prefere-se não bloquear: o lembrete do post-edit
        # continua valendo, e travar a sessão é pior que avisar de menos.
        return True
    return False


def main() -> None:
    modo = sys.argv[1] if len(sys.argv) > 1 else "post-edit"
    try:
        entrada = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        entrada = {}

    if modo == "post-edit":
        caminho = (entrada.get("tool_input") or {}).get("file_path") or ""
        alvo = next((a for a in ARQUIVOS_DE_PROMPT if caminho.endswith(a)), None)
        if not alvo:
            return
        print(
            json.dumps(
                {
                    "systemMessage": f"⚠️ {alvo} é prompt gerenciado — produção lê o Langfuse, não o repo.",
                    "hookSpecificOutput": {
                        "hookEventName": "PostToolUse",
                        "additionalContext": LEMBRETE.format(alvo=alvo),
                    },
                }
            )
        )
        return

    if modo == "stop":
        modificados = prompts_modificados()
        if not modificados:
            return
        if ja_bloqueou(entrada.get("session_id", "")):
            return
        print(
            json.dumps(
                {
                    "decision": "block",
                    "reason": (
                        "Prompt gerenciado modificado nesta sessão: "
                        + ", ".join(modificados)
                        + ".\n"
                        + LEMBRETE.format(alvo="esses arquivos")
                        + "\n\nRode `pnpm prompts:check` agora. Se o resultado divergir e você não "
                        "puder publicar, deixe a pendência registrada explicitamente antes de encerrar."
                    ),
                }
            )
        )
        return


if __name__ == "__main__":
    main()
