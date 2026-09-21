const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
const showMessage = (text, type = 'error') => { const box = document.querySelector('#form-message'); if (box) box.innerHTML = `<p class="${type}">${escapeHtml(text)}</p>`; };

async function loadHome() {
  const grid = document.querySelector('#posts-grid');
  try { const { posts } = await api('/api/posts'); document.querySelector('#app-status').remove(); grid.innerHTML = posts.map(post => `<article class="card"><a class="cover-link" href="/posts/${post.id}"><img class="cover" src="${escapeHtml(post.cover_url)}" alt="Article cover"></a><div class="card-content"><div class="post-top"><span class="tag">ARTICLE</span><small>${post.like_count} likes</small></div><h2><a href="/posts/${post.id}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.body)}</p><div class="post-meta"><span>By ${escapeHtml(post.username)}</span><span>${post.comment_count} comments</span></div></div></article>`).join(''); } catch (error) { document.querySelector('#app-status').textContent = error.message; }
}

function commentMarkup(comment) {
  const ownerActions = comment.canEdit ? `<div class="comment-actions"><button class="edit-comment" data-id="${comment.id}" data-body="${escapeHtml(comment.body)}">Edit</button><button class="danger delete-comment" data-id="${comment.id}">Delete</button><button class="history-button" data-id="${comment.id}">View History</button></div>` : '';
  return `<div class="comment" data-comment-id="${comment.id}"><p>${escapeHtml(comment.body)}</p><small>${escapeHtml(comment.username)} · ${escapeHtml(comment.updated_at)}</small>${ownerActions}</div>`;
}
async function loadPost() {
  const postId = document.body.dataset.postId;
  try { const { post, comments, liked } = await api(`/api/posts/${postId}`); document.querySelector('#app-status').remove(); document.querySelector('#post-root').innerHTML = `<article class="hero"><img class="hero-cover" src="${escapeHtml(post.cover_url)}" alt="Article cover"><div class="hero-content"><span class="tag">ARTICLE</span><h1>${escapeHtml(post.title)}</h1><p class="lead">${escapeHtml(post.body)}</p><div class="post-meta"><span>By ${escapeHtml(post.username)}</span><span>${post.like_count} likes</span></div><button id="like-button" data-liked="${liked}">${liked ? '♥ Unlike' : '♡ Like'}</button></div></article><section><div class="section-heading"><h2>Comments</h2><span class="muted">${comments.length} total</span></div><div id="comments-list">${comments.map(commentMarkup).join('')}</div><form id="comment-form" class="comment-form"><textarea name="body" placeholder="Share your thoughts..." required></textarea><button>Post comment</button></form><div id="history-panel"></div></section>`; bindPost(postId); } catch (error) { document.querySelector('#app-status').textContent = error.message; }
}
function bindPost(postId) {
  document.querySelector('#comment-form').addEventListener('submit', async event => { event.preventDefault(); const body = event.target.body.value; try { await api(`/api/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); location.reload(); } catch (error) { alert(error.message); } });
  document.querySelector('#like-button').addEventListener('click', async event => { const liked = event.target.dataset.liked === 'true'; await api(`/api/posts/${postId}/like`, { method: liked ? 'DELETE' : 'POST' }); event.target.dataset.liked = String(!liked); event.target.textContent = liked ? '♡ Like' : '♥ Unlike'; });
  document.querySelector('#comments-list').addEventListener('click', async event => { const id = event.target.dataset.id; const commentBox = event.target.closest('.comment'); if (event.target.classList.contains('delete-comment') && confirm('Delete this comment?')) { await api(`/api/comments/${id}`, { method: 'DELETE' }); location.reload(); } if (event.target.classList.contains('edit-comment')) { const current = commentBox.querySelector('p').textContent; commentBox.querySelector('.comment-actions').innerHTML = `<form class="inline-edit"><input name="body" value="${escapeHtml(current)}" required><button>Save</button><button type="button" class="cancel-edit">Cancel</button></form>`; commentBox.querySelector('.inline-edit input').focus(); } if (event.target.classList.contains('cancel-edit')) { location.reload(); } if (event.target.classList.contains('history-button')) { const { history } = await api(`/api/comments/${id}/history`); document.querySelector('#history-panel').innerHTML = `<div class="history-panel"><h3>Comment History</h3>${history.map(revision => `<div class="revision"><small>Revision ${revision.revision_number} · ${revision.created_at}</small><p>${escapeHtml(revision.body)}</p></div>`).join('')}</div>`; } });
  document.querySelector('#comments-list').addEventListener('submit', async event => { if (!event.target.classList.contains('inline-edit')) return; event.preventDefault(); const commentBox = event.target.closest('.comment'); const id = commentBox.dataset.commentId; const body = event.target.body.value.trim(); if (!body) return; await api(`/api/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }); location.reload(); });
}

async function bindAuth() {
  const form = document.querySelector('#login-form') || document.querySelector('#register-form');
  if (!form) return;
  form.addEventListener('submit', async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(form)); try { if (form.id === 'register-form') { await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }); location.href = '/login?registered=1'; } else { await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }); location.href = '/'; } } catch (error) { showMessage(error.message); } });
  if (location.search.includes('registered')) showMessage('Account created. Please login to continue.', 'success');
}
document.querySelector('#logout-form')?.addEventListener('submit', async event => { event.preventDefault(); await api('/api/auth/logout', { method: 'POST' }); location.href = '/register'; });
if (document.body.dataset.page === 'home') loadHome();
if (document.body.dataset.page === 'post') loadPost();
if (document.body.dataset.page === 'login' || document.body.dataset.page === 'register') bindAuth();
