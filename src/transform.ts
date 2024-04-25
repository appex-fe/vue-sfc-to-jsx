import { handleStyleBlock } from "@/style-block/index"
import { logger } from "@/utils/logger"

const transform = async (uris: string[]) => {
  await handleStyleBlock(uris)
  logger.info("style block 处理已完成")
}

export default transform
export { SfcToJsxConfig } from "@/shared/types"
