// Que tipo de mensagem de mídia cabe pra cada arquivo — e se a Meta aceita.
//
// Isto é código, e não "o atendente que se vire", por dois motivos concretos:
//
//  1. A Meta REJEITA por tipo e por tamanho, com limites diferentes por
//     categoria (imagem 5 MB, áudio 16 MB, documento 100 MB). Descobrir isso só
//     na resposta da API significa o anexo já ter subido pro S3 e o atendente
//     levar um erro cru depois de esperar o upload.
//  2. Mandar `caption` em áudio derruba a requisição inteira — é o tipo de
//     detalhe que ninguém lembra e que vira bug em produção.

import { describe, expect, it } from "vitest";
import { LIMITES_DE_TAMANHO, tipoDeMidia, validarAnexo } from "./media-kind";

describe("classificação do anexo", () => {
	it("reconhece as imagens que a Meta aceita", () => {
		expect(tipoDeMidia("image/jpeg")).toBe("image");
		expect(tipoDeMidia("image/png")).toBe("image");
	});

	it("PDF e planilha são documento", () => {
		expect(tipoDeMidia("application/pdf")).toBe("document");
		expect(tipoDeMidia("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(
			"document",
		);
	});

	it("áudio de WhatsApp (ogg/opus) e mp3 são áudio", () => {
		expect(tipoDeMidia("audio/ogg")).toBe("audio");
		expect(tipoDeMidia("audio/mpeg")).toBe("audio");
	});

	// Reportado pelo Kairo em 2026-08-18, testando em produção: mandou um vídeo
	// pelo WhatsApp e ele chegou ao painel como "Documento recebido", com nome
	// `documento.bin`. Vídeo caía no curinga `document` porque nunca teve
	// categoria própria — e a Meta tem, com limite e tipo de mensagem próprios.
	it("vídeo é vídeo, não documento", () => {
		expect(tipoDeMidia("video/mp4")).toBe("video");
		expect(tipoDeMidia("video/3gpp")).toBe("video");
		expect(tipoDeMidia("video/quicktime")).toBe("video");
	});

	it("mime desconhecido cai em documento — anexo não vira erro por ser exótico", () => {
		expect(tipoDeMidia("application/x-coisa-estranha")).toBe("document");
	});

	it("sem mime não classifica", () => {
		expect(tipoDeMidia("")).toBe(null);
	});
});

describe("validação antes de subir o arquivo", () => {
	it("aceita um PDF normal", () => {
		const r = validarAnexo({ mimeType: "application/pdf", tamanho: 2_000_000, nome: "boleto.pdf" });
		expect(r.ok).toBe(true);
	});

	it("imagem acima de 5 MB é barrada com o limite dito em português", () => {
		const r = validarAnexo({
			mimeType: "image/jpeg",
			tamanho: LIMITES_DE_TAMANHO.image + 1,
			nome: "foto.jpg",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.motivo).toMatch(/5 MB/);
			expect(r.motivo).toMatch(/imagem/i);
		}
	});

	it("documento até 100 MB passa — o limite de imagem não vale pra ele", () => {
		const r = validarAnexo({
			mimeType: "application/pdf",
			tamanho: 50_000_000,
			nome: "contrato.pdf",
		});
		expect(r.ok).toBe(true);
	});

	it("vídeo até 16 MB passa; acima disso o limite é dito em português", () => {
		expect(
			validarAnexo({ mimeType: "video/mp4", tamanho: 10_000_000, nome: "documento.mp4" }).ok,
		).toBe(true);
		const r = validarAnexo({
			mimeType: "video/mp4",
			tamanho: LIMITES_DE_TAMANHO.video + 1,
			nome: "longo.mp4",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.motivo).toMatch(/v[íi]deo/i);
	});

	it("arquivo vazio é barrado", () => {
		expect(validarAnexo({ mimeType: "application/pdf", tamanho: 0, nome: "x.pdf" }).ok).toBe(false);
	});

	it("arquivo sem nome é barrado — a Meta exige filename em documento", () => {
		expect(validarAnexo({ mimeType: "application/pdf", tamanho: 100, nome: "" }).ok).toBe(false);
	});

	it("executável é barrado mesmo cabendo no tamanho", () => {
		const r = validarAnexo({
			mimeType: "application/x-msdownload",
			tamanho: 1000,
			nome: "virus.exe",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.motivo).toMatch(/n[ãa]o (é )?permitid/i);
	});
});
