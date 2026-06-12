# Visão de Produto — o "contexto perfeito" da jornada Aja Agora

> Criado: 2026-06-12 · Mantenedor: assessoria de negócio (Claude) + Kairo
> Gatilho: campanha de divulgação do Aja Agora se aproximando — o consórcio precisa ser
> executável pelo agente de ponta a ponta, de forma autônoma.

## O que é esta pasta

A camada de **assessoria de produto** do projeto: o que a plataforma DEVERIA ser no seu
melhor ("suprassumo"), onde ela está hoje, e o caminho entre os dois. É o lugar onde a
jornada inteira — do anúncio ao consorciado contemplado — é pensada como negócio, antes
de virar plano de implementação.

## Hierarquia de autoridade (não inverter)

1. **[`../jornada/jornada-canonica.md`](../jornada/jornada-canonica.md)** — REGRA. Visão
   do cliente (origem `jornada.docx`). Divergência código×docx = defeito do código.
2. **[`../jornada/CONTEXT.md`](../jornada/CONTEXT.md)** — decisões tomadas (D1-D18),
   desvios de entendimento registrados (DES-1) e fatos técnicos da Bevi.
3. **`docs/visao/` (esta pasta)** — north star + gaps + specs propostas. **Propõe, não
   sobrepõe.** Quando a visão daqui conflitar com o docx, o caminho é recalibrar com o
   cliente (padrão DES-1) — nunca tratar o docx como errado por conta própria.

## Mapa dos documentos

| Documento | Pergunta que responde | Quando atualizar |
|---|---|---|
| [`consorcio-primer.md`](./consorcio-primer.md) | Como funciona consórcio (domínio) e quem é quem na nossa cadeia? | Quando uma resposta da Bevi/AGX corrigir uma premissa |
| [`jornada-perfeita.md`](./jornada-perfeita.md) | Como é a jornada no seu melhor, ponta a ponta (camadas 0-8)? | Só com decisão de produto (Kairo/Bernardo) |
| [`gap-analysis.md`](./gap-analysis.md) | Onde o código de hoje fica aquém da jornada perfeita? | Toda feature mergeada que feche (ou abra) um gap |
| [`pos-contratacao-canais.md`](./pos-contratacao-canais.md) | O que o agente faz quando o cliente volta (web × WhatsApp), hoje × MVP × futuro? | Quando o comportamento de retorno mudar |
| [`roadmap-mvp.md`](./roadmap-mvp.md) | O que é P0 antes da campanha, e o que vem depois? | Re-priorização ou conclusão de onda |
| [`perguntas-abertas.md`](./perguntas-abertas.md) | O que só Kairo/Bernardo/Bevi/AGX podem responder? | Sempre que uma resposta chegar (mover pra "respondidas", nunca deletar) |

## Convenção de manutenção (contexto VIVO, não foto)

- **Gap fechado = gap-analysis atualizado no MESMO PR** da feature. Gap sem dono no
  roadmap é gap esquecido.
- **Resposta externa chegou** (Bevi, Bernardo, AGX) → atualizar `perguntas-abertas.md`
  E propagar a consequência (primer, gap-analysis, ou `../jornada/CONTEXT.md` se virar
  decisão).
- **Fatos sempre com evidência**: afirmação sobre o código aponta `arquivo:linha`;
  afirmação sobre a Bevi aponta a POC/spec; premissa não verificada é marcada
  ⚠️ A CONFIRMAR — este é um documento de negócio, mas a disciplina é de engenharia.
- Commits que só tocam esta pasta: `docs: ...`.

## TL;DR da visão (jun/2026)

A descoberta e o fechamento (passos 1-5 do docx) estão fortes e rodando com dados reais
da Bevi. O que separa a plataforma de "executar consórcio de forma autônoma" são três
elos, em ordem de urgência:

1. **O retorno** — quem já contratou e volta (especialmente pela web) precisa ser
   reconhecido e atendido como cliente, não re-prospectado como lead. Hoje a web não
   retoma a conversa e o estado de fechamento fica órfão (detalhe em
   [`pos-contratacao-canais.md`](./pos-contratacao-canais.md)).
2. **A travessia** — entre "ficha completa" e a efetivação na administradora existe um
   limbo (mesa, análise, inserção) que hoje é silencioso e manual. O funil de negócio só
   fecha no **1º boleto pago** (hipótese G3, a confirmar) — a jornada não pode terminar
   antes dele ([`../jornada/jornada-ate-boleto.md`](../jornada/jornada-ate-boleto.md)).
3. **A vida de consorciado** — pós-venda canônico (passo 7 do docx): assembleias,
   lances, contemplação, indicação. É onde a promessa "a Aja Agora segue com você até a
   contemplação e depois dela" se prova.

**Lema (docx):** *"Seu objetivo primeiro. O melhor consórcio depois."*
