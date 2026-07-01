# Roadmap — Pós-venda 24h (item #18 revisão Bruna v1)

**Data:** 2026-05-16
**Status:** Especificação aberta. Não implementado nesta branch (`fix/bruna-v1-review`).
**Trigger:** Bruna v1 review — "*Como será o pós venda? Nas primeiras 24h: mensagem de boas-vindas, acesso à área do cliente, calendário, vídeo 'próximos passos'.*"

## Contexto

Após o cliente clicar "Tenho interesse" e ter o lead capturado, hoje a jornada termina em "Pronto, [nome]! Vamos entrar em contato pra finalizar." Sem follow-up estruturado nas primeiras 24h — momento crítico de retenção em consórcio (taxa de desistência em 7d é o segundo maior dropout do funil, atrás só do dropout de simulação).

## Escopo proposto

### 1. Mensagem de boas-vindas (T+0, imediato)

- **Canal:** WhatsApp (canal preferencial do lead) + e-mail fallback.
- **Conteúdo:** confirmação do interesse, recap do plano escolhido (administradora, parcela, prazo), próximo passo claro (assinatura ou contato do consultor humano).
- **Requisito técnico:** trigger ao `present_lead_form` retornar com `captureLead` sucesso.

### 2. Acesso à área do cliente

- **Conteúdo:** link mágico de primeiro acesso (Better Auth magic link com TTL de 7 dias) → dashboard com plano escolhido, histórico de simulações, status do contrato.
- **Requisito técnico:** rota nova `/cliente/[token]` + Better Auth magic link provider + dashboard MVP com placeholder de status.

### 3. Calendário

- **Conteúdo:** convite para call de 30min com consultor humano sênior pra esclarecer dúvidas finais antes da assinatura.
- **Requisito técnico:** integração com calendário (Cal.com self-hosted ou Google Calendar API). Decisão de provider em ADR separado.

### 4. Vídeo "próximos passos"

- **Conteúdo:** vídeo curto (2-3 min) explicando: assinatura → adesão ao grupo → primeiras parcelas → assembleias → lance → contemplação. Pode ser hospedado em Cloudflare Stream ou self-hosted.
- **Requisito técnico:** componente de player no dashboard cliente + 1 vídeo produzido (fora do escopo dev — produção visual).

## Métricas de sucesso

- Taxa de ativação 7d (lead → cliente assinado) atual vs futuro
- Tempo médio entre lead e assinatura
- Taxa de no-show em calls (se incluir calendário)

## Dependências

- Better Auth já está no projeto (lead capture)? Validar.
- WhatsApp Business API com template approval (mensagem de boas-vindas é template marketing → Meta aprova).
- Cal.com instance ou conta Google Workspace pra calendário (decisão).
- Produção do vídeo (responsabilidade da Bruna ou stakeholder de marketing).

## Não-objetivos desta fase

- Não inclui CRM completo (apenas dashboard mínimo de status do consórcio).
- Não inclui notificações de assembleia (vai pra fase posterior).
- Não inclui app mobile dedicado (web only).

## Pontos abertos

- Quem produz o vídeo "próximos passos"? Cronograma?
- Cal.com self-hosted ou Google Calendar API? (custo vs flexibilidade)
- Template WhatsApp boas-vindas precisa aprovação Meta — janela de 1-2 semanas.

## Próximo passo

Brainstorm com Bruna pra cravar:
1. Cronograma estimado dos 4 deliverables (T+0, T+1h, T+6h, T+24h?)
2. Conteúdo concreto da mensagem de boas-vindas + vídeo
3. Quem é o "consultor humano" no calendário (Bruna, Kairo, terceiro?)

Após cravar, abrir spec de implementação separado com TDD plan por deliverable.
