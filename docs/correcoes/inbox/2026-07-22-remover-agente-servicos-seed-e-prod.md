---
slug: remover-agente-servicos-seed-e-prod
titulo: "Remover completamente a modalidade/agente de Serviços (seed + banco de prod, web e WhatsApp)"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-22 — thread interna do time relatando teste com cliente
evidencia:
  - _evidencia/2026-07-22-remover-agente-servicos-thread-whatsapp-time.png
mexe_em:
  - (a confirmar — ver achados do find-code sobre seed/schema de personas)
---

## Palavras do operador
> "veja a thread anoite o bug. temos que apagar do seed e do banco de prod o agent de servicos. nem pelo whats enm pela web deve podder falar com ele. nem ter essa ocpao."

Citação da thread anexada (print, equipe interna):
- Bernardo Canedo Plusoft: "Ela simulou uma carta de serviços. Acho que não deveríamos oferecer essa modalidade."
- Bruna Perrotta: "Não mesmo... não estava habilitado" / "Só imóvel, auto e moto"
- Bernardo: "Aí o agente disse que teve problema na integração"
- Bruna: "vai mandando aí que vamos ajustando. esse aí realmente não era para estar mais disponível... tem um agente exclusivo para serviço - temos que demitir ele" / "as opções foram removidas mas ele continuava no escritório"

## Cenário
- **Rota/tela:** Não especificado no print — cliente conseguiu chegar até simular uma carta de "Serviços" mesmo com a modalidade supostamente já desabilitada nas opções visíveis.
- **Passos:** 1) Cliente conversa com o agente (canal não confirmado — provável WhatsApp pelo teor da thread) 2) Consegue simular uma carta de crédito pra modalidade "Serviços" 3) Time percebe que essa modalidade não deveria nem existir como opção.
- **Dados usados:** N/A — bug estrutural de catálogo/seed, não de um caso específico.

## Esperado × Atual
- **Esperado:** Modalidade "Serviços" não existe mais em lugar nenhum — nem no seed, nem no banco de produção, nem como opção oferecida pelo agente (web ou WhatsApp). Só devem restar: Imóvel, Auto, Moto.
- **Atual:** Mesmo com "as opções removidas" (tentativa anterior de tirar da UI/prompt), o agente "continuava no escritório" — ou seja, a remoção foi superficial (só na superfície de opções apresentadas), e o dado/registro de fundo (seed/banco) ainda permite a modalidade ser usada, causando simulação de carta de serviços que não deveria ser possível.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Suspeita: existe uma persona/linha de seed "Serviços" no banco (ao lado de Imóvel/Auto/Moto) e/ou uma administradora/oferta cadastrada pra esse bem que o agente ainda consegue tool-call. Tentativa anterior de "remover as opções" provavelmente mexeu só em prompt/UI, não na fonte (seed + DB de prod), daí o agente continuar "no escritório". Precisa: (1) achar tabela/seed de personas e a entrada de Serviços, (2) remover do seed, (3) rodar migração/script pra apagar a persona correspondente do banco de prod, (4) garantir que nem tool-policy nem gate-questions ofereçam essa modalidade em nenhum canal. Busca ampla disparada via agente `find-code` pra apontar os arquivos exatos (seed, schema, tool-policy) — resultado ainda pendente no momento da captura deste card.
