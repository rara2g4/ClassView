# ClassView管理ツール Windowsビルド手順

`ClassView管理ツール.exe` は生成物のためGitには含まれません。新しいWindows PCでは、cloneしたリポジトリから次の手順で再生成します。

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

ClassView固有の設定はGit管理されたPowerShellスクリプトに記載しています。PyInstallerが生成する `.spec` は再生成可能な中間ファイルなのでGit管理しません。`build/`、`dist/`、exe、学校のExcel原本もGit管理対象外です。

## 起動確認

1. `ClassView管理ツール.exe` を起動します。
2. 黒いコンソール画面が出ず、ブラウザで管理ホームが開くことを確認します。
3. 「授業を管理」と「時間割を更新」を開きます。
4. 管理ホーム右上の「終了」を押し、exeプロセスが終了することを確認します。
5. exeを2回起動し、2回目が別サーバーを作らず既存画面を開くことを確認します。

運営担当者のPCでは、ビルド後に `tools\course-importer\install_windows_shortcut.bat` を1回実行すると、デスクトップに `ClassView` ショートカットを作成できます。exeをソースリポジトリへcommitせず、将来の配布用ビルドはGitHub Releasesまたはinstallerで提供します。
