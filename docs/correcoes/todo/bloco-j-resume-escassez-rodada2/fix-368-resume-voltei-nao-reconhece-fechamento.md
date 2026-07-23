---
id: FIX-368
titulo: "Turno 'Voltei' pós-fechamento não reconhece a proposta fechada nem direciona pro WhatsApp"
status: inbox
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/agents/index.ts (deriveContractClosedInfo — sem mudança de dado, só de consumo)
  - src/components/chat/theater/theater-chat.tsx (contexto — NÃO é o bug)
rodada: 2026-07-22 — campanha vendedor-matador-consorcio (loop-de-goal), rodada 1, veredito do juiz
---

## Palavras do operador
> "qd volto para uma proposta ja finalizada o agente entende que eu estava num passo anterior e
> parece nem saber que eu fechei um plano [...] se ele ta numa mesa ele deve notificar assim: 'Que
> bom que você voltou! Já recebemos sua proposta, daqui a pouco o atendente fala com você no
> WhatsApp pedindo seus documentos' [...] sempre orientar ele a ir para o WhatsApp."

## Cenário exato
- **Rota/tela:** web, teatro de chat (`/` → "Fale com a AJA").
- **Passos:** 1) completar qualquer jornada até "Confirmar e contratar" (proposta fechada,
  `contractClosed: true` persistido); 2) `navigate` (reload da página); 3) modal "Continuar de onde
  você parou?" → "Voltar à conversa"; 4) dentro da conversa já hidratada, o app dispara
  AUTOMATICAMENTE (480ms) uma mensagem de usuário literal `"Voltei"` via `sendUserMessage` — vira um
  turno normal de `POST /api/chat`.
- **Dados usados:** reproduzido nas 3 personas da rodada 1 (Helena/casa, Diego/moto, Renata/carro),
  cada uma com CPF/celular próprios — ver dossiês em
  `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio/evidencias/rodada-1/`.

## Esperado × Atual
- **Esperado:** a saudação de retomada reconhece explicitamente que a proposta já foi
  confirmada/está com a administradora e reforça o encaminhamento pro WhatsApp — nunca repete
  pergunta de etapa anterior, nunca sugere que a jornada ainda está em aberto.
- **Atual (3/3 personas, screenshots confirmados por mim visualmente):**
  - Persona 1 (Helena): *"Vi que você voltou de novo, Helena — tudo certo por aí? Se travou em
    alguma parte do formulário ou ficou com alguma dúvida sobre a cota Itaú, me conta que eu te
    ajudo a resolver agora."* — trata como se ela pudesse estar travada no formulário.
    (`screenshot-1784767588382-98.jpg`, visualizado por mim: a MESMA tela mostra, dois balões
    acima, "Perfeito! Sua cota da ITAÚ está reservada... Parabéns!" + card "Sua proposta está
    pronta".)
  - Persona 2 (Diego): *"E aí, Diego! Ficamos nos 3 cenários da Canopus — conservador, provável ou
    acelerado. Faz mais sentido pra você o acelerado [...] ou prefere o meio-termo do provável?"*
    — **re-pergunta uma decisão já tomada e fechada** (`screenshot-1784768316354-113.jpg`,
    visualizado por mim: mesma tela, acima, mostra "Sua cota da CANOPUS está reservada... Parabéns!").
  - Persona 3 (Renata): *"Que bom te ver de novo! Ficamos na carta do Itaú [...] Quer seguir com a
    contratação daí de onde paramos?"* — convida a "seguir com a contratação" já concluída
    (`screenshot-1784769276946-137.jpg`, visualizado por mim: mesmo padrão, "Parabéns" já dito
    acima na mesma tela).

## Root cause (INVESTIGADO — provado no código, branch `integ/vendedor-matador`, que é onde a
evidência foi coletada)

O bloco H (FIX-364) **corrigiu de fato um bug real**: `nextGate` (`qualify-state.ts:237`) ganhou um
short-circuit no topo — `if (meta.contractClosed === true) return "search";` — que impede a
cascata de qualificação de re-emitir uma **CARD/GATE** de qualificação (ex.: `two_paths`,
`decision`, `contract`) quando o contrato já fechou. Esse fix é usado tanto por
`resume.ts:125` (`getResumableConversation`, caminho da PRIMEIRA camada de resume — o modal
"Continuar de onde você parou?" no reload da página) quanto, indiretamente, por
`phaseFromMeta` (`tool-policy.ts:30`), que também retorna `"terminal"` quando
`contractClosed === true` — e isso é usado em **todo turno normal**, incluindo o turno sintético
`"Voltei"` (via `resolveAgent` → `deriveContractClosedInfo`/`phaseFromMeta`, ambos corretos).

Ou seja: **a hipótese registrada nos 3 dossiês ("Voltei" pode passar por um caminho client-side
diferente do que o FIX-364 corrigiu) está REFUTADA por leitura de código** — o turno "Voltei" passa
pelo MESMO `nextGate`/`phaseFromMeta`/`contractClosedInfo` que o resume server-side usa. Confirmado
em `src/lib/agent/agents/index.ts:131` (`deriveContractClosedInfo` roda em TODO turno de specialist,
não só no reload) e `tool-policy.ts:30-33` (`phaseFromMeta` retorna `"terminal"` com precedência
máxima quando `contractClosed === true`, o que mantém TODAS as seções do prompt base, incluindo as
gateadas por fase `"closing"`).

**O root cause real é outro, e mais fino: não existe NENHUMA seção do prompt que instrua o modelo
sobre como abrir a resposta quando o turno é um "retorno pós-fechamento" (`"Voltei"` ou qualquer
mensagem vaga de reentrada).** `contractClosedSection` (`system-prompt.ts:914`, FIX-11, PRÉ-EXISTENTE
a esta campanha) só cobre dois casos: (1) o usuário CONTESTA o fechamento ("nunca negue"), e (2) o
usuário PERGUNTA o status ("chame check_proposal_status"). As duas seções gateadas por fase
`"closing"` (`"### Status da proposta"` e `"### Oferta real / proposta já registrada"`,
`system-prompt.ts:239-249`) cobrem exatamente os mesmos dois casos. **Nenhuma delas instrui:
"quando o cliente voltar sem fazer pergunta específica (ex.: 'Voltei'), a PRIMEIRA frase reconhece
o fechamento e reforça o encaminhamento pro WhatsApp"** — que é literalmente o comportamento que o
Kairo pediu, palavra por palavra, na citação acima.

Sem essa instrução, o modelo trata `"Voltei"` como uma abertura de conversa comum — usa o histórico
como pista solta em vez de reagir deterministicamente ao FATO "contrato fechado" — e cada persona
produziu uma variação diferente do mesmo erro (formulário travado / decisão pendente / contratação
pendente), o que é o padrão esperado de "comportamento não travado em regra-no-prompt, deixado 100%
a critério do modelo, sem exemplo/instrução que ancore o caso".

**Isso pode acontecer em outro lugar parecido?** Sim — qualquer AÇÃO/GATE que precise disparar
DETERMINISTICAMENTE no primeiro turno de uma sub-jornada (não só "contrato fechado") e hoje dependa
só de o modelo "notar" um fato no `meta`/histórico sem uma seção dedicada corre o mesmo risco. Vale
auditar se existe alguma seção equivalente pra outros estados terminais/quase-terminais do funil
(ex.: handed_off retomado, proposta em `na_administradora` via polling) — não investiguei esses
casos aqui, é hipótese aberta.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Nova seção de prompt, dinâmica, ativa SÓ quando `contractClosedInfo` existe **e** o turno é o primeiro pós-retomada (ex.: reusar o sinal que já existe pra "resumed" nas mensagens, `metadata.resumed`/`AjaUIMessage`, ou um flag novo tipo `justResumedAfterClose`) — instrui explicitamente: primeira frase reconhece a reserva já feita, cita administradora/parcela quando disponível, e reforça que um atendente entra em contato pelo WhatsApp em breve | `src/lib/agent/system-prompt.ts` (nova função tipo `resumeAfterCloseSection`, chamada de `buildSpecialistDynamicBlocks`) |
| Sinalizar o turno "Voltei" como tal pro backend (hoje é indistinguível de qualquer outra mensagem de texto livre) — ex.: `theater-chat.tsx` já sabe que está enviando o seed sintético de retomada; propagar isso no payload do POST (`isResumeGreeting: true` ou similar) pra runner/resolveAgent poderem ativar a seção acima sem heurística de texto | `src/components/chat/theater/theater-chat.tsx`, `src/app/api/chat/route.ts`, `src/lib/agent/orchestrator/runner.ts` |
| Confirmar que a nova seção NÃO trava em regex de copy — só entrega o FATO determinístico (fechado + dados da proposta + orientação de canal); a frase exata continua do modelo | `system-prompt.ts` |

## Regressão exigida
Teste de prompt/snapshot (não é assertable por regex de resposta do LLM, mas É assertable que a
SEÇÃO existe no prompt final quando as condições batem): dado `meta.contractClosed=true` +
sinalização de "turno de retomada", `buildSpecialistPrompt`/`buildSpecialistDynamicBlocks` deve
incluir a nova seção no bloco `dynamic`. Sem essa sinalização (turno normal pós-fechamento, ex.
pergunta de status), a seção NÃO deve aparecer (evita repetir a saudação de retomada fora de hora).
Complementar: harness de conversa real (3 personas) precisa re-rodar após o fix e mostrar 3/3 com
reconhecimento explícito do fechamento + menção a WhatsApp na primeira resposta pós-"Voltei".
