# 🐱 ねこずかん - セットアップガイド

猫の図鑑＆フォトコミュニティサイトです。**ログイン不要**で投稿・いいね・コメントができます。

---

## ファイル構成

```
catcommunity/
├── index.html              # メインページ（図鑑＋コミュニティフィード）
├── css/
│   └── style.css           # スタイルシート
├── js/
│   ├── config.js           # ← Supabase URL・Anon Key を設定するファイル
│   ├── post.js             # 投稿・いいね・コメント・Storage アップロード
│   └── feed.js             # フィード表示・モーダル・トースト・紙吹雪
├── pages/
│   ├── post.html           # 写真投稿ページ（ログイン不要）
│   └── cat.html            # 猫品種詳細ページ
├── images/                 # 図鑑用ローカル画像
└── README.md               # このファイル
```

---

## Supabase 初期設定手順

### 1. アカウント作成・プロジェクト作成

1. [https://supabase.com](https://supabase.com) にアクセス
2. 「Start your project」→ GitHub アカウントでサインアップ
3. 「New project」をクリック
4. プロジェクト名（例：`nekozukan`）・パスワード・リージョン（Tokyo）を設定して作成

### 2. js/config.js に接続情報を設定

ダッシュボードの **Settings → API** を開き、以下を `js/config.js` に貼り付けます：

```js
export const SUPABASE_URL = 'https://あなたのプロジェクトID.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGci...（anon keyをここに貼り付け）';
```

### 3. テーブル作成（SQL Editor で実行）

ダッシュボード左メニューの **SQL Editor** → 「New query」で以下を実行：

```sql
-- 既存テーブルがある場合は先に削除
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS posts;

-- 投稿テーブル（ログイン不要版）
CREATE TABLE posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  cat_name TEXT NOT NULL,
  poster_name TEXT NOT NULL DEFAULT '名無しさん',
  description TEXT,
  tags TEXT[],
  likes_count INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- いいねテーブル（ブラウザ固有IDで重複防止）
CREATE TABLE likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, ip_hash)
);

-- コメントテーブル（ログイン不要版）
CREATE TABLE comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  poster_name TEXT NOT NULL DEFAULT '名無しさん',
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

続けて **いいね数の増減 RPC 関数** を作成します：

```sql
-- いいね数インクリメント
CREATE OR REPLACE FUNCTION increment_likes(post_id UUID)
RETURNS void AS $$
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = post_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- いいね数デクリメント
CREATE OR REPLACE FUNCTION decrement_likes(post_id UUID)
RETURNS void AS $$
  UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = post_id;
$$ LANGUAGE sql SECURITY DEFINER;
```

### 4. RLS（Row Level Security）ポリシー設定

```sql
-- RLS 有効化
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 投稿：is_deleted = false のみ閲覧可、誰でも投稿可
CREATE POLICY "posts_select" ON posts FOR SELECT USING (is_deleted = false);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (true);

-- いいね：誰でも閲覧・追加・削除可
CREATE POLICY "likes_select" ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON likes FOR INSERT WITH CHECK (true);
CREATE POLICY "likes_delete" ON likes FOR DELETE USING (true);

-- コメント：誰でも閲覧・投稿可
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (true);
```

### 5. Storage バケット「cat-photos」の作成

1. ダッシュボード左メニューの **Storage** をクリック
2. 「New bucket」をクリック
3. バケット名：`cat-photos`
4. **「Public bucket」にチェックを入れる**
5. 「Save」をクリック

続けて Storage ポリシーを SQL Editor で実行：

```sql
-- 誰でもアップロード可
CREATE POLICY "storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cat-photos');

-- 誰でも閲覧可
CREATE POLICY "storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'cat-photos');
```

### 6. ローカルで動かす方法

`file://` プロトコルでは ES Modules が動作しないため、簡易サーバーが必要です。

**VS Code の Live Server 拡張機能（推奨）**
1. 拡張機能「Live Server」をインストール
2. `index.html` を右クリック → 「Open with Live Server」
3. `http://127.0.0.1:5500` でアクセス

**Python を使う場合**
```bash
python -m http.server 8080 --directory D:\catcommunity
# → http://localhost:8080
```

**Node.js を使う場合**
```bash
npx serve D:\catcommunity
# → http://localhost:3000
```

---

## 機能一覧

| 機能 | 説明 |
|------|------|
| 猫図鑑 | 主要猫種を絵文字・写真カードで表示 |
| 写真投稿 | **ログイン不要**・ドラッグ&ドロップ対応・5MB制限・プレビュー付き |
| ニックネーム | 投稿・コメント時に任意入力（省略すると「名無しさん」） |
| フィード表示 | 新着順・いいね順切り替え、12件ずつロード |
| いいね | **ログイン不要**・同一ブラウザでの二重いいね防止（localStorage） |
| コメント | **ログイン不要**・モーダル内でリアルタイム投稿 |
| 投稿詳細モーダル | 写真拡大・説明・タグ・いいね・コメント一覧 |
| トースト通知 | 操作結果を画面右下に表示 |
| 紙吹雪 | 投稿成功時にアニメーション |
| レスポンシブ対応 | モバイルファースト設計 |

---

## 管理者機能について

投稿の削除は Supabase ダッシュボードの **Table Editor** から直接行えます。

`posts` テーブルの `is_deleted` カラムを `true` に設定すると、フィードから非表示になります（物理削除なし）。

---

## トラブルシューティング

**「Failed to fetch」エラー**
→ `js/config.js` の URL と Anon Key が正しく設定されているか確認

**画像がアップロードできない**
→ Storage バケット `cat-photos` が Public で作成されているか確認
→ Storage ポリシーが設定されているか確認

**いいねできない**
→ `increment_likes` / `decrement_likes` 関数が作成されているか確認：
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('increment_likes', 'decrement_likes');
```

**同じブラウザで二重いいねできてしまう**
→ ブラウザの localStorage を確認（`nekozukan_liked` キー）
→ プライベートウィンドウでは別の visitor_id が生成されるため、1人でも複数回押せる仕様です
