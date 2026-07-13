# PoGO Collector Calendar v2.1

東京在住・PvPなし・コレクション重視向けのPokémon GOイベント管理サイト。

## v2.0の追加機能
- 希少性、収集価値、交換価値、復刻困難度を個別表示
- 地域限定、限定背景、衣装、色違い、専用技、特殊フォームのフィルター
- 「今やること」ダッシュボード
- 所持コレクション登録
- 所持済みイベントの自動減点
- イベント成果記録
- ICS出力
- 6時間ごとのイベント自動更新
- ブラウザ内保存。Pokémon GOアカウントには接続しない

## 導入
1. 旧リポジトリをバックアップする。
2. このZIPの `docs`、`.github`、`README.md` をリポジトリ直下へ上書きアップロードする。
3. GitHub Pagesは `main / docs` のままでよい。
4. Actionsで `Update Pokemon GO Events` を手動実行する。
5. Pages反映後に `Ctrl + Shift + R`。
6. 古いService Workerが残る場合は、ChromeのF12 → Application → Service Workers → Unregister。

## データ保存
所持状況と成果記録はブラウザのlocalStorageへ保存される。
別端末には自動同期されない。ブラウザデータを消すと消える。

## 制限
ScrapedDuckのイベントデータに限定背景・地域限定などの情報が明記されない場合、評価を自動判定できないことがある。


## v2.1の評価事故防止
- 「Pikachu」＋「Anniversary / Celebration」などを含むイベントは、複数衣装回収イベントとして最低SSS相当に補正する。
- イベント詳細データが不足していても、タイトルだけで重要コレクションイベントを判定する。
- `docs/data/score-overrides.json` で、イベント名ごとの最低点・各評価軸・理由・推奨保有数を追加できる。
- 自動判定と手動オーバーライドの両方を使うため、新しい限定背景・衣装イベントが低評価になる事故を修正しやすい。

### score-overrides.jsonの例
```json
{
  "nameIncludes": "Pikachu Celebration",
  "minScore": 92,
  "dimensions": {
    "rarity": 70,
    "collectionScore": 98,
    "trade": 65,
    "rerun": 85
  },
  "flags": ["最優先", "複数限定衣装"],
  "reasons": ["複数の衣装違いを同時に回収できる"],
  "recommendation": "衣装ごとに通常色1体、色違い1体。"
}
```
