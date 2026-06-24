import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(),
}));

vi.mock("@/lib/agent/personas-repo", () => ({
	getPersonaForAdmin: vi.fn(),
}));

// Mock streamText pra não chamar Anthropic em test estrutural.
vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>();
	return {
		...actual,
		streamText: vi.fn(() => ({
			toUIMessageStreamResponse: () =>
				new Response("data: {}\n\n", {
					status: 200,
					headers: { "content-type": "text/event-stream" },
				}),
		})),
	};
});

vi.mock("@/lib/llm/gateway-anthropic", () => ({
	anthropic: vi.fn(() => ({ id: "anthropic-mock" })),
}));

const { POST } = await import("./route");
const { _resetForTests } = await import("@/lib/agent/assistant-rate-limit");
const requireRoleMock = vi.mocked((await import("@/lib/admin/require-role")).requireRole);
const getPersonaForAdminMock = vi.mocked(
	(await import("@/lib/agent/personas-repo")).getPersonaForAdmin,
);

function mkPersona(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: "p1",
		displayName: "Rafael Auto",
		role: "specialist" as const,
		category: "auto",
		expertise: null,
		voiceTone: "formal e técnico",
		examples: [],
		forbiddenTopics: [],
		handoffTriggers: [],
		activeTools: [],
		activeCampaigns: [],
		isActive: true,
		temperature: 0.7,
		version: 1,
		createdAt: new Date(),
		updatedAt: new Date(),
		...over,
		// biome-ignore lint/suspicious/noExplicitAny: fixture shape
	} as any;
}

function mkRequest(body: unknown) {
	return new Request("http://x/api/admin/personas/p1/assist", {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json" },
	}) as never;
}

describe("POST /api/admin/personas/[id]/assist — guards", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		_resetForTests();
	});

	it("retorna 401 sem session de admin", async () => {
		requireRoleMock.mockResolvedValue({
			error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
			session: null,
		});

		const res = await POST(mkRequest({ messages: [] }), {
			params: Promise.resolve({ id: "p1" }),
		});
		expect(res.status).toBe(401);
	});

	it("retorna 403 quando role não é admin", async () => {
		requireRoleMock.mockResolvedValue({
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
		});

		const res = await POST(mkRequest({ messages: [] }), {
			params: Promise.resolve({ id: "p1" }),
		});
		expect(res.status).toBe(403);
	});

	it("retorna 404 se persona não existe", async () => {
		requireRoleMock.mockResolvedValue({
			error: null,
			session: { user: { id: "admin-1", role: "admin" } } as never,
		});
		getPersonaForAdminMock.mockRejectedValue(new Error("not found"));

		const res = await POST(
			mkRequest({
				messages: [
					{
						role: "user",
						parts: [{ type: "text", text: "oi" }],
					},
				],
			}),
			{ params: Promise.resolve({ id: "p404" }) },
		);
		expect(res.status).toBe(404);
	});

	it("retorna 400 pra JSON malformado", async () => {
		requireRoleMock.mockResolvedValue({
			error: null,
			session: { user: { id: "admin-1", role: "admin" } } as never,
		});
		getPersonaForAdminMock.mockResolvedValue(mkPersona());

		const req = new Request("http://x/api/admin/personas/p1/assist", {
			method: "POST",
			body: "not json",
			headers: { "content-type": "application/json" },
		}) as never;
		const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
		expect(res.status).toBe(400);
	});

	it("retorna 429 após 10 requests no minuto", async () => {
		requireRoleMock.mockResolvedValue({
			error: null,
			session: { user: { id: "admin-1", role: "admin" } } as never,
		});
		getPersonaForAdminMock.mockResolvedValue(mkPersona());

		for (let i = 0; i < 10; i++) {
			const res = await POST(
				mkRequest({
					messages: [
						{
							role: "user",
							parts: [{ type: "text", text: "oi" }],
						},
					],
				}),
				{ params: Promise.resolve({ id: "p1" }) },
			);
			expect(res.status).toBe(200);
		}
		const res = await POST(
			mkRequest({
				messages: [
					{
						role: "user",
						parts: [{ type: "text", text: "oi" }],
					},
				],
			}),
			{ params: Promise.resolve({ id: "p1" }) },
		);
		expect(res.status).toBe(429);
	});

	it("isola rate limit por admin", async () => {
		getPersonaForAdminMock.mockResolvedValue(mkPersona());

		// admin-A satura
		requireRoleMock.mockResolvedValue({
			error: null,
			session: { user: { id: "admin-A", role: "admin" } } as never,
		});
		for (let i = 0; i < 10; i++) {
			await POST(
				mkRequest({
					messages: [
						{
							role: "user",
							parts: [{ type: "text", text: "oi" }],
						},
					],
				}),
				{ params: Promise.resolve({ id: "p1" }) },
			);
		}
		const blocked = await POST(
			mkRequest({
				messages: [
					{
						role: "user",
						parts: [{ type: "text", text: "oi" }],
					},
				],
			}),
			{ params: Promise.resolve({ id: "p1" }) },
		);
		expect(blocked.status).toBe(429);

		// admin-B ainda livre
		requireRoleMock.mockResolvedValue({
			error: null,
			session: { user: { id: "admin-B", role: "admin" } } as never,
		});
		const free = await POST(
			mkRequest({
				messages: [
					{
						role: "user",
						parts: [{ type: "text", text: "oi" }],
					},
				],
			}),
			{ params: Promise.resolve({ id: "p1" }) },
		);
		expect(free.status).toBe(200);
	});

	it("path traversal no personaId retorna 404 (não path injection)", async () => {
		requireRoleMock.mockResolvedValue({
			error: null,
			session: { user: { id: "admin-1", role: "admin" } } as never,
		});
		getPersonaForAdminMock.mockRejectedValue(new Error("not found"));

		const res = await POST(
			mkRequest({
				messages: [
					{
						role: "user",
						parts: [{ type: "text", text: "oi" }],
					},
				],
			}),
			{ params: Promise.resolve({ id: "../../etc/passwd" }) },
		);
		expect(res.status).toBe(404);
	});
});
