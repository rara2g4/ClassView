# ClassView Domain Rules

> Status: **Human-reviewed project documentation**
>
> Last evidence review: 2026-08-28
>
> ここでは一般的なプログラミング知識から決められない、現行 ClassView 固有のデータ・運用ルールだけを整理する。理由や教育上の意図は、根拠がない限り補完しない。

記述の状態は次のように読む。

- **Current implementation**: current code、Schema、test、Git 管理設定で確認した挙動
- **Project rule**: 人間レビューによって明示的に決定された ClassView の製品・domain 方針。未実装の場合もある
- **Planned / implementation pending**: 決定済みだが現在の code、Schema、validation が未対応の事項
- **Temporary interpretation**: code/Schema 自身が provisional としている解釈
- **Unknown / needs confirmation**: repository だけでは正式判断できない事項
- **Historical snapshot**: 過去時点の実装・調査記録。現在状態の source of truth ではない

Current implementation の証拠と Project rule の権威は別の判断軸である。現行挙動が実装されているという理由だけで Project rule へ昇格させず、Project rule が未実装であることを理由に現行実装より下位の方針とも扱わない。

## Course

### Current implementation

公開サイトの授業情報は [`data/courses.json`](../data/courses.json) の `courses` 配列から読み込む。授業 1 件は [`data/course.schema.json`](../data/course.schema.json)（JSON Schema Draft 2020-12）で検証し、未定義フィールドを許可しない。

必須キーは次の 6 個。

- `id`: `^[a-z0-9]+(?:-[a-z0-9]+)*$` に一致する一意 ID
- `title`: 空でない授業名
- `summary`
- `category`
- `grade`
- `classStyle`

`summary`、`category`、`grade`、`classStyle` はキー必須だが空文字を許す。公開 UI は空の値を表示しない。

任意キーは次の 15 個。

- 文字列または `null`: `academicYear`、`instructor`、`courseType`、`prerequisites`、`learningGoals`、`classFlow`、`outcomes`、`suitableFor`
- 0 以上の数値または `null`: `credits`、`totalHours`
- 文字列配列または `null`: `topics`、`tools`、`assignments`
- 専用オブジェクト配列または `null`: `schedule`、`images`

`academicYear` は任意 key で、値がある場合は4桁 ASCII 数字の文字列、値がない場合は `null` を許す。`instructor` は人名だけでなく、シラバスに記載された担当者の役割も許す記述になっている。`credits` と `totalHours` は AI 推察・提案を禁止している。`totalHours` の `actualElapsedHours` 解釈は Schema 上で `provisional: true` である。

`data/archived-courses.json` は同じ course Schema を使う。アーカイブは公開 `courses` から archive へ移動し、復元は逆方向へ移動する。次年度版は前年度版を残したまま別 ID の course として追加する。

## Academic year identifiers

### Current implementation

- course の `academicYear` は任意 key で、値がある場合は `^[0-9]{4}$`、値がない場合は `null` とする Schema と importer validation がある。
- course works の `academicYear` は必須 key だが `null` を許し、文字列値は `^[0-9]{4}$` とする Schema がある。works producer は対応する course の検証済み年度をそのまま保存する。
- feedback CSV input は NFKC 正規化後の `YYYY` または `YYYY年度` を受け付け、private record の `academic_year` と public summary の `academicYear` には4桁 ASCII 数字だけを保存する。保存済み private/public data の年度を入力時の許容形式へ再解釈しない。
- timetable manifest の `academicYear` は時間割全体の学年度・期間を表す別 contract で、現在の Schema は `YYYY` または `YYYY-YYYY` を許可する。

### Project rule

授業に紐づく年度識別子は、値が存在する場合、数値ではなく4桁 ASCII 数字の文字列 `^[0-9]{4}$` とする。例: `"2025"`、`"2026"`。

この rule は少なくとも course、course works、feedback の授業年度へ適用する。現在 `string | null` の field は、この rule だけを理由に `null` 禁止へ変更しない。timetable manifest の `academicYear` は時間割全体の学年度・期間を表す別 contract であり、同じ key 名であることを理由にこの rule を適用しない。

### Implemented contract

course/works Schema、course importer、管理 form、works producer、feedback normalization/private store/public summary validation でこの形式を強制する。`"0000"` も正規表現上は有効であり、暦上の意味を追加推測して拒否しない。timetable manifest の既存 contract は変更しない。

## totalHours — Temporary interpretation

現行シラバスの `totalHours` は、暫定的に「実時間としての合計 n 時間」として扱う。この解釈は人間レビュー済みだが、来年度以降にシラバス形式が変わる可能性があるため provisional のまま維持する。現在の Schema の `interpretation: actualElapsedHours`、`provisional: true` と一致する。

## Course variants

### Current implementation

- 時間割科目内の角括弧 `[A]`、`[B]` 等は `courseVariantTags` に分離する。
- variant 表記は `subjectName` には残り、`subjectBaseName` からは除かれる。
- `data/course.schema.json` に独立した `variant` フィールドはない。公開 course 側では、現状は title と ID に variant を含む授業がある。
- subject mapping は variant を含む完全な正規化名称を key にする。base name が同じでも自動的に同じ `courseId` へ対応しない。
- 現在の default mapping には、`AfterEffects[A]` と `AfterEffects[C]` を別 course ID へ対応する例と、`Blender[B][D]` を 1 course ID へ対応する例の両方がある。

したがって、「variant 1 個につき必ず別 course ID」も「同じ base name は必ず同じ course」も現行実装ではない。完全名称ごとの明示 mapping が正である。

### Project rule

- variant によって授業内容・シラバスが異なる場合は別 course として扱う。
- `[B][D]` 等、同じ授業内容・シラバスを複数 variant で共有する場合は1 course でもよい。
- course の分割単位は tag の個数ではなく、実際の授業内容・シラバスとする。
- timetable mapping は variant を含む完全名称の明示 mapping を正とする。
- base name だけから自動的に同一 course へまとめない。

## Groups

### Current implementation

- 丸括弧・全角丸括弧のうち、保守的な class/group 形式だけを group 候補にする。例: `(1組)`、`(A組)`、`(1・2組)`、`(全組)`。
- `(2年)` や通常の補足は group にせず `subject-qualifier` として科目名に残す。
- raw 表記は `groupMappings` で `canonicalGroups` の ID へ明示対応し、公開 entry には canonical の表示名を `groupTags` として保存する。
- 旧形式の裸 key は、角括弧由来か丸括弧由来か判断できないため自動再利用しない。`legacyGroupTags` に監査用として保持するだけである。
- 現在の versioned default は 1組、2組、A組、B組の 4 canonical group と、それぞれの丸括弧 alias を持つ。

group は受講対象、variant は授業の段階・区分として別データである。

### Project rule

- group の正式一覧を code や Schema へ固定しない。年度・学校運用による変更を許容する。
- canonical group は `canonicalGroups` の設定として管理する。
- raw 表記は canonical group へ明示 mapping する。
- `(1・2組)` 等の複合 group も、自動分解ではなく明示 mapping で扱う。
- variant と group は別概念として維持する。
- 現在の1組、2組、A組、B組は versioned default であり、永続的な学校全体の固定一覧ではない。

## Instructor tokens

### Current implementation

時間割科目内の `【...】` は講師情報として分離し、`instructors` 配列へ保存する。値は個人名に限定されず、`専任` 等の役割表記も保持する。複数値は `,`、`、`、`/`、`・` で分割する。

## Timetable special entries

### Current implementation

公開月別 Schema の `kind` は次の 6 種類。

| `kind` | `courseId` | 現行の扱い |
| --- | --- | --- |
| `class` | 必須の course ID | 通常授業。未登録・対応切れは blocking |
| `exam` | course ID または `null` | 通常授業へ対応する試験と、明示分類された対応なし試験の両方を許可 |
| `special` | `null` | 単発講座・特別授業 |
| `event` | `null` | 行事・説明会 |
| `holiday` | `null` | 休暇 |
| `other` | `null` | その他 |

parser は `試験:`、休暇系 keyword、行事系 keyword を限定的に認識する。一方、`special` を名称だけで自動判定する処理はなく、職員が `timetableItemMappings` へ完全名称単位で明示分類する。明示 item mapping は通常授業 mapping より優先し、同じ key を両方へ登録できない。

色だけを kind、確定状態、変更の根拠にはしない。候補日や `[予定]` は `status: tentative` として warning にする。

### Project rule: keyword classification

- exam / event / holiday 等の keyword 判定は正式な学校分類ルールではなく、入力支援用 heuristic とする。
- heuristic の結果だけで最終分類を確定せず、人間の確認と完全名称の明示 mapping を正とする。
- `special` も名称だけで安易に自動分類しない。
- heuristic と明示 mapping が異なる場合の正式な運用結果は、人間が確認して保存した明示 mapping とする。

### Implementation pending

現行 parser にはこの Project rule との差が残る。「説明会」「休暇」等の一部 keyword から `event` / `holiday` 等を直接 `kind` として確定し、専用の human-confirmation gate や明示 item mapping がないまま保存可能になる場合がある。現在の keyword 分類を学校の正式分類規則または人間確認済みの最終判断とみなさない。

## Timetable mapping and save

### Current implementation

- 類似名や base name 一致だけで `courseId` を決めない。完全一致候補も表示用であり、人が mapping を保存する。
- mapping は `subjectMappings`、非授業分類は `timetableItemMappings`、group は `canonicalGroups` と `groupMappings` に分離する。
- PC 固有の更新は `runtime/timetable/config.json` に保存する。存在しなければ Git 管理された `defaults/timetable-config.json` を初期値にする。
- 前回 snapshot がなければ、公開済み `data/timetable/` から差分比較用 snapshot を復元する。
- Excel 全体の issue は preview に保持するが、部分保存を止めるのは指定期間内 issue と明示された global structural issue である。
- blocking が残る期間は保存できない。warning が残る期間は確認済み指定が必要。reference は保存を止めない。
- 保存は月別 JSON、manifest、periods を Schema 検証し、一時ファイル置換と backup/rollback を行う。保存しても自動公開しない。

## Syllabus AI

### Current implementation

#### Source types

中間 JSON の `fieldMeta.<field>.sourceType` は次の 5 種類。

| 値 | 意味・制約 |
| --- | --- |
| `explicit` | シラバス等に明示された値 |
| `inferred` | 同じシラバス内から直接導ける値。根拠と人間確認が必要 |
| `proposed` | support mode で一般知識等を使った下書き。理由と項目ごとの review が必要 |
| `timetable` | 時間割から引き継いだ候補。`title`、`academicYear`、`instructor` だけ |
| `missing` | 有効な値がない項目 |

`manual` は source type ではない。管理画面で人が変更したフィールドは `manualFields` として検証中に別管理され、公開 course JSON には metadata を保存しない。

#### Allowed inference

`inferred` を許可するフィールド:

- `summary`
- `learningGoals`
- `outcomes`
- `topics`
- `suitableFor`
- `assignments`
- `classFlow`

`proposed` を許可するフィールド:

- `summary`
- `category`
- `classStyle`
- `prerequisites`
- `learningGoals`
- `classFlow`
- `outcomes`
- `suitableFor`
- `assignments`

strict mode では `proposed` を禁止する。support mode でも、ID、title、年度、講師、単位数、時間数等の事実値を proposed で生成できない。`credits` と `totalHours` は `inferred` も `proposed` も禁止する。

#### Registration gates

- Schema 適合
- 準備時 course ID との完全一致
- 公開中・archive 双方との ID 非重複
- 全 Schema field の `fieldMeta`
- inferred の根拠と確認
- proposed の `accepted` / `edited` / `rejected` review。`pending` は不可
- 最終検証後に内容が変わっていないこと
- 登録直前の再検証

`fieldMeta`、reason、proposal review 状態は公開 `courses.json` に混入させない。

## Timetable source

### Current implementation

現行 README、管理マニュアル、parser は、学校の時間割 Excel を日付別時間割の入力元として扱う。ClassView は Excel を変更せず、解析・正規化・mapping・review 後の静的 JSON を公開する。公開 JSON だけから元 Excel の全情報や補足欄を復元することはできない。

## Feedback

### Current implementation

- 公開授業詳細は、course ID、授業名、年度を事前入力した共通 Google Form への link を生成する。
- 管理ツールは Google Sheets からダウンロードした UTF-8 CSV を取り込む。Google Forms/Sheets API との直接同期はない。
- CSV そのものは保存せず、正規化した個別回答を Git 管理外 `feedback-data/feedback.json` に保存する。
- 同一 response ID は重複登録しない。未受講回答は保持するが集計対象から除外する。
- 個別回答、自由記述、職員メモ、確認状態は公開用集計へ含めない。
- 公開用集計は集計対象回答 3 件以上で生成でき、回答数、学習成果集計、難易度、課題量、授業形式の分布だけを含む。
- 現行集計は総合点やランキングを生成しない。

公開用 summary の生成・publish allowlist は実装済みだが、公開サイトでその JSON を表示する処理は現在確認できない。

### Project goal

feedback の第一目的は、学校職員が、学生から観測できる学習・授業上の情報を用いて、改善や確認が必要な授業を把握することである。

### Desired future direction

十分に匿名化・集計され、学生の授業選択にも有用な情報は学生へ還元できる状態を目指す。ただし、職員の運用負担、review 負担、公開内容、公開基準が未確定であるため、public feedback summary を学生へ必ず公開することは正式仕様にしない。

## Student works

### Current implementation

- `assignments` はシラバス上の課題・制作物の例であり、実際の制作物ではない。
- 実際の制作物は `data/course-works.json` と `course-works.schema.json` で course から分離する。
- 表示対象は `courseId` と `academicYear` が course と一致する work。course の年度がない場合は work 側も `null` を使う。
- `image` と `url` は少なくとも一方が必要。管理画像は規定の `assets/works/<course>/<year>/<hash>.<ext>` だけを許可する。
- 管理ツールは JPEG/PNG/WebP、size、signature、dimensions、外部 HTTP(S) URL、掲載確認を検証する。
- course の rollover で works を自動コピーしない。course の archive・完全削除でも works を自動削除しない。
- 現在 Git 管理されている 8 件は、データ本文と README が「架空サンプル」と明記しており、実在する学生作品として扱わない。

### Project rule for real student works

- 実在する学生制作物の掲載には掲載許可を必要とする。
- 実在する学生制作物には `academicYear` を記録する。
- 本人または学校側から適切な削除要請があった場合に削除できる運用にする。
- 現在 Git 管理されている架空 sample は、引き続き sample として扱う。

現在の works Schema は `academicYear: null` を許しているため、「実在制作物では年度必須」という project rule は Schema 上の必須制約としては未実装である。正式な実在作品運用へ移る際は、運用 validation または data contract の実装範囲を別途決める。

## Unknown / needs confirmation

- `[A]`〜`[D]` 各 tag の学校固有・教育上の具体的な意味。course 分割基準は決定済みだが、tag 自体の意味はこの repository では未記録。
- feedback を学生へ還元する場合の具体的な公開内容、匿名化基準、最小回答数、review 手順、公開判断者。
- 実在制作物の卒業後の自動保持期間、一律の保存年限、詳細な権利処理手順。
- 実在制作物の `academicYear` 必須 rule を、Schema、管理画面 validation、運用手順のどこで強制するか。
