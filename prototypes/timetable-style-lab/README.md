# ClassView Timetable Style Lab

同一の時間割HTML・デモデータ・操作状態に、8種類のCSSを適用して視覚デザインだけを比較する独立プロトタイプです。本番のHTML、CSS、JavaScript、履修判定、保存領域は変更しません。

## 起動

リポジトリルートで静的サーバーを起動します。

```powershell
python -m http.server 8775 --bind 127.0.0.1
```

次を開きます。

```text
http://127.0.0.1:8775/prototypes/timetable-style-lab/index.html
```

URL queryでも比較条件を固定できます。

```text
?theme=a&mode=personal&view=week&date=2026-11-02&color=light
```

- `theme`: `a`〜`h`
- `mode`: `personal` / `school`
- `view`: `day` / `week`
- `date`: `YYYY-MM-DD`
- `color`: `light` / `dark`

## CSSテーマ

各テーマは独立ファイルです。共通のレスポンシブ構造・アクセシビリティ規則だけを`base.css`が担当します。

| 案 | 名称 | CSS |
| --- | --- | --- |
| A | 現行デザイン改良型 | `themes/a-current.css` |
| B | ミニマル | `themes/b-minimal.css` |
| C | アカデミック・エディトリアル | `themes/c-academic.css` |
| D | モダン・テクノロジー | `themes/d-technology.css` |
| E | ソフト・フレンドリー | `themes/e-friendly.css` |
| F | 高密度・実用型 | `themes/f-dense.css` |
| G | クラシック・スクール | `themes/g-school.css` |
| H | スイス・シグナル | `themes/h-signal.css` |

テーマ切替時は`#theme-stylesheet`の`href`だけを変更します。`#timetable-root`のHTML、授業順、表示状態は変更しません。

## 比較条件

既存の次のデモfixtureを直接読み込みます。

- `data/demo/courses.json`
- `data/demo/timetable/2026-11.json`
- `data/demo/timetable/periods.json`

保存済み個人時間割相当のcourse IDセットも全テーマで共通です。prototypeは`localStorage`へ書き込みません。

## 自動ブラウザテスト

Python版Playwrightと既存Chromeを利用できる環境で実行します。

```powershell
python prototypes\timetable-style-lab\tests\browser_timetable_style_lab.py `
  http://127.0.0.1:8775/ `
  --screenshots prototypes\timetable-style-lab\screenshots `
  --browser-path "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

検査内容:

- 8テーマの切替前後で時間割HTMLと授業順が完全一致すること
- 学校全体／個人、日／週、日付、ライト／ダークの状態維持
- 授業詳細リンク
- 1440×1000と390×844
- ページ全体の横overflow、授業名の文字切れ、JavaScript・HTTPエラー
- 2案の並列比較

## スクリーンショット

`screenshots/`に各テーマのPC週間・PC日表示・スマホ・ダーク表示と、4種類の比較一覧画像を保存します。

評価は[`EVALUATION.md`](EVALUATION.md)を参照してください。
