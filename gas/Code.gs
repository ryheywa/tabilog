/**
 * 旅ログ - Google Apps Script バックエンド
 *
 * このスクリプトは以下の機能を提供します：
 * 1. doPost: 旅ログデータの保存（Sheets + Drive）
 * 2. doGet: 旅マップ用のデータ取得
 *
 * セットアップ手順は SETUP.md を参照してください。
 */

// ============================================
// 設定（デプロイ前に変更してください）
// ============================================
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',  // Google Sheets ID
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE', // Google Drive フォルダID
  SHEET_NAME: '旅ログデータ'  // シート名
};

// ============================================
// メイン関数
// ============================================

/**
 * POSTリクエスト処理（旅ログデータの保存）
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // スプレッドシートを開く
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    // シートがなければ作成
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME);
      // ヘッダー行を追加
      sheet.appendRow([
        'タイムスタンプ', '日付', '行き先', '天気', '誰と',
        'ルートJSON',
        '写真1 URL', '写真1 キャプション',
        '写真2 URL', '写真2 キャプション',
        '写真3 URL', '写真3 キャプション',
        '五感チェックJSON', '食べたもの', '気分',
        'ハイライト', '発見・気づき',
        '緯度', '経度'
      ]);
    }

    // 画像を保存してURLを取得
    const photoUrls = [];
    const photoCaptions = [];

    if (data.photos && Array.isArray(data.photos)) {
      for (let i = 0; i < Math.min(data.photos.length, 3); i++) {
        const photo = data.photos[i];
        if (photo && photo.image && photo.image.startsWith('data:image')) {
          const url = saveImageToDrive(photo.image, data.date, i + 1);
          photoUrls.push(url);
          photoCaptions.push(photo.caption || '');
        } else {
          photoUrls.push('');
          photoCaptions.push(photo ? photo.caption || '' : '');
        }
      }
    }

    // 足りない分を空で埋める
    while (photoUrls.length < 3) {
      photoUrls.push('');
      photoCaptions.push('');
    }

    // 行き先から緯度経度を取得
    let lat = '';
    let lng = '';
    if (data.destination) {
      const coords = geocode(data.destination);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    // データを行に追加
    const row = [
      new Date().toISOString(),  // タイムスタンプ
      data.date || '',
      data.destination || '',
      data.weather || '',
      data.companion || '',
      JSON.stringify(data.routes || []),
      photoUrls[0], photoCaptions[0],
      photoUrls[1], photoCaptions[1],
      photoUrls[2], photoCaptions[2],
      JSON.stringify(data.senses || {}),
      data.food || '',
      data.mood || '',
      data.highlight || '',
      data.discovery || '',
      lat,
      lng
    ];

    sheet.appendRow(row);

    return createJsonResponse({ success: true, message: '保存しました！' });

  } catch (error) {
    console.error('Error in doPost:', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * GETリクエスト処理（旅マップ用データ取得）
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      return createJsonResponse({ success: true, data: [] });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return createJsonResponse({ success: true, data: [] });
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 19);
    const values = range.getValues();

    const data = values.map((row, index) => {
      // 写真データを配列にまとめる
      const photos = [];
      for (let i = 0; i < 3; i++) {
        const url = row[6 + i * 2];
        const caption = row[7 + i * 2];
        if (url || caption) {
          photos.push({ url: url || '', caption: caption || '' });
        }
      }

      return {
        id: index + 1,
        timestamp: row[0],
        date: row[1],
        destination: row[2],
        weather: row[3],
        companion: row[4],
        routes: tryParseJSON(row[5], []),
        photos: photos,
        senses: tryParseJSON(row[12], {}),
        food: row[13],
        mood: row[14],
        highlight: row[15],
        discovery: row[16],
        lat: row[17],
        lng: row[18]
      };
    }).filter(item => item.lat && item.lng);  // 緯度経度があるもののみ

    return createJsonResponse({ success: true, data: data });

  } catch (error) {
    console.error('Error in doGet:', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

// ============================================
// ヘルパー関数
// ============================================

/**
 * Base64画像をGoogle Driveに保存
 */
function saveImageToDrive(base64Data, date, photoNum) {
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

    // Base64データからBlobを作成
    const parts = base64Data.split(',');
    const mimeMatch = parts[0].match(/data:(.+);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Content = parts[1];

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Content),
      mimeType,
      `tabilog_${date}_${photoNum}_${Date.now()}.jpg`
    );

    const file = folder.createFile(blob);

    // 「リンクを知っている全員が閲覧可」に設定
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 直接表示可能なURLを返す
    return `https://drive.google.com/uc?id=${file.getId()}`;

  } catch (error) {
    console.error('Error saving image:', error);
    return '';
  }
}

/**
 * 住所から緯度経度を取得（Geocoding）
 */
function geocode(address) {
  try {
    // 日本の地名として検索
    const searchAddress = address + ' 日本';
    const geocoder = Maps.newGeocoder().setLanguage('ja');
    const response = geocoder.geocode(searchAddress);

    if (response.status === 'OK' && response.results.length > 0) {
      const location = response.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * JSON文字列を安全にパース
 */
function tryParseJSON(str, defaultValue) {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * CORS対応のJSONレスポンスを作成
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// テスト・デバッグ用関数
// ============================================

/**
 * 接続テスト用（Apps Scriptエディタから実行）
 */
function testConnection() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    console.log('スプレッドシート接続OK: ' + ss.getName());

    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    console.log('Driveフォルダ接続OK: ' + folder.getName());

    console.log('設定は正しく完了しています！');
    return true;
  } catch (error) {
    console.error('接続エラー:', error);
    return false;
  }
}

/**
 * ジオコーディングテスト
 */
function testGeocode() {
  const result = geocode('仙台');
  console.log('仙台の座標:', result);

  const result2 = geocode('東京駅');
  console.log('東京駅の座標:', result2);
}
