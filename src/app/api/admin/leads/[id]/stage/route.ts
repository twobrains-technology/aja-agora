import { z } from "zod";
import { requireRole } from "@/lib/admin/require-role";
import {
  transitionLeadStage,
  STAGE_ORDER,
} from "@/lib/admin/lead-transitions";

const stageSchema = z.object({
  stage: z.enum(STAGE_ORDER),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, session } = await requireRole("admin", "attendant");
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = stageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid stage", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await transitionLeadStage(id, parsed.data.stage, {
    type: "admin",
    id: session!.user.id,
  });

  if (!result) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  return Response.json(result);
}
