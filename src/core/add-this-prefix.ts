import { parse } from "@babel/parser"
import generator from "@babel/generator"
import traverse from "@babel/traverse"
import * as t from "@babel/types"
import { TransformException } from "@/utils/exception"

export function addThisPrefixToIndentifier(code: string): string {
  const ast = parse(code, {
    sourceType: "module",
    plugins: [],
  })

  traverse(ast, {
    Identifier(path) {
      const { name } = path.node
      // https://github.com/vuejs/vue/blob/v2.6.10/src/core/instance/proxy.js#L9
      const allowedGlobals: string[] = (
        "Infinity,undefined,NaN,isFinite,isNaN," +
        "parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent," +
        "Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl," +
        "require"
      ).split(",")
      // 如果是全局变量，不加this前缀
      if (allowedGlobals.some(ns => name.startsWith(ns))) {
        return
      }
      // 检查当前Identifier是否是成员表达式的属性部分，如果是则不进行替换
      if (path.parentPath.isMemberExpression() && path.parentPath.node.property === path.node) {
        return
      }

      // 检查Identifier是否为对象的键，如果是则不进行替换
      if (path.parentPath.isObjectProperty() && path.parentPath.node.key === path.node && !path.parentPath.node.computed) {
        return
      }

      // 检查Identifier是否为对象方法的键，如果是则不进行替换
      if (path.parentPath.isObjectMethod() && path.parentPath.node.key === path.node) {
        return
      }
      // 使用`this`表达式构造新的节点
      const thisExpression = t.memberExpression(t.thisExpression(), path.node)
      // 替换原来的节点
      try {
        path.replaceWith(thisExpression)
      } catch (error) {
        throw new TransformException(`无法替换Identifier: ${name}`, error);
      }
    },
  })
  // 生成新的代码
  const newCode = generator(ast).code
  return newCode
}
