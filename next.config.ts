import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/base";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  // 本地打包部署:构建产物 .next/standalone 自带精简依赖,服务器只需 Node
  output: 'standalone',
};

export default nextConfig;
