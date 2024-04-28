import "./process-event"
import yargs, { type Arguments } from "yargs";
import { hideBin } from "yargs/helpers";
import { interactiveMode } from "./interactive-mode";
import { isDef } from "@/utils/is";
import { getSfcToJsxConfig } from "@/utils/get-sfc-to-jsx-config";
import { SfcToJsxConfig } from "@/shared/types";
import { InvalidSchemaException } from "@/utils/exception";
import transform from "../transform"

interface AllowedArgs {
  config: string;
  files: string;
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
    // 严格模式，不允许未定义的参数
    .strict()
    .parse() as Args;

  if (isNoArgs(argv)) {
    return interactiveMode();
  }

  // 待处理的文件，优先读取命令行参数，其次读取配置文件
  // const files: string[] = argv.files?.split?.(",")?.map?.(file => file.trim()) || config.entries || [];
  const files: string[] = argv.files?.split?.(",")?.map?.(file => file.trim()) || [];
  if (files.length === 0) {
    throw new Error("未指定要处理的文件");
  }

  const config = await tryLoadConfigFile(argv.config);

  //  TODO: 需要校验一下，配置文件的默认导出是否是期望的 schema
  if (!config) {
    throw new InvalidSchemaException("配置文件没有默认导出");
  }

  transform(files)

}

main();
