import { factory, SyntaxKind } from "typescript"
import { VuexClassTools, VuexMapTools } from "./interface"

// class 属性访问修饰符
export const AccessibilityModifier = {
  private: factory.createModifier(SyntaxKind.PrivateKeyword),
  public: factory.createModifier(SyntaxKind.PublicKeyword),
  protected: factory.createModifier(SyntaxKind.ProtectedKeyword),
} as const

const tsxIdentifier = factory.createIdentifier("tsx")
// 定义 tsx 文件固定使用的 _tsx 声明：public _tsx!: tsx.DeclareProps<tsx.AutoProps<this>> & tsx.DeclareOnEvents<ComEvents>
export const tsxPropertyDeclaration = factory.createPropertyDeclaration(
  [AccessibilityModifier.public],
  "_tsx",
  factory.createToken(SyntaxKind.ExclamationToken),
  factory.createIntersectionTypeNode([
    factory.createTypeReferenceNode(factory.createQualifiedName(tsxIdentifier, "DeclareProps"), [
      factory.createTypeReferenceNode(factory.createQualifiedName(tsxIdentifier, "AutoProps"), [factory.createThisTypeNode()]),
    ]),
    factory.createTypeReferenceNode(factory.createQualifiedName(tsxIdentifier, "DeclareOnEvents"), [
      factory.createTypeReferenceNode(factory.createIdentifier("ComEvents"))
    ])
  ]),
  undefined,
)

// 定义 tsx 文件固定使用的 import 声明： import * as tsx from "vue-tsx-support"
export const tsxImporter = factory.createImportDeclaration(
  undefined,
  factory.createImportClause(false, undefined, factory.createNamespaceImport(tsxIdentifier)),
  factory.createStringLiteral("vue-tsx-support"),
)

// vuex map tools name -> vuex-class map tools name
export const VuexMap2VuexClassMap: Record<VuexMapTools, VuexClassTools> = {
  [VuexMapTools.MAP_STATE]: VuexClassTools.STATE,
  [VuexMapTools.MAP_GETTERS]: VuexClassTools.GETTERS,
  [VuexMapTools.MAP_MUTATIONS]: VuexClassTools.MUTATIONS,
  [VuexMapTools.MAP_ACTIONS]: VuexClassTools.ACTIONS,
  [VuexMapTools.NAMESPACE]: VuexClassTools.NAMESPACE,
}

// 定义生命周期钩子的字符串字面量数组
export const LIFECYCLE_HOOKS = [
  "beforeCreate",
  "created",
  "beforeMount",
  "mounted",
  "beforeUpdate",
  "updated",
  "activated",
  "deactivated",
  "beforeDestroy",
  "destroyed",
  "errorCaptured",
] as const

// 本转换工具，目前仅能转换的几种 option，其他 option 将被忽略
export const OPTION_API = [
  "name",
  "data",
  "components",
  "computed",
  "methods",
  "props",
  "watch",
  "directives",
  "filters",
] as const
