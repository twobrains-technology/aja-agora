# Coerência de origem: skill × dashboard (a mesma régua)

Prova lado a lado, no MESMO recorte: sexta 02/10 00:00 BRT → 05/10/2026 ~08:40 BRT.
Fontes: API da dashboard (`/api/admin/performance?from=2026-10-02&to=2026-10-06`)
e `~/.claude/skills/avaliar-aja-agora-producao/scripts/cruzamento-midia.sh`.

## O contrato (uma régua só)

Ordem de precedência, idêntica nas duas pontas (`src/lib/admin/origem-label.ts`):

1. `utm_source` presente → **campanha**
2. `ctwa_source_id`/`ctwa_headline` → **click-to-WhatsApp**
3. `referrer` do NOSSO domínio (com/sem `www`, sem o "a", com porta) → **navegação interna**
4. `referrer` de terceiro → **referência externa**
5. nada disso → **direto** (declarado, nunca inferido)

## A medição

| balde | dashboard ANTES do #155 | régua correta (skill) | dashboard DEPOIS do #155 |
|---|---|---|---|
| visitas | 312 | 320 (a tela exclui 8: bot/duplicata da janela) | 312 |
| campanha | 80 | 86 (6 com `campaign_id` sem `utm_source`) | 80 |
| click-to-WhatsApp | 0 | 0 | 0 |
| navegação interna | — (não existia o balde) | **160** | entra em Direto por decisão de produto |
| referência | **161** ✗ (88 + 49 + 12 + 6, todos o nosso domínio) | **3** (2 google + 1 app Android) | **3** ✓ (2 google + 1 app Android) |
| direto | 71 | 71 | **229** (71 + os 158 de navegação interna) |

E o achado que motivou tudo: **3 dos 5 telefones do período estavam pendurados em
"Referência · ajaagora.com.br"** — uma origem que não existe.

## O que ficou diferente e por quê (as 3 divergências que sobram, explicadas)

1. **Visitas: 312 × 320.** A tela exclui 8 chegadas (bot/duplicata dentro da
   própria janela). Não é erro de régua: é filtro de robô/eco que a tela aplica e
   o SQL cru não aplica. A skill passa a declarar isso.
2. **Campanha: 80 × 86.** A tela exige `utm_source`; 6 chegadas têm
   `campaign_id` (o id da Meta, gravado pelo #154) sem UTM. As duas leituras são
   defensáveis — a tela mostra o que o anunciante declarou, o id mostra o que a
   Meta confirmou. Fica registrado como diferença conhecida, não como erro.
3. **Referência: 161 × 3.** Esta era o DEFEITO (PR #155, `ehNavegacaoInterna`).
   Corrigida: o nosso domínio cai em Direto/navegação interna, referência de
   terceiro continua Referência. Teste cobre 10 formas do nosso domínio (com
   `www`, sem o "a", portas `:2052 :2082 :2086 :2095 :8080 :8880`, caixa alta,
   com esquema) e 5 de terceiro (google, instagram e outros).

## Verificação — CONCLUÍDA em 05/10/2026

Deploy do #155 verde (workflow 37274040730, `success`). A mesma chamada da API
devolveu:

```
por tipo: {'direto': 229, 'campanha': 80, 'referencia': 3}
referencia: www.google.com 2  |  android-app 1
```

O `referencia` caiu de **161 para 3** — e as três que sobraram são referência de
verdade (Google e o app de busca do Android). O `direto` subiu de 71 para **229**,
absorvendo os 158 de navegação interna, como decidido. Os **3 telefones** que
estavam pendurados em "Referência · ajaagora.com.br" agora aparecem em Direto —
que é a verdade: vieram de quem chegou sem anúncio.
