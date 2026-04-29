import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/auth/ddb";
import { verifyPassword } from "@/lib/auth/passwords";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  let user;
  try {
    user = await getUserByEmail(email);
  } catch (e: any) {
    const type = String(e?.name ?? e?.__type ?? "");
    if (type.includes("ResourceNotFoundException")) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: DynamoDB table not found (check DDB_REGION + DDB_USERS_TABLE)." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  await setSessionCookie({ email: user.email, role: user.role });
  return NextResponse.json({ ok: true });
}

