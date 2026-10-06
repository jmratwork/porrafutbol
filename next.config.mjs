/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No revelamos el framework en la cabecera X-Powered-By (menos huella para un atacante).
  poweredByHeader: false,
  async headers() {
    // La Content-Security-Policy se fija en middleware.ts (necesita un nonce por
    // petición). Aquí van el resto de cabeceras de seguridad, que son estáticas.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Aislamiento de origen cruzado (defensa en profundidad frente a fugas
          // entre orígenes y ataques tipo Spectre).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Nada de lo que hay detrás de la sesión de administración ni de la API
        // debe quedar en una caché compartida (proxys, CDN, botón "atrás"):
        // incluye el estado de la porra y, en el panel, los enlaces de
        // invitación firmados.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/admin",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
