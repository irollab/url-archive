import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',           // 默认 node；需要 DOM 的测试用 // @vitest-environment jsdom 注释切换
    include: ['lib/**/*.test.ts'],
  },
});
