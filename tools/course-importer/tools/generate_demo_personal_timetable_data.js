"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const coursesPath = path.join(repoRoot, "data/demo/courses.json");
const monthPath = path.join(repoRoot, "data/demo/timetable/2026-11.json");
const manifestPath = path.join(repoRoot, "data/demo/timetable/manifest.json");
const generatedPrefix = "demo-expanded-";

const weekdays = [
  { weekday: 1, date: "2026-11-02" },
  { weekday: 2, date: "2026-11-03" },
  { weekday: 3, date: "2026-11-04" },
  { weekday: 4, date: "2026-11-05" },
  { weekday: 5, date: "2026-11-06" },
];

const catalogs = {
  1: [
    ["Pythonプログラミング基礎", "プログラミング"],
    ["Webデザイン基礎", "Web"],
    ["HTML・CSS実践", "Web"],
    ["JavaScript入門", "プログラミング"],
    ["データベース基礎", "データベース"],
    ["ネットワーク入門", "ネットワーク"],
    ["情報セキュリティ基礎", "セキュリティ"],
    ["2Dゲーム制作", "ゲーム"],
    ["3DCGモデリング基礎", "3DCG"],
    ["映像編集入門", "映像"],
    ["デジタルイラスト", "デザイン"],
    ["UIデザイン入門", "デザイン"],
    ["ロボット制御基礎", "ロボット"],
    ["IoT工作入門", "IoT"],
    ["Linux操作演習", "インフラ"],
    ["ITパスポート対策", "資格対策"],
    ["アルゴリズム演習", "プログラミング"],
    ["Git・チーム開発入門", "開発演習"],
    ["モバイルアプリ企画", "アプリ開発"],
    ["サウンドデザイン基礎", "サウンド"],
    ["写真・構図演習", "映像"],
    ["タイポグラフィ", "デザイン"],
    ["コンピュータグラフィックス基礎", "3DCG"],
    ["生成AI活用入門", "AI"],
    ["クラウドサービス基礎", "クラウド"],
    ["ゲームレベルデザイン", "ゲーム"],
    ["Webアクセシビリティ入門", "Web"],
    ["プレゼンテーション演習", "ビジネス"],
    ["デジタル作品制作", "制作"],
    ["クリエイティブコーディング", "プログラミング"],
    ["プロジェクト企画演習", "プロジェクト"],
    ["UXリサーチ基礎", "デザイン"],
  ],
  2: [
    ["Python Webアプリ開発", "プログラミング"],
    ["TypeScript実践", "プログラミング"],
    ["Reactフロントエンド開発", "Web"],
    ["サーバーサイドJavaScript", "Web"],
    ["API設計演習", "システム開発"],
    ["SQLデータ分析", "データベース"],
    ["クラウドインフラ構築", "クラウド"],
    ["ネットワーク構築演習", "ネットワーク"],
    ["Webセキュリティ実践", "セキュリティ"],
    ["脆弱性診断入門", "セキュリティ"],
    ["Unityゲームプログラミング", "ゲーム"],
    ["Unreal Engine演習", "ゲーム"],
    ["ゲームAI実装", "AI"],
    ["3DCGアニメーション", "3DCG"],
    ["キャラクターモデリング", "3DCG"],
    ["VFX・モーショングラフィックス", "映像"],
    ["映像撮影技法", "映像"],
    ["UIプロトタイピング", "デザイン"],
    ["サービスデザイン", "デザイン"],
    ["ロボットセンサー制御", "ロボット"],
    ["組込みプログラミング", "ロボット"],
    ["IoTシステム開発", "IoT"],
    ["基本情報技術者対策", "資格対策"],
    ["Linuxサーバー管理", "インフラ"],
    ["DevOps基礎", "開発演習"],
    ["データ可視化", "データ分析"],
    ["機械学習入門", "AI"],
    ["自然言語処理入門", "AI"],
    ["モバイルアプリ開発", "アプリ開発"],
    ["チーム制作演習", "プロジェクト"],
    ["デジタルマーケティング", "ビジネス"],
    ["ポートフォリオ制作", "制作"],
  ],
  3: [
    ["AIアプリケーション開発", "AI"],
    ["深層学習実践", "AI"],
    ["画像認識システム", "AI"],
    ["生成AIプロダクト設計", "AI"],
    ["クラウドネイティブ開発", "クラウド"],
    ["マイクロサービス設計", "システム開発"],
    ["セキュアコーディング", "セキュリティ"],
    ["デジタルフォレンジック", "セキュリティ"],
    ["SOC運用演習", "セキュリティ"],
    ["フルスタックWeb開発", "Web"],
    ["大規模データ処理", "データ分析"],
    ["データサイエンス実践", "データ分析"],
    ["ゲームエンジン拡張", "ゲーム"],
    ["オンラインゲーム開発", "ゲーム"],
    ["XRコンテンツ制作", "XR"],
    ["リアルタイム3DCG", "3DCG"],
    ["高度映像合成", "映像"],
    ["バーチャルプロダクション", "映像"],
    ["インタラクションデザイン", "デザイン"],
    ["デザインシステム構築", "デザイン"],
    ["自律移動ロボット", "ロボット"],
    ["コンピュータビジョンロボティクス", "ロボット"],
    ["クラウド資格対策演習", "資格対策"],
    ["情報処理安全確保支援士対策", "資格対策"],
    ["ITプロジェクトマネジメント", "プロジェクト"],
    ["アジャイル開発実践", "開発演習"],
    ["プロダクトマネジメント", "ビジネス"],
    ["起業・サービス企画", "ビジネス"],
    ["産学連携プロジェクト", "プロジェクト"],
    ["テクニカルライティング", "ビジネス"],
    ["就職作品ブラッシュアップ", "制作"],
    ["専門研究発表", "研究"],
  ],
};

const instructors = [
  "朝倉 みらい", "雨宮 かなで", "石動 しおん", "海野 あかり",
  "大空 つばさ", "霧島 まどか", "小鳥遊 りん", "高峰 そうた",
  "月見里 ひなた", "七海 こよみ", "花咲 いぶき", "水城 なお",
];
const classStyles = ["講義", "演習", "講義・演習", "制作", "プロジェクト"];
const credits = [1, 2, 2, 3, 2];

const baseSlots = [
  [1, 1], [1, 2], [1, 3], [1, 4],
  [2, 1], [2, 2], [2, 3], [2, 4],
  [3, 1], [3, 2], [3, 3], [3, 4],
  [4, 1], [4, 2], [4, 3], [4, 4],
  [5, 1], [5, 2],
];
const busySlot = [4, 3];
const secondarySlots = [
  [1, 3], [1, 4], [2, 2], [2, 4], [3, 2], [3, 4], [5, 1],
];
const multiSlotAdditions = new Map([
  [0, [1, 2]], [1, [1, 1]],
  [7, [2, 3]], [18, [2, 1]],
  [8, [3, 3]], [10, [3, 1]],
  [12, [4, 2]], [13, [4, 1]],
  [15, [5, 2]], [17, [4, 4]],
]);

function slotsForIndex(index) {
  const slots = [];
  if (index < baseSlots.length) slots.push(baseSlots[index]);
  else if (index < 25) slots.push(busySlot);
  else slots.push(secondarySlots[index - 25]);
  if (multiSlotAdditions.has(index)) slots.push(multiSlotAdditions.get(index));
  return slots;
}

function entryId(courseId, weekday, period) {
  return `tt-${crypto.createHash("sha256").update(`${courseId}:${weekday}:${period}`).digest("hex").slice(0, 16)}`;
}

function createGeneratedData() {
  const generatedCourses = [];
  const generatedEntries = [];
  for (const grade of [1, 2, 3]) {
    catalogs[grade].forEach(([title, category], index) => {
      const number = String(index + 1).padStart(2, "0");
      const id = `${generatedPrefix}g${grade}-${number}`;
      const instructor = instructors[(index + (grade - 1) * 4) % instructors.length];
      const courseType = index % 11 === 0 ? null : index % 7 === 0 ? "選択必修" : "選択";
      const course = {
        id,
        title,
        summary: `${title}を題材に、専門分野の基礎または応用を学ぶデモ用の架空授業です。`,
        category,
        grade: `${grade}年`,
        academicYear: "2026",
        instructor,
        courseType,
        credits: credits[index % credits.length],
        classStyle: classStyles[index % classStyles.length],
      };
      generatedCourses.push(course);
      for (const [weekday, period] of slotsForIndex(index)) {
        const date = weekdays.find((item) => item.weekday === weekday).date;
        generatedEntries.push({
          date,
          entry: {
            entryId: entryId(id, weekday, period),
            period,
            courseId: id,
            subjectRaw: title,
            subjectName: title,
            subjectBaseName: title,
            courseVariantTags: [],
            grades: [grade],
            gradeRaw: String(grade),
            groupTags: [],
            homeroomIds: [],
            instructors: [instructor],
            rooms: [`デモ実習室${((index + grade) % 6) + 1}`],
            kind: "class",
            status: "confirmed",
          },
        });
      }
    });
  }
  return { generatedCourses, generatedEntries };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const coursesDocument = JSON.parse(fs.readFileSync(coursesPath, "utf8"));
const monthDocument = JSON.parse(fs.readFileSync(monthPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const { generatedCourses, generatedEntries } = createGeneratedData();

const preservedCourses = coursesDocument.courses.filter((course) => !course.id.startsWith(generatedPrefix));
coursesDocument.courses = [...preservedCourses, ...generatedCourses];

for (const { date } of weekdays) {
  const preservedEntries = (monthDocument.days[date] || []).filter(
    (entry) => !String(entry.courseId || "").startsWith(generatedPrefix),
  );
  const additions = generatedEntries.filter((item) => item.date === date).map((item) => item.entry);
  monthDocument.days[date] = [...preservedEntries, ...additions].sort((left, right) => (
    left.period - right.period
    || (left.grades[0] || 0) - (right.grades[0] || 0)
    || left.subjectName.localeCompare(right.subjectName, "ja")
  ));
}

manifest.version = "d3a0b0000002";
manifest.updatedAt = "2026-11-04T09:00:00Z";

writeJson(coursesPath, coursesDocument);
writeJson(monthPath, monthDocument);
writeJson(manifestPath, manifest);

console.log(`Preserved courses: ${preservedCourses.length}`);
console.log(`Generated courses: ${generatedCourses.length}`);
console.log(`Total demo courses: ${coursesDocument.courses.length}`);
console.log(`Generated timetable entries: ${generatedEntries.length}`);
