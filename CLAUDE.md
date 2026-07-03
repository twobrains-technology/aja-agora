# Aja Agora — instruções do projeto

> Só ponteiros e invioláveis curtos. O detalhe vive na documentação — não reescreva aqui o que já está lá.

## Onde está cada coisa (documentação)

O mapa macro completo está em **[`docs/README.md`](./docs/README.md)** — comece por ele pra achar o resto.

| Precisa de… | Vá em |
|---|---|
| **O que o produto FAZ (a REGRA do fluxo)** | [`docs/jornada/jornada-canonica.md`](./docs/jornada/jornada-canonica.md) — fonte soberana; divergência código × jornada é defeito do código |
| Histórico e decisões da jornada × Bevi | [`docs/jornada/CONTEXT.md`](./docs/jornada/CONTEXT.md) |
| Por quê (ADRs) | `docs/decisoes/` (log central + `blocos/`) |
| Desenho de feature antes de codar | `docs/design/{specs,planos}/` |
| O que foi entregue | `docs/entregas/` |
| Bugs (inbox → todo → done) | `docs/correcoes/` |
| Roteiro de QA da jornada | `docs/qa/roteiro-qa.md` |
| Integração Bevi/AGX (dossiê) | `docs/integracoes/` |
| Visão de produto | `docs/visao/` |
| Guias temáticos + domínio | `docs/referencia/` |

## Inviolável — português correto em todo texto voltado ao usuário

Todo texto que o **usuário final vê** — mensagem do agente (web e WhatsApp), copy de UI, label,
botão, placeholder, toast, erro, e-mail, template — tem que estar em **português correto, com todas
as acentuações, cedilhas e til**. Acento faltando é **defeito de entrega**. Zero ASCII-fication
("voce"/"nao"/"informacoes"). Exceção: identificador de código, chave técnica ou inglês intencional.
