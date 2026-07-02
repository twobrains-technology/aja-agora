---
slug: prazo-gate-ausente-imovel-prod
titulo: "Perguntar o prazo ('em quanto tempo quer o bem?') na jornada de imóvel — gate pulado em produção"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada IMÓVEL, canal WEB, PRODUÇÃO (https://ajaagora.com.br)
evidencia: []
mexe_em:
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/qualify-state.ts
---

## Palavras do operador
> (Achado do QA dono-de-produto, rodada automatizada em produção.)
> "A jornada canônica manda perguntar 'Em quanto tempo você gostaria de estar com seu bem?' antes do lance. Na produção esse passo não apareceu."

## Cenário
- **Rota/tela:** https://ajaagora.com.br → jornada imóvel → passo 2 (entender o cliente)
- **Passos:** valor do bem (R$ 300.000) → **direto para** "Você teria uma reserva pra dar um lance?" → valor do lance → lance embutido → busca. O gate de **timeframe/prazo** (opções: o mais rápido · até 6 meses · 1 ano · 2 anos+ · sem pressa) da jornada-canonica §2 **não foi apresentado**.
- **Dados usados:** CONTA2 homolog (Mirella).

## Esperado × Atual
- **Esperado:** entre "valor do bem" e "lance", a jornada pergunta o prazo desejado (jornada-canonica §2). O eixo `objetivo` da Bevi é derivado do prazo (ver `qualify-config.ts` citado no card `2026-06-21-analyzer-infere-prazo-de-orcamento`), então pular o prazo faz a busca sair com premissa não confirmada.
- **Atual:** o gate de prazo não aparece na jornada de imóvel em produção. A recomendação sai sem o cliente ter escolhido o horizonte.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Pode ser (a) o fix do card `2026-06-21-analyzer-infere-prazo-de-orcamento` (que faz `nextGate` disparar `timeframe`) **ainda não estar em produção**, ou (b) o prazo estar sendo inferido/default e pulando o gate por outro caminho na jornada de imóvel. Confirmar a versão em produção e a ordem de gates de `qualify-state.ts` para o tipo `imovel`. **Antes de tratar como defeito de código, confirmar com o Kairo se pular o prazo na jornada de imóvel é intencional** (decisão de produto) — a canônica diz que não é.
