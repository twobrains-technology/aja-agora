# Sessão de anotação — Ata mudanças AJA AGORA (2026-07-04)

Fonte: Ata de alinhamento com o cliente ([`docs/jornada/atas/2026-07-04-mudancas-cliente.md`](../jornada/atas/2026-07-04-mudancas-cliente.md)).
Onda: `integ/ata-mudancas-aja`. Numeração: **FIX-215..224** (maior FIX anterior = 214).

## Triagem da Ata × código (verificado com `file:line`)

**Já feito (não virou card):** incremento 1.000 (3.1), persistência de conversa (12), **celular
auto no WhatsApp** (9 — `identify-capture.ts:80` `waIdToCelular`; o agente já só pede CPF).

**Não-dev / fora da onda:** site Figma do Lucas (2), **comprar número da mesa na Meta** (10 —
compra + config; a separação de canal já existe da mesa mergeada), mockup/vídeo pro grupo (13),
demo backoffice (11); backlog P2: voltar às opções (7), sugerir não fechar (4.3), pop-up,
granularidade por bem. **Onda 2:** recomendação em 2 estágios completa (4.3), proposta/PDF com
marca própria (8 — fechamento Trilho A travado, D10).

## Blocos da onda 1 (paralelos — nível 2/3, ordem de merge: descoberta → jornada → cards)

| Bloco | Cards | Superfície |
|---|---|---|
| `bloco-jornada-conversa` | FIX-216 copy reserva de cota · FIX-217 form→texto WhatsApp · FIX-215 remover lance do início | conversa/copy/canal |
| `bloco-descoberta-busca` | FIX-218 valor digitável · FIX-219 busca com/sem embutido | descoberta/valor/busca |
| `bloco-cards-recomendacao` | FIX-220 1ª lista mesmo peso · FIX-221 parcela pré/pós+embutido · FIX-223 lance médio · FIX-222 logo admin · FIX-224 reordenar 3 blocos | recomendação/cards |

Decisões de desenho (T2=amortiza, remover lance, reserva de cota, escopo) no ADR
[`docs/decisoes/blocos/2026-07-04-ata-mudancas-aja.md`](../decisoes/blocos/2026-07-04-ata-mudancas-aja.md).
Jornada canônica atualizada: seção "Refino Ata 2026-07-04".

## Pendências levantadas
- ⚠️ **PENDENTE-Bernardo:** validar o número do modelo de amortização do lance (FIX-221) antes de prod.
- ⚠️ **PENDENTE (assets):** logos reais das administradoras (FIX-222 entrega pipeline + fallback).
- ⚠️ **PENDENTE-KAIRO:** comprar o número da mesa na Meta (~R$30).
