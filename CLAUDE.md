# Aja Agora — instruções do projeto

> Só ponteiros e invioláveis curtos. O detalhe vive na documentação — não reescreva aqui o que já está lá.

## Onde está cada coisa (documentação)

O mapa macro completo está em **[`docs/README.md`](./docs/README.md)** — comece por ele pra achar o resto.

| Precisa de… | Vá em |
|---|---|
| **Como o produto se COMPORTA (referência viva)** | [`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`](./docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/) — o mockup HTML + o handoff |
| **A ordem real dos gates** | o CÓDIGO: `nextGate` em `src/lib/agent/qualify-state.ts` |
| Decisões do cliente (histórico) + invariantes duros | [`docs/jornada/decisoes-do-cliente.md`](./docs/jornada/decisoes-do-cliente.md) |
| Contexto da jornada × Bevi | [`docs/jornada/CONTEXT.md`](./docs/jornada/CONTEXT.md) |
| Por quê (ADRs) | `docs/decisoes/` (`blocos/`) |
| Desenho de feature antes de codar | `docs/design/specs/` |
| O que foi entregue | `docs/entregas/` |
| Bugs (inbox → todo → done) | `docs/correcoes/` |
| Roteiro de QA da jornada | `docs/qa/roteiro-qa.md` |
| Integração Bevi/AGX (dossiê) | `docs/integracoes/` |
| Visão de produto | `docs/visao/` |
| Guias temáticos + domínio | `docs/referencia/` |

## Inviolável — NÃO engesse o agente

O produto é uma **conversa de vendas**, não um formulário com balões. O agente já foi engessado uma
vez (roteiro do `jornada.docx` travado em copy literal, gates sem saída lateral, sanitizer comendo
as perguntas do modelo) e o resultado foi um agente **bitolado, que respondia sempre a mesma coisa**.
Rebaixamos aquilo em 2026-07-13. Não reconstrua.

**A regra que separa o que é código do que é conversa:**

- **Invariante verificável** (a Bevi exige CPF antes de simular; número nunca é inventado; nunca
  prometer "cota reservada" antes da contratação) → **vira código determinístico.** Lista fechada em
  [`docs/jornada/decisoes-do-cliente.md`](./docs/jornada/decisoes-do-cliente.md).
- **Todo o resto** (como perguntar, em que palavra, com que empatia, em que ordem quando o usuário
  puxa pra outro lado) → **é do MODELO.** Não vire regra-no-prompt, não vire regex de teste, não
  vire texto fixo no servidor.

**PROIBIDO** (foi exatamente isso que quebrou o agente):

- Responder por **texto pré-fabricado sem consultar o LLM** porque "o modelo pode errar". Se o
  usuário diz "não entendi", quem responde é o modelo — não um `const` repetindo a mesma pergunta.
- **Frase canônica obrigatória** ("não improvise outras formulações"). Nenhuma.
- **Teste que trava a copy** por regex literal (`/r\$ 100 mil/`). Teste **invariante**, nunca script
  de fala.
- **Directive que reduz o modelo a "escreva 1 frase e não chame tool"** como padrão do turno.
- Empilhar uma camada nova (prompt + policy + guard + sanitizer) pra remendar o sintoma da camada
  anterior. Quando o código assume um invariante, **remova a regra-no-prompt correspondente** — não
  deixe as duas.

Falha de QA na conversa? A primeira hipótese é **prompt/contexto ruim ou trava demais**, não "falta
uma trava". Só se o dado provar o contrário é que se aperta — e aí num invariante, não numa frase.

## Inviolável — português correto em todo texto voltado ao usuário

Todo texto que o **usuário final vê** — mensagem do agente (web e WhatsApp), copy de UI, label,
botão, placeholder, toast, erro, e-mail, template — tem que estar em **português correto, com todas
as acentuações, cedilhas e til**. Acento faltando é **defeito de entrega**. Zero ASCII-fication
("voce"/"nao"/"informacoes"). Exceção: identificador de código, chave técnica ou inglês intencional.
