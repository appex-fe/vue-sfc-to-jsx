import postcss, { AtRule, Plugin, Root, Rule } from "postcss"
import scssSyntax from "postcss-scss"
import selectorParser, { Pseudo, Combinator } from "postcss-selector-parser"
import { readFileSync } from "fs"
import { parseComponent } from "vue-template-compiler"

function removeCwd(uri: string): string {
  return uri.replace(process.cwd() + "/", "")
}

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
          console.error(`文件${uri}中存在顶层::v-deep选择器：${rule.selector}，请手动处理。`)
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
                      return console.error(
                        `意料之外的多个combinator。文件${removeCwd(root.source?.input.file ?? "")}中止转换，于选择器${
                          rule.selector
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
      }
    })
  },
}

/**
 * Converts the style blocks of the specified files from SFC format to CSS module format.
 *
 * @param fileUris - The URIs of the files to convert.
 * @example
 * const files: string[] = [
 *   "src/components/baseTrafficReport.vue",
 *   "src/components/layout/navigator/cross-orch.vue",
 *   "src/views/newTopology/components/Chart/Connection.vue",
 * ];
 * convert(files);
 */
export async function convert(fileUris: string[]): Promise<{ uri: string; result: string }[]> {
  const arr: { uri: string; result: string }[] = []

  for (const uri of fileUris) {
    const fileContent = readFileSync(uri, "utf-8")
    const scssContents: string[] = parseComponent(fileContent)
      .styles.filter(style => {
        if (!style.scoped) {
          throw new Error("Only scoped styles are supported")
        }
        return style.lang === "scss"
      })
      .map(style => style.content)

    for (const scssContent of scssContents) {
      const result = await postcss([findTopLevelVDeep]).process(scssContent, {
        syntax: scssSyntax,
        from: uri,
      })
      arr.push({ uri, result: result.css })
    }
  }

  return arr
}
