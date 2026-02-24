import { supabase, likePost, unlikePost, isLikedLocally, addComment, getComments } from './post.js';

const PAGE_SIZE = 12;

// ========== データ取得 ==========

/** 投稿一覧取得（is_deleted = false のみ） */
export async function fetchPosts({ offset = 0, orderBy = 'new' } = {}) {
  let query = supabase
    .from('posts')
    .select('*')
    .eq('is_deleted', false)
    .range(offset, offset + PAGE_SIZE - 1);

  if (orderBy === 'likes') {
    query = query.order('likes_count', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) return [];
  return data;
}

// ========== ユーティリティ ==========

function formatDate(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d;
  if (diff < 60000) return 'たった今';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}日前`;
  return d.toLocaleDateString('ja-JP');
}

function tagsHtml(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(t => `<span class="tag">${t.startsWith('#') ? t : '#' + t}</span>`).join('');
}

// ========== 投稿カード ==========

/** 投稿カード生成（認証不要・localStorage でいいね状態を管理） */
export function createPostCard(post) {
  const liked = isLikedLocally(post.id);
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.postId = post.id;
  card.innerHTML = `
    <div class="post-img-wrap">
      <img src="${post.image_url}" alt="${post.cat_name}" loading="lazy" class="post-img">
    </div>
    <div class="post-body">
      <h3 class="post-catname">${post.cat_name}</h3>
      <div class="post-meta">
        <span class="poster-icon" style="font-size:1.1rem;line-height:1">🐾</span>
        <span class="post-username">${post.poster_name || '名無しさん'}</span>
        <span class="post-date">${formatDate(post.created_at)}</span>
      </div>
      <div class="post-tags">${tagsHtml(post.tags)}</div>
      <div class="post-actions">
        <button class="like-btn ${liked ? 'liked' : ''}" data-post-id="${post.id}" data-liked="${liked}" aria-label="いいね">
          <span class="heart-icon">♥</span>
          <span class="like-count">${post.likes_count || 0}</span>
        </button>
      </div>
    </div>
  `;

  card.querySelector('.post-img-wrap').addEventListener('click', () => openModal(post));
  card.querySelector('.like-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleLike(card, post);
  });

  return card;
}

async function handleLike(card, post) {
  const btn = card.querySelector('.like-btn');
  const isLiked = btn.dataset.liked === 'true';
  const countEl = btn.querySelector('.like-count');
  btn.disabled = true;
  try {
    if (isLiked) {
      await unlikePost(post.id);
      btn.dataset.liked = 'false';
      btn.classList.remove('liked');
      countEl.textContent = parseInt(countEl.textContent) - 1;
    } else {
      await likePost(post.id);
      btn.dataset.liked = 'true';
      btn.classList.add('liked', 'like-anim');
      countEl.textContent = parseInt(countEl.textContent) + 1;
      setTimeout(() => btn.classList.remove('like-anim'), 400);
    }
    post.likes_count = parseInt(countEl.textContent);
  } catch (_) {
    showToast('エラーが発生しました', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ========== モーダル ==========

let currentModal = null;

export async function openModal(post) {
  closeModal();
  const liked = isLikedLocally(post.id);
  const comments = await getComments(post.id);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" aria-label="閉じる">✕</button>
      <div class="modal-inner">
        <div class="modal-img-col">
          <img src="${post.image_url}" alt="${post.cat_name}" class="modal-img">
        </div>
        <div class="modal-info-col">
          <div class="modal-profile">
            <span style="font-size:1.6rem;line-height:1">🐾</span>
            <span class="modal-username">${post.poster_name || '名無しさん'}</span>
            <span class="modal-date">${formatDate(post.created_at)}</span>
          </div>
          <h2 class="modal-catname">${post.cat_name}</h2>
          ${post.description ? `<p class="modal-desc">${post.description}</p>` : ''}
          <div class="modal-tags">${tagsHtml(post.tags)}</div>
          <button class="modal-like-btn ${liked ? 'liked' : ''}" data-liked="${liked}">
            <span class="heart-icon">♥</span>
            <span class="modal-like-count">${post.likes_count || 0}</span>
            <span>いいね</span>
          </button>
          <div class="modal-comments">
            <h4>コメント（<span class="comment-count">${comments.length}</span>件）</h4>
            <ul class="comment-list" id="modal-comment-list">
              ${comments.map(c => commentItemHtml(c)).join('')}
            </ul>
            <form class="comment-form" id="modal-comment-form">
              <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap">
                <input type="text" id="comment-poster-name" placeholder="ニックネーム（省略→名無し）" maxlength="20"
                  style="width:170px;flex-shrink:0;border:2px solid var(--border);border-radius:999px;padding:0.4rem 0.75rem;font-size:0.8rem;outline:none;font-family:inherit">
                <input type="text" id="comment-content" placeholder="コメントを入力..." maxlength="200" required
                  style="flex:1;min-width:120px;border:2px solid var(--border);border-radius:999px;padding:0.4rem 0.75rem;font-size:0.85rem;outline:none;font-family:inherit">
              </div>
              <div style="text-align:right">
                <button type="submit" style="background:var(--lavender);color:white;border:none;border-radius:999px;padding:0.4rem 1.25rem;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit">送信</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  overlay.querySelector('.modal-close').addEventListener('click', closeModal);

  // モーダルいいね
  overlay.querySelector('.modal-like-btn').addEventListener('click', async () => {
    const btn = overlay.querySelector('.modal-like-btn');
    const isL = btn.dataset.liked === 'true';
    const countEl = overlay.querySelector('.modal-like-count');
    btn.disabled = true;
    try {
      if (isL) {
        await unlikePost(post.id);
        btn.dataset.liked = 'false'; btn.classList.remove('liked');
        countEl.textContent = parseInt(countEl.textContent) - 1;
      } else {
        await likePost(post.id);
        btn.dataset.liked = 'true'; btn.classList.add('liked', 'like-anim');
        countEl.textContent = parseInt(countEl.textContent) + 1;
        setTimeout(() => btn.classList.remove('like-anim'), 400);
      }
      post.likes_count = parseInt(countEl.textContent);
      // カード側を同期
      const card = document.querySelector(`[data-post-id="${post.id}"]`);
      if (card) {
        const cardBtn = card.querySelector('.like-btn');
        cardBtn.dataset.liked = btn.dataset.liked;
        cardBtn.classList.toggle('liked', btn.dataset.liked === 'true');
        card.querySelector('.like-count').textContent = countEl.textContent;
      }
    } catch (_) { showToast('エラーが発生しました', 'error'); }
    finally { btn.disabled = false; }
  });

  // コメント送信
  overlay.querySelector('#modal-comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = overlay.querySelector('#comment-poster-name');
    const contentInput = overlay.querySelector('#comment-content');
    const content = contentInput.value.trim();
    if (!content) return;
    const posterName = nameInput.value.trim() || '名無しさん';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const comment = await addComment(post.id, posterName, content);
      overlay.querySelector('#modal-comment-list').insertAdjacentHTML('beforeend', commentItemHtml(comment));
      contentInput.value = '';
      const countEl = overlay.querySelector('.comment-count');
      countEl.textContent = parseInt(countEl.textContent) + 1;
    } catch (_) { showToast('コメントに失敗しました', 'error'); }
    finally { submitBtn.disabled = false; }
  });

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('show'));
  currentModal = overlay;
}

function commentItemHtml(c) {
  const initial = (c.poster_name || '名')[0];
  return `<li class="comment-item">
    <div class="avatar avatar-initials" style="width:28px;height:28px;font-size:11px;flex-shrink:0">${initial}</div>
    <div class="comment-body">
      <span class="comment-username">${c.poster_name || '名無しさん'}</span>
      <span class="comment-text">${c.content}</span>
    </div>
  </li>`;
}

export function closeModal() {
  if (!currentModal) return;
  currentModal.classList.remove('show');
  setTimeout(() => { currentModal?.remove(); currentModal = null; }, 250);
  document.body.style.overflow = '';
}

// ========== トースト ==========

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========== 紙吹雪 ==========

export function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    w: Math.random() * 10 + 5,
    h: Math.random() * 6 + 3,
    color: ['#FF6B9D', '#C084FC', '#FCD34D', '#34D399', '#60A5FA'][Math.floor(Math.random() * 5)],
    rot: Math.random() * 360,
    vy: Math.random() * 3 + 2,
    vx: (Math.random() - 0.5) * 2,
    vr: (Math.random() - 0.5) * 6,
  }));

  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    });
    if (pieces.some(p => p.y < canvas.height)) {
      frame = requestAnimationFrame(draw);
    } else { canvas.remove(); }
  }
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, 3500);
}
