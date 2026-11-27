# 商家圈组 Demo
基于条件圈选店铺，支持独立自动新增/剔除、手动决定保护及两类操作历史。

**当前版本：0.2.0 静态交互 Demo。** 进入「潜力店铺组」，点击「模拟扫描」可运行 PRD 第 7 节的六店验收场景。

- [业务入口](docs/index.html)
- [设计预览](docs/design-preview.html)
- [产品需求](specs/PRD.md)
- [视觉规范](specs/DESIGN.md)
- [开发任务](specs/TASK.md)
- [本轮执行指令](specs/CODEX_PROMPT.md)
- [参考图索引](specs/references/README.md)
- [公开检查](specs/SECURITY_REVIEW.md)
- [模板公共组件](docs/components.html)
- [运行截图与环境](specs/verification/0.2.0/README.md)

## 模板来源
通过 GitHub Use this template 创建，所有者loda0130，Public，仅main，未复制其它分支。
源：pm-demo-template main@a5d4f87428d2cfb9a4126e42576d292b92e858e9。
TEMPLATE_VERSION值为1.2.0；源提交标题为V1.2.1，当前如实保留二者。母模板未修改。
新仓初始提交：1aa6cfe4ce2fd3781d442d1291e6db14270cfcdf。

## 运行与发布
```sh
python -m http.server 8000 --bind 127.0.0.1 --directory docs
```
浏览器打开 [本地 Demo](http://127.0.0.1:8000/)。macOS 可用 `python3`。
GitHub Pages 的发布源为 `main` 的 `/docs`，静态资源使用相对路径。 [Pages 入口](https://loda0130.github.io/merchant-segmentation-demo/)

数据保存在当前页面内存，刷新即恢复样本。店铺、人员、ID 和金额均为虚构，范围及待确认事项以 PRD 为准。可用 `node --test tests/segmentation-model.test.cjs` 运行模型测试。
