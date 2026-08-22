# ClassView管理ツール Windowsビルド手順

`tools\course-importer\dist\ClassView管理ツール.exe` に、動作確認済みの現行版をGit管理しています。新しいWindows PCでもclone直後から起動でき、必要に応じて次の手順で同じ構成のexeを再生成できます。

## 必要なもの

- Windows 10または11
- Python 3.9以上（`py -3` または `python` で起動できること）
- 初回の依存関係取得に使うインターネット接続

Gitは公開機能には必要ですが、exeの起動・授業確認・時間割確認だけなら必須ではありません。

## ビルド

1. リポジトリをcloneします。
2. `tools\course-importer\build_windows.bat` をダブルクリックします。
3. スクリプトが `.venv` を作り、実行用依存関係とPyInstallerをインストールします。
4. 完了後、次のファイルを確認します。

```text
tools\course-importer\dist\ClassView管理ツール.exe
```

PowerShellからテストも含めて実行する場合は、リポジトリルートで次を実行します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\course-importer\build_windows.ps1 -RunTests
```

ビルドはPyInstallerの `--onefile --noconsole` を使用します。`templates/` と `static/` はexeへ同梱します。更新対象の `data/`、JSON Schema、`runtime/`、`backups/`、設定はexe内へ入れず、リポジトリ内の書き込み可能な場所を使用します。そのため、exeは `tools\course-importer\dist\` に置いたまま起動してください。

ClassView固有の設定はGit管理されたPowerShellスクリプトに記載しています。PyInstallerが生成する `.spec`、`build/`、過去版の `*.previous.exe` は再生成可能な中間・保管ファイルなのでGit管理しません。`dist/ClassView管理ツール.exe` だけを現行の配布用ビルドとして管理します。学校のExcel原本、`runtime/`、ログ、バックアップはexeへ同梱せず、Git管理対象外のままです。

## 起動確認

1. `ClassView管理ツール.exe` を起動します。
2. 黒いコンソール画面が出ず、ブラウザで管理ホームが開くことを確認します。
3. 「授業を管理」と「時間割を更新」を開きます。
4. 管理ホーム右上の「終了」を押し、exeプロセスが終了することを確認します。
5. exeを2回起動し、2回目が別サーバーを作らず既存画面を開くことを確認します。

運営担当者のPCでは、`tools\course-importer\install_windows_shortcut.bat` を1回実行すると、デスクトップに `ClassView` ショートカットを作成できます。現行exeはGitコミットで完全性を確認できますが、Authenticodeによるコード署名はまだ行っていません。将来、外部配布を拡大する場合はGitHub Releasesとコード署名の導入を検討します。
