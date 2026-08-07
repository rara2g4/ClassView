# ClassView

## サイトの目的

ClassViewは、複数の授業から興味や目的に合う授業を探し、詳しい学習内容や授業の進め方を確認するための授業選択支援サイトです。

HTML・CSS・JavaScriptだけで構成された静的サイトです。npm、フレームワーク、ビルド処理、データベースは使用していません。

## 現在実装されている機能

- 8件のサンプル授業を表示する授業一覧
- 授業名、概要、分野、学習内容、身につく知識や技術を対象としたキーワード検索
- 分野と授業形式による絞り込み
- 検索と2種類の絞り込みの併用
- 表示件数と検索結果なしメッセージの表示
- 授業IDを使った一覧ページから詳細ページへの移動
- 空の任意項目を表示しない授業詳細
- 存在しない授業ID向けの案内
- パソコンとスマートフォンに対応したレイアウト

ログイン、口コミ投稿、管理画面、データベースは実装していません。

## ファイル構成

```text
ClassView/
├─ index.html             # 授業一覧・検索ページ
├─ course.html            # 授業詳細ページ
├─ css/
│  └─ style.css          # 一覧と詳細で共通のデザイン
├─ js/
│  ├─ course-list.js     # 一覧表示、検索、絞り込み
│  └─ course-detail.js   # 授業IDの取得と詳細表示
├─ data/
│  └─ courses.json       # 全授業の一覧・詳細データ
├─ .nojekyll             # GitHub Pages用の設定
└─ README.md
```

## ローカルでの起動方法

JSONの読み込みにはローカルサーバーが必要です。プロジェクトのルートで次を実行してください。

```text
python -m http.server 8000
```

その後、ブラウザで `http://localhost:8000/` を開きます。HTMLファイルを直接ダブルクリックして開く方法では、ブラウザの制限によりJSONを読み込めない場合があります。

## 授業データの構造

`data/courses.json` は、次のように `courses` 配列の中へ授業オブジェクトを並べます。

```json
{
  "courses": [
    {
      "id": "web-programming",
      "title": "Webプログラミング",
      "summary": "Webサイト制作の基礎を学びます。",
      "category": "情報・デザイン",
      "grade": "2年生",
      "courseType": "選択",
      "classStyle": "講義・演習"
    }
  ]
}
```

主な項目は次のとおりです。

| 項目 | 型 | 内容 |
| --- | --- | --- |
| `id` | 文字列 | 授業を識別する一意なID |
| `title` | 文字列 | 授業名 |
| `summary` | 文字列 | 一文程度の概要 |
| `category` | 文字列 | 分野。絞り込み選択肢にも使用 |
| `grade` | 文字列 | 対象学年 |
| `courseType` | 文字列 | 必修・選択などの区分 |
| `classStyle` | 文字列 | 授業形式。絞り込み選択肢にも使用 |
| `prerequisites` | 文字列 | 前提知識 |
| `learningGoals` | 文字列 | この授業で学ぶこと |
| `classFlow` | 文字列 | 授業の進め方 |
| `outcomes` | 文字列 | 授業後にできるようになること |
| `topics` | 文字列の配列 | 主な学習内容 |
| `tools` | 文字列の配列 | 使用するソフトウェアや教材 |
| `assignments` | 文字列の配列 | 課題や制作物の例 |
| `schedule` | オブジェクトの配列 | 授業回ごとの内容。`session`、`title`、`description` を使用 |
| `suitableFor` | 文字列 | 向いている学生 |
| `images` | オブジェクトの配列 | 授業風景。`src`、`alt`、`caption` を使用 |

## 授業データの追加方法

1. `data/courses.json` を開きます。
2. `courses` 配列の末尾へ、既存データと同じ形式の授業オブジェクトを追加します。
3. 直前の授業オブジェクトとの間にカンマを入れます。
4. 一覧ページを再読み込みし、カード、分野、授業形式の選択肢を確認します。
5. `course.html?id=追加したID` を開き、詳細を確認します。

分野と授業形式の選択肢はJSONから自動生成されるため、HTMLの編集は不要です。

## 授業IDの決め方

`id` はすべての授業で重複しない値にします。半角英小文字とハイフンを使用し、授業名を短く表す形式を推奨します。

```text
web-programming
database-basics
group-project
```

公開後にIDを変更すると、以前の詳細ページURLが使えなくなるため、実際の運用開始後はなるべく変更しません。

## 任意項目の扱い

詳細ページでは、次のいずれかに該当する項目をセクションごと表示しません。

- 項目が授業オブジェクトに存在しない
- 文字列が空文字 `""`
- 配列が空配列 `[]`
- 配列内に有効な項目がない
- 画像の `src` が空

「情報がありません」「未登録」などの代替表示は行いません。授業ごとに情報量が異なっても、存在する情報だけでページが完結します。

## 一覧ページから詳細ページへ移動する仕組み

一覧の「詳細を見る」リンクは、次の形式で授業IDを渡します。

```text
course.html?id=web-programming
```

`js/course-detail.js` がURLの `id` を取得し、`data/courses.json` の `courses` 配列から同じIDの授業を探して表示します。IDがない場合や一致する授業がない場合は、ページを崩さず「授業が見つかりません」と一覧へ戻るリンクを表示します。

## GitHub Pagesでの公開方法

このサイトはビルド処理を必要としないため、`main` ブランチのルートをそのまま公開元にできます。対象リポジトリは次のURLです。

```text
https://github.com/rara2g4/ClassView
```

### 1. GitHubへpushする

まだリポジトリを取得していない場合は、最初にcloneします。

```bash
git clone https://github.com/rara2g4/ClassView.git
cd ClassView
```

変更したファイルをリポジトリ内へ配置したあと、次の手順でpushします。

```bash
git status
git add .
git commit -m "Update ClassView"
git push origin main
```

すでにclone済みの場合は、`git clone` は不要です。pushが拒否された場合は、リモート側の更新を確認してから取り込んでください。

### 2. GitHub Pagesを有効化する

1. GitHubで `rara2g4/ClassView` リポジトリを開きます。
2. **Settings** を開きます。
3. 左側の **Pages** を選択します。
4. **Build and deployment** の **Source** で **Deploy from a branch** を選択します。
5. ブランチに `main`、フォルダーに `/(root)` を選択します。
6. **Save** を押します。

設定後は `main` ブランチへ変更をpushするたびに、ルートにある `index.html` からサイトが公開されます。詳しい画面構成は[GitHub公式の公開元設定手順](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)を参照してください。

### 3. 公開URLを確認する

このリポジトリの想定公開URLは次のとおりです。

```text
https://rara2g4.github.io/ClassView/
```

実際に有効になったURLは、リポジトリの **Settings → Pages** に表示されます。公開処理の進行状況やエラーは、リポジトリの **Actions** に作成される `pages build and deployment` の実行履歴で確認できます。

初回公開や更新のpush直後は、公開URLへ反映されるまで数分かかることがあります。完了前に古いページや404が表示された場合は、少し待ってから再読み込みしてください。

### 4. JSON更新後の反映を確認する

1. `data/courses.json` を更新します。
2. ローカルサーバーで一覧と詳細を確認します。
3. 変更をcommitし、`main` ブランチへpushします。
4. GitHub Actionsの公開処理が完了するまで待ちます。
5. 公開サイトを強制再読み込みします。Windowsでは `Ctrl + F5`、macOSでは `Command + Shift + R` が目安です。
6. 必要に応じて次のURLを直接開き、公開中のJSON内容を確認します。

```text
https://rara2g4.github.io/ClassView/data/courses.json
```

ブラウザに古いJSONが残っているか確認したい場合は、確認時だけURL末尾に任意のクエリを付けられます。

```text
https://rara2g4.github.io/ClassView/data/courses.json?check=20260808
```

### GitHub Pages向けのパス設計

- `index.html`、`course.html`、CSS、JavaScriptはすべて相対パスで参照しています。
- JSONは各HTMLの現在位置を基準に `data/courses.json` を解決します。
- 詳細リンクは `course.html?id=授業ID` の相対URLです。
- `.nojekyll` により、Jekyll変換を行わず静的ファイルをそのまま公開します。
- ファイル名と授業IDは大文字・小文字を区別して扱ってください。

このため、ローカルの `http://localhost:8000/` と、リポジトリ名を含む `https://rara2g4.github.io/ClassView/` の両方で同じ構成を使用できます。
