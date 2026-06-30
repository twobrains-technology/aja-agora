---
slug: fim-proposta-bugado-doc-simulador
titulo: "Fim da proposta bugado — passo do documento não avança / não apresenta o card de upload"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-06-30 — uso manual do Kairo
evidencia:
  - _evidencia/fim-proposta-bugado-doc-simulador-print.png
mexe_em:
  - src/lib/bevi/fulfillment.ts
  - src/components/chat/artifacts/document-upload.tsx
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/app/api/chat/route.ts
---

## Palavras do operador
> "outro problema [print] esta totalmente bugado no final da proposta ali"
> "pode ser por mudança na api"

## Cenário
- **Rota/tela:** chat web, FIM da proposta (passo de envio de documento / fechamento).
- **Transcrição (do print):**
  - Agente: "Perfeito, Kairo! Sua proposta está avançando! Falta enviar seu
    documento pessoal — RG ou CNH — pra ela seguir em frente. Quer completar isso
    agora? Se quiser, temos o nosso simulador pra ver como ficariam as suas
    parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?"
  - Usuário: "Agora não"
  - Usuário: "bora"
  - Agente: "Sem problema! Quando quiser retomar, é só me chamar aqui. Sua proposta
    já está registrada... Sua proposta está aguardando o envio do documento
    pessoal — RG ou CNH. Quando estiver pronto pra completar, é só me falar!"
  - Usuário: "ok estou pronto"  (sem resposta acionável depois)

## Esperado × Atual
- **Esperado:** no fim da proposta, o agente apresenta o **card de upload de
  documento** (RG/CNH) pra o usuário agir; e/ou o **card do simulador** quando ele
  topa. "bora"/"ok estou pronto" = afirmativo → avança.
- **Atual:** só TEXTO, nenhum artefato acionável. O usuário diz "bora" e depois
  "ok estou pronto" e o agente NÃO apresenta card nenhum — fica num loop de
  narração ("aguardando o documento, me avisa quando estiver pronto"). Dead-end:
  não dá pra concluir a proposta. Além disso, **"bora" (afirmativo) foi lido como
  recusa** ("Sem problema! Quando quiser retomar...").

## Pista de causa (parcialmente VERIFICADA ao vivo — 2026-06-30)
A hipótese do Kairo ("mudança na api") foi testada ao vivo contra homologação.
**A API de links de documento está SAUDÁVEL, mas tem ordem de estado obrigatória:**

- `get_document_upload_links_bevi_consorcio` **ANTES do `choose_offer`** → **400**:
  *"Proposta se encontra em Espera Consulta Consórcio... Estará disponível após
  realizada a escolha da simulação."*
- **APÓS `choose_offer`** → **200** com `linkDocumentosPessoais` +
  `linkComprovanteEndereco`; status avança pra "Documento pessoal".

→ **Leads (a confirmar no código):**
1. **Ordem do fluxo:** o app pode estar chegando no passo "envie o documento"
   **sem ter feito `choose_offer`** (ou chamando `getDocumentLinks` cedo demais) →
   400 → card não renderiza. Olhar `src/lib/bevi/fulfillment.ts`
   (`uploadContractDocument`/`getDocumentLinks` — garante choose_offer antes?).
2. **Artefato não disparado:** a tool que apresenta o `document-upload.tsx` pode
   não estar sendo chamada no close — o agente narra em vez de renderizar o card.
   Olhar `src/lib/agent/tools/ai-sdk.ts` + `src/lib/agent/system-prompt.ts` (passo
   do documento) + `src/app/api/chat/route.ts` (handler de close).
3. **Comportamento de agente — "bora" lido como recusa.** Comprehension miss
   (provável contágio do "Agora não" anterior). ⚠️ Quando virar fix, exige as **3
   camadas de regressão de agent** (structural + cassette + eval) — não é só UI.

**NÃO é** "a API caiu" — o endpoint de doc responde 200 na ordem certa. **Falta
provar:** se no repro real o `choose_offer` aconteceu; se o card falha por 400 do
getDocumentLinks ou por a tool nunca disparar; e onde "bora" vira recusa.

> ⚠️ Relacionado: pode se somar ao bug `agente-nao-responde-ate-novo-input`
> (turno mudo) e à conta Anthropic sem crédito (achado de hoje) — investigar juntos.
