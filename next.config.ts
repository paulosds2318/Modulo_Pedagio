import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  async headers() {
    const allowedFrameAncestors = process.env.FRAME_ANCESTORS?.trim() || "'self'";
    return [{
      source: "/:path*",
      headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${allowedFrameAncestors}` }],
    }];
  },
};

export default nextConfig;
