import { parse, NodeTypes, ElementNode, RootNode } from "@vue/compiler-dom"
import * as fs from "fs"
import * as t from "@babel/types"
import { parseExpression } from "@babel/parser"
import generate from "@babel/generator"
import logger from "../utils/logger"

enum ClassScopeEnum {
  LOCAL,
  GLOBAL,
  UNKNOWN,
}

const getAllClassNamesFromScssFile = (scssFilePath: string): { classNames: { [className: string]: ClassScopeEnum } } => {
  // 实现略
  return {
    classNames: {
      tit: ClassScopeEnum.LOCAL,
      "chart-area": ClassScopeEnum.LOCAL,
      chart2: ClassScopeEnum.LOCAL,
      active: ClassScopeEnum.LOCAL,
      "text-danger": ClassScopeEnum.LOCAL,
      errorClass: ClassScopeEnum.LOCAL,
      activeClass: ClassScopeEnum.LOCAL,
    },
  }
}

interface ClassReplacementItem {
  start: number
  end: number
  value: string
}

/**
 * @description: 获取需要被替换的class名称数组
 */
function getReplacedClassNames(classScopes: { [className: string]: ClassScopeEnum }): string[] {
  return Object.keys(classScopes).filter(className => classScopes[className] === ClassScopeEnum.LOCAL)
}

/**
 * @description: 获取替换的class文本，同时允许返回普通字符串或模板字符串子元素格式
 */
function getReplaceClassText(
  importName: string,
  className: string,
  expressionType: "string" | "templateLiteral" = "string",
): string {
  const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/
  const classText = identifierPattern.test(className) ? `${importName}.${className}` : `${importName}['${className}']`
  return expressionType === "templateLiteral" ? `\${${classText}}` : classText
}

/**
 * @description: 处理字符串表达式
 * 当expression = "tit tit2" 同时scssClasses=["tit"] parentExpressionType = 'string' 时，对应返回值为{newStringExpression:"[styles.tit, 'tit2']",updatedCountNum:1}
 * 当expression = "tit tit2" 同时scssClasses=["tit"] parentExpressionType = 'templateLiteral' 时，对应返回值为{newStringExpression:"${styles.activeClass} tit2",updatedCountNum:1}
 */
function processStringExpressionInClass(
  expression: string,
  scssClasses: string[],
  importName: string,
  // 父节点表达式的类型，当父节点表达式类型为模板字符串时将其转换成${styles.activeClass}的形式，当表达式为string时，只有一个class只需直接返回替换的字符即可，当有多个class时需要将其转换成数组
  parentExpressionType: "string" | "templateLiteral" = "string",
): { newStringExpression: string; updatedCountNum: number } {
  let newStringExpression: string = ""
  let allUpdatedCountNum: number = 0
  const classList = expression.split(" ")

  const updatedClassList = classList.map((className: string) => {
    if (scssClasses.includes(className)) {
      allUpdatedCountNum++
      // 根据是否模板字符串来返回不同格式
      return getReplaceClassText(importName, className, parentExpressionType)
    }
    // 如果不是模板字符串，保持原来的字符串格式
    return parentExpressionType === "templateLiteral" ? className : `'${className}'`
  })
  if (allUpdatedCountNum > 0) {
    if (parentExpressionType === "templateLiteral") {
      // 如果是模板字符串，直接返回模板字符串表达式
      newStringExpression = updatedClassList.join(" ")
    } else if (updatedClassList.length === 1) {
      newStringExpression = updatedClassList[0]
    } else {
      // 如果不是模板字符串，返回数组格式
      newStringExpression = `[${updatedClassList.join(", ")}]`
    }
  }
  return {
    newStringExpression,
    updatedCountNum: allUpdatedCountNum,
  }
}

/**
 * @description: 处理条件表达式，该函数内部已经修改了对应表达式的相关属性
 */
function processConditionalExpression(
  expression: t.ConditionalExpression,
  scssClasses: string[],
  importName: string,
  vueFilePath: string,
  startLine: number,
): { updatedCountNum: number } {
  let allUpdatedCountNum = 0
  const { consequent, alternate } = expression
  // 检查并替换真值部分 consequent
  if (t.isStringLiteral(consequent)) {
    const { newStringExpression, updatedCountNum } = processStringExpressionInClass(
      consequent.value,
      scssClasses,
      importName,
      "templateLiteral",
    )
    if (updatedCountNum) {
      expression.consequent = t.identifier(`\`${newStringExpression}\``)
      allUpdatedCountNum += updatedCountNum
    }
  } else if (t.isTemplateLiteral(consequent)) {
    const { updatedCountNum } = processTemplateLiteralExpression(consequent, scssClasses, importName, vueFilePath, startLine)
    allUpdatedCountNum += updatedCountNum
  } else {
    logger.warning(
      vueFilePath,
      startLine,
      `During Conditional expression parsing, there are expressions that are not supported. Please check manually.Expression type: ${consequent.type}.`,
    )
  }
  // 检查并替换假值部分 alternate
  if (t.isStringLiteral(alternate)) {
    const { newStringExpression, updatedCountNum } = processStringExpressionInClass(
      alternate.value,
      scssClasses,
      importName,
      "templateLiteral",
    )
    if (updatedCountNum) {
      expression.alternate = t.identifier(`\`${newStringExpression}\``)
      allUpdatedCountNum += updatedCountNum
    }
  } else if (t.isTemplateLiteral(alternate)) {
    const { updatedCountNum } = processTemplateLiteralExpression(alternate, scssClasses, importName, vueFilePath, startLine)
    allUpdatedCountNum += updatedCountNum
  } else {
    logger.warning(
      vueFilePath,
      startLine,
      `During Conditional expression parsing, there are expressions that are not supported. Please check manually.Expression type: ${consequent.type}.`,
    )
  }
  return { updatedCountNum: allUpdatedCountNum }
}

/**
 * @description: 处理模板字符串表达式，该函数内部已经修改了对应表达式的相关属性
 */
function processTemplateLiteralExpression(
  expression: t.TemplateLiteral,
  scssClasses: string[],
  importName: string,
  vueFilePath: string,
  startLine: number,
): { updatedCountNum: number } {
  let allUpdatedCountNum = 0
  // 处理模板字符串中的静态表达式部分
  expression.quasis.forEach(quasi => {
    const expressionStart = expression.start ?? 0
    const isFirstQuasi = quasi.start === expressionStart + 1
    // 该条件为了限制当模板字符串为`tit ${foo} ${bar}tit`时，不让其${bar}tit部分误转换为${bar}${styles.tit}
    if (isFirstQuasi || quasi.value.raw.startsWith(" ")) {
      const { newStringExpression, updatedCountNum } = processStringExpressionInClass(
        quasi.value.raw,
        scssClasses,
        importName,
        "templateLiteral",
      )
      if (updatedCountNum > 0) {
        quasi.value.raw = newStringExpression
        allUpdatedCountNum++
      }
    }
  })
  const expressions = expression.expressions
  expressions.forEach((expr, index) => {
    // 处理模板字符串中的动态表达式部分
    if (t.isStringLiteral(expr)) {
      const { newStringExpression, updatedCountNum } = processStringExpressionInClass(
        expr.value,
        scssClasses,
        importName,
        "templateLiteral",
      )
      if (updatedCountNum > 0) {
        const newExpr = parseExpression(newStringExpression, { plugins: ["jsx"] })
        if (t.isExpression(newExpr)) {
          expressions[index] = newExpr
          allUpdatedCountNum += updatedCountNum
        }
      }
    } else if (t.isConditionalExpression(expr)) {
      // 处理条件表达式的真值和假值部分
      const { updatedCountNum } = processConditionalExpression(expr, scssClasses, importName, vueFilePath, startLine)
      allUpdatedCountNum += updatedCountNum
    } else {
      logger.warning(
        vueFilePath,
        startLine,
        `During template literal expression parsing, there are expressions that are not supported. Please check manually.Expression type: ${expr.type}.`,
      )
    }
  })
  return { updatedCountNum: allUpdatedCountNum }
}

/**
 * @description: 动态class表达式处理
 */
function processDynamicClassExpression(
  expression: string,
  scssClasses: string[],
  importName: string,
  vueFilePath: string,
  startLine: number,
): { newExpression: string; updatedCountNum: number } {
  let newExpression: string = ""
  let allUpdatedCountNum: number = 0
  // 使用@babel/parser解析仅包含表达式的代码
  const ast = parseExpression(expression, {
    plugins: ["jsx"],
  })
  // 对象表达式
  // 要替换的class：activeClass text-danger :class="{active:isActive,'text-danger':hasError,tit1:hasError }" => :class="{[styles.active]:isActive,[styles['text-danger']]:hasError,tit1:hasError}"
  if (t.isObjectExpression(ast)) {
    ast.properties.forEach(prop => {
      if (t.isObjectProperty(prop) && (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key))) {
        const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value
        if (scssClasses.includes(key)) {
          // 创建一个新的计算属性的键
          const newKey = t.identifier(getReplaceClassText(importName, key))
          // 将原来的键替换为新的计算属性的键
          prop.key = newKey
          // 让key值用[]包起来,即变成[styles.active]
          prop.computed = true
          allUpdatedCountNum++
        }
      } else {
        logger.warning(
          vueFilePath,
          startLine,
          `During object expression parsing, there are expressions that are not supported. Please check manually.Expression type: ${prop.type}.`,
        )
      }
    })
  }
  // 数组表达式
  // 要替换的class：activeClass tit :class="[isActive? 'activeClass':'','tit','tit1']" => :class="[isActive?`${styles.activeClass}`:'',styles.tit,'tit1']"
  else if (t.isArrayExpression(ast)) {
    const { elements } = ast
    elements.forEach((element, index: number) => {
      if (t.isStringLiteral(element)) {
        if (scssClasses.includes(element.value)) {
          // 替换数组中的字符串字面量为 styles 对象属性
          elements[index] = t.identifier(getReplaceClassText(importName, element.value))
          allUpdatedCountNum++
        }
      }
      // 数组元素为条件表达式时
      else if (t.isConditionalExpression(element)) {
        const { updatedCountNum } = processConditionalExpression(element, scssClasses, importName, vueFilePath, startLine)
        allUpdatedCountNum += updatedCountNum
      }
      // 数组元素为模板字符串时
      else if (t.isTemplateLiteral(element)) {
        const { updatedCountNum } = processTemplateLiteralExpression(element, scssClasses, importName, vueFilePath, startLine)
        allUpdatedCountNum += updatedCountNum
      } else {
        logger.warning(
          vueFilePath,
          startLine,
          `During array expression parsing, there are expressions that are not supported. Please check manually.Expression type: ${element?.type}.`,
        )
      }
    })
  }
  // 条件表达式
  // 要替换的class：activeClass tit 转换结果 :class="isActive? `activeClass tit tit1`:''" => :class="isActive?`${styles.activeClass} ${styles.tit} tit1`:''"
  else if (t.isConditionalExpression(ast)) {
    const { updatedCountNum } = processConditionalExpression(ast, scssClasses, importName, vueFilePath, startLine)
    allUpdatedCountNum += updatedCountNum
  }
  // 字符串表达式
  // 要替换的class：activeClass tit 转换结果 :class="'activeClass tit tit2'" => :class="[styles.activeClass, styles.tit, 'tit2']"
  else if (t.isStringLiteral(ast)) {
    const { newStringExpression, updatedCountNum } = processStringExpressionInClass(ast.value, scssClasses, importName)
    allUpdatedCountNum += updatedCountNum
    return { newExpression: newStringExpression, updatedCountNum }
  }
  // 模板字符串表达式
  // 要替换的class：activeClass tit 转换结果 :class="`${isActive? 'activeClass':''} tit tit1 ${bar}tit`" => :class="`${isActive?`${styles.activeClass}`:''} ${styles.tit} tit1 ${bar}tit`"
  else if (t.isTemplateLiteral(ast)) {
    const { updatedCountNum } = processTemplateLiteralExpression(ast, scssClasses, importName, vueFilePath, startLine)
    allUpdatedCountNum += updatedCountNum
  } else {
    logger.warning(vueFilePath, startLine, `Unsupported dynamic class expression type: ${ast.type}.Please check manually!`)
  }
  if (allUpdatedCountNum > 0) {
    // 使用 @babel/generator 将修改后的 AST 转换为代码字符串
    newExpression = generate(ast, { compact: true }).code
  }
  return { newExpression, updatedCountNum: allUpdatedCountNum }
}

/**
 * @description: 收集class替换信息
 */
function collectClassReplacements(
  node: ElementNode,
  scssClasses: string[],
  importName: string,
  vueFilePath: string,
  replacements: ClassReplacementItem[] = [],
): { replacements: ClassReplacementItem[]; updatedCount: number } {
  let updatedCount = 0
  node.props.forEach(prop => {
    // 静态class文本处理
    if (prop.type === NodeTypes.ATTRIBUTE && prop.name === "class" && prop.value) {
      const { newStringExpression, updatedCountNum } = processStringExpressionInClass(prop.value.content, scssClasses, importName)
      if (updatedCountNum > 0) {
        // 记录替换信息
        replacements.push({
          start: prop.loc.start.offset,
          end: prop.loc.end.offset,
          value: `:class="${newStringExpression}"`,
        })
        updatedCount += updatedCountNum
        logger.info(vueFilePath, prop.loc.start.line, `Updated static class: '${prop.value.content}' to '${newStringExpression}'`)
      }
    }
    // 动态class文本处理
    // 处理了v-bind:class="xxx"和:class="xxx"的场景
    else if (
      prop.type === NodeTypes.DIRECTIVE &&
      prop.name === "bind" &&
      prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
      prop.arg?.content === "class" &&
      prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION &&
      prop.exp?.content
    ) {
      const startLine = prop.exp.loc.start.line
      const { newExpression, updatedCountNum } = processDynamicClassExpression(
        prop.exp.content,
        scssClasses,
        importName,
        vueFilePath,
        startLine,
      )
      if (updatedCountNum > 0) {
        replacements.push({
          start: prop.exp.loc.start.offset,
          end: prop.exp.loc.end.offset,
          value: newExpression,
        })
        updatedCount += updatedCountNum
        logger.info(vueFilePath, startLine, `Updated dynamic class: '${prop.exp.content}' to '${newExpression}'`)
      }
    }
  })
  // 递归处理子节点
  node.children?.forEach(child => {
    if (child.type === NodeTypes.ELEMENT) {
      const { updatedCount: childUpdatedCount } = collectClassReplacements(
        child,
        scssClasses,
        importName,
        vueFilePath,
        replacements,
      )
      updatedCount += childUpdatedCount
    }
  })
  return { replacements, updatedCount }
}

/**
 * @description: 转换Vue文件template中的class
 */
export function updateClassNameInVueTemplate(
  vueFilePath: string,
  importName: string,
  scssFilePath: string,
): { status: boolean; updatedCount: number } {
  try {
    // 读取.vue文件的内容
    let vueFileContent = fs.readFileSync(vueFilePath, "utf-8")
    // 解析.vue文件中的template部分
    const root = parse(vueFileContent) as RootNode
    const templateNode = root.children.find(node => node.type === NodeTypes.ELEMENT && node.tag === "template") as
      | ElementNode
      | undefined
    if (!templateNode) {
      throw new Error("No <template> block found in the Vue file.")
    }
    // 获取.scss文件中所有class名称
    const scssClasses = getReplacedClassNames(getAllClassNamesFromScssFile(scssFilePath).classNames)
    // 收集替换信息
    const { replacements, updatedCount } = collectClassReplacements(templateNode, scssClasses, importName, vueFilePath)
    // 根据收集到的替换信息，从后往前替换，避免偏移量的问题
    replacements.sort((a, b) => b.start - a.start)
    replacements.forEach(({ start, end, value }) => {
      vueFileContent = vueFileContent.slice(0, start) + value + vueFileContent.slice(end)
    })
    // 将更新后的内容写回.vue文件
    fs.writeFileSync(vueFilePath, vueFileContent, "utf-8")
    logger.info(vueFilePath, null, `Class replacement completed with ${updatedCount} updates.`)
    return { status: true, updatedCount }
  } catch (error) {
    if (error instanceof Error) {
      logger.error(vueFilePath, null, error.stack ?? error.message)
    } else {
      logger.error(vueFilePath, null, String(error))
    }
    return { status: false, updatedCount: 0 }
  }
}

// 调用示例
const result = updateClassNameInVueTemplate("D:/学习/code/vue-sfc-to-jsx/src/core/chart.vue", "styles", "/path/to/your/file.scss")
