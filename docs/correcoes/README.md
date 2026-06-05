# Controle de correções — fluxo TODO → DONE em blocos paralelizáveis

Controle granular dos achados das rodadas de teste. **1 fix = 1 arquivo.
1 bloco = 1 pasta = 1 sessão paralela no Superset** (worktree isolado).

```
docs/correcoes/
├── todo/                          ← aguardando execução
│   ├── bloco-a-agent-core/        ← pasta = bloco = unidade de paralelização
│   │   ├── _bloco.md              ← manifesto: onda, depends_on, escopo de arquivos,
│   │   │                            prompt de lançamento pronto pro Superset
│   │   ├── fix-11-….md            ← spec completa do item
│   │   └── fix-12-….md
│   ├── bloco-b-status-tool/       (onda 2 — depende do A)
│   └── bloco-c-ui-fechamento/     (onda 1 — paralelo com A)
├── done/                          ← executado (flat; bloco fica no frontmatter)
└── 2026-*.md                      ← atas das sessões de teste
```

## Regras de DESENHO dos blocos (o que torna a paralelização segura)

1. **Bloco = unidade de paralelização.** Itens que tocam os MESMOS arquivos vão pro
   mesmo bloco e executam sequencial DENTRO dele (ordem no `_bloco.md`).
2. **Blocos da mesma onda são DISJUNTOS em arquivos** — interseção vazia entre os
   `escopo_arquivos` dos manifestos. É isso que garante merge sem conflito entre
   worktrees do Superset. Na dúvida (arquivo compartilhado, ex. cassettes), o item
   vai pro bloco que já toca o arquivo OU vira dependência de onda.
3. **Dependência explícita** (`depends_on` no manifesto) → bloco entra na onda
   seguinte, lançado só após o merge do que ele depende.
4. Cada item declara `arquivos:` no frontmatter — é o dado que permite calcular a
   disjunção ao montar os blocos.
5. Cada `_bloco.md` traz o **prompt de lançamento pronto** — colar na sessão do
   Superset, sem precisar redigitar contexto.

## Regras de FLUXO

1. **Anotar**: bug/feature apontado → arquivo `fix-NN-slug.md` com frontmatter
   (`id`, `titulo`, `status: todo`, `bloco`, `arquivos`, `rodada`) + palavras do
   operador + evidências + root cause investigado + correção proposta + regressão
   exigida (3 camadas, conforme CLAUDE.md). Item entra num bloco existente (se
   compartilha arquivos) ou abre bloco novo.
2. **Executar**: TDD strict. Ao concluir, **mover** o arquivo pra `done/`
   (`status: done` + `commit: <hash>` + `executado_em:`). Bloco vazio (só `_bloco.md`)
   → apagar a pasta do bloco.
3. **Nunca deletar item** — `done/` é histórico permanente. `ls todo/` = blocos
   pendentes; `ls done/` = o que já foi.
4. Numeração `FIX-NN` é global e crescente entre rodadas.
5. Decisões transversais ficam na **ata** da sessão e/ou `docs/jornada/CONTEXT.md`.

## Estado atual

Consultar as pastas (`ls docs/correcoes/todo docs/correcoes/done`) — placar copiado
aqui envelhece.
