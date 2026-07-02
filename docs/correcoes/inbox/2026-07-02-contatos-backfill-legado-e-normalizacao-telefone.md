# Bug (PLAUSÍVEL) — Contatos: leads legados sem contactId + telefone WA×web não casa

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto do FUNIL em **PRODUÇÃO** (via `/api/admin/leads`)
- **Superfície:** fundação "cliente unificado" (`contacts`, `resolveContact`, backfill migrate-guard, `normalizePhoneBR`).
- **Severidade:** a-confirmar (média se confirmado) — ataca o **valor-título** da refatoração do funil (dedup + visão cross-channel).
- **⚠️ DÚVIDA ABERTA:** `postgres-prod` estava inacessível (ETIMEDOUT) nesta rodada — evidência é da **API do admin**,
  não do DB. Confirmar no banco antes de tratar como fato.

## Evidência (payload `/api/admin/leads`, 30 leads deduplicados)
1. **Corte temporal claro no `contactId`:**
   - Leads com `phone` **e** `contactId` = todos os **mais recentes** (WhatsApp 26/06–01/07; web recentes).
   - Leads com `phone` mas `contactId: null` = **9**, **todos criados entre 13/06 e 25/06** (Bruna, Paulo,
     Juvenal, Diego, Kairo — vários web).
   - **Hipótese:** a feature de `contacts` passou a resolver contato só para leads **novos**; o **backfill**
     prometido (proposta Parte 1: "agrupa leads/conversations existentes por telefone normalizado… religa as FKs")
     **não religou os leads legados**. Efeito: visão de contato fragmentada + duplicatas no funil sem chance de dedup.

2. **Normalização de telefone divergente entre canais:**
   - WhatsApp grava `6292496793` (10 dígitos, **sem** o 9). Web grava `62992496793` (11 dígitos, **com** o 9).
   - Mesmo número real, strings diferentes → risco de **não unificar** WA×web a mesma pessoa (gerar 2 contatos).
   - **A confirmar:** se `resolveContact`/`normalizePhoneBR` reconcilia o 9º dígito. Se não, F5 (unificação
     cross-channel) quebra até para leads novos.

## Impacto no funil (o que o usuário/admin vê hoje)
- Mesma pessoa de teste aparece como vários cards com nomes distintos (ex.: telefone `62992496793` = Diego +
  Kairo ×2 + Diego em raias diferentes) porque os leads legados têm `contactId: null` → não deduplicam.

## Próximos passos (verificação barata quando o DB estiver acessível)
- `SELECT count(*) FROM leads WHERE contact_id IS NULL AND phone IS NOT NULL;` e cruzar com datas.
- Conferir se o backfill (migrate-guard) rodou em prod e se cobre leads pré-feature.
- Conferir `normalizePhoneBR`: `6292496793` e `62992496793` resolvem pro mesmo contato?

## Regressão sugerida
- Camada 1: `normalizePhoneBR('6292496793') === normalizePhoneBR('62992496793')` (reconcilia o 9º dígito).
- Integração: backfill religa lead legado com telefone a um `contacts.id` (não deixa `contactId` null quando há phone).
