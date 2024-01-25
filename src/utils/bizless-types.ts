export type Primitive = null | undefined | string | number | boolean | symbol | bigint;

// 可为空类型
export type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};
// 全为空类型
export type AllNull<T> = {
  [P in keyof T]: null;
};

// 获取数组的类型
export type ArrayType<T> = T extends (infer U)[] ? U : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MustBeArray<T = any> = T extends Array<any> ? T : T[];

/**
 * @example
 * interface User {
 *  name: string
 *  age: number
 *  address: string
 * }
 * // { name?:string; age:number; address:string }
 * type UserPartialName = PartialByKeys<User, 'name'>
 */
export type PartialByKeys<T extends object, U = keyof T> = Omit<Partial<Pick<T, U & keyof T>> & Omit<T, U & keyof T>, never>;

/**
 * 从给定对象类型T中，根据指定的键U，创建一个新类型，该类型将指定的键U的属性设置为必需的，而其他键保持不变。
 * @example
 * // 使用示例
 * type Person = {
 *   name?: string;
 *   age?: number;
 *   address?: string;
 * };
 *
 * type RequiredPerson = RequiredByKeys<Person, 'name' | 'age'>;
 *
 * // RequiredPerson的类型为：
 * // {
 * //   name: string;
 * //   age: number;
 * //   address?: string;
 * // }
 */
export type RequiredByKeys<T extends object, U = keyof T> = Omit<Required<Pick<T, U & keyof T>> & Omit<T, U & keyof T>, never>;

export type NullableByKeys<T extends object, U = keyof T> = Omit<Nullable<Pick<T, U & keyof T>> & Omit<T, U & keyof T>, never>;
export type NullByKeys<T extends object, U = keyof T> = Omit<AllNull<Pick<T, U & keyof T>> & Omit<T, U & keyof T>, never>;
