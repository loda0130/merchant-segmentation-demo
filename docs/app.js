"use strict";

const initialRecords = [
  { id: "R-001", name: "示例记录 A", description: "基础信息已完善", status: "active" },
  { id: "R-002", name: "示例记录 B", description: "待补充说明", status: "pending" },
  { id: "R-003", name: "示例记录 C", description: "已归档", status: "inactive" },
  { id: "R-004", name: "示例记录 D", description: "", status: "active" },
  { id: "R-005", name: "示例记录 E", description: "", status: "pending" },
  { id: "R-006", name: "示例记录 F", description: "", status: "active" }
];
const copyRecords = () => initialRecords.map((record) => ({ ...record }));
let records = copyRecords();

const statuses = new Map([["active", "启用"], ["pending", "待处理"], ["inactive", "停用"]]);
const pageSize = 4;
const byId = (id) => document.getElementById(id);
const filters = byId("filters");
const search = byId("record-search");
const statusFilter = byId("status-filter");
const rows = byId("record-rows");
const count = byId("record-count");
const rowTemplate = byId("record-row");
const feedback = byId("feedback");
const previous = byId("previous-page");
const next = byId("next-page");
const pagePosition = byId("page-position");
const addRecord = byId("add-record");
const editor = byId("edit-dialog");
const form = byId("edit-form");
const fields = form.elements;
const formError = byId("form-error");
const confirmation = byId("confirm-dialog");
const confirmButton = byId("confirm-delete");
const selectPage = byId("select-page");
const selectionCount = byId("selection-count");
const deleteSelected = byId("delete-selected");
const descriptionFilter = byId("description-filter");
const resetRecords = byId("reset-records");
const selectedIds = new Set();

let page = 1;
let nextId = records.length + 1;
let editingRecord;
let confirmAction;

for (const [value, label] of statuses) {
  statusFilter.add(new Option(label, value));
  fields.status.add(new Option(label, value));
}

function renderRecords() {
  const keyword = search.value.trim().toLowerCase();
  const status = statusFilter.value;
  const description = descriptionFilter?.value.trim().toLowerCase() ?? "";
  const matches = records.filter((record) =>
    record.name.toLowerCase().includes(keyword) && (!status || record.status === status) &&
    (!description || record.description.toLowerCase().includes(description))
  );
  if (descriptionFilter) {
    byId("extra-filter-state").textContent = description ? "（1 项已应用）" : "";
    const matchingIds = new Set(matches.map((record) => record.id));
    for (const id of selectedIds) {
      if (!matchingIds.has(id)) selectedIds.delete(id);
    }
  }
  const pageCount = Math.ceil(matches.length / pageSize);
  page = Math.min(page, Math.max(1, pageCount));
  count.textContent = `${matches.length} / ${records.length} 条`;
  pagePosition.textContent = `第 ${pageCount ? page : 0} / ${pageCount} 页`;
  previous.disabled = page <= 1;
  next.disabled = page >= pageCount;

  const content = document.createDocumentFragment();
  const start = (page - 1) * pageSize;
  for (const record of matches.slice(start, start + pageSize)) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.recordId = record.id;
    row.querySelector(".record-name").textContent = record.name;
    row.querySelector(".record-id").textContent = record.id;
    row.querySelector(".record-description").textContent = record.description || "—";
    const badge = row.querySelector(".badge");
    badge.classList.add(`badge-${record.status}`);
    badge.textContent = statuses.get(record.status);
    const checkbox = row.querySelector("[data-select-record]");
    if (checkbox) {
      checkbox.checked = selectedIds.has(record.id);
      checkbox.setAttribute("aria-label", `选择 ${record.name}`);
    }
    for (const button of row.querySelectorAll("button")) {
      button.setAttribute("aria-label", `${button.textContent} ${record.name}`);
    }
    content.append(row);
  }

  if (matches.length === 0) {
    const cell = content.appendChild(document.createElement("tr")).insertCell();
    cell.colSpan = selectPage ? 5 : 4;
    cell.className = "empty-state";
    cell.textContent = records.length ? "没有符合条件的记录" : "暂无记录";
  }

  rows.replaceChildren(content);
  if (selectPage) updateSelection();
}

function pageCheckboxes() {
  return Array.from(rows.querySelectorAll("[data-select-record]"));
}

function updateSelection() {
  const checkboxes = pageCheckboxes();
  const checked = checkboxes.filter((checkbox) => checkbox.checked).length;
  selectPage.disabled = checkboxes.length === 0;
  selectPage.checked = checked > 0 && checked === checkboxes.length;
  selectPage.indeterminate = checked > 0 && !selectPage.checked;
  deleteSelected.disabled = selectedIds.size === 0;
  selectionCount.textContent = `已选 ${selectedIds.size} 条`;
}

function selectRecord(checkbox, checked) {
  const id = checkbox.closest("tr").dataset.recordId;
  checkbox.checked = checked;
  if (checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }
}

function clearFilters() {
  search.value = "";
  statusFilter.value = "";
  if (descriptionFilter) descriptionFilter.value = "";
  applyFilters();
}

function applyFilters() {
  page = 1;
  selectedIds.clear();
  feedback.textContent = "";
  renderRecords();
}

search.addEventListener("input", applyFilters);
statusFilter.addEventListener("change", applyFilters);

filters.addEventListener("submit", (event) => {
  event.preventDefault();
  applyFilters();
});

filters.addEventListener("reset", (event) => {
  event.preventDefault();
  clearFilters();
});

previous.addEventListener("click", () => {
  page -= 1;
  renderRecords();
  if (previous.disabled) next.focus();
});

next.addEventListener("click", () => {
  page += 1;
  renderRecords();
  if (next.disabled) previous.focus();
});

function openEditor(record) {
  editingRecord = record;
  byId("edit-heading").textContent = record ? "编辑记录" : "新增记录";
  fields.name.value = record?.name ?? "";
  fields.status.value = record?.status ?? "pending";
  fields.description.value = record?.description ?? "";
  fields.name.setCustomValidity("");
  formError.textContent = "";
  editor.showModal();
}

addRecord.addEventListener("click", () => openEditor());
byId("cancel-edit").addEventListener("click", () => editor.close());

rows.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.closest("tr").dataset.recordId;
  const record = records.find((item) => item.id === id);
  if (button.dataset.action === "edit") {
    openEditor(record);
    return;
  }

  showConfirmation({
    title: "删除记录",
    message: `确定删除「${record.name}」吗？`,
    warning: "删除后，本次会话中无法恢复。",
    label: "确认删除",
    action: () => {
      const rowIndex = Array.from(rows.children).indexOf(button.closest("tr"));
      deleteRecords(new Set([id]), rowIndex, "记录已删除。");
    }
  });
});

fields.name.addEventListener("input", () => {
  fields.name.setCustomValidity("");
  formError.textContent = "";
});

fields.name.addEventListener("invalid", () => {
  formError.textContent = "保存失败，请输入记录名称。";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = fields.name.value.trim();
  if (!name) {
    fields.name.setCustomValidity("请输入记录名称。");
    fields.name.reportValidity();
    return;
  }

  const values = {
    name,
    status: fields.status.value,
    description: fields.description.value.trim()
  };
  const creating = !editingRecord;
  if (creating) {
    const id = `R-${String(nextId++).padStart(3, "0")}`;
    editingRecord = { id, ...values };
    records.unshift(editingRecord);
    page = 1;
  } else {
    Object.assign(editingRecord, values);
  }

  editor.close();
  renderRecords();
  const editButton = rows.querySelector(`[data-record-id="${editingRecord.id}"] [data-action="edit"]`);
  (editButton || addRecord).focus();
  feedback.textContent = creating ? "记录已新增。" : "记录已保存。";
});

function showConfirmation({ title, message, warning, label, action }) {
  byId("confirm-heading").textContent = title;
  byId("confirm-message").textContent = message;
  byId("confirm-warning").textContent = warning;
  confirmButton.textContent = label;
  confirmAction = action;
  confirmation.showModal();
}

function deleteRecords(ids, rowIndex, message) {
  records = records.filter((record) => !ids.has(record.id));
  for (const id of ids) selectedIds.delete(id);
  renderRecords();
  const remaining = rows.querySelectorAll('[data-action="delete"]');
  (remaining[Math.min(rowIndex, remaining.length - 1)] || addRecord).focus();
  feedback.textContent = message;
}

confirmButton.addEventListener("click", () => {
  confirmation.close();
  confirmAction();
});

if (selectPage) {
  descriptionFilter.addEventListener("input", applyFilters);
  selectPage.addEventListener("change", () => {
    for (const checkbox of pageCheckboxes()) selectRecord(checkbox, selectPage.checked);
    updateSelection();
  });
  rows.addEventListener("change", (event) => {
    selectRecord(event.target, event.target.checked);
    updateSelection();
  });

  deleteSelected.addEventListener("click", () => {
    const ids = new Set(selectedIds);
    showConfirmation({
      title: "批量删除",
      message: `确定删除已选的 ${ids.size} 条记录吗？`,
      warning: "删除后，本次会话中无法恢复。",
      label: "确认删除",
      action: () => deleteRecords(ids, 0, `已删除 ${ids.size} 条记录。`)
    });
  });

  resetRecords.addEventListener("click", () => {
    showConfirmation({
      title: "重置示例",
      message: "恢复初始记录并清除筛选和选择？",
      warning: "本页新增、编辑和删除的内容将被还原。",
      label: "确认重置",
      action: () => {
        records = copyRecords();
        nextId = records.length + 1;
        clearFilters();
        resetRecords.focus();
        feedback.textContent = "示例数据已重置。";
      }
    });
  });

  byId("open-drawer").addEventListener("click", () => byId("component-drawer").showModal());

  const examples = byId("example-actions");
  const result = byId("example-result");
  const messages = {
    success: ["feedback", "示例记录已保存。"],
    error: ["feedback feedback-error", "保存失败。请补全必填项后重试。"],
    warning: ["feedback feedback-warning", "还未选择记录，请先勾选要处理的记录。"]
  };
  function showExample(className, message) {
    result.className = `example-result ${className}`;
    result.textContent = message;
  }

  examples.addEventListener("click", (event) => {
    const message = messages[event.target.dataset.message];
    if (message) showExample(...message);
  });
  byId("show-empty").addEventListener("click", () => showExample("example-empty", "暂无记录。"));
  byId("show-loading").addEventListener("click", () => {
    const buttons = examples.querySelectorAll("button");
    for (const button of buttons) button.disabled = true;
    examples.setAttribute("aria-busy", "true");
    showExample("example-loading", "正在加载记录…");
    window.setTimeout(() => {
      for (const button of buttons) button.disabled = false;
      examples.removeAttribute("aria-busy");
      showExample("feedback", "记录加载完成。");
    }, 1200);
  });
}

renderRecords();
