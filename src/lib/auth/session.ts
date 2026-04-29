import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { requireAuthEnv } from "@/lib/env";

const COOKIE_NAME = "royalties_session";

type SessionPayload = {
  email: string;
  role: "admin";
};

function secretKey() {
  const { AUTH_JWT_SECRET } = requireAuthEnv();
  return new TextEncoder().encode(AUTH_JWT_SECRET);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
}

export async function readSessionFromCookies(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const email = typeof payload.email === "string" ? payload.email : null;
    const role = payload.role === "admin" ? "admin" : null;
    if (!email || !role) return null;
    return { email, role };
  } catch {
    return null;
  }
}

