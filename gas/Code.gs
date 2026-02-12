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
  SPREADSHEET_ID: '1v2nQJq87srDc_Xrss9CYVC8Re_R1FGzpypzAwNwPCGU',
  DRIVE_FOLDER_ID: '1AKbLEIy-1kcddNdDKzJqVhoZmucOsoEs',
  SHEET_NAME: '旅ログデータ'
};

// ============================================
// メイン関数
// ============================================

/**
 * POSTリクエスト処理（旅ログデータの保存）
 */
function doPost(e) {
  try {
    console.log('doPost called');
    const data = JSON.parse(e.postData.contents);
    console.log('Received data:', JSON.stringify(data).substring(0, 500));

    // スプレッドシートを開く
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    console.log('Spreadsheet opened:', ss.getName());

    // まず既存のシートを探す（「シート1」も含めて）
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    // シートがなければ作成（または「シート1」をリネーム）
    if (!sheet) {
      console.log('Sheet not found, checking for シート1...');
      const sheet1 = ss.getSheetByName('シート1');
      if (sheet1) {
        // シート1が空なら名前を変更して使う
        if (sheet1.getLastRow() <= 1) {
          sheet1.setName(CONFIG.SHEET_NAME);
          sheet = sheet1;
          console.log('Renamed シート1 to:', CONFIG.SHEET_NAME);
        } else {
          // シート1にデータがある場合は新しいシートを作成
          sheet = ss.insertSheet(CONFIG.SHEET_NAME);
          console.log('Created new sheet:', CONFIG.SHEET_NAME);
        }
      } else {
        sheet = ss.insertSheet(CONFIG.SHEET_NAME);
        console.log('Created new sheet:', CONFIG.SHEET_NAME);
      }

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
      console.log('Header row added');
    }

    // 画像を保存してURLを取得
    const photoUrls = [];
    const photoCaptions = [];

    console.log('Processing photos, count:', data.photos ? data.photos.length : 0);

    if (data.photos && Array.isArray(data.photos)) {
      for (let i = 0; i < Math.min(data.photos.length, 3); i++) {
        const photo = data.photos[i];
        if (photo && photo.image && photo.image.startsWith('data:image')) {
          console.log('Saving image', i + 1, 'size:', photo.image.length);
          const url = saveImageToDrive(photo.image, data.date, i + 1);
          console.log('Image saved, URL:', url);
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
      console.log('Geocoding destination:', data.destination);
      const coords = geocode(data.destination);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        console.log('Geocode result:', lat, lng);
      } else {
        console.log('Geocode failed');
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

    console.log('Appending row to sheet...');
    sheet.appendRow(row);
    console.log('Row appended successfully');

    return createJsonResponse({ success: true, message: '保存しました！' });

  } catch (error) {
    console.error('Error in doPost:', error);
    console.error('Error stack:', error.stack);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * GETリクエスト処理（旅マップ用データ取得）
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

    // 「旅ログデータ」シートを探す、なければ「シート1」も試す
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      sheet = ss.getSheetByName('シート1');
    }

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
 * 問題1修正: lh3.googleusercontent.com形式のURLを返す
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
    const fileId = file.getId();

    // 「リンクを知っている全員が閲覧可」に設定
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // CORS制限を回避するため、lh3.googleusercontent.com形式のURLを返す
    // この形式はimgタグで直接表示可能
    return `https://lh3.googleusercontent.com/d/${fileId}`;

  } catch (error) {
    console.error('Error saving image:', error);
    return '';
  }
}

/**
 * 住所から緯度経度を取得（Geocoding）
 * 問題2修正: 駅を優先的に検索、精度向上
 */
function geocode(address) {
  try {
    // 検索クエリを作成
    // 1. 「駅」が含まれていない場合は「駅」を追加して検索
    // 2. 日本を指定して検索精度を向上
    let searchQueries = [];

    // 元の入力に「駅」が含まれていない場合、駅を追加したバージョンを優先
    if (!address.includes('駅')) {
      searchQueries.push(address + '駅 日本');
    }
    // 元の入力そのまま + 日本
    searchQueries.push(address + ' 日本');

    const geocoder = Maps.newGeocoder()
      .setLanguage('ja')
      .setRegion('jp');  // 日本に限定

    for (const query of searchQueries) {
      console.log('Trying geocode query:', query);
      const response = geocoder.geocode(query);

      if (response.status === 'OK' && response.results.length > 0) {
        // 結果の中から最も適切なものを選ぶ
        // transit_station（鉄道駅）があれば優先
        let bestResult = response.results[0];

        for (const result of response.results) {
          const types = result.types || [];
          if (types.includes('transit_station') ||
              types.includes('train_station') ||
              types.includes('subway_station')) {
            bestResult = result;
            console.log('Found station result:', result.formatted_address);
            break;
          }
        }

        const location = bestResult.geometry.location;
        console.log('Using result:', bestResult.formatted_address);
        return {
          lat: location.lat,
          lng: location.lng
        };
      }
    }

    console.log('Geocoding failed for all queries');
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

    // シート一覧を表示
    const sheets = ss.getSheets();
    console.log('シート一覧:');
    sheets.forEach(s => console.log('  - ' + s.getName()));

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
  console.log('=== Geocoding Test ===');

  const tests = ['池袋', '仙台', '東京駅', '新宿', '渋谷'];

  tests.forEach(place => {
    const result = geocode(place);
    console.log(`${place}: `, result ? `${result.lat}, ${result.lng}` : 'failed');
  });
}

/**
 * 既存データの画像URLを新形式に変換（一度だけ実行）
 */
function migrateImageUrls() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheetByName('シート1');
  }
  if (!sheet) {
    console.log('シートが見つかりません');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    console.log('データがありません');
    return;
  }

  // 写真URL列（7, 9, 11）を取得して変換
  const urlColumns = [7, 9, 11];

  for (let row = 2; row <= lastRow; row++) {
    for (const col of urlColumns) {
      const cell = sheet.getRange(row, col);
      const url = cell.getValue();

      if (url && url.includes('drive.google.com/uc?id=')) {
        // 旧形式から新形式に変換
        const match = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) {
          const fileId = match[1];
          const newUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
          cell.setValue(newUrl);
          console.log(`Row ${row}, Col ${col}: Updated URL`);
        }
      }
    }
  }

  console.log('Migration complete');
}

/**
 * GASの実行ログを確認する方法：
 * 1. GASエディタで左メニューの「実行数」をクリック
 * 2. 実行された関数の一覧が表示される
 * 3. 各実行をクリックすると詳細ログが表示される
 *
 * または、リアルタイムで確認する場合：
 * 1. GASエディタで「表示」→「ログ」
 * 2. テスト関数を実行するとログが表示される
 */
