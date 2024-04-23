import type { SfcToJsxConfig } from "vue-sfc-to-jsx"

  const config: SfcToJsxConfig = {
    scssAliasResolver: (url: string) => {
      return url
    },
  }

  export default config
  