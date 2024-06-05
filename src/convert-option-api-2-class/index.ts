import { readFileSync, writeFileSync } from "fs"
import { parseComponent } from "vue-template-compiler"
import ts, { SyntaxKind, factory } from "typescript"
import { tsxImporter, tsxPropertyDeclaration, AccessibilityModifier } from "./const"
import {
  createCallExpression,
  createPropertyDeclaration,
  createVuePropertyDecoratorImporter,
  createVuexClassImportDeclaration,
  isNonVueImportDeclaration,
  storeNSTransformPipe,
} from "./helper"
import { entryTransformers } from "./transformer"
import { StoreInfo, VComponent } from "./interface"
import path from "path"
import { getUniqueAbsoluteFilePath } from "@/style-block/convert-style-blocks-to-file"
import { logger } from "@/utils/logger"
import { capitalize } from "@/utils/common"

/**
 * @description: 生成一系列 store 相关声明
 */
const generateStoreDeclaration = (stores: StoreInfo[]): ts.PropertyDeclaration[] => {
  return stores.map(storeInfo => {
    const { name, mapTool, namespace, getter } = storeInfo
    const storeTool = factory.createIdentifier(mapTool)
    return createPropertyDeclaration({
      name,
      modifiers: [
        factory.createDecorator(
          createCallExpression(namespace ? factory.createPropertyAccessExpression(namespace, storeTool) : storeTool, [getter]),
        ),
        AccessibilityModifier.private,
      ],
    })
  })
}

/**
 * @description: 结合现有 import 声明，以及组件的现状，为最终的 tsx 代码，生成最终版本的 import 相关节点
 */
const generateImporters = (ast: ts.SourceFile): ts.ImportDeclaration[] => {
  const vuePropertyDecoratorImporter = createVuePropertyDecoratorImporter()
  const vuexClassImporter = createVuexClassImportDeclaration()
  return [
    tsxImporter,
    vuePropertyDecoratorImporter,
    ...(vuexClassImporter ? [vuexClassImporter] : []),
    ...ast.statements.filter(isNonVueImportDeclaration),
  ]
}

/**
 * @description: 在生成代码前，对之前收集的组件信息，做最后一次的检查、转换处理
 */
const preGenerateComponentCheck = () => {
  VComponent.updateWatchMethodNames()
}

/**
 * @description: class api -> code
 */
const generateCode = (ast: ts.SourceFile) => {
  const { getCompoInfo, fileUri } = VComponent
  const compo = getCompoInfo()
  const { isConversionRequired, components, filters, directives, statementInDataScope } = compo
  if (!isConversionRequired) {
    // 如果没有检测到 option api，那就什么都不干，直接把原来的 script 代码照搬到新文件
    return ast.text
  }
  const compoDecoratorArgs = [components, filters, directives].filter((api): api is ts.PropertyAssignment => !!api)
  const compoClassNode = factory.createClassDeclaration(
    [
      factory.createDecorator(
        compoDecoratorArgs.length
          ? // 有引用子组件，那么得生成 @Component({ components: { xxx } })
            createCallExpression(factory.createIdentifier("Component"), [
              factory.createObjectLiteralExpression(
                compoDecoratorArgs,
                // 生成的对象 prettier 一下
                true,
              ),
            ])
          : // 没有引用子组件，那么生成 @Component 就行
            factory.createIdentifier("Component"),
      ),
      factory.createModifier(SyntaxKind.ExportKeyword),
      factory.createModifier(SyntaxKind.DefaultKeyword),
    ],
    compo.name || capitalize(path.basename(fileUri, path.extname(fileUri))),
    undefined,
    [
      factory.createHeritageClause(SyntaxKind.ExtendsKeyword, [
        factory.createExpressionWithTypeArguments(factory.createIdentifier("Vue"), undefined),
      ]),
    ],
    [
      tsxPropertyDeclaration,
      ...generateStoreDeclaration(compo.stores),
      ...compo.data,
      ...compo.computed,
      ...compo.props,
      ...compo.watch,
      ...compo.methods,
      ...compo.lifecycleHooks,
    ],
  )
  const importers = generateImporters(ast)
  // 指 import 和 export default 之间的一些代码，比如 const navStore = namespace("nav")
  const coreTopLevelSnippets = ast.statements
    // import 语句 generateImporters 处理过了，这里要过滤掉
    // export default 语句会重新生成，也要过滤掉
    .filter(stm => !ts.isImportDeclaration(stm) && !ts.isExportAssignment(stm))
    // 这里处理下 顶层的 store namespace 变量声明语句
    .map(storeNSTransformPipe)
  const printer = ts.createPrinter()
  return printer.printFile(
    factory.updateSourceFile(ast, [...importers, ...coreTopLevelSnippets, ...statementInDataScope, compoClassNode]),
  )
}

/**
 * @description: 通过 ast 转换，完成 option api to class api 的转变
 */
const convertOptionApi2ClassApi = (ast: ts.Node | ts.Node[]) => ts.transform(ast, [entryTransformers])

/**
 * @description: code -> ast
 */
const parseJs = (code: string) => {
  // 即使没有实际的文件，也需要创建SourceFile对象
  // 这样就可以得到对应的AST
  const sourceFile = ts.createSourceFile(
    // 这里的文件名是虚构的，用于表示源代码，不需要对应物理文件
    "input.js",
    code,
    ts.ScriptTarget.Latest,
    true,
  )
  return sourceFile
}

/**
 * @description: 转换总入口，将 option api code 转为 class api code
 */
export const convertScript = async (fileUri: string): Promise<void> => {
  logger.info(`开始处理 ${fileUri} 的 option api 转 class api`)
  const before = performance?.now?.() ?? Date.now()
  const fileContent = readFileSync(fileUri, "utf-8")
  const { content, lang = "js" } = parseComponent(fileContent).script || {}
  if (!content) {
    return
  }
  let newCode = ""
  if (["js", "ts"].includes(lang)) {
    // 解析转换 ast 前，初始化/重置 component 存储对象
    VComponent.initCompoInfo()
    VComponent.fileUri = fileUri
    // 生成 ast
    const ast = parseJs(content)
    // 解析 ast，获取组件必要信息
    convertOptionApi2ClassApi(ast)
    // 最终代码生成前预处理
    preGenerateComponentCheck()
    // 生成最终代码
    newCode = generateCode(ast)
  } else if (["tsx", "jsx"].includes(lang)) {
    // lang 为 tsx、ts 的内容已经是 class component 了，只需要挪到新 tsx 文件里
    newCode = content
  } else {
    logger.warn(fileUri, null, `不支持的 lang 类型：${lang}`)
  }

  newCode = newCode.trimStart()
  if (newCode) {
    const baseName = path.basename(fileUri, path.extname(fileUri))
    const newPath = await getUniqueAbsoluteFilePath(path.dirname(fileUri), baseName, "tsx")
    writeFileSync(newPath, newCode, { encoding: "utf-8" })
  }
  const after = performance?.now?.() ?? Date.now()
  logger.info(`convertScript for ${fileUri} cost ${after - before}ms`)
}
