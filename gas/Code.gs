/**
 * 旅ログ - Google Apps Script バックエンド
 *
 * このスクリプトは以下の機能を提供します：
 * 1. doPost: 旅ログデータの保存・削除
 * 2. doGet: 旅マップ用のデータ取得
 *
 * セットアップ手順は SETUP.md を参照してください。
 */

// ============================================
// 設定
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
 * POSTリクエスト処理（旅ログデータの保存・削除）
 */
function doPost(e) {
  try {
    console.log('=== doPost called ===');
    const data = JSON.parse(e.postData.contents);
    console.log('Action:', data.action || 'save');
    console.log('Received data keys:', Object.keys(data));

    // 削除リクエストの場合
    if (data.action === 'delete' && data.id) {
      console.log('Delete request for id:', data.id);
      return deleteEntry(data.id);
    }

    // 通常の保存処理
    return saveEntry(data);

  } catch (error) {
    console.error('Error in doPost:', error);
    console.error('Error stack:', error.stack);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * 旅ログを保存
 */
function saveEntry(data) {
  console.log('=== saveEntry called ===');

  // スプレッドシートを開く
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  console.log('Spreadsheet opened:', ss.getName());

  // シートを取得または作成
  let sheet = getOrCreateSheet(ss);
  console.log('Using sheet:', sheet.getName());

  // 画像を保存してURLを取得
  const photoUrls = [];
  const photoCaptions = [];

  console.log('Processing photos, count:', data.photos ? data.photos.length : 0);

  if (data.photos && Array.isArray(data.photos)) {
    for (let i = 0; i < Math.min(data.photos.length, 3); i++) {
      const photo = data.photos[i];
      console.log(`Photo ${i + 1}:`, photo ? `caption="${photo.caption}", hasImage=${!!photo.image}` : 'null');

      if (photo && photo.image && photo.image.startsWith('data:image')) {
        console.log('Saving image', i + 1, ', base64 length:', photo.image.length);
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
      console.log('Geocode failed for:', data.destination);
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

  console.log('Appending row to sheet, destination:', data.destination);
  sheet.appendRow(row);
  console.log('Row appended successfully. Total rows:', sheet.getLastRow());

  return createJsonResponse({ success: true, message: '保存しました！' });
}

/**
 * 旅ログを削除
 */
function deleteEntry(id) {
  console.log('=== deleteEntry called ===');
  console.log('Deleting entry id:', id);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      sheet = ss.getSheetByName('シート1');
    }

    if (!sheet) {
      console.log('Sheet not found');
      return createJsonResponse({ success: false, error: 'シートが見つかりません' });
    }

    // idは1始まりのインデックス、行番号は id + 1（ヘッダー行があるため）
    const rowToDelete = parseInt(id) + 1;
    const lastRow = sheet.getLastRow();

    console.log('Row to delete:', rowToDelete, ', Last row:', lastRow);

    if (rowToDelete < 2 || rowToDelete > lastRow) {
      console.log('Invalid row number');
      return createJsonResponse({ success: false, error: '無効なIDです' });
    }

    // その行の画像もDriveから削除
    const photoUrlColumns = [7, 9, 11]; // 写真1, 2, 3のURL列
    for (const col of photoUrlColumns) {
      const url = sheet.getRange(rowToDelete, col).getValue();
      if (url) {
        try {
          // URLからファイルIDを抽出
          let fileId = null;
          if (url.includes('/d/')) {
            fileId = url.split('/d/')[1];
          } else if (url.includes('id=')) {
            fileId = url.split('id=')[1];
          }

          if (fileId) {
            console.log('Deleting image file:', fileId);
            DriveApp.getFileById(fileId).setTrashed(true);
          }
        } catch (imgError) {
          console.log('Image delete skipped:', imgError.message);
        }
      }
    }

    // 行を削除
    sheet.deleteRow(rowToDelete);
    console.log('Row deleted successfully');

    return createJsonResponse({ success: true, message: '削除しました' });

  } catch (error) {
    console.error('Delete error:', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * GETリクエスト処理（旅マップ用データ取得）
 */
function doGet(e) {
  try {
    console.log('=== doGet called ===');

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

    // 「旅ログデータ」シートを探す、なければ「シート1」も試す
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      console.log('Sheet "旅ログデータ" not found, trying "シート1"');
      sheet = ss.getSheetByName('シート1');
    }

    if (!sheet) {
      console.log('No sheet found');
      return createJsonResponse({ success: true, data: [] });
    }

    console.log('Using sheet:', sheet.getName());
    const lastRow = sheet.getLastRow();
    console.log('Last row:', lastRow);

    if (lastRow < 2) {
      console.log('No data rows');
      return createJsonResponse({ success: true, data: [] });
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 19);
    const values = range.getValues();
    console.log('Fetched rows:', values.length);

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
        id: index + 1,  // 1始まり
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

    console.log('Returning', data.length, 'items with coordinates');
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
 * シートを取得または作成
 */
function getOrCreateSheet(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    console.log('Sheet "旅ログデータ" not found, checking "シート1"...');
    const sheet1 = ss.getSheetByName('シート1');

    if (sheet1) {
      // シート1が空またはヘッダーのみなら名前を変更
      if (sheet1.getLastRow() <= 1) {
        sheet1.setName(CONFIG.SHEET_NAME);
        sheet = sheet1;
        console.log('Renamed シート1 to 旅ログデータ');

        // ヘッダーがなければ追加
        if (sheet.getLastRow() === 0) {
          addHeaderRow(sheet);
        }
      } else {
        // シート1にデータがある場合は新しいシートを作成
        sheet = ss.insertSheet(CONFIG.SHEET_NAME);
        addHeaderRow(sheet);
        console.log('Created new sheet: 旅ログデータ');
      }
    } else {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME);
      addHeaderRow(sheet);
      console.log('Created new sheet: 旅ログデータ');
    }
  }

  return sheet;
}

/**
 * ヘッダー行を追加
 */
function addHeaderRow(sheet) {
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

/**
 * Base64画像をGoogle Driveに保存
 * lh3.googleusercontent.com形式のURLを返す（CORS回避）
 */
function saveImageToDrive(base64Data, date, photoNum) {
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

    // Base64データからBlobを作成
    const parts = base64Data.split(',');
    const mimeMatch = parts[0].match(/data:(.+);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Content = parts[1];

    if (!base64Content) {
      console.log('No base64 content found');
      return '';
    }

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Content),
      mimeType,
      `tabilog_${date}_${photoNum}_${Date.now()}.jpg`
    );

    const file = folder.createFile(blob);
    const fileId = file.getId();

    // 「リンクを知っている全員が閲覧可」に設定
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // lh3.googleusercontent.com形式のURLを返す（imgタグで直接表示可能）
    const url = `https://lh3.googleusercontent.com/d/${fileId}`;
    console.log('Image saved with URL:', url);
    return url;

  } catch (error) {
    console.error('Error saving image:', error);
    return '';
  }
}

/**
 * 住所から緯度経度を取得（Geocoding）
 * 駅を優先的に検索
 */
function geocode(address) {
  try {
    console.log('Geocoding:', address);

    const geocoder = Maps.newGeocoder()
      .setLanguage('ja')
      .setRegion('jp');

    // まず元の住所で検索
    let response = geocoder.geocode(address);

    if (response.status === 'OK' && response.results.length > 0) {
      const result = response.results[0];
      const types = result.types || [];

      // 駅タイプかどうか確認
      const isStation = types.some(t =>
        t.includes('station') || t.includes('transit')
      );

      // 駅でない結果で、入力に「駅」が含まれていない場合、「駅」を付けて再検索
      if (!isStation && !address.includes('駅')) {
        console.log('Result is not a station, trying with 駅 suffix');
        const stationResponse = geocoder.geocode(address + '駅');

        if (stationResponse.status === 'OK' && stationResponse.results.length > 0) {
          const stationResult = stationResponse.results[0];
          const stationTypes = stationResult.types || [];

          if (stationTypes.some(t => t.includes('station') || t.includes('transit'))) {
            console.log('Found station:', stationResult.formatted_address);
            const loc = stationResult.geometry.location;
            return { lat: loc.lat, lng: loc.lng };
          }
        }
      }

      // 元の結果を使用
      console.log('Using result:', result.formatted_address);
      const location = result.geometry.location;
      return { lat: location.lat, lng: location.lng };
    }

    // フォールバック：「日本」を付けて検索
    console.log('Trying with 日本 suffix');
    response = geocoder.geocode(address + ' 日本');
    if (response.status === 'OK' && response.results.length > 0) {
      const location = response.results[0].geometry.location;
      console.log('Found with Japan suffix:', response.results[0].formatted_address);
      return { lat: location.lat, lng: location.lng };
    }

    console.log('Geocoding failed for:', address);
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
  console.log('=== Connection Test ===');

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    console.log('✓ Spreadsheet:', ss.getName());

    const sheets = ss.getSheets();
    console.log('  Sheets:');
    sheets.forEach(s => {
      const lastRow = s.getLastRow();
      console.log(`    - ${s.getName()} (${lastRow} rows)`);
    });

    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    console.log('✓ Drive folder:', folder.getName());

    const files = folder.getFiles();
    let fileCount = 0;
    while (files.hasNext()) {
      files.next();
      fileCount++;
    }
    console.log(`  Files in folder: ${fileCount}`);

    console.log('=== All OK ===');
    return true;

  } catch (error) {
    console.error('✗ Error:', error);
    return false;
  }
}

/**
 * ジオコーディングテスト
 */
function testGeocode() {
  console.log('=== Geocoding Test ===');

  const tests = ['池袋', '仙台', '東京駅', '新宿', '渋谷', '秋葉原'];

  tests.forEach(place => {
    const result = geocode(place);
    if (result) {
      console.log(`✓ ${place}: ${result.lat}, ${result.lng}`);
    } else {
      console.log(`✗ ${place}: failed`);
    }
  });
}

/**
 * 既存データの画像URLを新形式に変換（一度だけ実行）
 */
function migrateImageUrls() {
  console.log('=== Migrate Image URLs ===');

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheetByName('シート1');
  }
  if (!sheet) {
    console.log('Sheet not found');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    console.log('No data');
    return;
  }

  const urlColumns = [7, 9, 11];
  let updatedCount = 0;

  for (let row = 2; row <= lastRow; row++) {
    for (const col of urlColumns) {
      const cell = sheet.getRange(row, col);
      const url = cell.getValue();

      if (url && url.includes('drive.google.com/uc?id=')) {
        const match = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) {
          const newUrl = `https://lh3.googleusercontent.com/d/${match[1]}`;
          cell.setValue(newUrl);
          updatedCount++;
          console.log(`Row ${row}, Col ${col}: Updated`);
        }
      }
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} URLs.`);
}

/**
 * シート内容を確認（デバッグ用）
 */
function debugSheetContents() {
  console.log('=== Sheet Contents Debug ===');

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  ['旅ログデータ', 'シート1'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      console.log(`\n--- ${name} ---`);
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      console.log(`Size: ${lastRow} rows x ${lastCol} cols`);

      if (lastRow > 0) {
        // ヘッダー行
        const header = sheet.getRange(1, 1, 1, Math.min(lastCol, 10)).getValues()[0];
        console.log('Header:', header.join(' | '));

        // 最初のデータ行
        if (lastRow > 1) {
          const firstData = sheet.getRange(2, 1, 1, Math.min(lastCol, 10)).getValues()[0];
          console.log('First row:', firstData.map(v => String(v).substring(0, 20)).join(' | '));
        }
      }
    } else {
      console.log(`\n--- ${name}: NOT FOUND ---`);
    }
  });
}
