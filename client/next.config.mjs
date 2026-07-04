import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_PUBLIC_* vars are inlined into the client bundle automatically; the
  // single runtime default lives in src/lib/api.ts — no `env` block needed here.
};

export default withNextIntl(nextConfig);
