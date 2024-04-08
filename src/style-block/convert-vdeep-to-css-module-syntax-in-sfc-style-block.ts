import postcss, { AtRule, Plugin, Root, Rule } from "postcss"
import scssSyntax from "postcss-scss"
import selectorParser, { Pseudo, Combinator } from "postcss-selector-parser"
import { CompilerException } from "@/utils/exception"
import { parseVueSfcByPath, removeCwd } from "@/utils/common"

const isFileScopeTopLevel = (node: postcss.Node): boolean => {
  return !node.parent || node.parent.type === "root"
}

const findTopLevelVDeep: Plugin = {
  postcssPlugin: "find-top-level-v-deep",
  Once(root: Root) {
    const uri = removeCwd(root.source?.input.file ?? "")
    root.walkRules((rule: Rule | AtRule) => {
      // 只对规则进行处理（忽略@规则如@media）
      if (rule.type === "rule") {
        // find file scope top level v-deep
        if (rule.selector.includes("::v-deep") && isFileScopeTopLevel(rule)) {
          throw new CompilerException(`文件${uri}中存在顶层::v-deep选择器：${rule.selector}，请手动处理。如果顶层dom没有class，请添加一个css module里的class。否则作用域将会不生效。`)
        } else {
          rule.selector = selectorParser(selectors => {
            selectors.walkPseudos((pseudo: Pseudo) => {
              // 找到::v-deep并转换
              if (pseudo.value === "::v-deep") {
                // 如果有前置nesting，移除之
                const prev = pseudo.prev()
                if (prev?.type === "nesting") {
                  prev.remove()
                }
                pseudo.replaceWith(selectorParser.pseudo({ value: `:global` }))
              }
            })
          }).processSync(rule.selector)
        }
      } else {
        console.warn(`文件${uri}中存在@规则：${rule.toString()}，请手动处理。`)
      }
    })
  },
}

type VDeepResult = { uri: string; result: string, blockStart: number | undefined, blockEnd: number | undefined }

/**
 * Converts the style blocks of the specified files from SFC format to CSS module format.
 *
 * @param fileUri - The URIs of the files to convert.
 * @example
 * const files: string[] = [
 *   "src/components/baseTrafficReport.vue",
 *   "src/components/layout/navigator/cross-orch.vue",
 *   "src/views/newTopology/components/Chart/Connection.vue",
 * ];
 * convert(files);
 */
export async function convertVDeep(fileUri: string): Promise<VDeepResult[]> {
  const arr: VDeepResult[] = []

  const tasks = (await parseVueSfcByPath(fileUri)).styles.filter(style => {
      if (!style.scoped) {
        throw new Error("Only scoped styles are supported")
      }
      return style.lang === "scss"
    })
    .map(async block => {
      const { content, start, end } = block
      const result = await postcss([findTopLevelVDeep]).process(content, {
        syntax: scssSyntax,
        from: fileUri,
      })
      arr.push({ uri: fileUri, result: result.css, blockEnd: end, blockStart: start })
    })

  await Promise.all(tasks)
  return arr
}
