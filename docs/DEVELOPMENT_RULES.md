# ClassView Development Rules

> Status: **Human-reviewed project documentation**
>
> Last evidence review: 2026-09-12
>
> 現行コード、test、README、migration checklist で確認できる恒久的な作業規則をまとめる。feature 固有仕様は `DOMAIN_RULES.md` へ置く。

## Decision authority and implementation evidence

### Current implementation evidence

現在何が実装されているかを判断するときは、原則として次の順に証拠を確認する。

1. 対象の実データ、Schema、現在の code
2. 自動 test
3. Git 管理された config
4. 現行 README / 操作マニュアル / migration checklist
5. `PROJECT_STATUS.md`

この順序は Current implementation の確認用であり、Project rule の権威順位ではない。過去の実装報告は Historical snapshot として扱い、現在値は `PROJECT_STATUS.md` と実装証拠へ再照合する。

### Project rule authority

Project rule は、人間レビューによって明示的に決定され、canonical project knowledge に記録された製品・domain 方針だけを指す。現行挙動が実装され、既存文書と一致するという理由だけで Project rule へ自動昇格させない。

Project rule が未実装でも Current implementation より下位という意味にはならない。文書と実装が異なる場合は、勝手に一方へ合わせず、Current implementation、Project rule、implementation pending の差として報告する。製品目的、学校事情、教育上の理由、UX 意図は code だけで確定しない。

## Before implementation

- `git status --short --branch`、branch、HEAD、`origin/main` を確認する。
- 既存の未commit変更をユーザーの作業として扱い、上書き・破棄しない。
- `rg` で同等 route、service、rendering、Schema field、test、docs を検索する。
- JSON を変える前に対応 Schema と consumer/producer の両方を確認する。
- time table は Excel、runtime config、public snapshot のどれを扱う変更か区別する。
- local-only data を用いる調査は read-only / dry-run を優先する。
- 不明な domain 判断が結果を変える場合は、推測せずユーザーへ確認する。

## Data safety

### Production and public JSON

- `data/courses.json`、`archived-courses.json`、`course-works.json`、`data/timetable/` は管理 service と Schema の atomic write/rollback 契約を維持する。
- test は temporary repository/data を使用し、実運用 JSON を変更しない。
- course Schema の field を変える場合は template、README、importer/editor、public renderer、publisher 表示、data contract test を同時に監査する。
- timetable entry に course 情報を追加複製する前に、既存 `courseId` link と public course data で足りないか確認する。

### Local-only state

- Excel、`runtime/`、`feedback-data/`、`backups/`、`logs/`、`tmp/`、`uploads/` を Git へ追加しない。
- Excel 原本を parser/test の都合で保存し直さない。read-only 解析と hash/mtime 記録を使う。
- feedback private store の内容を docs、test fixture、diagnostic、公開 JSON へコピーしない。
- backup を一括削除しない。削除が必要な場合は対象・復旧可能性を人間へ確認する。
- runtime がない場合の default/public fallback と、runtime が存在する実運用を別状態として test する。

## Git safety

[`docs/PC_MIGRATION_CHECKLIST.md`](PC_MIGRATION_CHECKLIST.md) と `publisher.py` が確認できる安全方針:

- `git add .` を使わない。必要 path を `git add -- <paths>` で明示する。
- review していない file を巻き込む可能性があるため、`data/`、`js/` 等の大きな directory 単位の stage を標準手順にしない。変更内容を確認した個別 file だけを stage する。
- force push、`reset --hard`、`git clean`、強制 checkout を行わない。
- 自動 stash、rebase、競合解決を行わない。
- 未commit変更、local-only commit、remote 先行、diverge、予期しない staged file があれば停止して確認する。
- remote-only 先行を自動取得できるのは、working tree が clean で `merge --ff-only` が可能な場合だけである。
- 管理ツールの publish は allowlist 外ファイルを stage しない。
- ユーザーの明示指示なしに `git add`、commit、push、GitHub Pages 公開を行わない。

開発者が HTML/CSS/JavaScript/Python/docs を変更した場合、それらは管理ツールの data-only publish では公開されない。通常の開発 Git 手順として、差分を個別 review する必要がある。

## Publish safety

- 保存と公開を同じ操作に統合しない。
- publish 前に current data、repository、remote、branch、ahead/behind、staged paths を再検査する。
- public data 変更時は `data/site-version.json` の cache version も同じ公開単位で扱う。
- push failure 後は local commit/data を破棄せず、状態確認から再開する。
- credential や token を log/diagnostic へ含めない。Git command は argument 配列、`shell=False` を維持する。

## Public frontend security

現行 public renderer の安全パターンを維持する。

- JSON 由来文字列は原則 `textContent` で DOM に入れ、untrusted HTML として解釈しない。
- course ID は `encodeURIComponent` して query に入れる。
- URL は `new URL` で解析し、許可 protocol を確認する。
- 管理画像 path は Schema と public JS の allow pattern の両方で制約する。
- 空の任意データは section ごと生成しない。
- `innerHTML` を使う場合は固定された開発者管理文字列だけに限定する。現行の使用箇所は管理 dashboard の固定 error/shutdown markup である。
- localhost 管理画面の request/Host 制限を外さない。外部公開が必要なら別の脅威モデルとして設計 review を行う。

## Testing

### Full automated check

```powershell
cd tools/course-importer
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
cd ../..
node tools/course-importer/tests/test_editor_state.js
node tools/course-importer/tests/test_public_course_measurements.js
node tools/course-importer/tests/test_public_course_works.js
node tools/course-importer/tests/test_public_feedback_link.js
node tools/course-importer/tests/test_public_navigation.js
node tools/course-importer/tests/test_personal_timetable.js
node tools/course-importer/tests/test_public_timetable.js
node tools/course-importer/tests/test_site_loader.js
node tools/course-importer/tests/test_timetable_admin.js
```

repository 内の変更対象 JavaScript には `node --check` を実行する。JSON data 変更時は Python `json.load(..., encoding="utf-8")` と対応 Schema で検証する。

### Change-to-test map

| Change | Minimum related checks |
| --- | --- |
| course Schema/data/importer | `test_data_contract.py`, `test_importer.py`, `test_editor_state.js` |
| course public list/detail | public navigation/measurement tests、対象 JS `node --check`、実ブラウザ |
| timetable parser/mapping/save | `test_timetable.py`, `test_timetable_admin.js` |
| public timetable | `test_public_timetable.js`, `test_site_loader.js`、実ブラウザの day/week/mobile |
| personal timetable domain/storage | `test_personal_timetable.js`、対象 JS `node --check`。UI 接続時は public timetable の実ブラウザ確認も追加 |
| feedback | `test_feedback.py`, `test_public_feedback_link.js` |
| works | `test_works.py`, `test_public_course_works.js` |
| Git publish | `test_publisher.py` の temporary Git/remote tests |
| Windows lifecycle/build | `test_single_instance.py`, `test_windows_build.py`; 再build時のみ exe smoke test |

UI 変更では最低限、desktop と mobile、空状態、実データ 1 件以上、browser console、横 overflow、link 遷移を確認する。`file://` ではなく localhost static server を使う。

## Definition of Done

1. 依頼範囲の変更だけが存在し、既存 user changes を保持している。
2. 実装、Schema、producer、consumer、docs の契約が一致している。
3. 新しい domain 判断を推測で固定していない。未確認事項は明示した。
4. 関連 test と syntax/Schema 検証が通っている。
5. UI 変更は実ブラウザで確認した。
6. public/private、Git-managed/local-only の境界を壊していない。
7. `git diff` と `git status` を確認し、意図しない file を変更していない。
8. commit / push / publish は、依頼された場合だけ実行した。

## Documentation maintenance

- domain rule を変えた場合は `DOMAIN_RULES.md`、構造を変えた場合は `ARCHITECTURE.md`、恒久ルールを変えた場合はこの文書を更新する。
- `PROJECT_STATUS.md` は現在値と部分実装だけを更新し、詳細仕様を複製しない。
- `AGENTS.md` は入口に留め、詳細を大量に追加しない。
- 不明点が人間により確定したときだけ、`Unknown / needs confirmation` から正式な project rule へ移す。
