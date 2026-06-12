# Perguntas Abertas — o que só pessoas podem responder

> Criado: 2026-06-12 · Convenção: resposta chegou → mover pra "Respondidas" com data e
> fonte, e PROPAGAR a consequência (primer/gap-analysis/CONTEXT.md). Nunca deletar.
> IDs G1-G5 vêm de [`../jornada/jornada-ate-boleto.md`](../jornada/jornada-ate-boleto.md);
> D3/DES-1 de [`../jornada/CONTEXT.md`](../jornada/CONTEXT.md).

## Pro Kairo decidir/confirmar (negócio Aja Agora)

| ID | Pergunta | Por que importa | Destrava |
|---|---|---|---|
| Q-K1 (=G3) | A comissão é disparada pelo **1º boleto pago**? Qual o evento exato e há estorno por desistência precoce? | Define o evento de SUCESSO do funil inteiro — tudo no P1 mira esse evento | P1.3 |
| Q-K2 | Quem é o financiador citado como "AGE/AGX" e qual o vínculo formal com a comissão? | Primer §5 está com ⚠️; afeta a quem reportamos o funil | Clareza do modelo de receita |
| Q-K3 | Data prevista da campanha e canais (Meta? Google?) | Dimensiona a janela do P0 e quais UTMs/integrações de atribuição importam | P0.3 |
| Q-K4 | O resgate de abandono via WhatsApp (1 mensagem) é aceitável como política? | Opt-in existe; falta a decisão de usá-lo pra resgate | Camada 0 |

## Pra Bevi (parceria/API)

| ID | Pergunta | Por que importa | Destrava |
|---|---|---|---|
| Q-B1 (=G1) | Quais estados existem **após** `waitingForUniqueCode`? (aprovada, reprovada, boleto, paga?) Exemplos reais? | A POC nunca observou o pós-inserção; sem isso o acompanhamento é cego no trecho final | P1.2/P1.3 |
| Q-B2 (=G2) | Como o **boleto** é emitido e entregue? (e-mail da administradora? endpoint? mesa?) Conseguimos obtê-lo via API? | "Boleto dentro da experiência" depende 100% disso | P1.2 |
| Q-B3 (=G5) | Existe **webhook** de mudança de status/pagamento? (Q10 da aderência) | Polling vs webhook muda a arquitetura da borda assíncrona | P1.4 |
| Q-B4 (=D3) | Hash/loja de **homologação** ou CPF de teste autorizado? | `create-proposal` real bloqueia E2E automatizado — e testes manuais criam propostas reais na mesa | P1.6 + QA da campanha |
| Q-B5 | Qual o **SLA da mesa** (proposta inserida → análise → efetivação)? O que acontece com proposta abandonada (não expira — pending eterno)? | Expectativa comunicada ao cliente (P0.2) e alerta interno (P1.5) | P0.2/P1.5 |
| Q-B6 (=DES-1) | Existe (ou existirá) fluxo de **assinatura digital** via API/embedded? | Hoje: proibido prometer; se destravar, reavaliar o passo 5 | Futuro do fechamento |
| Q-B7 | Papel formal da cadeia: Bevi é corretora/representante? Quais administradoras além da CANOPUS entram pelo Trilho B? | Primer §5; afeta copy ("administradora escolhida pela Aja Agora") e compliance | Clareza institucional |
| Q-B8 (=G4, interna+Bevi) | Os PATCHes `update-step` do Trilho B funcionam com o hash do link de parceiro? É o caminho sancionado pra finalizar a proposta? | Automatizar a finalização sem gambiarra | P1.1 |

## Pro Bernardo (produto)

| ID | Pergunta | Por que importa | Destrava |
|---|---|---|---|
| Q-BE1 | Aval da [`proposta-simulador.md`](../jornada/proposta-simulador.md) (dial + plan-estimate já no caminho padrão) | Regra de produto: não finalizar o simulador sem o aval dele | P2.6 |
| Q-BE2 | Desenho do **fluxo de caixa mês a mês** (docx passo 4) | Único item do passo 4 ainda não implementado | P2.6 |
| Q-BE3 | Validação do tom dos cards pós-poda (D14/D15) com tráfego real de campanha | Decisão dele; campanha é o teste de fogo | — |

## Respondidas

*(vazio — mover pra cá com data, fonte e consequência aplicada)*
