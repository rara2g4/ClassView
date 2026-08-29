# ClassView PC Migration Checklist

ClassViewを別PCへ移すときは、公開データとGit管理外の学校運用データを分けて確認する。強制reset、clean、自動stash、rebase、force pushは行わない。

## 1. Gitを安全に同期する

```powershell
git status
git status --short --branch
git branch --show-current
git remote -v
git log --oneline --decorate -15
git fetch --all --prune
git rev-list --left-right --count HEAD...origin/main
```

`main`、working tree clean、local-only commitなし、単純behind、divergeなしのすべてを満たす場合だけ実行する。

```powershell
git pull --ff-only
```

未commit変更、local-only commit、divergeがあれば止めて人が確認する。

## 2. Git管理外データを移行する

前PCまたは学校管理元から必要なものだけを安全に移す。

- 実時間割Excel（例: `Timetable_edit.xlsx`）
- `tools/course-importer/runtime/`
- `tools/course-importer/feedback-data/`
- 必要な `tools/course-importer/backups/`

通常は移行不要:

- `.venv/`（requirementsから再生成）
- `tmp/`、`uploads/`、`logs/`
- `build/`、過去の検証exe

Excel、runtime、feedback-data、backupsはcommit/pushしない。

## 3. Python環境を正式定義から復旧する

```powershell
cd tools/course-importer
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-build.txt
.\.venv\Scripts\python.exe -m pip check
```

依存versionを単発で決めず、`requirements.txt` と `requirements-build.txt` を正とする。

## 4. ローカル状態を確認する

- `tools/course-importer/defaults/timetable-config.json`
- `tools/course-importer/runtime/timetable/config.json`
- `tools/course-importer/runtime/timetable/last-import.json`
- `tools/course-importer/runtime/timetable/import-metadata.json`
- `tools/course-importer/feedback-data/feedback.json`
- `tools/course-importer/dist/ClassView管理ツール.exe`
- `data/timetable/manifest.json`
- manifest記載の月別JSON

runtime configがなくても、versioned default configを初期値として使う設計である。snapshotがなくても公開時間割から差分比較用snapshotを復元する。

## 5. 自動テストを実行する

current canonical test list は [`DEVELOPMENT_RULES.md` の Full automated check](DEVELOPMENT_RULES.md#full-automated-check) とする。そこに記載された Python unittest と現在の全 JavaScript test file を実行する。

移行時には併せて次を確認する。

- repository 内の対象 JavaScript へ `node --check` を実行する。
- public JSON を UTF-8 で読み込み、対応する JSON Schema で検証する。
- test が temporary repository/data を使用し、実運用 JSON、runtime、Excel を変更していないことを確認する。
- 新しい大規模 test framework は移行監査だけを理由に追加しない。

## 6. 実Excelを読み取り専用で確認する

原本を変更せず、次を記録する。

- absolute path
- size
- mtime
- SHA-256
- sheet name

正式parserで本番保存なしのdry-runを行う。

- 年間: days、entries、mapped/unmapped、groups、blocking/warning/reference
- 必要期間: entries、mapped/unmapped、groups、blocking/warning/reference、save possible

過去の件数と異なる場合は、コード変更、Excel変更、runtime mapping不足を分けて調べる。

## 7. 公開時間割UIを確認する

repository rootで静的サーバーを起動する。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

確認例:

```text
http://127.0.0.1:8000/timetable.html?date=2025-04-21
```

確認項目:

- 日表示と週間表示
- 前日/翌日、前週/翌週
- URLの `date`
- 月跨ぎ
- empty state
- course detail link
- special/event/holiday等
- desktop/mobile responsive
- browser console error/warning

## 8. Windows管理ツールを確認する

- Git管理された現行 `ClassView管理ツール.exe` の存在、size、hashを確認する。
- 再ビルドする場合だけ `docs/build-windows.md` に従う。
- 移行監査中にtracked exeを不用意に上書きしない。
- 管理ツールが `127.0.0.1` だけで開くことを確認する。

## 9. PROJECT_STATUSとHEADを照合する

```powershell
git rev-parse HEAD
git status --short --branch
```

`docs/PROJECT_STATUS.md` のverified commit、テスト日時、運用データ状態を現在値へ更新する。予定をImplementedへ書かない。

## 10. 人間の確認まで公開しない

移行監査では次を実行しない。

- `git add`
- `git commit`
- `git push`
- 管理ツールの「ClassViewへ公開」
- 時間割の本番保存
- Excel原本の変更

最後に `git status` と `git diff --stat` を記録し、監査文書以外の差分がないことを確認する。
