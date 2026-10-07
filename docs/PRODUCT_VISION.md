# ClassView Product Vision

> Status: **Human-reviewed project documentation**
>
> Last evidence review: 2026-09-12
>
> この文書は、現在実装済みの役割と、人間レビューで決定した製品方針・roadmapを区別して記録する。未確認の製品判断は `Unknown / needs confirmation` に残す。

## Product purpose — Project rule

ClassView は、**授業選択支援を出発点として、在学中の学生が授業・時間割を中心に学校生活で日常利用できる情報基盤を目指す**。

現時点では、学校生活全般を扱う巨大な portal にすることまでは確定しない。今後追加する機能も、授業・時間割を中心とした日常利用との関係を確認して判断する。

## Primary users — Project rule

- 公開サイトの主要利用者は、現在その学校に在学している学生とする。
- localhost 管理ツールの主要利用者は学校職員とする。
- 保護者、入学希望者、外部講師等は公開サイトへアクセス可能であっても、現時点では主要 target として定義しない。

## 確認できる現在の役割

[`README.md`](../README.md) は ClassView を「時間割から気になる授業を見つけ、詳しい学習内容や授業の進め方を確認するための授業選択支援サイト」と定義している。現在の実装では、次の役割を確認できる。

- 学生日別・週別時間割の表示
- 授業一覧、キーワード検索、分野・授業形式フィルター
- 授業詳細、授業回、学習内容、授業形式等の表示
- 授業ごとの制作物の表示
- 授業 ID・授業名・年度を事前入力した Google Forms へのフィードバック導線
- 学校職員による授業、制作物、feedback、時間割のローカル管理
- review 済み公開データの GitHub Pages への明示公開

公開サイトは情報閲覧を担い、編集・個別回答・職員メモ・Git 操作は localhost の管理ツール側に分離されている。

## Current implementation: user-facing roles

### Students

公開 HTML の見出し、文言、ナビゲーション、および README から、学生が時間割、授業一覧、授業詳細、制作物を閲覧し、フィードバックフォームへ移動する利用者であることを確認できる。

### Staff

管理画面テンプレート、操作マニュアル、Flask route から、学校職員が次を行う利用者であることを確認できる。

- シラバス PDF を基に授業情報を準備・review・保存する
- 公開中授業の編集、次年度版作成、アーカイブ、復元、完全削除を行う
- 制作物を管理する
- Google Forms の回答 CSV を取り込み、個別回答と要確認事項を扱う
- 時間割 Excel を解析し、mapping、警告、差分を確認して保存する
- 未公開変更を確認し、明示操作で GitHub Pages へ公開する

公開サイトに学生・職員アカウントや権限管理は実装されていない。職員向け境界は localhost 専用管理ツールで実現している。

## 明示されている利用フロー

既存 README と操作マニュアルに明示され、コードでも対応を確認できるフローは次のとおり。

```text
学生:
時間割 -> 授業名 -> 授業詳細 -> 制作物 / feedbackフォーム

職員（授業）:
PDFページ抽出 -> ChatGPT用指示生成 -> AI結果を貼付
-> 情報源・提案review -> Schema検証 -> ローカル保存
-> 未公開変更の確認 -> 明示公開

職員（時間割）:
Excel選択 -> 解析 -> mapping・issue・差分review
-> 対象期間をローカル保存 -> 未公開変更の確認 -> 明示公開
```

管理ツールは AI API を直接呼び出さない。現行フローは ChatGPT 用の指示と抽出 PDF を準備し、利用者が返却 JSON を貼り付ける方式である。

## Product decisions

- 時間割を ClassView の恒久的な主要入口とする。root `/` が時間割の日表示であることは、現在実装と一致する product decision である。
- 授業一覧・検索・filter・詳細への直接導線も維持し、時間割を経由しない授業探索を可能にする。
- 授業・時間割を中心に日常利用できる情報基盤を目指すが、学校生活全般を無制限に集約することは現時点の決定事項ではない。

## Feedback direction

### Project goal

feedback の第一目的は、**学校職員が、学生から観測できる学習・授業上の情報を用いて、改善や確認が必要な授業を把握すること**である。

### Desired future direction

十分に匿名化・集計され、学生の授業選択にも有用な情報は、学生へ還元できる状態を目指す。ただし、職員の運用負担、review 負担、公開内容、公開基準が未確定であるため、public feedback summary を学生へ必ず公開することは現時点の正式仕様にしない。

### Current implementation

公開用 feedback 集計 JSON を生成・publish する処理はあるが、現在の公開 JavaScript にその集計を表示する consumer はない。

## Personal timetable — Planned roadmap

個人時間割を正式 roadmap に含める。Phase 1 として profile、履修、必修導出、conflict、entry 表示、candidate filter、`localStorage` の UI 非依存 logic は実装済みである。本格 UI と学校全体時間割への接続は次 phase の implementation pending である。

### Project rule: role and first-use behavior

- public site の static 構成を維持する。
- 学生は学年を1つ、所属組を1つ設定する。
- 個人時間割の履修設定は「学年度 + 前期 / 後期」単位で扱い、期間が変わった場合は前期間の履修 course を自動移植せず、再設定を案内する。
- 未設定端末では学校全体時間割を通常表示し、「自分の時間割を設定」する導線を示す。初回設定は強制しない。
- 設定済み端末では個人時間割を標準表示する。
- 設定の有無にかかわらず、「自分の時間割」と「学校全体」を切り替えられるようにする。
- 個人時間割は、必修授業の自動反映と本人が選んだ履修 course を基に、日常的に確認する授業を絞り込む。

### Project rule: UI direction

- Desktop は、人間 review 済み prototype C の「曜日 × 時限を高密度な週間 grid で一覧する」考え方を基準にする。
- Mobile は、人間 review 済み prototype E の「1コマへ集中しながら週間内の位置を把握する」考え方を基準にし、PC 用週間表を単純縮小しない。
- 1コマ最大8件程度の履修 candidate を想定し、高密度時も courseType より授業名を優先する。
- conflict の説明内容が変わっても週間時間割を上下させず、Desktop の情報領域で layout shift を起こさない。
- prototype は interaction と layout の検討材料であり、production の Current implementation ではない。

### Phase 1 storage boundary — Current implementation

- `js/personal-timetable.js` は、学年、所属組、学年度、前期 / 後期、本人が選んだ履修 course、data version、更新時刻を browser `localStorage` へ安全に保存・読込する契約を持つ。
- 必修 course ID は保存せず、current course / timetable data から毎回導出する。
- 期間変更時は旧期間の手動選択を引き継がず、再設定が必要な state を返す。削除済み course ID は別 course へ置換せず stale selection として返す。
- JSON 破損、契約不適合、未対応 schema version、storage 利用不能、write failure は profile 未設定と区別した state になる。
- 氏名、学籍番号、email、login、password 等の個人識別情報を要求・保存しない。
- 当面、account 同期と server-side personalization は非目標とする。

この storage/domain module は現行 page からまだ読み込まれない。学校全体時間割から個人向け表示へ絞り込む UI、破損・利用不能時の表示文言、初回設定画面は次 phase で接続する。

## 現在確認できる非目標・境界

### Current implementation: not implemented

- 公開サイトのログイン、学生アカウント、職員アカウント
- 公開サイトからの授業編集や時間割編集
- 公開サイトのデータベース、常時稼働 API
- 公開サイト内の口コミ投稿
- 学年、group、履修授業による個人時間割の production UI

### Current project non-goals

- 個人時間割の account 同期
- server-side personalization
- 名前、login、password を必要とする個人時間割
- 学校生活全般を無制限に扱う巨大な portal とすること

## Unknown / needs confirmation

- feedback を学生へ還元する場合の具体的な公開内容、匿名化基準、最小回答数、review 手順、公開判断者
- 授業・時間割以外の機能を日常利用の情報基盤へ追加する際の具体的な優先順位と範囲
- 所属組とは別に存在する A/B/C 等の授業内 group の詳細運用と、個人時間割での選択・表示方法
