# Logos das administradoras

Os 7 SVGs das administradoras que a **Bevi** opera, conforme
`beviconsorcio.com.br/administradoras` (conferido em 31/08/2026):
Âncora, Banco do Brasil, Canopus, Itaú, Rodobens, Servopa e Tradição.

## Por que os arquivos vivem aqui, e não só em `administradoras.logo_url`

O pipeline do FIX-222 (Ata 2026-07-04) sempre soube casar administradora com
logo, mas nunca teve o que casar: a rota que cadastra administradora
(`POST /api/admin/administradoras`) não aceita `logoUrl`, então **não existia
caminho para alimentar a coluna**. O asset versionado é o piso; o banco continua
com precedência, para trocar arte ou incluir administradora nova sem deploy.

A resolução está em `logoLocalDaAdministradora`
(`src/lib/consorcio/administradora-logo.ts`), que casa por token distintivo —
o nome chega como "ITAÚ" da Descoberta e "Itaú Consórcio" do cadastro.

## Normalização por peso óptico (não mexa sem entender isto)

Os arquivos **não** estão como a Bevi publica. O original vinha numa caixa de
140×124 com o artwork ocupando 3,5% a 8,3% da área, e — o que importa — com
altura de conteúdo variando 2,4× entre eles (Rodobens 22,0 · Itaú 52,9).

Renderizados com uma altura só, o resultado era desigual de um jeito que CSS não
conserta: o Rodobens, wordmark de uma linha, ficava enorme; o Itaú e o Servopa,
blocos de três linhas, viravam borrão, porque a altura se dividia entre as
linhas. É o problema clássico de fileira de logos.

Cada arquivo teve o `viewBox` recortado ao conteúdo real e depois expandido por
um **peso óptico** — quanto da caixa a marca deve ocupar —, de forma que uma
altura única no CSS (`h-7`) deixe os sete com presença equivalente:

| logo | peso | proporção | largura a 28px |
|---|---|---|---|
| rodobens | 0,46 | 6,09:1 | ~79px |
| ancora | 0,68 | 3,21:1 | ~61px |
| tradicao | 0,76 | 3,35:1 | ~72px |
| canopus | 0,84 | 3,87:1 | ~91px |
| banco-do-brasil | 0,84 | 3,36:1 | ~79px |
| servopa | 0,92 | 2,86:1 | ~74px |
| itau | 1,00 | 2,60:1 | ~73px |

Nenhum path foi tocado — só `viewBox`, `width` e `height`. Trocar um arquivo pelo
original da Bevi sem refazer esse cálculo quebra o equilíbrio da fileira.

## Selo "Representante autorizado"

Três arquivos (Itaú, Banco do Brasil, Servopa) não são a marca limpa: são o selo
de credenciamento **da Bevi**, com os dizeres "Representante autorizado" /
"Parceiro autorizado". Decisão do Kairo em 31/08/2026, ciente de que isso afirma
credenciamento na tela do cliente. Trocar por marca limpa exige buscar nos
manuais de marca das próprias administradoras.
