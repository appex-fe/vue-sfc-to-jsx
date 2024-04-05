/**
 * @description: 将驼峰字符串转换为连字符字符串
 */
export const hyphenate = (str: string, hyp = "-"): string => {
  const hyphenateRE = /\B([A-Z])/g
  return str.replace(hyphenateRE, hyp + "$1").toLowerCase()
}

/**
 * @description: 生成一个简单的随机字符串
 */
export function simpleRandomStr(): string {
  return Math.random().toString(36).slice(2)
}

export function removeCwd(uri: string): string {
  return uri.replace(process.cwd() + "/", "")
}

