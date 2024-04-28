import { SfcToJsxConfig } from "@/shared/types"
import { writeFileSync } from "fs"
import { writeFile, readFile, unlink } from "fs/promises"
import { checkFileExists } from "./common"
import { FileNotFoundException } from "./exception"
import path from "path"
import { name } from "../../package.json"
import ts from "typescript"
import { logger } from "./logger"

type ConfigFileType = "ts" | "js"

function createMetaConfigSourceTsFile() {
  // const jsonStr = readFileSync("../../package.json", { encoding: "utf8" })
  // const name: string = JSON.parse(jsonStr).name
  return `import type { SfcToJsxConfig } from "${name}"

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

export default config
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

// 类似tsc把ts文件编译成js文件
async function compileSfcToJsxConfigToJsType(configPath: string): Promise<string> {
  const source = await readFile(configPath, "utf-8")
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.CommonJS,
    },
  })
  // 获取原始文件的目录地址
  const baseDir = path.dirname(configPath)
  const outputPath = path.resolve(baseDir, `vue-sfc-to-jsx.${Math.random().toString(36).slice(2)}.config.js`)
  await writeFile(outputPath, result.outputText, "utf-8")
  return outputPath
}

async function loadConfig(configPath: string): Promise<SfcToJsxConfig> {
  let jsPath: string = configPath
  const originalFileIsTs = configPath.endsWith(".ts")
  try {
    if (originalFileIsTs) {
      jsPath = await compileSfcToJsxConfigToJsType(configPath);
    }
    return (await import(jsPath)).default
  } finally {
    if (originalFileIsTs) {
      // delete js file
      await unlink(jsPath)
    }
  }
}

export async function getSfcToJsxConfig(): Promise<SfcToJsxConfig> {
  const userDefinedConfigPath = process.env.USER_DEFINED_CONFIG_PATH
  if (userDefinedConfigPath) {
    if (await checkFileExists(userDefinedConfigPath)) {
      return await loadConfig(userDefinedConfigPath)
    } else {
      throw new FileNotFoundException(`未找到配置文件：${userDefinedConfigPath}`)
    }
  } else {
    logger.warn("未指定配置文件，将使用默认配置。")
    const uri = await createDefaultSfcToJsxConfig(true, "ts")
    process.env.USER_DEFINED_CONFIG_PATH = uri
    return await getSfcToJsxConfig()
  }
}
