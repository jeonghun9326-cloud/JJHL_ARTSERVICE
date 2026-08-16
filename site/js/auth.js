// 아이디/비밀번호 계정 상태를 헤더의 #authArea에 렌더링하고, 다른 페이지 스크립트가
// 로그인 여부를 확인할 수 있도록 window.JJHLAuth를 제공한다.
// 결제/소유 아이템이 없는 사이트라 이메일 인증 없이 아이디/비밀번호만으로 가입한다.
(function () {
  let currentUser = null;
  const listeners = [];
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(currentUser);
      } catch (e) {
        console.error(e);
      }
    });
  }

  async function fetchMe() {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) {
        currentUser = null;
        return null;
      }
      const data = await res.json();
      currentUser = data.user || null;
      return currentUser;
    } catch (e) {
      currentUser = null;
      return null;
    }
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // 헤더 폭이 화면 크기와 무관하게 항상 일정하도록, 로그인 전 상태도
  // 로그인 후 상태(사용자 칩 + 드롭다운)와 같은 패턴으로 만든다:
  // 버튼 하나만 노출하고, 클릭하면 로그인/회원가입 패널이 드롭다운으로 열린다.
  function renderLoggedOut(container) {
    clearNode(container);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'auth-login-btn';
    toggleBtn.textContent = '로그인';

    const panel = document.createElement('div');
    panel.className = 'auth-panel';

    const form = document.createElement('form');
    form.className = 'auth-form';

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.className = 'form-input auth-id-input';
    idInput.placeholder = '아이디';
    idInput.maxLength = 20;
    idInput.autocomplete = 'username';

    const pwInput = document.createElement('input');
    pwInput.type = 'password';
    pwInput.className = 'form-input auth-pw-input';
    pwInput.placeholder = '비밀번호';
    pwInput.autocomplete = 'current-password';

    const actions = document.createElement('div');
    actions.className = 'auth-form-actions';

    const loginBtn = document.createElement('button');
    loginBtn.type = 'submit';
    loginBtn.className = 'btn-primary auth-login-submit';
    loginBtn.textContent = '로그인';

    const signupBtn = document.createElement('button');
    signupBtn.type = 'button';
    signupBtn.className = 'btn-secondary auth-signup-btn';
    signupBtn.textContent = '회원가입';

    actions.appendChild(loginBtn);
    actions.appendChild(signupBtn);

    const error = document.createElement('div');
    error.className = 'auth-error';

    form.appendChild(idInput);
    form.appendChild(pwInput);
    form.appendChild(actions);
    panel.appendChild(form);
    panel.appendChild(error);

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) idInput.focus();
    });
    document.addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', (e) => e.stopPropagation());

    async function submitAuth(endpoint) {
      const id = idInput.value.trim();
      const password = pwInput.value;
      error.textContent = '';
      if (!id || !password) {
        error.textContent = '아이디와 비밀번호를 모두 입력해주세요.';
        return;
      }

      loginBtn.disabled = true;
      signupBtn.disabled = true;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '요청에 실패했습니다');
        currentUser = data.user || null;
        render();
        notify();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        loginBtn.disabled = false;
        signupBtn.disabled = false;
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitAuth('/api/auth/login');
    });
    signupBtn.addEventListener('click', () => submitAuth('/api/auth/signup'));

    container.appendChild(toggleBtn);
    container.appendChild(panel);
  }

  function renderLoggedIn(container, user) {
    clearNode(container);

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'user-chip';
    chip.id = 'userChipBtn';

    const avatar = document.createElement('span');
    avatar.className = 'user-avatar-fallback';
    avatar.textContent = (user.id || '?').charAt(0).toUpperCase();
    chip.appendChild(avatar);

    const name = document.createElement('span');
    name.className = 'user-chip-name';
    name.textContent = user.id || '사용자';
    chip.appendChild(name);

    if (user.isAdmin) {
      const badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = '관리자';
      chip.appendChild(badge);
    }

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.id = 'userMenu';

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.textContent = '로그아웃';
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      currentUser = null;
      menu.classList.remove('open');
      render();
      notify();
    });
    menu.appendChild(logoutBtn);

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));

    container.appendChild(chip);
    container.appendChild(menu);
  }

  function render() {
    const container = document.getElementById('authArea');
    if (!container) return;
    if (currentUser) {
      renderLoggedIn(container, currentUser);
    } else {
      renderLoggedOut(container);
    }
  }

  window.JJHLAuth = {
    getUser: () => currentUser,
    onChange: (fn) => listeners.push(fn),
    // 페이지 로드 시 최초 로그인 상태 확인(/api/me)이 끝날 때까지 기다리는 Promise.
    // 로그인 여부에 따라 분기하는 초기 렌더링(예: ?new=1 글쓰기 접근 제어)은
    // 이 Promise를 기다린 뒤 판단해야 currentUser가 아직 null인 시점에
    // "로그인 필요"로 잘못 판단하는 경쟁 상태를 피할 수 있다.
    ready: readyPromise,
    requireLogin: (message) => {
      if (currentUser) return true;
      alert(message || '로그인이 필요한 기능입니다. 우측 상단에서 로그인해주세요.');
      return false;
    },
  };

  async function boot() {
    await fetchMe();
    render();
    notify();
    resolveReady();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
