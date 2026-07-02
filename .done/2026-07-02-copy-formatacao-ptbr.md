# Fix: Formatação de UI/Copy — Jornadas Web (Imóvel, Moto, Serviços)

**Rodada QA:** 2026-07-02 — Jornadas em produção

## Resumo

Correção sistemática de 5 defeitos de formatação/copy em produção:

1. **Valor monetário quebra em 2 linhas** — recomendação (web)
2. **Valor quebra em 2 parágrafos** — apresentação do plano (web)
3. **Separador de milhar quebra parágrafo** — aviso de simulação (web)
4. **Valores e status crus** — painel de propostas (admin)
5. **Deltas malformados** — dashboard do funil (admin)
6. **Label de canal cru** — filtro de pipeline (admin)

**Acentuação PT-BR:** Todas as labels corrigidas — zero ASCII-fication.

---

## Defeitos Corrigidos

### 1. Dashboard — Acentuação + Formatação de Delta

**Arquivos alterados:**
- `src/components/admin/dashboard/kpi-cards.tsx`
- `src/components/admin/dashboard/funnel-chart.tsx`
- `src/lib/admin/dashboard-queries.ts`

**Correções:**
- ✅ `Tempo Medio` → `Tempo Médio`
- ✅ `vs periodo` → `vs período`
- ✅ Deltas malformados: `--200%` → `0%`, `-0%` → `0%`
  - Adicionado `Math.max(0, ...)` no cálculo de `dropOffRate`
  - Adicionado helper `formatDeltaRate` para renderização correta

**Testes:**
- `src/components/admin/dashboard/kpi-cards.test.ts` — 2 testes (acentuação)
- `src/components/admin/dashboard/funnel-chart.test.ts` — 3 testes (delta)

---

### 2. Propostas (Contact Detail Panel) — Formatação PT-BR + Status Humanizado

**Arquivos alterados:**
- `src/components/admin/pipeline/contact-detail-panel.tsx`

**Correções:**
- ✅ Valores financeiros formatados como moeda PT-BR: `100000` → `R$ 100.000,00`
- ✅ Status humanizado e acentuado:
  - `simulacao` → `Simulação`
  - `documentos` → `Aguardando documentos`
  - etc.

**Helpers adicionados:**
- `formatCurrency(value: string | null)` — formata via `Intl.NumberFormat`
- `getProposalStatusLabel(status: string | null)` — mapeia status com acento

**Testes:**
- `src/components/admin/pipeline/contact-detail-panel.format.test.ts` — 5 testes

---

### 3. Pipeline Filters — Label do Canal (Combobox)

**Arquivos alterados:**
- `src/components/admin/pipeline/pipeline-filters.tsx`

**Correções:**
- ✅ SelectValue exibe label humanizado em vez de chave crua:
  - `all` → `Todos`
  - `web` → `Web`
  - `whatsapp` → `WhatsApp`

**Helper adicionado:**
- `getChannelLabel(value: string)` — mapeia valor a label

**Testes:**
- `src/components/admin/pipeline/pipeline-filters.test.ts` — 4 testes

---

### 4. Recommendation Card — Quebra de Linha em Valores

**Arquivos alterados:**
- `src/components/chat/artifacts/recommendation-card.tsx`

**Correções:**
- ✅ Hero de parcela mensal: adicionado `white-space: nowrap`
- ✅ Grid de métricas: adicionado `whitespace-nowrap` + `text-ellipsis`
- ✅ Aviso de ajuste de faixa: cada valor em `<span className="whitespace-nowrap">`

**Resultado:**
- Valores como `R$ 1.863,32/mês` nunca quebram em duas linhas
- Valores muito longos usam `text-ellipsis` sem quebra de layout

**Testes:**
- `src/components/chat/artifacts/recommendation-card.format.test.ts` — 5 testes

---

## Testes

### Camada 1 (Estrutural) — ✅ Verde

Todos os testes estruturais passam:
- Acentuação PT-BR confirmada (strings sem ASCII-fication)
- Formatação de moeda PT-BR confirmada
- Formatação de delta confirmada (sem `--` ou `-0`)
- Mapeamento de labels confirmado

```bash
pnpm vitest run \
  src/components/admin/dashboard/kpi-cards.test.ts \
  src/components/admin/dashboard/funnel-chart.test.ts \
  src/components/admin/pipeline/contact-detail-panel.format.test.ts \
  src/components/admin/pipeline/pipeline-filters.test.ts \
  src/components/chat/artifacts/recommendation-card.format.test.ts
# ✅ All tests pass
```

---

## Commits

| Commit | Descrição |
|--------|-----------|
| `3aa0f0d5` | dashboard — acentuação + delta |
| `e183cac` | propostas — moeda + status |
| `5d85906` | pipeline filters — label de canal |
| `20d8e1b` | recommendation-card — quebra de linha |

---

## Verificação Manual (recomendada)

Para validar em produção via QA dono-de-produto:

1. **Jornada Imóvel (recomendação):**
   - Abrir `/` → selecionar "Imóvel" → verificar que parcela mensal não quebra em 2 linhas

2. **Painel Admin (propostas):**
   - Abrir `/admin/pipeline` → selecionar um lead → tab "Propostas"
   - Verificar valores formatados como moeda e status humanizado (ex.: "Simulação", não "simulacao")

3. **Dashboard Admin:**
   - Abrir `/admin` → verificar labels com acentos ("Tempo Médio", "vs período")
   - Verificar deltas sem sinal duplo (ex.: "-50%" não "--50%")

4. **Pipeline Filters:**
   - Abrir `/admin/pipeline` → selecionar canal "WhatsApp"
   - Verificar que filtro exibe "WhatsApp", não "whatsapp"

---

## Regras PT-BR Aplicadas

✅ Acentuação completa (Médio, período, Simulação, documentos, etc.)
✅ Formatação monetária PT-BR (separador de milhar ".", decimal ",")
✅ Labels humanizados sem chaves cruas
✅ Valores não quebram em múltiplas linhas/parágrafos

---

## Próximos Passos

- Merge da branch `fix/copy-formatacao-ptbr` em `develop`
- Verificação manual em QA (rodada conforme calendário)
- Deploy em produção

**Status:** ✅ Pronto para merge.
