import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy basada en NONCE.
 *
 * Se genera un nonce distinto por petición y se pasa a Next.js vía las cabeceras
 * de la petición; Next lo lee y lo añade automáticamente a los <script> inline
 * que inyecta para la hidratación. Con `'strict-dynamic'`, sólo se ejecutan esos
 * scripts con nonce (y los que ellos cargan), de modo que podemos eliminar
 * `'unsafe-inline'` de `script-src` sin romper la app.
 *
 * `style-src` mantiene `'unsafe-inline'`: los estilos en línea de React/Tailwind
 * usan el atributo `style=...`, al que el nonce no aplica (sólo a <style>).
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  // Next.js lee el nonce de la CSP en las cabeceras de la PETICIÓN.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Aplica a las páginas HTML; excluye API (JSON, sin scripts) y estáticos.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
