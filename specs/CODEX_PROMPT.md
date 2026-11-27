# 下一阶段 Codex 执行指令
你正在 loda0130/merchant-segmentation-demo 实现“商家圈组”静态产品 Demo。请完成实现和验证，不要只输出计划。

1. 先执行 git status --short --branch，确认当前是本项目且保留未提交修改。依次读取 AGENTS.md、specs/PRD.md、DESIGN.md、TASK.md、CHANGELOG.md、COMPONENTS.md、CHECKLIST.md、references/README.md，再查看 docs/index.html 和五张参考图。
2. 模板来源 main@a5d4f87428d2cfb9a4126e42576d292b92e858e9，TEMPLATE_VERSION=1.2.0，提交标题V1.2.1。不得改 pm-demo-template。不要重新提取商品管理大文件，不要套用价卡/权益包逻辑。
3. 先把当前设计入口保留为 docs/design-preview.html，再用 docs/index.html 实现圈组列表。全部用原生HTML/CSS/JS、相对路径、本地资源，无构建/CDN。
4. 复用 docs/styles.css、ui/tokens.css、ui/components.css，保留 components.html及其app.js示例。业务代码用 segmentation-model.js、segmentation.js、segmentation.css；不要让模板app.js在业务页因缺失DOM报错。
5. 按TASK T01–T09完成：列表、创建编辑、条件表达式、独立开关、模拟扫描、详情候选、人工配置、批量处理、两类历史、启停和删除。
6. 核心规则不得降级：
   - 标签组内OR，组间AND/OR/AND NOT，左结合且显示括号；其他维度AND。
   - 手动保护按groupId+shopId独立于成员集合保存；手动删除不能因移除成员而丢失保护；自动扫描不得反向覆盖。
   - 自动新增和剔除四种组合均正确；默认24小时为Demo假设，提供模拟扫描，不伪装真实后台。
   - 配置店铺只有“新增/删除”单选和多行ID，不出现标签ID或“本次变更”。
   - 候选执行前重验版本和状态；失效项有原因；系统日志操作人为“系统”，幂等扫描不重复写进出历史。
   - 最新方案是条件圈店，不实现旧版入组打标/移组删标签。
7. PRD标D的是为了推进Demo的明示假设，按文档实现并保留待确认项，不当作生产规则。所有名称、ID、金额与人员均虚构。
8. 使用PRD第7节六店样本，双开扫描后成员=900001/900003/900005，可加入1、待剔除1、保护冲突2、实际进出日志新增2。第二次扫描不得新增进出日志。补其他开关组合、逻辑和金额边界的模型测试。
9. 通过本地静态HTTP验证三档桌面1920×1080/1440×900/1280×800与窄屏；实测行操作≥36×30px且不重叠，宽弹窗底部可达，表格局部横滚；实际操作全部关键流程及取消/Esc。保存首版与修复后截图，注明样本与版本。
10. 更新TASK/CHANGELOG，报告文件、测试结果、未验证项、复用组件与局部覆盖理由。发布源保持main /docs。提交推送按当前会话授权及AGENTS执行，不force push，不改母模板。

本轮目标是完整可交互Demo，现有设计参考入口不是已完成的业务页面。
