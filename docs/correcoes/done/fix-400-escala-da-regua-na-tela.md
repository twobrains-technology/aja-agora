---
slug: fix-400-escala-da-regua-na-tela
titulo: A escala de retomada da régua aparece e se salva na tela
status: done
severidade: media
executado_em: 2026-09-29
commit: (a preencher no commit da lane — test+fix(remarketing))
mexe_em:
  - src/app/api/admin/remarketing/config/route.ts
  - src/app/admin/(dashboard)/remarketing/config/config-da-regua.tsx
  - src/app/api/admin/remarketing/config/route.test.ts
  - src/app/admin/(dashboard)/remarketing/config/config-da-regua.na-tela.test.tsx
---

# FIX-400 — a escala intra-janela estava fora da tela e fora da resposta

## Cenário

A régua tem duas cadências. Fora da janela de 24 h da Meta ela segue os **dias** entre toques
(`dias_ate_segundo_toque`, `dias_ate_terceiro_toque`, na tela). Dentro da janela vale a **escala
curta** — hoje `90, 180, 300` minutos —, e essa escala era invisível: o dono não tinha como
conferir o valor vigente nem ajustá-lo pelo painel.

## Causa

A camada de dados já estava pronta e não era o problema: `lerCadastroDoRemarketing()` monta
`escalaDeRetomada` (`EscalaDoCadastro`, com valor, origem, faixa e o texto recusado) e
`validarEntradas` já aceita, valida (CSV, faixa de cada intervalo, teto de passos, ordem
não-decrescente) e grava `escala_retomada_minutos`. Faltavam as duas pontas:

1. **A resposta não serializava a escala.** O `GET` de
   `src/app/api/admin/remarketing/config/route.ts` devolvia só `{ parametros }`, e o `PUT` só
   `{ parametros: leitura.vigentes }`. Sem campo na resposta, a tela não tem de onde ler a escala
   nem para onde devolvê-la.
2. **A tela não tinha bloco para ela.** `config-da-regua.tsx` só renderiza os escalares.

## Por que a escala não pode entrar no mapa dos vigentes

O motivo está documentado no próprio motor (`remarketing-config.ts`, bloco da escala): a tela
renderiza um `<input type="number">` por parâmetro vigente e, no save, reenvia **todos**. A escala
é uma **lista** (uma linha CSV de minutos) e não cabe num input numérico — se entrasse no mapa,
o CSV voltaria como remoção e **apagaria a escala do banco**, derrubando o motor no padrão de
fábrica sem ninguém pedir. Daí o desenho: campo próprio na resposta e bloco com estado próprio
na tela.

## Fix

- **Rota** (`route.ts`): `GET` → `Response.json({ parametros: vigentes, escalaDeRetomada })`;
  `PUT` → `Response.json({ parametros: leitura.vigentes, escalaDeRetomada: leitura.escalaDeRetomada })`.
  O contrato do corpo do `PUT` **não muda**: `{ parametros: [{ chave, valor }] }`, com a escala
  como um item dentro de `parametros`.
- **Tela** (`config-da-regua.tsx`): bloco próprio da escala, com estado próprio
  (`escala` + `valorDaEscala`), separado do mapa `valores` dos escalares. Mostra os intervalos
  (CSV editável), a origem em badge com rótulo ("Editado" / "Padrão de fábrica", nunca só cor),
  a faixa aceita (por intervalo e o teto de passos), o aviso de `valorInvalido` quando o banco
  guarda algo que a régua ignora, e a linha explicando que a escala vale **dentro da janela de
  24 h** — fora dela a régua segue os dias. O erro de validação do servidor aparece **sob o
  bloco** (mesma chave `escala_retomada_minutos` no mapa de erros). O save manda a escala junto
  dos outros parâmetros; esvaziar o campo = voltar à fábrica, a mesma regra dos escalares.
- Sem migration, sem campo novo de cadastro, nenhum arquivo em `drizzle/`.

## Regressão (TDD — Camada 1)

- `src/app/api/admin/remarketing/config/route.test.ts` (novo) — mock só das fronteiras de I/O
  (`requireRole`; `lerCadastroDoRemarketing`/`gravarCadastro`; `validarEntradas` roda de verdade
  porque é pura): `GET` devolve a escala vigente; `PUT` com `60,120` chama `gravarCadastro` com o
  CSV e devolve `escalaDeRetomada`; `PUT` com `300,100` (decrescente) → **400** com
  `erros.escala_retomada_minutos` e sem gravar; sem admin → 403 sem gravar. Visto FALHAR
  (`escalaDeRetomada` era `undefined`) antes do fix da rota.
- `src/app/admin/(dashboard)/remarketing/config/config-da-regua.na-tela.test.tsx` (novo,
  `happy-dom`, `fetch` stubado): mostra os três intervalos (`90`, `180`, `300`); editar e salvar
  envia `escala_retomada_minutos` no corpo do `PUT`; **salvar sem mexer na escala não manda vazio
  para ela** — a regressão que apagava a escala.

## Comandos

```bash
pnpm -s vitest run src/app/api/admin/remarketing/config/route.test.ts \
  "src/app/admin/(dashboard)/remarketing/config/" src/lib/admin/remarketing-config.test.ts  # 35 passed
pnpm -s typecheck                                                                           # exit 0
grep -n "escalaDeRetomada" src/app/api/admin/remarketing/config/route.ts                    # 3 ocorrências (GET e PUT)
```