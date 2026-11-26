import { defineConfig } from "@lingui/cli"

export default defineConfig({
  catalogs: [
    {
      include: ["src"],
      path: "<rootDir>/src/locales/{locale}/messages",
    },
  ],
  // Maintained terminal interface languages
  locales: ["en", "zh", "zh-TW", "ja", "ko", "hi", "es", "fr", "ar"],
  sourceLocale: "en",
  formatOptions: {
    lineNumbers: false,
  },
})
