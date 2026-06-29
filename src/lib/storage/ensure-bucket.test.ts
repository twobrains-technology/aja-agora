// Regressão (bloco-rev-e): ensureBucket() é documentada como idempotente, mas o
// catch do CreateBucket re-lançava QUALQUER erro — inclusive a corrida benigna
// (dois requests de primeiro upload chamam CreateBucket ao mesmo tempo; o
// segundo recebe BucketAlreadyOwnedByYou/BucketAlreadyExists). Isso fazia o
// putObject falhar com 500 mesmo com o bucket já existindo. O fix trata esses
// dois erros como sucesso e só re-lança os demais (ex.: AccessDenied).
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
	class S3Client {
		send = sendMock;
	}
	class HeadBucketCommand {
		readonly _type = "head";
		constructor(public input: unknown) {}
	}
	class CreateBucketCommand {
		readonly _type = "create";
		constructor(public input: unknown) {}
	}
	class PutObjectCommand {
		readonly _type = "put";
		constructor(public input: unknown) {}
	}
	class GetObjectCommand {
		readonly _type = "get";
		constructor(public input: unknown) {}
	}
	class DeleteObjectCommand {
		readonly _type = "delete";
		constructor(public input: unknown) {}
	}
	return {
		S3Client,
		HeadBucketCommand,
		CreateBucketCommand,
		PutObjectCommand,
		GetObjectCommand,
		DeleteObjectCommand,
	};
});

const { ensureBucket } = await import("./index");

function err(name: string): Error {
	const e = new Error(name);
	e.name = name;
	return e;
}

// HeadBucket sempre falha (bucket "ainda não existe"), forçando o CreateBucket.
function headMissingThenCreate(createResult: () => Promise<unknown>) {
	return (command: { _type: string }) => {
		if (command._type === "head") return Promise.reject(err("NotFound"));
		if (command._type === "create") return createResult();
		return Promise.resolve({});
	};
}

describe("ensureBucket — idempotência em corrida", () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	it("NÃO re-lança quando o bucket já era seu (BucketAlreadyOwnedByYou)", async () => {
		sendMock.mockImplementation(
			headMissingThenCreate(() => Promise.reject(err("BucketAlreadyOwnedByYou"))),
		);
		await expect(ensureBucket()).resolves.toBeUndefined();
	});

	it("NÃO re-lança quando o bucket já existe (BucketAlreadyExists)", async () => {
		sendMock.mockImplementation(
			headMissingThenCreate(() => Promise.reject(err("BucketAlreadyExists"))),
		);
		await expect(ensureBucket()).resolves.toBeUndefined();
	});

	it("RE-lança erro real de criação (ex.: AccessDenied)", async () => {
		sendMock.mockImplementation(headMissingThenCreate(() => Promise.reject(err("AccessDenied"))));
		await expect(ensureBucket()).rejects.toThrow(/AccessDenied/);
	});

	it("resolve quando o bucket é criado com sucesso", async () => {
		sendMock.mockImplementation(headMissingThenCreate(() => Promise.resolve({})));
		await expect(ensureBucket()).resolves.toBeUndefined();
	});
});
