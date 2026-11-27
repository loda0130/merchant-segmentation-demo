# 产品 Demo 母模板

用于产品需求评审的静态网页模板，母模板版本见 [TEMPLATE_VERSION](TEMPLATE_VERSION)。[管理工作台](docs/index.html) 提供可直接改造的起始页，[组件库](docs/components.html) 用于查阅和操作标准组件。示例记录均为虚构数据，当前页面中的修改会在刷新后恢复。

## 母模板与业务子项目

母模板用于维护通用规范、组件代码及可复用经验。业务子项目通过 GitHub 的模板仓库功能独立创建，母模板升级不会自动同步到已创建的业务子项目。

业务专属逻辑留在子项目内。完成阶段性需求后，提取可跨项目复用的组件、规范或经验，对照现有规范查重，经用户确认后再更新母模板。

## 创建项目

1. 母模板保持 **Private**。维护者在源仓库的 **Settings → General** 勾选 **Template repository**。
2. 选择 **Use this template → Create a new repository**。普通非涉密业务 Demo 默认选择 **Public**。若组织策略或模板权限限制可见性选项，由管理员确认后再创建。
3. 涉密项目选择 **Private**，仅本地运行或内部交付。
4. 用 GitHub Desktop 或 Git 克隆新仓库。填写 `specs/` 中的项目需求和验收标准，将页面标题、字段和示例记录替换为项目内容。

选择 Public 前审核将从母模板复制的内容。Public 仓库禁止包含真实业务数据、内部接口地址、访问凭据及未经授权公开的需求文档和截图。提交前检查整个仓库，包含 `docs/` 之外的文件。

[GitHub 创建模板子项目说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)

## 目录

| 路径 | 用途 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 多设备、多模型协作规范 |
| [TEMPLATE_VERSION](TEMPLATE_VERSION) | 母模板版本 |
| [specs/PRD.md](specs/PRD.md) | 需求范围、业务规则及验收标准 |
| [specs/DESIGN.md](specs/DESIGN.md) | 公共视觉与交互规范 |
| [specs/TASK.md](specs/TASK.md) | 任务状态及交接记录 |
| [specs/CHANGELOG.md](specs/CHANGELOG.md) | 版本变更记录 |
| [specs/COMPONENTS.md](specs/COMPONENTS.md) | 标准组件和用法 |
| [specs/CHECKLIST.md](specs/CHECKLIST.md) | 功能、视觉、跨设备、部署和数据安全验收 |
| [specs/LESSONS.md](specs/LESSONS.md) | 可复用经验记录模板 |
| `specs/references/` | 可共享的需求参考资料 |
| `docs/` | 页面、样式、脚本和 Pages 发布目录 |
| `docs/assets/` | 页面公共资源 |

## 本地运行

在仓库根目录用 Python 3 启动静态服务器，然后打开 [http://127.0.0.1:8000/](http://127.0.0.1:8000/)。

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory docs
```

如果系统使用 `python3` 命令，将上例中的 `python` 换成 `python3`。使用当前版本的 Chrome、Edge、Firefox 或 Safari。页面只使用原生 HTML、CSS 和 JavaScript，无需安装前端依赖或构建。

## 样式和组件

页面通过 `docs/styles.css` 加载布局和公共样式。设计 Token 位于 [ui/tokens.css](docs/ui/tokens.css)，基础组件样式位于 [ui/components.css](docs/ui/components.css)。开发时从 [组件库](docs/components.html) 选用现有结构，按 [设计规范](specs/DESIGN.md) 使用全宽工作区和紧凑控件。示例交互由 `docs/app.js` 提供。

## Git 协作

开始工作前核对 Git 状态，按 [AGENTS.md](AGENTS.md) 阅读规格与交接记录。完成验证后更新任务及变更记录，在 GitHub Desktop 或 Git 中审核后再提交与推送。Windows 和 macOS 均可通过 GitHub Desktop 或 Git 同步已提交的变更。

资源路径与文件名的大小写保持一致，文本使用 LF 换行。禁止提交 API Key、Token、密码、私钥和生产环境配置。提交前检查改动内容。

## GitHub Pages

1. 在 Public 业务项目仓库打开 **Settings → Pages**，将 Source 设为 **Deploy from a branch**。
2. 选择 `main` 分支，目录设为 **/docs**。保存后通过 Pages 提供的 URL 验证入口、组件页和资源。
3. 保留 `docs/.nojekyll`，资源使用相对路径，例如 `./styles.css` 和 `./assets/logo.png`。

发布内容仅使用虚构或已脱敏的数据与资源。母模板与涉密项目按 Private 仓库管理。
