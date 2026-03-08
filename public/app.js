// ---------------------------------------------------------------------------
// ML Asset Catalogue — Frontend Application
// ---------------------------------------------------------------------------

const API = "/api/assets";
const TAG_API = "/api/tags";

// DOM refs
const assetList = document.getElementById("asset-list");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const filterCategory = document.getElementById("filter-category");
const filterActivity = document.getElementById("filter-activity");
const filterQuality = document.getElementById("filter-quality");
const filterTag = document.getElementById("filter-tag");
const sortSelect = document.getElementById("sort-select");

const btnNew = document.getElementById("btn-new");
const btnExportCsv = document.getElementById("btn-export-csv");
const btnExportPdf = document.getElementById("btn-export-pdf");
const assetCountEl = document.getElementById("asset-count");

// Detail modal
const detailModal = document.getElementById("detail-modal");
const detailContent = document.getElementById("detail-content");
const detailClose = document.getElementById("detail-close");

// Form modal
const formModal = document.getElementById("form-modal");
const formTitle = document.getElementById("form-title");
const formClose = document.getElementById("form-close");
const formCancel = document.getElementById("form-cancel");
const assetForm = document.getElementById("asset-form");
const formId = document.getElementById("form-id");
const formName = document.getElementById("form-name");
const formAka = document.getElementById("form-aka");
const formShortPres = document.getElementById("form-short-presentation");
const formContext = document.getElementById("form-context");
const formWhyAndHow = document.getElementById("form-why-and-how");
const formSourceUrl = document.getElementById("form-source-url");

// Delete modal
const deleteModal = document.getElementById("delete-modal");
const deleteMessage = document.getElementById("delete-message");
const deleteCancel = document.getElementById("delete-cancel");
const deleteConfirm = document.getElementById("delete-confirm");

// Tag management modal
const btnManageTags = document.getElementById("btn-manage-tags");
const tagsModal = document.getElementById("tags-modal");
const tagsClose = document.getElementById("tags-close");
const tagNewName = document.getElementById("tag-new-name");
const tagAddBtn = document.getElementById("tag-add-btn");
const tagListEl = document.getElementById("tag-list");
const tagEmpty = document.getElementById("tag-empty");

// Tag rename modal
const tagRenameModal = document.getElementById("tag-rename-modal");
const tagRenameId = document.getElementById("tag-rename-id");
const tagRenameInput = document.getElementById("tag-rename-input");
const tagRenameCancel = document.getElementById("tag-rename-cancel");
const tagRenameSave = document.getElementById("tag-rename-save");

// Tag delete modal
const tagDeleteModal = document.getElementById("tag-delete-modal");
const tagDeleteMessage = document.getElementById("tag-delete-message");
const tagDeleteCancel = document.getElementById("tag-delete-cancel");
const tagDeleteConfirm = document.getElementById("tag-delete-confirm");

// Admin mode
const adminToggle = document.getElementById("admin-mode-toggle");
const visibilityToggleBar = document.getElementById("visibility-toggle-bar");
const includeInternalToggle = document.getElementById("include-internal-toggle");
const formVisibilityGroup = document.getElementById("form-visibility-group");
const formVisibility = document.getElementById("form-visibility");
const formRefTitle = document.getElementById("form-ref-title");
const formRefUrl = document.getElementById("form-ref-url");
const formRefNote = document.getElementById("form-ref-note");

let pendingTagDeleteId = null;
let pendingDeleteId = null;
let isAdmin = false;

// Cached filter data
let filterData = { categories: [], activities: [], qualities: [], tags: [] };

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Filter query string (shared by list + export)
// ---------------------------------------------------------------------------
function currentFilterParams() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
  if (filterCategory.value) params.set("category", filterCategory.value);
  if (filterActivity.value) params.set("activity", filterActivity.value);
  if (filterQuality.value) params.set("quality", filterQuality.value);
  if (filterTag.value) params.set("tag", filterTag.value);
  if (sortSelect.value) params.set("sort", sortSelect.value);
  if (isAdmin && includeInternalToggle.checked) params.set("include_internal", "1");
  return params;
}

// ---------------------------------------------------------------------------
// Load assets
// ---------------------------------------------------------------------------
async function loadAssets() {
  const qs = currentFilterParams().toString();
  const assets = await apiFetch(`${API}${qs ? "?" + qs : ""}`);
  renderList(assets);
}

// ---------------------------------------------------------------------------
// Load filter options
// ---------------------------------------------------------------------------
async function loadFilters() {
  filterData = await apiFetch(`${API}/filters`);

  populateSelect(filterCategory, filterData.categories.map(c => c.name), "All Categories");

  // Activities: grouped
  const actOpts = filterData.activities.map(a => `${a.group_name}: ${a.name}`);
  populateSelect(filterActivity, filterData.activities.map(a => a.name), "All Activities");

  populateSelect(filterQuality, filterData.qualities.map(q => q.name), "All Qualities");
  populateSelect(filterTag, filterData.tags.map(t => t.name), "All Tags");
}

function populateSelect(select, items, placeholder) {
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    select.appendChild(opt);
  });
  if (current && items.includes(current)) {
    select.value = current;
  }
}

// ---------------------------------------------------------------------------
// Render asset cards
// ---------------------------------------------------------------------------
function renderList(assets) {
  assetList.innerHTML = "";
  assetCountEl.textContent = `${assets.length} asset${assets.length !== 1 ? "s" : ""}`;

  if (assets.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  assets.forEach((a) => {
    const card = document.createElement("div");
    card.className = "card" + (a.visibility === "InternalOnly" ? " card-internal" : "");
    card.addEventListener("click", () => showDetail(a.id));

    const isInternal = a.visibility === "InternalOnly";
    card.innerHTML = `
      <div class="card-title">${esc(a.name)}${isInternal ? ' <span class="badge badge-visibility badge-internal">Internal</span>' : ""}</div>
      ${a.aka ? `<div class="card-aka">${esc(a.aka)}</div>` : ""}
      <div class="card-desc">${esc(a.short_presentation)}</div>
      <div class="card-meta">
        ${a.categories.map(c => `<span class="badge badge-category badge-clickable" data-filter-type="category" data-filter-value="${esc(c.name)}">${esc(c.name)}</span>`).join("")}
        ${a.activities.map(act => `<span class="badge badge-activity badge-clickable" data-filter-type="activity" data-filter-value="${esc(act.name)}">${esc(act.name)}</span>`).join("")}
        ${a.qualities.map(q => `<span class="badge badge-quality badge-clickable" data-filter-type="quality" data-filter-value="${esc(q.name)}">${esc(q.name)}</span>`).join("")}
        ${a.tags.map(t => `<span class="badge badge-tag badge-clickable badge-tag-clickable" data-filter-type="tag" data-filter-value="${esc(t.name)}" data-tag-name="${esc(t.name)}">${esc(t.name)}</span>`).join("")}
      </div>
      <div class="card-actions">
        <button class="btn-icon" data-edit="${a.id}" title="Edit">&#9998;</button>
        <button class="btn-icon" data-delete="${a.id}" title="Delete">&#128465;</button>
      </div>
    `;

    card.querySelector(`[data-edit="${a.id}"]`).addEventListener("click", (e) => {
      e.stopPropagation();
      openEditForm(a.id);
    });
    card.querySelector(`[data-delete="${a.id}"]`).addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDelete(a.id, a.name);
    });

    // Clickable classification badges
    card.querySelectorAll(".badge-clickable").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        applyClassificationFilter(el.dataset.filterType, el.dataset.filterValue);
      });
    });

    assetList.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------
async function showDetail(id) {
  const a = await apiFetch(`${API}/${id}`);

  // Restrict non-admin from viewing InternalOnly details
  if (a.visibility === "InternalOnly" && !isAdmin) {
    alert("This asset is restricted to admin users.");
    return;
  }

  function kbSolveSection(items) {
    if (!items || items.length === 0) return "";
    return `<div class="detail-section"><div class="detail-label">Solves</div><ul class="detail-kb-list">${items.map(i => {
      const parts = [];
      if (i.problem) parts.push(`<strong>Problem:</strong> ${esc(i.problem)}`);
      if (i.solution) parts.push(`<strong>Solution:</strong> ${esc(i.solution)}`);
      if (i.pros) parts.push(`<strong>Pros:</strong> ${esc(i.pros)}`);
      if (i.cons) parts.push(`<strong>Cons:</strong> ${esc(i.cons)}`);
      if (i.consequences) parts.push(`<strong>Consequences:</strong> ${esc(i.consequences)}`);
      return `<li>${parts.join(" &mdash; ")}</li>`;
    }).join("")}</ul></div>`;
  }

  function kbWhatReasonSection(label, items, primaryKey) {
    if (!items || items.length === 0) return "";
    return `<div class="detail-section"><div class="detail-label">${label}</div><ul class="detail-kb-list">${items.map(i => {
      const primary = i[primaryKey] || "";
      const reason = i.reason || "";
      if (primary && reason) return `<li>${esc(primary)} &mdash; <em>${esc(reason)}</em></li>`;
      return `<li>${esc(primary || reason)}</li>`;
    }).join("")}</ul></div>`;
  }

  const hasRef = a.reference_title || a.reference_url || a.reference_note;

  detailContent.innerHTML = `
    <h2 class="detail-title">${esc(a.name)}${a.visibility === "InternalOnly" ? ' <span class="badge badge-visibility badge-internal">Internal</span>' : ""}</h2>
    ${a.aka ? `<div class="detail-aka">${esc(a.aka)}</div>` : ""}

    <div class="detail-section">
      <div class="detail-label">Short Presentation</div>
      <div class="detail-value">${esc(a.short_presentation) || "<em>None</em>"}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Context</div>
      <div class="detail-value">${esc(a.context) || "<em>None</em>"}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Why and How</div>
      <div class="detail-value">${esc(a.why_and_how) || "<em>None</em>"}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Categories</div>
      <div class="detail-value">
        ${a.categories.length ? a.categories.map(c => `<span class="badge badge-category badge-clickable" data-filter-type="category" data-filter-value="${esc(c.name)}">${esc(c.name)}</span>`).join(" ") : "<em>None</em>"}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Activities</div>
      <div class="detail-value">
        ${a.activities.length ? a.activities.map(act => `<span class="badge badge-activity badge-clickable" data-filter-type="activity" data-filter-value="${esc(act.name)}">${esc(act.group_name)}: ${esc(act.name)}</span>`).join(" ") : "<em>None</em>"}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Qualities</div>
      <div class="detail-value">
        ${a.qualities.length ? a.qualities.map(q => `<span class="badge badge-quality badge-clickable" data-filter-type="quality" data-filter-value="${esc(q.name)}">${esc(q.group_name)}: ${esc(q.name)}</span>`).join(" ") : "<em>None</em>"}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Tags</div>
      <div class="detail-value">
        ${a.tags.length ? a.tags.map(t => `<span class="badge badge-tag badge-clickable badge-tag-clickable" data-filter-type="tag" data-filter-value="${esc(t.name)}" data-tag-name="${esc(t.name)}">${esc(t.name)}</span>`).join(" ") : "<em>None</em>"}
      </div>
    </div>

    ${kbSolveSection(a.solves)}
    ${kbWhatReasonSection("Do", a.dos, "what")}
    ${kbWhatReasonSection("Don't", a.donts, "what")}
    ${kbWhatReasonSection("Consider", a.considers, "what")}
    ${kbWhatReasonSection("Be Aware", a.be_awares, "of_what")}

    <div class="detail-section">
      <div class="detail-label">Exemplifications</div>
      ${a.exemplifications.length ? `<ul class="detail-kb-list">${a.exemplifications.map(e => `<li>${esc(e.text)}</li>`).join("")}</ul>` : "<em>None</em>"}
    </div>

    ${a.related.length ? `
    <div class="detail-section">
      <div class="detail-label">Related Assets</div>
      <div class="detail-value">
        ${a.related.map(r => `<span class="related-link" data-related-id="${r.id}">${esc(r.name)}</span>`).join(", ")}
      </div>
    </div>
    ` : ""}

    <div class="detail-section">
      <div class="detail-label">Source URL</div>
      <div class="detail-value">
        ${a.source_url ? `<a href="${esc(a.source_url)}" target="_blank" rel="noopener noreferrer">${esc(a.source_url)}</a>` : "<em>None</em>"}
      </div>
    </div>

    ${hasRef ? `
    <div class="detail-section">
      <div class="detail-label">Reference</div>
      <div class="detail-value">
        ${a.reference_title ? `<strong>${esc(a.reference_title)}</strong>` : ""}
        ${a.reference_url ? `<br><a href="${esc(a.reference_url)}" target="_blank" rel="noopener noreferrer">${esc(a.reference_url)}</a>` : ""}
        ${a.reference_note ? `<br><em>${esc(a.reference_note)}</em>` : ""}
      </div>
    </div>
    ` : ""}

    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" id="detail-edit">Edit</button>
      <button class="btn btn-danger btn-sm" id="detail-delete">Delete</button>
    </div>

    <div class="detail-timestamp">
      Created: ${formatDate(a.created_at)} &nbsp;|&nbsp; Updated: ${formatDate(a.updated_at)}
    </div>
  `;

  document.getElementById("detail-edit").addEventListener("click", () => {
    detailModal.hidden = true;
    openEditForm(a.id);
  });
  document.getElementById("detail-delete").addEventListener("click", () => {
    detailModal.hidden = true;
    confirmDelete(a.id, a.name);
  });

  // Related asset links
  detailContent.querySelectorAll(".related-link").forEach((el) => {
    el.addEventListener("click", () => showDetail(Number(el.dataset.relatedId)));
  });

  // Clickable classification badges in detail
  detailContent.querySelectorAll(".badge-clickable").forEach((el) => {
    el.addEventListener("click", () => {
      detailModal.hidden = true;
      applyClassificationFilter(el.dataset.filterType, el.dataset.filterValue);
    });
  });

  detailModal.hidden = false;
}

// ---------------------------------------------------------------------------
// Dynamic list items (knowledge blocks, exemplifications)
// ---------------------------------------------------------------------------
function addDynItem(containerId, value) {
  const container = document.getElementById(containerId);
  const row = document.createElement("div");
  row.className = "dyn-row";
  row.innerHTML = `
    <input type="text" class="input" value="${esc(value || "")}" />
    <button type="button" class="dyn-remove" title="Remove">&times;</button>
  `;
  row.querySelector(".dyn-remove").addEventListener("click", () => row.remove());
  container.appendChild(row);
  row.querySelector(".input").focus();
}
// Expose globally for onclick in HTML
window.addDynItem = addDynItem;

function getDynValues(containerId) {
  const container = document.getElementById(containerId);
  return Array.from(container.querySelectorAll(".dyn-row .input"))
    .map(input => input.value.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Clickable classification filter
// ---------------------------------------------------------------------------
function applyClassificationFilter(type, value) {
  const filterMap = {
    category: filterCategory,
    activity: filterActivity,
    quality: filterQuality,
    tag: filterTag,
  };
  const select = filterMap[type];
  if (select) {
    select.value = value;
    loadAssets();
  }
}

function applyTagFilter(tagName) {
  applyClassificationFilter("tag", tagName);
}

// ---------------------------------------------------------------------------
// Knowledge Items (unified form)
// ---------------------------------------------------------------------------
const KB_TYPES = {
  solve:      { label: "Solve",     fields: ["problem", "solution", "pros", "cons", "consequences"] },
  do:         { label: "Do",        fields: ["what", "reason"] },
  dont:       { label: "Don't",     fields: ["what", "reason"] },
  consider:   { label: "Consider",  fields: ["what", "reason"] },
  be_aware:   { label: "Be Aware",  fields: ["of_what", "reason"] },
};

const KB_FIELD_LABELS = {
  problem: "Problem", solution: "Solution", pros: "Pros", cons: "Cons",
  consequences: "Consequences", what: "What", reason: "Reason", of_what: "Of What",
};

function addKnowledgeItem(type, values) {
  const container = document.getElementById("form-knowledge-items");
  const item = document.createElement("div");
  item.className = "ki-item";

  const typeDef = KB_TYPES[type || "solve"];
  const typeOptions = Object.entries(KB_TYPES).map(([k, v]) =>
    `<option value="${k}" ${k === type ? "selected" : ""}>${v.label}</option>`
  ).join("");

  item.innerHTML = `
    <div class="ki-header">
      <select class="input ki-type-select">${typeOptions}</select>
      <button type="button" class="dyn-remove" title="Remove">&times;</button>
    </div>
    <div class="ki-fields"></div>
  `;

  const fieldsDiv = item.querySelector(".ki-fields");
  const typeSelect = item.querySelector(".ki-type-select");

  function renderFields(t, vals) {
    fieldsDiv.innerHTML = "";
    const def = KB_TYPES[t];
    if (!def) return;
    def.fields.forEach(f => {
      const row = document.createElement("div");
      row.className = "ki-field-row";
      row.innerHTML = `
        <span class="ki-field-label">${KB_FIELD_LABELS[f] || f}</span>
        <input type="text" class="input" data-field="${f}" value="${esc(vals && vals[f] || "")}" />
      `;
      fieldsDiv.appendChild(row);
    });
  }

  renderFields(type || "solve", values);

  typeSelect.addEventListener("change", () => {
    // Preserve any filled values that share keys
    const currentVals = {};
    fieldsDiv.querySelectorAll("input[data-field]").forEach(inp => {
      currentVals[inp.dataset.field] = inp.value;
    });
    renderFields(typeSelect.value, currentVals);
  });

  item.querySelector(".dyn-remove").addEventListener("click", () => item.remove());
  container.appendChild(item);
}
window.addKnowledgeItem = addKnowledgeItem;

function getKnowledgeItems() {
  const items = { solves: [], dos: [], donts: [], considers: [], be_awares: [] };
  document.querySelectorAll("#form-knowledge-items .ki-item").forEach(item => {
    const type = item.querySelector(".ki-type-select").value;
    const vals = {};
    item.querySelectorAll("input[data-field]").forEach(inp => {
      vals[inp.dataset.field] = inp.value.trim();
    });

    const hasContent = Object.values(vals).some(v => v);
    if (!hasContent) return;

    switch (type) {
      case "solve": items.solves.push(vals); break;
      case "do": items.dos.push(vals); break;
      case "dont": items.donts.push(vals); break;
      case "consider": items.considers.push(vals); break;
      case "be_aware": items.be_awares.push({ of_what: vals.of_what || "", reason: vals.reason || "" }); break;
    }
  });
  return items;
}

// ---------------------------------------------------------------------------
// Form: render checkboxes
// ---------------------------------------------------------------------------
function renderCheckboxes(containerId, items, checkedIds) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  items.forEach((item) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" value="${item.id}" ${checkedIds.includes(item.id) ? "checked" : ""} /> ${esc(item.name)}`;
    container.appendChild(label);
  });
}

function renderGroupedCheckboxes(containerId, items, checkedIds) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const groups = {};
  items.forEach((item) => {
    const g = item.group_name || "Other";
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });

  for (const [groupName, groupItems] of Object.entries(groups)) {
    const heading = document.createElement("div");
    heading.className = "group-heading";
    heading.textContent = groupName;
    container.appendChild(heading);

    const itemsDiv = document.createElement("div");
    itemsDiv.className = "group-items";
    groupItems.forEach((item) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${item.id}" ${checkedIds.includes(item.id) ? "checked" : ""} /> ${esc(item.name)}`;
      itemsDiv.appendChild(label);
    });
    container.appendChild(itemsDiv);
  }
}

function getCheckedIds(containerId) {
  return Array.from(document.getElementById(containerId).querySelectorAll("input[type=checkbox]:checked"))
    .map(cb => Number(cb.value));
}

// ---------------------------------------------------------------------------
// Create / Edit form
// ---------------------------------------------------------------------------
async function openCreateForm() {
  formTitle.textContent = "New Asset";
  formId.value = "";
  assetForm.reset();

  // Visibility: only show if admin
  formVisibilityGroup.hidden = !isAdmin;
  formVisibility.value = "CatalogueUser";

  // Populate checkboxes
  renderCheckboxes("form-categories", filterData.categories, []);
  renderGroupedCheckboxes("form-activities", filterData.activities, []);
  renderGroupedCheckboxes("form-qualities", filterData.qualities, []);
  renderCheckboxes("form-tags", filterData.tags, []);

  // Clear dynamic lists
  document.getElementById("form-knowledge-items").innerHTML = "";
  document.getElementById("form-exemplifications").innerHTML = "";

  // Related assets
  const allAssets = await apiFetch("/api/assets-list");
  renderCheckboxes("form-related", allAssets, []);

  formModal.hidden = false;
  formName.focus();
}

async function openEditForm(id) {
  const a = await apiFetch(`${API}/${id}`);

  // Restrict non-admin from editing InternalOnly assets
  if (a.visibility === "InternalOnly" && !isAdmin) {
    alert("This asset is restricted to admin users.");
    return;
  }

  formTitle.textContent = "Edit Asset";
  formId.value = a.id;
  formName.value = a.name;
  formAka.value = a.aka;
  formShortPres.value = a.short_presentation;
  formContext.value = a.context;
  formWhyAndHow.value = a.why_and_how;
  formSourceUrl.value = a.source_url;

  // Visibility
  formVisibilityGroup.hidden = !isAdmin;
  formVisibility.value = a.visibility || "CatalogueUser";

  // Reference
  formRefTitle.value = a.reference_title || "";
  formRefUrl.value = a.reference_url || "";
  formRefNote.value = a.reference_note || "";

  // Populate checkboxes with current selections
  renderCheckboxes("form-categories", filterData.categories, a.categories.map(c => c.id));
  renderGroupedCheckboxes("form-activities", filterData.activities, a.activities.map(act => act.id));
  renderGroupedCheckboxes("form-qualities", filterData.qualities, a.qualities.map(q => q.id));
  renderCheckboxes("form-tags", filterData.tags, a.tags.map(t => t.id));

  // Populate knowledge items
  document.getElementById("form-knowledge-items").innerHTML = "";
  a.solves.forEach(s => addKnowledgeItem("solve", s));
  a.dos.forEach(d => addKnowledgeItem("do", d));
  a.donts.forEach(d => addKnowledgeItem("dont", d));
  a.considers.forEach(c => addKnowledgeItem("consider", c));
  a.be_awares.forEach(b => addKnowledgeItem("be_aware", { of_what: b.of_what, reason: b.reason }));

  // Populate exemplifications
  document.getElementById("form-exemplifications").innerHTML = "";
  a.exemplifications.forEach(item => addDynItem("form-exemplifications", item.text));

  // Related assets (exclude self)
  const allAssets = await apiFetch("/api/assets-list");
  const filtered = allAssets.filter(x => x.id !== a.id);
  renderCheckboxes("form-related", filtered, a.related.map(r => r.id));

  formModal.hidden = false;
  formName.focus();
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const kbItems = getKnowledgeItems();
  const body = {
    name: formName.value,
    aka: formAka.value,
    short_presentation: formShortPres.value,
    context: formContext.value,
    why_and_how: formWhyAndHow.value,
    source_url: formSourceUrl.value,
    visibility: isAdmin ? formVisibility.value : "CatalogueUser",
    reference_title: formRefTitle.value,
    reference_url: formRefUrl.value,
    reference_note: formRefNote.value,
    category_ids: getCheckedIds("form-categories"),
    activity_ids: getCheckedIds("form-activities"),
    quality_ids: getCheckedIds("form-qualities"),
    tag_ids: getCheckedIds("form-tags"),
    related_ids: getCheckedIds("form-related"),
    solves: kbItems.solves,
    dos: kbItems.dos,
    donts: kbItems.donts,
    considers: kbItems.considers,
    be_awares: kbItems.be_awares,
    exemplifications: getDynValues("form-exemplifications"),
  };

  // Validate at least one exemplification
  if (body.exemplifications.length === 0) {
    alert("At least one exemplification is required.");
    return;
  }

  const id = formId.value;
  try {
    if (id) {
      await apiFetch(`${API}/${id}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch(API, { method: "POST", body: JSON.stringify(body) });
    }
    formModal.hidden = true;
    await Promise.all([loadAssets(), loadFilters()]);
  } catch (err) {
    alert(err.message);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
function confirmDelete(id, name) {
  pendingDeleteId = id;
  deleteMessage.textContent = `Are you sure you want to delete "${name}"?`;
  deleteModal.hidden = false;
}

async function executeDelete() {
  if (!pendingDeleteId) return;
  await apiFetch(`${API}/${pendingDeleteId}`, { method: "DELETE" });
  pendingDeleteId = null;
  deleteModal.hidden = true;
  await Promise.all([loadAssets(), loadFilters()]);
}

// ---------------------------------------------------------------------------
// Tag management
// ---------------------------------------------------------------------------
async function openTagManager() {
  tagsModal.hidden = false;
  await renderTagList();
}

async function renderTagList() {
  const tags = await apiFetch(TAG_API);
  tagListEl.innerHTML = "";

  if (tags.length === 0) {
    tagEmpty.hidden = false;
    return;
  }
  tagEmpty.hidden = true;

  tags.forEach((tag) => {
    const li = document.createElement("li");
    li.className = "tag-mgmt-item";
    li.innerHTML = `
      <span class="tag-mgmt-name">${esc(tag.name)}</span>
      <span class="tag-mgmt-actions">
        <button class="btn-icon" data-tag-rename="${tag.id}" title="Rename">&#9998;</button>
        <button class="btn-icon" data-tag-delete="${tag.id}" title="Delete">&#128465;</button>
      </span>
    `;

    li.querySelector(`[data-tag-rename="${tag.id}"]`).addEventListener("click", () => {
      openTagRename(tag.id, tag.name);
    });
    li.querySelector(`[data-tag-delete="${tag.id}"]`).addEventListener("click", () => {
      confirmTagDelete(tag.id, tag.name);
    });

    tagListEl.appendChild(li);
  });
}

async function addTag() {
  const name = tagNewName.value.trim();
  if (!name) return;
  try {
    await apiFetch(TAG_API, { method: "POST", body: JSON.stringify({ name }) });
    tagNewName.value = "";
    await Promise.all([renderTagList(), loadFilters()]);
  } catch (err) {
    alert(err.message);
  }
}

function openTagRename(id, currentName) {
  tagRenameId.value = id;
  tagRenameInput.value = currentName;
  tagRenameModal.hidden = false;
  tagRenameInput.focus();
}

async function saveTagRename() {
  const id = tagRenameId.value;
  const name = tagRenameInput.value.trim();
  if (!name) return;
  try {
    await apiFetch(`${TAG_API}/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
    tagRenameModal.hidden = true;
    await Promise.all([renderTagList(), loadAssets(), loadFilters()]);
  } catch (err) {
    alert(err.message);
  }
}

function confirmTagDelete(id, name) {
  pendingTagDeleteId = id;
  tagDeleteMessage.textContent = `Delete tag "${name}"? It will be removed from all assets.`;
  tagDeleteModal.hidden = false;
}

async function executeTagDelete() {
  if (!pendingTagDeleteId) return;
  await apiFetch(`${TAG_API}/${pendingTagDeleteId}`, { method: "DELETE" });
  pendingTagDeleteId = null;
  tagDeleteModal.hidden = true;
  await Promise.all([renderTagList(), loadAssets(), loadFilters()]);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function exportAs(format) {
  const qs = currentFilterParams().toString();
  window.open(`${API}/export/${format}${qs ? "?" + qs : ""}`, "_blank");
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso + "Z");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
btnNew.addEventListener("click", openCreateForm);
btnExportCsv.addEventListener("click", () => exportAs("csv"));
btnExportPdf.addEventListener("click", () => exportAs("pdf"));

// Admin mode toggle
adminToggle.addEventListener("change", () => {
  isAdmin = adminToggle.checked;
  visibilityToggleBar.hidden = !isAdmin;
  if (!isAdmin) {
    includeInternalToggle.checked = false;
  }
  loadAssets();
});
includeInternalToggle.addEventListener("change", loadAssets);

searchInput.addEventListener("input", debounce(loadAssets, 300));
filterCategory.addEventListener("change", loadAssets);
filterActivity.addEventListener("change", loadAssets);
filterQuality.addEventListener("change", loadAssets);
filterTag.addEventListener("change", loadAssets);
sortSelect.addEventListener("change", loadAssets);

assetForm.addEventListener("submit", handleFormSubmit);
document.getElementById("btn-add-knowledge-item").addEventListener("click", () => addKnowledgeItem("solve"));
formClose.addEventListener("click", () => (formModal.hidden = true));
formCancel.addEventListener("click", () => (formModal.hidden = true));

detailClose.addEventListener("click", () => (detailModal.hidden = true));

deleteCancel.addEventListener("click", () => {
  deleteModal.hidden = true;
  pendingDeleteId = null;
});
deleteConfirm.addEventListener("click", executeDelete);

// Tag management listeners
btnManageTags.addEventListener("click", openTagManager);
tagsClose.addEventListener("click", () => (tagsModal.hidden = true));
tagAddBtn.addEventListener("click", addTag);
tagNewName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addTag(); }
});
tagRenameCancel.addEventListener("click", () => (tagRenameModal.hidden = true));
tagRenameSave.addEventListener("click", saveTagRename);
tagRenameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveTagRename(); }
});
tagDeleteCancel.addEventListener("click", () => {
  tagDeleteModal.hidden = true;
  pendingTagDeleteId = null;
});
tagDeleteConfirm.addEventListener("click", executeTagDelete);

// Close modals on overlay click
[detailModal, formModal, deleteModal, tagsModal, tagRenameModal, tagDeleteModal].forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.hidden = true;
      pendingDeleteId = null;
      pendingTagDeleteId = null;
    }
  });
});

// Close modals on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    detailModal.hidden = true;
    formModal.hidden = true;
    deleteModal.hidden = true;
    tagsModal.hidden = true;
    tagRenameModal.hidden = true;
    tagDeleteModal.hidden = true;
    pendingDeleteId = null;
    pendingTagDeleteId = null;
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  await loadFilters();
  await loadAssets();
})();
