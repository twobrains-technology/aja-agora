# Pós-contratação por canal — como o agente recebe quem volta

> Criado: 2026-06-12 · Escopo: comportamento do agente DEPOIS que o cliente completou a
> jornada (documentos enviados) — web × WhatsApp, hoje × MVP × futuro.
> Fatos de código verificados em 2026-06-12; refs apontam arquivo:linha.

## O modelo mental (por que os canais divergem hoje)

O estado "este cliente JÁ CONTRATOU" (`meta.contractClosed`, FIX-11) vive no metadata da
**conversa** — e os canais têm regras de identidade diferentes:

| | Chave da conversa | Retorno cai na mesma conversa? | Estado terminal presente? |
|---|---|---|---|
| **WhatsApp** | telefone (`waId`) | ✅ sempre | ✅ |
| **Web** | `conversationId` efêmero — `generateId()` a cada mount, sem persistência (`src/lib/chat/provider.tsx:80`) | ❌ nunca (reload/visita = conversa nova e órfã) | ❌ |

O que sobrevive entre visitas web é só o cookie `aja_uid` → memória Letta (best-effort,
fragmentos narrativos) — **não** o estado duro de fechamento. Consequência: o mesmo "oi"
da mesma pessoa recebe dois agentes diferentes dependendo da porta.

## Cenários

### C1 — WhatsApp: "oi" depois de ter enviado os documentos

- **Hoje ✅ (o melhor comportamento da casa):** mesma conversa → estado terminal ativo.
  O agente NUNCA nega o fechamento, NÃO re-roda descoberta, NÃO oferece outra
  administradora; pergunta de status → `check_proposal_status` consulta a administradora
  AO VIVO e responde traduzido (`system-prompt.ts:857-864`, `tool-policy.ts:32`).
- **MVP:** saudação de retorno **contextual sem precisar perguntar**: "Oi, {nome}! Sua
  proposta com a {administradora} está {status}. Próximo passo: {X}, prazo típico {Y}."
  + nudge do que está pendente (dados complementares — ver C6).
- **Futuro:** boleto e confirmação de pagamento na conversa; lembretes da camada 8
  (assembleia, lance).

### C2 — Web: volta no MESMO computador/navegador

- **Hoje ❌ (o gap mais perigoso):** conversa nova e órfã. O agente abre a saudação de
  lead novo; se o cliente disser "quero um consórcio", a descoberta roda inteira de novo
  — re-venda pra quem já comprou, possível proposta duplicada na mesa. A memória Letta
  pode trazer fragmentos ("ele mencionou um carro"), mas nada impede o funil de
  reabrir. Limitação já conhecida no /reset (D17: "a conversa anterior fica órfã").
- **MVP (duas mudanças, uma regra):**
  1. **Persistir o `conversationId`** do chat público (localStorage/cookie) — retorno no
     mesmo device retoma a MESMA conversa (e o estado terminal junto).
  2. **Derivar o fechamento da IDENTIDADE, não só da conversa**: ao montar o agente,
     consultar propostas ativas pelo device/identidade (`aja_uid` → identity → CPF/
     telefone → `bevi_proposals`). Achou proposta → injeta o estado terminal mesmo em
     conversa nova. (Generalização do `deriveContractClosedInfo` que já existe em
     `src/lib/agent/agents/index.ts:49` — hoje ele só olha o meta da própria conversa.)
  - **Regra de aceitação:** "oi" pós-contratação na web responde IGUAL ao C1. Nenhum
    caminho de retorno pode re-rodar descoberta pra quem tem proposta ativa.
- **Futuro:** retomada também do MEIO da jornada ("paramos na simulação — continua?"),
  histórico visível, área do consorciado.

### C3 — Web: outro computador/dispositivo (sem cookie)

- **Hoje ❌:** anônimo total; lead novo.
- **MVP:** re-identificação leve no início da conversa quando o cliente sinalizar que já
  é cliente ("já contratei", "cadê minha proposta"): pedir o celular (e validar posse —
  código via WhatsApp), localizar a identidade → proposta ativa → modo acompanhamento.
  O prompt ganha a instrução: diante de "já sou cliente", NUNCA tratar como lead.
- **Futuro:** magic link no WhatsApp que abre a web já reconhecida.

### C4 — Cross-canal: começou na web, manda WhatsApp (ou vice-versa)

- **Hoje 🟡 parcial:** web→WhatsApp unifica QUANDO o cliente compartilhou o telefone na
  web (opt-in); sem isso, são dois relacionamentos paralelos com duas memórias Letta
  (anon-cookie × phone) não reconciliadas.
- **MVP:** garantir o vínculo sempre que o telefone existir nos dois lados (mesma chave
  → mesma pessoa → mesmo estado de proposta nos dois canais). WhatsApp→web é o C3.
- **Futuro:** reconciliação das memórias Letta na unificação (merge dos blocos, purga do
  duplicado — análogo ao que o /reset já faz na direção inversa, D17).

### C5 — Proatividade: NINGUÉM mandou mensagem

- **Hoje ❌ zero:** nenhum processo observa propostas pendentes; o cliente que não
  pergunta não fica sabendo de NADA — enquanto o copy promete "te aviso de cada passo"
  (`system-prompt.ts:863`). Promessa sistematicamente quebrada.
- **MVP:** job agendado (cron) de `consult_proposal_status` por proposta pendente; diff
  do `changesHistory` (viável — POC de 2026-06-05) → transição vira mensagem proativa
  **no WhatsApp** (template aprovado; é o único canal que alcança quem saiu da página).
  Sem telefone → fica pro retorno (C2/C3) + vira motivo FORTE de capturar opt-in antes
  do fechamento. Honestidade imediata e barata enquanto o job não existe: ajustar o
  copy pra prometer só o que cumpre ("consulte o status por aqui quando quiser").
- **Futuro:** webhook da Bevi (G5) no lugar de polling; e-mail como segundo canal;
  alertas internos de SLA estourado (proposta parada → ação humana na mesa).

### C6 — O limbo dos dados complementares (afeta C1-C5)

Depois do upload de docs, a proposta REAL ainda exige RG/endereço/comprovante (telas
CONEXIA) — e hoje **nada nem ninguém leva o cliente até lá** (a POC mostrou proposta
parada eterna em `endereco`). Qualquer retorno (C1-C3) deveria, antes de tudo, resolver
a pendência: "falta só seu endereço pra proposta seguir — me diz aqui mesmo?". O agente
coleta na conversa → `insert_additional_data` (implementado, sem call site —
`bevi-api-adapter.ts:190`). Sem isso, o acompanhamento proativo (C5) só teria má notícia
pra dar: "sua proposta está parada esperando você".

## Tabela-resumo (régua de aceitação por cenário)

| Cenário | Hoje | MVP — critério binário |
|---|---|---|
| C1 WhatsApp "oi" pós-docs | ✅ terminal + status on-demand | Status proativo na saudação, sem o cliente perguntar |
| C2 Web mesmo device | ❌ lead novo | Mesma resposta do C1; descoberta NUNCA reabre com proposta ativa |
| C3 Web outro device | ❌ lead novo | "Já sou cliente" → re-identificação → modo acompanhamento |
| C4 Cross-canal | 🟡 parcial | Telefone presente nos 2 lados → mesmo estado nos 2 canais |
| C5 Proativo | ❌ zero (promessa quebrada) | Toda transição de status → mensagem WhatsApp ≤ 1h (polling) |
| C6 Dados complementares | ❌ limbo CONEXIA | Coleta no chat → `insert_additional_data` → proposta avança de estado |

## Riscos se a campanha rodar sem o MVP desta spec

1. **Re-venda a cliente fechado** (C2) — dano de confiança + proposta duplicada na mesa.
2. **Cliente no escuro pós-documento** (C5/C6) — pico de ansiedade exatamente no momento
   KYC; churn silencioso de propostas paradas que NUNCA viram boleto (zero comissão).
3. **Tráfego pago sem atribuição** (camada 0 do [`gap-analysis.md`](./gap-analysis.md))
   — impossível otimizar criativo/canal.
