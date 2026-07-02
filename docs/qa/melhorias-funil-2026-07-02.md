# Melhorias de produto/UX — Funil de leads (QA 2026-07-02)

> Achados que **funcionam como especificado** mas estão abaixo do potencial. NÃO são defeitos e
> **não** entram em onda de correção sem aval do Kairo (decisão de produto). Viés de negócio.

## M1 — "Funil de Conversão" mostra ocupação, não conversão
O card do dashboard rotula "Funil de Conversão" com % do topo, mas exibe **ocupação atual** por raia
(Novo 100% → Engajado 22% → Qualificado 67% → Proposta 39%). É **não-monotônico** (Qualificado > Engajado),
o que num funil de conversão real é impossível e passa a impressão de funil "quebrado".
- **Proposta:** mostrar **alcance cumulativo** — quantos leads **já passaram** por cada raia (via `lead_events`),
  que decai monotonicamente e é a leitura que um gestor espera de "taxa de conversão por etapa".
- **Por quê (negócio):** é a métrica que responde "onde perco lead?" — hoje o card não responde isso.

## M2 — KPIs zerados sem fechamentos
"Tempo Médio no Funil: 0 dias" e "Taxa de Conversão: 0%" quando nenhum lead chegou a fechado/perdido.
- **Proposta:** exibir "— (sem fechamentos no período)" em vez de `0`, que lê como "instantâneo/nada converte".

## M3 — Duas contagens de funil divergentes (41 × ~30)
Dashboard conta **41 leads (raw)**; kanban mostra **~30 (deduplicado por contato)**. Mesma palavra "funil",
números diferentes, sem explicação.
- **Proposta:** alinhar a base (contatos vs leads) ou rotular explicitamente cada visão ("41 leads" × "30 contatos").

## M4 — Deep-link para um lead não abre o painel
`/admin/pipeline?lead=<id>` carrega o board mas **não** abre o painel do lead. Perde o compartilhamento de link
direto pro card (útil pra passar um lead entre atendentes).
- **Proposta:** hidratar o painel a partir do query-param `lead` no load.

## M5 — Label WhatsApp truncado no gráfico "Canais"
No card "Canais" a barra do WhatsApp aparece como **"W.."** (truncado). Web fica inteiro.
- **Proposta:** encurtar responsivo ou abreviar consistente ("WA") em vez de cortar no meio da palavra.

## M6 — Cards anônimos poluem o funil
Leads com nome mas **sem** telefone/CPF (ex.: vários "Kairo" de testes) não deduplicam (por design) e enchem
"Novo" de duplicatas do mesmo testador.
- **Proposta:** em produção real isso é menor; considerar agrupar visualmente sessões anônimas do mesmo device
  (cookie `aja_uid`) ou um selo "anônimo" pra não inflar a contagem de "Novo".

---
Mockups conceituais podem ser gerados sob demanda (skill `mockup-conceitual`) se o Kairo priorizar M1/M3.
