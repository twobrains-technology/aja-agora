# Card: o próprio domínio entra como "Referência" na régua de origem (dashboard e skill divergem)

**Status:** pronto para correção (FIX-443) · **Medido em:** 05/10/2026 · **Recorte:** sexta 02/10 00:00 BRT → 05/10 ~08:30 BRT
**Onde:** `src/lib/admin/origem-label.ts` (a régua) e `src/lib/admin/agrupar-origens.ts` (o canal) — e, por consequência, `computeOrigens` em `src/lib/admin/performance-queries.ts`.
**Sintoma:** a tela de Performance mostra "Referência · ajaagora.com.br" como **canal de aquisição**. Não é: é gente navegando **dentro** do site (o navegador manda o nosso domínio como `referrer`). O próprio código diz que isso é ruído e deveria cair em Direto (`agrupar-origens.ts:53`), mas o filtro não reconhece o domínio — nem as variantes.

## A prova, lado a lado no MESMO recorte

**A) Dashboard, o que o cliente vê** (API `/api/admin/performance?from=2026-10-02&to=2026-10-06`): 312 visitas, 26 conversas, origens somando 308.

| origem | tipo | visitas | conversas | telefone |
|---|---|---|---|---|
| ajaagora.com.br | **referencia** ✗ | **88** | **14** | **3** |
| Direto | direto | 71 | 2 | 1 |
| www.ajaagora.com.br | **referencia** ✗ | **49** | **6** | 0 |
| an · 120251784723480104 · … | campanha | 26 | 1 | 0 |
| fb · 120251784723480104 · … | campanha | 18 | 2 | 0 |
| ajagora.com.br (sem o "a") | **referencia** ✗ | **12** | 0 | 0 |
| ig · 120251784723480104 · … | campanha | 11 | 0 | 0 |
| ig/an · 120251066713980104 · … (4 linhas) | campanha | 18 | 1 | 0 |
| an · 120251242855380104 · … | campanha | 4 | 0 | 0 |
| www.google.com | referencia ✔ | 2 | 0 | 0 |
| ajaagora.com.br**:2052 :2082 :2086 :2095 :8080 :8880** | **referencia** ✗ | **6** | 0 | 0 |

→ **155 das 312 visitas (50%) estão rotuladas como "Referência" sendo o PRÓPRIO domínio**, e **3 dos 5 telefones** do período estão pendurados nessa origem falsa.

**B) A régua da skill, separando navegação interna:** navegação interna **159** · campanha **86** · direto **71** · referência externa **4** (2 do google + 1 do app Android + 1 do domínio de teste).

## As divergências (5, todas com causa)

1. **Navegação interna contada como referência** (a grave): dashboard 155 a 159 × skill 0 — a skill já separa; a dashboard não.
2. **Total de visitas**: 312 (dashboard) × 320 (skill) — a dashboard exclui 8 (provável: bot/duplicata da própria janela).
3. **Campanha**: 80 (dashboard, por `utm_source`) × 86 (skill, por `campaign_id`) — 6 chegadas têm `campaign_id` sem `utm_source` (anúncio sem UTM, o caso do `fbclid`).
4. **Consequência do item 1 nos degraus**: as conversas que a dashboard atribui a "referência: ajaagora.com.br" (14, com 3 telefones) são, na verdade, **chegadas sem origem de mídia** — e é isso que faz o telefone parecer vir de um canal que não existe.
5. **Portas e domínio sem o "a"**: `ajaagora.com.br:*` e `ajagora.com.br` entram como referência — o filtro precisa reconhecer o domínio em qualquer porta, com e sem `www`, e a variante sem o "a".

## O que corrigir (na dashboard, que é o que o cliente vê)

- Reconhecer o **nosso domínio** (`ajaagora.com.br`, `www.ajaagora.com.br`, `ajagora.com.br`, `tb-aja-agora.twobrainstechnology.com`, com ou sem porta, com e sem esquema) e classificá-lo como **navegação interna** — nunca Referência.
- Decidir o rótulo da navegação interna na tela: ou entra em **Direto** (como o comentário do código já previa), ou ganha rótulo próprio ("Já estava no site"). Decisão de produto: **Direto**, para não multiplicar baldes.
- A skill se alinha à mesma régua e passa a declarar **"sem atribuição"** em vez de inferir canal.