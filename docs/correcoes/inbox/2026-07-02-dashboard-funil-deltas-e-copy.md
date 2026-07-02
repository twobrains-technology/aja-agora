# Bug — Dashboard do funil: deltas malformados ("--200%", "-0%") + copy sem acento

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto do FUNIL em **PRODUÇÃO** (https://ajaagora.com.br/admin)
- **Superfície:** `/admin` (Dashboard) — cards de KPI + card "Funil de Conversão".
- **Severidade:** média — é a tela executiva do funil; números quebrados corroem confiança em dado de negócio.

## Cenário (reproduzível)
1. Logar no `/admin` → Dashboard (Período 30d, dados reais de prod: 41 leads).
2. Observar o card **"Funil de Conversão"** e os KPIs do topo.

## Achados (com evidência — `_evidencia/funil-dashboard.png`)

### A) Deltas do funil malformados (DEFEITO principal)
Sob cada raia do "Funil de Conversão" há um delta "vs período anterior" que renderiza **lixo de formatação**:
`-78%` · **`--200%`** (sinal duplo) · `-100%` · **`-0%`** · `-100%` · `-0%` · `-0%` · `-0%`.
- **Esperado:** um percentual válido e legível por raia (ex.: `−200%` com um único sinal; e `0%` sem `-` na frente).
- **Atual:** `--200%` (dois sinais de menos concatenados) e `-0%` (menos-zero, sem sentido). Confirmado por
  `document.querySelectorAll` — strings literais `"--200%"` e `"-0%"` no DOM.
- **Causa provável (a confirmar no código):** o formatador do delta prefixa `-` a um valor que já vem
  negativo, e não zera o sinal quando o valor é 0. Prov. em `src/components/admin/dashboard/funnel-chart.tsx`
  (ou no cálculo de delta em `dashboard-queries.ts`). Verificar antes de corrigir.

### B) Copy sem acento (DEFEITO — regra inviolável de PT-BR)
- KPI **"Tempo Medio no Funil"** → deve ser **"Tempo Médio no Funil"** (falta o é).
- Legenda **"vs periodo anterior"** (aparece nos 4 KPIs) → **"vs período anterior"** (falta o í).
- Prov. em `src/app/admin/(dashboard)/page.tsx` / componentes de KPI do dashboard.

## Observações secundárias (candidatas — ver card de melhorias)
- **"Funil de Conversão" não-monotônico:** Novo 18 (100%) → Engajado 4 (22%) → Qualificado 12 (67%) →
  Proposta 7 (39%). Qualificado 67% > Engajado 22% é impossível num funil de conversão real — o gráfico
  mostra **ocupação atual por raia como % do topo**, não conversão-através. Confunde. (melhoria de métrica)
- **"Tempo Médio no Funil: 0 dias"** e **"Taxa de Conversão: 0%"** — zerados porque nenhum lead chegou a
  `fechado_ganho`/`perdido` (avg calculado só sobre terminais em `dashboard-queries.ts:70,112`). Melhor
  mostrar "—/sem fechamentos" que "0 dias". (melhoria)
- **"Volume de Leads"** aparenta **vazio** apesar de 41 leads no período (SVG recharts com 2 paths, 0 dots
  visíveis). **A confirmar** — pode ser linha achatada por bug de escala. (plausível)

## Regressão sugerida (Camada 1 — não-agêntico, é dashboard/query pura)
- Teste do formatador de delta: entrada negativa → **um** sinal; entrada 0 → `"0%"` (sem `-`).
- Teste dos labels do dashboard: strings contêm "Tempo Médio" e "vs período anterior" (com acento).
