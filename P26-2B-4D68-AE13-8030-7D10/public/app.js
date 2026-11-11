const state = {
  user: null,
  articles: [],
  rooms: [],
  author: null,
  roomId: null,
  editingId: null,
  currentArticle: null,
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const fallbackAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Erro ${response.status}`);
  return data;
}

function setMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
}

function safeLink(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(text) {
  const tokenPattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*.+?\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let html = "";
  let lastIndex = 0;
  for (const match of text.matchAll(tokenPattern)) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      const href = link ? safeLink(link[2]) : null;
      html += href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link[1])}</a>`
        : escapeHtml(token);
    } else if (token.startsWith("**")) {
      html += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else if (token.startsWith("`")) {
      html += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else {
      html += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    }
    lastIndex = match.index + token.length;
  }
  return html + escapeHtml(text.slice(lastIndex));
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(`<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (code !== null) {
        blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      } else {
        code = [];
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`);
    } else if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push("<hr>");
    } else if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((unordered || ordered)[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  if (code !== null) blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return blocks.join("\n");
}

function formatDate(value) {
  if (!value) return "Agora";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function updateAuthUI() {
  byId("loginLink").hidden = Boolean(state.user);
  byId("logoutButton").hidden = !state.user;
  byId("profileChip").hidden = !state.user;
  byId("myArticlesButton").hidden = !state.user;
  byId("newArticleButton").hidden = !state.user;
  byId("newRoomButton").hidden = !state.user;
  byId("aboutWriteButton").hidden = !state.user;
  if (state.user) {
    byId("profileChip").textContent = `Olá, ${state.user.username}`;
    byId("profileChip").title = state.user.username;
  }
}

function updateURL() {
  const url = new URL(location.href);
  url.searchParams.delete("author");
  url.searchParams.delete("room");
  if (state.author) url.searchParams.set("author", state.author.user_id);
  if (state.roomId) url.searchParams.set("room", state.roomId);
  history.replaceState({}, "", url);
}

async function loadAuth() {
  const result = await api("/api/auth/me");
  state.user = result.user;
  updateAuthUI();
}

async function loadRooms() {
  const result = await api("/api/rooms");
  state.rooms = result.rooms;
  renderRooms();
  renderRoomOptions();
}

function renderRooms() {
  const container = byId("roomList");
  container.replaceChildren();
  if (!state.rooms.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Ainda não há salas. Crie a primeira!";
    container.append(empty);
    return;
  }
  for (const room of state.rooms) {
    const row = document.createElement("div");
    row.className = `room-item${String(state.roomId) === String(room.id) ? " selected" : ""}`;
    const name = document.createElement("button");
    name.className = "room-name";
    name.type = "button";
    name.innerHTML = `<span class="room-symbol" aria-hidden="true">${room.visibility === "private" ? "◆" : "#"}</span><span>${escapeHtml(room.name)}</span>`;
    name.addEventListener("click", () => {
      if (room.visibility === "private" && !room.is_member) {
        setMessage(byId("roomMessage"), "Informe o ID e código de convite para participar.");
        byId("roomInvite").value = room.id;
        byId("roomInvite").focus();
        return;
      }
      state.roomId = String(room.id);
      state.author = null;
      updateURL();
      loadArticles();
      renderRooms();
    });
    const controls = document.createElement("span");
    controls.className = "room-controls";
    const count = document.createElement("span");
    count.className = "room-count";
    count.textContent = `${room.member_count} membros`;
    controls.append(count);
    if (state.user && !room.is_member) {
      const join = document.createElement("button");
      join.className = "room-join";
      join.type = "button";
      join.textContent = room.visibility === "public" ? "Entrar" : "Convite";
      join.addEventListener("click", () => {
        if (room.visibility === "private") {
          byId("roomInvite").value = room.id;
          byId("inviteCode").focus();
          setMessage(byId("roomMessage"), "Cole o código de convite para entrar nesta sala.");
        } else {
          joinRoom(room.id, "");
        }
      });
      controls.append(join);
    }
    row.append(name, controls);
    container.append(row);
  }
}

function renderRoomOptions() {
  const select = byId("articleRoom");
  const selected = select.value;
  select.replaceChildren(new Option("Página pública do blog", ""));
  for (const room of state.rooms.filter((item) => item.is_member || item.visibility === "public")) {
    select.add(new Option(`${room.name} · ${room.visibility === "private" ? "privada" : "pública"}`, room.id));
  }
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderArticles() {
  const list = byId("articleList");
  list.replaceChildren();
  if (!state.articles.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.author
      ? "Este autor ainda não publicou artigos visíveis para você."
      : state.roomId ? "Esta sala ainda não tem artigos." : "Ainda não há artigos. Seja a primeira pessoa a publicar!";
    list.append(empty);
    return;
  }
  for (const article of state.articles) {
    const card = document.createElement("article");
    card.className = "article-card";
    const meta = document.createElement("div");
    meta.className = "article-meta";
    const author = document.createElement("button");
    author.className = "author-button";
    author.type = "button";
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = article.author_avatar || fallbackAvatar;
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.referrerPolicy = "no-referrer";
    const authorName = document.createElement("span");
    authorName.textContent = article.author_name;
    author.append(avatar, authorName);
    author.addEventListener("click", () => showAuthor(article.author_id));
    const date = document.createElement("span");
    date.className = "meta-dot";
    date.textContent = "·";
    const dateText = document.createElement("time");
    dateText.textContent = formatDate(article.created_at);
    dateText.dateTime = article.created_at || "";
    meta.append(author, date, dateText);
    if (article.room_name) {
      const tag = document.createElement("span");
      tag.className = `room-tag${article.room_visibility === "private" ? " private" : ""}`;
      tag.textContent = `${article.room_visibility === "private" ? "◆" : "#"} ${article.room_name}`;
      meta.append(tag);
    }
    const title = document.createElement("button");
    title.className = "article-title";
    title.type = "button";
    title.textContent = article.title;
    title.addEventListener("click", () => openArticle(article.id));
    const excerpt = document.createElement("p");
    excerpt.className = "article-excerpt";
    excerpt.textContent = article.body.replace(/[`*_#>\[\]()]/g, "").replace(/\s+/g, " ").slice(0, 250);
    const actions = document.createElement("div");
    actions.className = "article-actions";
    const like = document.createElement("button");
    like.className = `action-button${article.liked ? " liked" : ""}`;
    like.type = "button";
    like.dataset.action = "like";
    like.dataset.id = article.id;
    like.textContent = `${article.liked ? "♥" : "♡"} ${article.like_count || 0}`;
    const comments = document.createElement("button");
    comments.className = "action-button";
    comments.type = "button";
    comments.textContent = `◷ ${article.comment_count || 0} comentários`;
    comments.addEventListener("click", () => openArticle(article.id));
    actions.append(like, comments);
    if (state.user?.userId === article.author_id) {
      const edit = document.createElement("button");
      edit.className = "action-button owner-action";
      edit.type = "button";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => editArticle(article));
      const remove = document.createElement("button");
      remove.className = "action-button owner-action";
      remove.type = "button";
      remove.textContent = "Excluir";
      remove.addEventListener("click", () => deleteArticle(article.id));
      actions.append(edit, remove);
    }
    card.append(meta, title, excerpt, actions);
    list.append(card);
  }
}

async function loadArticles() {
  const list = byId("articleList");
  list.innerHTML = '<div class="empty-state">Carregando artigos...</div>';
  const params = new URLSearchParams();
  if (state.author) params.set("author", state.author.user_id);
  if (state.roomId) params.set("room", state.roomId);
  try {
    const result = await api(`/api/articles${params.size ? `?${params}` : ""}`);
    state.articles = result.articles;
    byId("feedHeading").textContent = state.author
      ? `Artigos de ${state.author.username}`
      : state.roomId ? state.rooms.find((room) => String(room.id) === String(state.roomId))?.name || "Artigos da sala"
        : "Artigos recentes";
    byId("feedEyebrow").textContent = state.author ? "PÁGINA DO AUTOR" : state.roomId ? "CONVERSA EM GRUPO" : "DA COMUNIDADE";
    byId("clearFilterButton").hidden = !state.author && !state.roomId;
    renderArticles();
  } catch (error) {
    list.replaceChildren();
    const failure = document.createElement("div");
    failure.className = "empty-state";
    failure.textContent = `Não foi possível carregar os artigos: ${error.message}`;
    list.append(failure);
  }
}

async function showAuthor(authorId) {
  try {
    const result = await api(`/api/authors/${encodeURIComponent(authorId)}`);
    state.author = result.author;
    state.roomId = null;
    updateURL();
    await loadArticles();
    window.scrollTo({ top: byId("feedHeading").getBoundingClientRect().top + scrollY - 30, behavior: "smooth" });
  } catch (error) {
    window.alert(error.message);
  }
}

function openEditor(article = null) {
  if (!state.user) {
    window.location.href = "/api/auth/discord";
    return;
  }
  state.editingId = article?.id || null;
  byId("editorHeading").textContent = article ? "Editar artigo" : "Escrever artigo";
  byId("publishButton").textContent = article ? "Salvar alterações" : "Publicar artigo";
  byId("articleTitle").value = article?.title || "";
  byId("articleBody").value = article?.body || "";
  byId("articleRoom").value = article?.room_id || "";
  byId("markdownPreview").innerHTML = renderMarkdown(byId("articleBody").value);
  byId("markdownPreview").hidden = true;
  byId("articleBody").hidden = false;
  byId("previewButton").setAttribute("aria-pressed", "false");
  byId("editorPanel").hidden = false;
  setMessage(byId("articleMessage"), "");
  byId("editorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  byId("articleTitle").focus({ preventScroll: true });
}

function editArticle(article) {
  openEditor(article);
}

async function deleteArticle(id) {
  if (!window.confirm("Excluir este artigo e todos os comentários associados?")) return;
  try {
    await api(`/api/articles/${id}`, { method: "DELETE" });
    await loadArticles();
  } catch (error) {
    window.alert(error.message);
  }
}

async function toggleLike(id) {
  try {
    await api(`/api/articles/${id}/like`, { method: "POST", body: "{}" });
    await loadArticles();
  } catch (error) {
    if (error.message.includes("Entre com Discord")) window.location.href = "/api/auth/discord";
    else window.alert(error.message);
  }
}

async function openArticle(id) {
  const article = state.articles.find((item) => String(item.id) === String(id));
  if (!article) return;
  state.currentArticle = article;
  const container = byId("dialogArticle");
  container.replaceChildren();
  const meta = document.createElement("div");
  meta.className = "article-meta";
  const author = document.createElement("button");
  author.className = "author-button";
  author.type = "button";
  author.textContent = article.author_name;
  author.addEventListener("click", () => {
    byId("articleDialog").close();
    showAuthor(article.author_id);
  });
  meta.append(author, document.createTextNode(` · ${formatDate(article.created_at)}`));
  if (article.room_name) meta.append(document.createTextNode(` · ${article.room_visibility === "private" ? "Sala privada" : article.room_name}`));
  const title = document.createElement("h1");
  title.className = "dialog-article-title";
  title.textContent = article.title;
  const content = document.createElement("div");
  content.className = "markdown-body";
  content.innerHTML = renderMarkdown(article.body);
  container.append(meta, title, content);

  const commentsSection = document.createElement("section");
  commentsSection.className = "comments-section";
  const heading = document.createElement("h3");
  heading.textContent = "Conversa";
  const commentsList = document.createElement("div");
  commentsList.className = "comments-list";
  commentsList.textContent = "Carregando comentários...";
  commentsSection.append(heading, commentsList);
  if (state.user) {
    const form = document.createElement("form");
    form.className = "comment-form";
    const input = document.createElement("input");
    input.className = "text-input";
    input.maxLength = 3000;
    input.required = true;
    input.placeholder = "Escreva um comentário...";
    input.setAttribute("aria-label", "Escreva um comentário");
    const submit = document.createElement("button");
    submit.className = "button button-primary button-small";
    submit.textContent = "Comentar";
    form.append(input, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await api(`/api/articles/${article.id}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: input.value }),
        });
        input.value = "";
        await loadComments(article.id, commentsList);
        const current = state.articles.find((item) => String(item.id) === String(article.id));
        if (current) current.comment_count = Number(current.comment_count) + 1;
      } catch (error) {
        window.alert(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    commentsSection.append(form);
  } else {
    const signIn = document.createElement("a");
    signIn.className = "text-link";
    signIn.href = "/api/auth/discord";
    signIn.textContent = "Entre com Discord para comentar";
    commentsSection.append(signIn);
  }
  container.append(commentsSection);
  byId("articleDialog").showModal();
  await loadComments(article.id, commentsList);
}

async function loadComments(articleId, container) {
  try {
    const result = await api(`/api/articles/${articleId}/comments`);
    container.replaceChildren();
    if (!result.comments.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Ainda não há comentários. Comece a conversa.";
      container.append(empty);
      return;
    }
    for (const comment of result.comments) {
      const item = document.createElement("div");
      item.className = "comment-item";
      const avatar = document.createElement("img");
      avatar.className = "avatar";
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      avatar.src = comment.avatar || fallbackAvatar;
      const text = document.createElement("div");
      const heading = document.createElement("div");
      const name = document.createElement("span");
      name.className = "comment-author";
      name.textContent = comment.username;
      const date = document.createElement("time");
      date.className = "comment-date";
      date.textContent = formatDate(comment.created_at);
      heading.append(name, date);
      const body = document.createElement("p");
      body.className = "comment-body";
      body.textContent = comment.body;
      text.append(heading, body);
      item.append(avatar, text);
      container.append(item);
    }
  } catch (error) {
    container.textContent = `Não foi possível carregar os comentários: ${error.message}`;
  }
}

async function joinRoom(id, inviteCode) {
  try {
    await api(`/api/rooms/${id}/join`, {
      method: "POST",
      body: JSON.stringify(inviteCode ? { inviteCode } : {}),
    });
    setMessage(byId("roomMessage"), "Você entrou na sala.", true);
    byId("roomInvite").value = "";
    byId("inviteCode").value = "";
    await loadRooms();
  } catch (error) {
    setMessage(byId("roomMessage"), error.message);
  }
}

byId("newArticleButton").addEventListener("click", () => openEditor());
byId("aboutWriteButton").addEventListener("click", () => openEditor());
byId("closeEditorButton").addEventListener("click", () => { byId("editorPanel").hidden = true; });
byId("previewButton").addEventListener("click", () => {
  const showing = !byId("markdownPreview").hidden;
  byId("markdownPreview").innerHTML = renderMarkdown(byId("articleBody").value);
  byId("markdownPreview").hidden = showing;
  byId("articleBody").hidden = !showing;
  byId("previewButton").textContent = showing ? "Pré-visualizar" : "Voltar ao texto";
  byId("previewButton").setAttribute("aria-pressed", String(!showing));
});
byId("articleBody").addEventListener("input", () => {
  if (!byId("markdownPreview").hidden) byId("markdownPreview").innerHTML = renderMarkdown(byId("articleBody").value);
});
byId("articleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = byId("publishButton");
  submit.disabled = true;
  setMessage(byId("articleMessage"), state.editingId ? "Salvando alterações..." : "Publicando artigo...", true);
  try {
    const payload = JSON.stringify({
      title: byId("articleTitle").value,
      body: byId("articleBody").value,
      roomId: byId("articleRoom").value,
    });
    if (state.editingId) {
      await api(`/api/articles/${state.editingId}`, { method: "PUT", body: payload });
    } else {
      await api("/api/articles", { method: "POST", body: payload });
    }
    byId("articleForm").reset();
    state.editingId = null;
    byId("editorPanel").hidden = true;
    await loadArticles();
  } catch (error) {
    setMessage(byId("articleMessage"), error.message);
  } finally {
    submit.disabled = false;
  }
});
byId("articleList").addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="like"]');
  if (button) toggleLike(button.dataset.id);
});
byId("newRoomButton").addEventListener("click", () => {
  byId("roomCreateForm").hidden = !byId("roomCreateForm").hidden;
  if (!byId("roomCreateForm").hidden) byId("roomName").focus();
});
byId("roomCreateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  try {
    const result = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: byId("roomName").value,
        description: byId("roomDescription").value,
        visibility: byId("roomVisibility").value,
      }),
    });
    byId("roomCreateForm").reset();
    byId("roomCreateForm").hidden = true;
    if (result.inviteCode) {
      byId("inviteResult").hidden = false;
      byId("inviteResult").replaceChildren(
        document.createTextNode(`Sala privada criada. Compartilhe o ID ${result.id} e este código uma única vez:`),
      );
      const code = document.createElement("code");
      code.textContent = result.inviteCode;
      byId("inviteResult").append(code);
    }
    await loadRooms();
    setMessage(byId("roomMessage"), "Sala criada com sucesso.", true);
  } catch (error) {
    setMessage(byId("roomMessage"), error.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});
byId("joinRoomForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = byId("roomInvite").value.trim();
  const code = byId("inviteCode").value.trim();
  if (!/^\d+$/.test(id)) {
    setMessage(byId("roomMessage"), "Informe o ID da sala.");
    return;
  }
  await joinRoom(id, code);
});
byId("clearFilterButton").addEventListener("click", () => {
  state.author = null;
  state.roomId = null;
  updateURL();
  renderRooms();
  loadArticles();
});
byId("myArticlesButton").addEventListener("click", () => {
  if (state.user) showAuthor(state.user.userId);
});
byId("logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    location.href = "/";
  } catch (error) {
    window.alert(`Não foi possível sair: ${error.message}`);
  }
});
byId("closeDialogButton").addEventListener("click", () => byId("articleDialog").close());
byId("articleDialog").addEventListener("click", (event) => {
  if (event.target === byId("articleDialog")) byId("articleDialog").close();
});

async function initialize() {
  const params = new URLSearchParams(location.search);
  state.roomId = params.get("room");
  const authorId = params.get("author");
  try {
    await loadAuth();
    await loadRooms();
    if (authorId) {
      const result = await api(`/api/authors/${encodeURIComponent(authorId)}`);
      state.author = result.author;
    }
    await loadArticles();
  } catch (error) {
    byId("articleList").textContent = `Não foi possível iniciar o blog: ${error.message}`;
  }
}

initialize();
