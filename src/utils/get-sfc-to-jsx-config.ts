import { SfcToJsxConfig } from "@/shared/types"
import { existsSync } from "fs"

export const defaultSfcToJsxConfig: SfcToJsxConfig = {
  scssAliasResolver: (url: string) => {
    return url
  },
}

export async function getSfcToJsxConfig(): Promise<SfcToJsxConfig> {
  const userDefinedConfigPath = process.env.USER_DEFINED_CONFIG_PATH
  if (userDefinedConfigPath && existsSync(userDefinedConfigPath)) {
    return (await import(userDefinedConfigPath)).default
  } else {
    return defaultSfcToJsxConfig
  }
}

export function getSfcToJsxConfigSync(): SfcToJsxConfig {
  const userDefinedConfigPath = process.env.USER_DEFINED_CONFIG_PATH
  if (userDefinedConfigPath && existsSync(userDefinedConfigPath)) {
    return require(userDefinedConfigPath)
  } else {
    return defaultSfcToJsxConfig
  }
}
