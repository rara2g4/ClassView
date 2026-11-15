# ClassView Timetable UI Lab

学校全体・保存済み個人時間割の見せ方を、同じデモデータで比較する独立プロトタイプです。本番の HTML/CSS/JavaScript、履修判定、保存領域は変更しません。

## 起動

リポジトリルートで静的サーバーを起動します。

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

ブラウザで次を開きます。

```text
http://127.0.0.1:8765/prototypes/timetable-ui-lab/index.html
```

URL queryで比較条件を固定できます。

```text
?concept=A&view=week&mode=personal&date=2026-11-02
```

- `concept`: `A`〜`H`
- `view`: `day` / `week`
- `mode`: `school` / `personal`
- `date`: `YYYY-MM-DD`

## 8案

| 案 | 名称 | 主な構造 |
| --- | --- | --- |
| A | 現行整理型 | 日→時限→カードの縦型アジェンダ |
| B | 週間グリッド型 | 曜日×時限の固定マトリクス |
| C | 高密度ダッシュボード型 | 指標・件数ナビ・圧縮行リスト |
| D | 時間軸カレンダー型 | 実時刻と予定ブロック |
| E | 曜日ボード型 | 曜日列に時限グループを積むボード |
| F | 分割ペイン型 | 曜日ナビ・当日詳細・週間密度の3領域 |
| G | 路線図型 | 時限を駅として時系列に追うルート表示 |
| H | フォーカス＋ミニマップ型 | 週の密度図と選択中1コマの詳細 |

## 比較データ

既存の次のデモfixtureを直接読み込みます。

- `data/demo/courses.json`
- `data/demo/timetable/2026-11.json`
- `data/demo/timetable/periods.json`

学校全体表示では同週の全entryを表示します。個人時間割は、比較条件を固定するため、既存デモcourse IDから作った保存済みプロフィール相当の固定セットを表示します。これはprototype内の表示filterであり、`localStorage`や本番プロフィールを読み書きしません。

## 自動ブラウザテストとスクリーンショット

静的サーバーの起動後、リポジトリルートから実行します。

Python版Playwrightと既存のChromeを利用できる環境で実行します。

```powershell
python prototypes\timetable-ui-lab\tests\browser_timetable_ui_lab.py `
  http://127.0.0.1:8765/ `
  --screenshots prototypes\timetable-ui-lab\screenshots `
  --browser-path "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

各案について次を同一viewport・同一データで撮影します。

- `*-pc-week.png`: 1440×1000、個人・週間
- `*-pc-day.png`: 1440×1000、学校全体・日表示（45entryの密集日）
- `*-mobile.png`: 390×844、個人・日表示
- `*-dense.png`: 1440×1000、学校全体・週間
- `comparison-overview.png`: 操作可能な8案比較表示
- `comparison-contact-sheet.png`: 週間表示8案の一覧画像

## 評価

比較結果は [`EVALUATION.md`](EVALUATION.md) にまとめています。正式採用や本番への移植はHuman review後に別作業として判断します。
