# Jornada Canônica — Aja Agora

> **REGRA, não referência.** Fonte: `jornada.docx` do cliente + refino do Kairo (2026-06-30).
> Toda divergência entre código e este fluxo é **defeito do código**, não interpretação.
> Contexto/decisões: [`CONTEXT.md`](./CONTEXT.md). Original: [`jornada.docx`](./jornada.docx).
> **Lema:** *"Seu objetivo primeiro. O melhor consórcio depois."*

## Como ler (Fase de cada cenário)

| Marca | Significado | O QA autônomo faz |
|---|---|---|
| 🟢 **vivo** | comportamento canônico que DEVE funcionar hoje | **testa** — falha se quebrar |
| ⚪ **futuro** | planejado, ainda não é MVP | **não testa** (pendente, não falha) |
| 🔴 **diverge** | o código faz DIFERENTE do canônico hoje — **precisa editar** | testa como regressão **após** o fix; é a lista de edições da próxima sessão |

**Paridade Web ↔ WhatsApp (regra-mãe):** a jornada é **a mesma** nos dois canais — mesmos
passos, mesma ordem, mesmas regras. Só muda a **dinâmica de interface**: a web tem componentes
interativos (agulha arrastável, botões, cards); o WhatsApp usa **botões nativos + conversa +
marcos textuais** (ex.: a agulha vira "3 / 6 / 12 meses" por texto). Nenhum passo existe num
canal e não no outro.

---

## Regras de plataforma (cross-cutting — valem em toda a jornada)

| # | Regra | Estado |
|---|---|---|
| P1 | **Trilho A é o PRIMÁRIO** (API de Parceiro Bevi/UXVision — padrão oficial, estável, 6 administradoras). **Trilho B (self-contract) é FALLBACK** — usado só quando A cai, mas **tem que funcionar**. | 🔴 hoje a **descoberta roda no B** (não há A→B); inverter |
| P2 | **Tradução de contrato A↔B:** A fala **PT** (`objetivo: contemplacao_rapida`, `tipoSimulacao: valor_total`, `lanceEmbutido`); B fala **EN** (`objective: FAST_APPROVAL`, `simulationType: TOTAL_VALUE`, `embeddedPercentage`). O fallback precisa **traduzir params + shape da oferta** (A ~10 campos × B ~68). *(É o "tipo em inglês que não existe no B" que dava pau.)* | 🔴 criar camada de tradução |
| P3 | **Sweep de busca (maximizar cartas):** manda **2 objetivos (`contemplacao_rapida` + `investimento`) × com/sem lance embutido** (~4 buscas) → **une + dedup** → a IA recomenda pelo objetivo real do usuário. | 🔴 hoje manda **1 objetivo** derivado; o sweep varre só faixas de valor |
| P4 | **Componente de valor = só a AGULHA do valor do bem.** O componente antigo de 3 sliders (valor/parcela/prazo + quantidade) **deve ser DELETADO** — o usuário só informa o **valor do bem**. | 🔴 `value-picker.tsx` (3 sliders, FIX-16) ainda existe — deletar |
| P5 | **Lance embutido DERRUBA a parcela pós-contemplação.** O embutido amortiza o saldo → parcela cai (é o diferencial). Sempre mostrar **parcela atual + parcela pós-contemplação** quando a cota tem lance. | 🔴 `contemplation-dial.ts` (FIX-C4) faz o contrário (só dinheiro abate) — **corrigir** |
| P6 | **Identidade (CPF+telefone) coletada ANTES da busca.** Sem identidade não há descoberta real (mock é proibido). | 🔴 hoje a busca às vezes dispara antes → `IdentityNotCollectedError` em prod |
| P7 | **PROIBIDO dado mockado em runtime** — toda oferta/número vem da Bevi (A ou B). | 🟢 |

---

## PARTE 1 — Chat / Agente (self-service, web e WhatsApp)

### Passo 1 · Entender a necessidade
**Narrativa:** o usuário chega, diz o que quer conquistar e como se chama. O agente ecoa o objetivo.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Pergunta o bem: **Imóvel / Carro / Moto** por botão | botões | botões nativos | 🟢 |
| Pergunta o **nome** ("Como posso te chamar?") e captura em 1 turno | texto | texto | 🟢 |
| Ecoa o objetivo ("…um [carro/imóvel] de cerca de X") | texto | texto | 🟢 |

### Passo 2 · Entender o cliente
**Narrativa:** descobre experiência prévia, educa se preciso, coleta o **valor do bem** (só o valor) e a intenção de lance.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| "Já participou de consórcio?" (first/returning/doubts) | botão | botão | 🟢 |
| Se não/tem dúvida → **educação** (consórcio sem juros, taxa de adm, sorteio/lance) + "Entendi, pode continuar" | texto+botão | texto+botão | 🟢 |
| **Valor do bem** coletado pela **AGULHA** (web) / por conversa+marcos (WhatsApp) — **só o valor**, sem prazo, sem parcela, sem intents | **agulha simples** | conversa ("uns 80 mil") | 🔴 (P4) |
| **NÃO** aparece o componente de 3 sliders | — | — | 🔴 deletar |
| Prazo de contemplação **não** é perguntado na entrada (FIX-103) | — | — | 🟢 |
| Lance: "Pretende dar um lance?" **Sim/Não/Talvez** (o VALOR do lance, se houver, é conversa) | botão | botão | 🟢 |
| **Educação de lance embutido** aparece pra QUALQUER resposta (Sim/Não/Talvez) | texto | texto | 🟢 |

### Passo 3 · Identidade (gate antes da busca)
**Narrativa:** pra buscar de verdade na Bevi, precisa de **CPF + telefone**. Coletado aqui, antes da descoberta.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Coleta **CPF + telefone** antes de qualquer `search_groups` | card de identidade | conversa (telefone = o próprio WhatsApp; pede CPF) | 🟢 estrutura / 🔴 ordem (P6) |
| Nunca dispara a busca sem identidade (sem "dificuldade técnica") | — | — | 🔴 (P6) |

### Passo 4 · Buscar alternativas
**Narrativa:** com identidade + valor + lance, o sistema faz o **sweep** (Trilho A primário, B fallback) e traz o máximo de cartas.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Busca via **Trilho A**; se A cair, **fallback Trilho B** (traduzido) | igual | igual | 🔴 (P1/P2) |
| **Sweep**: 2 objetivos × com/sem embutido → une+dedup → **vários registros** | igual | igual | 🔴 (P3) |
| Retorna **≥ 1 carta real** (nunca mock); se faixa vazia, busca a mais próxima | igual | igual | 🟢 (parte) |
| Agente **não narra o mecanismo** ("deixa eu buscar / usar a ferramenta") | 1 frase natural | 1 frase | 🔴 (meta-narrativa) |

### Passo 5 · Avaliar, simular e definir
**Narrativa:** mostra a **recomendada primeiro** + outras 2; o simulador de contemplação deixa o
usuário ver a parcela em 3/6/12 meses; **com lance embutido, mostra a parcela CAINDO
pós-contemplação** — o diferencial da nossa inteligência.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Card **"Plano recomendado"** em destaque + **"Outras opções"** (2) | cards | card + "ver outras" | 🟢 |
| Resumo por oferta: carta · parcela · prazo · administradora · lance/embutido · liquidez | card | texto | 🟢 |
| **Simulador de contemplação** (3/6/12 meses): recalcula ao vivo | **agulha arrastável** | marcos por conversa (loop what-if) | 🟢 |
| **Lance embutido → parcela PÓS-contemplação CAI** (o embutido amortiza o saldo) — mostra **parcela atual + parcela pós** | card | texto | 🔴 (P5 — corrigir FIX-C4) |
| Ex.: carta 200 c/ 100 embutido → recebido líquido ~100 (= o bem do usuário) + parcela pós despenca | card | texto | 🔴 (P5) |
| Ressalva discreta de "estimativa" (CDC art. 30/37), sem repetir em cada número | texto | texto | 🟢 |
| **Card de decisão**: "Contratar agora" · "Ver outras opções" · "Falar com especialista" | botões | botões | 🟢 |

> **Cálculo pós-contemplação (P5, modelo corrigido):** no mês-alvo `N`, o lance **total
> (embutido + dinheiro)** amortiza o saldo → `saldoApós = parcela × mesesRestantes − lanceTotal`;
> `parcelaPós = saldoApós / mesesRestantes`. *(Hoje o FIX-C4 usa só `ownCashValue` — passar a
> incluir o `embeddedBidValue`. Guardar a ressalva de estimativa; não prometer contemplação.)*

### Passo 6 · Contratar
**Narrativa:** coleta dados + documentos, salva do nosso lado e aciona a Bevi (Trilho A) pro fluxo de documentos e finalização da proposta.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Confirma a oferta escolhida (oferta REAL, re-simula se TTL venceu) | card | texto | 🟢 |
| Coleta/upload de **documentos** → **salva do nosso lado** | upload no chat | upload/redirect | 🟢 (parte) |
| Envia à Bevi **Trilho A**: fluxo de documentos + finalização + **PDF da proposta** (`consortiumProposalLink`) | — | — | 🟢 |
| ⚠️ Assinatura digital self-service **NÃO** é entregue aqui (DES-1) — proposta pronta + docs; assinatura é etapa da mesa | — | — | ⚪ futuro |

### Passo 7 · Confirmação + handoff pro WhatsApp oficial
| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| "Parabéns! Mais perto da sua conquista" | texto | texto | 🟢 |
| Resumo da contratação por **WhatsApp/e-mail** | — | — | 🟢 |
| "A gente te chama no **WhatsApp oficial** (número X); te mando um 'oi', você adiciona nosso número" | opt-in | opt-in | 🟢 (opt-in existe) |

---

## PARTE 2 — Mesa de operação (back-office, pós-contratação)

**Narrativa:** o cliente contratou; a partir daqui a **mesa** assume. O lead anda no Kanban; ao
chegar na fase de atendimento, o caso é **oferecido a todos os atendentes** e quem **clicar "vou
atender" assume**; o atendente entra manualmente na administradora **guiado pelo copiloto**, que
lê o **PDF/manual da administradora**.

### Kanban (raias)
`novo → engajado → qualificado → em_negociacao → proposta_enviada → na_administradora → aguardando_pagamento → fechado_ganho / perdido` — 🟢 implementado.

### Transbordo auto-broadcast + claim (FEATURE NOVA)
| Cenário de aceitação | Fase |
|---|---|
| Ao o lead **entrar na fase** (ex.: `na_administradora`/`em_negociacao`), o sistema **transborda automaticamente** (sem clique) | 🔴 hoje é **manual** (botão) |
| O caso é **enviado a TODOS os atendentes** (broadcast) no WhatsApp deles, com botão **"Vou atender"** | 🔴 feature nova |
| O **primeiro que clica "Vou atender" ASSUME** o caso; os demais recebem "já foi assumido" | 🔴 feature nova (claim/lock) |
| Ao assumir, o lead **muda de fase** (negociação → em atendimento / na administradora) | 🔴 feature nova |
| Dados sensíveis (CPF, documentos) **não** trafegam no WhatsApp — ficam no painel | 🟢 |

### Copiloto da mesa (guia o atendente)
| Cenário de aceitação | Fase |
|---|---|
| Mensagem do atendente (WhatsApp) cai no **mesa-copilot**, nunca no agente de vendas | 🟢 |
| O copiloto carrega o **PDF/manual da administradora** (do cadastro) como fonte da verdade | 🟢 |
| Responde "como faço X na tela da [BB/administradora]?" com **passo a passo** | 🟢 |
| Não expõe mecanismo/erro técnico; não fala com o cliente final | 🟢 |

---

## Lista consolidada de EDIÇÕES (o que diverge do código — para a próxima sessão)

> Cada item 🔴 acima. Esta é a lista de trabalho de implementação.

1. **P1/P2 — Trilho A primário + B fallback** com camada de tradução PT↔EN + adaptação de shape (10↔68 campos).
2. **P3 — Sweep de busca:** 2 objetivos × com/sem embutido → une+dedup.
3. **P4 — Deletar** `value-picker.tsx` (3 sliders) → só a agulha do valor do bem.
4. **P5 — Corrigir FIX-C4** em `contemplation-dial.ts`: embutido passa a amortizar o saldo → parcela pós-contemplação cai. Mostrar parcela atual + pós.
5. **P6 — Identidade antes da busca** (mata o `IdentityNotCollectedError` de prod) + matar meta-narrativa.
6. **Transbordo auto-broadcast + claim** (feature nova na mesa).
7. *(Já em voo no bloco `fix-funil-turno-orquestracao`: agente-trava em afirmação, componente de valor resiliente, search antes de identidade.)*

> Cada 🔴 vira **cenário de regressão** depois de corrigido; o QA autônomo persegue os 🟢 (e os 🔴 já corrigidos) até o verde.
