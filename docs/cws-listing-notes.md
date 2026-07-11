# Chrome Web Store 上架填写草稿

## 隐私政策 URL
https://github.com/irollab/url-archive/blob/main/PRIVACY.md

## 单一用途
把网页 URL 与内容存入用户的 Obsidian，并在新标签页复现/找回这些收藏。

## 权限理由
- activeTab：用户点击扩展图标时，剪藏当前标签页。
- scripting：向当前页按需注入抽取脚本以提取正文。
- storage：在本机保存用户设置与收藏数据。
- bookmarks：一键导入浏览器书签生成收藏网格。
- favicon：显示收藏站点的图标。
- optional host（http/https，运行时申请）：向用户自行配置的 Obsidian 与 LLM 端点发送数据；以及用户主动从新标签页剪藏后台标签页时访问该页面。默认不申请，仅在相关操作时按需请求。

## 数据用途披露
- 收集/使用：网页内容（仅剪藏时，发往用户自配 LLM）、用户配置（本机存储）。
- 不出售/不共享给第三方；无遥测。
