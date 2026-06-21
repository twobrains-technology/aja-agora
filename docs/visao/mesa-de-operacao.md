# Mesa de operação Aja Agora — transbordo humano + agente copiloto

> Criado: 2026-06-21 · Origem: Kairo (verbal, transcrito) · Branch: `base/atendente-mesa-e-agente`
> Status: **contexto de negócio + entidades esboçadas — feature ainda NÃO planejada** (sem
> TEST-PLAN, sem implementação). Próximo passo previsto: plano (modo plano → PO Lead → TDD → QA).
> Relacionados: [`../jornada/jornada-ate-boleto.md`](../jornada/jornada-ate-boleto.md) (a travessia) ·
> [`consorcio-primer.md`](./consorcio-primer.md) §4-5 (mesa, cadeia de valor) ·
> [`pos-contratacao-canais.md`](./pos-contratacao-canais.md) (C5: "ação humana na mesa") ·
> [`gap-analysis.md`](./gap-analysis.md) (camada 6) · [`../specs/attendants-crud.md`](../specs/attendants-crud.md)
> (atendente-com-login, já implementado — distinção na §7) · [`../jornada/CONTEXT.md`](../jornada/CONTEXT.md) (DES-1)

## 1. O problema (palavras do Kairo, 2026-06-21)

> "No kanban, quando for [necessário], precisamos ter a opção de transbordar para
> atendentes de mesa, para o WhatsApp de um deles — essa figura de atendente de mesa ainda
> não existe. Também temos que ter um agente que orienta nosso atendente de mesa a como
> fazer o contrato do cliente na administradora, dado a cota que ele escolheu. Temos os
> documentos PDF de cada administradora e temos que injetar no agente quando ele mandar a
> mensagem para o atendente da mesa. Deve ter um cadastro de atendente de operação simples,
> com nome e WhatsApp; esse atendente, ao atender, vai poder tirar dúvidas com o agente, que
> vai ter o PDF e vai saber exatamente tudo. O CRUD dos docs para o agente deve escolher a
> administradora — que também deve ser uma entidade nossa — e o admin pode cadastrar e
> remover."

### A lacuna que isso preenche

A jornada canônica vai até o passo 5 (ficha completa). Entre **"ficha completa"** e
**"contrato efetivado na administradora"** existe a **travessia** (camada 6 do
[`gap-analysis.md`](./gap-analysis.md)) — hoje silenciosa e manual. O
[`consorcio-primer.md`](./consorcio-primer.md) §4 chama essa etapa de **"Análise (mesa)"**,
e até agora a única "mesa" do nosso modelo era a **mesa da Bevi** (back office, caixa-preta,
manual — DES-1). A POC de 2026-06-05 mostrou propostas paradas 4-5h+ em `waitingForUniqueCode`
sem ninguém do nosso lado atuando ([`../jornada/jornada-ate-boleto.md`](../jornada/jornada-ate-boleto.md) §4).

Esta feature dá ao Aja Agora uma **mesa de operação própria**: um time humano que **assume o
caso** (transbordo a partir do kanban) e **formaliza o contrato na administradora** seguindo
o procedimento daquela administradora — com um **agente copiloto** que conhece o manual (PDF)
de cada administradora e orienta o atendente passo a passo, pelo WhatsApp.

```
[hoje]  ...ficha completa → "agora é com a administradora" → mesa da Bevi (caixa-preta)   ← limbo
[meta]  ...ficha completa → TRANSBORDO (kanban) → atendente de mesa Aja Agora
                          ↳ copiloto injeta o PDF da administradora da cota
                          ↳ orienta o atendente a fazer o contrato → proposta efetivada
```

## 2. Vocabulário — desambiguar TRÊS "mesas/atendentes" (não confundir)

| Termo | O que é | Existe? |
|---|---|---|
| **Mesa da Bevi** | Back office da Bevi que efetiva a proposta no fluxo atual; manual, caixa-preta (DES-1). Não controlamos. | Externo |
| **Mesa de operação Aja Agora** (esta feature) | Time humano NOSSO que assume o caso e faz o contrato na administradora, orientado pelo copiloto. | ❌ novo |
| **Atendente de mesa / operação** (esta feature) | A pessoa da mesa de operação. Cadastro **simples: nome + WhatsApp, sem login**. Recebe o transbordo e conversa com o copiloto no WhatsApp. | ❌ novo |
| **Atendente de handoff de chat** (`user role=attendant`) | Humano que assume a CONVERSA do CLIENTE após handoff de interesse/assinatura no WhatsApp. Tem login, convite por email, FK em `conversations`. | ✅ implementado ([`../specs/attendants-crud.md`](../specs/attendants-crud.md)) |

> ⚠️ **Decisão a confirmar (DEC-A):** o "atendente de mesa" é entidade NOVA e simples
> (assumido aqui por default — o Kairo pediu "simples, só nome e whatsapp" e disse que "ainda
> não existe"), OU deveria reusar/estender o `user role=attendant` já existente? São papéis
> diferentes (mesa formaliza contrato e fala com o copiloto; handoff assume a conversa do
> cliente), o que justifica a separação — mas vale o aval pra não duplicar o conceito de
> "pessoa que atende via WhatsApp". Tentativa de pergunta em 2026-06-21 ficou sem resposta;
> seguimos com **entidade nova simples** e marcamos como revisável.

## 3. As entidades novas

### 3.1 Administradora (entidade)

Hoje "administradora" é só um `varchar(60)` solto em `beviProposals.administradora`
(`src/db/schema.ts:307`), preenchido com o que a Bevi retorna (ex.: `CANOPUS`). Esta feature
a eleva a **entidade de primeira classe**, com CRUD no admin.

- **O que é:** o cadastro interno de uma administradora com quem operamos + o seu **dossiê de
  operação** (1+ PDFs de procedimento de contratação).
- **NÃO é** fonte de grupos, ofertas, simulação ou números exibidos ao cliente — isso é a
  **Bevi, fonte única** (regra inviolável do projeto). A entidade Administradora é **dossiê
  operacional interno**: só alimenta o copiloto do atendente, nunca a recomendação ao cliente.
- **Vínculo com a Bevi:** casa por **nome/código** com `beviProposals.administradora`. Quando
  um caso é transbordado, a administradora da cota escolhida (que veio da Bevi) resolve qual
  dossiê o copiloto carrega.
- **CRUD admin:** cadastrar, editar, ativar/desativar, remover. (O Kairo: "o admin pode
  cadastrar e remover.")

### 3.2 Documento da administradora (PDF)

- **O que é:** o **manual de como fazer o contrato** naquela administradora (procedimento,
  campos, ordem de telas, regras). Pode haver mais de um por administradora (manual, tabela,
  anexos).
- **CRUD admin:** ao cadastrar um doc, **escolhe-se a administradora** (FK). Upload de PDF,
  remoção, versionamento.
- **Como vira contexto do copiloto:** o binário fica em object storage (MinIO local / S3
  prod — já no stack); o **texto extraído** do PDF é persistido e **injetado no system prompt
  do copiloto** (full-text + prompt caching). Ver DEC-C na §6.

### 3.3 Atendente de mesa / operação

- **Cadastro simples: nome + WhatsApp (E.164), ativo/inativo. Sem login, sem convite, sem
  email** (≠ atendente-com-login da §7). CRUD no admin.
- O WhatsApp é a chave: é pra ONDE o transbordo manda o caso, e é por ONDE o atendente
  conversa com o copiloto.

## 4. O fluxo — transbordo no kanban → copiloto no WhatsApp

```
1. Admin no kanban (src/components/admin/pipeline/kanban-board.tsx) abre o card do lead.
2. Clica "Transbordar para a mesa" e escolhe um atendente de mesa da lista.
3. O sistema resolve a administradora da cota/oferta escolhida (via beviProposals) e carrega
   o dossiê (PDF → texto extraído) daquela administradora.
4. O COPILOTO monta o dossiê do caso (cliente + cota escolhida + administradora) e, com o PDF
   injetado, envia ao WhatsApp do atendente a ORIENTAÇÃO de contratação (passo a passo).
5. O atendente formaliza o contrato na administradora e TIRA DÚVIDAS com o copiloto no mesmo
   WhatsApp ("e se o cliente não tiver comprovante?", "qual campo de lance?") — o copiloto
   responde com base no PDF + dados do caso.
6. Conclusão volta ao kanban (estágio avança / registro do transbordo é fechado).
```

- **Gatilho (DEC-B):** caminho principal = **botão manual no card** ("ter a opção de
  transbordar"). Auto-transbordo por estágio (ex.: ao entrar em "na administradora",
  round-robin pro próximo atendente) fica como **evolução** — não no corte inicial. Marcado
  revisável (pergunta sem resposta em 2026-06-21).
- **O que é transbordado:** dossiê mínimo do caso — nome do cliente, contato, cota/oferta
  escolhida (grupo, carta, parcela), administradora, e o link/identificador da proposta Bevi.
  Minimização de PII é requisito (ver §8, LGPD).

## 5. O agente copiloto (orientador do atendente)

- **Papel:** copiloto de operação. **Não** fala com o cliente — fala com o **atendente de
  mesa**, ensinando-o a executar o contrato na administradora certa.
- **Contexto injetado por caso:** (a) **texto do PDF** da administradora da cota; (b) dados
  da cota/oferta escolhida; (c) dados mínimos do cliente. "Vai ter o PDF e vai saber
  exatamente tudo" (Kairo).
- **Canal:** WhatsApp do atendente (default assumido — DEC-A). O número do atendente
  cadastrado, ao receber/enviar mensagem, é roteado para o **modo copiloto**, distinto do
  agente de vendas que atende clientes. Roteamento por número: mensagem de um WhatsApp de
  atendente de mesa cadastrado → copiloto; de cliente → vendas.
- **SDK:** mesmo padrão do agente do projeto — Vercel AI SDK 6 (`streamText`/`tool`), prompt
  com o dossiê + PDF, prompt caching no bloco estável (o manual da administradora muda pouco).

## 6. Decisões de design (assumidas por default — revisáveis)

| ID | Tópico | Decisão assumida | Por quê / status |
|---|---|---|---|
| DEC-A | Modelo do atendente de mesa + canal | **Entidade nova simples (nome+whatsapp, sem login); copiloto no WhatsApp do atendente** | Fiel a "simples, só nome e whatsapp" + "manda pro whatsapp de um deles". ⚠️ confirmar se reusa `user role=attendant`. |
| DEC-B | Gatilho do transbordo | **Botão manual no card do kanban** (caminho principal); auto por estágio = evolução | "ter a opção de transbordar". ⚠️ confirmar se quer auto-transbordo. |
| DEC-C | Consumo do PDF | **Texto extraído → full-text no system prompt + prompt caching** (não RAG/embeddings) | 1 manual por administradora cabe no contexto; mais simples e barato que pipeline de embeddings. Reavaliar só se os manuais ficarem grandes/numerosos. |
| DEC-D | Administradora × Bevi | **Cadastro interno manual** (admin cadastra), casando por nome/código com `beviProposals.administradora` | Respeita "Bevi fonte única": a entidade é dossiê operacional, não fonte de oferta. ⚠️ alternativa: auto-popular das administradoras vistas na Bevi. |
| DEC-E | Storage do binário | **Object storage** (MinIO local / S3 prod), texto extraído no Postgres | Stack já tem MinIO; binário fora do banco, texto no banco pra injeção rápida. |

## 7. Relação com o que JÁ existe (não duplicar nem quebrar)

| Já existe | Onde | Como esta feature se relaciona |
|---|---|---|
| Atendente-com-login (`user role=attendant`) + CRUD `/admin/attendants` + convite | `src/db/schema.ts:75`, `src/app/admin/(dashboard)/attendants/page.tsx`, [`../specs/attendants-crud.md`](../specs/attendants-crud.md) | **Papel diferente** (handoff de conversa do cliente ≠ mesa de operação). DEC-A decide se separa (default) ou unifica. |
| Handoff de conversa via WhatsApp | `startInterestHandoff`/`getHandoffState` em `src/lib/whatsapp/proxy.ts`, `src/lib/whatsapp/interactive-handlers.ts:216` | Gatilho atual é por sinal de interesse/assinatura no chat. O transbordo de mesa é **a partir do kanban** (admin), não automático no chat. Conceitos vizinhos, fluxos distintos. |
| FK de handoff em conversas | `conversations.handedOffUserId` (`src/db/schema.ts:197`) | Aponta pra `user`. O transbordo de mesa precisa do seu próprio registro (atendente de mesa não é `user`) — ver esboço §9. |
| Administradora como texto | `beviProposals.administradora` varchar(60) (`src/db/schema.ts:307`) | Vira a **chave de match** com a nova entidade Administradora. |
| Kanban / pipeline admin | `src/components/admin/pipeline/kanban-board.tsx`, `lead-card.tsx`, `lead-detail-panel.tsx` | Ganha a ação "Transbordar para a mesa". |
| Lista de atendentes p/ WhatsApp | `getAttendantList()` (`src/lib/whatsapp/proxy.ts:186`) | A mesa terá sua **própria** lista (atendentes de operação), separada da de handoff (default DEC-A). |

## 8. Riscos e pontos de atenção

| Tema | Ponto |
|---|---|
| **LGPD / PII no WhatsApp do atendente** | Transbordar dados do cliente pro WhatsApp de um operador é PII saindo num canal externo. Minimizar o payload (só o necessário pra contratar), registrar consentimento/base legal, e tratar o atendente como parte da operação (contrato/termo). |
| **Bevi fonte única** | A entidade Administradora **não pode** virar fonte alternativa de grupos/ofertas/números ao cliente — só dossiê de operação. Guard-rail permanente. |
| **Mesa Bevi × mesa Aja Agora** | ⚠️ A CONFIRMAR: a mesa de operação Aja Agora **substitui**, **complementa** ou **opera junto** com a mesa da Bevi? E o contrato é feito **direto na administradora** ou ainda via Bevi/Conexia? Isso define se há **multi-administradora além do que a Bevi agrega** (hoje anti-escopo no [`roadmap-mvp.md`](./roadmap-mvp.md) — exige decisão explícita). |
| **Frescor do PDF** | Procedimento de administradora muda. Versionar o doc e invalidar o cache do copiloto ao subir versão nova. |
| **Roteamento de número** | Garantir que o número de um atendente de mesa nunca caia no agente de vendas (e vice-versa) — colisão de canal já causou bug no projeto. |

## 9. Esboço de entidades (proposto — NÃO é schema final)

```
administradoras            (id, nome[unique], slug, codigo_bevi?, ativo, created_at, updated_at)
administradora_docs        (id, administradora_id→administradoras, titulo, tipo['manual'|'tabela'|'outro'],
                            storage_key, texto_extraido, versao, ativo, uploaded_by, created_at)
mesa_attendants            (id, nome, whatsapp[E.164], ativo, created_at, updated_at)
mesa_handoffs              (id, lead_id→leads, conversation_id→conversations?, mesa_attendant_id→mesa_attendants,
                            administradora_id→administradoras, status['aberto'|'em_andamento'|'concluido'|'cancelado'],
                            created_by, created_at, closed_at)
mesa_copilot_messages      (id, mesa_handoff_id→mesa_handoffs, role['assistant'|'attendant'], content, created_at)
```

> Conversa copiloto↔atendente pode reusar `conversations`/`messages` com um canal próprio em
> vez de tabelas dedicadas — decisão de implementação, não de negócio.

## 10. Onde entra no roadmap

Esta é a peça **humana** da travessia (camada 6) — complementa o acompanhamento proativo
(P0.4) e o funil admin com estágios reais (P0.6) do [`roadmap-mvp.md`](./roadmap-mvp.md).
Diferente da automação de finalização (P1.1, que depende de respostas da Bevi), a mesa de
operação **não depende da Bevi responder** — é processo nosso. Posicionamento sugerido:
onda própria, em paralelo ao P0.4-P0.6. Detalhe no roadmap.

---
*Anotado em 2026-06-21 a partir de pedido verbal do Kairo. Decisões DEC-A/DEC-B marcadas
revisáveis (pergunta sem resposta na sessão). Pontos de mesa Bevi × mesa Aja Agora e
multi-administradora espelhados em [`perguntas-abertas.md`](./perguntas-abertas.md).*
