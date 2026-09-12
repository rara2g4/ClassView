# ClassView Architecture

> Status: **Human-reviewed project documentation**
>
> Last evidence review: 2026-09-09
>
> 現在の repository、設定、データフローを説明する。未実装の構成を記載する場合は `Planned / implementation pending` と明示し、Current implementation と区別する。

## Overview

```text
                         GitHub repository / GitHub Pages
┌─────────────────────────────────────────────────────────────────┐
│ Static public site                                               │
│ HTML + css/style.css + js/*.js                                  │
│        │                                                         │
│        ├─ data/courses.json                                      │
│        ├─ data/course-works.json + assets/works/                  │
│        └─ data/timetable/{manifest,periods,YYYY-MM}.json          │
└─────────────────────────────────────────────────────────────────┘
                              ▲ explicit allowlisted publish
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Local staff tool: tools/course-importer/                         │
│ Flask on 127.0.0.1 + Python services + browser UI                │
│        │                                                         │
│        ├─ PDF -> prompt -> human/ChatGPT -> review -> courses    │
│        ├─ Excel -> parse -> mapping -> review -> timetable JSON  │
│        ├─ CSV -> private feedback store -> optional public JSON  │
│        └─ works form -> validated JSON/image assets              │
│                                                                   │
│ Local-only: runtime, feedback-data, backups, logs, tmp, uploads  │
└─────────────────────────────────────────────────────────────────┘
```

## Public site

公開側は build 不要の静的サイトで、GitHub Pages の repository root から配信する。npm、frontend framework、公開 API、DB は使わない。

| Entry | Role | Main script |
| --- | --- | --- |
| `index.html` | 時間割の root entry。日表示が初期状態 | `js/timetable.js` |
| `timetable.html` | 共有 URL 用に維持する同等の時間割 entry | `js/timetable.js` |
| `courses.html` | 授業一覧、検索、分野・授業形式 filter | `js/course-list.js` |
| `course.html?id=<courseId>` | 授業詳細、単位数・時間数、制作物、feedback link | `js/course-detail.js`、`course-measurements.js`、`course-works.js`、`feedback-form.js` |

`js/site-loader.js` は `data/site-version.json` を `no-cache` で取得し、CSS と page script に同じ version query を付ける。course/works JSON は `no-cache`、時間割は manifest を `no-cache` で読み、manifest version を periods/month JSON の query に使う。

DOM は主に `createElement` と `textContent` で構築する。course ID は `encodeURIComponent` して detail URL に入れる。制作物 URL と画像 path は public script と Schema/管理 service の両方で制約する。

### Personal timetable — Planned / implementation pending

個人時間割は production 未実装であり、現行 public site に client-side personal profile、個人時間割 filter、個人用 `localStorage` contract は存在しない。Human UX review 用 prototype は Current implementation に含めない。

MVP でも public site の static architecture を維持し、次の browser 内データフローを計画する。

```text
public course / timetable JSON
  + browser localStorage の個人設定
  -> client-side で必修・手動選択・対象 entry を導出
  -> conflict と candidate filter を計算
  -> 個人時間割を表示
```

- profile と履修選択は browser `localStorage` に端末内保存し、public API、DB、login、account sync、server-side personal data は追加しない。
- 保存対象は `schemaVersion`、学年度、前期 / 後期、学年、所属 group、手動選択した course ID、reconcile に必要な version 情報を基本候補とする。
- 必修 course ID は保存せず、current course / timetable data から毎回導出する方向とする。
- 氏名、学籍番号、email 等の個人識別情報は保存しない。
- 期間変更時は前期間の手動選択を自動移植せず、再設定を案内する。
- `localStorage` の最終 key / object contract、version migration、stale / deleted course の reconcile、破損・利用不能時の fallback は production 実装時に code、test、canonical docs を一致させて確定する。
- 現行 public `groupTags` だけでは所属組と A/B/C 等の授業内 group を完全に区別できない。必要な public contract / Schema / producer 変更は実装時に調査・設計し、現段階では新 contract を確定しない。
- Desktop / Mobile は異なる layout を採用してよく、未実装の具体 module 名や DOM 構造はこの段階で固定しない。

## Data

| Path | Role | Git |
| --- | --- | --- |
| `data/courses.json` | 公開授業の一覧・詳細 | tracked/public |
| `data/course.schema.json` | course 1 件の正式な機械契約 | tracked/public |
| `data/course.template.json` | AI/手入力用の course template | tracked/public |
| `data/archived-courses.json` | 公開対象外の archive course | tracked、public JS は読まない |
| `data/course-works.json` | 実際の制作物 metadata | tracked/public |
| `data/course-works.schema.json` | works document の契約 | tracked/public |
| `assets/works/` | 管理された公開画像 | tracked/public |
| `data/timetable/manifest.json` | 公開月一覧、更新時刻、content version | tracked/public |
| `data/timetable/periods.json` | 1〜4限の時刻 | tracked/public |
| `data/timetable/YYYY-MM.json` | 日付 key ごとの時間割 entry | tracked/public |
| `data/timetable-*.schema.json` | manifest / periods / month の契約 | tracked/public |
| `data/site-version.json` | CSS/JavaScript cache version | tracked/public |
| `data/course-feedback-summary.json` | 任意生成の匿名化・集計済み feedback | allowlisted。現在は不存在 |

`data/courses.json` 自体の wrapper（`{"courses": [...]}`）は service/test で検証し、各 item は course Schema で検証する。

## Course management

`tools/course-importer/app.py` が Flask route と service を組み立てる。

- `importer.py`: PDF 抽出、prompt 生成、中間 JSON、Schema/metadata/review 検証、course の atomic 保存、archive、rollover
- `works_service.py`: works JSON、画像・URL検証、backup、並び替え
- `feedback_service.py`: CSV 正規化、private store、集計、issue、public summary
- `timetable_service.py`: Excel parser、正規化、mapping、diff、issue、public timetable 保存
- `publisher.py`: repository 検査、安全な sync、allowlist stage、commit、push、診断
- `single_instance.py`: Windows の二重起動防止と instance state

管理 UI は `templates/` と `static/`。公開サイトの HTML/JS/CSS とは別実装である。

## Syllabus flow

```text
PDF upload
  -> 指定した連続ページを pypdf で抽出（最大20ページ）
  -> current prompt + course Schema + template を組み立て
  -> 利用者が ChatGPT へ渡し、返却JSONを貼り付け
  -> explicit / inferred / proposed / missing を検証
  -> form編集、提案review、推察確認、preview
  -> 最終Schema・ID・重複・改変検査
  -> backup + temp file + os.replace で courses.json を保存
```

時間割から未登録 course を作る場合は `title`、`academicYear`、一意な `instructor` の候補だけを `timetable` source として渡す。シラバス内容は時間割から生成しない。

## Timetable flow

```text
Excel (.xlsx/.xlsm)
  -> openpyxl で formula用 / data_only用 workbook を解析
  -> date・period block・merged cell・並行授業を正規化
  -> subject tokens（variant / group / instructor / status）を分離
  -> explicit subject/item/group mappings を適用
  -> previous snapshot と diff
  -> blocking / warning / reference を人間review
  -> 確認期間を既存snapshotへmerge
  -> 3 Schemaを検証し、月別public JSONをatomic保存
  -> runtime config/snapshot/metadataを保存
```

parser は B、E、H、K、N、Q、T 列を各曜日 block の先頭として扱い、科目・学年・教室の 3 列を読む。時限 block は 1〜4 限で、default 時刻は `09:20-10:50`、`11:00-12:30`、`13:30-15:00`、`15:10-16:40`。

## Feedback flow

```text
Public course page
  -> shared Google Form prefilled link
  -> Google Sheets response destination
  -> staff downloads CSV manually
  -> admin tool validates exact/declared header aliases
  -> normalized private feedback-data/feedback.json
  -> staff aggregate / response / issue review
  -> optional aggregate-only data/course-feedback-summary.json
  -> explicit Git publish
```

生 CSV は保持しない。private store には個別回答と issue/職員メモが含まれる。public summary は自由記述、個別回答、職員メモを除外する。現在の public scripts は summary JSON を取得していないため、生成して publish しても学生向け表示にはつながらない。

## Student works

職員は course 管理画面から works metadata と任意の画像/外部 URL を登録する。service が course/year、掲載確認、画像 signature/size/dimensions、安全な保存 path、URL protocol を検証し、`data/course-works.json` と `assets/works/` を更新する。public detail は course ID と年度が一致する works だけを読み、画像のみ、link のみ、両方を表示できる。

## Publish

管理ツールでの保存後も working tree の未公開変更に留まる。明示した「ClassViewへ公開」で `publisher.py` が次を行う。

1. course/works/timetable の現在データを検証
2. repository root、remote、branch を設定と照合
3. `git fetch --prune`
4. remote が先行、diverge、予期しない staged file 等なら停止
5. allowlist 内に変更があれば `data/site-version.json` を更新
6. allowlist path だけを `git add -- <paths>`
7. staged path を再検査し、commit
8. 通常の `git push <remote> <branch>`

allowlist は course/archived/works/public-feedback/site-version、管理画像、公開時間割 JSON、時間割 Schema に限定される。HTML、CSS、JavaScript、Python、README、Excel、runtime、private feedback は管理ツールの公開対象外である。

## Windows management tool

`build_windows.ps1` は repository 内 `.venv` に requirements を導入し、PyInstaller `--onefile --noconsole` で `dist/ClassView管理ツール.exe` を作る。templates/static は exe に bundle するが、exe は `dist` の親から repository root を解決し、course data、Schema、runtime 等は repository 内外部ファイルとして読む。配布 exe は Git 管理され、`build/` と `.spec` は ignore される。

server は利用可能な `127.0.0.1` port を選び、request の remote address と Host を localhost に限定する。公開サイトからこの Flask app を呼び出す構成ではない。

## Local-only vs Git-managed

| Local-only / ignored | Purpose | Clone behavior |
| --- | --- | --- |
| `Timetable_edit.xlsx` 等の Excel | 学校の入力原本 | clone では復旧しない |
| `tools/course-importer/runtime/` | timetable mapping、snapshot、import metadata、instance state | defaults/public snapshot へ限定 fallback |
| `tools/course-importer/feedback-data/` | 個別 feedback、issue、職員メモ | clone では復旧しない |
| `tools/course-importer/backups/` | course/works/timetable/feedback の復旧履歴 | 新操作で再生成。過去履歴は clone では復旧しない |
| `tmp/`, `uploads/`, `logs/` | 一時ファイル・診断 | clone では復旧しない |
| `.venv/`, `build/`, `.spec` | 開発・build 生成物 | requirements/build script から再生成 |

Git 管理される public JSON、default mapping、source、tests、docs、現行 exe と、Git 管理外の private/operational state を混同しない。Git が clean でも別 PC の運用状態が完全復旧したとは限らない。
