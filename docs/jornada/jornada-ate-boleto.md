# Próxima feature — Jornada até o pagamento do boleto

> Anotado: 2026-06-05 · Fonte: Kairo (verbal, transcrito durante teste manual em tela)
> Status: **contexto de negócio + gaps mapeados — feature ainda NÃO planejada**
> Relacionados: [`jornada-canonica.md`](./jornada-canonica.md) · [`CONTEXT.md`](./CONTEXT.md) (DES-1)
> · [`../integracoes/bevi-api-parceiro-spec.md`](../integracoes/bevi-api-parceiro-spec.md)
> · [`../integracoes/bevi-api-requests.md`](../integracoes/bevi-api-requests.md)

## 1. O problema (palavras do Kairo, 2026-06-05)

O fluxo de hoje termina assim no chat: *"Recebi seus documentos ✅. É isso — sua ficha
está completa! Agora é com a administradora; te aviso de cada passo."*

> "Porém, isso daí até chegar na administradora ainda está obscuro aqui pra mim.
> Eu não tenho o contexto exato."

O que de fato existe entre o nosso "ficha completa" e a administradora é uma **sequência
de telas no portal CONEXIA** (aberta pelo link `uselink.me/...` da proposta) que,
teoricamente, **quem teria que preencher era o usuário** — manualmente, fora do nosso chat:

1. **Documento pessoal** — "Validando documentação inserida… / Processando Documento…"
2. **Dados do documento de identidade** (`/dadosDoDocumentoDeIdentidade`) — nº do RG,
   órgão emissor, UF emissora, data de emissão, nome da mãe, sexo, estado e cidade de
   naturalidade
3. **Endereço** (`/endereco`) — "preencha conforme a sua conta de luz": CEP, estado,
   cidade, bairro, endereço, número, complemento, rua
4. **Comprovante de endereço** (`/comprovanteDeEndereco`) — anexo; banner *"Todos os
   documentos são opcionais"*, botão **Pular**
5. (finalização — ver máquina de estados abaixo)

Verificado em tela pelo Kairo em 2026-06-05 com a proposta real do teste manual
(CANOPUS, grupo 4400, carta R$ 46.000, parcela R$ 469,95).

## 2. Contexto de negócio

- **A Bevi tem uma "mesa"** dentro da parte de contratação — é lá que a proposta é
  efetivada pro cliente (back office, manual — ver DES-1 no CONTEXT.md: assinatura é
  da mesa, não automatizada).
- **Do lado Aja Agora, a jornada tem que chegar até o pagamento** (1º boleto). Razão:

> "Pra mim o consórcio está apto a pagar a comissão quando o cara fizer o **primeiro
> pagamento** para entrar no grupo. Ou seja, o primeiro pagamento do consórcio — aí o
> pessoal do AGE [sic — confirmar se AGX/investidor], que é quem está financiando o
> projeto, vai conseguir ter o retorno financeiro."

- ⚠️ **HIPÓTESE A CONFIRMAR** (o próprio Kairo sinalizou: *"até onde eu entendi aqui,
  eu tenho que confirmar essa informação"*): a comissão é disparada pelo **primeiro
  pagamento do boleto**. Se confirmada, o evento "boleto pago" é o **evento de sucesso
  do funil inteiro** — e a jornada não pode terminar antes dele.

**Consequência de produto:** a jornada canônica hoje vai até o envio de documentos
(passo 5). A próxima feature estende o funil:

```
[hoje]  …docs enviados → "ficha completa, agora é com a administradora"   ← FIM
[meta]  …docs enviados → dados complementares PELO CHAT → finalização →
        inserção na administradora → BOLETO → 1º pagamento confirmado     ← FIM
                                                  └─ evento que destrava a comissão
```

## 3. O que já temos mapeado (e o que falta)

### 3.1 Já existe no código — SEM call site em runtime

| Capacidade | Onde | Estado |
|---|---|---|
| `insert_additional_data_bevi_consorcio` — envia `documentoIdentidade` + `endereco` (exatamente as telas 2 e 3 do CONEXIA) | `BeviApiAdapter.insertAdditionalData` (`src/lib/adapters/bevi/bevi-api-adapter.ts:190`) | implementado, testado, **nunca chamado em runtime** |
| `consult_proposal_status_bevi_consorcio` — polling de status | `BeviApiAdapter.getStatus` (`bevi-api-adapter.ts:200`) | implementado, **nunca chamado em runtime** |
| Upload server-side de documentos (RG/CNH, comprovante) | `ConexiaDocsClient` | **em produção** (passo 5 atual) |
| Steps CONEXIA via PATCH `/unauth/product-self-contract/update-step/{hash}/step/…` (inclui `waitingForUniqueCode` que **finaliza** → inserção assíncrona na administradora → `proposalNumber`) | capturado no Trilho B — `bevi-api-requests.md` §7 | só documentado; capturado no self-contract |

> **Leitura importante:** boa parte do "bypass" das telas CONEXIA já está coberta pela
> própria **API de Parceiro** (`insert_additional_data`). O que está obscuro é a
> **finalização** (equivalente ao `waitingForUniqueCode`) e tudo que vem DEPOIS dela.

### 3.2 Máquina de estados conhecida (spec §9) — e onde ela fica cega

```
dadosIniciais → consultaConsorcioBevicred → simulation → documentoPessoal
  → endereco → comprovanteDeEndereco / waitingForUniqueCode
  → [inserção assíncrona na administradora → proposalNumber]
  → ??? (boleto? pagamento? efetivação na mesa?)          ← NADA documentado daqui em diante
```

- `approvedAt` / `reprovedAt` / `integrationCode` ficam `null` até a administradora
  processar. Não há webhook documentado — acompanhamento é **polling** do status.
- **Nenhum estado conhecido menciona boleto ou pagamento.** Esse é o gap central.

### 3.3 Gaps a investigar

| # | Pergunta | Como responder |
|---|---|---|
| G1 | O `consult_proposal_status` informa **pago/não pago**? Quais estados existem após `waitingForUniqueCode`? | **POC desta sessão** (§4) + re-polling conforme a proposta real do Kairo avança na mesa/administradora |
| G2 | Como o **boleto** é emitido e entregue ao cliente? (e-mail da administradora? mesa? algum endpoint?) | Perguntar à Bevi/AGX; observar a proposta real avançando |
| G3 | A regra de **comissão no 1º pagamento** está correta? Qual evento exato dispara? | Kairo confirma com a Bevi/AGE |
| G4 | Os PATCHes `/unauth/update-step/{hash}` (Trilho B) funcionam com o hash do link de **parceiro** (`uselink.me` do `choose_offer`)? Serviriam pra finalizar (`waitingForUniqueCode`) o que a API de Parceiro não cobre? | POC técnica (seguir o redirect do uselink.me da proposta real e testar os steps) |
| G5 | Existe **webhook** de mudança de status/pagamento (Q10 da aderência)? | Perguntar à Bevi/AGX — sem isso, é polling agendado |

## 4. POC — `consult_proposal_status` (2026-06-05) — EXECUTADA

Chamada real (`service_id: consult_proposal_status_bevi_consorcio`, token de parceiro)
contra as 2 propostas do teste manual de hoje (`bevi_proposals` do workspace):

| Proposta | Criada | `statusName` | `situation` | `integrationCode` | `approvedAt` |
|---|---|---|---|---|---|
| `6a230bb1…bd089b` (CANOPUS 4400, R$ 46k) | 14:47 UTC | "Aguardando inserção da proposta" | `pending` | `null` | `null` |
| `6a22d4fb…83c282` (CANOPUS 4400, R$ 35k) | 13:54 UTC | "Aguardando inserção da proposta" | `pending` | `null` | `null` |

### Rodada 2 da POC (mesma data, ~19h UTC) — varredura ampliada

Consultadas TODAS as propostas reais conhecidas (DB local + IDs capturados nas docs de
2026-06-02) + caso de erro:

| Proposta | Idade | `statusName` | Último estado | Observação |
|---|---|---|---|---|
| `6a230bb1…` (hoje 14:47) | ~4h | Aguardando inserção da proposta | `waitingForUniqueCode` | **sem transição em 4h+** |
| `6a22d4fb…` (hoje 13:54) | ~5h | Aguardando inserção da proposta | `waitingForUniqueCode` | idem |
| `6a1f3461…` (2026-06-02) | 3 dias | Endereço | `endereco` | **abandonada não expira** — pending eterno |
| `6a1f7953…` (2026-06-02) | 3 dias | Documento pessoal | `documentoPessoal` | idem |
| id inexistente | — | — | — | `404 {errors:[{field:"propostaId","Proposta não encontrada."}]}` |

**Conclusões adicionais da varredura:**

- **Shape é exatamente o documentado — sem campos ocultos.** Nada de boleto/pagamento
  escondido no payload (verificado por diff de chaves).
- **A inserção na administradora NÃO é imediata**: 4-5h após `waitingForUniqueCode` e
  nada de `integrationCode`/`approvedAt`. Ou é batch lento, ou depende da MESA (back
  office) processar — reforça G2 como pergunta pra Bevi. **Estados pós-inserção seguem
  não-observados** (nenhuma proposta nossa chegou lá).
- **Proposta abandonada fica `pending` indefinidamente** (3 dias sem expirar) — não há
  estado "expirada". Implicação de design: o acompanhamento ativo precisa de timeout
  próprio/nudge ao usuário; a API não vai sinalizar abandono.
- **Polling de transições é viável por diff do `changesHistory`** (cada item tem
  `changeDate` — detectar item novo = evento pro usuário). `approvedAt`/`reprovedAt`
  sugerem que `situation` evolui pra `approved`/`reproved` no desfecho.
- Erro 404 tem shape limpo e tipado — `getStatus` já mapeia via `toBeviError`.

### Achados (rodada 1)

1. **As telas CONEXIA e a API de Parceiro compartilham a MESMA máquina de estados.**
   O `changesHistory` da proposta de 14:47 registra exatamente os passos que o Kairo
   preencheu manualmente em tela, com timestamps batendo minuto a minuto:
   `documentoPessoal` (14:47) → `dadosDoDocumentoDeIdentidade` (14:49) → `endereco`
   (14:50) → `comprovanteDeEndereco` (14:50) → `waitingForUniqueCode` (14:52).
   Estados novos observados que a spec §9 não listava: `dadosDoDocumentoDeIdentidade`
   (sort 7) e `comprovanteDeEndereco` (sort 9) — sequência completa tem sort 1→10.
   **Consequência:** automatizar esses passos server-side (G4 / `insert_additional_data`)
   avança a mesma proposta — o bypass é viável em princípio.
2. **Nenhum sinal de boleto/pagamento no shape atual.** Os campos candidatos a desfecho
   são `integrationCode` (presumivelmente o nº da proposta na administradora),
   `approvedAt`/`reprovedAt` e `statusDescription` — todos `null` enquanto
   `waitingForUniqueCode` (inserção assíncrona pendente). **G1 segue aberto**: só dá pra
   responder re-consultando DEPOIS que a administradora processar (e/ou após a mesa
   efetivar) pra ver se surge estado de boleto/pagamento. Plano: re-poll diário destas 2
   propostas reais e registrar aqui cada transição nova.
3. **Polling funciona com o token de parceiro** sobre proposta que andou pelo trilho
   CONEXIA — não há separação de trilhos na leitura de status.

## 5. Esboço de visão da feature (NÃO é plano — é direção)

1. **Dados complementares pelo chat** — em vez de mandar o usuário pro form CONEXIA,
   o agente coleta RG/endereço na conversa (ou OCR dos documentos já enviados) e chama
   `insert_additional_data`. O usuário nunca sai do chat.
2. **Finalização automatizada** — fechar o equivalente ao `waitingForUniqueCode`
   (via API de Parceiro se existir; senão, avaliar G4) pra disparar a inserção na
   administradora.
3. **Acompanhamento ativo** — polling agendado de `consult_proposal_status` por
   proposta pendente; cada transição vira mensagem proativa no canal do usuário
   (web/WhatsApp): "sua proposta entrou na administradora", "boleto disponível", etc.
   **A metade "sob demanda" foi PROMOVIDA pra correção imediata** (2026-06-05, pedido
   do Kairo): tool `check_proposal_status` do agent — usuário pergunta o status no
   chat e recebe o estado REAL traduzido. Spec:
   [`../correcoes/todo/bloco-b-status-tool/fix-14-tool-status-proposta.md`](../correcoes/todo/bloco-b-status-tool/fix-14-tool-status-proposta.md).
4. **Boleto e pagamento** — depende de G1/G2: exibir/encaminhar o boleto e detectar o
   pagamento. **Evento "1º boleto pago" = sucesso do funil** (dispara comissão, G3).

## 6. RESOLUÇÃO 2026-06-14 (Kairo) — máquina de estados do desfecho

O Kairo forneceu os estados pós-`waitingForUniqueCode` (G1 fechado) e esclareceu
boleto (G2) e webhook (G5). **Esses estados são manuais — movidos pela MESA; o
tempo de inserção é definido pela Conexia.**

| Status (nome) | Valor sistêmico | Raia do funil |
|---|---|---|
| Inserir proposta | `approveWaitingForUniqueCode` | Na administradora (mesa) |
| Aguardando Pagto Cliente | `aguard_pag_cliente` | Aguardando pagamento |
| Proposta Efetivada | `prop_efetivada` | Fechado — ganho |
| Aprovada | `approved` | Fechado — ganho |
| Reprovado | `repproved` *(typo real da Bevi)* | Perdido |

### Gaps fechados

- **G1 (estados pós-`waitingForUniqueCode`)** — ✅ respondido (tabela acima).
- **G2 (boleto)** — ✅ **não existe emissão/entrega separada**; o cliente **segue
  pelo link** pós incluir os documentos. O estado `aguard_pag_cliente` é o
  "aguardando pagamento do cliente".
- **G5 (webhook)** — ✅ **não há webhook**; acompanhamento é **polling**. Decisão:
  **worker do próprio aja-agora** (BullMQ, back junto no mesmo projeto/container
  se der — implica Redis) com job recorrente de `consult_proposal_status` por
  proposta pendente, mapeando status→raia e disparando mensagem proativa.
- **Escopo da API de Parceiro** — leva até a **etapa de envio de documento**
  (disponibiliza o link pro cliente anexar e fechar a auto-contratação). Do envio
  de docs em diante = mesa + polling.
- **G3 (comissão)** — segue a confirmar qual transição exata dispara (provável
  saída de `aguard_pag_cliente` → `prop_efetivada`).

> Consumido em `docs/jornada/proposta-funil-contatos-retorno.md` (Parte 2, raias
> 5-8) e na anotação `docs/correcoes/todo/bloco-b-funil-raias/fix-44`.

---
*Anotado durante a sessão de testes manuais de 2026-06-05. Campos das telas CONEXIA
registrados sem os valores (PII real do operador nos prints). Desfecho da máquina
de estados adicionado em 2026-06-14 (resposta do Kairo).*
