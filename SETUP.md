# 旅ログ＋旅マップ セットアップ手順

この手順に従って、旅ログと旅マップを使えるようにセットアップしてください。

## 全体の流れ

1. Google Sheets を作成
2. Google Drive にフォルダを作成
3. Google Apps Script をデプロイ
4. Google Maps API キーを取得（任意だが推奨）
5. 設定を反映して GitHub にプッシュ

---

## 1. Google Sheets を作成

1. [Google Sheets](https://sheets.google.com) を開く
2. 「空白のスプレッドシート」を作成
3. 名前を「旅ログデータ」などに変更
4. **スプレッドシートIDをメモする**
   - URLの `https://docs.google.com/spreadsheets/d/【ここがID】/edit` の部分
   - 例: `1ABC123xyz...`

---

## 2. Google Drive にフォルダを作成

1. [Google Drive](https://drive.google.com) を開く
2. 「マイドライブ」で右クリック → 「新しいフォルダ」
3. 名前を「tabilogPhotos」に設定
4. **フォルダIDをメモする**
   - フォルダを開いたときのURLの `https://drive.google.com/drive/folders/【ここがID】` の部分
   - 例: `1XYZ789abc...`

---

## 3. Google Apps Script をデプロイ

### 3-1. スクリプトを作成

1. [Google Apps Script](https://script.google.com) を開く
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を「旅ログAPI」に変更
4. `Code.gs` の中身を、このリポジトリの `gas/Code.gs` の内容で置き換える

### 3-2. 設定を変更

`Code.gs` の最初の方にある `CONFIG` を編集:

```javascript
const CONFIG = {
  SPREADSHEET_ID: 'ここにスプレッドシートIDを貼り付け',
  DRIVE_FOLDER_ID: 'ここにDriveフォルダIDを貼り付け',
  SHEET_NAME: '旅ログデータ'
};
```

### 3-3. 接続テスト

1. 関数を選択で `testConnection` を選ぶ
2. 「実行」ボタンをクリック
3. 初回は権限の承認が必要:
   - 「権限を確認」→「詳細」→「（安全でないページ）に移動」→「許可」
4. 「実行ログ」に「設定は正しく完了しています！」と表示されればOK

### 3-4. Webアプリとしてデプロイ

1. 右上の「デプロイ」→「新しいデプロイ」
2. 「種類の選択」で「⚙️」→「ウェブアプリ」を選択
3. 設定:
   - 説明: `旅ログAPI v1`（任意）
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
4. 「デプロイ」をクリック
5. **ウェブアプリのURLをメモする**
   - 例: `https://script.google.com/macros/s/AKfycb.../exec`

---

## 4. Google Maps API キーを取得（推奨）

旅マップでGoogle Mapsを表示するために必要です。

### 4-1. Google Cloud プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com) を開く
2. 上部の「プロジェクトを選択」→「新しいプロジェクト」
3. プロジェクト名: `tabilog`
4. 「作成」をクリック

### 4-2. Maps JavaScript API を有効化

1. 左メニュー「APIとサービス」→「ライブラリ」
2. 「Maps JavaScript API」を検索してクリック
3. 「有効にする」をクリック

### 4-3. APIキーを作成

1. 左メニュー「APIとサービス」→「認証情報」
2. 「＋認証情報を作成」→「APIキー」
3. 作成されたAPIキーをコピー
4. （推奨）「キーを制限」をクリックして設定:
   - アプリケーションの制限: **HTTPリファラー**
   - ウェブサイトの制限に追加:
     - `https://ryheywa.github.io/*`
     - `http://localhost:*`（ローカルテスト用）
   - APIの制限: **Maps JavaScript API**のみ
5. 「保存」

---

## 5. 設定を反映

### 5-1. index.html を編集

`index.html` の `CONFIG` を編集:

```javascript
const CONFIG = {
  GAS_URL: 'ここにGASのウェブアプリURLを貼り付け'
};
```

### 5-2. map.html を編集

`map.html` の `CONFIG` を編集:

```javascript
const CONFIG = {
  GAS_URL: 'ここにGASのウェブアプリURLを貼り付け',
  MAPS_API_KEY: 'ここにGoogle Maps APIキーを貼り付け'
};
```

### 5-3. GitHub にプッシュ

```bash
cd ~/tabilog
git add .
git commit -m "旅マップ機能を追加"
git push origin main
```

---

## 6. 動作確認

1. `https://ryheywa.github.io/tabilog/` を開く
2. 旅ログを入力して最後まで進む
3. 「📍 旅マップに保存する」ボタンをタップ
4. 「✓ 旅マップに保存したよ！」と表示されればOK
5. 「🗺️ 旅マップを見る →」をタップして地図にピンが表示されることを確認

---

## トラブルシューティング

### 「保存できなかった」と表示される

- GASのURLが正しいか確認
- GASの権限設定で「アクセスできるユーザー」が「全員」になっているか確認
- GASを再デプロイ（新しいバージョン）してURLを更新

### 地図が表示されない

- Google Maps APIキーが正しいか確認
- APIキーの制限でリファラーが正しく設定されているか確認
- Google Cloud Consoleで Maps JavaScript API が有効になっているか確認

### 写真が保存されない

- Google Driveフォルダの共有設定を確認
- GASの実行ログでエラーがないか確認

---

## ファイル構成

```
tabilog/
├── index.html    # 旅ログ（入力画面）
├── map.html      # 旅マップ（地図表示）
├── gas/
│   └── Code.gs   # Google Apps Script コード
├── SETUP.md      # このファイル
└── README.md     # プロジェクト説明（任意）
```

---

## 更新履歴

- 2024-XX-XX: 旅マップ機能追加
