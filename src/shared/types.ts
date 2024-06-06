export type Stage = "style" | "script"

export interface SfcToJsxConfig {
  scssAliasResolver: (url: string) => string
  /** 要处理的文件。会被cli中的--files(-f)所覆盖 */
  entries?: string[]
  stages?: Stage[]
}
