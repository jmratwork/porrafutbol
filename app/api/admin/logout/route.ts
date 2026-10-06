import { NextResponse } from "next/server";
import { COOKIE_SESION } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST /api/admin/logout → borra la cookie de sesión del navegador. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
