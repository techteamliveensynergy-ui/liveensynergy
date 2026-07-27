import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: {
    /**
     * Every upload in this app travels through a Server Action as multipart
     * form data, and Next caps those bodies at 1 MB by default — which the
     * profile forms blow past the moment someone picks a real logo, with the
     * request 413ing before the action ever runs.
     *
     * This has to clear the largest single form: the sponsored-event form
     * posts a banner plus 5 branding assets at MAX_IMAGE_BYTES (5 MB) each,
     * so 30 MB, and chat/feedback attachments are capped at
     * MAX_ATTACHMENT_BYTES (25 MB). Keep in step with `@/lib/upload-limits`.
     */
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
