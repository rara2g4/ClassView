# ClassView Domain Rules

> Status: **Human-reviewed project documentation**
>
> Last evidence review: 2026-10-14
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

## Timetable target grades

### Current implementation

- 公開月別 Schema では timetable entry の `grades` は必須の整数配列で、各値を1〜3に制約するが、空配列も許可する。
- parser は学年欄が空の場合に `grades: []` を生成する。`全学年` は `grades: [1, 2, 3]` として生成する。
- 現行の学校全体時間割は `grades` を理由に entry を除外しないため、`grades: []` の entry も表示対象に残る。現行 public UI は空配列に対象学年ラベルを付けない。

### Project rule

- `grades: []` は「全学年対象」ではなく「対象学年未確認」を意味する。
- 学校全体時間割では、対象学年が未確認であることだけを理由に entry を非表示にしない。
- 個人時間割では、`grades: []` を1年・2年・3年のいずれとも一致させず、必修授業の自動反映、特定学年向け candidate の自動判定、学年 filter の各学年への分類に使用しない。
- `grades: []` の entry 自体を存在しないものとして扱わず、対象学年を限定しない「すべて」等の確認導線では「対象学年未確認」と明示して表示できるようにする。
- 正式な対象学年が確認された場合は、個人時間割側で補完・推測せず、timetable entry の `grades` を正しい値へ修正する。

Phase 1 の個人時間割 domain logic は、`grades: []` を本人の対象 entry として採用せず、必修導出・slot 占有・conflict・entry visibility から除外する。学校全体時間割への production UI 接続と、未確認学年を確認する表示導線は次 phase の Implementation pending である。空配列を許可する現行 Schema contract 自体は変更していない。

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

## Personal timetable — Project rule / phased implementation

個人時間割は人間 review 済みの Project rule である。Phase 1 の domain logic、state、storage は production module として実装済みだが、公開 page の本格 UI と data loading への接続は未実装である。

### Phase 1 — Current implementation

- `js/personal-timetable.js` は DOM に依存せず、profile validation、versioned `localStorage`、reconcile、必修導出、effective enrollment、conflict、entry visibility、grade/category filter を提供する。
- storage key は `classview.personalTimetable.profile`、現在の `schemaVersion` は `1`。保存 field は `schemaVersion`、`academicYear`、`term`、`grade`、`homeroom`、`manualSelectedCourseIds`、`dataVersion`、`updatedAt` に限定する。
- `dataVersion` は `site` と `timetable` の version snapshot を持つ。氏名、学籍番号、email、必修 course ID、filter UI の一時状態は保存しない。
- profile 未設定、JSON 破損・`schemaVersion` 欠落・型不正を含む profile 契約不適合、整数の未対応 future schema version、storage 利用不能、read/write failure を異なる state として返し、例外で学校全体時間割を停止させない。
- effective enrollment の public API は必ず current context の `academicYear + term` で period reconcile を行う。保存済み期間と異なる場合や current period がない場合、旧 `manualSelectedCourseIds` を active selection として返さず、再設定が必要な state にする。同期間の unknown course ID は stale selection として残し、別 course へ置換しない。
- public timetable data に `term` field は存在しない。Phase 1 module は表示文字列や日付から前期 / 後期を推測せず、呼び出し側から明示された period context だけを検証する。UI integration で利用する machine-readable term source は未決定である。
- public `groupTags` の意味が曖昧な場合に備え、所属組として明示確認された group 集合を呼び出し側が渡す。指定のない entry は全組対象、明示集合内の完全一致は対象、それ以外の tag は `unknown` として自動一致させない。同一 `courseId` に別学年・別組の entry があっても、本人に明示一致した entry だけをcourse slotへ集約し、表示・slot占有・conflictへ使う。
- module は現行 `index.html` / `timetable.html` から読み込まれておらず、学校全体時間割の表示・URL・操作は変更していない。

### Profile and enrollment period — Project rule

- 学生は学年を1つ、所属組を1つ設定する。
- 履修設定は「学年度 + 前期 / 後期」単位で管理する。例: `2026年度・後期`。
- 期間が変わった場合、前期間の履修 course を新期間へ自動移植せず、再設定を案内する。
- A/B/C 等の授業内 group は所属組とは別概念である。詳細運用は未確認のため Deferred とし、MVP で所属組として推測・自動判定しない。

### Required courses and cohort matching — Project rule

次をすべて満たす course だけを必修として自動反映する。

- course の `courseType` が文字列 `必修` と厳密一致する。
- timetable entry の対象学年が本人の学年と一致する。
- timetable entry の対象組が本人の所属組と一致する。

`courseType` が `選択`、`選択必修`、その他の値、`null`、未確認の場合は自動必修扱いせず、本人が履修 course として選択する。個人時間割のためにシラバス由来の `courseType` 表記自体を書き換えない。必修 course ID は個人設定へ保存せず、current course / timetable data から導出する方向とする。

所属組の基本的な一致規則は次のとおり。

- entry に所属組の指定がない場合は全組対象とする。
- entry の所属組指定と本人の所属組が一致する場合は対象とする。
- A/B/C 等の授業内 group を本人の所属組として解釈しない。

現在の public `groupTags` は、所属組と授業内 group を完全には区別できない。Phase 1 は明示確認された所属組以外を `unknown` として安全側に倒す。自動一致できる範囲を広げる場合の machine-readable contract と公開データ表現は Implementation pending であり、この変更では新しい Schema を追加しない。

### Course selection and conflicts — Project rule

- 選択済み course が占有する全曜日・時限と candidate が占有する全曜日・時限を比較し、1時限でも intersection があれば conflict とする。
- conflict する candidate は、選択操作前から選択不可であること、競合元の授業名、競合する曜日・時限を確認できるようにし、原則選択不可とする。
- 競合元の選択 course を解除した場合は、該当 candidate を即座に再選択可能にする。
- 必修と選択 course が競合する場合は選択 course 側を選択不可にする。
- 必修同士が競合する場合はどちらも自動解決・自動削除せず、学校側の時間割確認が必要な異常状態として表示する。

### Non-course entries — Project rule

- `holiday`、`event`、`special`、`other` は、entry の対象学年・組が本人と一致する場合に個人時間割へ表示する。
- `exam` に `courseId` がある場合は、本人がその course を履修している場合に表示する。
- `exam` に `courseId` がない場合は、entry の対象学年・組が本人と一致する場合に表示する。

この表示 rule は timetable entry の current `kind` を利用するが、keyword heuristic による現行 kind 分類を学校の正式分類 rule へ昇格させない。上記の既知の Implementation pending を維持する。

### Candidate filters — Project rule

- 対象学年 filter の machine-readable source は timetable entry の `grades` とする。
- 3年生は3年生向けを中心に確認し、必要に応じて2年生・1年生向け course を追加表示できるようにする。filter は履修可能性そのものを変更しない。
- 授業分野は1 course につき主な分野を1つとし、既存の `course.category` を正式な filter source とする方向とする。
- 学年・分野 filter は未選択 candidate を探すための補助機能であり、必修と選択済み course を意図せず見失わせない。
- filter 条件外の選択済み course も選択状態を維持し、conflict 判定では引き続き全占有時限を使用する。

正式な `category` は次の10分類とする。

1. プログラミング・Web・情報システム
2. AI・データ
3. ネットワーク・セキュリティ
4. デザイン・写真・映像
5. 3DCG・VR
6. ゲーム制作
7. eスポーツ・配信・イベント
8. ドローン・ロボット・ものづくり
9. 総合制作・プロジェクト
10. キャリア・資格・基礎教養

category の運用 rule は次のとおり。

- 人間が確認して保存した category を正式値として扱う。
- AI proposal も人間が `accepted` または `edited` として確認した後は正式 category としてよい。
- frontend は授業名等から未確認 category を推測しない。
- category 未確定の course も「すべて」では表示する。
- `未分類` を11番目の正式分類として追加しない。

Phase 1 の frontend filter logic は、上記10分類との完全一致だけを特定 category に含め、空、`null`、missing、unknown legacy value は「すべて」でだけ残す。grade filter は entry の `grades` だけを使い、`grades: []` を1〜3年へ分類しない。必修・手動選択済み course は candidate filter の条件外でも effective enrollment から除外しない。

現行 course Schema は `category` を自由な文字列として許可し、保存後の course JSON に `fieldMeta` や proposal review 状態を残さない。正式10分類と人間確認済み保存を管理画面・validation・保存処理で保証する具体的実装は引き続き Implementation pending とする。

### UI direction — Project rule

- Desktop は prototype C の高密度週間 grid、Mobile は prototype E の1コマ集中型 layout を基準にする。両者を同一 DOM / layout に強制しない。
- 1コマ最大8 candidate 程度を扱えることを前提とし、授業名、選択・conflict 状態、courseType の順に情報を優先する。
- `必修` は短い badge や lock 等で区別し、通常の `選択` 表示や長い courseType 表示で授業名を押し潰さない。
- conflict の hover / keyboard focus 等で週間 grid の上端を動かさず、Desktop の conflict 情報領域は内容量による layout shift を起こさない。
- 色だけに意味を依存せず、keyboard と touch の双方で状態と理由を確認できるようにする。
- Mobile は Desktop の週間 grid を単純縮小しない。

prototype C / E と統合 prototype は Human UX review 用の artifact であり、production 実装の証拠ではない。

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
