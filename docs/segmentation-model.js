"use strict";

const Segmentation = (() => {
  const types = ["集运", "自发货", "海外仓"];
  const categories = ["家居", "办公", "服饰"];
  const tagJoins = { AND: "且", OR: "或", "AND NOT": "且非" };
  const scanIntervalHours = 24;
  const operator = "示例运营";
  const sources = {
    scan: "系统扫描",
    configure: "人工配置",
    batch: "人工批量处理"
  };
  const actions = { create: "创建", edit: "编辑规则", enable: "启用", disable: "停用", delete: "删除" };
  const dayFormat = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const formatTime = (value) => value ? dayFormat.format(new Date(value)) : "—";
  const wholeMoneyFormat = new Intl.NumberFormat("en-GB");
  function formatMoney(minor) {
    if (minor == null) return "—";
    const cents = minor % 100;
    return `${wholeMoneyFormat.format((minor - cents) / 100)}.${String(cents).padStart(2, "0")}`;
  }
  const has = (value, list) => list.includes(value);
  const clone = (value) => structuredClone(value);
  const now = () => new Date().toISOString();

  function parseMoney(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("请输入非负金额，最多两位小数。");
    const [whole, fraction = ""] = text.split(".");
    const minor = Number(whole + fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(minor)) throw new Error("金额超出 Demo 可精确处理的范围。");
    return minor;
  }

  function blankRule() {
    return { tagGroups: [], typeSet: [], rechargeMinMinor: null, rechargeMaxMinor: null, categorySet: [], selfOperated: null };
  }

  function validateDraft(state, draft, groupId) {
    const rule = blankRule();
    const errors = {};
    const name = draft.name.trim();
    const note = draft.note.trim();
    if (!name || [...name].length > 50) errors.name = "圈组名称须为 1–50 字。";
    else if ([...state.groups.values()].some((group) =>
      group.id !== groupId && group.status !== "deleted" && group.name.toLowerCase() === name.toLowerCase()
    )) errors.name = "已有同名圈组。";
    if ([...note].length > 200) errors.note = "备注最多 200 字。";
    rule.tagGroups = draft.tagGroups.map(({ input, join: selectedJoin }, index) => {
      const ids = [...new Set(input.trim().split(/[\s,，、]+/).filter(Boolean))];
      const join = selectedJoin ?? (index === 0 ? "AND" : null);
      if (!ids.length || ids.some((id) => !/^\d+$/.test(id))) {
        errors[`tag-${index}`] = "请填写数字标签 ID，或移除此条件组。";
      }
      if (!Object.hasOwn(tagJoins, join)) errors[`join-${index}`] = "请选择组间关系。";
      return { ids, join };
    });
    rule.typeSet = draft.typeSet.filter((type) => has(type, types));
    rule.categorySet = draft.categorySet.filter((category) => has(category, categories));
    rule.selfOperated = draft.selfOperated === "" ? null : draft.selfOperated === "yes";
    for (const [field, key] of [["min", "rechargeMinMinor"], ["max", "rechargeMaxMinor"]]) {
      try {
        rule[key] = parseMoney(draft[field]);
      } catch (error) {
        errors[field] = error.message;
      }
    }
    if (rule.rechargeMinMinor != null && rule.rechargeMaxMinor != null && rule.rechargeMinMinor > rule.rechargeMaxMinor) {
      errors.max = "上限须大于或等于下限。";
    }
    if (!Object.keys(errors).some((field) => /^(tag-|min$|max$)/.test(field)) && !describeRule(rule).length) {
      errors.rule = "请配置至少一项圈选条件。";
    }
    if (String(draft.interval) !== String(scanIntervalHours)) {
      errors.interval = `全量扫描间隔仅支持 ${scanIntervalHours} 小时。`;
    }
    return { errors, value: { name, note, rule, policy: {
      autoAdd: draft.autoAdd, autoRemove: draft.autoRemove, intervalHours: scanIntervalHours
    } } };
  }

  function tagExpression(groups, label = ({ ids }) => `标签(${ids.join(" 或 ")})`) {
    return groups.reduce((expression, group, index) => {
      const term = label(group, index);
      if (index) return `(${expression} ${tagJoins[group.join]} ${term})`;
      return group.join === "AND NOT" ? `非 ${term}` : term;
    }, "");
  }

  function describeRecharge({ rechargeMinMinor: min, rechargeMaxMinor: max }) {
    if (min == null && max == null) return "";
    if (min == null) return `≤ ${formatMoney(max)} EUR`;
    if (max == null) return `≥ ${formatMoney(min)} EUR`;
    return `${formatMoney(min)} 至 ${formatMoney(max)} EUR`;
  }

  function ruleConditionValues(rule, dimension) {
    switch (dimension) {
      case "tags": return rule.tagGroups.flatMap(({ ids }) => ids);
      case "types": return rule.typeSet;
      case "recharge": {
        const value = describeRecharge(rule);
        return value ? [value] : [];
      }
      case "categories": return rule.categorySet;
      case "selfOperated": return rule.selfOperated == null ? [] : [rule.selfOperated ? "是" : "否"];
      default: return [];
    }
  }

  function describeRule(rule) {
    const lines = [];
    if (rule.tagGroups.length) lines.push(tagExpression(rule.tagGroups));
    const alternatives = (values) => values.length > 1 ? `(${values.join(" 或 ")})` : values[0];
    if (rule.typeSet.length) lines.push(`类型含 ${alternatives(rule.typeSet)}`);
    const rechargeRange = describeRecharge(rule);
    if (rechargeRange) lines.push(`累计充值 ${rechargeRange}`);
    if (rule.categorySet.length) lines.push(`主营大类为 ${alternatives(rule.categorySet)}`);
    if (rule.selfOperated != null) lines.push(rule.selfOperated ? "自营" : "非自营");
    return lines;
  }

  function matchShop(shop, rule) {
    const reasons = [];
    if (rule.tagGroups.length) {
      if (!Array.isArray(shop.tags)) reasons.push("缺少店铺标签");
      else {
        const matches = rule.tagGroups.reduce((matched, group, index) => {
          const hit = group.ids.some((id) => shop.tags.includes(id));
          if (!index) return group.join === "AND NOT" ? !hit : hit;
          if (group.join === "OR") return matched || hit;
          return matched && (group.join === "AND NOT" ? !hit : hit);
        }, false);
        if (!matches) reasons.push("不满足标签表达式");
      }
    }
    if (rule.typeSet.length) {
      if (!shop.types?.length || shop.types.some((type) => !has(type, types))) reasons.push("店铺类型缺失或未知");
      else if (!rule.typeSet.some((type) => shop.types.includes(type))) reasons.push("店铺类型不匹配");
    }
    if (rule.rechargeMinMinor != null || rule.rechargeMaxMinor != null) {
      const amount = shop.totalRechargeMinor;
      if (!Number.isSafeInteger(amount) || amount < 0 || shop.currency !== "EUR") reasons.push("缺少有效 EUR 累计充值金额");
      else {
        if (rule.rechargeMinMinor != null && amount < rule.rechargeMinMinor) reasons.push("累计充值低于下限");
        if (rule.rechargeMaxMinor != null && amount > rule.rechargeMaxMinor) reasons.push("累计充值高于上限");
      }
    }
    if (rule.categorySet.length) {
      if (!has(shop.categoryId, categories)) reasons.push("主营大类缺失或未知");
      else if (!rule.categorySet.includes(shop.categoryId)) reasons.push("主营大类不匹配");
    }
    if (rule.selfOperated != null) {
      if (typeof shop.isSelfOperated !== "boolean") reasons.push("缺少自营属性");
      else if (shop.isSelfOperated !== rule.selfOperated) reasons.push("自营属性不匹配");
    }
    return { matched: reasons.length === 0, reasons };
  }

  function snapshot(group) {
    return clone({ name: group.name, note: group.note, status: group.status, rule: group.rule, policy: group.policy });
  }

  function logConfig(state, group, action, before, at) {
    state.configLogs.push({
      id: `CONFIG-${state.configLogs.length + 1}`, groupId: group.id, action, before, after: snapshot(group), operator, at
    });
  }

  function createGroup(state, value, at = now()) {
    const id = `G-${state.nextGroup++}`;
    const group = { id, ...clone(value), status: "enabled", createdAt: at, updatedAt: at, createdBy: operator, updatedBy: operator };
    group.policy.ruleVersion = 1;
    state.groups.set(id, group);
    state.members.set(id, new Map());
    state.overrides.set(id, new Map());
    logConfig(state, group, "create", null, at);
    return group;
  }

  function editGroup(state, group, value, at = now()) {
    if (group.status !== "enabled") return false;
    const before = snapshot(group);
    const ruleVersion = group.policy.ruleVersion + 1;
    Object.assign(group, clone(value), { updatedAt: at, updatedBy: operator });
    group.policy.ruleVersion = ruleVersion;
    logConfig(state, group, "edit", before, at);
    return true;
  }

  function changeStatus(state, group, action, at = now()) {
    const target = { enable: "enabled", disable: "disabled", delete: "deleted" }[action];
    if (!target || group.status === "deleted" || group.status === target) return false;
    const before = snapshot(group);
    Object.assign(group, { status: target, updatedAt: at, updatedBy: operator });
    logConfig(state, group, action, before, at);
    return true;
  }

  function changeMember(state, group, shopId, action, source, reason, batchId, at) {
    const members = state.members.get(group.id);
    const person = source === "scan" ? "系统" : operator;
    if (action === "add") members.set(shopId, { groupId: group.id, shopId, joinedAt: at, source });
    else members.delete(shopId);
    if (source !== "scan") {
      state.overrides.get(group.id).set(shopId, {
        groupId: group.id, shopId, decision: action === "add" ? "FORCE_IN" : "FORCE_OUT", operator: person, at
      });
    }
    state.memberLogs.push({
      id: `MEMBER-${state.memberLogs.length + 1}`, groupId: group.id, shopId, shopName: state.shops.get(shopId).name, action, source,
      operator: person, reason, ruleVersion: group.policy.ruleVersion, batchId, at
    });
  }

  function differences(group, shops, members, overrides, scanId) {
    const result = [];
    for (const shop of shops) {
      const { matched, reasons } = matchShop(shop, group.rule);
      if (members.has(shop.id) === matched) continue;
      const action = matched ? "add" : "remove";
      const decision = overrides.get(shop.id)?.decision;
      result.push({
        groupId: group.id, shopId: shop.id, action, reasons: matched ? ["满足全部条件"] : reasons,
        protected: decision === (matched ? "FORCE_OUT" : "FORCE_IN"),
        ruleVersion: group.policy.ruleVersion, scanId
      });
    }
    return result;
  }

  function planScan(group, shops, members, overrides) {
    const automatic = [];
    const pending = [];
    for (const item of differences(group, shops, members, overrides)) {
      const isAutomatic = item.action === "add" ? group.policy.autoAdd : group.policy.autoRemove;
      (isAutomatic && !item.protected ? automatic : pending).push(item);
    }
    return { automatic, pending };
  }

  function forecast(state, group, value, initialIds) {
    const members = new Map(state.members.get(group?.id));
    const overrides = new Map(state.overrides.get(group?.id));
    for (const id of initialIds) {
      members.set(id, {});
      overrides.set(id, { decision: "FORCE_IN" });
    }
    return planScan({ ...value, id: group?.id }, state.shops.values(), members, overrides);
  }

  function scan(state, group, { fail = false, at = now() } = {}) {
    if (group.status !== "enabled") return null;
    const scans = state.scans.get(group.id) ?? { attempts: [] };
    const attempt = { id: `SCAN-${state.nextBatch++}`, groupId: group.id, at, ruleVersion: group.policy.ruleVersion };
    scans.latest = attempt;
    scans.attempts.push(attempt);
    state.scans.set(group.id, scans);
    if (fail) {
      Object.assign(attempt, { status: "failed", summary: "模拟快照读取失败", snapshotAt: null });
      return attempt;
    }
    const shops = clone([...state.shops.values()]);
    const { automatic, pending } = planScan(group, shops, state.members.get(group.id), state.overrides.get(group.id));
    for (const item of automatic) {
      const verb = item.action === "add" ? "新增" : "剔除";
      changeMember(state, group, item.shopId, item.action, "scan", `${item.reasons.join("、")}，自动${verb}`, attempt.id, at);
    }
    Object.assign(attempt, { status: "success", snapshotAt: at, summary: {
      added: automatic.filter((item) => item.action === "add").length,
      removed: automatic.filter((item) => item.action === "remove").length,
      canJoin: pending.filter((item) => item.action === "add").length,
      toRemove: pending.filter((item) => item.action === "remove").length,
      protected: pending.filter((item) => item.protected).length
    } });
    scans.success = attempt;
    scans.snapshot = shops;
    return attempt;
  }

  function candidates(state, group) {
    const scans = state.scans.get(group.id);
    const last = scans?.success;
    if (!last || last.ruleVersion !== group.policy.ruleVersion) return [];
    return differences(group, scans.snapshot, state.members.get(group.id), state.overrides.get(group.id), last.id);
  }

  function stateIssue(state, group, shopId, action) {
    if (group && group.status !== "enabled") return "圈组当前不可维护";
    if (Boolean(state.members.get(group?.id)?.has(shopId)) === (action === "add")) {
      return action === "add" ? "已在组内" : "不在组内";
    }
    return "";
  }

  function inspectIds(state, group, input, action) {
    const entries = input.split(/\r?\n/).map((id, index) => ({ id: id.trim(), line: index + 1 })).filter((entry) => entry.id);
    const seen = new Set();
    const result = { input: entries.length, unique: 0, valid: [], skipped: [], failed: [] };
    for (const entry of entries) {
      const { id } = entry;
      if (seen.has(id)) {
        result.skipped.push({ ...entry, reason: "重复输入" });
        continue;
      }
      seen.add(id);
      const error = !/^\d+$/.test(id) ? "每行只允许一个数字店铺 ID" : !state.shops.has(id) ? "未知店铺 ID" : "";
      const issue = stateIssue(state, group, id, action);
      if (error) result.failed.push({ ...entry, reason: error });
      else if (issue) result.skipped.push({ ...entry, reason: issue });
      else result.valid.push(id);
    }
    result.unique = seen.size;
    return result;
  }

  function inspectCandidates(state, group, items, action) {
    const valid = [];
    const skipped = [];
    const accepted = new Set();
    for (const item of items) {
      const id = item.shopId;
      const shop = state.shops.get(id);
      let reason;
      if (accepted.has(id)) reason = "重复选择";
      else if (item.groupId !== group.id || item.action !== action) reason = "候选不属于当前圈组或操作";
      else if (item.ruleVersion !== group.policy.ruleVersion) reason = "规则版本已变更，请重新扫描";
      else if (item.scanId !== state.scans.get(group.id)?.success?.id) reason = "已有更新的扫描结果，请重新选择";
      else if (!shop) reason = "店铺已不在当前快照";
      else {
        reason = stateIssue(state, group, id, action);
        if (!reason && matchShop(shop, group.rule).matched !== (action === "add")) {
          reason = action === "add" ? "已不满足当前规则" : "已满足当前规则";
        }
      }
      if (reason) skipped.push({ id, reason });
      else {
        accepted.add(id);
        valid.push(item);
      }
    }
    return { valid, skipped };
  }

  function applyManual(state, group, action, source, input, at = now()) {
    const result = source === "batch" ? inspectCandidates(state, group, input, action) : inspectIds(state, group, input, action);
    const success = source === "batch" ? result.valid.map((item) => item.shopId) : result.valid;
    if (success.length) {
      const batchId = `MANUAL-${state.nextBatch++}`;
      const reason = `${sources[source]}${action === "add" ? "新增，保留手动加入保护" : "删除，保留手动删除保护"}`;
      for (const id of success) changeMember(state, group, id, action, source, reason, batchId, at);
    }
    return { success, skipped: result.skipped, failed: result.failed ?? [] };
  }

  function createDemo() {
    const shopRows = [
      ["900001", "星砂生活馆", ["101"], ["海外仓"], 150000, "家居", false],
      ["900002", "纸鸢文具铺", ["102"], ["海外仓"], 150000, "办公", false],
      ["900003", "青禾衣橱", ["102"], ["集运"], 20000, "服饰", false],
      ["900004", "微光办公社", ["101"], ["海外仓"], 150000, "办公", false],
      ["900005", "白帆家居铺", ["101"], ["海外仓"], 200000, "家居", false],
      ["900006", "松果服饰店", ["102"], ["自发货"], 30000, "服饰", true]
    ];
    const state = {
      shops: new Map(shopRows.map(([id, name, tags, types, totalRechargeMinor, categoryId, isSelfOperated]) =>
        [id, { id, name, tags, types, totalRechargeMinor, currency: "EUR", categoryId, isSelfOperated }]
      )),
      groups: new Map(), members: new Map(), overrides: new Map(), scans: new Map(),
      configLogs: [], memberLogs: [], nextGroup: 1001, nextBatch: 1
    };
    const at = "2026-11-27T01:00:00.000Z";
    const makeGroup = (name, note, settings, autoAdd, autoRemove, createdAt) => createGroup(state, {
      name, note, rule: { ...blankRule(), ...settings }, policy: { autoAdd, autoRemove, intervalHours: scanIntervalHours }
    }, createdAt);
    const sample = makeGroup("潜力店铺组", "PRD 六店验收样本，用于观察自动维护和人工保护。", {
      tagGroups: [{ ids: ["101"], join: "AND" }], typeSet: ["海外仓"], rechargeMinMinor: 100000, selfOperated: false
    }, true, true, at);
    const memberSet = state.members.get(sample.id);
    for (const shopId of ["900002", "900004", "900005"]) {
      memberSet.set(shopId, { groupId: sample.id, shopId, joinedAt: at, source: "seed" });
    }
    applyManual(state, sample, "add", "configure", "900003", at);
    applyManual(state, sample, "remove", "configure", "900004", at);
    makeGroup("新品类观察组", "由运营复核家居和办公类店铺。", { categorySet: ["家居", "办公"] },
      false, false, "2026-11-26T01:00:00.000Z");
    const paused = makeGroup("活动候选组", "演示已停用的圈组。", { typeSet: ["集运", "自发货"], categorySet: ["服饰"] },
      true, false, "2026-11-25T01:00:00.000Z");
    changeStatus(state, paused, "disable", "2026-11-25T02:00:00.000Z");
    return state;
  }

  return {
    types, categories, tagJoins, scanIntervalHours, sources, actions, formatMoney, formatTime, parseMoney, blankRule, validateDraft,
    tagExpression, describeRule, ruleConditionValues, matchShop, createDemo, createGroup, editGroup, changeStatus,
    forecast, scan, candidates, inspectIds, inspectCandidates, applyManual
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Segmentation;
