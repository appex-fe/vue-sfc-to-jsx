import { SfcToJsxConfig } from "@/shared/types"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { writeFile } from "fs/promises"
import { checkFileExists } from "./common"
import { FileNotFoundException } from "./exception"
import path from "path"
import { name } from "../../package.json"

// export function loadUserConfig(configPath: string): SfcToJsxConfig {
//   // 注册ts-node以在运行时支持TS
//   register({
//     transpileOnly: true,
//     compilerOptions: {
//       module: "CommonJS"
//     }
//   });

//   // 动态导入配置文件
//   const configFile = require(configPath);

//   // 返回配置对象
//   return configFile.default;
// }


type ConfigFileType = "ts" | "js"

function createMetaConfigSourceTsFile() {
  // const jsonStr = readFileSync("../../package.json", { encoding: "utf8" })
  // const name: string = JSON.parse(jsonStr).name
  return `// import type { SfcToJsxConfig } from "${name}"
  import type { SfcToJsxConfig } from "src/shared/types"

  const config: SfcToJsxConfig = {
    scssAliasResolver: (url: string) => {
      return url
    },
  }

  export default config
  `
}

function createMetaConfigSourceJsFile() {
  return `const config = {
    scssAliasResolver: (url) => {
      return url
    },
  }

  module.exports = config
  `
}

/**
 * @returns 返回的内容是配置文件的绝对路径
 */
export function createDefaultSfcToJsxConfig(asyncFlag: true, fileType: ConfigFileType): Promise<string>
export function createDefaultSfcToJsxConfig(asyncFlag: false, fileType: ConfigFileType): string
export function createDefaultSfcToJsxConfig(asyncFlag: boolean, fileType: ConfigFileType): string | Promise<string> {
  const uri = path.resolve(process.cwd(), "vue-sfc-to-jsx.config.ts")
  const source = fileType === "ts" ? createMetaConfigSourceTsFile() : createMetaConfigSourceJsFile()
  if (asyncFlag) {
    writeFileSync(uri, source, "utf-8")
    return uri
  } else {
    return new Promise(async (resolve) => {
      await writeFile(uri, source, "utf-8")
      resolve(uri)
    })
  }
}

export async function getSfcToJsxConfig(): Promise<SfcToJsxConfig> {
  const userDefinedConfigPath = process.env.USER_DEFINED_CONFIG_PATH
  if (userDefinedConfigPath) {
    if (await checkFileExists(userDefinedConfigPath)) {
      return (await import(userDefinedConfigPath)).default
    } else {
      throw new FileNotFoundException(`未找到配置文件：${userDefinedConfigPath}`)
    }
  } else {
    console.warn("未指定配置文件，将使用默认配置。")
    const uri = await createDefaultSfcToJsxConfig(true, "ts")
    process.env.USER_DEFINED_CONFIG_PATH = uri
    return await getSfcToJsxConfig()
  }
}

export function getSfcToJsxConfigSync(): SfcToJsxConfig {
  const userDefinedConfigPath = process.env.USER_DEFINED_CONFIG_PATH
  if (userDefinedConfigPath) {
    if (existsSync(userDefinedConfigPath)) {
      return require(userDefinedConfigPath).default
    } else {
      throw new FileNotFoundException(`未找到配置文件：${userDefinedConfigPath}`)
    }
  } else {
    console.warn("未指定配置文件，将使用默认配置。")
    const uri = createDefaultSfcToJsxConfig(false, "ts")
    process.env.USER_DEFINED_CONFIG_PATH = uri
    return getSfcToJsxConfigSync()
  }
}
