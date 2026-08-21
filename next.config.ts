import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "@napi-rs/canvas"],
};

export default nextConfig;
