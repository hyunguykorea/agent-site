import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          500: "#2b7fff",
          600: "#1f66d6",
          700: "#1a53ad"
        }
      }
    }
  },
  plugins: []
};

export default config;
