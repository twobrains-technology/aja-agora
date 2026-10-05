# Consultor profundo do negócio — como a leitura vira consultoria (plano de 05/10/2026)

> Plano produzido pelo subagente `planejador` (DeepSeek V4.1 Flash, só leitura) a partir do objetivo literal do
> dono, em 05/10/2026, e gravado aqui por quem tem escrita. A skill atualizada está em
> `~/.claude/skills/avaliar-produto-em-producao/SKILL.md`.

**Objetivo:** a skill `avaliar-produto-em-producao` deixa de responder de memória e passa a ser **consultora do
negócio**: cada frente do negócio tem um arquivo de base com fonte (link + data), e a análise de campanha da Meta
sai do **dado próprio** cruzado com a escada do funil.

**Resultado visível nesta semana:** 6 arquivos de frente criados, 1 métrica determinística (**custo por degrau**) e
1 leitura real das campanhas com o token.

---

## 1 · As frentes (as 6 estão em branco — são arquivos a criar)

| frente | o que responde | arquivo |
|---|---|---|
| Meta Ads | estrutura campanha/conjunto/anúncio, público, políticas, atribuição (CAPI, `ctwa_clid`), o que a Meta penaliza | `referencias/frentes/meta-ads.md` |
| Criativo | gancho, formato, copy, o que para o scroll, o que a Meta recusa | `referencias/frentes/criativo.md` |
| Site / landing | conversão da página, chat × formulário, o que faz a pessoa iniciar | `referencias/frentes/site-landing.md` |
| Tom de voz e venda por chat | como se escreve para vender, ritmo, objeção no texto | `referencias/frentes/tom-de-voz-venda.md` |
| Agente / fechamento | condução ao fechamento, contratação digital, onde a conversa morre | `referencias/frentes/agente-fechamento.md` |
| Mercado de consórcio | números do setor, prazos, taxas, administradoras | `referencias/frentes/mercado-consorcio.md` |

**Critério de frente madura** (mensurável): (a) ≥3 fontes externas com **trecho literal + URL + confiança + data**;
(b) ≥1 **número do nosso caso** medido que ancora a afirmação; (c) objeções e buracos declarados; (d) um parágrafo
"o que isso implica para o agente". Falta um → **frente imatura, e a skill não fecha conclusão em cima dela**.

## 2 · A rotina de aprendizado

Já escrita no `SKILL.md §Rotina` (passos 1–6): ler as frentes antes de opinar → ler o **recorrente** → puxar o dado
próprio (banco + Meta) cruzado com a escada → atualizar a frente via **subagente `researcher`** (2–4 queries,
trecho literal + URL + confiança + o que não achou) → escrever a leitura embasada → **devolver o aprendizado à
base**, com data.

O que falta **não é a rotina — é a base que ela lê.** Por isso o trabalho são as frentes, não reescrever a rotina.

## 3 · A camada de dados próprios (o que fecha a métrica)

- **Já existe:** `meta_insights_diarios` (`data, entity_id, nivel, spend_cents, impressions, clicks, leads,
  coletado_em` — `drizzle/0056_curved_the_professor.sql`, `schema.ts:1310`) e `meta_entities` (`entity_id, nivel,
  nome, parent_entity_id` — `:1258`). O fio anúncio→pessoa: `visits.campaign_id / adset_id / ad_id / ctwa_clid /
  ctwa_source_id / fbclid` (`schema.ts:367-372`).
- **Já existe no código:** `custoPor(...)` calcula **só** custo por qualificado (`campanhas-queries.ts:270-280`);
  `computeCustosDoCpc` soma investimento + custo de IA + mensagem (`performance-queries.ts:783-840`).
  **Não existe custo por degrau.**
- **O que falta:** generalizar para `custoPorDegrau(spendCents, contagensPorEtapa)` com as etapas reais do funil
  (`EtapaDoFunil`, `src/lib/experimentos/registro.ts:32-39`) — `visitas · conversas · com_contato · identificados ·
  qualificados · propostas · fechados`. O gasto vem do nível `campaign` (somar só `campaign`, senão sub-níveis
  entram duas vezes); o denominador, de `contagensDoFunil` (`sinais-do-funil.ts:363`) — **mesma definição de degrau
  das outras telas, nunca uma segunda contagem**.
- **A métrica que substitui "custo por lead":** `spend ÷ pessoas no degrau`. Custo por lead não diz nada porque
  "lead" no CRM hoje é conversa, e conversa de WhatsApp nasce identificada pelo canal (defeito AJA-29, já tratado).
  O corte que paga: qual anúncio traz gente que **sobe** de degrau.
- **Regra do dono respeitada:** investimento oficial é o da Meta; custo **não** se filtra por braço de teste (com
  recorte A/B o investimento sai `null` — `campanhas-queries.ts:241-243`).

## 4 · Lanes e ondas

**Caminho crítico: a leitura de produção (lane M)** — sem medição, as frentes estudam no vácuo.

- **Onda 1 (paralela):** `M` (leitura de campanhas, em produção) + `D` (código do **custo por degrau**, em
  `src/lib/admin/campanhas-queries.ts` + teste). Árvores disjuntas.
- **Onda 2 (paralela, research caro):** `F1` Meta Ads · `F2` Criativo · `F4` Tom de voz · `F5` Agente — as frentes
  que explicam o degrau que trava (oferta/contato) e o fechamento.
- **Onda 3:** `F3` Site/landing · `F6` Mercado de consórcio.
- **Onda 4:** `S` — `SKILL.md` indexa as 6 frentes e **corrige a instrução do token** (feito em 05/10).
- Sem corrente serial, exceto `S` depois de `F*`. **Mínimo viável** se faltarem agentes: `M + D + F4 + F5`.

## 5 · Não dividir / não fazer

- **`SKILL.md` é monólito e tem dono único** — nenhuma frente edita o SKILL.md.
- **`venda-de-consorcio.md` é o núcleo** e engorda por consulta, não por lane.
- **"Meta" e "Ads" são UMA frente**, não duas.
- **A lane D não se divide** em custo por conversa/oferta/contato: é a mesma função com denominadores diferentes.
- **Não abrir lane de "paper para cliente"** — isso é downstream da base; abrir agora vira consultoria
  megalomaníaca (a skill já produz o documento no padrão `relatorio-html`).

## 6 · Riscos

1. **Token — o SKILL.md contradizia o código.** O código (`src/lib/meta-ads/cliente.ts:13-14`) diz que o token
   mora no **vault** (cofre `tb-ai-general`) e chega ao container como `META_ADS_TOKEN_AJA`; a skill dizia
   `tb/prod/aja-agora/env`. **Corrigido na skill em 05/10**; falta conferir no vault.
2. **Permissão do token:** `cliente.ts:145` registra que token de System User pode não ter `ads_read` sobre
   `creative` — se faltar, a frente de criativo fica sem o dado do nosso caso.
3. **Base minúscula por degrau:** a própria cliente avisou ("pouquíssimas pessoas"). Custo por degrau profundo pode
   ter denominador 0–2 — a métrica **tem** que devolver motivo ("sem base"), nunca centavo inventado.
4. **Research sem disciplina vira opinião:** sem o gate (≥3 links + data + número nosso), o arquivo nasce como blog
   colado e a skill volta a responder de memória com verniz.
5. **Regra de comunicação** (`CLAUDE.md`): número ruim de mercado entra como **espaço de ganho**, nunca como limite;
   o §2.6 da base de consórcio é **interno**.
6. **A árvore da skill está fora do repo** (`~/.claude/skills/...`): sem PR, sem CI — o único gate é o comando, e
   ele tem que rodar de verdade.
7. **`computeCustosDoCpc` não pode ser tocado por D** sem revisão: é a fonte do CPC do painel e tem teste de recorte
   A/B (`custo-do-cpc.integration.test.ts`).

## 7 · O que depende de decisão do dono

- **(a)** Onde está o token da Meta e quem o lê — define a leitura de campanhas na rotina.
- **(b)** "Custo por degrau" vira **métrica de painel** (código) ou **só leitura da skill** (query)? Muda se a
  lane D existe.
- **(c)** Entrevistar 2 corretores de consórcio para o buraco "script **praticado**" — é o único buraco que só
  entrevista fecha.
- **(d)** Verba e aprovação de criativo pelo cliente (Bruna/Gustavo) — fora do repo.

## 8 · Ordem de execução (esta semana)

Hoje: **leitura das campanhas com o token** em paralelo com o **custo por degrau** (a camada de dados que faz a
skill parar de responder de memória sobre mídia), e no mesmo bloco **Meta Ads · Criativo · Tom de voz · Agente**.
Depois **Site · Mercado**. Por último o **índice no SKILL.md**. Mínimo viável: `M + D + Tom de voz + Agente`.