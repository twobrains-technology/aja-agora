---
id: FIX-399
titulo: "A lista que a tela oferece não tem as chaves que a régua pede — o toque de fora da janela nunca sai"
status: done
bloco: remarketing-fora-da-janela
arquivos:
  - src/lib/validations/whatsapp-template.ts
  - src/lib/validations/whatsapp-template.test.ts
rodada: 2026-09-29
commit: (ver git log)
executado_em: 2026-09-29
---
## Palavras do operador
Kairo, 29/09 (depois do deploy): *"pra mim nao precisa"* (template) — e, ao ouvir que o caminho de
fora da janela **já existe implementado**: *"pode criar os 3 genericos na meta entao por favor, e
ajustar isso no banco para deixar ja 100% funcional sem gap"*.

## Cenário exato (medido no código, 29/09)
O motor da régua monta a lista de chaves candidatas do toque em `chavesDoToque(fase, objetivo)`
(`src/lib/remarketing/motor.ts:203`):

```
[ remarketing_<fase>_<carro|moto|imovel>,  remarketing_<fase>_generico ]   // bem conhecido
[ remarketing_<fase>_generico ]                                            // sem bem
```

`fase` ∈ `inicio | viu_oferta | fechamento` (`sinais-do-funil.ts:455`).

A tela por onde um template nasce (`template-form-dialog.tsx:310`) oferece a lista
`OBJETIVOS_DE_REMARKETING`, e o rodapé dela diz, com todas as letras: *"o motor escolhe o template
pela chave — um nome fora desta lista só enfileira o toque e a campanha não sai"*.

**As duas listas não se cruzavam.** A lista da tela traz o caminho da **campanha**
(`remarketing_oportunidade_carro|moto|imovel`, `remarketing_autoridade_v1` — os quatro estão
`APPROVED` na WABA `2536995250087380` desde julho). A régua pede a família por **fase**, e nenhuma
delas estava na lista. Quem criasse o template de retomada seguindo a tela nascia com uma chave que
o motor nunca pede: o toque ia para `whatsappOutboundQueue` e nunca saía.

Efeito prático: só quem está **fora da janela de 24h** é atingido — ou seja, exatamente a
**reentrada dos parados**, que é o caso de uso que a régua foi feita para cobrir.

## O que mudou
1. **Os três genéricos da régua entraram na lista do form**
   (`remarketing_inicio_generico`, `remarketing_viu_oferta_generico`, `remarketing_fechamento_generico`)
   com `modo: "TEXT"` — sem arte, texto + botão. O tipo do catálogo passou a aceitar `TEXT`, que o
   form já suportava como modo de conteúdo.
2. **Guarda contra a volta do defeito**: o teste agora cobra o contrato, não a lista solta —
   para cada fase, `chavesDoToque(fase, null)` tem que estar entre as chaves oferecidas, e o genérico
   tem que continuar sendo o **último** candidato.

## Provado
- `pnpm -s vitest run src/lib/validations/whatsapp-template.test.ts` → **34 verdes**.
- `pnpm -s typecheck` → limpo.
- Em produção, os três foram criados e submetidos **pelo fluxo do próprio app**
  (`POST /api/admin/whatsapp/templates` → `/[id]/submit`), com `metaName`
  `aja_agora_remarketing_<fase>_generico`, `category MARKETING`, `pt_BR`, corpo **sem placeholder** —
  o ciclo chama `enviarTemplate` sem `params` (`remarketing-cycle.ts:1004`), então variável no corpo
  do template falharia o envio na hora do disparo.
- Estado na Meta (29/09 18:26): os três `PENDING`. Quando virarem `APPROVED`, o `sync` do admin
  esvazia a fila sozinho (`flushOutboundQueue`) — nenhum passo manual.

## Fica de fora (decisão do operador, não defeito)
Os templates por **bem** (`remarketing_<fase>_carro|moto|imovel`) não existem: o genérico é o
fallback e já resolve todo toque. Criar os nove é refinamento de personalização, não requisito.