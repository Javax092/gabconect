import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef5ff",
          100: "#d9e7ff",
          200: "#bcd4ff",
          300: "#8db6ff",
          400: "#578eff",
          500: "#2f67f6",
          600: "#1f4dd8",
          700: "#1a3fb0",
          800: "#1c388d",
          900: "#1d3171"
        },
        ink: "#081120",
        mist: "#f4f7fb",
        line: "#d8e0ec"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(8, 17, 32, 0.08)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top, rgba(47, 103, 246, 0.16), transparent 36%), linear-gradient(rgba(8,17,32,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(8,17,32,0.06) 1px, transparent 1px)"
      },
      backgroundSize: {
        "hero-grid": "auto, 42px 42px, 42px 42px"
      }
    }
  },
  plugins: []
};

export default config;
