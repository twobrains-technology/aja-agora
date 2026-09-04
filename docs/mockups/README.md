# Mockup — One-page de acompanhamento de performance

**Abra `one-page-performance.html` no navegador.** Três abas:

1. **One page** — a tela principal. A **dobra cabe em uma tela** (958px de 1299px): frase de estado, 3 alertas, 4 KPIs, funil em linha, público × pipeline por origem e a fila de quem espera ação. Abaixo da linha tracejada vem o aprofundamento, para quem quer detalhe: funil completo, placar agente × mesa, criativo a criativo e a leitura de negócio em bullets.
2. **Diário** — o que rolou ontem contra a média dos 7 dias anteriores, com as conversas do dia uma a uma. É o formato que vira e-mail das 8h.
3. **Racional & PRD visual** — de onde sai cada número, o algoritmo do funil passo a passo, as contas explícitas, o que falta construir e em que ordem.

**Todos os registros de teste da equipe estão fora** de todos os números (filtrados por identidade da vitrine e por nome do operador).

## Como foi feito

O conteúdo passou por quatro etapas, nesta ordem:

1. **Catálogo** — levantamento do que o produto é capaz de medir hoje: schema do banco, observabilidade (Langfuse), aquisição/atribuição (Meta CAPI, UTM, mapa de calor) e as telas de métrica já existentes.
2. **Extração real** — consultas ao Postgres de produção, aplicando a regra canônica do próprio produto (`VISITA_CONTAVEL` de `src/lib/admin/sinais-do-funil.ts`), nunca uma regra inventada para o mockup.
3. **Duas propostas independentes** — um analista de negócio (rigor, unit economics) e um SDR de campanha (o que faz vender). Ficaram em `_proposta-analista.md` e `_proposta-sdr.md`.
4. **Crítica de direção** — um diretor com viés de negócio cortou de 5 KPIs para 4, de 9 alertas para 3, eliminou blocos que não disparavam decisão e apontou o que faltava nas duas.

## Arquivos

| Arquivo | O que é |
|---|---|
| `one-page-performance.html` | **O entregável.** Autocontido, abre offline. |
| `dados-prod.json` | O dataset real extraído de produção. |
| `briefing-prod.md` | Os números com o método de apuração e os achados de verificação. |
| `catalogo-capacidades.md` | Tudo que o produto mede hoje, e as lacunas. |
| `_proposta-analista.md`, `_proposta-sdr.md` | As duas propostas antes da crítica. |
| `_*.html`, `_*.css`, `_*.js`, `_build.py` | Fontes do mockup. Rode `python3 _build.py` para regerar o HTML. |

## Achados de produção que saíram deste trabalho

1. **Defeito ativo:** o filtro anti-eco de `VISITA_CONTAVEL` descarta 19 visitas **que geraram conversa**, escondendo 22 conversas e 8 leads da atribuição por campanha — e fazendo a campanha de melhor conversão da conta (24,2%) aparecer com zero.
2. **20% do pipeline é teste interno** feito em produção com o documento da casa, e a flag `is_simulated` não pega isso.
3. **4 dos 5 handoffs "em andamento"** têm o lead já encerrado — um alerta ingênuo de "5 clientes esperando" seria falso em 4 dos 5 casos.
4. **28 leads quentes parados há 11–15 dias**, todos já alertados por e-mail de SLA. O aviso funciona; o que falta é uma tela que cobre.
5. **28 de 45 eventos `chat_iniciado` falham na Meta** por falta de dados do cliente — o algoritmo de campanha otimiza sem retorno.
6. **Anúncio pago = 54% do público e 0% do pipeline.** Todo o R$ 1,47 milhão em cartas na rua saiu de tráfego que não custou nada.
7. **Nenhum criativo do Instagram pago gerou uma conversa** (9 anúncios, 1.847 pessoas) — e todos veem menos de 0,5 seção da página. O mesmo Instagram **orgânico** (`link_in_bio`) converte 39,4%.
8. **"Seções vistas por visita" é um indicador antecedente**: abaixo de 0,5 nenhum criativo converteu; acima de 1,3, todos converteram. Dá para reprovar um anúncio em 24 h.

## Pendência conhecida

O filtro de registro de teste é feito **por fora** (identidade da vitrine + nome). A solução correta é um campo de contato interno no cadastro — a flag `is_simulated` só cobre o simulador, não o teste feito em produção.
