"use strict";

(() => {
  const model = Segmentation;
  const state = model.createDemo();
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const statusNames = { enabled: "启用", disabled: "停用", deleted: "已删除" };
  const sourceNames = { ...model.sources, seed: "初始样本" };
  const joinNames = model.tagJoins;
  const rowJoins = { AND: joinNames.AND, OR: joinNames.OR };
  const conditionDimensions = { ...model.conditionTypes, selfOperated: "是否自营" };
  const fixedConditionValues = { types: model.types, categories: model.categories, selfOperated: ["是", "否"] };
  const isEnabled = (group) => group.status === "enabled";
  const switchText = (value) => value ? "开启" : "关闭";
  const time = (value) => `<time class="time" datetime="${esc(value)}">${model.formatTime(value)}</time>`;
  const ruleText = (rule) => model.describeRule(rule).join(" 且 ");
  const statusBadge = (status) => `<span class="badge badge-${status === "enabled" ? "active" : "inactive"}">${statusNames[status]}</span>`;
  const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;
  const options = (map, current) => Object.entries(map).map(([value, label]) => option(value, label, current)).join("");
  const emptyRow = (columns, message) => `<tr><td class="empty-state" colspan="${columns}">${message}</td></tr>`;

  let listQuery = {};
  let listPage = 1;
  let listOrigin;
  let conditionChoice = null;
  let activeConditionDimension = "tags";
  let detail;
  const scanning = new Set();
  const scanOptionsOpen = new Set();

  function button(label, action, { id, kind = "", disabled = false, attributes = "" } = {}) {
    return `<button type="button" class="button ${kind}" data-action="${action}"${id ? ` data-id="${id}"` : ""}${disabled ? " disabled" : ""} ${attributes}>${esc(label)}</button>`;
  }

  function counts(group) {
    const items = model.candidates(state, group);
    return {
      members: state.members.get(group.id).size,
      add: items.filter((item) => item.action === "add").length,
      remove: items.filter((item) => item.action === "remove").length,
      protected: items.filter((item) => item.protected).length
    };
  }

  function pendingStatus(group) {
    const scan = state.scans.get(group.id)?.success;
    if (!scan) return "尚未扫描";
    return scan.ruleVersion === group.policy.ruleVersion ? "" : "待重新扫描";
  }

  function visibleGroups() {
    return [...state.groups.values()].filter((group) => group.status !== "deleted");
  }

  function showConditionChoices(dimension) {
    activeConditionDimension = dimension;
    for (const control of $("condition-dimensions").children) {
      control.setAttribute("aria-pressed", String(control.dataset.dimension === dimension));
    }
    $("condition-heading").textContent = conditionDimensions[dimension];
    const values = fixedConditionValues[dimension] ?? [...new Set(
      visibleGroups().flatMap((group) => model.ruleConditionValues(group.rule, dimension))
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const selected = conditionChoice?.dimension === dimension ? conditionChoice.value : null;
    $("condition-choices").innerHTML = values.map((value) => `<label class="condition-option">
      <input type="radio" name="condition-option" value="${esc(value)}"${selected === value ? " checked" : ""}>
      <span>${esc(value)}</span>
    </label>`).join("") || '<p class="condition-empty">暂无可选条件</p>';
  }

  function setConditionChoice(choice) {
    conditionChoice = choice;
    const summary = choice ? `${conditionDimensions[choice.dimension]} / ${choice.value}` : "全部圈选条件";
    $("condition-current").textContent = summary;
    $("condition-trigger").title = summary;
    $("condition-footer").hidden = !choice;
  }

  function closeConditionMenu(restoreFocus = false) {
    $("condition-menu").hidden = true;
    $("condition-trigger").setAttribute("aria-expanded", "false");
    if (restoreFocus) $("condition-trigger").focus();
  }

  function renderList() {
    const visible = visibleGroups();
    const keyword = (listQuery.keyword ?? "").trim().toLowerCase();
    const matched = visible.filter((group) => {
      const { status, autoAdd, autoRemove, condition } = listQuery;
      return (group.name.toLowerCase().includes(keyword) || group.id.toLowerCase().includes(keyword)) &&
        (!status || group.status === status) &&
        (!autoAdd || String(group.policy.autoAdd) === autoAdd) &&
        (!autoRemove || String(group.policy.autoRemove) === autoRemove) &&
        (!condition || model.ruleConditionValues(group.rule, condition.dimension).includes(condition.value));
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id, undefined, { numeric: true }));
    const pageSize = Number($("group-page-size").value);
    const pageCount = Math.ceil(matched.length / pageSize);
    listPage = Math.min(listPage, Math.max(1, pageCount));
    $("group-count").textContent = `${matched.length} / ${visible.length} 个圈组`;
    $("group-page").textContent = `第 ${pageCount ? listPage : 0} / ${pageCount} 页`;
    $("group-previous").disabled = listPage <= 1;
    $("group-next").disabled = listPage >= pageCount;
    $("group-rows").innerHTML = matched.slice((listPage - 1) * pageSize, listPage * pageSize).map(groupRow).join("") ||
      emptyRow(8, visible.length ? "没有符合筛选条件的圈组。" : "暂无圈组。");
  }

  function groupRow(group) {
    const { id, name, note, policy, status } = group;
    const summary = counts(group);
    const pending = pendingStatus(group);
    const busy = scanning.has(id);
    const rowLink = (label, kind = "button-text row-link") => button(label, "detail", { id, kind });
    const rowAction = (label, action, disabled = false, kind = "button-text") => button(label, action, {
      id, kind, disabled, attributes: disabled ? 'title="圈组已停用，启用后可维护"' : ""
    });
    return `<tr data-group="${id}">
      <td>${rowLink(name, "button-text record-name row-link")}
        <span class="record-id">${id}</span>
        ${note ? `<p class="muted clamp description">${esc(note)}</p>` : ""}</td>
      <td><p class="clamp rule-summary">${esc(ruleText(group.rule))}</p></td>
      <td class="shop-count-cell">${rowLink(summary.members)}</td>
      <td class="auto-policy-cell"><p>新增 <span class="${policy.autoAdd ? "policy-on" : "muted"}">${switchText(policy.autoAdd)}</span></p>
        <p>剔除 <span class="${policy.autoRemove ? "policy-on" : "muted"}">${switchText(policy.autoRemove)}</span></p>
        <p class="muted">${isEnabled(group) ? `每 ${policy.intervalHours} 小时` : "停用后暂停维护"}</p></td>
      <td>${pending ? `<p class="muted">${pending}</p>` : `
        <p>可加入 ${summary.add}</p>
        <p>待剔除 ${summary.remove}</p>
        <p class="muted">其中保护 ${summary.protected}</p>`}</td>
      <td>${statusBadge(status)}</td>
      <td><p>创建　${esc(group.createdBy)}<br>${time(group.createdAt)}</p>
        <p>更新　${esc(group.updatedBy)}<br>${time(group.updatedAt)}</p></td>
      <td><div class="row-actions">
        ${busy ? button("更新中…", "manual-scan", { id, kind: "button-text", disabled: true })
          : rowAction("手动更新", "manual-scan", !isEnabled(group))}
        ${rowAction("编辑", "edit", !isEnabled(group))}
        ${rowAction("修改历史", "config-history")}${rowAction("店铺进出历史", "member-history")}
        ${rowAction(isEnabled(group) ? "停用" : "启用", isEnabled(group) ? "disable" : "enable")}
        ${rowAction("删除", "delete", false, "button-delete")}
      </div></td>
    </tr>`;
  }

  function showList() {
    detail = undefined;
    $("breadcrumb").innerHTML = "<li>商家管理</li><li>商家圈组</li>";
    $("detail-view").hidden = true;
    $("list-view").hidden = false;
    renderList();
    if (listOrigin) {
      const { id, selector } = listOrigin;
      const target = $("group-rows").querySelector(`[data-group="${id}"] ${selector} [data-action="detail"]`);
      (target ?? $("list-title")).focus();
      listOrigin = undefined;
    }
  }

  function openDetail(group, trigger) {
    listOrigin = { id: group.id, selector: trigger.closest(".shop-count-cell") ? ".shop-count-cell" : "td:first-child" };
    detail = { group, keyword: "", source: "", feedback: "" };
    $("list-view").hidden = true;
    $("detail-view").hidden = false;
    renderDetail();
    $("detail-title").focus();
  }

  function latestScanText(group) {
    const { latest, success } = state.scans.get(group.id) ?? {};
    if (!latest) return "最近扫描 · 尚未扫描";
    if (latest.status === "failed") {
      return `最近扫描 · ${time(latest.at)} · 失败（${esc(latest.summary)}） · 上次成功 ${success ? time(success.at) : "无"}`;
    }
    const { added, removed } = latest.summary;
    return `最近扫描 · ${time(latest.at)} · 成功（加入 ${added}，剔除 ${removed}） · ${latest.id} / v${latest.ruleVersion}`;
  }

  function renderDetail(focusAction) {
    if (!detail) return;
    const { group, keyword, source, feedback } = detail;
    const { id, policy } = group;
    const summary = counts(group);
    const pending = pendingStatus(group);
    const paused = !isEnabled(group);
    const busy = scanning.has(id);
    $("breadcrumb").innerHTML = '<li>商家管理</li><li><button type="button" data-action="list" class="button button-text">商家圈组</button></li><li>圈组详情</li>';
    $("detail-view").innerHTML = `
      <div class="page-heading">
        <div><h1 id="detail-title" tabindex="-1">${esc(group.name)}</h1>
          <div class="actions"><span class="record-id">${id}</span>${statusBadge(group.status)}</div></div>
        <div class="actions">
          ${button("返回列表", "list")}
          ${button("导出", "export-members", { attributes: 'aria-label="导出组内店铺明细"' })}
          ${button(busy ? "扫描中…" : "模拟扫描", "scan", { id, disabled: paused || busy, kind: "button-primary" })}
        </div>
      </div>
      <div class="detail-summary">
        <div class="panel group-summary">
          <p><strong>圈选条件</strong>　${esc(ruleText(group.rule))}</p>
          ${group.note ? `<p><strong>备注</strong>　${esc(group.note)}</p>` : ""}
          <p>新增 ${switchText(policy.autoAdd)} · 剔除 ${switchText(policy.autoRemove)} · 每 ${policy.intervalHours} 小时 · 规则 v${policy.ruleVersion}</p>
          <p class="muted">${latestScanText(group)}</p>
          <p class="muted">${paused ? "圈组已停用，启用后才可扫描或维护成员。" : "扫描周期为 Demo 设定，使用按钮手动模拟全量扫描。"}</p>
          ${paused ? "" : `<details class="scan-options"${scanOptionsOpen.has(id) ? " open" : ""}><summary>模拟选项</summary>
            ${button("模拟扫描失败", "fail-scan", { id, disabled: busy })}</details>`}
        </div>
        ${pending === "待重新扫描" ? '<p class="detail-reminders">规则已更新，待重新扫描。</p>' : ""}
        ${!pending && summary.protected ? `<p class="detail-reminders">${summary.protected} 家店铺受历史人工保护，扫描时保留原成员状态。</p>` : ""}
        <p class="feedback ${detail.feedbackError ? "feedback-error" : ""}" id="detail-feedback" role="status">${esc(feedback)}</p>
      </div>
      <section class="panel" aria-labelledby="members-title" aria-busy="${busy}">
        <div class="detail-tools">
          <h2 id="members-title">组内店铺（${summary.members}）</h2>
          <form id="detail-filter" class="detail-filter" aria-label="筛选店铺">
            <label class="field">店铺名称 / ID<input type="search" name="keyword" value="${esc(keyword)}" placeholder="输入名称或 ID"></label>
            <label class="field">来源<select name="source"><option value="">全部来源</option>${options(sourceNames, source)}</select></label>
            <button class="button" type="submit">查询</button>${button("重置", "reset-detail")}
          </form>
        </div>
        <div class="table-scroll detail-table" tabindex="0" role="region" aria-label="店铺表格">
          <table><thead><tr>
            <th scope="col" class="shop-col">店铺信息</th><th scope="col" class="type-col">类型</th>
            <th scope="col" class="tag-col">标签</th><th scope="col" class="money-col numeric">累计充值 EUR</th>
            <th scope="col" class="category-col">主营大类</th><th scope="col" class="self-col">自营</th>
            <th scope="col">匹配与保护</th><th scope="col" class="origin-col">来源 / 时间</th>
          </tr></thead><tbody id="detail-rows"></tbody></table>
        </div>
        <footer class="panel-footer"><span id="detail-count" aria-live="polite"></span></footer>
      </section>`;
    const scanOptions = $("detail-view").querySelector(".scan-options");
    scanOptions?.addEventListener("toggle", () => {
      if (scanOptions.open) scanOptionsOpen.add(id);
      else scanOptionsOpen.delete(id);
    });
    renderShops();
    if (focusAction) {
      const target = $("detail-view").querySelector(`[data-action="${focusAction}"]:not(:disabled)`);
      (target ?? $("detail-title")).focus();
    }
  }

  function visibleShops() {
    const { group, keyword, source } = detail;
    const term = keyword.trim().toLowerCase();
    return [...state.members.get(group.id).values()].map((member) => ({
      member, shop: state.shops.get(member.shopId)
    })).filter(({ shop, member }) => shop &&
      (shop.name.toLowerCase().includes(term) || shop.id.includes(term)) && (!source || member.source === source));
  }

  function shopRow({ shop, member }) {
    const { group } = detail;
    const result = model.matchShop(shop, group.rule);
    const decision = state.overrides.get(group.id).get(shop.id)?.decision;
    const protection = decision === "FORCE_IN" ? "手动加入保护" : decision === "FORCE_OUT" ? "手动删除保护" : "";
    return `<tr data-shop="${shop.id}">
      <td><span class="record-name">${esc(shop.name)}</span><span class="record-id">${shop.id}</span></td>
      <td>${esc(shop.types?.join("、") || "—")}</td><td>${esc(shop.tags?.join("、") || "—")}</td>
      <td class="numeric">${model.formatMoney(shop.totalRechargeMinor)}</td><td>${esc(shop.categoryId ?? "—")}</td>
      <td>${shop.isSelfOperated == null ? "—" : shop.isSelfOperated ? "是" : "否"}</td>
      <td><p class="match-text">${esc(result.matched ? "满足圈选规则" : result.reasons.join("、"))}</p>
        ${protection ? `<span class="badge badge-pending">${protection}</span>` : ""}</td>
      <td>${sourceNames[member.source]}${member.joinedAt ? `<br>${time(member.joinedAt)}` : ""}</td>
    </tr>`;
  }

  function renderShops() {
    const items = visibleShops();
    const { keyword, source } = detail;
    const message = keyword || source ? "没有符合筛选条件的店铺。" : "圈组内暂无店铺。";
    $("detail-rows").innerHTML = items.map(shopRow).join("") || emptyRow(8, message);
    $("detail-count").textContent = `共 ${items.length} 家店铺`;
  }

  async function simulateScan(group, action) {
    if (scanning.has(group.id) || !isEnabled(group)) return;
    const fail = action === "fail-scan";
    const manual = action === "manual-scan";
    const version = group.policy.ruleVersion;
    scanning.add(group.id);
    if (detail?.group === group) {
      Object.assign(detail, { feedback: "正在模拟全量扫描…", feedbackError: false });
      renderDetail();
    } else if (!detail) {
      $("list-feedback").textContent = `${group.name} · 正在手动更新…`;
      renderList();
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    scanning.delete(group.id);
    const result = version === group.policy.ruleVersion && model.scan(state, group, { fail });
    const message = !result ? "圈组规则或状态已变化，请重新发起扫描。" : fail
      ? "模拟扫描失败，成员、历史与上次成功结果已保留。"
      : `${manual ? "手动更新" : "模拟扫描"}完成 · 加入 ${result.summary.added} 家，剔除 ${result.summary.removed} 家。`;
    if (detail?.group === group) {
      Object.assign(detail, { feedback: message, feedbackError: fail || !result });
      renderDetail(fail ? "fail-scan" : "scan");
    } else if (!detail) {
      const restoreUpdateFocus = manual && document.activeElement === document.body;
      renderList();
      $("list-feedback").textContent = `${group.name} · ${message}`;
      if (restoreUpdateFocus) restoreFocus(group, action).focus();
    }
  }

  function dialogMarkup(titleId, title, body, footer, formId = "", subtitle = "") {
    const tag = formId ? "form" : "div";
    return `<${tag} class="dialog-layout"${formId ? ` id="${formId}" novalidate` : ""}>
      <header class="dialog-heading"><h2 id="${titleId}">${esc(title)}</h2>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ""}</header>
      <div class="dialog-scroll">${body}</div>
      <footer class="dialog-actions">${footer}</footer>
    </${tag}>`;
  }

  function showDialog(dialog, trigger, fallback) {
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      const target = trigger?.isConnected && !trigger.disabled && !trigger.closest("[hidden]") ? trigger : fallback?.();
      target?.focus();
    }, { once: true });
    dialog.showModal();
  }

  function closeButton(label = "取消", autofocus = false) {
    return button(label, "close-dialog", { attributes: autofocus ? "autofocus" : "" });
  }

  function confirm(title, body, trigger, run, { label = "确认执行", danger = false } = {}) {
    const dialog = $("confirm-dialog");
    dialog.innerHTML = dialogMarkup("confirm-title", title, `<div class="confirm-body">${body}</div>`,
      closeButton("取消", true) + `<button class="button ${danger ? "button-danger" : "button-primary"}" type="submit">${label}</button>`,
      "confirm-form");
    $("confirm-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!dialog.open) return;
      dialog.close();
      run();
    });
    showDialog(dialog, trigger);
  }

  function restoreFocus(group, action) {
    if (detail) return $("detail-view").querySelector(`[data-action="${action}"]:not(:disabled)`) ?? $("detail-title");
    return $("group-rows").querySelector(`[data-id="${group.id}"][data-action="${action}"]:not(:disabled)`) ?? $("create-group");
  }

  function refresh() {
    if (detail) renderDetail();
    else renderList();
  }

  function editorInput(form, name) {
    return form.elements.namedItem(name);
  }

  function readDraft(form) {
    const read = (name) => editorInput(form, name).value;
    return {
      name: read("name"), note: read("note"), interval: read("interval"),
      conditions: [...form.querySelectorAll(".condition-row")].map((row, index) => ({
        join: read(`join-${index}`), type: read(`type-${index}`), operator: read(`operator-${index}`),
        input: row.querySelector("input[data-tags], input[data-shop-ids]")?.value ?? "",
        values: row.querySelector("select[data-single-value]")
          ? [row.querySelector("select[data-single-value]").value]
          : [...row.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value),
        value: row.querySelector("select[data-self-operated]")?.value
      }))
    };
  }

  function conditionEditor(rows) {
    return rows.map((row, index) => {
      const legacy = row.type === "selfOperated";
      return `${index ? `<div class="condition-connector">
        <label class="field"><select name="join-${index}" aria-label="条件 ${index + 1} 与前面条件的关系"
          aria-describedby="error-join-${index}">${options(rowJoins, row.join)}</select>
          ${fieldError(`join-${index}`)}</label></div>` : '<input type="hidden" name="join-0" value="AND">'}
      <div class="condition-row" role="group" aria-label="条件 ${index + 1}">
        <label class="field condition-type">条件类型
          <select name="type-${index}" data-condition-type="${index}" aria-describedby="error-type-${index}"${legacy ? " disabled" : ""}>
            ${legacy ? option("selfOperated", "是否自营（已有条件）", row.type)
              : option("", "请选择", row.type) + options(model.conditionTypes, row.type)}
          </select>${fieldError(`type-${index}`)}</label>
        <label class="field condition-operator">运算符
          <select name="operator-${index}" data-condition-operator="${index}" aria-describedby="error-operator-${index}"${row.type ? "" : " disabled"}>
            ${operatorOptions(row.type, row.operator)}</select>${fieldError(`operator-${index}`)}</label>
        <div class="condition-value">${conditionValueEditor(row, index)}</div>
        ${button("移除", "remove-tag", { attributes: `data-index="${index}" aria-label="移除条件 ${index + 1}"` })}
      </div>`;
    }).join("");
  }

  function operatorOptions(type, operator) {
    const operators = model.conditionOperators[type];
    return operators ? options(operators, operator) : option("", "请先选择类型", "");
  }

  function conditionValueEditor({ type, operator, input, values = [], value }, index) {
    const name = `value-${index}`;
    const single = model.isSingleValue(operator);
    switch (type) {
      case "tags":
        return textField("值", name, input, 'data-tags placeholder="标签 ID，用空格或逗号分隔"');
      case "shopIds":
        return textField("值", name, input, `data-shop-ids placeholder="${single ? "输入一个完整店铺 ID" : "店铺 ID，用空格或逗号分隔"}"`);
      case "types":
      case "categories": {
        const allowed = type === "types" ? model.types : model.categories;
        if (single) return `<label class="field">值<select name="${name}" data-single-value aria-describedby="error-${name}">
          ${option("", "请选择", values.length === 1 ? values[0] : "")}
          ${allowed.map((entry) => option(entry, entry, values.length === 1 ? values[0] : "")).join("")}
          </select>${fieldError(name)}</label>`;
        return `<fieldset><legend>值</legend><div class="choices">
          ${allowed.map((entry) => `<label><input type="checkbox" name="${name}" value="${entry}" aria-describedby="error-${name}"${values.includes(entry) ? " checked" : ""}>${entry}</label>`).join("")}
          </div>${fieldError(name)}</fieldset>`;
      }
      case "selfOperated":
        return `<label class="field">值<select name="${name}" data-self-operated>
          ${options({ yes: "是", no: "否" }, value)}</select></label>`;
      default:
        return '<label class="field">值<input placeholder="请先选择类型" disabled></label>';
    }
  }

  function fieldError(name) {
    return `<span class="inline-error" id="error-${name}"></span>`;
  }

  function textField(label, name, value, attributes = "") {
    return `<label class="field">${label}<input name="${name}" value="${esc(value)}" aria-describedby="error-${name}" ${attributes}>${fieldError(name)}</label>`;
  }

  function openEditor(group, trigger) {
    if (group && !isEnabled(group)) return;
    const dialog = $("editor-dialog");
    const interval = model.scanIntervalHours;
    const rows = group ? model.ruleConditions(group.rule).filter(({ type }) => type !== "recharge").map(model.editableCondition).map((condition) => ({
      ...condition, input: condition.values?.join("、"),
      value: condition.value == null ? undefined : condition.value ? "yes" : "no"
    })) : [{ join: "AND", type: "" }];
    const title = group ? "编辑圈组" : "创建圈组";
    const body = `
      <section class="dialog-section">
        <h3>基本信息</h3>
        <div class="form-grid">
          ${textField("圈组名称（必填）", "name", group?.name, "autofocus required")}
          <label class="field">备注<textarea name="note" rows="2" aria-describedby="error-note">${esc(group?.note)}</textarea>${fieldError("note")}</label>
        </div>
      </section>
      <section class="dialog-section">
        <h3>圈选条件</h3>
        <div id="tag-list" class="condition-list">${conditionEditor(rows)}</div>
        <div class="actions">${button("添加条件", "add-tag", { attributes: 'aria-describedby="error-rule"' })}${fieldError("rule")}</div>
        <p class="expression"><strong>条件表达式</strong>　<span id="expression"></span></p>
      </section>
      <section class="dialog-section">
        <h3>自动维护</h3>
        <div class="choices muted"><label><input type="checkbox" name="autoAdd" role="switch" checked disabled>自动新增</label>
          <label><input type="checkbox" name="autoRemove" role="switch" checked disabled>自动剔除</label></div>
        <label class="field">全量扫描间隔
          <select name="interval" aria-describedby="error-interval"><option value="${interval}">${interval} 小时</option></select>
          ${fieldError("interval")}</label>
        <p class="muted">自动新增和剔除始终开启。扫描时，人工保护项仅产生差异提醒。</p>
        <p id="editor-error" class="feedback feedback-error" role="alert"></p>
      </section>`;
    dialog.innerHTML = dialogMarkup("editor-title", title, body,
      closeButton() + '<button class="button button-primary" type="submit">预览保存</button>', "editor-form", group?.id);
    const form = $("editor-form");

    function updateExpression() {
      const { value } = model.validateDraft(state, readDraft(form), group?.id);
      const { conditions } = value.rule;
      $("expression").textContent = model.conditionExpression(conditions) || "尚未设置条件";
    }
    function clearErrors() {
      form.querySelectorAll(".inline-error").forEach((target) => { target.textContent = ""; });
      form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      $("editor-error").textContent = "";
    }
    function errorsFor(errors) {
      $("editor-error").textContent = "请检查标注的字段。";
      for (const [field, message] of Object.entries(errors)) {
        $("error-" + field).textContent = message;
        form.querySelectorAll(`[name="${field}"]`).forEach((input) => input.setAttribute("aria-invalid", "true"));
      }
      (form.querySelector(`[name="${Object.keys(errors)[0]}"]`) ?? form.querySelector('[data-action="add-tag"]')).focus();
    }

    form.addEventListener("input", (event) => {
      if (event.target.dataset.conditionType === undefined && event.target.dataset.conditionOperator === undefined) updateExpression();
    });
    form.addEventListener("change", (event) => {
      const { conditionType, conditionOperator } = event.target.dataset;
      const index = conditionType ?? conditionOperator;
      if (index === undefined) return;
      const row = event.target.closest(".condition-row");
      const draftRow = readDraft(form).conditions[Number(index)];
      if (conditionType !== undefined) {
        const operator = editorInput(form, `operator-${index}`);
        operator.innerHTML = operatorOptions(draftRow.type);
        operator.disabled = !draftRow.type;
        row.querySelector(".condition-value").innerHTML = conditionValueEditor({ type: draftRow.type, operator: operator.value }, index);
        operator.removeAttribute("aria-invalid");
        $(`error-operator-${index}`).textContent = "";
      } else {
        row.querySelector(".condition-value").innerHTML = conditionValueEditor(draftRow, index);
      }
      event.target.removeAttribute("aria-invalid");
      $(`error-${event.target.name}`).textContent = "";
      updateExpression();
    });
    form.addEventListener("click", (event) => {
      const control = event.target.closest("button[data-action]");
      if (!control || !["add-tag", "remove-tag"].includes(control.dataset.action)) return;
      const rows = readDraft(form).conditions;
      const adding = control.dataset.action === "add-tag";
      if (adding) rows.push({ type: "", join: "AND" });
      else rows.splice(Number(control.dataset.index), 1);
      $("tag-list").innerHTML = conditionEditor(rows);
      clearErrors();
      updateExpression();
      (adding ? editorInput(form, `type-${rows.length - 1}`) : form.querySelector('[data-action="add-tag"]')).focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearErrors();
      const { errors, value } = model.validateDraft(state, readDraft(form), group?.id);
      if (Object.keys(errors).length) {
        errorsFor(errors);
        return;
      }
      const { automatic, pending } = model.forecast(state, group, value);
      const amount = (items, action) => items.filter((item) => item.action === action).length;
      confirm("确认保存圈组", `
        <p><strong>${esc(value.name)}</strong>${group ? ` · ${group.id}` : ""}</p>
        <p>${esc(ruleText(value.rule))}</p>
        <p>新增 ${switchText(value.policy.autoAdd)} · 剔除 ${switchText(value.policy.autoRemove)} · 每 ${value.policy.intervalHours} 小时</p>
        <p>预计下次模拟扫描自动加入 ${amount(automatic, "add")} 家、剔除 ${amount(automatic, "remove")} 家；
          预计可加入 ${amount(pending, "add")} 家、待剔除 ${amount(pending, "remove")} 家，其中保护 ${pending.filter((item) => item.protected).length} 家。</p>
        <p class="muted">保存规则后，自动维护将在下一次模拟扫描执行。${group ? "请重新扫描以更新候选。" : ""}</p>`,
        event.submitter, () => {
          const at = new Date().toISOString();
          if (group) {
            if (!model.editGroup(state, group, value, at)) {
              $("editor-error").textContent = "圈组当前不可编辑。";
              return;
            }
          } else {
            model.createGroup(state, value, at);
            listPage = 1;
          }
          dialog.close();
          $("list-feedback").textContent = group ? "规则已更新，下次模拟扫描将按新版本生成候选。" : "圈组已创建。";
          refresh();
        }, { label: "保存规则" });
    });
    updateExpression();
    showDialog(dialog, trigger, () => group ? restoreFocus(group, "edit") : $("create-group"));
  }

  function historySnapshot(value) {
    if (!value) return "—";
    return `<details><summary>${esc(value.name)} · v${value.policy.ruleVersion} · ${statusNames[value.status]}</summary>
      <p>${esc(ruleText(value.rule))}</p><p>新增 ${switchText(value.policy.autoAdd)} · 剔除 ${switchText(value.policy.autoRemove)} · 每 ${value.policy.intervalHours} 小时</p>
      ${value.note ? `<p>备注　${esc(value.note)}</p>` : ""}</details>`;
  }

  function historyRow(entry, members) {
    const version = entry.before?.policy.ruleVersion;
    const after = entry.after?.policy.ruleVersion;
    return members ? `<tr>
      <td>${time(entry.at)}</td><td><span class="record-name">${esc(entry.shopName)}</span><span class="record-id">${entry.shopId}</span></td>
      <td>${entry.action === "add" ? "加入" : "剔除"}</td><td>${sourceNames[entry.source]}</td><td>${esc(entry.operator)}</td>
      <td>${esc(entry.reason)}</td><td>${entry.batchId}<span class="record-id">规则 v${entry.ruleVersion}</span></td>
    </tr>` : `<tr>
      <td>${time(entry.at)}</td><td>${esc(entry.operator)}</td><td>${model.actions[entry.action]}</td>
      <td>${version && version !== after ? `v${version} → ` : ""}v${after}</td>
      <td>${historySnapshot(entry.before)}</td><td>${historySnapshot(entry.after)}</td>
    </tr>`;
  }

  function openHistory(group, members, trigger) {
    const dialog = $("history-dialog");
    const title = members ? "店铺进出历史" : "修改历史";
    const actionNames = members ? { add: "加入", remove: "剔除" } : model.actions;
    const cols = members ? [
      ["时间", "history-time"], ["店铺信息", "history-shop"], ["动作", "history-short"], ["来源", "history-source"],
      ["操作人", "history-short"], ["原因", ""], ["批次 / 版本", "history-version"]
    ] : [
      ["时间", "history-time"], ["操作人", "history-short"], ["动作", "history-short"], ["版本", "history-version"],
      ["变更前", ""], ["变更后", ""]
    ];
    const body = `<form id="history-filter" class="history-filters" aria-label="筛选${title}">
      <div class="filter-grid">
        <label class="field">日期<input type="date" name="date"></label>
        <label class="field">操作类型<select name="action"><option value="">全部操作</option>${options(actionNames)}</select></label>
        ${members ? `<label class="field">来源<select name="source"><option value="">全部来源</option>${options(model.sources)}</select></label>
          <label class="field">店铺 ID<input type="search" name="shopId" inputmode="numeric" placeholder="输入完整 ID"></label>` : ""}
      </div>
      <div class="filter-actions"><button class="button" type="submit">查询</button><button class="button" type="reset">重置</button></div>
    </form>
    <div class="table-scroll history-table" tabindex="0" role="region" aria-label="${title}表格">
      <table><thead><tr>${cols.map(([text, style]) => `<th scope="col" class="${style}">${text}</th>`).join("")}</tr></thead>
        <tbody id="history-rows"></tbody></table>
    </div>
    <div class="panel-footer"><span id="history-count" aria-live="polite"></span></div>`;
    dialog.innerHTML = dialogMarkup("history-title", title, body, closeButton("关闭"), "", `${group.name} · ${group.id}`);
    const form = $("history-filter");
    const entries = (members ? state.memberLogs : state.configLogs).filter((entry) => entry.groupId === group.id).reverse();
    function renderHistory(query = {}) {
      const { date, action, source, shopId } = query;
      const matches = entries.filter((entry) =>
        (!date || model.formatTime(entry.at).startsWith(date)) && (!action || entry.action === action) &&
        (!source || entry.source === source) && (!shopId?.trim() || entry.shopId === shopId.trim())
      );
      $("history-rows").innerHTML = matches.map((entry) => historyRow(entry, members)).join("") ||
        emptyRow(cols.length, entries.length ? "没有符合筛选条件的记录。" : "暂无历史记录。");
      $("history-count").textContent = `共 ${matches.length} 条记录`;
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      renderHistory(Object.fromEntries(new FormData(form)));
    });
    form.addEventListener("reset", () => renderHistory());
    renderHistory();
    showDialog(dialog, trigger);
  }

  function confirmStatus(group, action, trigger) {
    const name = model.actions[action];
    const explains = {
      disable: "停用后暂停扫描和成员维护，保留现有规则、成员和历史。",
      enable: "启用后可恢复维护并运行下一次模拟扫描。",
      delete: "删除后圈组将从列表移除，停止扫描，并保留规则、成员和审计记录。此 Demo 无恢复入口。"
    };
    confirm(`确认${name}圈组`, `<p>圈组 · ${esc(group.name)}（${group.id}）</p><p>${explains[action]}</p>`,
      trigger, () => {
        if (!model.changeStatus(state, group, action)) return;
        $("list-feedback").textContent = `${group.name}已${name}。`;
        renderList();
        restoreFocus(group, action === "disable" ? "enable" : action === "enable" ? "disable" : action).focus();
      }, { label: `确认${name}`, danger: action === "delete" });
  }

  $("condition-dimensions").innerHTML = Object.entries(conditionDimensions).map(([dimension, label]) =>
    `<button type="button" class="button condition-dimension" data-dimension="${dimension}"
      aria-controls="condition-choices" aria-pressed="false">${label}</button>`
  ).join("");
  $("condition-trigger").addEventListener("click", () => {
    if (!$("condition-menu").hidden) {
      closeConditionMenu();
      return;
    }
    showConditionChoices(conditionChoice?.dimension ?? activeConditionDimension);
    $("condition-menu").hidden = false;
    $("condition-trigger").setAttribute("aria-expanded", "true");
    $("condition-dimensions").querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  });
  $("condition-dimensions").addEventListener("click", (event) => {
    const dimension = event.target.closest("[data-dimension]")?.dataset.dimension;
    if (dimension) showConditionChoices(dimension);
  });
  $("condition-choices").addEventListener("change", (event) => {
    if (event.target.checked) setConditionChoice({ dimension: activeConditionDimension, value: event.target.value });
  });
  $("condition-choices").addEventListener("click", (event) => {
    if (event.target.type === "radio") closeConditionMenu(true);
  });
  $("condition-clear").addEventListener("click", () => {
    setConditionChoice(null);
    closeConditionMenu(true);
  });
  $("condition-filter").addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || $("condition-menu").hidden) return;
    event.preventDefault();
    closeConditionMenu(true);
  });
  $("condition-filter").addEventListener("focusout", (event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) closeConditionMenu();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!$("condition-menu").hidden && !$("condition-filter").contains(event.target)) closeConditionMenu();
  });

  $("create-group").addEventListener("click", (event) => openEditor(undefined, event.currentTarget));
  $("group-filters").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    listQuery = {
      keyword: formData.get("keyword"), status: formData.get("status"),
      autoAdd: formData.get("autoAdd"), autoRemove: formData.get("autoRemove"), condition: conditionChoice
    };
    listPage = 1;
    renderList();
  });
  $("group-filters").addEventListener("reset", () => {
    setConditionChoice(null);
    activeConditionDimension = "tags";
    closeConditionMenu();
    listQuery = {};
    listPage = 1;
    renderList();
  });
  $("group-page-size").addEventListener("change", () => {
    listPage = 1;
    renderList();
  });
  $("group-previous").addEventListener("click", () => {
    listPage -= 1;
    renderList();
  });
  $("group-next").addEventListener("click", () => {
    listPage += 1;
    renderList();
  });

  $("detail-view").addEventListener("submit", (event) => {
    if (event.target.id !== "detail-filter") return;
    event.preventDefault();
    Object.assign(detail, Object.fromEntries(new FormData(event.target)));
    renderShops();
  });
  $("detail-view").addEventListener("change", (event) => {
    if (event.target.name !== "source") return;
    Object.assign(detail, Object.fromEntries(new FormData($("detail-filter"))));
    renderShops();
  });

  document.addEventListener("click", (event) => {
    const control = event.target.closest("button[data-action]");
    if (!control) return;
    const { action, id } = control.dataset;
    const group = state.groups.get(id);
    switch (action) {
      case "detail": openDetail(group, control); break;
      case "list": showList(); break;
      case "export-members": {
        const total = state.members.get(detail.group.id).size;
        Object.assign(detail, { feedback: `导出范围 · 当前组内 ${total} 家店铺（演示）`, feedbackError: false });
        $("detail-feedback").classList.remove("feedback-error");
        $("detail-feedback").textContent = detail.feedback;
        break;
      }
      case "scan":
      case "manual-scan":
      case "fail-scan": void simulateScan(group, action); break;
      case "edit": openEditor(group, control); break;
      case "config-history":
      case "member-history": openHistory(group, action === "member-history", control); break;
      case "enable":
      case "disable":
      case "delete": confirmStatus(group, action, control); break;
      case "reset-detail":
        $("detail-filter").elements.keyword.value = "";
        $("detail-filter").elements.source.value = "";
        Object.assign(detail, { keyword: "", source: "" });
        renderShops();
        break;
      case "close-dialog": control.closest("dialog").close(); break;
    }
  });

  showList();
})();
