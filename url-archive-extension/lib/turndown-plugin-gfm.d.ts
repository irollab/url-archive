// turndown-plugin-gfm 未随包发布类型声明，也无对应 @types 包，故在此补最小声明。
declare module 'turndown-plugin-gfm' {
  import type { Plugin } from 'turndown';

  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
  export const highlightedCodeBlock: Plugin;
}
