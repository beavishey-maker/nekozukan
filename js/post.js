import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET = 'cat-photos';

// ========== ビジターID（ブラウザ固有・localStorage保存） ==========
export function getVisitorId() {
  let id = localStorage.getItem('nekozukan_visitor_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('nekozukan_visitor_id', id);
  }
  return id;
}

// ========== ローカルいいね管理 ==========
export function getLikedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem('nekozukan_liked') || '[]'));
  } catch { return new Set(); }
}

function saveLikedSet(set) {
  localStorage.setItem('nekozukan_liked', JSON.stringify([...set]));
}

export function isLikedLocally(postId) {
  return getLikedSet().has(postId);
}

// ========== Storage ==========

/** 画像を Storage にアップロードし公開URLを返す */
export async function uploadImage(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `public/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ========== 投稿 ==========

/** 投稿を作成（認証不要） */
export async function createPost({ imageUrl, catName, posterName, description, tags }) {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      image_url: imageUrl,
      cat_name: catName,
      poster_name: posterName || '名無しさん',
      description: description || null,
      tags: tags?.length ? tags : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ========== いいね ==========

/** いいね追加 */
export async function likePost(postId) {
  const visitorId = getVisitorId();
  const { error } = await supabase
    .from('likes')
    .insert({ post_id: postId, ip_hash: visitorId });
  if (error) throw error;

  await supabase.rpc('increment_likes', { post_id: postId });

  const set = getLikedSet();
  set.add(postId);
  saveLikedSet(set);
}

/** いいね取り消し */
export async function unlikePost(postId) {
  const visitorId = getVisitorId();
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('post_id', postId)
    .eq('ip_hash', visitorId);
  if (error) throw error;

  await supabase.rpc('decrement_likes', { post_id: postId });

  const set = getLikedSet();
  set.delete(postId);
  saveLikedSet(set);
}

// ========== コメント ==========

/** コメント追加（認証不要） */
export async function addComment(postId, posterName, content) {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      poster_name: posterName || '名無しさん',
      content,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** コメント取得 */
export async function getComments(postId) {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data;
}
