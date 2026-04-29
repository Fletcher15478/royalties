import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/auth/passwords";
import { upsertUser } from "@/lib/auth/ddb";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
});

export async function POST(req: Request) {
  const secret = req.headers.get("x-bootstrap-secret") ?? "";
  if (!process.env.BOOTSTRAP_SECRET || secret !== process.env.BOOTSTRAP_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // force-load env for validation side effects; ensures Square env is present too
  void env;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await upsertUser({ email: parsed.data.email, passwordHash, role: "admin" });
    return NextResponse.json({ ok: true, user: { email: user.email, role: user.role } });
  } catch (e: any) {
    const type = String(e?.name ?? e?.__type ?? "");
    if (type.includes("ResourceNotFoundException")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DynamoDB table not found. Check Vercel env vars DDB_REGION + DDB_USERS_TABLE match the table you created in AWS (same account + same region).",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: "Server error", detail: String(e?.message ?? e) }, { status: 500 });
  }
}

