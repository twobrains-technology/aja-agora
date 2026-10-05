---
id: FIX-439
titulo: "A Performance obedece ao período; a lista global de parados vai para o Remarketing"
status: done
bloco: performance-obedece-ao-periodo
commit: 4c9883e5
arquivos:
  - src/lib/admin/handoff-queries.ts
  - src/lib/admin/handoff-queries.integration.test.ts
  - src/components/admin/performance/funil-de-handoff.tsx
  - src/components/admin/performance/funil-de-handoff.parados-do-periodo.test.tsx
  - src/app/admin/(dashboard)/performance/page.tsx
  - src/app/admin/(dashboard)/performance/page.descarta-resposta-atrasada.test.tsx
  - src/app/admin/(dashboard)/remarketing/page.tsx
  - src/app/admin/(dashboard)/remarketing/page.parados-globais.test.tsx
  - src/app/api/admin/remarketing/route.ts
  - src/lib/workers/sla-da-mesa-cycle.ts
  - src/lib/workers/sla-da-mesa-cycle.test.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "Esse dado está ruim, tá ligado? Por quantidade de dias ali, ele não está filtrando pelo período que você colocou." (Kairo, 11:55:49)
> "São os parados." / "acho que a gente teria que fazer uma só de... de remarketing" (Kairo, 11:55:49)

## O que estava no ar (medido)
Só o bloco "Parados há mais de 24h (N)" ignorava o período (`handoff-queries.ts`), misturando parados de
qualquer data no mesmo painel — a Bruna esperava 6 conversas em "Hoje" e viu a operação inteira. O fetch da
página não descartava resposta atrasada, então trocar o período deixava a resposta antiga (janela maior,
mais lenta) sobrescrever com o rótulo errado.

## O que mudou (D10)
1. `computeLeadsParados(limiteHoras?, periodo?, recorte?)`: `periodo` **opcional**. Ausente ⇒ lista **GLOBAL**
   (SQL idêntico ao de antes). Presente ⇒ população **DO PERÍODO** (`l.created_at BETWEEN …`, por NASCIMENTO
   do lead, o mesmo critério do funil). O `computeFunilDeHandoff` passa a janela e o recorte para os parados.
2. Rótulo escrito: **"Parados há mais de 24h no período"** + frase explicando a população. Sem a palavra "no
   período" o número do dia pareceria o bolo inteiro.
3. A lista **global** ("todos os períodos") vai para **`/admin/remarketing`**, bloco próprio, fora da
   resposta da régua (`parados: { limiteHoras, leads }`) — é a única coisa daquela resposta que NÃO obedece
   ao período.
4. O fetch da Performance **descarta a resposta atrasada** (contador de bilhete com `useRef`, padrão de
   `teste-do-telefone.tsx`); só o último disparo pode escrever o resultado.
5. **B8b** (commit `6bc5287b`): o e-mail do SLA apontava a "lista completa" para `/admin/performance` — que
   perdeu a lista completa. Corrigido o ponteiro para `/admin/remarketing`; o `p50/p90 por sub-etapa`
   continua em `/admin/performance`. 3 frases (`:194`, `:204`, `:216`).

### Teste vermelho da base, corrigido
`handoff-queries.integration.test.ts` › "estágio sem saída registrada não vira tempo zero" (vermelho desde
`9bdb2040`): a causa foi provada no banco do workspace — linhas antigas de ago/2026 faziam o p50 de
`qualificado` virar 0,0017 h, que arredonda para 0,0. Corrigido sem `skip`.

## Provado
- Integração: lead parado há 10 dias + conversa de hoje, período "Hoje" ⇒ os parados do período **não**
  incluem o antigo; a global inclui. Componente: dois fetches resolvendo fora de ordem ⇒ a tela fica com o
  do período selecionado.
- `pnpm -s vitest run src/lib/admin/handoff-queries.integration.test.ts src/lib/admin/performance-queries.integration.test.ts src/components/admin/performance 'src/app/admin/(dashboard)/performance' 'src/app/admin/(dashboard)/remarketing'`
  → **13 arquivos / 113 testes verdes**; `typecheck` exit 0.