import { handleStyleBlock } from "@/style-block/index"
import { convertScript } from "@/convert-option-api-2-class"
import { logger } from "@/utils/logger"

const transform = async (uris: string[]) => {
  await handleStyleBlock(uris)
  logger.info("style block 处理已完成")
  logger.info("=====================")
  for (const uri of uris) {
    await convertScript(uri)
  }
  logger.info("option api 转 class api 工作处理已完成")
}

export default transform
export { SfcToJsxConfig } from "@/shared/types"
