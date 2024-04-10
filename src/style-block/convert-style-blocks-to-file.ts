import { type SFCDescriptor } from "vue-template-compiler"
import { readFile } from "node:fs/promises";
import path from "path"
import postcss, { type Rule } from "postcss"
import { compile } from "sass"
import {
  isImportDeclaration,
  isNamespaceImport,
  isNamedImports,
  createSourceFile,
  ScriptTarget,
  factory,
  createPrinter,
  type ImportSpecifier,
  SourceFile,
} from "typescript"
import { pathToFileURL } from "url"
import { getSfcToJsxConfig } from "@/utils/get-sfc-to-jsx-config"
import { simpleRandomStr, hyphenate, parseVueSfcByFileContent } from "@/utils/common"
import { FileNotFoundException } from "@/utils/exception";
import { checkFileExists, saveFile } from "@/utils/common";
import { isNumber } from "@/utils/is";
import postcssSelectorParser from "postcss-selector-parser"

type CreateScssFileByVueSFCResult = { scssFilePath: string; VueFilePath: string }

type BlockPosition = { blockStart: number; blockEnd: number }

export interface ConvertedScssBlock extends BlockPosition {
  content: string
}

/**
 * @description: 作用域枚举，用于标记类名的作用域，LOCAL表示局部作用域，GLOBAL表示全局作用域，UNKNOWN表示冲突的作用域。
 */
export enum ClassScopeEnum {
  LOCAL,
  GLOBAL,
  UNKNOWN,
}

/**
 * @description: scss文件中的选择器信息，包含所有的类名及作用域。关于selector和classNames之间的区别参见本模块下的readme.md。
 */
export interface SelectorInfo {
  classNames: { [className: string]: ClassScopeEnum }
}

const styleBlockSplitterInNewFile: string = "\n\n\n"

/**
 * @description: 如果同目录下有重名文件则在文件名后加随机字符串，返回唯一的文件路径。
 */
export async function getUniqueAbsoluteFilePath(
  targetFileDirectory: string,
  filename: string,
  ext: string,
): Promise<string> {
  // 如果目标文件目录不存在
  if (!await checkFileExists(targetFileDirectory)) {
    throw new FileNotFoundException(`目录 "${targetFileDirectory}" 不存在`)
  }
  let targetAbsoluteFilePath: string = path.resolve(targetFileDirectory, `${filename}.${ext}`)
  while (await checkFileExists(targetAbsoluteFilePath)) {
    console.log(targetAbsoluteFilePath, null, `同目录下有重名${ext}文件: ${targetAbsoluteFilePath}`)
    targetAbsoluteFilePath = path.resolve(targetFileDirectory, `${filename}${simpleRandomStr()}.${ext}`)
  }
  return targetAbsoluteFilePath
}

/**
 * @description: 如果同目录下有重名文件则在文件名后加随机字符串，返回SCSS文件路径。
 */
async function determineAbsoluteScssFilePathByFilename(VueFilePath: string): Promise<string> {
  if (!await checkFileExists(VueFilePath)) {
    throw new FileNotFoundException(`Vue文件 "${VueFilePath}" 不存在`)
  }
  const filenameWithoutExtension: string = path.basename(VueFilePath, path.extname(VueFilePath))
  const hyphenateFilename: string = hyphenate(filenameWithoutExtension)
  return getUniqueAbsoluteFilePath(path.dirname(VueFilePath), hyphenateFilename, "module.scss")
}

export async function createScssFileByVueSFC(VueFilePath: string, scssBlocks: ConvertedScssBlock[]): Promise<CreateScssFileByVueSFCResult> {
  // 针对第二条重载
  if (scssBlocks.length > 0) {
    // 合并可能出现的多个style block
    const content = scssBlocks.map(block => block.content).join(styleBlockSplitterInNewFile)
    const absoluteScssFilePath = await determineAbsoluteScssFilePathByFilename(VueFilePath)
    await saveFile(absoluteScssFilePath, content, { createDirectory: true })
    await removeBlocksFromVueSFC(VueFilePath, scssBlocks.map(block => ({ blockStart: block.blockStart, blockEnd: block.blockEnd })))
    return { scssFilePath: absoluteScssFilePath, VueFilePath: VueFilePath }
  } else {
    return { scssFilePath: "", VueFilePath }
  }
}

/**
 * 从Typescript AST节点中提取所有的 import 名称。返回一个字符串数组，包含了提取出的所有 import 名称。
 *
 * // 假设有以下内容：
 * // import { a } from 'moduleA';
 * // import b from 'moduleB';
 * // import * as c from 'moduleC';
 * // import { d as e } 'moduleD';
 * // 经过 extractAllImportNames 处理后，将会返回：
 * // ['a', 'b', 'c', 'e']
 */
function getAllExistingImportNames(node: SourceFile): string[] {
  const importNames: string[] = []
  node.statements.forEach(statement => {
    if (isImportDeclaration(statement) && statement.importClause) {
      const { name, namedBindings } = statement.importClause
      // 默认导入
      if (name) {
        importNames.push(name.text)
      }
      // 具名导入和命名空间导入
      if (namedBindings) {
        // 命名空间导入，如：import * as name from 'my-module';
        if (isNamespaceImport(namedBindings)) {
          importNames.push(namedBindings.name.text)
        }
        // 具名导入，如：import { name } from 'my-module'; import { name as nameXX } from 'my-module';
        else if (isNamedImports(namedBindings)) {
          namedBindings.elements.forEach((specifier: ImportSpecifier) => {
            importNames.push(specifier.name.text)
          })
        }
      }
    }
  })
  return importNames
}

/**
 * @description: 根据已有的所有导入命名，生成并返回唯一的导入命名。默认导入名为styles，如果已存在则生成一个随机字符串。
 */
function getUniqueImportName(vueFilePath: string, importNames: string[]): string {
  let importName = "styles"
  while (importNames.includes(importName)) {
    console.log(vueFilePath, null, `Vue文件中已存在名为 ${importName} 的导入`)
    importName = `styles${simpleRandomStr()}`
  }
  return importName
}

/**
 * @description: 创建一个新的import语句，用于导入SCSS文件，并将该语句插入到Vue组件的script内容中，返回新的script内容和import语句的名称。
 */
function createImportStatement(
  vueFilePath: string,
  relativeScssFilePath: string,
  vueScriptContent: string,
): { importName: string; newVueScriptContent: string } {
  // 解析TypeScript代码生成AST
  const sourceFile = createSourceFile("component.ts", vueScriptContent, ScriptTarget.Latest, true)
  // 获取所有的import语句中的命名导入
  const existingImportNames: string[] = getAllExistingImportNames(sourceFile)
  // 确定import语句的名称
  const importName: string = getUniqueImportName(vueFilePath, existingImportNames)
  // 生成import语句，拼接在script内容最前面
  const newVueScriptContent = `\nimport ${importName} from "${relativeScssFilePath}"${vueScriptContent}`
  return { importName, newVueScriptContent }
}

/**
 * @description: 将SCSS文件导入到Vue文件中
 */
export async function insertImportToVueSFC(VueFilePath: string, scssFilePath: string): Promise<{ importName: string; VueFilePath: string; }> {
  if (!await checkFileExists(VueFilePath)) {
    throw new FileNotFoundException(`Vue文件 "${VueFilePath}" 不存在`)
  }
  if (!await checkFileExists(scssFilePath)) {
    throw new FileNotFoundException(`SCSS文件 "${scssFilePath}" 不存在`)
  }
  const vueFileContent: string = await readFile(VueFilePath, "utf8")
  const parsed: SFCDescriptor = parseVueSfcByFileContent(vueFileContent)
  let updatedVueFileContent: string = ""
  let defaultImportName: string = "styles"
  // 获取SCSS文件相对路径
  const relativeScssFilePath = `./${path.basename(scssFilePath)}`
  if (parsed.script) {
    // 获取script标签的开始和结束位置，替换成新的script标签内容
    const { start, end } = parsed.script
    const { newVueScriptContent, importName } = createImportStatement(VueFilePath, relativeScssFilePath, parsed.script.content)
    updatedVueFileContent = vueFileContent.slice(0, start) + "\n" + newVueScriptContent + vueFileContent.slice(end)
    defaultImportName = importName
  } else {
    // 在vue文件的最后拼接一个script标签
    updatedVueFileContent = `${vueFileContent}\n<script>\nimport ${defaultImportName} from "${relativeScssFilePath}"\n</script>`
  }
  await saveFile(VueFilePath, updatedVueFileContent)
  return { importName: defaultImportName, VueFilePath }
}

/**
 * @description: 该函数用于更新并标记CSS类名的作用域信息。根据提供的作用域（scope）参数更新classNames对象中的类名作用域。
 *               如果在classNames中某个类名尚未定义，则将其作用域设置为当前scope；
 *               如果已定义，但其作用域与当前scope不同，则将该类名作用域标记为UNKNOWN，
 *               表示其具有不确定或冲突的作用域。
 * classNames: 一个记录CSS类名及其作用域的对象。
 * className: 类名。
 * scope: 当前处理的CSS规则所属的作用域枚举，可以是LOCAL、GLOBAL或UNKNOWN。
 */
const updateAndMarkClassScope = (classNames: SelectorInfo["classNames"], className: string, scope: ClassScopeEnum) => {
  // 如果类名在当前作用域尚未定义直接赋值
  if (classNames[className] === undefined) {
    classNames[className] = scope
  }
  // 如果类名之前是LOCAL或GLOBAL但和当前作用域不同，则标记为UNKNOWN
  else if (classNames[className] !== scope) {
    classNames[className] = ClassScopeEnum.UNKNOWN
  }
}


/**
 * @description: 从SCSS文件中获取所有类名信息
 */
export async function getAllClassNamesFromScssFile(scssFilePath: string): Promise<SelectorInfo> {
  if (!await checkFileExists(scssFilePath)) {
    throw new FileNotFoundException(`SCSS文件 "${scssFilePath}" 不存在`);
  }
  const sfcToJsxConfig = await getSfcToJsxConfig();
  // 读取文件内容并编译为CSS
  const cssContent: string = compile(scssFilePath, {
    // 自定义导入器（Importers）用于控制如何解析来自@use和@import规则的加载请求。Sass会按照以下顺序尝试解析加载：
    // 1. 使用当前样式表的导入器，并基于当前样式表的规范URL解析加载的URL。
    // 2. 按顺序尝试使用importers数组中的每个Importer、FileImporter或NodePackageImporter。
    // 3. 按顺序尝试使用loadPaths数组中的每个加载路径。
    // 参考：https://sass-lang.com/documentation/js-api/interfaces/stringoptionswithimporter/
    importers: [
      {
        // 这是一个特殊类型的导入器FileImporter，用于从文件系统加载Sass文件。
        // 它接收一个字符串url（即Sass文件中@use或@import后面的字符串）并返回一个URL对象。
        //
        // 此处解析url（即Scss文件中@use或@import后面的字符串）的方案是：
        // 将url字符串作为参数传入用户自定义的函数中，由用户去决定如何解析，然后将函数返回的字符串作为绝对路径转换为URL对象。
        // 如果没有按照预期解析出URL对象，则由用户承担后果。
        findFileUrl(url: string) {
          return new URL(pathToFileURL(sfcToJsxConfig.scssAliasResolver(url)).href);
        },
      },
    ],
  }).css;
  const selectorInfo: SelectorInfo = { classNames: {} };
  // 处理CSS内容，提取类名
  postcss.parse(cssContent).walkRules((rule: Rule) => {
    rule.selectors.forEach((_selector) => {
    // 使用postcssSelectorParser解析选择器
    postcssSelectorParser((selectors) => {
      let scope = ClassScopeEnum.LOCAL;
      selectors.walk((selector) => {
        if (selector.type === "pseudo") {
          if (selector.value === ":global") {
            scope = ClassScopeEnum.GLOBAL;
          } else if (selector.value === ":local") {
            scope = ClassScopeEnum.LOCAL;
          }
          // 处理:global(.xx)和:local(.xx)这种带有作用域的类名
          selector.nodes.forEach((node) => {
            if (node.value) {
              updateAndMarkClassScope(selectorInfo.classNames, node.value, scope);
            }
          });
        } else if (selector.type === "class") {
          updateAndMarkClassScope(selectorInfo.classNames, selector.value, scope);
        }
      })
    }).processSync(_selector);
    })
  });
  return selectorInfo;
}

export async function removeBlocksFromVueSFC(vueFilePath: string, blockType: "template" | "script" | "style" | "customBlocks"): Promise<void>
export async function removeBlocksFromVueSFC(vueFilePath: string, positions: BlockPosition[]): Promise<void>
export async function removeBlocksFromVueSFC(vueFilePath: string, positions: BlockPosition[], originFileContent: string): Promise<void>
export async function removeBlocksFromVueSFC(
  vueFilePath: string,
  blockTypeOrPositions: "template" | "script" | "style" | "customBlocks" | BlockPosition[],
  originFileContent?: string,
): Promise<void> {
  const oldContent = originFileContent ?? await readFile(vueFilePath, "utf-8")
  // core
  if (Array.isArray(blockTypeOrPositions)) {
    // 按start从大到小排序，这样文件从后往前删相对安全
    const positions = blockTypeOrPositions.sort((a, b) => b.blockStart - a.blockStart)
    const newContent = positions.reduce((content, { blockStart, blockEnd }) => {
      return content.slice(0, blockStart) + content.slice(blockEnd)
    }, oldContent)
    await saveFile(vueFilePath, newContent)

    // 已经排好序，取最后一个即可
    const minimumStart = positions[positions.length - 1].blockStart
    return console.log(vueFilePath, minimumStart, `已从Vue文件中删除指定的代码块`)
  }

  console.debug("blockTypeOrPositions is blockType")
  // 处理重载
  const parsed: SFCDescriptor = parseVueSfcByFileContent(oldContent)
  if (blockTypeOrPositions === "template") {
    if (parsed.template) {
      const { start, end } = parsed.template
      if (isNumber(start) && isNumber(end)) {
        await removeBlocksFromVueSFC(vueFilePath, [{ blockStart: start, blockEnd: end }], oldContent)
      } else {
        console.error("无法获取template的开始和结束位置")
      }
      return
    }
  } else if (blockTypeOrPositions === "script") {
    if (parsed.script) {
      const { start, end } = parsed.script
      if (isNumber(start) && isNumber(end)) {
        await removeBlocksFromVueSFC(vueFilePath, [{ blockStart: start, blockEnd: end }], oldContent)
      } else {
        console.error("无法获取script的开始和结束位置")
      }
      return
    }
  } else if (blockTypeOrPositions === "style") {
    if (parsed.styles.length) {
      const positions = parsed.styles.map(style => ({ blockStart: style.start, blockEnd: style.end }))
      if (positions.every(position => isNumber(position.blockStart) && isNumber(position.blockEnd))) {
        await removeBlocksFromVueSFC(vueFilePath, positions as BlockPosition[], oldContent)
      } else {
        console.error("无法获取style的开始和结束位置")
      }
      return
    }
  } else if (blockTypeOrPositions === "customBlocks") {
    if (parsed.customBlocks.length) {
      const positions = parsed.customBlocks.map(block => ({ blockStart: block.start, blockEnd: block.end }))
      if (positions.every(position => isNumber(position.blockStart) && isNumber(position.blockEnd))) {
        await removeBlocksFromVueSFC(vueFilePath, positions as BlockPosition[], oldContent)
      } else {
        console.error("无法获取customBlocks的开始和结束位置")
      }
      return
    }
  }
}
