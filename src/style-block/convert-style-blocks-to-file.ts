import { type SFCDescriptor, parseComponent } from "vue-template-compiler"
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
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
import { getSfcToJsxConfigSync } from "@/utils/get-sfc-to-jsx-config"
import { simpleRandomStr, hyphenate } from "@/utils/common"
import { FileNotFoundException } from "@/utils/exception";

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

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}



/**
 * @description: 如果同目录下有重名文件则在文件名后加随机字符串，返回唯一的文件路径。
 */
export async function getUniqueAbsoluteFilePath(
  targetFileDirectory: string,
  filename: string,
  ext: string,
  opt: { createDirectory?: boolean } = {},
): Promise<string> {
  // 如果目标文件目录不存在
  if (!await checkFileExists(targetFileDirectory)) {
    // 如果createDirectory为true则创建目录
    if (opt.createDirectory) {
      await mkdir(targetFileDirectory, { recursive: true })
    } else {
      throw new FileNotFoundException(`目录 "${targetFileDirectory}" 不存在`)
    }
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

/**
 * @description: 从Vue文件中提取style内容并创建SCSS文件
 */
export async function createScssFileByVueSFC(VueFilePath: string): Promise<{ scssFilePath: string; VueFilePath: string; }> {
  if (!await checkFileExists(VueFilePath)) {
    throw new FileNotFoundException(`Vue文件 "${VueFilePath}" 不存在`)
  }
  const source: string = await readFile(VueFilePath, "utf8")
  const parsed: SFCDescriptor = parseComponent(source)
  let absoluteScssFilePath: string = ""
  const scssContent: string = parsed.styles.map(style => style.content).join("\n")
  if (scssContent.trim()) {
    absoluteScssFilePath = await determineAbsoluteScssFilePathByFilename(VueFilePath)
    await writeFile(absoluteScssFilePath, scssContent, "utf8")
  }
  return { scssFilePath: absoluteScssFilePath, VueFilePath }
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
  // 创建新的import语句
  const importClause = factory.createImportClause(false, factory.createIdentifier(importName), undefined)
  const newImport = factory.createImportDeclaration(undefined, importClause, factory.createStringLiteral(relativeScssFilePath))
  // 将新的import语句添加到AST中
  const updatedStatements = factory.createNodeArray([newImport, ...sourceFile.statements])
  // 更新sourceFile节点
  const updatedSourceFile = factory.updateSourceFile(sourceFile, updatedStatements)
  // 使用TypeScript printer将更新后的AST转换为TypeScript代码
  const printer = createPrinter()
  const newVueScriptContent = printer.printFile(updatedSourceFile)
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
  const parsed: SFCDescriptor = parseComponent(vueFileContent)
  let updatedVueFileContent: string = ""
  let defaultImportName: string = "styles"
  // 获取SCSS文件相对路径
  const relativeScssFilePath = `./${path.basename(scssFilePath)}`
  if (parsed.script) {
    // 获取script标签的开始和结束位置，替换成新的script标签内容
    const { start, end } = parsed.script
    const { newVueScriptContent, importName } = createImportStatement(VueFilePath, relativeScssFilePath, parsed.script.content)
    updatedVueFileContent = vueFileContent.slice(0, start) + newVueScriptContent + vueFileContent.slice(end)
    defaultImportName = importName
  } else {
    // 在vue文件的最后拼接一个script标签
    updatedVueFileContent = `${vueFileContent}\n<script>\nimport ${defaultImportName} from "${relativeScssFilePath}"\n</script>`
  }
  await writeFile(VueFilePath, updatedVueFileContent, "utf8")
  return { importName: defaultImportName, VueFilePath }
}

/**
 * @description: 该函数用于更新并标记CSS类名的作用域信息。它会解析CSS选择器中的类名，并根据提供的作用域（scope）参数更新classNames对象中的类名作用域。
 *               如果在classNames中某个类名尚未定义，则将其作用域设置为当前scope；
 *               如果已定义，但其作用域与当前scope不同，则将该类名作用域标记为UNKNOWN，
 *               表示其具有不确定或冲突的作用域。
 * classNames: 一个记录CSS类名及其作用域的对象。
 * selector: CSS选择器字符串，该函数将从中提取所有类名。
 * scope: 当前处理的CSS规则所属的作用域枚举，可以是LOCAL、GLOBAL或UNKNOWN。
 */
const updateAndMarkClassScope = (classNames: SelectorInfo["classNames"], selector: string, scope: ClassScopeEnum) => {
  const classNameReg = /\.([^.:)\s]+)/g
  let match: RegExpExecArray | null
  while ((match = classNameReg.exec(selector)) !== null) {
    const className = match[1]
    // 如果类名在当前作用域尚未定义直接赋值
    if (classNames[className] === undefined) {
      classNames[className] = scope
    }
    // 如果类名之前是LOCAL或GLOBAL但和当前作用域不同，则标记为UNKNOWN
    else if (classNames[className] !== scope) {
      classNames[className] = ClassScopeEnum.UNKNOWN
    }
  }
}

/**
 * @description:  处理并更新CSS选择器中的作用域类名。
 *                解析CSS选择器字符串，查找并处理带有作用域的类名（:global(...) 或 :local(...)），
 *                并将解析后的类名及其作用域信息更新到classNames对象中。
 * selector: 包含作用域前缀的CSS选择器字符串，格式如 ":global(.foo)" 或 ":local(.bar .bar1)" 等。
 * scope: 指定要处理的作用域类型，仅支持GLOBAL或LOCAL枚举值
 * classNames: 一个记录CSS类名及其作用域的对象，processScopedSelector会更新这个对象
 */
function updateScopedClassNames(
  selector: string,
  scope: ClassScopeEnum.GLOBAL | ClassScopeEnum.LOCAL,
  classNames: SelectorInfo["classNames"],
) {
  // 根据作用域类型构建相应的正则表达式，用于捕获括号内的类名信息
  const reg: RegExp = scope === ClassScopeEnum.GLOBAL ? /:global\(([^)]+)\)/ : /:local\(([^)]+)\)/
  // 使用正则表达式在选择器字符串中匹配作用域声明
  const match: RegExpMatchArray | null = selector.match(reg)
  // 如果匹配成功，说明找到了带有作用域的类名定义
  if (match) {
    // 提取匹配到的括号内的类名并使用processClassNames函数进行处理，
    // 将类名的作用域根据当前指定的scope更新到classNames对象中
    updateAndMarkClassScope(classNames, match[1], scope)
  }
}

/**
 * @description: 从SCSS文件中获取所有类名信息
 */
export async function getAllClassNamesFromScssFile(scssFilePath: string): Promise<SelectorInfo> {
  if (!await checkFileExists(scssFilePath)) {
    throw new FileNotFoundException(`SCSS文件 "${scssFilePath}" 不存在`);
  }
  const sfcToJsxConfig = getSfcToJsxConfigSync();
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
    // 在给定的字符串中，全局匹配所有的 :global(...) 或 :local(...) 形式的模式，以及其他不包含空格和逗号的连续字符
    // 例如：:global(.foo) .bar :local(.baz .baz1) .baz2 :global .baz3 :local .baz4 span .type, .default
    // 匹配结果：[":global(.foo)", ".bar", ":local(.baz .baz1)", ".baz2", ":global", ".baz3", ":local", ".baz4", "span", ".type", ".default]
    const selectors: string[] = rule.selector.match(/:(global|local)\([^)]+\)|[^ ,]+/g) || [];
    /**
     *
     * 默认将作用域标记(scope)设置为 LOCAL。
     * 遍历匹配到的选择器：
     *    - 如果遇到 :global 标记，则将后续选择器的作用域切换为 GLOBAL。
     *    - 如果遇到 :local 标记，则将后续选择器的作用域切换为 LOCAL。
     *    - 如果是 :global(...) 形式的选择器，则只将括号内的选择器标记为 GLOBAL，但不改变当前作用域标记(scope)。
     *    - 如果是 :local(...) 形式的选择器，则只将括号内的选择器标记为 LOCAL，但不改变当前作用域标记(scope)。
     *    - 如果是普通选择器，则根据当前的作用域标记(scope)对选择器中的类名进行标记。
     */
    let scope: ClassScopeEnum = ClassScopeEnum.LOCAL;
    selectors.forEach(selector => {
      if (selector === ":global") {
        scope = ClassScopeEnum.GLOBAL;
      } else if (selector === ":local") {
        scope = ClassScopeEnum.LOCAL;
      } else if (selector.startsWith(":global(")) {
        updateScopedClassNames(selector, ClassScopeEnum.GLOBAL, selectorInfo.classNames);
      } else if (selector.startsWith(":local(")) {
        updateScopedClassNames(selector, ClassScopeEnum.LOCAL, selectorInfo.classNames);
      } else {
        updateAndMarkClassScope(selectorInfo.classNames, selector, scope);
      }
    });
  });
  return selectorInfo;
}
