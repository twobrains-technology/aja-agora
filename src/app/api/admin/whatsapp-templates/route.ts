import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { whatsappTemplates } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import {
	countPlaceholders,
	submitTemplateToMeta,
	type TemplateCategory,
	type TemplateLanguage,
} from "@/lib/whatsapp/templates";

export async function GET() {
	const { error } = await requireRole("admin", "attendant", "viewer");
	if (error) return error;
	const rows = await db.select().from(whatsappTemplates).orderBy(desc(whatsappTemplates.createdAt));
	return NextResponse.json({ templates: rows });
}

const createSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(512)
		.regex(/^[a-z0-9_]+$/, "Use apenas a-z, 0-9 e _"),
	category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
	language: z.enum(["pt_BR", "en_US"]).default("pt_BR"),
	bodyText: z.string().min(1).max(1024),
	headerText: z.string().max(60).optional(),
	footerText: z.string().max(60).optional(),
	buttons: z
		.array(
			z.discriminatedUnion("type", [
				z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
				z.object({
					type: z.literal("URL"),
					text: z.string().min(1).max(25),
					url: z.string().url(),
				}),
				z.object({
					type: z.literal("PHONE_NUMBER"),
					text: z.string().min(1).max(25),
					phone_number: z.string().min(1),
				}),
			]),
		)
		.optional(),
	submitNow: z.boolean().default(false),
});

export async function POST(req: Request) {
	const { error, session } = await requireRole("admin", "attendant");
	if (error) return error;
	const body = await req.json().catch(() => ({}));
	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "VALIDATION_ERROR", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const input = parsed.data;
	const placeholdersCount = countPlaceholders(input.bodyText);

	// Insert DRAFT row primeiro
	const [row] = await db
		.insert(whatsappTemplates)
		.values({
			name: input.name,
			category: input.category as TemplateCategory,
			language: input.language as TemplateLanguage,
			bodyText: input.bodyText,
			headerType: input.headerText ? "TEXT" : null,
			headerValue: input.headerText ?? null,
			footerText: input.footerText ?? null,
			buttons: input.buttons ?? [],
			placeholdersCount,
			metaStatus: "DRAFT",
			createdBy: session?.user.id ?? null,
		})
		.returning();

	// Submit opcional
	if (input.submitNow) {
		try {
			const meta = await submitTemplateToMeta({
				name: input.name,
				category: input.category as TemplateCategory,
				language: input.language as TemplateLanguage,
				bodyText: input.bodyText,
				headerText: input.headerText,
				footerText: input.footerText,
				buttons: input.buttons,
			});
			await db
				.update(whatsappTemplates)
				.set({
					metaTemplateId: meta.id,
					metaStatus: "PENDING",
					submittedAt: new Date(),
				})
				.where(eq(whatsappTemplates.id, row.id));
			return NextResponse.json(
				{
					...row,
					metaTemplateId: meta.id,
					metaStatus: "PENDING",
				},
				{ status: 201 },
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return NextResponse.json({ ...row, submitError: msg }, { status: 201 });
		}
	}

	return NextResponse.json(row, { status: 201 });
}
