# AIシミズ プロジェクトメモリ

> ルール → `CLAUDE.md` / 設計原則 → `session_platform_spec.yaml` / 方法論 → `docs/`

## フィードバック
- [1本ずつ丁寧に実装](feedback_sequential_quality.md) — 並列ではなく順次・高品質で
- [タイトルカード・metaにルビ不要](feedback_no_ruby_on_titles.md) — ルビはnarration/dialogのみ
- [スプライト使い回し不可シリーズ](feedback_sprite_reuse_series.md) — time-travel/popculture/literatureは汎用スプライト不可
- [ゲーム化はシリーズ単位でバッチ](feedback_series_batch.md) — 1シリーズを連続完成させる
- [Codex委譲ワークフロー](feedback_codex_workflow.md) — Opus設計+Codex実装でOpus消費70%削減

## プロジェクト
- [ゲームデザイン原則spec作成](project_game_design_spec.md) — Phase 2完了。Phase 3仕様書作成済み
- [スプライトマッピング全シリーズ](sprite_mapping.md) — キャラ名→スプライトタイプ対応表

## リファレンス
- [ノベルゲーム技術メモ](novel-game.md) — 古い可能性あり、コード確認推奨
- ゲーム: game/ は別gitリポ。`cd game && git push` で nazotoki-game に反映
- ビルド: `cd game && npm run build`（tsc + vite）
- ナレッジベース: `knowledge/index.md` — Karpathy式ドメイン知識ベース（10 wikiページ）
- 取扱説明書: `docs/project-manual.md` — フォルダ全体の取扱説明書
- セットアップ: `docs/setup-guide.md` — ローカル開発環境の構築手順
- ドキュメント索引: `docs/README.md` — 70+ファイルの「知りたいこと→読むファイル」対応表

## 現在の状態（最終更新: 2026-04-11 Session 2）

### 数字サマリー（`ls`で最新確認推奨）
- ゲームYAML: **584本** / 60シリーズ
- シナリオ: apps/madamisu/ に741ディレクトリ + 92ブループリント
- ナレッジベース: **17ファイル**（raw 2 + wiki 12 + infra 3）
- サイトテスト: **9ファイル109テスト**全パス

### ★ 即再開用: 次やること（2026-04-11 Session 2 終了時点）

> **詳細計画: `docs/weekly-plan-2026-04-10.md`**
>
> **✅ Day 1成果コミット済み:**
> - ルートリポ: `edef84b8` feat: Day 1 improvements（898 files）
> - gameリポ: `66058a2` feat(scripts): choice values（71 files）
> - 未プッシュ。サイト/ゲームデプロイ時に push される
>
> **⚠️ 人間が最初にやること（最優先）:**
> 1. **Supabase SQL Editor で `site/supabase-schema-phase164.sql` を実行**
>    — ⚠️ **未実行**。これを実行しないと D1 のテンプレート保存が動かない
> 2. **Codexに2本渡す** — `docs/templates/codex-game-phase3-wave1.md` + `codex-test-strategy-phase1.md`
> 3. **note有料記事を公開**（15分）— `content/note/shimizu-method-note-publish.md`
> 4. **SE音源3つDL**（10分）— 効果音ラボから correct/wrong/decision
> 5. **別教員にセッション依頼**（15分）— 4月中に2-3回。ポートフォリオ必須
>
> **AIが次にやること（優先順）:**
> 1. **サイトデプロイ**（`/deploy-site`）— Supabase SQL実行後、人間承認を得てから
> 2. **ゲームデプロイ**（`/deploy-game`）— choice value改善を本番反映
> 3. **Codex成果物のレビュー＆マージ**（ブランチが返ってきたら）
>    - `codex/game-phase3-wave1` / `codex/test-phase1`
> 4. **追加テスト拡大**（余力あれば）
>    - `site/src/lib/` 未テストpure-function群（monthly-comparison, term-comparison等）
>    - 参考パターン: `site/tests/lib/session-insights.test.ts`
>
> **画像生成方針（決定済み・保留中）:** 詳細 → `memory/image-pipeline.md`
>
> **⚠️ MCP再起動タスク（2026-04-11 追加）:**
> `.mcp.json`（codex stdio）は未コミットで追加済み。`claude mcp list` では Connected だが、
> 現セッション起動時には未反映。Claude Code を再起動して `mcp__codex__*` ツールが
> deferred tools に出るか確認すること。

### 今セッションの成果（2026-04-10 Session 1）

**ユニットテスト追加:**
- `site/tests/lib/session-insights.test.ts`（41テスト追加）
- 計9ファイル109テスト全パス（68→109, +41）
- 対象: computeSessionInsights / computeClassInsights 全分岐

**knowledge base更新（10→12 wiki pages）:**
- decisions/2026-04-10-choice-value-semantics.md
- decisions/2026-04-10-session-templates-and-feedback.md
- index.md 統計更新

**docs/progress.md 更新:**
- 2026-04-10 Session 1 エントリを先頭に追加

**D1: セッションテンプレート実装:**
- マイグレーション: `site/supabase-schema-phase164.sql`
  - `session_templates` テーブル + RLS 4ポリシー + 2インデックス + auto-updated_at trigger
  - **人間作業**: Supabase SQL Editorで実行が必要
- 型定義: `supabase-client.ts` に SessionTemplateRow / Insert / Update を追加
- CRUD: `supabase-sessions.ts` に fetch/create/update/delete 4関数追加
- SessionWizard: scenario_slug でフィルタしてテンプレート読み込み + 保存/削除ハンドラ
- PrepPhase: テンプレート一覧表示 + 適用ボタン + 削除ボタン + 保存ダイアログ
- ビルド成功: `cd site && npm run build`

**E3: フィードバックUI改善（a11y強化）:**
- 既存の `FeedbackForm.tsx` は完全実装済みだった
  - 楽しさ★1-5 / 難しさ★1-5 / 一言50文字制限 / submitFeedback RPC連携
- 改善追加（a11y + UX）:
  - radiogroup/radio role + aria-checked + aria-label
  - 評価値の意味ラベル表示（「さいこう！」「むずかしい」等）
  - 文字数カウンター表示（n/50）
  - 送信失敗時のエラーメッセージ表示（role="alert"）
  - 送信完了画面に絵文字ヒーロー追加
- ビルド成功

**choice value 品質向上（455値の意味化）:**
- 66ファイルの placeholder value (a/b/c/d) → 意味あるslugに置換
- Phase 1: 232値 を自動マッピング（character roster の name→id を利用）
  - スクリプト: `scripts/fix-choice-values.cjs`
- Phase 2: 223値 を手動マッピングで概念キーワード化
  - スクリプト: `scripts/fix-choice-values-manual.cjs`（mappingテーブル内蔵）
  - 例: `a` → `post_time`, `day8_night`, `consult_first`, `forgot` 等
- 検証結果: 全584ファイル / 3167 choices / placeholder残 0 / 重複 0 / parse error 0
- ビルド: `cd game && npm run build` 成功

### 過去セッションの成果（2026-04-09 Session 3）

**EduPlatform Starter（全7 Phase + ビルド修正）:**
- https://github.com/shimimasa/eduplatform-starter（public, MIT, CONTRIBUTING.md付き）
- 22ファイル、3,124行。10テーブル + RLS 24ポリシー + 6ライブラリ + 3デモページ + 3ドキュメント

**Codex指示書5本作成:**
- Game Wave 1: `codex-game-phase3-wave1.md`（没入HUD/フォント/証拠進捗/既読スキップ）
- Game Wave 2: `codex-game-phase3-wave2.md`（解説/リズム/真相演出/ヒント）
- Game Wave 3: `codex-game-phase3-wave3.md`（プロフィール/称号/チュートリアル）
- テスト: `codex-test-strategy-phase1.md`（ピュア関数40+）
- QR+テンプレート: `codex-qr-and-templates-spec.md`（D1+D2設計）

**ゲームYAML品質修正（584本完全クリア）:**
- 88本 YAML構文エラー修正（パース不可→全パース成功）
- 437件 choice value欠損修正
- 27件 choice id欠損修正
- 480件 label→text リネーム
- 1件 textなしdialog→sprite変換
- 検証スクリプト: `scripts/validate-all-game-scripts.mjs`
- 修正スクリプト: `scripts/fix-yaml-quotes.cjs`, `fix-missing-choice-values.cjs`, `fix-choice-id-and-label.cjs`

**D2: QRコード自動参加 実装:**
- `StudentSession.tsx` にURL parameter自動検索を追加（22行変更）

**教室運用チートシート:**
- `docs/teacher-cheatsheet.md`（A4 1枚の先生向けクイックリファレンス）

**ユニットテスト追加:**
- 3ファイル15テスト追加（series / use-furigana / screen-effects）
- 計8ファイル68テスト全パス

**civicsクリーンアップ:**
- 旧スラッグ10本を `_archive/civics-old-slugs/` に移動

**1週間計画策定:**
- `docs/weekly-plan-2026-04-10.md`（7日間のAI/人間/Codex分担計画）

### 前セッションの成果（2026-04-09 Session 2）

**D2: QRコード自動参加 実装:**
- `StudentSession.tsx` にURL parameter自動検索を追加（22行変更）
- QRスキャン → `/join?code=XXX` → 自動でセッション検索 → lobby画面
- 既存の手動入力フローは維持

**ゲームYAML品質修正:**
- 584本を一括検証 → 88本にCritical構文エラー発見
- 自動修正スクリプトで88/88修正完了（Critical: 0）
- Major全件修正完了:
  - 437件 choice value欠損（61ファイル）
  - 27件 choice id欠損（english/esd/homeec）
  - 480件 label→text リネーム（12シリーズ）
  - 1件 textなしdialog→sprite変換（science-14）
- **584本全スクリプト: Critical 0 / Major 0**
- Minor（sprite hide without show）はシーン間リセットの正常パターン、修正不要
- 検証スクリプト: `scripts/validate-all-game-scripts.mjs`
- 修正スクリプト: `scripts/fix-yaml-quotes.cjs`

**Codex指示書: Game Phase 3 全3 Wave作成:**
- Wave 1: `codex-game-phase3-wave1.md`（378行）— 没入感HUD / フォントサイズ / 証拠進捗 / 既読スキップ
- Wave 2: `codex-game-phase3-wave2.md`（490行）— 不正解解説 / テキストリズム / 真相演出 / ヒントシステム
- Wave 3: `codex-game-phase3-wave3.md`（490行）— プロフィール / 称号 / チュートリアル
- 全11機能、コードスニペット・CSS・受入基準付き。Codexに渡すだけで実装可能

**EduPlatform Starter 全7 Phase完了:**
- リポ: https://github.com/shimimasa/eduplatform-starter（public, MIT）
- Phase 1: schema.sql（10テーブル + RLS 24ポリシー + 14インデックス）+ seed.sql + README
- Phase 2: supabase-client.ts（14型定義）+ auth.ts（7関数、マルチOAuth対応）
- Phase 3: groups.ts（6関数）+ participants.ts（7関数、バルク追加対応）
- Phase 4: sessions.ts（12関数、参加コード生成・フィードバック・キャッシュ）+ realtime.ts（6関数）
- Phase 5: admin.ts（11関数、組織管理・招待・監査ログ）
- Phase 6: 3ページ（LP/dashboard/join）+ 3コンポーネント（AuthGate/Dashboard/JoinSession）
- Phase 7: 3ドキュメント（setup/architecture/extending）
- 合計: 22ファイル、3,124行

### 前セッションの成果（2026-04-09 Session 1）

**コードベース衛生改善（9件完了）:**
- 異常ディレクトリ削除 + tmp-extract-v7.js削除 + package.json修正
- `site/.env.example`（11環境変数、6カテゴリ）
- `docs/setup-guide.md`（9セクション、9KB）
- `docs/README.md`（35項目の対応表、7KB）
- `scripts/README.md`（48本全スクリプト一覧、12KB）
- `game/README.md`（別リポ操作手順、6KB）
- `_archive/README.md`（放棄済み説明、5KB）
- `scripts/sync-series-registry.mjs` + `npm run sync:registry`（50→60シリーズ同期）
- `docs/project-manual.md`（取扱説明書・改善提案・新規PJ案の統合ドキュメント）

**新規プロジェクト（2案設計完了）:**
- 案A: ナゾトキメソッド教員研修 → 3つの素材を作成済み:
  - `content/note/shimizu-method-note-publish.md`（note公開ガイド）
  - `content/b2b/teacher-training-proposal.md`（教育委員会向け提案書）
  - `content/b2b/training-demo-script.md`（15分デモ台本）
- 案B: EduPlatform Starter → 汎用化分析完了:
  - `docs/eduplatform-starter-design.md`（81%再利用可能、8テーブル、6.5日工数）

**Karpathy式KB（7→10ページ）:**
- +2 decisions（衛生改善、新規PJ選定）
- +1 synthesis（PF汎用化分析 81%再利用）

### 人間タスク（継続）
- SE音源3つのDL（correct.mp3, wrong.mp3, decision.mp3）→ 効果音ラボ
- 汎用スプライト画像・背景画像のGemini生成
- NPSアンケートをGoogle Formsで作成
- 別の教員にセッション実施を依頼（最重要）
- Phase 3仕様書をCodexに渡す
- **note有料記事を公開** — チェックリスト準備済み
- **Canvaで提案書デザイン** — 原稿準備済み
- **デモ動画15分を画面収録** — 台本準備済み
