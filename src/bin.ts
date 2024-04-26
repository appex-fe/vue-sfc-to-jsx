#!/usr/bin/env node

import { spawn } from "child_process";
import { resolve as pathResolve } from "path";

// 获取用户提供的参数（排除前两个默认参数）
const args: string[] = process.argv.slice(2);

// 指定要运行的脚本和传递的参数
spawn("npx", [
  "ts-node",
  "-r",
  // 这里要写__dirname， "..", "node_modules"是因为这个项目被--global install
  // 如果只写tsconfig-paths/register，会在/usr/local/bin/node_modules下找不到这个包
  // 会被安装在形如：/usr/local/bin 位置下，而实际直接可能在某个项目路径下，比如~/somewhere
  // 所以实际相当于在~/somewhere下执行了`npx ts-node -r tsconfig-paths/register cli-engine ...args`
  // 那么这里的tsconfig-paths/register就是在~/somewhere/node_modules下找的，所以不能只写tsconfig-paths/register
  pathResolve(__dirname, "..", "node_modules", "tsconfig-paths/register"),
  pathResolve(__dirname, "cli-engine"),
  ...args,
], {
  stdio: "inherit",
});
