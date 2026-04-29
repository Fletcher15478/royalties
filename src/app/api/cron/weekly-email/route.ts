import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env, requireCronEnv } from "@/lib/env";
import { getWeekRangeMondayToMondayInTimeZone, formatWeekParam } from "@/lib/dates/weekRange";
import { buildWeeklyTextReport } from "@/lib/reports/weeklyText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRecipients(): string[] {
  const raw = env.REPORT_RECIPIENTS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: Request) {
  const { CRON_SECRET } = requireCronEnv();
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret") ?? bearer ?? "";
  if (provided !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const recipients = parseRecipients();
  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: "REPORT_RECIPIENTS not configured" }, { status: 500 });
  }

  // Tuesday 8am ET: send the most recently completed week (previous Monday–Sunday).
  const tz = "America/New_York";
  const now = new Date();
  const currentWeek = getWeekRangeMondayToMondayInTimeZone(now, tz);
  const prevMonday = addDays(currentWeek.weekStart, -7);
  const prevRange = getWeekRangeMondayToMondayInTimeZone(prevMonday, tz);
  const weekStartYmd = formatWeekParam(prevRange.weekStart);

  const body = await buildWeeklyTextReport({ weekStartYmd, timeZone: tz });
  const subject = `Millie's royalties report — week of ${weekStartYmd}`;

  // Prefer Resend when configured, otherwise fall back to SMTP (free: Gmail/Workspace app password).
  const from = process.env.REPORT_FROM_EMAIL ?? env.SMTP_USER ?? "Royalties <no-reply@example.com>";
  let sentVia: "resend" | "smtp" = "smtp";
  let providerResult: any = null;

  if (env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    providerResult = await resend.emails.send({ from, to: recipients, subject, text: body });
    sentVia = "resend";
  } else {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      return NextResponse.json(
        { ok: false, error: "No email provider configured. Set RESEND_API_KEY or SMTP_USER/SMTP_PASS." },
        { status: 500 }
      );
    }
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: String(process.env.SMTP_SECURE ?? "true") === "true",
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    providerResult = await transport.sendMail({
      from,
      to: recipients.join(", "),
      subject,
      text: body,
    });
    sentVia = "smtp";
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    sentVia,
    weekStartYmd,
    weekLabel: `${formatInTimeZone(prevRange.weekStart, tz, "MMM d")} – ${formatInTimeZone(
      new Date(prevRange.weekEnd.getTime() - 1),
      tz,
      "MMM d, yyyy"
    )}`,
    recipients,
    providerResult,
  });
}

