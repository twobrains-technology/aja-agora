# TEST-PLAN — FIX-25: fechamento Bevi no WhatsApp (MC-5)

Fonte de verdade da jornada: `docs/jornada/jornada-canonica.md` passo 5 ("Contratar").
Gap: passo 5 é WEB-ONLY — no WhatsApp `contractFormToWhatsApp` degrada o card pra
texto pedindo CPF e a conversa morre; `startContract` tem ZERO referência em
`src/lib/whatsapp/`.

## Escopo

Construir a captura conversacional do passo 5 no canal WhatsApp: máquina de estado
`contractCollection` (espelho do `leadCollection`), interceptação do turno do
usuário (padrão `identify-capture.ts`), botões interactive de confirmação, disparo
de `startContract` no aceite, e terminal idêntico ao web (`contractClosed` +
"Parabéns" + resumo por WhatsApp).

## Invariantes de segurança (LGPD)

- **CPF NUNCA em claro** em log ou payload persistido. Identidade já coletada e
  cifrada no gate identify (FIX-9); `startContract` recebe o CPF só em memória, do
  `loadIdentity` (decrypt). O payload do `contract_form` no WhatsApp só carrega CPF
  **mascarado**. Nenhum `console.log` imprime CPF.
- Criar proposta = consulta de bureau → exige **aceite explícito**. Confirmação
  ambígua NÃO dispara `startContract` (re-pergunta).
- Defesa em profundidade (espelho FIX-12 web): sem `revealCompleted` o fechamento
  não cria proposta real.

## Critérios de aceite (binários)

### CA-1 — Início do fluxo guiado
Quando o `contract_form` é renderizado no WhatsApp com identidade on file, o canal
mostra mensagem de confirmação com botões `contract_confirm`/`contract_cancel`
(interactive), **não** o pedido solto de CPF. `meta.contractCollection.stage =
"confirm"`. PASS/FAIL.

### CA-2 — Aceite via botão dispara startContract 1x
Clique em `contract_confirm` → `startContract` chamado **exatamente 1 vez** com
input derivado do meta (segmento/valor/objetivo/lanceEmbutido/administradoraPreferida)
+ identidade do `loadIdentity`. Renderiza `real_offer` (botões offer_confirm/reject).
`contractCollection` limpo após disparo. PASS/FAIL.

### CA-3 — Aceite via texto livre também dispara
Com `contractCollection.stage="confirm"` ativo, usuário **digita** "sim, quero
contratar" → mesmo disparo de `startContract` (1x). Afirmativos cobertos:
sim/quero/confirmar/bora/pode/vamos/fechar. PASS/FAIL.

### CA-4 — Recusa
Clique `contract_cancel` OU texto "não"/"ver outras" → `startContract` **NÃO** é
chamado, `contractCollection` limpo, fluxo segue pra "ver outras opções". PASS/FAIL.

### CA-5 — Confirmação ambígua não cria proposta
Texto ambíguo ("e aí?", "quanto fica?") com `stage="confirm"` → `startContract`
NÃO chamado; re-pergunta a confirmação. PASS/FAIL.

### CA-6 — Idempotência (anti duplo-clique/duplo-envio)
Dois `contract_confirm` seguidos (ou clique + texto) → `startContract` no máximo 1x
por conversa pendente (EC-7 já garante reuso da proposta; `contractCollection`
limpo após 1º dispara faz o 2º no-op). PASS/FAIL.

### CA-7 — Identidade ausente (defensivo)
`contract_form` sem identityOnFile → `stage="cpf"`, pede CPF por texto; CPF válido
→ `storeIdentity` (cifrado) → segue pro disparo; CPF inválido → re-pede. CPF nunca
logado em claro. PASS/FAIL.

### CA-8 — revealCompleted guard
`fireContract` com `meta.revealCompleted !== true` → NÃO chama `startContract`,
limpa `contractCollection`, conduz de volta ao funil. PASS/FAIL.

### CA-9 — Terminal idêntico ao web
`offer_confirm` no WhatsApp → `confirmOffer` → `meta.contractClosed=true` +
reforço literal ("Você está contratando um consórcio da {admin}...") + signature +
document + "Parabéns! Agora você está oficialmente mais perto da sua conquista!" +
`sendContractSummary`. PASS/FAIL.

### CA-10 — DRY com o web
`buildStartContractInput(meta, {cpf,celular,lgpd})` é o módulo único que deriva o
input do `startContract`; web (route.ts) e WhatsApp consomem o MESMO helper.
PASS/FAIL.

## Regressão (3 camadas)

- **Camada 1** (estrutural, todo PR):
  - `src/lib/bevi/contract-input.test.ts` — derivação pura.
  - `src/lib/whatsapp/contract-capture.test.ts` — transições (confirm/cpf), aceite,
    recusa, ambíguo, idempotência, revealCompleted guard, **assert CPF nunca em
    claro** em payload/sends/log.
  - `src/lib/whatsapp/interactive-handlers.contract.test.ts` — botões + terminal
    `contractClosed`.
- **Camada 2** (cassette): `tests/regression/agent-trajectory.test.ts` →
  `FIX-25-FECHAMENTO-WHATSAPP` — replay form → confirmação → `startContract` 1x.
- **Camada 3** (nightly): cenário persona × WhatsApp estendido até o fechamento
  (fora deste PR — anotado).

## Dados de teste

Identidade cifrada exige `IDENTITY_ENC_KEY` (32 bytes base64) no env de teste.
`startContract`/`confirmOffer` injetados via dublê (`ProposalGateway` fake) — sem
chamada real à Bevi. Cassettes = streams determinísticos.
