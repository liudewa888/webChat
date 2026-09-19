import unwrapLayers from "./postcss-unwrap-layers.mjs";

const config = {
  plugins: ["@tailwindcss/postcss", unwrapLayers()],
};

export default config;
