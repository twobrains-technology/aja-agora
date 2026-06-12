# Roadmap — MVP pré-campanha e ondas seguintes

> Criado: 2026-06-12 · Prioriza os gaps do [`gap-analysis.md`](./gap-analysis.md)
> Princípio: **a campanha define o corte.** P0 = sem isso, rodar mídia paga queima
> dinheiro ou queima marca. P1 = fecha o funil de verdade (depende de respostas
> externas). P2 = vida de consorciado. Esforços são ordens de grandeza, não promessas.

## P0 — antes da campanha (sem dependência externa; só engenharia nossa)

| # | Entrega | Por quê (negócio) | Critério binário | Esforço |
|---|---|---|---|---|
| P0.1 | **Retorno web reconhece cliente** — persistir `conversationId` + derivar estado terminal da identidade (propostas ativas), não só da conversa | Mata o risco de re-venda/proposta duplicada com tráfego pago (C2) | "Oi" pós-contratação na web = mesma resposta do WhatsApp; descoberta nunca reabre com proposta ativa | M |
| P0.2 | **Copy honesto pós-docs** — promessa "te aviso de cada passo" só permanece se P0.4 entrar junto; senão, vira "consulte por aqui quando quiser" + expectativa de prazo | Promessa quebrada no momento mais sensível (acabou de mandar documento pessoal) | Nenhuma frase do fechamento/estado terminal promete aviso que o sistema não dá | P |
| P0.3 | **Atribuição de campanha** — UTM/criativo capturado na landing → gravado no lead → visível no admin | Sem isso a campanha roda às cegas; é o dado que o "pessoal do Aja Agora" vai pedir na semana 1 | Lead criado via anúncio exibe origem no pipeline admin | P |
| P0.4 | **Acompanhamento proativo v1** — cron de `consult_proposal_status` por proposta pendente + diff `changesHistory` → mensagem WhatsApp template por transição | Cumpre a promessa do produto; reduz ansiedade pós-KYC; reativa propostas parada | Transição de status → mensagem ≤ 1h; proposta sem telefone → registrada pra retorno | M |
| P0.5 | **Dados complementares no chat** — coleta de RG/endereço/comprovante na conversa → `insert_additional_data` (já implementado, sem call site) | Hoje TODA proposta para eternamente em `endereco` (POC); sem isso, nem boleto existirá pra acompanhar | Proposta real avança de `documentoPessoal`/`endereco` sem o cliente tocar no CONEXIA | M-G |
| P0.6 | **Funil admin com estágios da travessia** — em análise / aprovada / (boleto / pago, quando existirem) | O time de campanha precisa ver onde os leads morrem | Pipeline mostra estágio real vindo do status da proposta | P-M |

**Corte honesto do P0:** P0.1 + P0.2 + P0.3 são o mínimo absoluto pra ligar mídia.
P0.4-P0.6 deveriam entrar na mesma janela — são o que transforma "anúncio → proposta"
em "anúncio → proposta que ANDA".

## P1 — fechar o funil de verdade (destravada pelas [`perguntas-abertas.md`](./perguntas-abertas.md))

| # | Entrega | Depende de |
|---|---|---|
| P1.1 | **Finalização automatizada** — disparar o equivalente ao `waitingForUniqueCode` via API | G4 (POC PATCH update-step com hash de parceiro) |
| P1.2 | **Boleto dentro da experiência** — entrega no chat/WhatsApp com copia-e-cola e vencimento | G2 (como o boleto é emitido/obtido) |
| P1.3 | **Evento "1º boleto pago" = sucesso do funil** — registro + comissão + estágio "ganho real" no admin | G1 (estados pós-inserção) + G3 (regra de comissão confirmada) |
| P1.4 | **Webhook em vez de polling** (se existir) | G5 |
| P1.5 | **SLA da mesa visível** — prazo comunicado ao cliente + alerta interno de proposta parada | SLA confirmado com a Bevi |
| P1.6 | **E2E contra ambiente de homologação** — destrava QA automatizado do funil inteiro | D3 (hash/CPF de teste da Bevi) |

> Arquitetura já decidida pra esta onda: a borda assíncrona (polling/webhook/monitoração)
> usa durable workflow — coexistindo com o chat síncrono, não o substituindo
> ([`../decisions/2026-06-11-durable-workflow-borda-assincrona.md`](../decisions/2026-06-11-durable-workflow-borda-assincrona.md), FIX-22).

## P2 — vida de consorciado (docx passo 7; hoje declaradamente fora de escopo — D8)

| # | Entrega | Depende de |
|---|---|---|
| P2.1 | Ativação — celebração pós-pagamento + manual do consorciado + permissão de comunicados | P1.3 |
| P2.2 | Comunicados de assembleia (lembrete, resultado, oportunidade de lance) | Fonte de dados de assembleia (pedido à AGX) |
| P2.3 | Inteligência de lance ("aumente 5%…") | Histórico de contemplação (mesma fonte) |
| P2.4 | Celebração de contemplação + avaliação + indicação | P2.2 |
| P2.5 | Dash do consorciado (ideia em aberto do docx) | P2.2 + decisão de produto |
| P2.6 | Refinos da descoberta: fluxo de caixa mês a mês, evolução do simulador | Aval do Bernardo |

## O que NÃO entra em nenhuma onda (anti-escopo)

- Login/área logada como pré-requisito de qualquer coisa (a tese é conversa; identidade
  por telefone/CPF resolve o reconhecimento).
- Processamento de pagamento próprio (boleto é da administradora; não tocamos dinheiro).
- Assinatura digital embutida — **proibido prometer ou construir** até a parceria
  destravar (DES-1).
- Multi-administradora além do que a Bevi agrega — outra integração só com decisão
  explícita de negócio.
