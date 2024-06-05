import ts, { factory } from "typescript"
import hash from "hash-sum"
import { LIFECYCLE_HOOKS, OPTION_API } from "./const"
import { getSourceTextFromTextLikeNode } from "./helper"

// option api 名称联合类型
export type OptionApi = (typeof OPTION_API)[number]

// 生命周期名称联合类型
export type LifecycleHooks = (typeof LIFECYCLE_HOOKS)[number]

// 生成 method 节点要用到的信息：方法名、入参、函数体、修饰符
export interface FuncInfo {
  name: ts.PropertyName
  parameters: ts.NodeArray<ts.ParameterDeclaration>
  body?: ts.Block | ts.Expression
  // 注意，ts 里，装饰器、修饰符 都属于 modifiers，想了解详情，请查阅 ModifierLike 类型
  modifiers?: ts.ModifierLike[]
}

// 生成 @Watch 要用到的信息，除了 handle 函数信息外，还有 watcher 配置项
export interface WatchInfo {
  funcInfo: FuncInfo
  options?: ts.ObjectLiteralElementLike[]
}

// 生成新组件的属性声明节点（类的成员属性节点）要用到的信息
export interface PropertyInfo {
  initializer?: ts.Expression
  modifiers?: ts.ModifierLike[]
  name: ts.PropertyName
}

export enum VuexMapTools {
  MAP_STATE = "mapState",
  MAP_MUTATIONS = "mapMutations",
  MAP_GETTERS = "mapGetters",
  MAP_ACTIONS = "mapActions",
  NAMESPACE = "createNamespacedHelpers",
}

export enum VuexClassTools {
  STATE = "State",
  MUTATIONS = "Mutation",
  GETTERS = "Getter",
  ACTIONS = "Action",
  NAMESPACE = "namespace",
}

/**
 * @description 生成新的 store 属性声明需要的信息：store map api 类型、计算属性的名称、store 命名空间、store-计算属性 映射方法
 * @example
 * const settingStoreNS = namespace("setting")
 *
  @settingStoreNS.Getter("currentSetting")
  private customerSetting!: SystemSetting

  mapTool:  Getter
  name:  customerSetting
  namespace:  settingStoreNS
  getter: "currentSetting"
 */
export interface StoreInfo {
  mapTool: VuexClassTools
  name: ts.PropertyName
  namespace: ts.Identifier | null
  getter: ts.ArrowFunction | ts.StringLiteral
}

// 生成最终的 tsx 组件，所需要收集的信息
class ComponentInfo {
  public name: string = ""
  public data: ts.PropertyDeclaration[] = []
  public components?: ts.PropertyAssignment = undefined
  public directives?: ts.PropertyAssignment = undefined
  public filters?: ts.PropertyAssignment = undefined
  public computed: (ts.GetAccessorDeclaration | ts.SetAccessorDeclaration)[] = []
  public methods: (ts.MethodDeclaration | ts.PropertyDeclaration)[] = []
  public props: ts.PropertyDeclaration[] = []
  public watch: ts.MethodDeclaration[] = []
  public lifecycleHooks: ts.MethodDeclaration[] = []
  public statementInDataScope: ts.Statement[] = []
  public stores: StoreInfo[] = []

  public isConversionRequired: boolean = false
}

// 对外暴露的，用于操作 ComponentInfo 实例的工具类
export class VComponent {
  private static compo = VComponent.initCompoInfo()

  public static fileUri: string = ""

  public static initCompoInfo(): ComponentInfo {
    VComponent.compo = new ComponentInfo()
    return VComponent.compo
  }

  public static getCompoInfo(): ComponentInfo {
    return VComponent.compo
  }

  public static set<T extends keyof ComponentInfo>(prop: T, info: ComponentInfo[T]): void {
    if (prop in VComponent.compo) {
      VComponent.compo.isConversionRequired = true
      VComponent.compo[prop] = info
    }
  }

  public static get<T extends keyof ComponentInfo>(prop: T): ComponentInfo[T] | null {
    return VComponent.compo[prop] || null
  }

  // watcher 的名称是自动生成的，可能存在重名的可能，需要在最终生成前提前校验处理一下
  public static updateWatchMethodNames(): void {
    const { compo } = VComponent
    const { data, computed, methods, props, lifecycleHooks, components, directives, filters, watch } = compo
    // 首先，按照 watch 名称的拼接规则(详见 help.ts toOnChangeFuncName 方法)，只可能和下述节点存在名称重复的可能性
    const existingNames = new Set(
      [...data, ...computed, ...methods, ...props, ...lifecycleHooks].map(node => getSourceTextFromTextLikeNode(node.name)),
    )
    // components, directives, filters 三个 option api 在 vue 里的类型定义，都是 object，提取属性名称需要特殊逻辑遍历
    ;[components, directives, filters].map(assignment => {
      if (assignment && ts.isObjectLiteralExpression(assignment.initializer)) {
        /**
         * @description map 里的处理逻辑已兼容下面两种写法
         * @example
         * {
            aaa() {},
            bbb: function () {}
          }
         */
        assignment.initializer.properties.map(prop =>
          existingNames.add(prop.name ? getSourceTextFromTextLikeNode(prop.name) : ""),
        )
      }
    })
    compo.watch = watch.map(watchNode => {
      const baseName = getSourceTextFromTextLikeNode(watchNode.name)
      let newName = baseName
      while (existingNames.has(newName)) {
        newName = `${baseName}_${hash(newName).substring(0, 4)}`
      }
      if (newName !== baseName) {
        return factory.updateMethodDeclaration(
          watchNode,
          watchNode.modifiers,
          watchNode.asteriskToken,
          factory.createIdentifier(newName),
          watchNode.questionToken,
          watchNode.typeParameters,
          watchNode.parameters,
          watchNode.type,
          watchNode.body,
        )
      }
      return watchNode
    })
  }
}
