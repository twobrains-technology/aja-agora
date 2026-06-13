---
id: FIX-14
titulo: "Tool de STATUS da proposta no agent (pedido explícito do Kairo)"
status: done
bloco: bloco-b-status-tool
arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/agents/builder.ts
  - src/lib/bevi/proposal-status.ts (novo)
  - src/lib/bevi/proposal-status.test.ts (novo)
  - src/lib/agent/proposal-status-tool.structural.test.ts (novo)
  - tests/regression/agent-trajectory.test.ts
  - tests/eval/agent-flow.eval.test.ts
rodada: 2026-06-05 tarde (re-teste pós-lote-1)
anotado_em: 2026-06-05
commit: 2b3b7c7
executado_em: 2026-06-05
---

# FIX-14 — Tool de STATUS da proposta no agent (pedido explícito do Kairo)

### O que o Kairo pediu (palavras dele)

> "Aí nesse caso, tem que ter uma tool ali que busca também o status, entendeu? Porque
> senão não faz sentido. O usuário tem que, quando ele perguntar sobre o status no
> chat, conseguir obter a informação que ele precisa. Já cria mais essa correção aí ou
> essa feature — deixa anotado pra gente implementar daqui a pouco."

Promove o "defeito D" do FIX-11 de "responder do estado salvo" para **consulta REAL**:
o usuário pergunta "qual status da proposta?" → o agent consulta a Bevi ao vivo e
responde com o estado verdadeiro.

### Design proposto

- **Tool nova `check_proposal_status`** em `tools/ai-sdk.ts` (sem input do modelo —
  zero chance de id alucinado): `execute` resolve `getLatestBeviProposal(conversationId)`
  → `gateway.getStatus(proposalId)` (`consult_proposal_status_bevi_consorcio`, já
  implementado e validado na POC de hoje) → retorna estado ESTRUTURADO real.
- **Tradução leiga server-side** (regra D11 — números/estados decididos pelo servidor,
  modelo só narra): mapa `systemicValue → mensagem pro usuário`, ex.:
  - `waitingForUniqueCode` → "Sua proposta está na fila da administradora — te aviso
    assim que ela entrar."
  - `documentoPessoal`/`endereco`/`comprovanteDeEndereco` → "Falta completar X" (e o
    agente oferece completar — ponte com a feature jornada-ate-boleto)
  - `integrationCode` preenchido → "Sua proposta entrou na administradora (nº {code})"
  - `approvedAt`/`reprovedAt` → aprovada/reprovada
  - estado desconhecido → repassar `statusName` da Bevi com honestidade (sem inventar)
- **Sem proposta na conversa** → tool responde "nenhuma proposta criada ainda" (o
  modelo não deve chamá-la pré-fechamento; se chamar, a resposta é segura).
- **Erros** (404/timeout/token) → mensagem honesta "não consegui consultar agora",
  nunca estado inventado.
- **Última transição** do `changesHistory` incluída no retorno (a POC provou que é
  confiável) — permite "desde ontem está em X".
- Prompt: regra no system prompt — pergunta de status/andamento → SEMPRE chamar
  `check_proposal_status`; PROIBIDO responder status de memória ou re-buscar grupos.

### Dependência

**Implementar JUNTO com o FIX-11** (persistência das mensagens + estado terminal no
prompt + guard anti-descoberta): a tool responde a pergunta, mas sem o FIX-11 o agent
continua amnésico no restante do turno. FIX-11 A-C + FIX-14 = o pacote que mata o
cenário do print por completo. (O FIX-11 "defeito D curto prazo" fica absorvido por
esta tool.)

### Regressão exigida

- Camada 1: tool registrada em `active_tools`; execute chama `getStatus` com o
  proposalId da CONVERSA (nunca input do modelo); mapa de tradução cobre os 10 estados
  conhecidos (sorts 1-10) + fallback honesto.
- Camada 2: cassette `FIX-14-STATUS-VIA-TOOL` — pergunta de status com proposta ativa
  → modelo chama `check_proposal_status` (e NÃO search/recommendation); resposta
  contém o estado traduzido.
- Camada 3: cenário no eval — "qual status da proposta?" pós-fechamento responde com
  estado real e zero re-descoberta.
