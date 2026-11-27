# 商家圈组 Demo
基于条件圈选店铺，支持独立自动新增/剔除、手动决定保护及两类操作历史。

**当前阶段：需求与设计交付。** Pages展示五张精确字段参考图；完整业务交互由下一阶段Codex实现。
- [设计预览](https://loda0130.github.io/merchant-segmentation-demo/)
- [产品需求](specs/PRD.md)
- [视觉规范](specs/DESIGN.md)
- [开发任务](specs/TASK.md)
- [下一阶段 Codex 指令](specs/CODEX_PROMPT.md)
- [参考图索引](specs/references/README.md)
- [公开检查](specs/SECURITY_REVIEW.md)
- [模板公共组件](docs/components.html)

## 模板来源
通过 GitHub Use this template 创建，所有者loda0130，Public，仅main，未复制其它分支。
源：pm-demo-template main@a5d4f87428d2cfb9a4126e42576d292b92e858e9。
TEMPLATE_VERSION值为1.2.0；源提交标题为V1.2.1，当前如实保留二者。母模板未修改。
新仓初始提交：1aa6cfe4ce2fd3781d442d1291e6db14270cfcdf。

## 运行与发布
```sh
python -m http.server 8000 --bind 127.0.0.1 --directory docs
```
访问 http://127.0.0.1:8000/ 。macOS可用python3。
GitHub Pages：Deploy from a branch → main → /docs。保留docs/.nojekyll，资源均用相对路径。
全部样本为虚构，浏览器演示不操作真实店铺。项目范围与未定细节以PRD为准。
