import postcss, { AtRule, Plugin, Root, Rule } from "postcss"
import scssSyntax from "postcss-scss"
import selectorParser, { Pseudo, Combinator } from "postcss-selector-parser"
import { readFile } from "node:fs/promises"
import { parseComponent } from "vue-template-compiler"
import { CompilerException } from "@/utils/exception"
import { removeCwd } from "@/utils/common"

const isFileScopeTopLevel = (node: postcss.Node): boolean => {
  if (node.type === "rule" && "selector" in node && (node.selector as string).trim().startsWith("&")) {
    return node.parent ? isFileScopeTopLevel(node.parent) : true
  }
  return node.parent?.type === "root"
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
                // 找到下一个有效的选择器节点
                let next = pseudo.next()
                let combinator: Combinator | null = null
                while (next && next.type !== "class") {
                  if (next.type === "combinator") {
                    if (combinator) {
                      throw new CompilerException(
                        `意料之外的多个combinator。文件${removeCwd(root.source?.input.file ?? "")}中止转换，于选择器${rule.selector
                        }`,
                      )
                    }
                    combinator = next
                  }
                  console.debug("next???", next.type, `👉${next.toString()}👈`)
                  next = next.next()
                }
                if (next) {
                  next.replaceWith(selectorParser.pseudo({ value: `:global(${next.toString()})` }))
                  pseudo.remove()
                  // `::v-deep .className` -> `:global(.className)` 而不是 ` :global(.className)`, 去掉多余的空格
                  combinator?.remove()
                } else {
                  pseudo.replaceWith(selectorParser.pseudo({ value: `:global` }))
                }
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

  const fileContent = await readFile(fileUri, "utf-8")
  parseComponent(fileContent)
    .styles.filter(style => {
      if (!style.scoped) {
        throw new Error("Only scoped styles are supported")
      }
      return style.lang === "scss"
    })
    .forEach(async block => {
      const { content, start, end } = block
      const result = await postcss([findTopLevelVDeep]).process(content, {
        syntax: scssSyntax,
        from: fileUri,
      })
      arr.push({ uri: fileUri, result: result.css, blockEnd: end, blockStart: start })
    })

  return arr
}
