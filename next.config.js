const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingExcludes: {
    "*": [
      "./data/**",
      "./docs/**",
      "./.git/**",
      "./node_modules/.cache/**",
    ],
  },
};
module.exports = nextConfig;
