#!/usr/bin/env node

import { spawn } from 'child_process';
import { resolve as pathResolve } from 'path';

// 获取用户提供的参数（排除前两个默认参数）
const args: string[] = process.argv.slice(2);

// 指定要运行的脚本和传递的参数
spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', pathResolve(__dirname, "cli-engine"), ...args], {
  stdio: "inherit",
});
