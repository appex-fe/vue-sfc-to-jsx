import { ASTExpression } from "vue-template-compiler";
import { addThisPrefixToIndentifier } from "./add-this-prefix";
import { logger } from "@/utils/logger";

// 观察node_modules/vue-template-compiler/build.js#L1834 parseText 函数可得
type TokenItem = string | { "@binding": string }

function getTokens(astNode: ASTExpression): TokenItem[] {
  const { tokens } = astNode
  return tokens as TokenItem[]
}

interface ExpressionToJSXConfig {
  actionWhenFilter?: "warn" | "error"
}

export function expressionToJSX(astNode: ASTExpression, cfg: ExpressionToJSXConfig = {}): string {
  // 假设模版里是<h1>hello {{ var1 }}</h1>, （h1标签本身不属于表达式，所以标签部分不会进入这里）
  // const { expression, text, tokens } = astNode
  // expression 👉 "hello "+_s(var1)
  // text 👉 "hello "+var1
  // tokens 👉 ["hello ", { "@binding": "var1" }]
  const tokens = getTokens(astNode)
  const { actionWhenFilter = "warn" } = cfg
  const naiveFilterDectector = /_f\("/

  return tokens.map(token => {
    if (typeof token === "string") {
      // 安全地补上双引号
      return JSON.stringify(token)
    } else {
      const { "@binding": binding } = token
      if (naiveFilterDectector.test(binding)) {
        const msg = `filter is not supported, binding: ${binding}`
        if (actionWhenFilter === "warn") {
          logger.warn(msg)
        } else if (actionWhenFilter === "error") {
          throw new Error(msg)
        }
      }

      return addThisPrefixToIndentifier(binding)
    }
  }).join(" + ")
}
