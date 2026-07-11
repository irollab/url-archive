/** Phase B（后台补 AI）向弹出页广播的完成状态 */
export type EnrichStatus = 'done' | 'skipped' | 'failed';

/** 把补 AI 结果映射为弹出页展示文案（纯函数，便于测试） */
export function enrichStatusText(status: EnrichStatus, error?: string): string {
  switch (status) {
    case 'done':
      return 'AI 摘要已补充';
    case 'skipped':
      return '未配置 AI 模型，未生成摘要';
    case 'failed':
      return `AI 补充失败：${error?.trim() || '未知错误'}`;
  }
}
