import ts, { SyntaxKind, factory } from "typescript"
import {
  createAccessor,
  createCallExpression,
  createMethodDeclaration,
  createPropertyDeclaration,
  createWatchPropertyFromWatchInfo,
  // getReturnStatementExpression,
  getSourceTextFromTextLikeNode,
  isLifecycleHook,
  isMethodDeclarationTypeOptionApi,
  isPropertyAssignmentTypeOptionApi,
  isVuexMapTool,
  normalizeMethodDeclarationBody,
  parseArrayMapArgument,
  parseFuncNode,
  parseObjectMapArgument,
} from "./helper"
import { StoreInfo, VComponent, WatchInfo } from "./interface"
import { AccessibilityModifier, VuexMap2VuexClassMap } from "./const"
import { logger } from "@/utils/logger"

/**
 * @description: 处理 Vuex store 相关的 Api
 */
const handleStoreApi = (node: ts.SpreadAssignment): void => {
  const { expression } = node
  if (!ts.isCallExpression(expression)) {
    return
  }
  const { expression: mapFunction, arguments: mapArgs } = expression
  const mapType = getSourceTextFromTextLikeNode(ts.isPropertyAccessExpression(mapFunction) ? mapFunction.name : mapFunction)
  if (!isVuexMapTool(mapType)) {
    return
  }
  // 这里处理 ...meStoreNS.mapState({ hadImpersonate: s => s.impersonate }) 情况
  const namespace = ts.isPropertyAccessExpression(mapFunction)
    ? factory.createIdentifier(getSourceTextFromTextLikeNode(mapFunction.expression))
    : null
  const args = mapArgs[0]
  const stateMappings: StoreInfo[] = ts.isObjectLiteralExpression(args)
    ? parseObjectMapArgument(args, VuexMap2VuexClassMap[mapType], namespace)
    : ts.isArrayLiteralExpression(args)
    ? parseArrayMapArgument(args, VuexMap2VuexClassMap[mapType], namespace)
    : []
  VComponent.set("stores", (VComponent.get("stores") || []).concat(...stateMappings))
}

/**
 * @description: 处理 computed option
 */
const handleComputedApi = (node: ts.PropertyAssignment, recursing = false): void => {
  const properties = ts.isObjectLiteralExpression(node.initializer) ? node.initializer.properties : []
  // 处理计算属性，computed option 本身是个对象，但其内部的计算属性可能有多种写法
  for (const prop of properties) {
    // 这里嵌套处理 store 相关逻辑
    if (ts.isSpreadAssignment(prop)) {
      handleStoreApi(prop)
      continue
    }
    if (ts.isPropertyAssignment(prop)) {
      // 此处递归处理 aaa: {} 类型的 计算属性，一般是 aaa: { get() {}, set() {} } 的写法
      handleComputedApi(prop, true)
    }
    // 此处尝试将 prop 作为对象方法进行解析（也就是处理 aaa() {} 等对象方法的写法），
    // 当 prop 非合法的对象方法时，解析会失败，无法继续处理，直接跳过本次循环
    const funcInfo = parseFuncNode(prop)
    if (!funcInfo) {
      continue
    }
    const { name, parameters, body, modifiers } = funcInfo
    const nameTxt = getSourceTextFromTextLikeNode(name)
    const nameIsGetOrSet = ["get", "set"].includes(nameTxt)

    // 忽略递归时发现的非 get、set 的属性/方法
    if (recursing && !nameIsGetOrSet) {
      continue
    }

    // 只有递归的时候（也就是处理 aaa: { get() {}, set() {} } 写法的时候），才需要针对 get 和 set 特殊处理
    const isSetter = recursing && nameTxt === "set"
    // 递归时，计算属性的实际名称得取祖先 node 的 name，非递归时，则取当前节点的名称即可
    const accessorName = recursing ? node.name : name
    const computed = VComponent.get("computed") || []
    VComponent.set("computed", [
      ...computed,
      // 这里同样，只有递归的时候，才有 setter 类型的访问器节点
      createAccessor(isSetter, accessorName, parameters, normalizeMethodDeclarationBody(body), modifiers),
    ])
  }
}

/**
 * @description: 处理 methods option
 */
const handleMethodsApi = (node: ts.Expression): void => {
  const properties = ts.isObjectLiteralExpression(node) ? node.properties : []
  const privateModifier = factory.createModifier(SyntaxKind.PrivateKeyword)
  const methods: (ts.MethodDeclaration | ts.PropertyDeclaration)[] = []
  for (const prop of properties) {
    if (ts.isSpreadAssignment(prop)) {
      handleStoreApi(prop)
      continue
    }
    const funcInfo = parseFuncNode(prop)
    if (!funcInfo) {
      // 这里处理 {
      //   methods: {
      //     aaa: axios,
      //     axios,
      //     bbb: this.aaa,
      //   }
      // }
      // 这几种情况
      // !funcInfo 已经排除了 aaa: function() {} 、aaa: () => {} 等情况，所以这里仅判断 ts.isPropertyAssignment(prop) ———— 以前咋赋值的，这里仍旧咋赋值
      if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
        methods.push(
          createPropertyDeclaration({
            modifiers: [privateModifier],
            name: prop.name,
            initializer: ts.isPropertyAssignment(prop) ? prop.initializer : prop.name,
          }),
        )
      }
    } else {
      methods.push(createMethodDeclaration(funcInfo, privateModifier))
    }
  }
  VComponent.set("methods", methods)
}

/**
 * @description: 处理 props option
 */
const handlePropsApi = (node: ts.Expression): void => {
  const propIdentifier = factory.createIdentifier("Prop")
  const publicModifier = AccessibilityModifier.public
  // 数组类型的 props（比如：props: ["aaa", "bbb"]），or 字符串类型的 prop value（比如 aaa: "String"），都是 非 required
  const requiredPropertyAssignment = factory.createPropertyAssignment(
    factory.createIdentifier("required"),
    factory.createIdentifier("false"),
  )
  let props: ts.PropertyDeclaration[] = []
  if (ts.isArrayLiteralExpression(node)) {
    props = node.elements.filter(ts.isStringLiteral).map(prop =>
      createPropertyDeclaration({
        modifiers: [
          factory.createDecorator(
            createCallExpression(propIdentifier, [factory.createObjectLiteralExpression([requiredPropertyAssignment], true)]),
          ),
          publicModifier,
        ],
        name: factory.createIdentifier(prop.text),
      }),
    )
  } else if (ts.isObjectLiteralExpression(node)) {
    props = node.properties.filter(ts.isPropertyAssignment).map(prop => {
      const { name, initializer } = prop
      return createPropertyDeclaration({
        modifiers: [
          factory.createDecorator(
            createCallExpression(propIdentifier, [
              ts.isObjectLiteralExpression(initializer)
                ? initializer
                : factory.createObjectLiteralExpression(
                    [requiredPropertyAssignment, factory.createPropertyAssignment("type", initializer)],
                    true,
                  ),
            ]),
          ),
          publicModifier,
        ],
        name,
      })
    })
  } else {
    logger.warn(VComponent.fileUri, null, "无法识别的 props 配置方式")
  }
  VComponent.set("props", props)
}

/**
 * @description: 处理 watch option
 */
const handleWatchApi = (node: ts.Expression): void => {
  const properties = ts.isObjectLiteralExpression(node) ? node.properties : []
  const watchers = properties
    .map((prop: ts.ObjectLiteralElementLike) => {
      //  watch 的配置在 option api 里分两种，
      //  一种是简易写法：
      //     onTrial(val) {
      //       this.newSubscription.onTrial = val
      //     },
      //  还有一种是复杂写法：
      //     editInfo: {
      //       handler(obj) {},
      //       deep: true,
      //     },
      //  复杂写法中，watch 支持两种配置形式：
      //  1、PropertyAssignment：handler: function() {}
      //  2、MethodDeclaration： handler() {}
      if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
        // 这里处理第二种复杂写法的情况
        const { properties } = prop.initializer
        let handler: ts.ObjectLiteralElementLike | undefined
        const options = properties.filter(option => {
          if ((ts.isPropertyAssignment(option) || ts.isMethodDeclaration(option)) && getSourceTextFromTextLikeNode(option.name) === "handler") {
            // 判断到可以处理的 handler 配置后，暂存 handler ，用于后续 parseFuncNode 解析方法四要素
            handler = option
            return false
          }
          return true
        })
        const funcInfo = handler ? parseFuncNode(handler) : null
        return { funcInfo: funcInfo ? { ...funcInfo, name: prop.name } : null, options }
      }
      // 这里可以直接处理第一种简易写法的情况
      return { funcInfo: parseFuncNode(prop) }
    })
    .filter((watchInfo): watchInfo is WatchInfo => !!watchInfo.funcInfo)
    .map(createWatchPropertyFromWatchInfo)
  VComponent.set("watch", watchers)
}

/**
 * @description: 处理 name option，获取到的 name 在稍后生成代码时，会被用作 class name
 */
const handleNameOption = (node: ts.PropertyAssignment) => {
  VComponent.set("name", getSourceTextFromTextLikeNode(node.initializer))
}

/**
 * @description: 处理 data option
 *
 * 此处处理了四种 data 写法，分别为：
 * 1、data() {}
 * 2、data: () => {}
 * 3、data: () => ({})
 * 3、data: function () {}
 */
const handleDataOption = (node: ts.PropertyAssignment | ts.MethodDeclaration): void => {
  if (!ts.isPropertyAssignment(node) && !ts.isMethodDeclaration(node)) {
    logger.log(VComponent.fileUri, null, `发现不支持的 data 声明写法`)
    return
  }
  // 无论是上述哪种写法，重要的是获取 return {} 里的内容
  const funcInfo = parseFuncNode(node)
  if (!funcInfo || !funcInfo.body) {
    return
  }
  const { body } = funcInfo
  // 如果 data: () => x + x 或 data: () => (x) ，解析出来的 body 不是一个 block 类型
  if (!ts.isBlock(body)) {
    return
  }
  const { statements } = body
  VComponent.set(
    "statementInDataScope",
    statements.filter(stm => !ts.isReturnStatement(stm)),
  )
  const returnStatementExpression = statements.find(ts.isReturnStatement)?.expression
  if (!returnStatementExpression || !ts.isObjectLiteralExpression(returnStatementExpression)) {
    return
  }
  const { properties } = returnStatementExpression
  const data: ts.PropertyDeclaration[] = []
  for (const prop of properties) {
    // 获取到了 data option 的 return 后，目前只处理 return 对象里的属性，方法声明什么的先忽略
    // 不会吧不会吧应该没有人 data() { return { func() {} } } 吧？ (•́へ•́╬)
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      // 兼容 isShorthandPropertyAssignment 形式，即 { a: 1, vm } 中的 vm
      const name = factory.createIdentifier(getSourceTextFromTextLikeNode(prop.name))
      data.push(
        factory.createPropertyDeclaration(
          // data 里的属性默认 private
          [factory.createModifier(SyntaxKind.PrivateKeyword)],
          // 这里重新生成一次 属性名 节点，是因为之前的代码里可能有注释，注释在 typescript ast 节点中并不是一个节点，而是一种附属信息
          // 而且 createPropertyDeclaration 没有提供参数添加注释
          // 不做处理的话，可能最终会生成如下代码：
          /**
           *  private
              // 地图服务加载失败时的错误信息
              loadErrMsg = "";
           */
          // 就很奇葩
          // TODO: 对于有注释的情况，记得打日志
          name,
          undefined,
          undefined,
          ts.isShorthandPropertyAssignment(prop) ? name : prop.initializer,
        ),
      )
    }
  }
  VComponent.set("data", data)
}

/**
 * @description: 处理 components option
 */
const handleComponentsOption = (node: ts.PropertyAssignment): void => {
  VComponent.set("components", node)
}

/**
 * @description: 处理 filters option
 */
const handleFiltersOption = (node: ts.PropertyAssignment): void => {
  VComponent.set("filters", node)
}

/**
 * @description: 处理 directives option
 */
const handleDirectivesOption = (node: ts.PropertyAssignment): void => {
  VComponent.set("directives", node)
}

/**
 * @description: 处理生命周期钩子
 */
const handleLifecycleHook = (node: ts.PropertyAssignment | ts.MethodDeclaration): void => {
  const funcInfo = parseFuncNode(node)
  const lifecycleHooks = VComponent.get("lifecycleHooks") || []
  funcInfo &&
    VComponent.set("lifecycleHooks", [...lifecycleHooks, createMethodDeclaration(funcInfo, AccessibilityModifier.protected)])
}

/**
 * @description: 判断当前节点的子节点是否需要继续进行 BFS 遍历
 *
 * **重要**：本方法仅适用于 ts ast 的 travel 场景，依托于其 bfs 的遍历原理，且需要后续条件代码的配合，不能单独使用，完全不符合 🐲 的开源精神
 */
const isBFSRequiredForChildren = (node: ts.Node): boolean => {
  return (
    // 判断是否是 ast 根节点
    ts.isSourceFile(node) ||
    // 判断 export default {}
    (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) ||
    // 判断 export default Vue.extend({})
    (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) ||
    (ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      getSourceTextFromTextLikeNode(node.expression).toLowerCase() === "vue.extend") ||
    // 由于 ts 是层层往下遍历的，而后续的判断不会 visitEachChild （可以理解为该 if 块的代码只会执行可控的有限次）
    // 因此这里可以安全判断到是否是 export default {} 或 export default Vue.extend({}) 里的 {}
    ts.isObjectLiteralExpression(node)
  )
}

/**
 * @description: travel 总入口
 *
 * ts 的 travel 逻辑：bfs（广度优先）层层遍历
 *
 * 如果需要遍历下一层的子节点，需要显式 ts.visitEachChild(node, visit, ...)，否则不会往下层遍历
 *
 * 因此本方法的职责，在需要的情况下通过 visitEachChild 触发下层节点的遍历，在不需要的情况下放弃遍历下层节点转而处理本层节点
 */
export const entryTransformers = <T extends ts.Node>(context: ts.TransformationContext) => {
  return (rootNode: T) => {
    const visit = (node: ts.Node): ts.Node => {
      // 判断哪些情况下，本层节点无需处理，仅需遍历下层节点
      if (isBFSRequiredForChildren(node)) {
        return ts.visitEachChild(node, visit, context)
      } else if (ts.isImportDeclaration(node)) {
        return node
      } else if (isPropertyAssignmentTypeOptionApi(node, "name")) {
        // 判断是否是 name option
        handleNameOption(node)
      } else if (isMethodDeclarationTypeOptionApi(node, "data") || isPropertyAssignmentTypeOptionApi(node, "data")) {
        handleDataOption(node)
      } else if (isPropertyAssignmentTypeOptionApi(node, "components")) {
        handleComponentsOption(node)
      } else if (isPropertyAssignmentTypeOptionApi(node, "filters")) {
        handleFiltersOption(node)
      } else if (isPropertyAssignmentTypeOptionApi(node, "directives")) {
        handleDirectivesOption(node)
      } else if (isPropertyAssignmentTypeOptionApi(node, "computed")) {
        handleComputedApi(node)
      } else if (isPropertyAssignmentTypeOptionApi(node, "methods")) {
        handleMethodsApi(node.initializer)
      } else if (isPropertyAssignmentTypeOptionApi(node, "props")) {
        handlePropsApi(node.initializer)
      } else if (isPropertyAssignmentTypeOptionApi(node, "watch")) {
        handleWatchApi(node.initializer)
      } else if (isLifecycleHook(node)) {
        handleLifecycleHook(node)
      } else if (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) {
        logger.warn(VComponent.fileUri, null, `不支持的 option api: ${node.getText()}`)
      }
      return node
    }

    return ts.visitNode(rootNode, visit)
  }
}
