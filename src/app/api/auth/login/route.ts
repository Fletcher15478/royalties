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
  const user = await getUserByEmail(email);
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

