import { isObjectLike as _isObjectLike, isPlainObject as _isPlainObject } from "lodash";
import type { Primitive } from "./bizless-types";

export const isDef = <T>(test: T): test is NonNullable<T> => test !== undefined && test !== null;
export const isUndef = (test: unknown): test is undefined | null => test === undefined || test === null;
export const isNumber = (test: unknown): test is number => typeof test === "number" && !Number.isNaN(test);
export const isEmptyArray = (test: unknown): test is [] => Array.isArray(test) && test.length === 0;
/** 可配置是否允许数组和函数。默认：不允许数组，不允许函数 */
export const isObjectLike = <T>(
  test: T,
  opt?: { allowedFunction?: boolean; allowedArray?: boolean },
): test is Exclude<T, Primitive> => {
  const { allowedFunction = false, allowedArray = false } = opt ?? {};
  return _isObjectLike(test) && (allowedFunction || typeof test !== "function") && (allowedArray || !Array.isArray(test));
};
/** 纯对象(不含数组、函数)，不允许类以及类的实例 */
export const isPlainObject = <T>(test: T): test is Exclude<T, Primitive> => _isPlainObject(test);
