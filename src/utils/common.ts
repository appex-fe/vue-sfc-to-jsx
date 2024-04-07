import { parseComponentConfig } from "@/shared/parse-component-config"
import { FileNotFoundException } from "@/utils/exception"
import { constants } from "node:fs"
import {
  writeFile,
  access, mkdir, readFile
} from "node:fs/promises"
import path from "path"
import { type SFCDescriptor, parseComponent } from "vue-template-compiler"

/**
 * @description: 将驼峰字符串转换为连字符字符串
 */
export const hyphenate = (str: string, hyp = "-"): string => {
  const hyphenateRE = /\B([A-Z])/g
  return str.replace(hyphenateRE, hyp + "$1").toLowerCase()
}

/**
 * @description: 生成一个简单的随机字符串
 */
export function simpleRandomStr(): string {
  return Math.random().toString(36).slice(2)
}

export function removeCwd(uri: string): string {
  return uri.replace(process.cwd() + "/", "")
}
export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function saveFile(filePath: string, content: string, opt: { createDirectory?: boolean; } = {}): Promise<void> {
  const dirPath = path.dirname(filePath);
  if (!await checkFileExists(dirPath)) {
    if (opt.createDirectory) {
      await mkdir(dirPath, { recursive: true });
    } else {
      throw new FileNotFoundException(`目录 "${dirPath}" 不存在`);
    }
  }
  return await writeFile(filePath, content, "utf8");
}

export function parseVueSfcByFileContent(source: string): SFCDescriptor {
  const parsed: SFCDescriptor = parseComponent(source, parseComponentConfig)
  return parsed
}

export async function parseVueSfcByPath(VueFilePath: string): Promise<SFCDescriptor> {
  if (!await checkFileExists(VueFilePath)) {
    throw new FileNotFoundException(`Vue文件 "${VueFilePath}" 不存在`)
  }
  const source: string = await readFile(VueFilePath, "utf8")
  return parseVueSfcByFileContent(source)
}

