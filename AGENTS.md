# ClassView

ClassView は、授業選択支援を出発点として、在学中の学生が授業・時間割を中心に学校生活で日常利用できる情報基盤を目指す。公開側は静的サイト、学校職員向けの管理側はローカル専用ツールで構成される。

このファイルと、下記の5文書を人間レビュー済みの canonical project knowledge として扱う。`Current implementation` は現行 code、Schema、test、Git 管理設定等から確認する実装事実、`Project rule` は人間が明示的に決定した製品・domain 方針であり、両者は別の判断軸である。実装済みという理由だけで挙動を Project rule に昇格させず、未実装の Project rule を実装済みとしても扱わない。未確認の製品判断や学校事情は補完しない。

## Before making changes

最初に次を読む。

1. [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) — 現在確認できる役割、利用者、未確認の製品判断
2. [`docs/DOMAIN_RULES.md`](docs/DOMAIN_RULES.md) — Course、variant、group、時間割、AI、feedback、制作物のルール
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 公開サイト、管理ツール、データフロー、Git 管理境界
4. [`docs/DEVELOPMENT_RULES.md`](docs/DEVELOPMENT_RULES.md) — 実装、データ、Git、公開、テストの安全ルール
5. [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) — 実装済み範囲、部分実装、ローカル運用状態、既知の制約

`docs/PC_MIGRATION_CHECKLIST.md`、README、操作マニュアル等は用途別の補助文書である。`*-report.md` 等の過去実装・調査報告は `Historical snapshot` であり、現在状態の source of truth にはしない。

作業内容に応じて、各文書からリンクされた Schema、README、テスト、サービス実装も確認する。時間割データに関する判断では、対象の Excel と現在の runtime 設定を実際に確認する。

## Core principles

- 公開側は HTML、CSS、JavaScript、JSON、画像からなる GitHub Pages 向け静的サイトであり、公開側に Flask、API、DB、ログイン機能はない。
- 職員向け管理ツールは `tools/course-importer/` の localhost 専用 Flask アプリで、公開サイトから分離されている。
- 公開授業情報は `data/courses.json` を読み、授業 1 件の契約は `data/course.schema.json` を正とする。
- 現在の `data/courses.json` は開発・表示確認用の非本番データセットであり、正式公開前に実際の学校授業・正式シラバスに基づくデータへ全面的に置換する。
- Project rule として、時間割は学校の Excel を読み取り、明示 mapping と人間 review を経て `data/timetable/` の静的 JSON へ保存する。名称の類似だけで `courseId` を決めない。keyword heuristic に残る現行実装との差は `PROJECT_STATUS.md` を確認する。
- AI 変換では情報源を区別し、事実値を創作しない。推察・提案は許可フィールドと review 条件を満たさない限り登録しない。
- 生の feedback、職員メモ、runtime、Excel、backups、logs は公開データと分離し、Git 管理しない。
- 管理ツールでの保存と GitHub Pages への公開は別操作である。公開は明示操作時だけ許可リスト対象を stage、commit、push する。

詳細は [`docs/DOMAIN_RULES.md`](docs/DOMAIN_RULES.md) と [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) を参照する。

## Working rules

- 変更前に、同じ機能の既存コード、Schema、設定、テスト、文書を検索し、重複実装を作らない。
- コードから判断できない学校固有ルール、製品目的、UX 意図は推測せず、「要ユーザー確認」として返す。
- 公開 JSON や local-only 運用データを、調査・テストの副作用で書き換えない。
- 機能変更時は関連テストを更新し、最低限、対象 Python/JavaScript テスト、JSON Schema、JavaScript 構文を確認する。UI 変更は実ブラウザでも確認する。
- `git add .`、force push、`reset --hard`、`git clean`、自動 rebase、自動 stash、自動競合解決を行わない。
- ユーザーの明示指示なしに stage、commit、push、管理ツールの公開処理を行わない。
- 不具合を見つけても依頼範囲外なら勝手に修正せず、根拠と影響を報告する。

詳細な完了条件とテスト対応表は [`docs/DEVELOPMENT_RULES.md`](docs/DEVELOPMENT_RULES.md) を参照する。
