// Camada 1 (structural) — FIX-62: parsing de config do storage por env, sem rede.
// FIX-82: bucket dedicado de documentos de cliente (SSE-KMS) — nunca o de administradora.
import { describe, expect, it } from "vitest";
import { getClientDocsStorageConfig, getStorageConfig } from "./index";

describe("FIX-62 — getStorageConfig", () => {
	it("usa MinIO (forcePathStyle) quando S3_ENDPOINT presente", () => {
		const cfg = getStorageConfig({
			S3_ENDPOINT: "http://aja-minio-x:9000",
			S3_BUCKET: "docs",
			S3_ACCESS_KEY_ID: "k",
			S3_SECRET_ACCESS_KEY: "s",
		});
		expect(cfg.endpoint).toBe("http://aja-minio-x:9000");
		expect(cfg.forcePathStyle).toBe(true);
		expect(cfg.bucket).toBe("docs");
	});

	it("trata S3_ENDPOINT vazio como AWS real (sem endpoint, sem path-style)", () => {
		const cfg = getStorageConfig({ S3_ENDPOINT: "" });
		expect(cfg.endpoint).toBeUndefined();
		expect(cfg.forcePathStyle).toBe(false);
	});

	it("aplica defaults sensatos", () => {
		const cfg = getStorageConfig({});
		expect(cfg.region).toBe("us-east-1");
		expect(cfg.bucket).toBe("aja-administradora-docs");
	});

	it("respeita S3_FORCE_PATH_STYLE explícito", () => {
		const cfg = getStorageConfig({
			S3_ENDPOINT: "",
			S3_FORCE_PATH_STYLE: "true",
		});
		expect(cfg.forcePathStyle).toBe(true);
	});

	// FIX (bug dev AWS 2026-06-25): no ECS o app não recebe chaves estáticas — usa
	// a task role via cadeia de credenciais do SDK. O default `minioadmin` só vale
	// pro MinIO local; em AWS real sem chaves, NÃO força credencial (senão o
	// minioadmin sobrescreve a role → InvalidAccessKeyId → 500 no upload).
	it("AWS real sem chaves explícitas: credenciais indefinidas (usa task role/cadeia padrão)", () => {
		const cfg = getStorageConfig({ S3_ENDPOINT: "" });
		expect(cfg.accessKeyId).toBeUndefined();
		expect(cfg.secretAccessKey).toBeUndefined();
	});

	it("MinIO sem chaves: mantém default minioadmin (dev local)", () => {
		const cfg = getStorageConfig({ S3_ENDPOINT: "http://aja-minio-x:9000" });
		expect(cfg.accessKeyId).toBe("minioadmin");
		expect(cfg.secretAccessKey).toBe("minioadmin");
	});

	it("AWS real com chaves explícitas: respeita o que veio do env", () => {
		const cfg = getStorageConfig({
			S3_ENDPOINT: "",
			S3_ACCESS_KEY_ID: "AKIAEXEMPLO",
			S3_SECRET_ACCESS_KEY: "segredo",
		});
		expect(cfg.accessKeyId).toBe("AKIAEXEMPLO");
		expect(cfg.secretAccessKey).toBe("segredo");
	});
});

describe("FIX-82 — getClientDocsStorageConfig", () => {
	it("usa bucket DEDICADO de cliente, nunca o de administradora-docs", () => {
		const cfg = getClientDocsStorageConfig({});
		expect(cfg.bucket).toBe("aja-client-docs");
		expect(cfg.bucket).not.toBe("aja-administradora-docs");
	});

	it("respeita S3_CLIENT_DOCS_BUCKET explícito", () => {
		const cfg = getClientDocsStorageConfig({ S3_CLIENT_DOCS_BUCKET: "aja-client-docs-prod" });
		expect(cfg.bucket).toBe("aja-client-docs-prod");
	});

	it("dev/MinIO (sem S3_CLIENT_DOCS_KMS_KEY_ID): kmsKeyId indefinido — sem SSE-KMS forçado", () => {
		const cfg = getClientDocsStorageConfig({ S3_ENDPOINT: "http://aja-minio-x:9000" });
		expect(cfg.kmsKeyId).toBeUndefined();
	});

	it("prod (com S3_CLIENT_DOCS_KMS_KEY_ID): repassa a key pro putObject usar SSE-KMS", () => {
		const cfg = getClientDocsStorageConfig({
			S3_ENDPOINT: "",
			S3_CLIENT_DOCS_KMS_KEY_ID: "arn:aws:kms:sa-east-1:123:key/abc",
		});
		expect(cfg.kmsKeyId).toBe("arn:aws:kms:sa-east-1:123:key/abc");
	});

	it("reusa endpoint/region/credenciais do storage base (mesmo S3/MinIO, bucket diferente)", () => {
		const cfg = getClientDocsStorageConfig({
			S3_ENDPOINT: "http://aja-minio-x:9000",
			S3_REGION: "sa-east-1",
		});
		expect(cfg.endpoint).toBe("http://aja-minio-x:9000");
		expect(cfg.region).toBe("sa-east-1");
		expect(cfg.forcePathStyle).toBe(true);
	});
});
