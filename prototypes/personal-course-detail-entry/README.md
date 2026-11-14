# 個人時間割・授業詳細導線の比較プロトタイプ

本番の個人時間割B案へ変更を加えず、STEP 3の文脈で次の3案を比較するためのページです。

- A案：44pxの情報アイコン
- B案：短い「詳細」ボタン
- C案：授業名リンク
- 3案を並べる：同じ授業カードを横並びで比較

## 起動方法

リポジトリルートで次を実行し、ブラウザでURLを開きます。

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

```text
http://127.0.0.1:8765/prototypes/personal-course-detail-entry/index.html
```

`file://` ではデモ授業JSONを取得できないため、HTTPサーバーから開いてください。
`?variant=a`、`?variant=b`、`?variant=c`、`?variant=compare` を付けると、指定案を初期表示できます。

## ブラウザ確認

PlaywrightとChromium系ブラウザが使える環境では、次のコマンドで1440px・390px、操作分離、キーボード、横方向のはみ出しを確認し、スクリーンショットを再生成できます。

```powershell
python prototypes/personal-course-detail-entry/browser_test.py `
  http://127.0.0.1:8765/prototypes/personal-course-detail-entry/index.html `
  --browser-path "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --screenshots prototypes/personal-course-detail-entry/screenshots
```

## 確認ポイント

1. カード本体で選択・解除できること
2. 詳細操作で履修状態が変わらないこと
3. モーダルを閉じても曜日・時限が維持されること
4. 必修・競合・選択済みの状態アイコンと詳細操作が重ならないこと
5. 3案を切り替えても選択状態が維持されること
6. Tab、Enter、Space、Esc、タブの左右矢印操作が使えること

## 境界

- 本番のHTML、CSS、JavaScript、履修ロジックは変更しません。
- `data/demo/courses.json` は読み取りだけで、編集しません。
- 選択状態はページ内メモリだけに保持し、localStorageへ保存しません。
- モーダルの到達目標と授業の進め方は、元データに値がない場合だけ比較用の仮文を表示します。
