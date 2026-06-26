# Dossiê — Validação dos endpoints Conexia/Bevi (fechamento de consórcio)

> 2026-06-26 · Pergunta do Kairo: o fechamento parou de funcionar — **é a Bevi que mudou ou
> fomos nós que mudamos as chamadas?** Validado por curl ao vivo contra homologação +
> comparação com a doc oficial atual (Postman) e com as capturas de 2026-05-27.

## TL;DR — VEREDITO: é a BEVI/AGX, não nós

O `calculate_simulation_bevi_consorcio` rejeita **toda** proposta com **400 "Proposta não
pertence ao Bevi Consórcio"** — mesmo a proposta que o próprio `insert_proposal` acabou de
criar com o productId que a **doc oficial atual** documenta como Consórcio (`6986245b…`). A
mesma chamada **funcionava em 2026-05-27** (captura real na spec). Não é nosso código: o erro
é idêntico com o body do app E com o body **exato da doc oficial**. Há uma inconsistência do
lado da Bevi — o productId/proposta não está vinculado ao produto "Bevi Consórcio" na conta do
token. **Ação: contatar Bevi/AGX** (PENDENTE-KAIRO).

## Endpoints — estado ao vivo (homologação, token `rp3rmx…`)

| # | service_id | Resultado | Nota |
|---|---|---|---|
| 1 | `insert_proposal_bevi_consorcio` | ✅ **201** (com `ignoreOngoingProposals:true`) | cria proposta, retorna productId `6986245b…` |
| 1b | idem com `ignoreOngoingProposals:false` | ❌ **500 "Erro interno"** | mesmo com CPF limpo (sem proposta) — `false` dá 500 sempre |
| 2 | `list_segments_bevi_consorcio` | ✅ **200** | mas é ESTÁTICO (não valida a proposta — controle com proposalId fake deu "obrigatório") |
| 3 | `calculate_simulation_bevi_consorcio` | ❌ **400 "Proposta não pertence ao Bevi Consórcio"** | **o bloqueio real** |
| 7 | `consult_proposal_status_bevi_consorcio` | ❌ **400 "Proposta não pertence ao Bevi Consórcio"** | confirma: é a PROPOSTA que a Bevi não reconhece como consórcio |

## Prova de que NÃO é nosso código (testes de isolamento)

Todos os caminhos abaixo dão o **mesmo** "Proposta não pertence ao Bevi Consórcio":
1. simulate **COM** `productId` (código atual, pós-FIX-79) → "não pertence"
2. simulate **SEM** `productId` (igual captura 2026-05-27 que funcionava) → "não pertence"
3. simulate **exato da doc oficial atual** (sem productId, sem lanceEmbutido, só temEmbutido) → "não pertence"
4. proposta de **CPF com proposta ongoing** (`ignoreOngoingProposals:true`) → "não pertence"
5. proposta de **CPF novo, limpo, sem ongoing** → "não pertence"

→ Independe de productId, de lanceEmbutido, de CPF, de ongoing proposals. O `insert` cria a
proposta com productId `6986245b`, mas o serviço de consórcio diz que ela **não é consórcio**.

## Comparação: doc oficial ATUAL (Postman) × nosso código

Doc: <http://documenter.getpostman.com/view/21482937/2sBXwmQsof> ("Bevi Consórcio — API de Parceiro").

**Inserir proposta** — IGUAL ao nosso código (mesmo productId `6986245b…`, mesmos campos
UPPERCASE, `ignoreOngoingProposals`). Sem divergência.

**Simular** — 2 divergências NOSSAS (não causam o "não pertence", mas devem ser alinhadas):
| Campo | Doc oficial atual | Nosso código (`bevi-api-adapter.ts:140-167`) |
|---|---|---|
| `productId` | ❌ não tem | ✅ manda — **FIX-79 (commit e2436990) adicionou indevidamente** |
| `lanceEmbutido` | ❌ não tem (só `temEmbutido` bool) | ✅ manda `"nenhum"` |

O resto (`propostaId`, `segmento`, `tipoSimulacao`, `valor`, `objetivo`, `temEmbutido`,
`temLanceParaOfertar`, `valorDoLance`) bate.

**Fluxo:** a doc lista 1 inserir → 2 listar segmentos → 3 simular, SEM passo intermediário —
igual ao nosso código. Não falta passo do nosso lado.

## Conclusões

1. **Causa-raiz do bloqueio = Bevi/AGX.** O productId `6986245b…` (documentado e aceito no
   insert) não está vinculado ao produto "Bevi Consórcio" na conta do token `rp3rmx…`. Há
   inconsistência interna da Bevi entre `insert` (cria com qualquer productId) e `simulate`
   (valida pertencimento). Funcionava em 27/05 → algo mudou do lado deles. **PENDENTE-KAIRO:
   contatar Bevi/AGX** — reativar/corrigir o vínculo do produto Consórcio nessa conta, ou
   informar o productId correto atual.
2. **FIX-79 foi diagnóstico ERRADO** (achado nosso, acionável independente da Bevi). Adicionar
   `productId` no `simulate` (commit e2436990) não resolve nem causa o erro — e DIVERGE da doc
   oficial, que não tem productId no simulate. Deve ser revertido pra alinhar o body à doc.
   Junto: tirar/avaliar o `lanceEmbutido` (a doc atual não o lista).
3. **`ignoreOngoingProposals:false` → 500** é comportamento da Bevi (não bug nosso) — o app já
   usa `true` (`fulfillment.ts:82`), então não afeta o app; mas a doc usa `false`.

## Próximos passos
- [ ] **Kairo/externo:** confirmar com Bevi/AGX o vínculo do productId `6986245b…` ↔ produto
      Consórcio na conta do token (ou o productId correto). Sem isso, o fechamento (passo 5)
      fica bloqueado por causa deles.
- [ ] **Nosso (bloco/fix):** reverter o `productId` do `simulate` (FIX-79) + alinhar o body do
      simulate à doc oficial (remover `lanceEmbutido` se confirmado dispensável). TDD: cassette
      do contrato do adapter contra a doc atual.
- Evidência viva: testes curl nesta sessão (2026-06-26), homologação.
