---
id: FIX-264
titulo: "resolveOfferByMention elege UM valueMatch e desiste por 'conflito nome×valor' (negação)"
status: todo
bloco: bloco-r6-mencao-polish
arquivos: [src/lib/agent/orchestrator/choose-offer.ts]
rodada: 2026-07-10 rodada 6 (Fable r5, resolver de menção v2)
---
## Gap (veredito r5)
"RODOBENS de 90 mil" → `resolveOfferByMention` elege UM valueMatch (a ÂNCORA de mesmos 90k) e desiste
por "conflito nome×valor" → negação. Menção com nome+valor da tabela deveria sempre resolver.
## Correção
- valueMatch como CONJUNTO (não um só); casar nome E valor juntos; menção negada ("não a X") tratada.
  Sempre que nome/valor casa um grupo EXIBIDO, resolve determinístico (nunca desistir/negar).
## Regressão (TDD)
- "RODOBENS de 90 mil" com RODOBENS 90k exibida → resolve o groupId certo (não desiste).
- nome+valor ambíguos → desambigua pela combinação, não nega.
