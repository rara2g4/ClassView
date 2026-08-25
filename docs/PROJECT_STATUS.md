# ClassView Project Status

Last verified:
2026-08-25 16:17 JST

Verified against commit:
`a12e60559eaba4a8af7f2d6a495588b43d14c774`

Branch:
`main`

Working tree at verification:
開始時は `main` と `origin/main` がcommit `a12e605` で一致し、working treeはclean。現在はスマートフォン週間accordionを全曜日collapsedで開始する実装・文書・テストの4ファイルが未commit。今回のcommit / push / 公開は未実施。復旧した `tools/course-importer/.venv/` はGit管理外。

Purpose:
この文書はPC間・Codexセッション間の引き継ぎ用。実コードと矛盾する場合は、Git・コード・テスト・runtime・公開データ・Excelを根拠に再監査する。

## 1. Project purpose

ClassViewは、学生が授業内容、対象学年、授業形式、授業回、実際の制作物、時間割を確認して授業選択に役立てるためのサイトである。学校職員はローカル管理ツールから授業、制作物、受講者フィードバック、時間割を管理し、確認済みの公開対象だけをGitHub Pagesへ送る。

## 2. Architecture

- 公開側は `index.html`（時間割）、`courses.html`（授業一覧）、`course.html`、`timetable.html`、`css/`、`js/`、`data/`、`assets/` からなる静的サイト。常時稼働するAPI、DB、Flask、Nodeサーバーは公開側にない。
- 公開先はGitHub Pages。ビルド工程を必要とせず、相対パスでルート配下のHTML・CSS・JavaScript・JSONを読む。
- 職員向けローカル管理ツールは `tools/course-importer/`。Python、Flask、jsonschema、pypdf、openpyxlを使用し、Windows配布にはPyInstallerを使用する。
- ローカル管理サーバーは `127.0.0.1` のみで待ち受け、localhost以外を拒否する。
- 公開処理は許可リスト方式。授業、アーカイブ、公開用フィードバック集計、制作物、管理対象画像、時間割JSONだけを明示的にstageする。Excel、個別回答、runtime、バックアップ、コード全体は自動公開しない。

主要データ:

- `data/courses.json`: 公開授業
- `data/archived-courses.json`: アーカイブ授業
- `data/course-works.json`: 実際の制作物
- `data/timetable/manifest.json`, `periods.json`, `YYYY-MM.json`: 公開時間割
- `tools/course-importer/defaults/timetable-config.json`: clone直後に使える非機密の確認済み時間割対応初期値
- `tools/course-importer/runtime/`: PC固有の運用状態。Git管理外
- `tools/course-importer/feedback-data/`: 個別フィードバック正規化データ。Git管理外

## 3. Confirmed design decisions

- 学校の時間割Excelに書かれた日付別確定時間割を正本とする。通常時間割と変更一覧をClassView側で合成しない。
- `[A]`～`[D]` は受講グループではなく `courseVariantTags`。`After Effects[A]` と `After Effects[C]` は別授業・別mappingとして扱い、base nameだけで統合しない。
- `()` / `（）` は保守的な形式だけをgroup候補とする。`(2年)` や `（総合学習）` は `subject-qualifier` として科目名に残す。
- `【】` は講師情報。人名に限定せず、`専任`、`複数`、`CDP` 等も保持する。
- 時間割entryの `kind` は `class`、`exam`、`special`、`event`、`holiday`、`other`。通常授業はcourseIdを要求し、special/event/holiday/otherはcourseIdを要求しない。
- 類似科目名からcourseIdを推測しない。完全な正規化 `subjectName` に対し、人が明示mappingを保存する。
- Excel全体のissueは保持するが、部分保存の可否は保存期間内issueと明示的なglobal structural issueだけで決める。
- シラバス変換では `explicit`、`inferred`、`proposed`、`missing` を区別する。時間割由来候補には追加の `timetable` を使う。未確認のAI提案や未確認の推察が残る状態で登録しない。
- `fieldMeta`、根拠、AI提案レビュー状態は管理中間データだけに保持し、公開 `courses.json` へ混入させない。
- 制作物は授業schemaから分離し、動画、PDF、ZIP、実行ファイルなどの大容量データは外部URLを使用する。
- 受講者フィードバックは総合点・ランキングを目的とせず、授業改善と要確認事項の発見に用いる。生回答と職員メモは公開しない。
- 本番保存と公開を分離する。管理ツール内で保存しても未公開のままで、「ClassViewへ公開」を明示実行した場合だけcommit/pushする。

## 4. Implemented

### Public site

- `index.html` / rootは時間割の日表示を入口とし、授業一覧・検索・分野・授業形式フィルターは`courses.html`で維持。`timetable.html`と`?date=YYYY-MM-DD`の直接URLも維持。
- 授業一覧では授業名そのものを正式な詳細リンクとし、冗長な「詳細を見る」リンクを削除。授業詳細の一覧戻り先も`courses.html`へ更新。
- `data/course.schema.json` による授業1件単位の正式仕様。
- 実際の制作物の画像のみ、外部リンクのみ、画像＋リンク表示。管理用追加・編集・削除・並び替え、画像検証、バックアップも実装済み。
- 共通Google Formへの授業ID・授業名・年度の事前入力リンク。
- 学生向け時間割。デフォルト日表示、前日/今日/翌日、前週/今週/翌週、`?date=YYYY-MM-DD`、月跨ぎ、empty state、授業詳細リンク、special等の表示、responsive対応。
- PC週間表示は週間モードだけ最大1480pxのwide layoutを使い、5日×時限表、可読性を上げた文字、曜日sticky headerを実装。1024px以下では時間割領域だけ横スクロールする。
- 日表示・PC週間はcourseId付き授業名を正式な`<a href="course.html?id=...">`に統一。スマートフォン週間はcourseId付きcompact行全体を同じ詳細URLの`<a>`とし、授業単位の中間詳細展開を廃止。courseIdを持たないspecial等は矢印なしの非リンク。
- スマートフォン週間表示は曜日単位のaccordionで、週間表示へ入った直後と週移動後は全曜日を折りたたむ。「開く / 折りたたむ」と`aria-expanded`を同期し、操作後は複数日を同時に開ける。授業名・対象・group・教室をcompact表示し、授業行の1タップで詳細へ移動する。
- 週間表示はURLへ`view=week`を保持し、詳細ページからブラウザで戻っても同じ日付の週間表示と日別accordionへ復帰する。
- `data/site-version.json`を`no-cache`で確認し、CSSとページJavaScriptへ同一の安定した`?v=<version>`を付与。`courses.json`と`course-works.json`は`no-cache`で再検証する。
- 時間割manifestは`no-cache`で取得し、既存manifest `version`を`periods.json`と月別JSONのversion queryへ利用。同一ページ内の月別メモリcacheは維持。

### Local management tool

- PDFページ範囲抽出、ChatGPT用変換指示生成、返却JSON検証、プレビュー、バックアップ付き授業追加。
- strict/supportの変換モード、情報源メタデータ、推察確認、AI提案の採用・修正・不採用、未確認提案の登録阻止。
- 既存授業編集、次年度版作成、アーカイブ、復元、完全削除。
- 制作物管理。
- Google Forms CSVの厳密な列名対応、正規化、重複排除、授業・年度別集計、確認候補、職員メモ、最小回答数を満たした公開用集計生成。
- 時間割Excel parser、記号解析、差分比較、未知科目・group・特殊項目の人間による分類、新規授業登録との連携。
- 月別公開時間割JSON生成、3種Schema検証、一時ファイルからの置換、バックアップ、rollback。
- 選択期間外のblockingを保存可否から除外しつつ、年間issue一覧へ残すserver-side/UI実装。
- 許可ファイル限定のGit同期・commit・push、remote更新やdiverge時の停止、診断表示。
- 公開対象データがある場合、Git公開前に`data/site-version.json`をUTC timestampで自動更新し、同じallowlist commitへ含める。
- Windows単一起動、localhostポート選択、非console実行、終了API。

### Windows artifact

- `tools/course-importer/dist/ClassView管理ツール.exe` がGit管理されている。
- 監査時サイズ: 14,675,243 bytes
- SHA-256: `00BF848B893AAB9E1B866ED749696909D526B9038CA7AA5602B47C19E0DA22AC`
- `build_windows.ps1`、`build_windows.bat`、ショートカット作成スクリプト、ビルド手順が存在する。
- 過去の検証版exeや `build/` は存在しない。

## 5. Implemented but local-state dependent

- `runtime/timetable/config.json`: このPCにはない。現在はGit管理されたdefault configへfallbackするため、確認済みの45科目mapping、special 1件、canonical group 4件、group alias 4件は利用可能。今後このPCで変更・保存するとruntime側へ作られる。
- `runtime/timetable/last-import.json`: このPCにはない。公開 `data/timetable/` から前回snapshotを復元して差分比較するfallbackがある。
- `runtime/timetable/import-metadata.json`: このPCにはない。manifestの `updatedAt` から最終取込日時だけfallbackできるが、元Excelファイル名、元mtime、確定保存期間は復元できない。
- `Timetable_edit.xlsx`: `docs/Timetable_edit.xlsx` に存在し、`*.xlsx` ルールでGit管理外。正式parserの読み取り専用dry-runに利用可能。リポジトリ外へ置く方が運用データとの区別は明確だが、現在位置でもcommit/push対象にはならない。
- `feedback-data/feedback.json`: このPCにはない。公開フォーム導線とコードは動くが、過去の個別回答・確認状態・職員メモは復元されない。
- `backups/`: このPCにはない。過去バックアップは復元されない。新しい管理操作時には再作成される。

## 6. In progress

スマートフォン週間accordionの全曜日collapsed初期状態はローカル実装・自動テスト・ブラウザ確認まで完了。commit / push / 公開はユーザー確認待ち。

## 7. Not implemented

- 学年、group、履修courseIdsをlocalStorageへ保存する個人時間割絞り込み。
- 過去案にあったフィードバック項目のうち「評価方法」「テスト後フィードバック」を直接尋ねる専用設問。現実装には、学習成果、説明、演習、質問対応、教材、課題、シラバス一致、速度、難易度、課題量、授業形式、専門内容の懸念等がある。

## 8. Current timetable state

### Course data

- `data/courses.json`: 57件
- 既存の内容入り授業: 12件
- 2025年度の時間割用仮授業: 45件
- 仮授業は `summary`、`category`、`classStyle` が空で、任意項目はnull/空配列。シラバス内容を創作していない。
- 代表ID: `ai-application-a`、`after-effects-a`、`after-effects-c`、`blender-b-d`、`fps-b-d`、`html-css-b`、`office`、`python-application-b`、`vr-production-b-d`、`web-production-a`、`drone-programming`、`programming-basics`、`general-education`、`streaming-a`
- `data/archived-courses.json`: 0件

### Versioned default timetable mapping

- subject mappings: 45件
- timetable item mappings: 1件（`スーツメイク講座` → `special`）
- canonical groups: 4件（1組、2組、A組、B組）
- group mappings: 4件（`(1組)`、`(2組)`、`(A組)`、`(B組)`）
- sheet name: `2025通年時間割`

### Public timetable

- `data/timetable/` は存在し、全ファイルがGit管理されている。
- manifest month: `2025-04` のみ
- 対象日: 2025-04-21～2025-04-25の5日
- entries: 84件
- unique subjectName: 46件
- `class`: 83件、全件courseIdあり
- `special`: 1件、courseId null
- groupTags: 1組、2組、A組、B組
- manifest updatedAt: `2026-08-24T22:04:56Z`（JST 2026-08-25 07:04:56）
- fixtureではなく、clone引き継ぎ用にcommitされた公開時間割データ。制作物データはREADMEで架空サンプルと明記されているが、時間割データにはfixture表記がない。

### Runtime

- `runtime/timetable/config.json`: 不存在
- `runtime/timetable/last-import.json`: 不存在
- `runtime/timetable/import-metadata.json`: 不存在
- default configと公開snapshotへのfallbackがあるため、clone直後の表示・差分比較・既存対応の利用は可能。

### Actual Excel and dry-run

- path: `docs/Timetable_edit.xlsx`
- size: 225,350 bytes
- mtime: `2025-05-07 11:24:02 +09:00`
- SHA-256: `2A10AFE55FBFF54259E88B3A108D97A4EE35FAFB30AD1278003319599FBD1EB9`
- sheet: `2025通年時間割`
- 過去の参考値（219,887 bytes / SHA-256 `7115...A012`）とは異なるファイルだが、parserの基本認識件数343日・1,281 entryは一致した。

年間 `2025-04-01`～`2026-03-31`:

- days: 343
- entries: 1,281
- courseId mapped entries: 1,208
- unmapped class entries: 53
- unregistered subjects: 8種類
- unknown groups: 4種類
- blocking: 14（未登録科目8、未登録group 4、科目名なし試験2）
- warning: 31（`see_below` 24、`suspicious_room` 1、`tentative` 6）
- reference: 62（`supplemental_info`）
- save possible: false

未登録科目は `Java[A]`、`ゲームデザイン[B]`、`ゲームデザイン[D]`、`デザイン入門`、`天皇誕生日`、`山の日`、`春分の日`、`身だしなみ講座`。未登録groupは `(1・2組)`、`(C組)`、`(D組)`、`(全組)`。

部分期間 `2025-04-21`～`2025-04-25`:

- days: 5
- entries: 84
- courseId mapped entries: 83
- unmapped class / unregistered subject / unknown group: 0
- blocking: 0
- warning: 0
- reference: 4
- save possible: true
- 年間全体の14 blocking、31 warning、62 referenceはpreviewに保持されたまま、期間外issueとして保存可否を妨げないことを実Excelで確認した。

## 9. Tests

Verified on 2026-08-25 JST with Python 3.13.3 and Node.js 22.15.0.

Restored environment:

- venv: `tools/course-importer/.venv/`
- Flask 3.1.3
- jsonschema 4.26.0
- pypdf 6.16.2
- openpyxl 3.1.5
- PyInstaller 6.22.2
- `pip check`: no broken requirements

Commands and results:

```powershell
cd tools/course-importer
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

- Python: 167 passed, 0 failed, 0 skipped
- data contract/course schema: 17
- feedback: 22
- syllabus/course importer、backup、管理操作: 48
- publish/sync/rollback safety: 18
- single instance: 6
- timetable parser、symbol、mapping、special、range-scoped blocking、JSON、backup/rollback/API: 44
- Windows build contract: 5
- works: 7

```powershell
node tools/course-importer/tests/test_editor_state.js
node tools/course-importer/tests/test_public_course_works.js
node tools/course-importer/tests/test_public_feedback_link.js
node tools/course-importer/tests/test_public_navigation.js
node tools/course-importer/tests/test_public_timetable.js
node tools/course-importer/tests/test_site_loader.js
node tools/course-importer/tests/test_timetable_admin.js
```

- JavaScript test files: 7 passed, 0 failed
- `node --check`: repository内の20 JavaScript filesすべて成功
- JSON Schema明示検証: 57 courses + course works + timetable manifest/periods/month = 61 documents、0 errors

Browser verification at `http://127.0.0.1:8765/`、`courses.html`、`course.html`、`timetable.html?date=2025-04-21`:

- rootの`?date=2025-04-21`は日表示、12 entries・12 course links、「時間割」active。`timetable.html?date=2025-04-21`も同じ日付・日表示で動作。
- 1440px PC週間は4/21～4/25、84 entries・83 course links、wide layout、ページ全体の横overflowなし。`Photoshop[B][D]`、`ドローン概論`、`After Effects[A]`の正式URLを実データで確認。
- `courses.html`は57 cards・57授業名links・旧`course-card__link` 0件。1440px / 390pxで表示し、ページ全体の横overflowなし。授業名リンクから詳細へ遷移し、詳細ページの一覧戻り先が`courses.html`であることを確認。
- 390px週間は5日accordionを全曜日collapsedで開始し、`?date=2025-04-21`と`?date=2025-04-23`のどちらでも自動展開なし。courseId付き83行はcompact行全体のリンク、矢印83、授業単位の詳細button / 展開DOMは0件。
- `スーツメイク講座`は特別授業badge付きの非リンク1行で、内部link・矢印とも0件。全5日accordionは個別に開閉可能。
- 曜日header全体のbuttonで「開く」→「折りたたむ」→「開く」と`aria-expanded`を同期。複数日展開を維持し、前週・次週へ移動した時は新しい週を全曜日collapsedで開始する。
- 320 / 375 / 390pxは5日ともinitial collapsedでページ全体の横overflowなし。展開済み2日を375pxへ変更しても同じ画面上の展開stateを維持。
- 768pxではPC週間表へ切り替わり、1440px PC週間は84 entries・83 course linksを維持。390px日表示も12 entries・12 course linksを維持。
- asset inventoryでページJavaScriptがsite version `20260825T0710554206681Z`を使用。ブラウザconsole error / warningは0件。

## 10. Git-ignored required data

| 項目 | このPC | Git管理 | 必要性・移行判断 |
| --- | --- | --- | --- |
| `docs/Timetable_edit.xlsx` | 存在 | ignore | 実時間割の再解析・次回取込に利用可能。安全性は問題ないが、運用上はリポジトリ外配置の方が明確。 |
| `runtime/timetable/config.json` | 不存在 | ignore | このPC固有の今後のmapping更新に必要。現在の確認済み初期値はdefault configから復元可能。 |
| `runtime/timetable/last-import.json` | 不存在 | ignore | 差分比較用。現在は公開JSONからfallback可能。 |
| `runtime/timetable/import-metadata.json` | 不存在 | ignore | 元Excel名、mtime、保存範囲の追跡用。公開manifestだけでは完全復元不可。 |
| `feedback-data/feedback.json` | 不存在 | ignore | 過去の個別回答、確認状態、職員メモを継続する場合は移行必須。 |
| `backups/` | 不存在 | ignore | 過去操作の復旧履歴が必要なら移行。新規操作では再生成される。 |
| `uploads/`, `tmp/`, `logs/` | 不存在 | ignore | 一時・診断用。移行不要。 |
| `.venv/` | 復旧済み | ignore | requirementsから再生成可能。PC間コピー不要。 |
| `build/`, 過去exe | 不存在 | ignore | 再ビルド時に生成可能。現行exeはGit管理済み。 |

## 11. Known issues

- 年間解析には14 blockingが残る。内訳は未登録科目8、未登録group 4、科目名なし試験2。
- 現Excelのsize/hashは過去の参考値と異なる。基本認識件数は一致するが、同一ファイルとは扱わない。
- 4/21～4/25は期間内blocking 0で保存可能。年間issueを保持しつつ期間外issueを保存判定から除外する修正は実Excelでも機能した。
- localStorage個人化がないため、学校全体時間割しか表示できない。
- 過去の個別フィードバックデータとバックアップはこのPCにない。
- faviconがないため、ローカル静的サーバーの `/favicon.ico` は404になる。時間割機能への影響はない。

## 12. Reconciliation with prior ChatGPT handoff

判定:

- A: 一致
- B: 実装が先行
- C: 文書・設計だけ先行
- D: Git管理外データ不足
- E: 認識と実装が矛盾
- F: 判断不能

| 項目 | 実状態 | 判定 | 根拠 |
| --- | --- | --- | --- |
| 公開静的構成 | 静的HTML/CSS/JS/JSON、GitHub Pages | A | ルート構成、README、public JS |
| course importer | Flask/openpyxl/PyInstallerのローカル管理ツール | A | `tools/course-importer/`、requirements、tests |
| course schema | 引き継ぎ記載の19 fieldを正式Schemaで運用 | A | `data/course.schema.json`、57件検証成功 |
| シラバス情報源 | 4分類に加え時間割由来 `timetable` も実装 | B | `importer.py`、prompt、tests |
| 制作物 | 分離JSON、3表示形式、管理・安全検証まで実装 | A | 8件、works service/tests |
| feedbackの目的 | 総合点・ランキングなし、改善/懸念検知 | A | feedback config/service/tests |
| feedbackの具体項目 | 多くは対応するが評価方法・テスト後feedback専用問はない | E | `feedback_config.py` |
| Excel parser | 年間parser、記号、差分、issue処理あり | A | timetable service/tests |
| 実Excel現在値 | 343日・1,281 entryを再現。現ファイルのsize/hashは過去参考値と異なる | A | 読み取り専用dry-run、file hash、sheet確認 |
| variant | `[]`をcourse variant、完全名mapping | A | parser、tests、public JSON |
| group | 保守的丸括弧判定、canonical mapping | A | parser、default config、tests |
| special | 6 kind分類、人間による明示変更 | A | service/routes/UI/schema/tests |
| course mapping | 45件がdefault configへ版管理されclone復元可能 | B | default config、clone fallback tests |
| runtime mapping | PC固有runtimeは不存在 | D | filesystem、`.gitignore` |
| 期間指定blocking修正 | server-side、payload、UI、testsで実装済み | A | `issues_for_range()`、44 timetable tests |
| JSON生成 | 月別生成、Schema、atomic write、backup、rollback | A | timetable service/tests |
| timetable公開データ | 2025-04の5日84件がGit管理済み | B | manifest/month JSON、commit `ac3ba08` |
| 日表示 | 実装・ブラウザ確認済み | A | public JS/CSS/browser |
| PC週間表示 | 5日×時限表を維持し、週間時のみ最大1480px、可読性改善、sticky headerを実装 | B | public JS/CSS/browser |
| スマホ週間改善 | 曜日accordionの全日collapsed初期状態、複数日展開、compact授業、タップ詳細を実装 | B | mobile browser実測、public JS/tests |
| localStorage個人化 | 未実装という認識と一致 | A | public JS、testで `localStorage` 不使用を確認 |
| Windows exe | 現行exeがGit管理されclone直後から存在 | B | dist file、commit、build tests |
| publish | 許可リスト、同期停止、安全なcommit/pushあり | A | publisher/tests |

全体判定: **おおむね一致**。特に公開時間割、clone用default mapping、現行Windows exeは引き継ぎ認識より実装が先行している。実Excelの基本認識件数と4/21～25の保存可能状態も再確認できた。主な不足は個別feedback、PC固有runtime/backupである。

## 13. Next recommended task

開発上の次候補は、スクリーンショット確認と今回差分の取り扱い決定後に行う **個人時間割**。

推奨範囲:

1. 学年、group、履修courseIdsの保存仕様を決める。
2. localStorageによる端末内だけの個人設定を実装する。
3. 学校全体表示と「自分の時間割」の切替を追加する。
4. 今回完成したdesktop表・mobile accordion・日表示を回帰テストで維持する。

実Excelは利用可能になった。年間全体を保存対象にする場合は、残る未登録科目8種類、group 4種類、科目名なし試験2件を人間が確認する。4/21～25だけを扱う場合は、現在のdefault mappingで期間内blocking 0・保存可能である。

## 14. Continuation readiness

- Git上のソースコード: 最新。`main` と `origin/main` は同一、ahead 0 / behind 0。
- 開発環境: 復旧済み。Python/Node/test/既存exeを使用可能。
- Git管理外運用データ: 一部不足。実Excelは存在するが、個別feedback、runtime metadata、過去backupがない。
- ChatGPT側の制作段階: おおむね一致。公開時間割とclone引き継ぎは想定より先行。
- 週間表示UX改善: 実装・検証済み。スクリーンショット確認後にGit操作を判断する。
- 次のUI開発: 個人時間割フェーズをこのPCで開始可能。
- 実Excelを使う時間割dry-run: 可能。4/21～25は保存可能判定、年間全体は14 blockingの解消が必要。

総合結論: **一部復旧が必要**。PC・スマートフォン週間表示の改善と実Excel dry-runはこのPCで実行できる。過去feedback運用の完全継続にはGit管理外データの移行が必要で、年間時間割全体の保存には残る14 blockingの人間確認が必要。
