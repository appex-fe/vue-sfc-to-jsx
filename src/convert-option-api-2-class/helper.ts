import ts, { SyntaxKind, factory } from "typescript"
import {
  LifecycleHooks,
  OptionApi,
  FuncInfo,
  PropertyInfo,
  WatchInfo,
  VComponent,
  VuexMapTools,
  StoreInfo,
  VuexClassTools,
} from "./interface"
import { LIFECYCLE_HOOKS, AccessibilityModifier } from "./const"
import { capitalize } from "@/utils/common"

/**
 * @description: 从文本或表达式节点获取文本信息，文本节点目前已知有几类：ts.Identifier、ts.StringLiteral、ts.NumericLiteral 等
 * 表达式节点的使用请见 isStoreNSVariableStatement
 */
export const getSourceTextFromTextLikeNode = (node: ts.Expression | ts.PropertyName): string => {
  if (node.getSourceFile()) {
    // node.getText() 方法是用来获取源代码中对应于特定 AST 节点的原始文本
    // 很明显，用于文本节点时，getText 方法获取的就是对应的文本信息了
    const originTxt = node.getText()
    if (ts.isStringLiteral(node)) {
      return JSON.parse(originTxt)
    }
    return originTxt
  } else {
    // 如果当前节点是 transform 过程新建的(没有对应的 SourceFile)，则不能使用上述逻辑获取 name 了，因为新节点和源代码已经对不上了
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
      return node.text
    }
  }
  return ""
}

/**
 * @description: 判断是否是 storeNS 的声明语句
 */
export const isStoreNSVariableStatement = (initializer?: ts.Expression): initializer is ts.CallExpression => {
  return (
    !!initializer &&
    ts.isCallExpression(initializer) &&
    getSourceTextFromTextLikeNode(initializer.expression) === VuexMapTools.NAMESPACE
  )
}

/**
 * @description: 判断传入的名称，是否是 "mapState", "mapMutations", "mapGetters", "mapActions" 中的一种
 */
export const isVuexMapTool = (tool: string): tool is VuexMapTools => {
  return Object.values<string>(VuexMapTools).includes(tool)
}

/**
 * @description: 判断当前 import 节点，是否是一个 非 from "vue" 且非 from "vuex" 的节点
 */
export const isNonVueImportDeclaration = (node: ts.Node): node is ts.ImportDeclaration => {
  return (
    ts.isImportDeclaration(node) &&
    !["vue", "vuex"].includes(getSourceTextFromTextLikeNode(node.moduleSpecifier).toLocaleLowerCase())
  )
}

/**
 * @description: 判断当前 node 节点是否是 option api 节点
 */
export const isSpecOptionApi = (api: OptionApi, node: ts.PropertyAssignment | ts.MethodDeclaration) => {
  return ts.isIdentifier(node.name) && node.name.escapedText === api
}

/**
 * @description: 判断是否是属性类型的 api，比如 methods、components 等以 xxx: {} 出现的形式
 */
export const isPropertyAssignmentTypeOptionApi = (node: ts.Node, api: OptionApi): node is ts.PropertyAssignment => {
  return ts.isPropertyAssignment(node) && isSpecOptionApi(api, node)
}

/**
 * @description: 判断是否是函数声明类型的 option api，比如 data 等以 data() {} 出现的形式
 */
export const isMethodDeclarationTypeOptionApi = (node: ts.Node, api: OptionApi): node is ts.MethodDeclaration => {
  return ts.isMethodDeclaration(node) && isSpecOptionApi(api, node)
}

/**
 * @description: 判断是否是生命周期钩子
 */
export const isLifecycleHook = (node: ts.Node): node is ts.MethodDeclaration | ts.PropertyAssignment => {
  return (
    (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
    LIFECYCLE_HOOKS.includes(getSourceTextFromTextLikeNode(node.name) as LifecycleHooks)
  )
}

/**
 * @description: 给定表达式，生成一个 return 声明，return 的内容就是传入的表达式
 */
export const createReturnBlock = (expr: ts.Expression | undefined): ts.Block => {
  const returnStm = expr ? factory.createReturnStatement(expr) : undefined
  return factory.createBlock(returnStm ? [returnStm] : [], true)
}

/**
 * @description: 将之前通过 parseFuncNode 解析出来的 body ，标准化成 ts.MethodDeclaration 能使用的 ts.Block | undefined
 */
export const normalizeMethodDeclarationBody = (body: FuncInfo["body"] | undefined): ts.Block | undefined => {
  return !body ? undefined : ts.isBlock(body) ? body : createReturnBlock(body)
}

/**
 * @description: 创建一个函数声明节点
 */
export const createMethodDeclaration = (funcInfo: FuncInfo, accessModifiers?: ts.Modifier): ts.MethodDeclaration => {
  const { name, parameters, body, modifiers } = funcInfo
  return factory.createMethodDeclaration(
    [...(accessModifiers ? [accessModifiers] : []), ...(modifiers || [])],
    undefined,
    name,
    undefined,
    undefined,
    parameters,
    undefined,
    normalizeMethodDeclarationBody(body),
  )
}

/**
 * @description: 创建一个属性声明节点
 */
export const createPropertyDeclaration = (propInfo: PropertyInfo): ts.PropertyDeclaration => {
  const { name, modifiers, initializer } = propInfo
  return factory.createPropertyDeclaration(modifiers || [], name, undefined, undefined, initializer)
}

/**
 * @description: 创建调用表达式节点
 */
export const createCallExpression = (expression: ts.Expression, argumentsArray: ts.Expression[]): ts.CallExpression => {
  return factory.createCallExpression(expression, undefined, argumentsArray)
}

/**
 * @description: 根据之前的文本节点（可能带注释），创建一个纯净的文本节点
 * ts 里有一个非常非常大的坑，
 *
 * // aaaaaa
 * bbb: () {}
 *
 * 上述（属性声明）节点，直接使用原节点的 属性名称 文本节点的话，会生成 // aaaaaa bbb 的目标代码，也就是会带上注释，所以需要对其名称节点做清洗处理
 */
export const createPureTxtIdentifier = (node: ts.Expression | ts.PropertyName): ts.Identifier => {
  return factory.createIdentifier(getSourceTextFromTextLikeNode(node))
}

/**
 * @description: 根据之前的修饰符（可能带注释），创建纯净的修饰符列表（一般修饰符都是列表形式，所以入、出参均为列表形式）
 */
export const createPureModifiers = (node: ts.ModifierLike[]): ts.ModifierLike[] => {
  return node.map(modifier => (ts.isDecorator(modifier) ? modifier : factory.createModifier(modifier.kind)))
}

/**
 * @description: 根据给定的 watcher 名称 node，返回拼接好的一个 onxxxChange 函数名称节点（ watcher 名称可能是 "obj.id"
 */
export const toOnChangeFuncName = (str: string): ts.Identifier => {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "")
  const newName = `on${str.split(".").map(sanitize).map(capitalize).join("")}Change`
  return factory.createIdentifier(newName)
}

/**
 * @description: 创建 watch 属性
 */
export const createWatchPropertyFromWatchInfo = (watchInfo: WatchInfo): ts.MethodDeclaration => {
  const watchIdentifier = factory.createIdentifier("Watch")
  const { funcInfo, options } = watchInfo
  const { name, modifiers = [] } = funcInfo
  const nameTxt = getSourceTextFromTextLikeNode(name)
  const onChangeNameNode = toOnChangeFuncName(nameTxt)
  const optionsExpression = options ? [factory.createObjectLiteralExpression(options, true)] : []
  const decoratorArgs = [factory.createStringLiteral(nameTxt), ...optionsExpression]
  const watchDecorator = factory.createDecorator(createCallExpression(watchIdentifier, decoratorArgs))
  return createMethodDeclaration({
    ...funcInfo,
    name: onChangeNameNode,
    modifiers: [watchDecorator, AccessibilityModifier.private, ...modifiers],
  })
}

/**
 * @description: 根据给定的参数，创建一个符合 FuncInfo 接口的返回对象
 */
export const createFuncInfo = (
  node: ts.FunctionExpression | ts.MethodDeclaration | ts.ArrowFunction,
  name: ts.PropertyName,
  body?: ts.Block | ts.Expression,
): FuncInfo => {
  // const block = !body ? undefined : ts.isBlock(body) ? body : createReturnBlock(body)
  const pureName = createPureTxtIdentifier(name)
  return {
    name: pureName,
    parameters: node.parameters,
    modifiers: createPureModifiers(Array.from(node.modifiers || [])),
    body,
  }
}

/**
 * @description: 基于给定的参数，创建一个访问器节点
 */
export const createAccessor = (
  isSetter: boolean,
  name: ts.PropertyName,
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  body?: ts.Block,
  modifiers?: ts.ModifierLike[],
): ts.AccessorDeclaration => {
  // 创建共用的修饰符数组
  const newModifiers = [factory.createModifier(SyntaxKind.PrivateKeyword), ...(modifiers || [])]

  if (isSetter) {
    // 创建 setter 访问器
    return factory.createSetAccessorDeclaration(newModifiers, name, parameters, body)
  }
  // 默认创建 getter 访问器
  return factory.createGetAccessorDeclaration(newModifiers, name, parameters, undefined, body)
}

/**
 * @description: 创建 import 声明
 */
export const createImportDeclaration = (importBindings: string[], moduleName: string): ts.ImportDeclaration => {
  const importSpecifiers = importBindings.map(binding =>
    factory.createImportSpecifier(false, undefined, factory.createIdentifier(binding)),
  )

  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(false, undefined, factory.createNamedImports(importSpecifiers)),
    factory.createStringLiteral(moduleName),
  )
}

/**
 * @description: 根据组件的情况，创建 import { Component, Vue, ... } from "vue-property-decorator";
 */
export const createVuePropertyDecoratorImporter = (): ts.ImportDeclaration => {
  // 这俩是固定要导入的
  const importBindings = ["Component", "Vue"]
  const compo = VComponent.getCompoInfo()
  compo.props.length && importBindings.push("Prop")
  compo.watch.length && importBindings.push("Watch")
  return createImportDeclaration(importBindings, "vue-property-decorator")
}

/**
 * @description: 根据组件的情况，创建 import {} from "vuex-class";
 */
export const createVuexClassImportDeclaration = (): ts.ImportDeclaration | null => {
  const stores = VComponent.get("stores") || []
  if (!stores.length) {
    return null
  }
  /** @description storeWithoutNamespace 是为了兼容下面这种情况
   * @example
   * computed: {
    ...mapState({
      isPartner: state => state.me.partner,
    }),
  },
   */
  const storeWithoutNamespace = stores.filter(store => !store.namespace)
  const importBindings = Array.from(new Set(storeWithoutNamespace.map(store => store.mapTool)))
  // storeWithoutNamespace 是那些没有命名空间的 store 语句，如果他和原始的 stores 长度不一样，就说明某些 store 有命名空间，
  // 这时候，导入语句里，就得加上 namespace 的导入
  storeWithoutNamespace.length !== stores.length && importBindings.push(VuexClassTools.NAMESPACE)
  return createImportDeclaration(importBindings, "vuex-class")
}

/**
 * @description: 将 const meStoreNS = createNamespacedHelpers("me") 转成 const meStoreNS = namespace("me")
 */
export const storeNSTransformPipe = (statement: ts.Statement): ts.Statement => {
  if (!ts.isVariableStatement(statement)) {
    return statement
  }
  const { modifiers, declarationList } = statement
  const { declarations } = declarationList
  return factory.updateVariableStatement(statement, modifiers, {
    ...declarationList,
    declarations: factory.createNodeArray(
      declarations.map(declaration => {
        if (isStoreNSVariableStatement(declaration.initializer)) {
          const { name, exclamationToken, type, initializer } = declaration
          const { arguments: args, typeArguments } = initializer
          return factory.updateVariableDeclaration(
            declaration,
            name,
            exclamationToken,
            type,
            factory.updateCallExpression(initializer, factory.createIdentifier(VuexClassTools.NAMESPACE), typeArguments, args),
          )
        }
        return declaration
      }),
    ),
  })
}

/**
 * @description: 解析 对象方法 节点，返回方法的基本信息（修饰符、方法名称、入参、函数体）
 *
 * 对象方法节点类型大体分为两种形式：函数表达式、函数声明
 *
 * 其中函数表达式细分为：
 * aaa: () => {}
 * aaa: () => ({})
 * aaa: function () {}
 *
 * 如果按开源标准，实际上，还有好几种写法，比如：
 * aaa: bbb 赋值形式
 * aaa, 速写属性赋值形式
 * 等等
 * 但是这种不好解析，先行略过
 */
export const parseFuncNode = (node: ts.ObjectLiteralElementLike): FuncInfo | null => {
  if (ts.isPropertyAssignment(node)) {
    // 处理函数表达式写法，开始分情况处理
    // 对于函数表达式，其名称，应该是属性名
    const { name, initializer } = node
    // 处理 xxx: 箭头函数 的形式，其中，箭头函数有简写，所以还得细分场景
    if (ts.isArrowFunction(initializer)) {
      const { body } = initializer
      // data: () => { return xxx } 形式的 body 是 ts.Block 类型，
      // 而 data: (x) => x + x 、data: () => ({}) 等形式的 body，则直接是一个表达式，这里统一先将其处理成正常 { return xxx } 的箭头函数形式
      // ({}) 是一个 ParenthesizedExpression，真正的返回表达式在 () 内部，因此需要再取一道
      const resBody = ts.isBlock(body) ? body : ts.isParenthesizedExpression(body) ? body.expression : body
      return createFuncInfo(initializer, name, resBody)
    } else if (ts.isFunctionExpression(initializer)) {
      // 处理 xxx: function() {} 的写法
      return createFuncInfo(initializer, name, initializer.body)
    }
  } else if (ts.isMethodDeclaration(node)) {
    // 处理函数声明 xxx() { return yyy } 的写法
    return createFuncInfo(node, node.name, node.body)
  }
  return null
}

/**
 * @description: 从一个对象的方法节点中，获取该方法的 return 表达式节点
 */
// export const getReturnStatementExpression = (node: ts.PropertyAssignment | ts.MethodDeclaration): ts.Expression | null => {
//   let body: ts.Block | undefined
//   // 一个对象的方法，有三种写法
//   // 作为属性：
//   if (ts.isPropertyAssignment(node)) {
//     const { initializer } = node
//     // data: 箭头函数 的形式，其中，箭头函数有简写，所以还得细分场景
//     if (ts.isArrowFunction(initializer)) {
//       // data: (x) => x + x 、data: () => ({}) 等等
//       if (ts.isExpression(initializer.body)) {
//         // ({}) 是一个 ParenthesizedExpression，真正的返回表达式在 () 内部，因此需要再取一道
//         return ts.isParenthesizedExpression(initializer.body) ? initializer.body.expression : initializer.body
//       } else {
//         // data: () => { return xxx } 形式
//         body = initializer.body
//       }
//     } else if (ts.isFunctionExpression(initializer)) {
//       // data: function () {} 的形式
//       body = initializer.body
//     }
//   } else if (ts.isMethodDeclaration(node)) {
//     // 函数声明 data() {} 形式
//     body = node.body
//   }
//   const returnStm = body?.statements.find<ts.ReturnStatement>(ts.isReturnStatement)
//   return returnStm?.expression ?? null
// }

/**
 * @description: 解析 对象 类型的 vuex map api 参数
 * @example
 * computed: {
    ...mapState({
      isPartner: state => state.me.partner,
    }),
  },

  TODO: 此方法没有兼容处理如下情况：
  // passing the string value 'count' is same as `state => state.count`
  countAlias: 'count',
 */
export const parseObjectMapArgument = (
  node: ts.ObjectLiteralExpression,
  mapTool: VuexClassTools,
  namespace: ts.Identifier | null,
): StoreInfo[] =>
  node.properties.reduce<StoreInfo[]>((mappings, property) => {
    const funcInfo = parseFuncNode(property)
    if (!funcInfo) {
      return mappings
    }

    const { name, parameters, body } = funcInfo
    mappings.push({
      name,
      namespace,
      mapTool,
      getter: factory.createArrowFunction(undefined, undefined, parameters, undefined, undefined, body!),
    })
    return mappings
  }, [])

/**
 * @description: 解析 数组 类型的 vuex map api 参数
 * @example
 * computed: {
    ...topologyStore.mapState(["connectivity"]),
    canAddNewPreferPath() {
      // 如果选择了Destination的link就不能再添加link了，所以这时候添加按钮将隐藏
      return this.steps.length < AddLinkLimit && !this.newPreferPath.path
    },
  },
 */
export const parseArrayMapArgument = (
  node: ts.ArrayLiteralExpression,
  mapTool: VuexClassTools,
  namespace: ts.Identifier | null,
): StoreInfo[] =>
  node.elements.filter(ts.isStringLiteral).map<StoreInfo>(ele => ({
    name: factory.createIdentifier(getSourceTextFromTextLikeNode(ele)),
    namespace,
    mapTool,
    getter: ele,
  }))
