# ClassView Project Status

> Status: **Human-reviewed project documentation / current snapshot**
>
> Last verified: 2026-10-14 JST
>
> Main / production-side baseline: `main` = `origin/main` = `1b2f7403d49f750427d61f8138ef7d025c73404e`。この baseline に personal timetable Phase 1 module と prototype は含まれない。
>
> Current handoff work: `handoff/personal-timetable-2026-10-07`。Phase 1 snapshot は `fc3af9884e928b08e3f762e2356a1265e460f02b`、prototype snapshot はその次の `9540ec5eca4b0ad206acef351d2445c72801afc0` で、current HEAD と upstream は後者に一致する。両 snapshot は handoff branch 上だけの WIP commit であり、`main` や production baseline ではない。再 review 修正はこの HEAD 上の未commit working-tree変更である。
>
> Phase 2 の production UI は未実装である。branch、refs、ahead / behind 等の可変な Git 状態は作業開始時にも再確認する。

この文書は「現在どこまで実装されているか」を短時間で把握するためのもの。domain detail は [`DOMAIN_RULES.md`](DOMAIN_RULES.md)、構造は [`ARCHITECTURE.md`](ARCHITECTURE.md) を参照する。実装と矛盾する場合は Schema、code、test、Git 管理設定、実データを再確認する。

## Implemented

### Public site

- GitHub Pages 向け static HTML/CSS/JavaScript/JSON 構成
- root `index.html` と `timetable.html` の日別・週別時間割
- 前日/今日/翌日、前週/今週/翌週、`?date=YYYY-MM-DD`、`view=week`
- desktop 週間表と mobile 曜日 accordion
- course ID がある時間割 entry から授業詳細への link
- `courses.html` の 57 授業表示、keyword search、分野・授業形式 filter
- `course.html` の条件付き詳細表示。空の optional section は非表示
- `credits` / `totalHours` がある場合だけ単位・時間表記を表示
- course/year に一致する works の画像、外部 link、画像+link 表示と lightbox
- 共通 Google Form への course ID、title、academicYear の prefill link
- `site-version.json` と timetable manifest version による cache 更新

### Personal timetable foundation — Phase 1

- DOM 非依存の profile validation、固定keyによるversioned `localStorage` save/load、effective enrollmentで必須のperiod reconcile
- current course/timetable dataからの必修導出と、manual/stale/effective enrollment の区別
- 本人の学年・所属組に明示一致するentryだけを使う曜日・時限単位の複数時限 conflict、required/manual conflict source、required-required data error の検出
- non-class entry visibility、`grades` と正式10 categoryのcandidate filter
- profile未設定、破損・schemaVersion欠落/型不正、validな未対応future schema version、storage利用不能/read/write failureの状態分離
- production UI、data loading、Desktop C / Mobile E layoutへの接続は未実装

### Course and syllabus management

- course Schema、template、57 件の public courses、archive document
- PDF の単一/連続ページ抽出（最大 20 ページ）
- current prompt、Schema、template をまとめた ChatGPT 用変換指示生成
- strict/support mode
- `explicit` / `inferred` / `proposed` / `timetable` / `missing` metadata 検証
- inferred の人間確認と proposed の accepted/edited/rejected review
- Schema、ID 一致、公開/archived ID 重複、検証後改変の拒否
- backup と atomic write による新規登録・編集
- 次年度版作成、archive、restore、permanent delete
- course の `academicYear` は任意 key で、文字列値を4桁 ASCII 数字 `YYYY` に制約。`null` は維持

### Timetable management

- `openpyxl` による annual Excel parser
- formula date、merged cell、period block、parallel lesson の処理
- variant、group、instructor、status token の分離
- subject/item/group の明示 mapping と versioned default config
- exact candidate 表示、未登録 course 作成 flow、special/event/exam/holiday/other 分類
- previous snapshot との差分、blocking/warning/reference、対象期間別 save 判定
- month/manifest/periods Schema 検証、backup、atomic write、rollback
- runtime config/snapshot/metadata がない clone で default/public data を使う fallback

### Feedback management

- public course から共通 Google Form への prefill link
- Google Forms 回答 CSV の header 検証、UTF-8 読込、正規化、重複排除
- feedback input の `YYYY` / `YYYY年度` を正規化し、private/public data の授業年度を4桁 ASCII 数字で検証・保存
- course/year 別 aggregate、非受講回答の集計除外
- 個別回答、要確認 issue、status、職員 memo
- 3 件以上の eligible response から個人情報・自由記述を除外した public summary を生成
- private store と public summary の分離

### Student works management

- course works を course Schema から分離した JSON/Schema
- 画像のみ、外部 URL のみ、画像+URL
- add/edit/delete/reorder、preview、backup
- JPEG/PNG/WebP の signature、size、dimensions と保存 path 検証
- external HTTP(S) URL と掲載確認の検証
- rollover/archive/delete で works を暗黙に copy/delete しない
- works の必須 `academicYear` key は `null` または4桁 ASCII 数字 `YYYY` に制約

### Windows and publish

- localhost 専用 Flask app、単一起動、health、graceful shutdown
- PyInstaller one-file/no-console build scripts
- Git 管理された `tools/course-importer/dist/ClassView管理ツール.exe`
- repository/remote/branch/ahead-behind/staged path の検査
- explicit allowlist stage、commit、通常 push
- remote 先行/diverge/予期しない staged file で公開停止
- data publish 時の site version 更新

## In progress / partial

- `totalHours` は現行シラバスで「実時間としての合計 n 時間」と扱う Temporary interpretation が人間レビュー済み。来年度以降の形式変更可能性があるため、Schema の `provisional: true` は維持する。
- public feedback summary は生成・publish できるが、public site で読み込んで表示する JavaScript は未実装。
- works pipeline は実装済みだが、現在 tracked の 8 件はすべて架空の表示確認 sample。実在の学生作品運用へは未移行。
- public timetable は 2025-04 の 5 日分だけ。annual parser は実装済みだが、現 Excel 全年範囲には blocking が残る。
- keyword classification の human-confirmation 方針は Project rule として決定済みだが、現行 parser は「説明会」「休暇」等の一部 keyword から `event` / `holiday` 等を直接確定し、専用確認 gate なしで保存可能な場合がある。
- 個人時間割の domain/storage Phase 1と、その前提となる `termPeriods` / `homerooms` / `homeroomIds` public contractは実装済みだが、production UIの絞り込みとdata loading接続は未実装。

## Planned / known next steps

### Formal roadmap: personal timetable

個人時間割は正式 roadmap であり、Phase 1 の UI 非依存 logic と storage contract は実装済みである。学校全体時間割との切替、初回設定、Desktop C / Mobile E の production UI、data loadingへの接続は次 phase の implementation pending である。詳細な Project rule は [`DOMAIN_RULES.md`](DOMAIN_RULES.md#personal-timetable--project-rule--phased-implementation)、製品上の位置づけは [`PRODUCT_VISION.md`](PRODUCT_VISION.md#personal-timetable--planned-roadmap)、構造は [`ARCHITECTURE.md`](ARCHITECTURE.md#personal-timetable--phase-1-current-implementation--ui-pending) を参照する。

Human UX review 用 prototype は production の Current implementation ではない。正式categoryの管理・validationと、A/B/C等の授業内groupを学生へ割り当てる方法は引き続き設計・判断が必要である。machine-readable term sourceはmanifestの明示 `termPeriods` として実装済みだが、現在年度の正式境界日は未設定である。

### Planned data replacement before production

現在の `data/courses.json` は開発・表示確認用の非本番 dataset であり、正式公開前に実際の学校授業・正式シラバス由来の data へ全面置換する。現在の非本番 course 群を本番 data の source にしない。切替時期・担当・review 手順は未決定である。

### Operational next steps

- annual timetable 全年保存には残る14 blockingの人間reviewが必要。
- 実在する学生制作物へ移行する場合は、掲載許可、`academicYear`、削除要請対応のproject ruleを満たす運用を準備する。
- feedbackの学生還元はDesired future directionであり、具体的公開基準が決まるまでは実装確定事項にしない。

## Current development data snapshot

### Current snapshot

次の件数は feature implementation baseline と current repository data の確認値であり、恒久的な Project rule ではない。

| Item | Current value |
| --- | --- |
| `data/courses.json` | 57 courses |
| `data/archived-courses.json` | 0 courses |
| Course fields present in data | 21 Schema fields（optional は course ごとに異なる） |
| Current course measurement values | `credits` 0 courses / `totalHours` 0 courses（開発用仮値は除去済み） |
| Course/works academicYear format | non-null値はすべて4桁 ASCII 数字。Schema適合 |
| `data/course-works.json` | 8 fictional samples / 7 courses |
| `data/course-feedback-summary.json` | 不存在 |
| Timetable manifest | academic year `2025`, `termPeriods: []`、homerooms 2、month `2025-04` |
| Public timetable range | 2025-04-21〜2025-04-25、5 日、84 entries |
| Public timetable kinds | `class` 83、`special` 1 |
| Public homeroom scope | all 66、explicit 14、unresolved 4 |
| Default timetable mapping | subjects 45、items 1、canonical groups 4、group mappings 4、homerooms 2 |

course title には `[A]`〜`[D]` を含むものがあるが、course Schema に独立 variant field はない。public timetable は variant を `courseVariantTags`、group を `groupTags` に分離する。

defaultの1組、2組、A組、B組は現在の設定値であり、永続的な固定group一覧ではない。groupは年度・学校運用に応じて設定と明示mappingで変更する。

### Project rule

現在の course/works dataset は開発・表示確認用の非本番 data である。現在の course 群を正式学校データとして再利用せず、本番 dataset は実際の学校授業・正式シラバス・掲載許可済み制作物を基に準備する。Commit A 前の開発用 `credits` / `totalHours` 仮値は現在の `data/courses.json` に残していない。

## Local operational state

次は 2026-08-28 に検査した PC の状態であり、Git clone からは復旧しない。

| Local-only item | Inspected state | Notes |
| --- | --- | --- |
| `Timetable_edit.xlsx` | repository root に存在 | ignored。219,887 bytes、SHA-256 `7115DCF3C2445B3899B88918386A336D365EC2A9871DCF4B82731B12B997A012` |
| workbook | `2025通年時間割` | 23 columns、2303 rows、172 merged ranges。read-only 検査 |
| `runtime/timetable/config.json` | 存在 | subjects 45、items 1、canonical groups 4、group mappings 4 |
| `runtime/timetable/last-import.json` | 存在 | 84-entry snapshot |
| `runtime/timetable/import-metadata.json` | 存在 | confirmed range 2025-04-21〜2025-04-25 |
| `feedback-data/feedback.json` | 存在 | private 内容・回答本文はこの文書に記録しない |
| `backups/` | 存在 | Git 管理外。過去の復旧履歴 |
| `logs/` | 存在 | Git 管理外。公開対象外 |
| `.venv/` | 存在 | requirements から再生成可能 |
| `build/` | 存在 | Git 管理外。再生成可能 |

Git clone は public data、default mapping、source、tests、docs、current exe を復旧するが、上表の private/operational history は復旧しない。

PC移行時の確認手順とGit cloneで復旧しない項目は [`PC_MIGRATION_CHECKLIST.md`](PC_MIGRATION_CHECKLIST.md) を参照する。完全なcurrent test command一覧は [`DEVELOPMENT_RULES.md` の Full automated check](DEVELOPMENT_RULES.md#full-automated-check) をsource of truthとする。

## Current Excel dry-run

現 `Timetable_edit.xlsx` を正式 parser で本番保存せず解析した結果。

### Annual: 2025-04-01〜2026-03-31

- 343 dates / 1,281 entries
- class 1,250（mapped 1,197 / unmapped 53）
- event 12、exam 14（mapped 11 / unmapped 3）、holiday 4、special 1
- blocking 14: unregistered subject 8、unknown group 4、empty exam name 2
- warning 31、reference 62
- `canSave: false`

### Confirmed week: 2025-04-21〜2025-04-25

- 5 dates / 84 entries
- class 83 / special 1
- workbook 全体の blocking 14、warning 31、reference 62 は preview に保持
- save range 内は blocking 0、warning 0、reference 4
- `canSave: true`

dry-run は Excel を編集せず、public JSON の save/publish も実行していない。

## Tests

2026-10-14、personal timetable Phase 1とterm periods / homeroom public contract実装後のcurrent sourceでfull automated checkを確認。

- Python `unittest`: 189 tests OK
- JavaScript test files: 9 passed（personal timetable domain/storage を含む）
- tracked JavaScript `node --check`: 24 files passed
- JSON parse: 16 files passed
- Course Schema: 57 courses passed
- Archived course Schema: 0 courses passed
- Course works Schema: 8 works passed
- Timetable manifest Schema: academic year `2025` passed。`YYYY-YYYY` の別 contract も test 済み
- Template Schema: passed
- site-version contract: passed
- browser/management UI validation: `2025`、`0000`、空欄を許可し、期間表記、2桁、`年度` 付き、全角数字を拒否することを確認
- EXE smoke: health、管理画面、同梱 UI、外部 Schema 読み込み、graceful shutdown passed
- Python suite は course/Schema、syllabus importer、feedback、works、timetable、publisher temporary Git remote、single-instance、Windows build contract を含む
- JavaScript suite は editor state、course measurements、works、feedback link、navigation、personal timetable domain/storage、public timetable、site loader/cache、timetable admin を含む

Current executable artifact:

- path: `tools/course-importer/dist/ClassView管理ツール.exe`
- tracked: yes
- rebuilt from implementation baseline: yes
- size: 14,727,955 bytes
- SHA-256: `C992AC0176842D366A87C3FCA0BEE22539A1EAE0797698C3B2B931596152EB2C`

## Known limitations

- annual timetable save は 14 blocking の人間 review が必要。
- public timetable data は 2025-04-21〜25 に限定される。
- 現在のmanifestは正式な前期・後期境界日が未入力で `termPeriods: []` のため、日付からtermを解決すると `unresolved` になる。
- public site に個人時間割の production UI・認証・server-side personalization はない。Phase 1 module は page から未読込。
- public feedback summary の consumer がない。
- current works は実在作品ではない。
- keyword heuristic による一部 `event` / `holiday` 分類には、Project rule が求める専用の human-confirmation gate が未実装。
- course variant は独立 field ではなく、course title/ID と timetable mapping の組合せで表現される。
- publisher の職員向け field label に `credits` / `totalHours` が未登録で、この field だけを変更した場合は未公開変更の説明に raw key が出る。
- favicon がなく、localhost static server の `/favicon.ico` が 404 になることがある。

## Unknown / needs confirmation

- feedbackを学生へ還元する場合の具体的公開内容、匿名化基準、最小回答数、review手順、公開判断者。
- 実在制作物の卒業後の自動保持期間、一律の保存年限、詳細な権利処理手順。
- 実在制作物の `academicYear` 必須ruleをSchema、管理画面validation、運用手順のどこで強制するか。
- 現在年度の正式な前期・後期の開始日・終了日。境界日が設定されるまでtermは自動推測しない。
- 個人時間割における A/B/C 等の授業内 group の詳細運用と、所属組から分離した選択・表示方法。
- 本番course datasetへの全面置換時期、担当者、review手順、公開切替手順。
