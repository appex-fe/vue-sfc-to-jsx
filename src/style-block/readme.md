# 模块概述

该模块的主要目的是将 Vue.js 单文件组件（SFC）中的样式代码块（style blocks）提取出来，转换为 SCSS 格式的 CSS Modules，并在原始 SFC 中插入对新生成的 SCSS 文件的引用。此外，工具还提供了从 SCSS 文件中获取所有类名信息的功能，以便于后续的步骤中使用。

## 名词解释/消歧义

**selector** vs **class name**：

- **selector**：选择器，用于匹配 HTML 元素的样式规则。比如 `div`、`#id`、`.class` 等。
- **class name**：类名，用于标记 HTML 元素的样式规则。比如 `<div class="class"></div>` 中的 `class`。

可以说class name是selector的一种，但是在这里我们更多的关注的是class name的作用域问题，而不是selector的问题。

**局部作用域** vs **全局作用域**：

- **全局作用域**：类名在全局范围内有效，可能会影响到其他组件。

    常见语法
    ```scss
    :global {
      .class1 {
        color: red;
        .class33 {
          color: red;
        }
      }
      .class2 {
        color: red;
      }
    }

    :global .classA {
      color: green;
      .classB {
        color: green;
      }
    }

    :global(.classX) {
      color: blue;
      .classY {
        color: blue;
      }
    }
    ```

    编译后得到

    ```css
    .class1 {
      color: red;
    }
    .class1 .class33 {
      color: red;
    }
    .class2 {
      color: red;
    }

    .classA {
      color: green;
    }
    .classA .classB {
      color: green;
    }

    .classX {
      color: blue;
    }
    .classX .test-module__classY--xTt6Oa {
      color: blue;
    }
    ```

- **局部作用域**：类名只在当前组件内有效，不会影响到其他组件。


## 主要功能

### 1. 样式提取与转换

#### 功能描述

- 从 Vue SFC 文件中提取所有的 `<style>` 标签内容。
- 将提取出的样式内容合并，并转换为一个新的 SCSS 文件。
- 在原始的 Vue SFC 文件中插入对新生成的 SCSS 文件的引用。

#### 实现细节

- 使用 `vue-template-compiler` 解析 Vue SFC，提取 style 块的内容。
- 使用 `fs` 模块进行文件的读写操作，生成新的 SCSS 文件。
- 采用唯一命名策略（文件名后加随机字符串）以避免文件名冲突。

### 2. 类名获取与处理

#### 功能描述

- 从 SCSS 文件中解析出所有使用的类名。
- 标记每个类名的作用域（局部或全局）。

#### 实现细节

- 通过 `sass` 编译 SCSS 文件为 CSS，然后使用 `postcss` 进行解析。
- 类名的作用域通过 `:global` 和 `:local` 的使用来确定。

### 3. 文件路径处理

#### 功能描述

- 生成唯一的文件路径，以避免命名冲突。
- 根据 Vue 文件的路径和文件名生成对应的 SCSS 文件名。

#### 实现细节

- 使用 `path` 和 `fs` 模块检查文件的存在性，并生成唯一的文件路径。

### 4. 类名作用域标记

#### 功能描述

- 分析 SCSS 文件中的类名使用，标记每个类名为局部作用域或全局作用域。
- 对于同时在局部和全局作用域使用的类名，标记为未知作用域。

#### 实现细节

- 通过正则表达式和 `postcss` 解析规则，提取并处理类名及其作用域信息。
