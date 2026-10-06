import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Configuración de ESLint en formato "flat" (el de ESLint 9).
 *
 * `eslint-config-next` sigue publicándose en el formato antiguo (eslintrc), así
 * que se adapta con FlatCompat. Es la misma receta que genera `create-next-app`
 * para Next 15.
 *
 * El script `npm run lint` invoca `eslint` directamente, no `next lint`: este
 * último está deprecado y desaparece en Next 16.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    // Salida de build, dependencias y artefactos: no son nuestro código.
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
