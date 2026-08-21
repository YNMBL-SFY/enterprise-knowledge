const state = {
	users: [],
	activeToken: "",
	documents: [],
};

const userSelect = document.querySelector("#userSelect");
const health = document.querySelector("#health");
const documentsNode = document.querySelector("#documents");
const conversation = document.querySelector("#conversation");
const documentForm = document.querySelector("#documentForm");
const queryForm = document.querySelector("#queryForm");
const saveMessage = document.querySelector("#saveMessage");
const fileHint = document.querySelector("#fileHint");
const saveButton = document.querySelector("#saveButton");
const sendButton = document.querySelector("#sendButton");
const refreshButton = document.querySelector("#refreshDocuments");
const fileInput = document.querySelector("#documentFile");

// 编辑器抽屉元素
const editorOverlay = document.querySelector("#editorOverlay");
const editorDrawer = document.querySelector("#editorDrawer");
const editorTitle = document.querySelector("#editorTitle");
const editorMeta = document.querySelector("#editorMeta");
const editorContent = document.querySelector("#editorContent");
const editorClose = document.querySelector("#editorClose");
const editorCancel = document.querySelector("#editorCancel");
const editorSave = document.querySelector("#editorSave");

/* ---------- 全局通知 ---------- */

function showToast(message, type = "info") {
	const toasts = document.querySelector("#toasts");
	const toast = document.createElement("div");
	toast.className = `toast ${type}`;
	toast.textContent = message;
	toasts.appendChild(toast);
	requestAnimationFrame(() => toast.classList.add("show"));
	setTimeout(() => {
		toast.classList.remove("show");
		setTimeout(() => toast.remove(), 300);
	}, 3400);
}

function setButtonLoading(button, loadingText, idleText) {
	button.disabled = true;
	button.textContent = loadingText;
	button.dataset.idleText = idleText;
}

function clearButtonLoading(button) {
	button.disabled = false;
	button.textContent = button.dataset.idleText || button.textContent;
	delete button.dataset.idleText;
}

/* ---------- 基础请求 ---------- */

function authHeaders() {
	return { Authorization: `Bearer ${state.activeToken}` };
}

async function request(url, options = {}) {
	const response = await fetch(url, options);
	const body = await response.json();
	if (!response.ok) {
		const message = Array.isArray(body.message)
			? body.message.join("；")
			: body.message || `请求失败：${response.status}`;
		throw new Error(message);
	}
	return body;
}

async function loadUsers() {
	state.users = await request("api/session/users");
	userSelect.innerHTML = state.users
		.map((user) => `<option value="${user.token}">${user.tenantName} · ${user.name} · ${user.departmentName}</option>`)
		.join("");
	state.activeToken = state.users[0]?.token || "";
	userSelect.value = state.activeToken;
}

async function checkHealth() {
	try {
		const result = await request("api/health");
		health.textContent = result.status === "ok" ? "运行中" : "异常";
		health.classList.remove("offline");
	} catch {
		health.textContent = "服务离线";
		health.classList.add("offline");
	}
}

async function loadDocuments({ quiet = false } = {}) {
	if (!state.activeToken) return;
	refreshButton.disabled = true;
	refreshButton.textContent = "刷新中…";
	try {
		state.documents = await request("api/documents", {
			headers: authHeaders(),
		});
		renderDocuments();
	} catch (error) {
		if (!quiet) showToast(`加载文档列表失败：${error.message}`, "error");
	} finally {
		refreshButton.disabled = false;
		refreshButton.textContent = "刷新";
	}
}

function currentUser() {
	return state.users.find((user) => user.token === state.activeToken);
}

/* ---------- 文档列表 ---------- */

const EDIT_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';

function renderDocuments() {
	const user = currentUser();
	if (state.documents.length === 0) {
		documentsNode.innerHTML = '<div class="empty">当前身份暂无可访问文档<br /><span style="font-size:12px">可先运行 scripts/seed.py 导入样例文档，或由管理员上传</span></div>';
		return;
	}

	documentsNode.innerHTML = state.documents
		.map((document) => `
			<article class="document-card">
				<h2>${escapeHtml(document.title)}</h2>
				<div class="meta">v${document.version} · ${document.chunkCount} chunks · ${document.visibility === "company" ? "全员可见" : escapeHtml(document.departmentId)}</div>
				${user?.role === "admin" ? `
					<div class="actions">
						<button class="icon-btn" data-edit="${document.documentId}" title="预览 / 编辑 Markdown">${EDIT_ICON} 编辑</button>
						<button class="secondary" data-update="${document.documentId}">发布新版本</button>
						<button class="danger" data-delete="${document.documentId}">删除</button>
					</div>
				` : ""}
			</article>
		`)
		.join("");
}

function escapeHtml(text) {
	return String(text ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function resetDocumentForm() {
	document.querySelector("#editingDocumentId").value = "";
	document.querySelector("#documentTitle").value = "";
	document.querySelector("#departmentId").value = "customer-service";
	document.querySelector("#visibility").value = "company";
	document.querySelector("#documentFile").value = "";
	fileHint.textContent = "";
	fileHint.classList.remove("picked");
	saveMessage.textContent = "";
	saveMessage.className = "save-message";
	saveButton.textContent = "保存文档";
}

function showSaveMessage(text, type) {
	saveMessage.textContent = text;
	saveMessage.className = `save-message ${type || ""}`.trim();
}

/* ---------- 文档维护：上传 / 更新 / 删除 ---------- */

fileInput.addEventListener("change", () => {
	const file = fileInput.files[0];
	if (!file) return;
	if (!file.name.toLowerCase().endsWith(".md")) {
		fileHint.textContent = "当前案例只支持 .md 文件，请重新选择";
		fileHint.classList.remove("picked");
		fileInput.value = "";
		return;
	}
	fileHint.textContent = `已选择：${file.name}（${(file.size / 1024).toFixed(1)} KB）`;
	fileHint.classList.add("picked");
});

documentsNode.addEventListener("click", async (event) => {
	const target = event.target.closest("button");
	if (!target) return;

	const editId = target.dataset.edit;
	const updateId = target.dataset.update;
	const deleteId = target.dataset.delete;

	if (editId) {
		await openEditor(editId);
		return;
	}

	if (updateId) {
		const documentItem = state.documents.find((item) => item.documentId === updateId);
		if (!documentItem) return;
		document.querySelector("#editingDocumentId").value = updateId;
		document.querySelector("#documentTitle").value = documentItem.title;
		document.querySelector("#departmentId").value = documentItem.departmentId;
		document.querySelector("#visibility").value = documentItem.visibility;
		saveButton.textContent = "更新文档";
		showSaveMessage(`已进入版本更新模式：将发布《${documentItem.title}》的新版本，请选择新的 Markdown 文件。`, "info");
		showToast(`已进入《${documentItem.title}》的版本更新模式`, "info");
		document.querySelector("#documentFile").scrollIntoView({ behavior: "smooth", block: "center" });
	}

	if (deleteId) {
		const documentItem = state.documents.find((item) => item.documentId === deleteId);
		if (!documentItem) return;
		if (!confirm(`确定删除《${documentItem.title}》吗？\n\n删除后该文档将不再参与检索（历史版本与原始文件会保留）。`)) return;
		const button = target;
		setButtonLoading(button, "删除中…", "删除");
		try {
			const result = await request(`api/documents/${deleteId}`, {
				method: "DELETE",
				headers: authHeaders(),
			});
			showToast(result.reason || "文档已删除", "success");
			await loadDocuments({ quiet: true });
		} catch (error) {
			showToast(`删除失败：${error.message}`, "error");
		} finally {
			clearButtonLoading(button);
		}
	}
});

document.querySelector("#refreshDocuments").addEventListener("click", () => loadDocuments());

userSelect.addEventListener("change", async () => {
	state.activeToken = userSelect.value;
	resetDocumentForm();
	const user = currentUser();
	if (user) showToast(`已切换为：${user.tenantName} · ${user.name}（${user.departmentName}）`, "info");
	await loadDocuments({ quiet: true });
});

documentForm.addEventListener("submit", async (event) => {
	event.preventDefault();

	const file = fileInput.files[0];
	if (!file) {
		showSaveMessage("请先选择 Markdown 文件", "error");
		showToast("请先选择 Markdown 文件", "error");
		fileInput.focus();
		return;
	}
	const title = document.querySelector("#documentTitle").value.trim();
	if (!title) {
		showSaveMessage("请填写文档标题", "error");
		showToast("请填写文档标题", "error");
		document.querySelector("#documentTitle").focus();
		return;
	}

	const documentId = document.querySelector("#editingDocumentId").value;
	const isUpdate = Boolean(documentId);
	const formData = new FormData();
	formData.set("file", file);
	formData.set("title", title);
	formData.set("departmentId", document.querySelector("#departmentId").value.trim());
	formData.set("visibility", document.querySelector("#visibility").value);

	setButtonLoading(saveButton, isUpdate ? "更新中…" : "保存中…", isUpdate ? "更新文档" : "保存文档");
	showSaveMessage(isUpdate ? "正在向量化新版本并发布，文档较大时可能需要 10~30 秒…" : "正在向量化文档并写入知识库，可能需要 10~30 秒…", "info");
	showToast(isUpdate ? "正在发布新版本，请稍候…" : "正在保存文档，请稍候…", "info");

	try {
		const result = await request(documentId ? `api/documents/${documentId}` : "api/documents", {
			method: documentId ? "PUT" : "POST",
			headers: authHeaders(),
			body: formData,
		});
		const message = result.reason || `文档已保存为 v${result.document.version}`;
		showSaveMessage(message, "success");
		showToast(message, "success");
		resetDocumentForm();
		await loadDocuments({ quiet: true });
	} catch (error) {
		showSaveMessage(`保存失败：${error.message}`, "error");
		showToast(`保存失败：${error.message}`, "error");
	} finally {
		clearButtonLoading(saveButton);
	}
});

/* ---------- Markdown 编辑器抽屉 ---------- */

let editingDocument = null;
let originalMarkdown = "";

function isEditorDirty() {
	return editingDocument !== null && editorContent.value !== originalMarkdown;
}

function closeEditor() {
	if (isEditorDirty() && !confirm("内容有未保存的修改，确定关闭吗？")) return;
	editingDocument = null;
	originalMarkdown = "";
	editorContent.value = "";
	editorOverlay.classList.remove("open");
	editorDrawer.classList.remove("open");
	editorDrawer.setAttribute("aria-hidden", "true");
	clearButtonLoading(editorSave);
}

async function openEditor(documentId) {
	const doc = state.documents.find((item) => item.documentId === documentId);
	if (!doc) return;

	editingDocument = doc;
	editorTitle.textContent = doc.title;
	editorMeta.textContent = `v${doc.version} · ${doc.chunkCount} chunks · ${doc.visibility === "company" ? "全员可见" : doc.departmentId} · 加载中…`;
	editorContent.value = "";
	originalMarkdown = "";
	editorOverlay.classList.add("open");
	editorDrawer.classList.add("open");
	editorDrawer.setAttribute("aria-hidden", "false");
	editorSave.disabled = true;
	editorSave.textContent = "加载中…";

	try {
		const raw = await request(`api/documents/${documentId}/raw`, {
			headers: authHeaders(),
		});
		editorContent.value = raw.markdown;
		originalMarkdown = raw.markdown;
		editorMeta.textContent = `v${raw.version} · ${raw.chunkCount} chunks · ${raw.visibility === "company" ? "全员可见" : raw.departmentId} · ${raw.sourcePath}`;
	} catch (error) {
		showToast(`加载 Markdown 原文失败：${error.message}`, "error");
		closeEditor();
		return;
	} finally {
		editorSave.disabled = false;
		editorSave.textContent = "保存并发布新版本";
	}
	editorContent.focus();
}

async function saveEditor() {
	if (!editingDocument) return;
	const markdown = editorContent.value;
	if (!markdown.trim()) {
		showToast("内容不能为空", "error");
		editorContent.focus();
		return;
	}

	const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
	const file = new File([blob], `edit-${editingDocument.documentId}.md`, { type: "text/markdown" });
	const formData = new FormData();
	formData.set("file", file);
	formData.set("title", editingDocument.title);
	formData.set("departmentId", editingDocument.departmentId);
	formData.set("visibility", editingDocument.visibility);

	setButtonLoading(editorSave, "发布中…", "保存并发布新版本");
	try {
		const result = await request(`api/documents/${editingDocument.documentId}`, {
			method: "PUT",
			headers: authHeaders(),
			body: formData,
		});
		const message = result.reason || `已发布为 v${result.document.version}`;
		showToast(message, "success");
		closeEditor();
		await loadDocuments({ quiet: true });
	} catch (error) {
		showToast(`保存失败：${error.message}`, "error");
		clearButtonLoading(editorSave);
	}
}

editorClose.addEventListener("click", closeEditor);
editorCancel.addEventListener("click", closeEditor);
editorOverlay.addEventListener("click", closeEditor);
editorSave.addEventListener("click", saveEditor);
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && editorDrawer.classList.contains("open")) {
		closeEditor();
	}
});

/* ---------- 知识问答 ---------- */

queryForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const question = document.querySelector("#question").value.trim();
	if (!question) return;

	setButtonLoading(sendButton, "检索中…", "发送");

	conversation.querySelector(".empty")?.remove();
	const turn = document.createElement("section");
	turn.className = "turn";
	turn.innerHTML = `<div class="question">${escapeHtml(question)}</div><div class="answer loading">正在检索知识库并核对依据…</div>`;
	conversation.appendChild(turn);
	conversation.scrollTop = conversation.scrollHeight;

	try {
		const result = await request("api/knowledge/query", {
			method: "POST",
			headers: {
				...authHeaders(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ question }),
		});
		turn.innerHTML = renderAnswer(question, result);
		showToast(
			result.status === "answered" ? "已生成有依据的回答" : "知识库资料不足，已拒答",
			result.status === "answered" ? "success" : "info"
		);
	} catch (error) {
		turn.innerHTML = `<div class="question">${escapeHtml(question)}</div><div class="answer error">${escapeHtml(error.message)}</div>`;
		showToast(`问答失败：${error.message}`, "error");
	}
	conversation.scrollTop = conversation.scrollHeight;
	clearButtonLoading(sendButton);
});

function renderAnswer(question, result) {
	const sources = result.sources
		.map((source) => `
			<div class="source-card">
				<strong>${escapeHtml(source.title)}</strong>
				<div class="meta">v${source.version} · Chunk ${source.chunkIndex + 1}</div>
				<p>${escapeHtml(source.content)}</p>
				<code>${escapeHtml(source.chunkId)}</code>
			</div>
		`)
		.join("");
	const candidates = result.pipeline.candidates
		.map((item) => `#${item.rank} ${escapeHtml(item.title)} · ${Number(item.rerankScore ?? 0).toFixed(4)}`)
		.join("<br />");
	return `
		<div class="question">${escapeHtml(question)}</div>
		<div class="answer">${escapeHtml(result.answer)}</div>
		<div class="sources"><strong>引用来源：</strong>${sources || "无"}</div>
		<div class="pipeline">
			<strong>检索链路：</strong>${result.pipeline.recalledCount} 召回 · ${result.pipeline.rerankedCount} 精排 · ${result.pipeline.latencyMs} ms
			<code>${escapeHtml(result.pipeline.permissionFilter)}</code>
			<div>${candidates}</div>
		</div>
	`;
}

async function boot() {
	await Promise.all([loadUsers(), checkHealth()]);
	await loadDocuments({ quiet: true });
}

boot().catch((error) => {
	health.textContent = error.message;
	health.classList.add("offline");
});
