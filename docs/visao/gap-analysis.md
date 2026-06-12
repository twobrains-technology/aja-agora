# Gap Analysis — estado atual × jornada perfeita

> Criado: 2026-06-12 (auditoria de código desta data, branch `develop`)
> Régua: [`jornada-perfeita.md`](./jornada-perfeita.md). Evidências apontam código real.
> Severidade: 🔴 bloqueia a campanha/funil · 🟡 degrada a experiência · 🟢 refinamento.

## Resumo executivo

Os passos 1-5 do docx estão implementados com dados reais da Bevi e guard-rails maduros
(estado terminal, coação de payloads, tool-policy). Os gaps graves estão **nas pontas**:
a aquisição não tem atribuição de campanha, o **retorno pela web não reconhece quem já
contratou**, e a travessia pós-documentos é silenciosa e manual — o funil de negócio
(boleto pago) não existe no sistema. Em véspera de campanha, essas pontas são exatamente
onde o dinheiro entra e onde ele vaza.

## Camada 0 — Aquisição

| Gap | Hoje | Perfeito | Sev. |
|---|---|---|---|
| Atribuição de campanha | Landing rica existe (`src/app/page.tsx`: Hero/Trust/Process/Demo + chat "Modo Teatro"), mas **nenhuma captura de UTM/criativo** no caminho do chat (grep em route/lead: zero) | UTM → gravado no lead → ROI por criativo no admin | 🔴 (campanha às cegas) |
| Resgate de abandono | Opt-in WhatsApp existe como artifact (`whatsapp-optin.tsx`, FIX-5 gates) mas não há mensagem de resgate pra quem some | 1 resgate gentil via WhatsApp com a simulação pronta | 🟡 |

## Camadas 1-4 — Descoberta e recomendação

| Gap | Hoje | Perfeito | Sev. |
|---|---|---|---|
| Núcleo da descoberta | ✅ Trilho B real, gates do docx (identify/lance-value/lance-embutido), reveal com carrossel (D15), dial calibrado na oferta real (D18), nenhum número sem fonte (D11) | — | 🟢 (forte) |
| Fluxo de caixa mês a mês (docx p.4) | Não implementado — aguarda desenho com Bernardo | Oferecido após simulação | 🟡 (pendência externa) |
| Simulador — aval do Bernardo | Implementado estendendo o conceito dele (D9/FIX-3); aval pendente | Conceito validado pelo dono | 🟡 (pendência externa) |
| Campos novos da API (FIX-39 prazo, FIX-40 lanceMedio) | Anotados, não consumidos (bloco U) | Consumidos nos cards | 🟢 |

## Camada 5 — Contratação

| Gap | Hoje | Perfeito | Sev. |
|---|---|---|---|
| Fechamento + docs | ✅ `create_proposal`/`choose_offer` reais, upload server-side Conexia em produção, resumo via WhatsApp (D5), identidade não se pede 2× (D12) | — | 🟢 (forte) |
| Dados complementares (RG, endereço, comprovante) | Cliente teria que preencher as telas CONEXIA via `uselink.me` — fora do chat, e **nada o direciona pra isso** | Coletados NA conversa → `insert_additional_data` (já implementado em `bevi-api-adapter.ts:190`, **sem call site em runtime**) | 🔴 (proposta trava em `documentoPessoal`/`endereco` pra sempre — POC mostrou abandonada eterna) |
| Finalização (`waitingForUniqueCode`) | Não automatizada; depende do cliente terminar o CONEXIA | Disparada pelo sistema ao completar dados (G4 investiga o como) | 🔴 |

## Camada 6 — Travessia (o gap estrutural)

| Gap | Hoje | Perfeito | Sev. |
|---|---|---|---|
| **Retorno web pós-contratação** | `conversationId` nasce de `generateId()` a cada mount, sem persistência (`src/lib/chat/provider.tsx:80`); `contractClosed` vive no meta DA CONVERSA (`tool-policy.ts:32`) → quem volta pela web é **lead novo**: o agente pode re-rodar descoberta e oferecer OUTRA administradora pra quem já contratou. Memória Letta (cookie `aja_uid`) é best-effort, não estado duro | Conversa retomada no mesmo device; estado de fechamento derivado da IDENTIDADE (propostas ativas por CPF/telefone), valendo em qualquer conversa nova | 🔴🔴 (o pior gap em cenário de campanha — ver [`pos-contratacao-canais.md`](./pos-contratacao-canais.md)) |
| Promessa sem mecanismo | O fechamento diz "te aviso de cada passo" (e o estado terminal reforça: "a Aja Agora acompanha cada passo e avisa", `system-prompt.ts:863`) — mas **não existe NENHUM processo proativo**: zero polling agendado, zero webhook, zero mensagem espontânea | Ou o aviso existe, ou a promessa muda. (Perfeito = existe) | 🔴 (promessa quebrada sistematicamente) |
| Status sob demanda | ✅ `check_proposal_status` em runtime (FIX-14): consulta AO VIVO e responde de dentro do estado terminal | + versão proativa (transição → mensagem) | 🟢 (a metade reativa está pronta) |
| Visibilidade pós-inserção | Estados após `waitingForUniqueCode` **nunca observados** (G1); boleto/pagamento sem sinal na API (G2); sem webhook (G5) | Pipeline observável até "pago" | 🔴 (bloqueado por respostas da Bevi) |
| Funil admin × funil real | Pipeline de leads existe (7 estágios + eventos + KPIs), mas o "ganho" de hoje = fechamento no chat, não boleto pago | Estágios da travessia (em análise → aprovada → boleto → **pago**) espelhados no admin | 🟡 |
| SLA / proposta parada | POC: 4-5h sem transição é normal; abandonada fica `pending` eterna — e ninguém é alertado | Timeout próprio → nudge ao cliente + alerta interno | 🟡 |

## Camadas 7-8 — Ativação e vida no grupo

| Gap | Hoje | Perfeito | Sev. |
|---|---|---|---|
| Ativação (boas-vindas pós-pagamento) | Inexistente (depende da camada 6 existir) | Celebração + manual do consorciado + permissão de comunicados | 🟡 (sequência natural) |
| Pós-venda canônico (docx p.7) | **Declaradamente fora de escopo** (D8): sem monitoramento de assembleia, sem comunicados, sem celebração de contemplação | Camada 8 completa | 🟡 (fase própria, depois do funil fechar) |
| Dados de assembleia/histórico | API atual não fornece (D6); pedido à AGX em aberto | Fonte de dados de assembleia | 🟡 (pendência externa) |

## Transversais

| Gap | Hoje | Perfeito | Sev. |
|---|---|---|---|
| Identidade cross-canal | Unificação parcial: web→WhatsApp quando o cliente compartilha o telefone; **duas memórias Letta separadas** (anon-cookie × phone), não reconciliadas | Telefone/CPF como chave única do relacionamento; uma memória | 🟡 |
| E-mail como canal | Não coletado, não enviado (D5: resumo é WhatsApp-only) | E-mail como canal secundário de documentos formais (proposta, boleto) | 🟢 (futuro) |
| E2E contra Bevi real | 🔒 Bloqueado: `create-proposal` cria proposta REAL (D3) — sem hash/CPF de homologação | Ambiente de homologação da Bevi | 🟡 (pendência externa; vira risco operacional da campanha: testes manuais criam propostas reais na mesa) |

## Leitura de assessoria (por que essa ordem)

1. **Campanha sem atribuição = orçamento às cegas** — gap barato de fechar, valor imenso.
2. **Campanha + retorno web quebrado = dano direto**: tráfego pago aumenta exatamente o
   cenário onde o agente re-prospecta cliente que já fechou. É risco de marca e de
   confusão na mesa (propostas duplicadas).
3. **Promessa "te aviso" sem mecanismo** mina a confiança no momento mais sensível (o
   cliente acabou de mandar documento pessoal e está esperando). A versão mínima
   (polling + WhatsApp template) não depende da Bevi responder nada.
4. **Travessia completa (boleto/pagamento)** é o destino, mas depende de G1/G2/G3/G5 —
   por isso é onda própria no [`roadmap-mvp.md`](./roadmap-mvp.md), destravada pelas
   [`perguntas-abertas.md`](./perguntas-abertas.md).
