import "./process-event"
import yargs, { type Arguments } from "yargs";
import { hideBin } from "yargs/helpers";
import { interactiveMode } from "./interactive-mode";
import { isDef } from "@/utils/is";
import { getSfcToJsxConfig } from "@/utils/get-sfc-to-jsx-config";
import { SfcToJsxConfig, Stage } from "@/shared/types";
import { InvalidSchemaException } from "@/utils/exception";
import transform from "../transform"
import { logger } from "@/utils/logger";

interface AllowedArgs {
  config: string;
  files: string;
  stages: string
}

type Args = Partial<Arguments<AllowedArgs>>;

function isNoArgs(args: Args): boolean {
  return Object.keys(args).filter(key => {
    const builtInPrefix = ["_", "$"];
    return builtInPrefix.every(prefix => !key.startsWith(prefix));
  }).length === 0;
}

// async function loadJsConfigFile(): Promise<SfcToJsxConfig> {
//   return await getSfcToJsxConfig();
// }

// async function loadTsConfigFile(): Promise<SfcToJsxConfig> {
//   // TODO: load ts config file
//   return {} as SfcToJsxConfig;
// }

async function tryLoadConfigFile(configPath: string | undefined | null): Promise<SfcToJsxConfig> {
  let config: SfcToJsxConfig;
  if (isDef(configPath)) {
    process.env.USER_DEFINED_CONFIG_PATH = configPath;
    if (configPath.endsWith(".ts") || configPath.endsWith(".js")) {
      config = await getSfcToJsxConfig();
    } else {
      throw new Error("不支持的配置文件类型");
    }
  } else {
    config = await getSfcToJsxConfig();
  }
  return config
}

async function main() {
  // 定义帮助信息和参数
  const argv = yargs(hideBin(process.argv))
    .usage("Usage: $0 [options]")
    .help("h")
    .alias("h", "help")
    .option("c", {
      alias: "config",
      describe: "指定配置文件的路径",
      type: "string",
    })
    .option("f", {
      alias: "files",
      describe: "扫描指定的文件，以英文半角逗号分隔",
      type: "string",
    })
    .option("s", {
      alias: "stages",
      describe: "指定要执行的阶段，目前支持 style、script，以英文半角逗号分隔；不传将默认执行所有流程",
      type: "string",
    })
    // 严格模式，不允许未定义的参数
    .strict()
    .parse() as Args;

  if (isNoArgs(argv)) {
    return interactiveMode();
  }

  const config = await tryLoadConfigFile(argv.config);

  //  TODO: 需要校验一下，配置文件的默认导出是否是期望的 schema
  if (!config) {
    throw new InvalidSchemaException("配置文件没有默认导出");
  }


  // 待处理的文件，优先读取命令行参数，其次读取配置文件
  // const files: string[] = argv.files?.split?.(",")?.map?.(file => file.trim()) || config.entries || [];
  const files: string[] = argv.files?.split?.(",")?.map?.(file => file.trim()) || config.entries || [];
  if (files.length === 0) {
    throw new Error("未指定要处理的文件");
  }

  const validStageOptions = new Set(["style", "script"])
  const configStages = argv.stages?.split(",")?.map(file => file.trim()) || config.stages || []
  const [invalidStages, validStages] = configStages.reduce((pre, cur) => {
    const [invalidSet, validSet] = pre
    if (validStageOptions.has(cur)) {
      validSet.push(cur as Stage)
    } else {
      invalidSet.push(cur)
    }
    return pre
  }, [[] as string[], [] as Stage[]])
  // const invalidStages = stages.filter(stage => !["style", "script"].includes(stage))
  if (invalidStages?.length > 0) {
    logger.warn(`将忽略非法 stage 参数：${invalidStages.join(", ")}`)
  }
  const stages: Stage[] = validStages.length ? validStages : Array.from(validStageOptions) as Stage[]
  logger.warn(`将执行如下 stage：${stages.join(", ")}`)

  transform(files, stages)
}

main();
