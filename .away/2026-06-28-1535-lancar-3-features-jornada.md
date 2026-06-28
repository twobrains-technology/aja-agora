# Away — Lançar 3 features da jornada (documentos, fechamento Trilho B, chat-mesa) via todo-blocks

- **Início:** 2026-06-28 15:35 · **Sessão:** aja-agora/develop
- **Critério de pronto:** 3 blocos especificados (cards FIX-NN + _bloco.md + _prompt.md) + base `integ/` criada + onda 1 disparada no Superset + (quando os blocos terminarem) integrados na base com gate verde (quarentena os que falharem). NÃO levar pra develop (decisão D1).
- **Status:** EM ANDAMENTO

## Objetivo
Lançar como blocos paralelos (todo-blocks) as 3 features alinhadas nesta sessão:
1. **Gestão de documentos do cliente** — S3 nosso (bucket dedicado+SSE-KMS) + tabela `client_documents` + aba Documentos no Kanban + despacho desacoplado. Design: `docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md`.
2. **Fechamento via Trilho B** — `BeviSelfContractProposalGateway implements ProposalGateway`, env `PROPOSAL_GATEWAY=selfcontract`, KYC steps + waitingForUniqueCode no self-contract-client; reusa a proposta de descoberta. Desbloqueia o fechamento (Trilho A travado pela AGX).
3. **Chat da mesa no Kanban → WhatsApp oficial** — `sendTemplate` (HSM), controle de janela 24h (`lastInboundAt`), chat bidirecional no lead-detail-panel, fluxo template-quando-janela-fechada. WhatsApp já é Meta Cloud oficial.

## Decisões

### D1 · 15:35 — develop=NÃO, onda=paralelo-com-stub (pergunta dispensada → fallback recomendada)
- **Contexto:** todo-blocks pergunta "levar a base pra develop?" e estratégia de onda. Kairo saiu; AskUserQuestion dispensada no Notch (sem resposta).
- **Decidi:** (a) NÃO levar pra develop — integro na base `integ/` e deixo pra revisão (3 features grandes, não-validadas E2E, com dependências externas). (b) Onda única paralela: fechamento-B consome o despacho de documentos via STUB com `TODO(bloco-a)` (nível 3); docs↔chat-mesa tocam schema/lead-detail em regiões diferentes (nível 2, merge mecânico).
- **Alternativas:** levar pra develop (arriscado sem revisão); faseado (serial, mais lento).
- **Reversibilidade:** fácil (a base não vai pra develop sem o Kairo).
- **Evidência:** fallback anti-trava do to-saindo §3.1.

## ⚠️ PENDENTE-KAIRO

### ⚠️ PENDENTE-KAIRO · 15:35 — `develop` local à frente do `origin` (push não chegou)
- **O que é:** 10 commits locais não-pushados na develop (revert FIX-79, matching, designs, ADR, cards). Você disse "push foi enviada", mas `git log origin/develop..develop` mostra 10 à frente.
- **Por que não fiz:** push de develop não foi pedido AGORA (você afirmou que já fez); a base do todo-blocks carrega esses commits pro remoto via a branch `integ/`, então a onda não fica bloqueada.
- **Como destrava:** `git push origin develop` (dev-safe, dispara deploy dev) quando quiser alinhar o remoto.

### ⚠️ PENDENTE-KAIRO · 15:35 — dependências externas das 3 features (código será implementado; o externo fica pra você)
- **Documentos:** bucket S3 dedicado + KMS key + policy de acesso mínimo (IaC, dev/prod). Molde: `aja-administradora-docs`. O bloco implementa o código (usa MinIO local em dev); a provisão prod é tua.
- **Chat-mesa:** template HSM precisa ser CRIADO/APROVADO na Meta Business pra reabrir janela. O bloco implementa `sendTemplate` + a lógica; o template aprovado é externo.
- **Fechamento B:** validar ao vivo o step de upload de doc do self-contract (portal CONEXIA/documentsToken) — o bloco implementa contra o cookbook + stub do despacho de docs; ajuste pós-validação.

## Linha do tempo
- 15:35 — to-saindo + todo-blocks ativados; mapas de documentos e WhatsApp concluídos; diário criado. Próximo: escrever specs (fechamento-B, chat-mesa) + estrutura todo-blocks (3 blocos, FIX-82+) + lançar onda 1.

## Relatório final (preencher ao encerrar)
- (pendente)
