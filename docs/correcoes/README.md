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

**Princípio-mãe: "10 devs prontos pra trabalhar — não podar paralelismo por medo de
merge."** Paralelo é o default; serializar é exceção justificada. Conflito pequeno e
mecânico se resolve em minutos — bloco esperando custa horas.

Níveis de relação entre blocos (detalhe na skill global `todo-blocks`):

1. **Independente** (arquivos disjuntos) → paralelo, merge limpo.
2. **Overlap textual** (mesmos arquivos, regiões diferentes — cassettes append-only,
   seções de prompt) → **paralelo mesmo assim**; manifesto declara
   `conflitos_esperados:` + ordem de merge recomendada.
3. **Dependência de contrato** (B usa código que A cria) → paralelo com STUB: o
   manifesto de B fixa o contrato e manda implementar com `TODO(bloco-a):` de troca
   pós-merge.
4. **Dependência estrutural dura** (paralelo = retrabalho grande) → só aqui vira
   `onda: 2`, com justificativa no manifesto.

Cada item declara `arquivos:` no frontmatter (base da classificação); cada
`_bloco.md` traz o **prompt de lançamento pronto** pro Superset.

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
