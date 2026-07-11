# 删除/重命名收藏时同步清理语义向量

日期：2026-07-10

## 背景

删除收藏笔记时插件只 `rebuildIndex()`（重建 `entries`），不动 `semanticVectors`，
留下「孤儿向量」：`searchSemanticIndex` 会因反查不到笔记而跳过（结果不错），
但面板「语义向量」数字虚高、多占 `data.json`。重命名同理（且当前未监听 rename）。

## 目标

删除/重命名收藏笔记时，`semanticVectors` 同步更新，数字与实际一致，无需手动「重建语义索引」。

## 新增纯函数（`src/semantic-index.ts`）

- `removeVectorForPath(vectors, path): SemanticVector[]`
  过滤掉该 `path` 的向量；无匹配时返回**原数组引用**（便于调用方判断是否需要写盘）。
- `renameVectorPath(vectors, oldPath, newPath): SemanticVector[]`
  把 `oldPath` 向量的 `path` 改为 `newPath`，保留 `embedding`/`hash`（改名无需重嵌）；无匹配返回原引用。

## `main.ts` 事件接线

- `vault.on('delete', file)`：`removeVectorForPath(vectors, file.path)` → 引用变化才 `savePluginData()`；随后 `rebuildIndex()`（现状保留）。
- 新增 `vault.on('rename', (file, oldPath))`：
  - `inArchiveFolder(file.path)` → `renameVectorPath(vectors, oldPath, file.path)`（保留向量）。
  - 否则（移出收藏夹）→ `removeVectorForPath(vectors, oldPath)`（删向量）。
  - 引用变化才 `savePluginData()`；随后 `rebuildIndex()`。
- 抽私有 helper `applyVectorChange(next)`：`if (next !== this.semanticVectors) { this.semanticVectors = next; await this.savePluginData(); }`。
- 文件夹判断复用 `rebuildIndex` 的前缀规则：`path.startsWith(\`${archiveFolder.replace(/\/+$/,'')}/\`)`。

## 数据流

delete/rename 事件 → 纯函数更新 `semanticVectors` → 有变化则持久化 → `rebuildIndex()` 刷新 `entries`。
面板统计与语义搜索立即一致。

## 边界/取舍

- 删/改**非收藏**文件：path 不在向量里 → 纯函数返回原引用 → 不写盘，无副作用。
- **移出**收藏夹 = 视为删向量（否则变孤儿）。
- **移入**收藏夹：旧路径本无向量，新路径进 `entries` → 成「待嵌入」（正常，靠自动嵌入/重建补上）。

## 测试

- `removeVectorForPath`：移除匹配项；无匹配返回原引用。
- `renameVectorPath`：改 path 保留 embedding/hash；无匹配返回原引用。
- 插件 `vitest` + `tsc --noEmit` + `build`，构建后部署 `main.js` 到 `.obsidian/plugins/url-archive/`。
