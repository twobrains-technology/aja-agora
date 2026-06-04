---
title: Jornada canônica do cliente com dados reais Bevi — mock destruído
date: 2026-06-04
status: needs-validation
project: aja-agora
session_duration: ~5h (auditoria + reconstrução)
tags: [jornada, bevi, lgpd, eval, qa]
---

# Jornada canônica + Bevi real (mock destruído)

## 1. Pitch

A jornada do Aja Agora agora segue a visão do cliente (jornada.docx) como regra — e **todo número que o usuário vê vem de oferta real da Bevi**, nunca mais de dados fictícios. O simulador de contemplação (conceito do Bernardo) entrou no caminho padrão da conversa, e a qualidade da experiência passa a ser julgada toda noite por um avaliador de IA contra o próprio documento do cliente.

## 2. Problema que resolveu

O relatório anterior (2026-06-03) declarou a jornada "fiel ao docx e aprovada pelo QA" — e o dono reprovou tudo: os passos 3-4 mostravam **82 grupos fictícios de um JSON** (o usuário nunca via uma oferta real), o simulador prometido no documento não aparecia, o valor do lance nunca era perguntado, e o "QA crítico" validava critérios derivados da própria implementação, não do documento do cliente. Custo de não corrigir: piloto apresentando números falsos a clientes reais — risco direto de credibilidade e de quebra da parceria com a Bevi.

## 3. Solução entregue

- **Toda descoberta vem da Bevi real**: grupos, parcelas, taxas e cenários de lance saem das ofertas do trilho self-contract da administradora — o diretório de mock foi deletado e há trava automática contra reintrodução.
- **Identidade no momento certo**: a Bevi exige CPF antes de simular; a jornada coleta CPF+celular+aceite LGPD ao fim do passo 2, no gancho do próprio docx — e o CPF só existe **cifrado** (AES-256-GCM), nunca em claro.
- **Passo 4 como o cliente desenhou**: plano recomendado primeiro e em destaque; oferta do simulador "contemplado em 3, 6 ou 12 meses — que tal?" feita sempre; aceite abre o simulador-agulha do Bernardo; "quero ver outras opções" mostra as outras 2 ofertas reais na hora.
- **"Qual valor aproximado?" do lance** agora é perguntado ao usuário (faixas de 10/20/30/40% da carta) — antes era assumido silenciosamente.
- **Juiz de IA noturno**: um avaliador (Claude Sonnet) lê a conversa inteira e dá nota por passo do docx + tom + fechamento-em-contrato, com limiares que reprovam drift.

## 4. Por que importa

- **Confiança no número**: administradoras reais (ITAÚ, ÂNCORA, Banco do Brasil, RODOBENS…) com parcela, prazo e taxa de verdade — pré-requisito pra qualquer conversão honesta.
- **Visão do cliente vira contrato de qualidade**: QA e eval validam contra `docs/jornada/jornada-canonica.md`, não contra o que foi implementado — o defeito da rodada anterior fica estruturalmente impossível de repetir em silêncio.
- **LGPD por desenho**: CPF cifrado com chave fora do banco, coleta com aviso e aceite explícito, e a régua "fixtures só em teste" protege a parceria.

## 5. Arquitetura — visão de 1 minuto

```
Usuário ── chat (web/WhatsApp)
   │  passo 2: qualificação + CPF cifrado (gate identify)
   ▼
Descoberta REAL ─ adapter por conversa → Bevi self-contract (ofertas ricas)
   │  passo 3-4: recomendado em destaque → simulador do Bernardo → decisão
   ▼
Fechamento ─ API de Parceiro Bevi (proposta → assinatura → documentos)
```

- O sistema antigo de fechamento (passo 5) ficou intacto; a descoberta foi **substituída** (mock deletado, sem fallback fictício — sem credencial, falha alto e claro).
- Cada conversa tem sua própria sessão Bevi com cache de ofertas (resposta <3s).
- Testes e evals usam **capturas reais gravadas** da loja-piloto via seam de teste — nunca tocam a Bevi de verdade.

## 6. Qualidade entregue

- **Suíte determinística: 1.006 testes verdes** (estrutural + integração + 33 cenários de regressão de agente), rodando em todo commit via pre-commit hook.
- 5 blocos novos de regressão na Camada 2 travam exatamente os defeitos da auditoria: `MOCK-RUNTIME-MORTO`, `GATE-IDENTIFY`, `GATE-SIMULATOR-OFFER`, `REVEAL-ORDER`, fixtures do trilho B.
- Cripto de identidade com testes de DV de CPF, roundtrip, chave ausente (falha alto) e detecção de adulteração.
- Eval nightly ganhou o **LLM-as-judge** com rubric por passo do docx (antes: só regex — incapaz de julgar tom/experiência).
- TypeScript e lint limpos nos arquivos tocados; 6 commits `test+feat:` com teste falhando antes do fix em cada um.

## 7. Decisões de arquitetura registradas

- `docs/jornada/jornada-canonica.md` — a jornada do cliente como regra (fonte: jornada.docx)
- `docs/jornada/CONTEXT.md` — decisões D1-D4 (CPF antecipado, mock morto, ambiente, judge) + estado e pendências
- `docs/jornada/proposta-simulador.md` — proposta do simulador aguardando o Bernardo
- `CLAUDE.md` (seção "REGRAS DE PRODUTO") — invioláveis: docx é regra, mock proibido, QA valida contra o docx

## 8. Riscos identificados e como tratamos

- **E2E contra a Bevi real cria proposta de verdade** (CPF + consulta de bureau) → bloqueado deliberadamente até a Bevi fornecer loja de homologação ou CPF de teste (pendência D3); testes usam capturas reais gravadas.
- **"1 proposta ativa por device"** na Bevi: o transporte do fingerprint não aparece nas capturas — conversas concorrentes podem colidir. Tratado como retomada não-fatal no client + validação ao vivo pendente (D3).
- **Latência da Bevi no chat** → cache de ofertas por conversa + retry do 404 transitório do step de simulação.
- **CPF em banco** → nunca em claro; AES-256-GCM com chave exclusiva fora do banco; mascaramento pra exibição.
- **Drift de comportamento do modelo** → judge noturno com limiares por dimensão + flags (pulou passo, fechou em lead, jargão, meta-narrativa).

## 9. O que ainda fica em aberto

- **E2E em tela contra a Bevi real: NÃO executado** — bloqueado pela pendência D3 (decisão externa com a Bevi). O plano de teste do PO Lead marca o que está bloqueado vs executável.
- **Fluxo de caixa mês a mês** (docx passo 4): não implementado — aguarda o desenho com o Bernardo (`proposta-simulador.md`).
- **Passo 5 re-pede CPF** no formulário de contrato mesmo já coletado no passo 2 — refinamento de UX pendente.
- **WhatsApp**: descoberta funciona (captura textual de CPF), mas o fechamento (proposta→assinatura) segue web-only (gap MC-5 pré-existente).
- **Ambientes**: dev/staging precisam de `BEVI_SELFCONTRACT_HASH`, `IDENTITY_ENC_KEY` e `BEVI_API_TOKEN` — não existe mais modo mock.

## 10. Próximos passos sugeridos

1. **Destravar D3 com a Bevi** (homologação/CPF de teste) → roda o E2E completo do plano do PO Lead.
2. **Sessão com o Bernardo** sobre a proposta do simulador → libera o fluxo de caixa mês a mês e os refinos do dial.
3. Configurar os 3 envs novos nos ambientes (local → dev → prod) e validar a primeira jornada real ponta a ponta.
4. Pré-preencher o passo 5 com a identidade já coletada.

## 11. Métricas da sessão

- 6 commits (`306e36d..6aea8f5` + Fase 5), ~60 arquivos tocados
- 1 diretório de mock deletado (adapter + 3 JSONs fictícios); 0 referências de mock em runtime (verificado por teste)
- Suíte: 993 → 1.006 testes (novos: identity, gates, adapter Trilho B, rubric/judge, 5 blocos de regressão)
- Auditoria adversarial prévia: 5 agentes, ~452k tokens — achados viraram os critérios desta reconstrução
