// ---------------------------------------------------------------------------
// ML Resource Catalogue — Frontend Application
// ---------------------------------------------------------------------------

const API = "/api/resources";
const TAG_API = "/api/tags";

// DOM refs
const resourceList = document.getElementById("resource-list");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const filterCategory = document.getElementById("filter-category");
const filterActivity = document.getElementById("filter-activity");
const filterQuality = document.getElementById("filter-quality");
const filterTag = document.getElementById("filter-tag");

const btnNew = document.getElementById("btn-new");
const btnExportCsv = document.getElementById("btn-export-csv");
const btnExportPdf = document.getElementById("btn-export-pdf");
const resourceCountEl = document.getElementById("resource-count");

// Detail modal
const detailModal = document.getElementById("detail-modal");
const detailContent = document.getElementById("detail-content");
const detailClose = document.getElementById("detail-close");

// Form modal
const formModal = document.getElementById("form-modal");
const formTitle = document.getElementById("form-title");
const formClose = document.getElementById("form-close");
const formCancel = document.getElementById("form-cancel");
const resourceForm = document.getElementById("resource-form");
const formId = document.getElementById("form-id");
const formResTitle = document.getElementById("form-res-title");
const formDescription = document.getElementById("form-description");
const formCategory = document.getElementById("form-category");
const formActivity = document.getElementById("form-activity");
const formQuality = document.getElementById("form-quality");
const formTags = document.getElementById("form-tags");
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

let pendingTagDeleteId = null;
let pendingDeleteId = null;

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
// Build current filter query string (shared by list + export)
// ---------------------------------------------------------------------------
function currentFilterParams() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
  if (filterCategory.value) params.set("category", filterCategory.value);
  if (filterActivity.value) params.set("activity", filterActivity.value);
  if (filterQuality.value) params.set("quality_attribute", filterQuality.value);
  if (filterTag.value) params.set("tag", filterTag.value);
  return params;
}

// ---------------------------------------------------------------------------
// Load resources
// ---------------------------------------------------------------------------
async function loadResources() {
  const qs = currentFilterParams().toString();
  const resources = await apiFetch(`${API}${qs ? "?" + qs : ""}`);
  renderList(resources);
}

// ---------------------------------------------------------------------------
// Load filter options
// ---------------------------------------------------------------------------
async function loadFilters() {
  const filters = await apiFetch(`${API}/filters`);

  populateSelect(filterCategory, filters.categories, "All Categories");
  populateSelect(filterActivity, filters.activities, "All Activities");
  populateSelect(filterQuality, filters.qualityAttributes, "All Quality Attributes");
  populateSelect(filterTag, filters.tags, "All Tags");
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
  // Restore previous selection if still valid
  if (current && items.includes(current)) {
    select.value = current;
  }
}

// ---------------------------------------------------------------------------
// Render resource cards
// ---------------------------------------------------------------------------
function renderList(resources) {
  resourceList.innerHTML = "";
  resourceCountEl.textContent = `${resources.length} resource${resources.length !== 1 ? "s" : ""}`;

  if (resources.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  resources.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    card.addEventListener("click", () => showDetail(r.id));

    const tags = r.tags
      ? r.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    card.innerHTML = `
      <div class="card-title">${esc(r.title)}</div>
      <div class="card-desc">${esc(r.description)}</div>
      <div class="card-meta">
        ${r.category ? `<span class="badge badge-category">${esc(r.category)}</span>` : ""}
        ${r.activity ? `<span class="badge badge-activity">${esc(r.activity)}</span>` : ""}
        ${r.quality_attribute ? `<span class="badge badge-quality">${esc(r.quality_attribute)}</span>` : ""}
        ${tags.map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join("")}
      </div>
      <div class="card-actions">
        <button class="btn-icon" data-edit="${r.id}" title="Edit">&#9998;</button>
        <button class="btn-icon" data-delete="${r.id}" title="Delete">&#128465;</button>
      </div>
    `;

    // Prevent card click when action buttons are clicked
    card.querySelector(`[data-edit="${r.id}"]`).addEventListener("click", (e) => {
      e.stopPropagation();
      openEditForm(r.id);
    });
    card.querySelector(`[data-delete="${r.id}"]`).addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDelete(r.id, r.title);
    });

    resourceList.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------
async function showDetail(id) {
  const r = await apiFetch(`${API}/${id}`);
  const tags = r.tags
    ? r.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  detailContent.innerHTML = `
    <h2 class="detail-title">${esc(r.title)}</h2>

    <div class="detail-section">
      <div class="detail-label">Description</div>
      <div class="detail-value">${esc(r.description) || "<em>No description</em>"}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Category</div>
      <div class="detail-value">${r.category ? `<span class="badge badge-category">${esc(r.category)}</span>` : "<em>None</em>"}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Activity</div>
      <div class="detail-value">${r.activity ? `<span class="badge badge-activity">${esc(r.activity)}</span>` : "<em>None</em>"}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Quality Attribute</div>
      <div class="detail-value">${r.quality_attribute ? `<span class="badge badge-quality">${esc(r.quality_attribute)}</span>` : "<em>None</em>"}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Tags</div>
      <div class="detail-value">
        ${tags.length ? tags.map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join(" ") : "<em>None</em>"}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Source URL</div>
      <div class="detail-value">
        ${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">${esc(r.source_url)}</a>` : "<em>None</em>"}
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" id="detail-edit">Edit</button>
      <button class="btn btn-danger btn-sm" id="detail-delete">Delete</button>
    </div>

    <div class="detail-timestamp">
      Created: ${formatDate(r.created_at)} &nbsp;|&nbsp; Updated: ${formatDate(r.updated_at)}
    </div>
  `;

  document.getElementById("detail-edit").addEventListener("click", () => {
    detailModal.hidden = true;
    openEditForm(r.id);
  });
  document.getElementById("detail-delete").addEventListener("click", () => {
    detailModal.hidden = true;
    confirmDelete(r.id, r.title);
  });

  detailModal.hidden = false;
}

// ---------------------------------------------------------------------------
// Create / Edit form
// ---------------------------------------------------------------------------
function openCreateForm() {
  formTitle.textContent = "New Resource";
  formId.value = "";
  resourceForm.reset();
  formModal.hidden = false;
  formResTitle.focus();
}

async function openEditForm(id) {
  const r = await apiFetch(`${API}/${id}`);
  formTitle.textContent = "Edit Resource";
  formId.value = r.id;
  formResTitle.value = r.title;
  formDescription.value = r.description;
  formCategory.value = r.category;
  formActivity.value = r.activity;
  formQuality.value = r.quality_attribute;
  formTags.value = r.tags;
  formSourceUrl.value = r.source_url;
  formModal.hidden = false;
  formResTitle.focus();
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const body = {
    title: formResTitle.value,
    description: formDescription.value,
    category: formCategory.value,
    activity: formActivity.value,
    quality_attribute: formQuality.value,
    tags: formTags.value,
    source_url: formSourceUrl.value,
  };

  const id = formId.value;
  if (id) {
    await apiFetch(`${API}/${id}`, { method: "PUT", body: JSON.stringify(body) });
  } else {
    await apiFetch(API, { method: "POST", body: JSON.stringify(body) });
  }

  formModal.hidden = true;
  await Promise.all([loadResources(), loadFilters()]);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
function confirmDelete(id, title) {
  pendingDeleteId = id;
  deleteMessage.textContent = `Are you sure you want to delete "${title}"?`;
  deleteModal.hidden = false;
}

async function executeDelete() {
  if (!pendingDeleteId) return;
  await apiFetch(`${API}/${pendingDeleteId}`, { method: "DELETE" });
  pendingDeleteId = null;
  deleteModal.hidden = true;
  await Promise.all([loadResources(), loadFilters()]);
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
    await Promise.all([renderTagList(), loadResources(), loadFilters()]);
  } catch (err) {
    alert(err.message);
  }
}

function confirmTagDelete(id, name) {
  pendingTagDeleteId = id;
  tagDeleteMessage.textContent = `Delete tag "${name}"? It will be removed from all resources.`;
  tagDeleteModal.hidden = false;
}

async function executeTagDelete() {
  if (!pendingTagDeleteId) return;
  await apiFetch(`${TAG_API}/${pendingTagDeleteId}`, { method: "DELETE" });
  pendingTagDeleteId = null;
  tagDeleteModal.hidden = true;
  await Promise.all([renderTagList(), loadResources(), loadFilters()]);
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
  if (!iso) return "—";
  const d = new Date(iso + "Z");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Debounce helper for search
// ---------------------------------------------------------------------------
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

searchInput.addEventListener("input", debounce(loadResources, 300));
filterCategory.addEventListener("change", loadResources);
filterActivity.addEventListener("change", loadResources);
filterQuality.addEventListener("change", loadResources);
filterTag.addEventListener("change", loadResources);

resourceForm.addEventListener("submit", handleFormSubmit);
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
  await Promise.all([loadResources(), loadFilters()]);
})();
