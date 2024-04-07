import { convertVDeep } from "./convert-vdeep-to-css-module-syntax-in-sfc-style-block";
import { createScssFileByVueSFC, insertImportToVueSFC, type ConvertedScssBlock } from "./convert-style-blocks-to-file";
import { updateClassNameInVueTemplate } from "./update-class-name-in-vue-template";
import { TransformException } from "@/utils/exception";

export async function handleStyleBlock(vueSfcFileUris: string[]) {
  console.time("同步")
  for (const uri of vueSfcFileUris) {
    const vDeepResults = await convertVDeep(uri)
    // check start and end
    if (vDeepResults.some(result => !Number.isInteger(result.blockStart) || !Number.isInteger(result.blockEnd))) {
      throw new TransformException(`Block start or end is undefined in file ${uri}`)
    }
    const convertedScssBlocks: ConvertedScssBlock[] = vDeepResults.map(r => ({
      content: r.result,
      blockStart: r.blockStart!,
      blockEnd: r.blockEnd!,
    }))
    const { scssFilePath } = await createScssFileByVueSFC(uri, convertedScssBlocks)
    const { importName, VueFilePath } = await insertImportToVueSFC(uri, scssFilePath)
    await updateClassNameInVueTemplate(VueFilePath, importName, scssFilePath)
  }
  console.timeEnd("同步")
}

