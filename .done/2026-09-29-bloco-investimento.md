---
titulo: "Bloco investimento — o número oficial tem nome (FIX-390)"
data: 2026-09-29
bloco: bloco-investimento
branch: feat/investimento-oficial
onda: 2
itens: [FIX-390]
tipo: correção de rótulo/copy (nenhuma soma muda)
---

# Bloco investimento — o número oficial tem nome

**Decisão do dono (28/09), e o bloco inteiro é ela:** na tela de Campanhas, o
investimento **oficial** é **o reportado pela Meta** — o número que a cliente vê
no gerenciador. O *atribuído no CRM* deixa de ser um número implícito e vira a
**linha vizinha**, com a diferença em reais e o motivo.

**Nenhuma soma mudou.** O total, o rateio e o custo por qualificado continuam
exatamente iguais — `investimentoCents` continua sendo a soma de `spend_cents`.
O que mudou foi o nome da leitura oficial e a vizinhança da diferença.

## O que a tela passou a mostrar (texto exato)

Cartão de verba (era "Investimento no período", nota "Soma do que o gerenciador
reportou para as campanhas"):

- **Título:** `Investimento reportado pela Meta`
- **Valor grande:** o total reportado (inalterado) — ex. `R$ 1.000,00`
- **Nota, linha 1:** `O número oficial do período — soma do que o gerenciador reportou para as campanhas.`
- **Nota, linha 2 (a vizinha):** `Investimento atribuído no CRM: R$ 700,00`
- **Nota, linha 3 (o motivo), quando há diferença:**
  `A Meta reportou +R$ 300,00 — campanha sem atribuição no CRM: o gasto não achou visita dentro da janela de data`
- Quando as duas leituras coincidem:
  `As duas leituras bateram no período — raro, e não significa que medem o mesmo`
- Quando não há verba no período:
  `Sem investimento reportado no período — não há verba a reconciliar`

Coluna da tabela por campanha: `Investimento` → **`Investimento (Meta)`**, com
tooltip "O que a Meta reportou para esta campanha no período — a leitura oficial
da verba".

Versão antiga da linha vizinha pelo padrão `explicarDiferenca` (leads), que
continua igual: `A Meta contou +8 — cliques que não viraram conversa com o cliente
identificado`.

## O que mudou no código

- `src/lib/admin/campanhas-queries.ts`
  - `TotaisDeCampanhas` ganhou `investimentoAtribuidoCents` e
    `investimentoSemAtribuicaoCents` — **derivados**, não alteram
    `investimentoCents`. Por desenho, reportado = atribuído + sem atribuição.
  - `totalizarCampanhas` particiona o gasto pelo MESMO corte de `custoPor`.
  - Extraído `temVinculoComCrm` (uma definição só, usada no motivo do custo e na
    reconciliação da verba).
- `src/components/admin/campanhas/resumo-campanhas.tsx`
  - `explicarDiferencaDeVerba` reusa a linguagem de `explicarDiferenca`, trocando
    leads por reais.
  - O cartão de verba nomeia a leitura oficial e mostra a vizinha.
- `src/components/admin/campanhas/tabela-campanhas.tsx`: rótulo/coluna `(Meta)`.
- `src/app/admin/(dashboard)/campanhas/page.tsx`: fallback de carregamento com os
  dois campos novos.

## Gate

- `pnpm vitest run src/components/admin/campanhas/` → **12/12 verde** (4 novos
  testes de investimento + os de rótulo/formato).
- `pnpm vitest run src/lib/admin/campanhas-queries.test.ts` → **17/17 verde**
  (2 novos: partição da verba e campanha só-Meta).
- `pnpm typecheck` → limpo.
- Sem smoke de browser (não pedido) e sem suíte inteira (regra do projeto).

## Regressão travada

Os dois rótulos aparecem, a vizinha é o gasto das campanhas com vínculo, a
diferença é a subtração exata das duas leituras e o total exibido continua sendo o
reportado pela Meta. Sem investimento, a tela diz a ausência — nunca "bateram".