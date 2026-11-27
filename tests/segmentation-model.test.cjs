"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const model = require("../docs/segmentation-model.js");

const sampleId = "G-1001";
const at = "2026-11-27T02:00:00Z";
function fixture() {
  const state = model.createDemo();
  const group = state.groups.get(sampleId);
  return { state, group, members: state.members.get(sampleId), overrides: state.overrides.get(sampleId) };
}

const draft = (changes = {}) => ({
  name: "测试圈组", note: "", min: "", max: "", interval: "1", selfOperated: "",
  tagGroups: [], typeSet: [], categorySet: [], ...changes
});
const tags = (...groups) => groups.map(([ids, join]) => ({ ids, join }));

const scenarios = [
  [true, true, ["900001", "900003", "900005"], 1, 1, 1, 1],
  [true, false, ["900001", "900002", "900003", "900005"], 1, 0, 1, 2],
  [false, true, ["900003", "900005"], 0, 1, 2, 1],
  [false, false, ["900002", "900003", "900005"], 0, 0, 2, 2]
];

for (const [autoAdd, autoRemove, ids, added, removed, canJoin, toRemove] of scenarios) {
  test(`PRD six-shop fixture: autoAdd=${autoAdd}, autoRemove=${autoRemove}`, () => {
    const { state, group, members, overrides } = fixture();
    Object.assign(group.policy, { autoAdd, autoRemove });
    const before = state.memberLogs.length;
    const scan = model.scan(state, group, { at });
    assert.deepEqual([...members.keys()].sort(), ids);
    assert.deepEqual(scan.summary, { added, removed, canJoin, toRemove, protected: 2 });
    assert.equal(scan.snapshotAt, at);
    assert.equal(scan.ruleVersion, 1);
    const candidates = model.candidates(state, group);
    assert.equal(candidates.filter((item) => item.action === "add").length, canJoin);
    assert.equal(candidates.filter((item) => item.action === "remove").length, toRemove);
    assert.equal(candidates.filter((item) => item.protected).length, 2);
    assert.equal(overrides.get("900004").decision, "FORCE_OUT");
    assert.equal(overrides.get("900003").decision, "FORCE_IN");
    const logCount = state.memberLogs.length;
    assert.equal(logCount - before, added + removed);
    for (const log of state.memberLogs.slice(before)) {
      assert.equal(log.operator, "系统");
      assert.equal(log.source, "scan");
      assert.equal(log.batchId, scan.id);
      assert.equal(log.ruleVersion, 1);
    }
    assert.deepEqual(model.scan(state, group).summary, { added: 0, removed: 0, canJoin, toRemove, protected: 2 });
    assert.equal(state.memberLogs.length, logCount);
  });
}

test("tag expressions are left-associative, groups use OR, IDs are exact, and other dimensions use AND", () => {
  const rule = {
    ...model.blankRule(),
    tagGroups: tags([["101", "102"], null], [["201"], "OR"], [["901"], "AND NOT"], [["301"], "AND"]),
    typeSet: ["海外仓", "自发货"], categorySet: ["家居", "办公"], selfOperated: false
  };
  assert.equal(model.tagExpression(rule.tagGroups), "(((标签(101 或 102) 或 标签(201)) 且非 标签(901)) 且 标签(301))");
  assert.deepEqual(model.describeRule(rule).slice(1), ["类型含 (海外仓 或 自发货)", "主营大类为 (家居 或 办公)", "非自营"]);
  const shop = { types: ["自发货", "集运"], categoryId: "办公", isSelfOperated: false };
  for (const ids of [["101", "301"], ["102", "301"], ["201", "301"]]) {
    assert.equal(model.matchShop({ ...shop, tags: ids }, rule).matched, true);
  }
  for (const ids of [["101", "301", "901"], ["1101", "301"], ["201"], ["301"], []]) {
    assert.equal(model.matchShop({ ...shop, tags: ids }, rule).matched, false);
  }
  const missing = model.matchShop({}, rule);
  assert.deepEqual(missing.reasons, ["缺少店铺标签", "店铺类型缺失或未知", "主营大类缺失或未知", "缺少自营属性"]);
  assert.equal(model.matchShop({ ...shop, tags: ["102", "301"], isSelfOperated: true }, rule).matched, false);
});

test("the first tag relation is saved and its preview matches evaluation", () => {
  const { state } = fixture();
  for (const join of ["AND", "OR", "AND NOT"]) {
    const { value: { rule }, errors } = model.validateDraft(state, draft({ tagGroups: [{ input: "101,102", join }] }));
    const excluded = join === "AND NOT";
    assert.deepEqual(errors, {});
    assert.equal(rule.tagGroups[0].join, join);
    assert.equal(model.tagExpression(rule.tagGroups), excluded ? "非 标签(101 或 102)" : "标签(101 或 102)");
    assert.equal(model.matchShop({ tags: ["101"] }, rule).matched, !excluded);
    assert.equal(model.matchShop({ tags: ["1101"] }, rule).matched, excluded);
    assert.equal(model.matchShop({ tags: [] }, rule).matched, excluded);
    assert.equal(model.matchShop({}, rule).matched, false);
  }
  const rule = {
    ...model.blankRule(),
    tagGroups: tags([["101"], "AND NOT"], [["201"], "OR"], [["301"], "AND"]),
    selfOperated: false
  };
  assert.equal(model.tagExpression(rule.tagGroups), "((非 标签(101) 或 标签(201)) 且 标签(301))");
  assert.equal(model.matchShop({ tags: ["301"], isSelfOperated: false }, rule).matched, true);
  assert.equal(model.matchShop({ tags: ["101", "301"], isSelfOperated: false }, rule).matched, false);
  assert.equal(model.matchShop({ tags: ["101", "201", "301"], isSelfOperated: false }, rule).matched, true);
  assert.equal(model.matchShop({ tags: ["301"], isSelfOperated: true }, rule).matched, false);
  const invalid = model.validateDraft(state, draft({ tagGroups: [{ input: "101", join: "XOR" }] }));
  assert.equal(invalid.errors["join-0"], "请选择组间关系。");
});

test("EUR bounds are inclusive, an absent bound is unrestricted, and cents stay exact", () => {
  const match = (amount, min, max, currency = "EUR") => model.matchShop({ totalRechargeMinor: amount, currency }, {
    ...model.blankRule(), rechargeMinMinor: min, rechargeMaxMinor: max
  });
  assert.equal(model.parseMoney(" "), null);
  assert.equal(model.parseMoney("0"), 0);
  assert.equal(model.parseMoney("1000.01"), 100001);
  assert.equal(model.parseMoney("0.10"), 10);
  for (const input of ["-0", "-1", "1.001", "1e2", "Infinity", "NaN", "1,000", "90071992547409.92"]) {
    assert.throws(() => model.parseMoney(input), Error, input);
  }
  assert.equal(model.parseMoney("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  assert.equal(model.formatMoney(Number.MAX_SAFE_INTEGER), "90,071,992,547,409.91");
  assert.equal(match(0, 0, 0).matched, true);
  assert.equal(match(1, 0, 0).matched, false);
  assert.equal(match(99999, 100000, null).matched, false);
  assert.equal(match(100000, 100000, 100000).matched, true);
  assert.equal(match(100001, null, 100000).matched, false);
  assert.equal(match(100000, 100000, null, "USD").matched, false);
  assert.equal(match(undefined, 100000, null).matched, false);
  assert.equal(match(undefined, null, null).matched, true);
});

test("list condition values reflect the rule configuration across all five dimensions", () => {
  const rule = {
    ...model.blankRule(),
    tagGroups: tags([["1101", "001"], null], [["901"], "AND NOT"]),
    typeSet: ["海外仓", "集运"],
    rechargeMinMinor: 0, rechargeMaxMinor: 100000,
    categorySet: ["家居", "办公"],
    selfOperated: false
  };
  assert.deepEqual(model.ruleConditionValues(rule, "tags"), ["1101", "001", "901"]);
  assert.equal(model.ruleConditionValues(rule, "tags").includes("101"), false);
  assert.deepEqual(model.ruleConditionValues(rule, "types"), ["海外仓", "集运"]);
  assert.deepEqual(model.ruleConditionValues(rule, "recharge"), ["0.00 至 1,000.00 EUR"]);
  assert.deepEqual(model.ruleConditionValues(rule, "categories"), ["家居", "办公"]);
  assert.deepEqual(model.ruleConditionValues(rule, "selfOperated"), ["否"]);
  assert.deepEqual(model.ruleConditionValues({ ...rule, selfOperated: true }, "selfOperated"), ["是"]);
  assert.deepEqual(model.ruleConditionValues(model.blankRule(), "selfOperated"), []);
  assert.deepEqual(model.ruleConditionValues(model.blankRule(), "recharge"), []);
  assert.deepEqual(model.ruleConditionValues({ ...rule, rechargeMinMinor: null }, "recharge"), ["≤ 1,000.00 EUR"]);
  assert.deepEqual(model.ruleConditionValues({ ...rule, rechargeMaxMinor: null }, "recharge"), ["≥ 0.00 EUR"]);
});

test("mixed condition rows use the same order in previews, scanning and list filters", () => {
  const { state } = fixture();
  const { errors, value } = model.validateDraft(state, draft({ conditions: [
    { join: "AND", type: "tags", input: "101、101" },
    { join: "OR", type: "types", values: ["海外仓", "自发货"] },
    { join: "AND NOT", type: "categories", values: ["办公"] },
    { join: "AND", type: "shopIds", input: "900001, 900005，900006 900006 0900001" }
  ] }));
  assert.deepEqual(errors, {});
  const expression = "(((标签(101) 或 类型含 (海外仓 或 自发货)) 且非 主营大类为 办公) 且 店铺 ID 为 (900001 或 900005 或 900006 或 0900001))";
  assert.equal(model.conditionExpression(value.rule.conditions), expression);
  assert.deepEqual(model.describeRule(value.rule), [expression]);
  assert.deepEqual(model.ruleConditionValues(value.rule, "tags"), ["101"]);
  assert.deepEqual(model.ruleConditionValues(value.rule, "shopIds"), ["900001", "900005", "900006", "0900001"]);
  const group = model.createGroup(state, value);
  assert.equal(state.members.get(group.id).size, 0);
  assert.equal(model.forecast(state, group, value).automatic.length, 3);
  model.scan(state, group);
  assert.deepEqual([...state.members.get(group.id).keys()], ["900001", "900005", "900006"]);
  assert.match(model.matchShop(state.shops.get("900004"), group.rule).reasons[0], /命中排除条件/);
  assert.equal(model.matchShop({ ...state.shops.get("900004"), categoryId: undefined }, group.rule).matched, false);
  assert.equal(model.matchShop({ ...state.shops.get("900001"), id: "1900001" }, group.rule).matched, false);
  assert.equal(model.matchShop({ ...state.shops.get("900001"), id: "0900001" }, group.rule).matched, true);
});

test("condition rows require a supported type and valid values", () => {
  const { state } = fixture();
  const { errors } = model.validateDraft(state, draft({ conditions: [
    { join: "AND", type: "" },
    { join: "OR", type: "types", values: [] },
    { join: "AND", type: "tags", input: "101x" },
    { join: "AND", type: "shopIds", input: "" },
    { join: "OR", type: "shopIds", input: "900001,xyz" },
    { join: "AND", type: "recharge", min: "30", max: "30" },
    { join: "AND", type: "selfOperated", value: "no" }
  ] }));
  assert.deepEqual(Object.keys(errors), ["type-0", "value-1", "value-2", "value-3", "value-4", "type-5", "type-6"]);
  assert.ok(model.validateDraft(state, draft({ conditions: [] })).errors.rule);
});

test("value operators are independent of the connectors and preserve exact IDs", () => {
  const { state } = fixture();
  const { value, errors } = model.validateDraft(state, draft({ conditions: [
    { join: "AND", type: "shopIds", operator: "eq", input: "0900001" },
    { join: "OR", type: "types", operator: "in", values: ["海外仓", "集运"] },
    { join: "AND", type: "categories", operator: "notIn", values: ["办公"] }
  ] }));
  assert.deepEqual(errors, {});
  assert.equal(model.conditionExpression(value.rule.conditions),
    "((店铺 ID 等于 0900001 或 店铺类型 包含任一 (海外仓 或 集运)) 且 主营大类 不属于任何 办公)");
  assert.equal(model.matchShop({ id: "0900001", categoryId: "家居" }, value.rule).matched, true);
  assert.equal(model.matchShop({ id: "900001", categoryId: "家居" }, value.rule).matched, false);
  assert.equal(model.matchShop({ id: "900005", types: ["海外仓"], categoryId: "家居" }, value.rule).matched, true);
  assert.equal(model.matchShop({ id: "0900001", categoryId: "办公" }, value.rule).matched, false);
  assert.equal(model.matchShop({ id: "0900001" }, value.rule).matched, false);
  const invalid = model.validateDraft(state, draft({ conditions: [
    { join: "AND", type: "shopIds", operator: "eq", input: "0900001,0900001" },
    { join: "AND", type: "types", operator: "eq", values: ["海外仓", "集运"] },
    { join: "AND", type: "tags", operator: "eq", input: "101" }
  ] }));
  assert.deepEqual(Object.keys(invalid.errors), ["value-0", "value-1", "operator-2"]);
});

test("editing old AND NOT rows keeps their match by separating the negative operator", () => {
  const { state, group } = fixture();
  const old = { conditions: [
    { join: "AND NOT", type: "tags", values: ["101"] },
    { join: "OR", type: "shopIds", values: ["900001"] },
    { join: "AND NOT", type: "selfOperated", value: true }
  ] };
  const rows = model.ruleConditions(old).map(model.editableCondition).map((row) => ({
    ...row, input: row.values?.join(" "), value: row.value === true ? "yes" : undefined
  }));
  assert.deepEqual(rows.map(({ join, operator }) => [join, operator]), [["AND", "notIn"], ["OR", "in"], ["AND", "ne"]]);
  const { errors, value } = model.validateDraft(state, draft({ conditions: rows }), group.id);
  assert.deepEqual(errors, {});
  for (const shop of state.shops.values()) {
    assert.equal(model.matchShop(shop, value.rule).matched, model.matchShop(shop, old).matched);
  }
});

test("editing a legacy rule retains its scan results and existing self-operated condition", () => {
  const { state, group } = fixture();
  const original = group.rule;
  const rows = model.ruleConditions(original).map((condition) => ({
    ...condition, input: condition.values?.join("、"), value: "no"
  }));
  const { errors, value } = model.validateDraft(state, draft({
    name: group.name, autoAdd: true, autoRemove: true, conditions: rows
  }), group.id);
  assert.deepEqual(errors, {});
  assert.equal(model.editGroup(state, group, value), true);
  for (const shop of state.shops.values()) {
    assert.equal(model.matchShop(shop, group.rule).matched, model.matchShop(shop, original).matched);
  }
  assert.deepEqual(model.ruleConditionValues(group.rule, "selfOperated"), ["否"]);
  assert.deepEqual(model.scan(state, group).summary, { added: 1, removed: 1, canJoin: 1, toRemove: 1, protected: 2 });
});

test("draft validation covers blank rules, empty groups, invalid numbers and name collisions", () => {
  const { state, group } = fixture();
  assert.deepEqual(model.validateDraft(state, draft()).errors, { rule: "请配置至少一项圈选条件。" });
  const malformed = model.validateDraft(state, draft({
    name: "  ", note: "长".repeat(201), min: "12.50", max: "0", interval: "0",
    tagGroups: [{ input: " ", join: "AND" }, { input: "102abc", join: "OR" }]
  })).errors;
  assert.deepEqual(Object.keys(malformed), ["name", "note", "tag-0", "tag-1", "max", "interval"]);
  assert.ok(model.validateDraft(state, draft({ name: "  " + group.name, min: "0" })).errors.name);
  const valid = model.validateDraft(state, draft({ name: " 唯一圈组 ", min: "0", max: "0" }));
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.value.name, "唯一圈组");
  assert.equal(valid.value.rule.rechargeMaxMinor, 0);
});

test("the editor accepts only a one-hour scan interval and keeps both switches on", () => {
  const { state } = fixture();
  for (const interval of ["", "2", "24", "48", "168", "1.0", undefined]) {
    assert.match(model.validateDraft(state, draft({ min: "0", interval })).errors.interval, /仅支持 1 小时/);
  }
  const valid = model.validateDraft(state, draft({ min: "0", interval: "1", autoAdd: false, autoRemove: false }));
  assert.deepEqual(valid.errors, {});
  assert.deepEqual(valid.value.policy, { intervalHours: 1, autoAdd: true, autoRemove: true });
  for (const group of state.groups.values()) {
    assert.deepEqual(group.policy, { ...valid.value.policy, ruleVersion: 1 });
  }
});

test("manual input uses complete string IDs and only successful changes update protection and history", () => {
  const { state, group, members, overrides } = fixture();
  state.shops.set("000123", { ...state.shops.get("900001"), id: "000123" });
  const before = state.memberLogs.length;
  const input = " 900004 \r\n000123\r\n900004\r\n  \r\nabc\r\n900002\r\n900999\r\n900001 900005";
  const review = model.inspectIds(state, group, input, "add");
  assert.equal(review.input, 7);
  assert.equal(review.unique, 6);
  assert.deepEqual(review.valid, ["900004", "000123"]);
  assert.deepEqual(review.skipped.map(({ id, reason }) => [id, reason]), [["900004", "重复输入"], ["900002", "已在组内"]]);
  assert.deepEqual(review.failed.map(({ id }) => id), ["abc", "900999", "900001 900005"]);
  assert.equal(state.memberLogs.length, before);
  const result = model.applyManual(state, group, "add", "configure", input);
  assert.deepEqual(result.success, ["900004", "000123"]);
  assert.equal(overrides.get("900004").decision, "FORCE_IN");
  assert.equal(overrides.has("900002"), false);
  assert.equal(state.memberLogs.length, before + 2);
  model.applyManual(state, group, "remove", "configure", "900004");
  assert.equal(members.has("900004"), false);
  assert.equal(overrides.get("900004").decision, "FORCE_OUT");
  model.scan(state, group);
  assert.equal(members.has("900004"), false);
  assert.equal(model.candidates(state, group).find((item) => item.shopId === "900004").protected, true);
});

test("a failed scan preserves the prior candidate snapshot, members and audit", () => {
  const { state, group, members } = fixture();
  const good = model.scan(state, group, { at });
  const expected = model.candidates(state, group);
  const initialIds = [...members.keys()];
  const logCount = state.memberLogs.length;
  const failed = model.scan(state, group, { fail: true });
  assert.equal(failed.status, "failed");
  assert.equal(failed.snapshotAt, null);
  assert.notEqual(failed.id, good.id);
  assert.equal(state.scans.get(group.id).success, good);
  assert.equal(state.scans.get(group.id).latest, failed);
  assert.deepEqual(state.scans.get(group.id).attempts, [good, failed]);
  assert.deepEqual([...members.keys()], initialIds);
  assert.deepEqual(model.candidates(state, group), expected);
  assert.equal(state.memberLogs.length, logCount);
});

test("candidate execution rechecks live rule version, scan, member state, status and matching", () => {
  const { state, group, members, overrides } = fixture();
  model.scan(state, group);
  const candidate = () => model.candidates(state, group).find((item) => item.shopId === "900004");
  let out = candidate();
  model.scan(state, group);
  assert.match(model.inspectCandidates(state, group, [out], "add").skipped[0].reason, /更新的扫描/);
  out = candidate();
  state.shops.get("900004").tags = ["102"];
  assert.match(model.inspectCandidates(state, group, [out], "add").skipped[0].reason, /已不满足/);
  state.shops.get("900004").tags = ["101"];
  model.changeStatus(state, group, "disable");
  assert.equal(model.scan(state, group), null);
  assert.match(model.inspectCandidates(state, group, [out], "add").skipped[0].reason, /不可维护/);
  model.changeStatus(state, group, "enable");
  const editValue = { name: group.name, note: group.note, rule: group.rule, policy: { ...group.policy, autoRemove: false } };
  assert.equal(model.editGroup(state, group, editValue), true);
  assert.deepEqual(model.candidates(state, group), []);
  assert.match(model.inspectCandidates(state, group, [out], "add").skipped[0].reason, /规则版本已变更/);
  model.scan(state, group);
  out = candidate();
  assert.equal(members.has("900004"), false);
  assert.equal(overrides.get("900004").decision, "FORCE_OUT");
  const result = model.applyManual(state, group, "add", "batch", [out, out]);
  assert.deepEqual(result.success, ["900004"]);
  assert.match(result.skipped[0].reason, /重复/);
  assert.equal(overrides.get("900004").decision, "FORCE_IN");
  assert.match(model.inspectCandidates(state, group, [out], "add").skipped[0].reason, /已在组内/);
  const remove = model.candidates(state, group).find((item) => item.shopId === "900003");
  assert.deepEqual(model.applyManual(state, group, "remove", "batch", [remove]).success, ["900003"]);
  assert.equal(overrides.get("900003").decision, "FORCE_OUT");
});

test("configuration snapshots are immutable and soft deletion retains group records", () => {
  const { state, group, members, overrides } = fixture();
  const before = state.configLogs.find((entry) => entry.groupId === group.id);
  model.editGroup(state, group, {
    name: "改名圈组", note: "", rule: { ...group.rule, tagGroups: tags([["102"], null]) }, policy: group.policy
  });
  assert.equal(before.after.name, "潜力店铺组");
  assert.deepEqual(before.after.rule.tagGroups[0].ids, ["101"]);
  assert.equal(before.after.policy.ruleVersion, 1);
  assert.equal(state.configLogs.at(-1).before.policy.ruleVersion, 1);
  assert.equal(state.configLogs.at(-1).after.policy.ruleVersion, 2);
  model.changeStatus(state, group, "delete");
  assert.equal(group.status, "deleted");
  assert.equal(state.groups.get(group.id), group);
  assert.equal(state.members.get(group.id), members);
  assert.equal(state.overrides.get(group.id), overrides);
  assert.equal(state.configLogs.at(-1).action, "delete");
  assert.equal(model.scan(state, group), null);
  assert.equal(model.changeStatus(state, group, "enable"), false);
});
