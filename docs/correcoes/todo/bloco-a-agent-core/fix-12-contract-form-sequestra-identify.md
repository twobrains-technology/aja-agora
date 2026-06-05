---
id: FIX-12
titulo: "Fechamento SEQUESTROU a descoberta: modelo apresentou `contract_form` no momento do identify, criou proposta REAL antes de qualquer reveal"
status: todo
bloco: bloco-a-agent-core
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/system-prompt.ts
  - src/app/api/chat/route.ts
  - src/lib/bevi/fulfillment.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-05 tarde (re-teste pós-lote-1)
anotado_em: 2026-06-05
---

# FIX-12 — Fechamento SEQUESTROU a descoberta: modelo apresentou `contract_form` no momento do identify, criou proposta REAL antes de qualquer reveal

### O que o Kairo viu (palavras dele)

> "Por que no fluxo inicial ele não mostrou o card completo?"

O "card completo" (recommendation_card do reveal: parcela, prazo, taxa adm,
contemplados/mês, tipo de grupo, 'Por que esta recomendação?') **nunca apareceu** na
conversa da tarde. Em vez dele, logo após a qualificação veio o card compacto
"Confirmado com a CANOPUS" (R$ 46.000 · R$ 469,95 · grupo 4400) pedindo confirmação.

### Cenário exato (prints 27/28/31/32)

1. Qualificação completa: "R$ 40 mil · em ~8 meses · R$ 800/mês · sem lance".
2. Agente: *"Boa escolha, Kairo! […] Deixa eu puxar as melhores opções pra você. […]
   pra eu conseguir buscar as opções reais de grupo, **o sistema precisa da sua
   identidade pra liberar as simulações reais**. É só CPF e celular, bem rápido:"* —
   narrativa CORRETA do gate **identify** (D1, fim do passo 2)…
3. …mas o card apresentado foi **"Vamos fechar sua proposta" / "Continuar com
   segurança"** = `contract-form.tsx`, o formulário de CONTRATAÇÃO do **passo 5**
   (action `contract-submit`). Não o componente de identidade do gate identify
   (`kind: "identity"`, web adapter:131).
4. Submit → `startContract` → **proposta REAL criada na Bevi (CPF + consulta de
   bureau) sem o usuário ter visto UMA opção sequer** → `pickClosestOffer` escolheu
   CANOPUS R$ 46.000 → card de confirmação compacto → usuário confirmou achando que
   era o fluxo normal → docs → "ficha completa".
5. **Passos 3 e 4 da jornada canônica (reveal com 1-3 opções + simulador + decisão)
   nunca aconteceram.** O primeiro recommendation_card da conversa só apareceu às
   18:06 — na re-descoberta indevida do FIX-11.

### Root cause

- `present_contract_form` é **tool do MODELO** (`tools/ai-sdk.ts:525`). A descrição
  diz "Use SÓ depois que o usuário escolheu 'Sim, quero contratar agora'" e o prompt
  reforça (passo 5) — mas **é instrução, não defesa**. Não existe NENHUM guard
  server-side impedindo o contract_form pré-decisão/pré-reveal.
- No momento do identify, a narrativa ("preciso de uns dados rápidos — CPF e celular")
  é quase idêntica à do fechamento, e ambos os cards coletam CPF+celular+LGPD → o
  modelo confundiu e chamou a tool de contratação no lugar de deixar o gate identify
  do servidor agir.
- Violação direta da regra de produto: decisão crítica (criar proposta real com
  consulta de bureau) ficou a um tool-call de distância do modelo, sem estado do
  servidor validando a ordem da jornada (identify → busca → reveal → decisão → passo 5).

### Correção proposta

| # | Correção | Onde |
|---|---|---|
| A | **Guard server-side**: suprimir `contract_form` enquanto o estado do servidor não registrar decisão/reveal (ex.: `meta.recommendedOffer`/decisão feita). Mesma família do `isContractDup`. Identidade pré-reveal SÓ pelo gate identify do servidor. | `orchestrator/runner.ts` |
| B | Prompt: seção explícita distinguindo "coleta de identidade (gate identify — o SERVIDOR apresenta o card; você NÃO chama tool nenhuma)" × "fechamento (present_contract_form, só pós-decisão)". | `system-prompt.ts` |
| C | Defesa em profundidade no route: `contract-submit` sem decisão prévia registrada → não cria proposta; responde com o gate correto. | `route.ts` / `fulfillment.ts` |

### Regressão exigida

- Camada 1: guard novo no runner + asserts do prompt.
- Camada 2: cassette `FIX-12-CONTRACT-FORM-SEQUESTRA-IDENTIFY` — estado fim-de-passo-2
  (qualify completo, sem reveal), modelo tenta `present_contract_form` → artifact
  suprimido + gate identify emitido.
- Camada 3: cenário no eval — jornada nunca cria proposta antes do reveal.
