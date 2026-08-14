/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The shared packages ship TypeScript source rather than a build step, so Next
  // has to compile them as part of this app.
  transpilePackages: ['@ims/shared-types', '@ims/shared-validation'],

  // Prisma and pdfkit are Node-only. Keeping them external stops the bundler from
  // trying to trace pdfkit's font binaries into the serverless output.
  serverExternalPackages: ['@prisma/client', 'prisma', 'pdfkit'],

  // This deployment is an API server; no image optimisation or React pages.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Secure headers per 03_TechSpec §7. The API returns JSON only, so the
        // CSP is maximally restrictive: nothing is allowed to load or execute.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          },
          // Presigned URLs and evidence exports must never be cached by proxies.
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
