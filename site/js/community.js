// 커뮤니티 게시판: 목록(?), 글쓰기(?new=1), 상세(?id=N)를 쿼리스트링으로 전환한다.
// 사용자 입력은 항상 textContent로 렌더링해 XSS를 방지한다.
(function () {
  function formatDate(unixSeconds) {
    const d = new Date(unixSeconds * 1000);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(
      d.getHours()
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function showSection(id) {
    ['listView', 'writeView', 'detailView'].forEach((sec) => {
      const el = document.getElementById(sec);
      if (el) el.style.display = sec === id ? '' : 'none';
    });
  }

  async function api(path, options) {
    const res = await fetch(path, { credentials: 'include', ...options });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* no body */
    }
    if (!res.ok) throw new Error((data && data.error) || `요청 실패 (${res.status})`);
    return data;
  }

  async function renderList() {
    showSection('listView');
    const listEl = document.getElementById('postList');
    const countEl = document.getElementById('postCount');
    clearNode(listEl);
    countEl.textContent = '불러오는 중…';

    let posts = [];
    try {
      const data = await api('/api/posts');
      posts = data.posts || [];
    } catch (e) {
      countEl.textContent = '게시글을 불러오지 못했습니다.';
      return;
    }

    countEl.textContent = `전체 ${posts.length}개`;

    if (posts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const p = document.createElement('p');
      p.textContent = '아직 등록된 글이 없습니다. 첫 글을 남겨보세요!';
      empty.appendChild(p);
      listEl.appendChild(empty);
      return;
    }

    posts.forEach((post) => {
      const row = document.createElement('a');
      row.className = 'post-row';
      row.href = `community.html?id=${post.id}`;

      const title = document.createElement('div');
      title.className = 'post-row-title';
      title.textContent = post.title;

      const meta = document.createElement('div');
      meta.className = 'post-row-meta';
      const author = document.createElement('span');
      author.textContent = post.author_name;
      const date = document.createElement('span');
      date.textContent = formatDate(post.created_at);
      const comments = document.createElement('span');
      comments.textContent = `댓글 ${post.comment_count}`;
      meta.appendChild(author);
      meta.appendChild(date);
      meta.appendChild(comments);

      row.appendChild(title);
      row.appendChild(meta);
      listEl.appendChild(row);
    });
  }

  function renderWrite() {
    if (!window.JJHLAuth.requireLogin('글쓰기는 로그인 후 이용할 수 있습니다.')) {
      history.replaceState(null, '', 'community.html');
      renderList();
      return;
    }
    showSection('writeView');
    document.getElementById('postTitleInput').value = '';
    document.getElementById('postBodyInput').value = '';
  }

  async function submitPost() {
    const title = document.getElementById('postTitleInput').value.trim();
    const body = document.getElementById('postBodyInput').value.trim();
    if (!title || !body) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    try {
      const created = await api('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      window.location.href = `community.html?id=${created.id}`;
    } catch (e) {
      alert(e.message);
    }
  }

  function renderCommentForm(postId) {
    const wrap = document.getElementById('commentFormWrap');
    clearNode(wrap);
    const user = window.JJHLAuth.getUser();

    if (!user) {
      const note = document.createElement('div');
      note.className = 'login-required-note';
      note.textContent = '댓글을 작성하려면 우측 상단에서 로그인해주세요.';
      wrap.appendChild(note);
      return;
    }

    const field = document.createElement('div');
    field.className = 'form-field';
    const textarea = document.createElement('textarea');
    textarea.className = 'form-textarea';
    textarea.style.minHeight = '90px';
    textarea.maxLength = 1000;
    textarea.placeholder = '댓글을 입력하세요';
    field.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary';
    submitBtn.type = 'button';
    submitBtn.textContent = '댓글 등록';
    submitBtn.addEventListener('click', async () => {
      const body = textarea.value.trim();
      if (!body) return;
      try {
        await api(`/api/posts/${postId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        await renderDetail(postId);
      } catch (e) {
        alert(e.message);
      }
    });
    actions.appendChild(submitBtn);

    wrap.appendChild(field);
    wrap.appendChild(actions);
  }

  async function renderDetail(id) {
    showSection('detailView');
    const detailEl = document.getElementById('postDetail');
    const commentListEl = document.getElementById('commentList');
    const titleEl = document.getElementById('commentSectionTitle');

    let data;
    try {
      data = await api(`/api/posts/${id}`);
    } catch (e) {
      clearNode(detailEl);
      clearNode(commentListEl);
      const p = document.createElement('p');
      p.textContent = '게시글을 찾을 수 없습니다.';
      detailEl.appendChild(p);
      return;
    }

    const { post, comments } = data;

    // fetch가 끝난 직후, DOM을 비우고 곧바로 새 내용을 채운다 (그 사이 await 없음).
    // renderDetail은 초기 라우팅과 로그인 상태 변경(onChange) 양쪽에서 겹쳐 호출될 수 있어,
    // await 이전에 미리 비우면 두 호출의 내용이 함께 쌓이는 경쟁 상태가 생긴다.
    clearNode(detailEl);
    clearNode(commentListEl);

    const titleDiv = document.createElement('div');
    titleDiv.className = 'post-detail-title';
    titleDiv.textContent = post.title;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'post-detail-meta';
    const author = document.createElement('span');
    author.textContent = post.author_name;
    const date = document.createElement('span');
    date.textContent = formatDate(post.created_at);
    metaDiv.appendChild(author);
    metaDiv.appendChild(date);

    const user = window.JJHLAuth.getUser();
    if (user && (user.id === post.user_id || user.isAdmin)) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-secondary';
      delBtn.type = 'button';
      delBtn.style.marginLeft = 'auto';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
          await api(`/api/posts/${id}`, { method: 'DELETE' });
          window.location.href = 'community.html';
        } catch (e) {
          alert(e.message);
        }
      });
      metaDiv.style.display = 'flex';
      metaDiv.appendChild(delBtn);
    }

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'post-detail-body';
    bodyDiv.textContent = post.body;

    detailEl.appendChild(titleDiv);
    detailEl.appendChild(metaDiv);
    detailEl.appendChild(bodyDiv);

    titleEl.textContent = `댓글 ${comments.length}`;

    comments.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      const cMeta = document.createElement('div');
      cMeta.className = 'comment-meta';
      const cAuthor = document.createElement('span');
      cAuthor.textContent = c.author_name;
      const cDate = document.createElement('span');
      cDate.textContent = formatDate(c.created_at);
      cMeta.appendChild(cAuthor);
      cMeta.appendChild(cDate);
      const cBody = document.createElement('div');
      cBody.className = 'comment-body';
      cBody.textContent = c.body;
      item.appendChild(cMeta);
      item.appendChild(cBody);
      commentListEl.appendChild(item);
    });

    renderCommentForm(id);
  }

  function route() {
    const id = getParam('id');
    if (id) {
      renderDetail(id);
    } else if (getParam('new') === '1') {
      renderWrite();
    } else {
      renderList();
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // /api/me 조회가 끝나기 전에는 로그인 여부를 알 수 없으므로,
    // 로그인 상태에 따라 분기하는 최초 라우팅(예: ?new=1)은 JJHLAuth.ready를 기다린 뒤 수행한다.
    await window.JJHLAuth.ready;
    route();

    document.getElementById('newPostBtn').addEventListener('click', () => {
      if (!window.JJHLAuth.requireLogin('글쓰기는 로그인 후 이용할 수 있습니다.')) return;
      history.pushState(null, '', 'community.html?new=1');
      renderWrite();
    });
    document.getElementById('cancelWriteBtn').addEventListener('click', () => {
      history.pushState(null, '', 'community.html');
      renderList();
    });
    document.getElementById('backToListBtn').addEventListener('click', () => {
      history.pushState(null, '', 'community.html');
      renderList();
    });
    document.getElementById('submitPostBtn').addEventListener('click', submitPost);

    window.JJHLAuth.onChange(() => {
      // 로그인 상태가 바뀌면 상세 화면의 삭제 버튼/댓글 폼을 다시 그린다
      const id = getParam('id');
      if (id) renderDetail(id);
    });
  });
})();
