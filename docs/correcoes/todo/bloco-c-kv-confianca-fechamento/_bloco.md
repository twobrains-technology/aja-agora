---
bloco: bloco-c-kv-confianca-fechamento
branch: feat/kv-confianca-fechamento
workspace: feat-kv-confianca-fechamento
onda: 1
depends_on: []
paralelo_com: [bloco-a-kv-topo-conversao, bloco-b-kv-narrativa-jornada]
itens: [FIX-353]
escopo_arquivos:
  - src/components/kv/kv-depoimentos.tsx
  - src/components/kv/kv-faq.tsx
  - src/components/kv/kv-confianca.tsx
  - src/components/kv/kv-comparacao.tsx
  - src/components/kv/kv-footer.tsx
---
# Bloco C — confiança e fechamento (Depoimentos, FAQ, Confiança, Comparação, Footer)

Nível 1 (independente) em relação aos blocos A e B — arquivos totalmente disjuntos
dentro de `src/components/kv/`. Consome (não edita) os átomos de
`src/components/kv/ui/` (`KvCtaButton`, `KvEyebrow`, `KvContainer`) e o tipo
`TheaterOpener` já prontos na base — sem overlap de escrita, merge limpo esperado.
É o pacote mais pesado em linhas (963) — maior sessão da onda.
